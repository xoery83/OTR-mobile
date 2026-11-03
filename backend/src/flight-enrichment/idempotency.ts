import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  commandDigest,
  type createClosedPersistenceGateway,
} from "../externalIntegrationPersistence";
import { responseSchema } from "./contracts";
import type { IdempotencyPort } from "./ports";

const label = z.string().regex(/^[A-Za-z0-9._:-]{1,128}$/);
const scopeSchema = z.strictObject({
  accountId: z.uuid(),
  actorId: z.uuid(),
  key: label,
  digest: z.string().regex(/^[a-f0-9]{64}$/),
});
const claimSchema = z.discriminatedUnion("state", [
  z.strictObject({ state: z.literal("ACQUIRED") }),
  z.strictObject({ state: z.literal("PENDING") }),
  z.strictObject({ state: z.literal("UNKNOWN") }),
  z.strictObject({ state: z.literal("TERMINAL"), response: responseSchema }),
]);

// Only the protected gateway can claim; a lost claim/result never grants another dispatch.
export function createFlightEnrichmentIdempotency(
  gateway: Pick<ReturnType<typeof createClosedPersistenceGateway>, "invoke">,
  binding: { accountId: string; actorId: string; tripId: string },
): IdempotencyPort {
  const bound = z
    .strictObject({ accountId: z.uuid(), actorId: z.uuid(), tripId: z.uuid() })
    .parse(binding);
  async function invoke(
    kind: "flight_enrichment_request_claim" | "flight_enrichment_request_finish",
    fields: Record<string, unknown>,
  ) {
    const command = {
      version: 1,
      environment: "DEV",
      integration_id: "otr-flight-enrichment-v1",
      request_id: randomUUID(),
      account_id: bound.accountId,
      actor_id: bound.actorId,
      trip_id: bound.tripId,
      ...fields,
    };
    return gateway.invoke(kind, { ...command, request_sha256: commandDigest(command) });
  }
  return {
    async execute(raw, action) {
      const scope = scopeSchema.parse(raw);
      if (scope.accountId !== bound.accountId || scope.actorId !== bound.actorId)
        throw Error("ENRICHMENT_IDEMPOTENCY_SCOPE");
      const fields = {
        idempotency_key: scope.key,
        logical_sha256: scope.digest,
        claim_token: randomUUID(),
      };
      const claim = claimSchema.parse(
        await invoke("flight_enrichment_request_claim", fields),
      );
      if (claim.state === "TERMINAL") {
        if (claim.response.idempotencyKey !== scope.key)
          throw Error("ENRICHMENT_REPLAY_IDENTITY");
        return claim.response;
      }
      if (claim.state !== "ACQUIRED") throw Error(`ENRICHMENT_REQUEST_${claim.state}`);
      let response;
      try {
        response = responseSchema.parse(await action());
        if (response.idempotencyKey !== scope.key)
          throw Error("ENRICHMENT_REPLAY_IDENTITY");
      } catch (error) {
        // Failure remains a durable tombstone even when recording UNKNOWN itself is unavailable.
        await invoke("flight_enrichment_request_finish", {
          ...fields,
          response: null,
        }).catch(() => {});
        throw error;
      }
      // A lost finish leaves CLAIMED/TERMINAL durable; never return an unrecorded success.
      const saved = claimSchema.parse(
        await invoke("flight_enrichment_request_finish", { ...fields, response }),
      );
      if (
        saved.state !== "TERMINAL" ||
        JSON.stringify(saved.response) !== JSON.stringify(response)
      )
        throw Error("ENRICHMENT_FINISH_UNCONFIRMED");
      return saved.response;
    },
  };
}
