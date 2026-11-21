import { z } from "zod";
import { coreUuid } from "../../domain/trip/tripCoreV2";
import {
  personCloudCreateSchema,
  personCloudCreateReceiptSchema,
} from "../../domain/trip/tripPersonCloudCreate";

const revision = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const time = z.iso.datetime({ offset: true });
export const claimResolutionScopeSchema = z.strictObject({
  actorAccountId: coreUuid,
  tripId: coreUuid,
});
export const pendingClaimPreviewInputSchema = z.strictObject({
  requestId: coreUuid,
  inviteId: coreUuid,
  requestedPersonId: coreUuid,
});
export const pendingClaimPreviewSchema = pendingClaimPreviewInputSchema.extend({
  tripId: coreUuid,
  claimantAccountId: coreUuid,
  proposedAccess: z.enum(["READ", "COLLABORATE"]),
  previewDigest: digest,
  expiresAt: time,
});
const proposal = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("EXISTING_PERSON"), personId: coreUuid }),
  z.strictObject({ kind: z.literal("NEW_PERSON"), create: personCloudCreateSchema }),
]);
const decision = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("CONFIRM") }),
  z.strictObject({ kind: z.literal("CHOOSE_ANOTHER"), personId: coreUuid }),
  z.strictObject({ kind: z.literal("CREATE_NEW"), create: personCloudCreateSchema }),
  z.strictObject({ kind: z.literal("REJECT") }),
]);
const state = z.enum([
  "PENDING_REVIEW",
  "AWAITING_CONSENT",
  "LINKED",
  "REJECTED",
  "EXPIRED",
]);
const grant = z.strictObject({
  grantId: coreUuid,
  requestId: coreUuid,
  tripId: coreUuid,
  claimantAccountId: coreUuid,
  revision,
  access: z.literal("SHARED_READ_ONLY"),
  state: z.enum(["ACTIVE", "REVOKED", "EXPIRED"]),
  expiresAt: time,
});
const revocation = z
  .strictObject({
    operationId: coreUuid,
    requestId: coreUuid,
    grantId: coreUuid,
    tripId: coreUuid,
    claimantAccountId: coreUuid,
    beforeRevision: revision,
    afterRevision: revision,
    reason: z.enum(["REQUEST_REJECTED", "REQUEST_LINKED"]),
    effectiveAt: time,
  })
  .refine((v) => v.afterRevision === v.beforeRevision + 1, "CLAIM_GRANT_REVISION");
export const claimRequestSnapshotSchema = z
  .strictObject({
    requestId: coreUuid,
    tripId: coreUuid,
    claimantAccountId: coreUuid,
    originalPersonId: coreUuid,
    revision,
    state,
    proposal,
    proposalRevision: revision,
    proposalOperationId: coreUuid,
    proposedByAccountId: coreUuid,
    proposalDigest: digest,
    proposedAccess: z.enum(["READ", "COLLABORATE"]),
    consent: z.strictObject({
      state: z.enum(["REQUIRED", "RECORDED"]),
      proposalDigest: digest,
      operationId: coreUuid.nullable(),
    }),
    provisionalGrant: grant.nullable(),
    expiresAt: time,
  })
  .superRefine((v, c) => {
    if (
      v.consent.proposalDigest !== v.proposalDigest ||
      (v.consent.state === "RECORDED") !== (v.consent.operationId !== null) ||
      (v.state === "LINKED" && v.consent.state !== "RECORDED") ||
      (v.proposal.kind === "NEW_PERSON" && v.proposal.create.tripId !== v.tripId) ||
      (v.provisionalGrant &&
        (v.provisionalGrant.requestId !== v.requestId ||
          v.provisionalGrant.tripId !== v.tripId ||
          v.provisionalGrant.claimantAccountId !== v.claimantAccountId ||
          (["LINKED", "REJECTED", "EXPIRED"].includes(v.state) &&
            v.provisionalGrant.state === "ACTIVE")))
    )
      c.addIssue({ code: "custom", message: "CLAIM_REQUEST_BINDING" });
  });
const intent = { operationId: coreUuid, requestId: coreUuid };
export const claimResolutionCommandSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    ...intent,
    kind: z.literal("SUBMIT_PENDING_CLAIM"),
    expectedRevision: z.null(),
    inviteId: coreUuid,
    requestedPersonId: coreUuid,
    expectedPreviewDigest: digest,
    explicitConsent: z.literal(true),
  }),
  z.strictObject({
    ...intent,
    kind: z.literal("RESOLVE_CLAIM_REQUEST"),
    expectedRevision: revision,
    decision,
  }),
  z.strictObject({
    ...intent,
    kind: z.literal("CONSENT_TO_RESOLUTION"),
    expectedRevision: revision,
    proposalDigest: digest,
    explicitConsent: z.literal(true),
  }),
]);
// Additive candidate only: never feed this variant into the existing v1 receipt parser/store.
export const claimResolutionReceiptSchema = z
  .strictObject({
    receiptVersion: z.literal(2),
    operationId: coreUuid,
    actorAccountId: coreUuid,
    tripId: coreUuid,
    requestId: coreUuid,
    intentDigest: digest,
    commandKind: z.enum([
      "SUBMIT_PENDING_CLAIM",
      "RESOLVE_CLAIM_REQUEST",
      "CONSENT_TO_RESOLUTION",
    ]),
    beforeRevision: revision.nullable(),
    afterRevision: revision,
    outcome: state,
    acceptedAt: time,
    effects: z.strictObject({
      linkedPersonId: coreUuid.nullable(),
      personCreateReceipt: personCloudCreateReceiptSchema.nullable(),
      provisionalRevocation: revocation.nullable(),
    }),
  })
  .superRefine((v, c) => {
    const child = v.effects.personCreateReceipt;
    const revoke = v.effects.provisionalRevocation;
    if (
      v.afterRevision !== (v.beforeRevision === null ? 1 : v.beforeRevision + 1) ||
      (v.outcome === "LINKED") !== (v.effects.linkedPersonId !== null) ||
      (child &&
        (v.outcome !== "LINKED" ||
          child.request.tripId !== v.tripId ||
          child.person.personId !== v.effects.linkedPersonId ||
          child.request.operationId === v.operationId)) ||
      (revoke &&
        (revoke.operationId !== v.operationId ||
          revoke.requestId !== v.requestId ||
          revoke.tripId !== v.tripId ||
          (revoke.reason === "REQUEST_REJECTED"
            ? v.outcome !== "REJECTED"
            : v.outcome !== "LINKED")))
    )
      c.addIssue({ code: "custom", message: "CLAIM_RESOLUTION_RECEIPT_BINDING" });
  });
const refusal = z.strictObject({ status: z.enum(["DENIED", "CLOSED", "UNAVAILABLE"]) });
export const claimResolutionResultSchema = z.union([
  z.strictObject({
    status: z.literal("RECORDED"),
    receipt: claimResolutionReceiptSchema,
    snapshot: claimRequestSnapshotSchema.nullable(),
  }),
  z.strictObject({ status: z.literal("CONFLICT"), currentRevision: revision.nullable() }),
  refusal,
]);
export const claimResolutionRecoveryInputSchema = z.strictObject({
  ...intent,
  intentDigest: digest,
});
export const claimResolutionRecoverySchema = z.union([
  z.strictObject({ status: z.literal("FOUND"), receipt: claimResolutionReceiptSchema }),
  z.strictObject({
    status: z.enum(["ABSENT_UNCONFIRMED", "CONFLICT", "DENIED", "CLOSED", "UNAVAILABLE"]),
  }),
]);
export type ClaimResolutionScope = z.infer<typeof claimResolutionScopeSchema>;
export type ClaimResolutionCommand = z.infer<typeof claimResolutionCommandSchema>;
export const claimResolutionRequestViewSchema = z.strictObject({
  accountId: coreUuid, tripId: coreUuid, requestId: coreUuid,
  snapshot: claimRequestSnapshotSchema,
  eligibleActions: z.array(z.enum(["CONFIRM", "CHOOSE_ANOTHER", "CREATE_NEW", "REJECT"])).max(4),
  canConsent: z.boolean(),
  proposalPreview: z.strictObject({ personId: coreUuid, displayName: personCloudCreateSchema.shape.displayName }).nullable().optional(),
}).superRefine((v, c) => {
  if (v.snapshot.tripId !== v.tripId || v.snapshot.requestId !== v.requestId ||
      new Set(v.eligibleActions).size !== v.eligibleActions.length ||
      (["LINKED", "REJECTED", "EXPIRED"].includes(v.snapshot.state) && (v.eligibleActions.length > 0 || v.canConsent)) ||
      (v.eligibleActions.includes("CONFIRM") && (v.snapshot.state !== "PENDING_REVIEW" || v.snapshot.consent.state !== "RECORDED")) ||
      (v.canConsent && (v.snapshot.state !== "AWAITING_CONSENT" || v.snapshot.claimantAccountId !== v.accountId || v.snapshot.consent.state !== "REQUIRED")))
    c.addIssue({ code: "custom", message: "CLAIM_RESOLUTION_VIEW_BINDING" });
  const personId = v.snapshot.proposal.kind === "EXISTING_PERSON" ? v.snapshot.proposal.personId : v.snapshot.proposal.create.personId;
  if (v.proposalPreview && v.proposalPreview.personId !== personId)
    c.addIssue({ code: "custom", message: "CLAIM_RESOLUTION_PREVIEW_PERSON_BINDING" });
});
export const claimResolutionRequestIndexSchema = z.strictObject({
  accountId: coreUuid, tripId: coreUuid,
  entries: z.array(z.strictObject({
    requestId: coreUuid, inviteId: coreUuid, initialOperationId: coreUuid,
    claimantAccountId: coreUuid, originalPersonId: coreUuid,
    revision, state: z.enum(["PENDING_REVIEW", "AWAITING_CONSENT"]), expiresAt: time,
  })).max(50),
  nextRequestId: coreUuid.nullable(),
}).superRefine((v, c) => {
  if (new Set(v.entries.map(entry => entry.requestId)).size !== v.entries.length ||
      (v.nextRequestId !== null && (v.entries.length !== 50 || v.entries.at(-1)?.requestId !== v.nextRequestId)))
    c.addIssue({ code: "custom", message: "CLAIM_RESOLUTION_INDEX_BINDING" });
});
export function claimResolutionIntentText(scope: unknown, command: unknown) {
  return "otr-claim-resolution-v1\n" + JSON.stringify({
    scope: claimResolutionScopeSchema.parse(scope),
    command: claimResolutionCommandSchema.parse(command),
  });
}
export const claimCreatePersonContextSchema = z.strictObject({
  version: z.literal(1), actorAccountId: coreUuid, tripId: coreUuid, requestId: coreUuid,
  requestRevision: revision, tripCreateOperationId: coreUuid,
});
export interface ClaimResolutionAuthority {
  readCreatePersonContext?(scope: ClaimResolutionScope, requestId: string):
    Promise<z.infer<typeof claimCreatePersonContextSchema> | null>;
  readProvisionalView?(scope: ClaimResolutionScope, requestId: string):
    Promise<import("./claimProvisionalContracts").ClaimProvisionalView | null>;
  listRequests?(
    scope: ClaimResolutionScope, afterRequestId: string | null,
  ): Promise<z.infer<typeof claimResolutionRequestIndexSchema> | null>;
  readRequestView?(
    scope: ClaimResolutionScope, requestId: string,
  ): Promise<z.infer<typeof claimResolutionRequestViewSchema> | null>;
  previewPendingClaim(
    scope: ClaimResolutionScope,
    input: z.infer<typeof pendingClaimPreviewInputSchema>,
  ): Promise<z.infer<typeof pendingClaimPreviewSchema> | null>;
  submitPendingClaim(
    scope: ClaimResolutionScope,
    command: Extract<ClaimResolutionCommand, { kind: "SUBMIT_PENDING_CLAIM" }>,
  ): Promise<z.infer<typeof claimResolutionResultSchema>>;
  resolveClaimRequest(
    scope: ClaimResolutionScope,
    command: Extract<ClaimResolutionCommand, { kind: "RESOLVE_CLAIM_REQUEST" }>,
  ): Promise<z.infer<typeof claimResolutionResultSchema>>;
  consentToResolution(
    scope: ClaimResolutionScope,
    command: Extract<ClaimResolutionCommand, { kind: "CONSENT_TO_RESOLUTION" }>,
  ): Promise<z.infer<typeof claimResolutionResultSchema>>;
  readRequest(
    scope: ClaimResolutionScope,
    requestId: string,
  ): Promise<z.infer<typeof claimRequestSnapshotSchema> | null>;
  recoverOperation(
    scope: ClaimResolutionScope,
    original: z.infer<typeof claimResolutionRecoveryInputSchema>,
  ): Promise<z.infer<typeof claimResolutionRecoverySchema>>;
}
