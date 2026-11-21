import { z } from "zod";
import { coreUuid } from "@/domain/trip/tripCoreV2";
import { coreReadRecordSchema } from "@/domain/trip/tripCoreV2Read";
import { claimRequestSnapshotSchema } from "./claimResolutionContracts";

const revision = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const claimProvisionalViewSchema = z.strictObject({
  version: z.literal(1), cacheScope: z.literal("CLAIM_PROVISIONAL"), accountId: coreUuid, tripId: coreUuid, requestId: coreUuid,
  requestRevision: revision, observedAt: z.iso.datetime({ offset: true }),
  cacheGrant: z.strictObject({ grantId: coreUuid, revision }).nullable(),
  access: z.enum(["GRANTED", "DENIED"]), grant: claimRequestSnapshotSchema.shape.provisionalGrant,
  records: z.array(coreReadRecordSchema),
}).superRefine((v, c) => {
  if (v.access === "DENIED") {
    if (v.grant !== null || v.records.length !== 0) c.addIssue({ code: "custom", message: "CLAIM_PROVISIONAL_DENIAL_BINDING" });
    return;
  }
  const grant = v.grant;
  if (!grant || grant.state !== "ACTIVE" || grant.claimantAccountId !== v.accountId || grant.tripId !== v.tripId || grant.requestId !== v.requestId ||
      grant.grantId !== v.cacheGrant?.grantId || grant.revision !== v.cacheGrant?.revision || Date.parse(grant.expiresAt) <= Date.parse(v.observedAt))
    c.addIssue({ code: "custom", message: "CLAIM_PROVISIONAL_GRANT_BINDING" });
  const ids = new Set(v.records.filter(r => r.kind === "ITEM").map(r => r.id));
  for (const record of v.records) {
    if (!record.body || typeof record.body !== "object" || Array.isArray(record.body)) {
      c.addIssue({ code: "custom", message: "CLAIM_PROVISIONAL_RECORD_SCOPE" });
      continue;
    }
    const body = record.body as Record<string, unknown>;
    if (!["ITEM", "INSTRUCTION"].includes(record.kind) || body.trip_id !== v.tripId || body.visibility !== "GROUP" || record.id !== body.id ||
        (record.kind === "INSTRUCTION" && !ids.has(body.event_id as string)))
      c.addIssue({ code: "custom", message: "CLAIM_PROVISIONAL_RECORD_SCOPE" });
  }
  if (new Set(v.records.map(r => `${r.kind}:${r.id}`)).size !== v.records.length)
    c.addIssue({ code: "custom", message: "CLAIM_PROVISIONAL_DUPLICATE_RECORD" });
});
export type ClaimProvisionalView = z.infer<typeof claimProvisionalViewSchema>;
