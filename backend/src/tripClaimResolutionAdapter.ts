import { createHash } from "node:crypto";
import {
  claimResolutionScopeSchema,
  claimResolutionCommandSchema,
  claimResolutionResultSchema,
  claimResolutionRecoveryInputSchema,
  claimResolutionRecoverySchema,
  claimRequestSnapshotSchema,
  pendingClaimPreviewInputSchema,
  pendingClaimPreviewSchema,
  type ClaimResolutionAuthority,
  claimResolutionIntentText,
} from "../../src/data/api/claimResolutionContracts";
import { coreUuid } from "../../src/domain/trip/tripCoreV2";

// Proposed v2 intent binding; v1 receipt identity/namespace collision checks remain Core-owned.
export const claimResolutionIntentDigest = (scope: unknown, command: unknown) =>
  createHash("sha256")
    .update(claimResolutionIntentText(scope, command))
    .digest("hex");

export class ClaimResolutionReadUnavailable extends Error {
  readonly status = 503;
  constructor(readonly code: "CLAIM_RESOLUTION_CLOSED" | "CLAIM_RESOLUTION_UNAVAILABLE") {
    super(code);
  }
}
const mismatch = () => {
  throw Error("CLAIM_RESOLUTION_AUTHORITY_RESPONSE_MISMATCH");
};

// Source-only boundary. No route/bootstrap import; an injected fixture is not a production authority.
export function createClaimResolutionAdapter(authority?: ClaimResolutionAuthority) {
  return {
    async preview(scopeInput: unknown, input: unknown) {
      const scope = claimResolutionScopeSchema.parse(scopeInput);
      const request = pendingClaimPreviewInputSchema.parse(input);
      if (!authority) throw new ClaimResolutionReadUnavailable("CLAIM_RESOLUTION_CLOSED");
      try {
        const result = pendingClaimPreviewSchema
          .nullable()
          .parse(await authority.previewPendingClaim({ ...scope }, { ...request }));
        if (
          result &&
          (result.tripId !== scope.tripId ||
            result.claimantAccountId !== scope.actorAccountId ||
            result.requestId !== request.requestId ||
            result.inviteId !== request.inviteId ||
            result.requestedPersonId !== request.requestedPersonId)
        )
          mismatch();
        return result;
      } catch {
        throw new ClaimResolutionReadUnavailable("CLAIM_RESOLUTION_UNAVAILABLE");
      }
    },
    async execute(scopeInput: unknown, input: unknown) {
      const scope = claimResolutionScopeSchema.parse(scopeInput);
      const command = claimResolutionCommandSchema.parse(input);
      if (
        command.kind === "RESOLVE_CLAIM_REQUEST" &&
        command.decision.kind === "CREATE_NEW" &&
        command.decision.create.tripId !== scope.tripId
      )
        return { status: "DENIED" as const };
      if (!authority) return { status: "CLOSED" as const };
      const expectedDigest = claimResolutionIntentDigest(scope, command);
      try {
        // Give the owning port its own parsed copy, retaining the immutable expected wire identity here.
        const wire = claimResolutionCommandSchema.parse(command);
        const raw =
          wire.kind === "SUBMIT_PENDING_CLAIM"
            ? await authority.submitPendingClaim({ ...scope }, wire)
            : wire.kind === "RESOLVE_CLAIM_REQUEST"
              ? await authority.resolveClaimRequest({ ...scope }, wire)
              : await authority.consentToResolution({ ...scope }, wire);
        const result = claimResolutionResultSchema.parse(raw);
        if (result.status !== "RECORDED") return result;
        const receipt = result.receipt;
        const expectedState =
          command.kind === "SUBMIT_PENDING_CLAIM"
            ? "PENDING_REVIEW"
            : command.kind === "CONSENT_TO_RESOLUTION"
              ? "LINKED"
              : command.decision.kind === "CONFIRM"
                ? "LINKED"
                : command.decision.kind === "REJECT"
                  ? "REJECTED"
                  : "AWAITING_CONSENT";
        if (
          receipt.actorAccountId !== scope.actorAccountId ||
          receipt.tripId !== scope.tripId ||
          receipt.requestId !== command.requestId ||
          receipt.operationId !== command.operationId ||
          receipt.intentDigest !== expectedDigest ||
          receipt.commandKind !== command.kind ||
          receipt.beforeRevision !== command.expectedRevision ||
          (receipt.outcome !== expectedState && receipt.outcome !== "EXPIRED")
        )
          mismatch();
        const snapshot = result.snapshot;
        if (
          snapshot &&
          (snapshot.tripId !== scope.tripId ||
            snapshot.requestId !== command.requestId ||
            snapshot.revision < receipt.afterRevision ||
            (snapshot.revision === receipt.afterRevision &&
              snapshot.state !== receipt.outcome))
        )
          mismatch();
        if (
          snapshot &&
          receipt.effects.provisionalRevocation &&
          receipt.effects.provisionalRevocation.claimantAccountId !==
            snapshot.claimantAccountId
        )
          mismatch();
        if (
          snapshot &&
          (command.kind === "SUBMIT_PENDING_CLAIM" ||
            command.kind === "CONSENT_TO_RESOLUTION") &&
          snapshot.claimantAccountId !== scope.actorAccountId
        )
          mismatch();
        if (
          snapshot &&
          command.kind === "SUBMIT_PENDING_CLAIM" &&
          snapshot.originalPersonId !== command.requestedPersonId
        )
          mismatch();
        if (snapshot?.revision === receipt.afterRevision) {
          const target =
            snapshot.proposal.kind === "EXISTING_PERSON"
              ? snapshot.proposal.personId
              : snapshot.proposal.create.personId;
          if (receipt.outcome === "LINKED" && receipt.effects.linkedPersonId !== target)
            mismatch();
          if (
            receipt.effects.personCreateReceipt &&
            (snapshot.proposal.kind !== "NEW_PERSON" ||
              JSON.stringify(receipt.effects.personCreateReceipt.request) !==
                JSON.stringify(snapshot.proposal.create))
          )
            mismatch();
          if (
            command.kind === "CONSENT_TO_RESOLUTION" &&
            (snapshot.proposalDigest !== command.proposalDigest ||
              (receipt.outcome === "LINKED" &&
                snapshot.consent.operationId !== command.operationId))
          )
            mismatch();
          if (
            command.kind === "RESOLVE_CLAIM_REQUEST" &&
            receipt.outcome === "AWAITING_CONSENT"
          ) {
            if (
              snapshot.consent.state !== "REQUIRED" ||
              snapshot.proposalOperationId !== command.operationId ||
              snapshot.proposedByAccountId !== scope.actorAccountId
            )
              mismatch();
            if (
              command.decision.kind === "CHOOSE_ANOTHER" &&
              (snapshot.proposal.kind !== "EXISTING_PERSON" ||
                target !== command.decision.personId)
            )
              mismatch();
            if (
              command.decision.kind === "CREATE_NEW" &&
              (snapshot.proposal.kind !== "NEW_PERSON" ||
                JSON.stringify(snapshot.proposal.create) !==
                  JSON.stringify(command.decision.create))
            )
              mismatch();
          }
        }
        // RECORDED is historical disposition, not a replacement for current Member/Person readback.
        return result;
      } catch {
        return { status: "UNAVAILABLE" as const };
      }
    },
    async read(scopeInput: unknown, requestIdInput: unknown) {
      const scope = claimResolutionScopeSchema.parse(scopeInput);
      const requestId = coreUuid.parse(requestIdInput);
      if (!authority) throw new ClaimResolutionReadUnavailable("CLAIM_RESOLUTION_CLOSED");
      try {
        const result = claimRequestSnapshotSchema
          .nullable()
          .parse(await authority.readRequest({ ...scope }, requestId));
        if (result && (result.tripId !== scope.tripId || result.requestId !== requestId))
          mismatch();
        return result;
      } catch {
        throw new ClaimResolutionReadUnavailable("CLAIM_RESOLUTION_UNAVAILABLE");
      }
    },
    async recover(scopeInput: unknown, input: unknown) {
      const scope = claimResolutionScopeSchema.parse(scopeInput);
      const original = claimResolutionRecoveryInputSchema.parse(input);
      if (!authority) return { status: "CLOSED" as const };
      try {
        const result = claimResolutionRecoverySchema.parse(
          await authority.recoverOperation({ ...scope }, { ...original }),
        );
        if (
          result.status === "FOUND" &&
          (result.receipt.actorAccountId !== scope.actorAccountId ||
            result.receipt.tripId !== scope.tripId ||
            result.receipt.requestId !== original.requestId ||
            result.receipt.operationId !== original.operationId ||
            result.receipt.intentDigest !== original.intentDigest)
        )
          mismatch();
        return result;
      } catch {
        return { status: "UNAVAILABLE" as const };
      }
    },
  };
}
