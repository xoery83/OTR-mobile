// Isolated acceptance fault only: suppress one real successful response, never emulate a write.
import { existsSync, writeFileSync } from "node:fs";
import { z } from "zod";
import type { createMcpBetaAccountBinding } from "../backend/src/mcpBetaAccountBinding";
import { structuredTripMetadataUpdateSchema } from "../src/domain/trip/tripStructuredDestinationContract";
import { contentDigest } from "./mutation";
const schema = z.strictObject({
  accountId: z.uuid(),
  clientId: z.uuid(),
  resource: z.url(),
  expiresAt: z.number().int().positive(),
  request: structuredTripMetadataUpdateSchema,
});
export function createAcceptanceResponseLoss(raw: unknown, marker: string) {
  const config = schema.parse(raw);
  const url = new URL(config.resource);
  if (
    url.protocol !== "https:" ||
    !url.hostname.endsWith(".trycloudflare.com") ||
    url.pathname !== "/mcp" ||
    config.expiresAt <= Date.now() ||
    config.expiresAt > Date.now() + 1800000
  )
    throw Error("ISOLATED_RESPONSE_LOSS_CONFIGURATION_REQUIRED");
  const expected = contentDigest(config.request);
  const fault: NonNullable<Parameters<typeof createMcpBetaAccountBinding>[4]> = async (
    grant,
    input,
    response,
  ) => {
    if (
      Date.now() >= config.expiresAt ||
      existsSync(marker) ||
      grant.accountId !== config.accountId ||
      grant.clientId !== config.clientId ||
      grant.resource !== config.resource ||
      input.method !== "POST" ||
      input.path !== `/v2/trips/${config.request.tripId}/metadata` ||
      input.headers?.["Idempotency-Key"] !== config.request.operationId ||
      contentDigest(input.body ?? null) !== expected ||
      response.status !== 200
    )
      return;
    const result = await response.clone().json();
    if (
      result.operationId !== config.request.operationId ||
      result.tripId !== config.request.tripId ||
      result.actorAccountId !== config.accountId ||
      result.resultMetadataRevision !== config.request.expectedMetadataRevision + 1 ||
      contentDigest(result.before) !== contentDigest(config.request.before) ||
      contentDigest(result.after) !== contentDigest(config.request.after)
    )
      return;
    try {
      writeFileSync(
        marker,
        JSON.stringify({
          fault: "ISOLATED_POST_COMMIT_RESPONSE_LOSS",
          at: new Date().toISOString(),
          accountId: config.accountId,
          clientId: config.clientId,
          resource: config.resource,
          requestDigest: expected,
          originalOwningResult: result,
        }) + "\n",
        { flag: "wx", mode: 0o600 },
      );
    } catch (error) {
      if ((error as { code?: string }).code === "EEXIST") return;
      throw error;
    }
    throw Error("ISOLATED_POST_COMMIT_RESPONSE_LOSS");
  };
  return fault;
}
