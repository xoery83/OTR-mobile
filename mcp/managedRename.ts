import { createHash } from "node:crypto";
import { z } from "zod";
import { canonicalCoreJson, type Json } from "../src/domain/trip/tripCoreV2Json";
import { structuredTripMetadataUpdateSchema } from "../src/domain/trip/tripStructuredDestinationContract";
import type { McpConsentPolicyPin } from "../src/data/auth/mcpOAuthConsentContract";
import { managedDevBetaResource as resource } from "./betaOAuth";
import type { BetaBackend } from "./beta";
import { createBetaEvidenceRecorder, type BetaEvidence } from "./betaEvidence";
import type { OAuthGrant } from "./oauth";

const renameVersionMarker = ":managed-rename:";
const pinSchema = z.strictObject({
  accountId: z.uuid(),
  clientId: z.uuid(),
  expiresAt: z.number().int().positive(),
  request: structuredTripMetadataUpdateSchema,
});
const canonical = (value: unknown) => canonicalCoreJson(value as Json);

export function createManagedRenameGate(
  raw: unknown,
  principal: { accountId: string; clientId: string },
  closesAt: number,
  consent: McpConsentPolicyPin,
  evidenceFile = "/var/lib/otr/mcp-managed-dev-rename.jsonl",
) {
  const version = consent.policy.version;
  if (raw === undefined) {
    if (version.includes(renameVersionMarker))
      throw Error("MANAGED_RENAME_CONFIG_NOT_APPROVED");
    return undefined;
  }
  const pin = pinSchema.parse(raw);
  const { accountId, clientId, expiresAt, request } = pin;
  const fingerprint = createHash("sha256").update(canonical(pin)).digest("hex");
  const markerIndex = version.indexOf(renameVersionMarker);
  if (
    accountId !== principal.accountId ||
    clientId !== principal.clientId ||
    expiresAt <= Date.now() ||
    expiresAt > closesAt ||
    consent.policy.resource !== resource ||
    !consent.policy.permissions.includes("otr.trip.update") ||
    !consent.policy.business_scopes.includes("otr.trips.write") ||
    markerIndex <= 0 ||
    version.slice(markerIndex) !== renameVersionMarker + fingerprint ||
    request.before.name === request.after.name ||
    canonical(request.before) !==
      canonical({ ...request.after, name: request.before.name })
  )
    throw Error("MANAGED_RENAME_CONFIG_NOT_APPROVED");
  const { tripId, operationId } = request;
  const evidence = createBetaEvidenceRecorder(
    { accountId, clientId, resource, tripId, operationId, expiresAt },
    evidenceFile,
  );
  const intent = canonical(request);
  const live = () => Date.now() < expiresAt;
  const matches = (claim: { accountId: string; clientId: string; resource: string }) =>
    live() &&
    claim.accountId === accountId &&
    claim.clientId === clientId &&
    claim.resource === resource;
  const toolCall = {
    capabilityId: "otr.trip.update",
    toolName: "update_trip",
    pathParams: { tripId },
    query: {},
    request,
  };
  const approvedCall = canonical(toolCall);
  return {
    live,
    disclosure: Object.freeze({
      beforeName: request.before.name,
      afterName: request.after.name,
    }),
    evidence,
    captureReady(event: BetaEvidence) {
      return (
        matches(event) &&
        event.capabilityId === "otr.trip.update" &&
        event.data.idempotencyKey === operationId &&
        event.data.hasExecutionPlan === false &&
        event.data.call !== undefined &&
        canonical(event.data.call) === approvedCall &&
        evidence.ready(event)
      );
    },
    allowWrite(input: Parameters<BetaBackend>[0], grant: OAuthGrant) {
      if (
        !matches(grant) ||
        input.method !== "POST" ||
        input.path !== `/v2/trips/${tripId}/metadata`
      )
        return false;
      const headers = new Headers(input.headers);
      return (
        headers.get("OTR-Trip-Metadata-Version") === "3" &&
        headers.get("Idempotency-Key") === operationId &&
        input.body !== undefined &&
        canonical(input.body) === intent &&
        evidence.ready({
          ...grant,
          event: "TOOL_CALL",
          capabilityId: "otr.trip.update",
          data: { call: toolCall },
        })
      );
    },
  };
}

export type ManagedRenameGate = NonNullable<ReturnType<typeof createManagedRenameGate>>;
