import type { z } from "zod";
import type { AccountRequestContext } from "@/data/auth/accountRequestContext";
import { directedInvitationDetailSchema } from "@/data/api/directedInviteReadContracts";
import { pendingClaimPreviewSchema } from "@/data/api/claimResolutionContracts";
import type { createDirectedInviteReadRepository } from "@/data/repositories/directedInviteReadRepository";
import type { createClaimResolutionRepository } from "@/data/repositories/claimResolutionRepository";
import { resolutionReceiptForCommand } from "@/data/repositories/claimResolutionRepository";
import type { createMemberClaimAttemptRepository } from "@/data/repositories/memberClaimAttemptRepository";
import { coreUuid } from "@/domain/trip/tripCoreV2";
import { createUuid } from "@/domain/localId";
import { createPeopleFlowView } from "./directedInviteControllers";

type Attempts = ReturnType<typeof createMemberClaimAttemptRepository>;
type Detail = z.infer<typeof directedInvitationDetailSchema>;
type Preview = z.infer<typeof pendingClaimPreviewSchema>;
export type PendingClaimSubmissionPorts = Readonly<{
  account(): Promise<string>;
  invitations: Pick<ReturnType<typeof createDirectedInviteReadRepository>, "invitation">;
  reader: Pick<ReturnType<typeof createClaimResolutionRepository>, "preview">;
  attempts: Pick<Attempts, "readResolution" | "executeResolutionOnce" | "recoverResolution" | "clearResolvedResolution">;
}>;
export type PendingClaimSubmissionState = Readonly<{
  phase: "LOADING" | "READY" | "BUSY" | "RECORDED" | "UNKNOWN" | "UNAVAILABLE" | "NOT_VISIBLE";
  invitation: Detail["invitation"] | null;
  preview: Preview | null;
  requestId: string | null;
  operationId: string | null;
}>;

// Explicit pending-review path; the previously accepted trusted v1 Claim flow is unchanged.
export function createPendingClaimSubmissionController(context: AccountRequestContext, inviteId: string, ports: PendingClaimSubmissionPorts) {
  coreUuid.parse(inviteId);
  const model = createPeopleFlowView<PendingClaimSubmissionState>(context, ports.account, {
    phase: "LOADING", invitation: null, preview: null, requestId: null, operationId: null,
  });
  context = model.context;
  let running = false;
  async function retained() {
    const saved = await ports.attempts.readResolution(context);
    await model.guard();
    if (saved && (saved.original.kind !== "SUBMIT_PENDING_CLAIM" || saved.original.inviteId !== inviteId))
      throw Error("PENDING_CLAIM_OTHER_ORIGINAL_REQUIRED");
    return saved;
  }
  async function restore() {
    const saved = await retained();
    if (!saved) return false;
    model.update({ requestId: saved.original.requestId, operationId: saved.original.operationId, invitation: null, preview: null });
    if (saved.receipt) {
      const receipt = resolutionReceiptForCommand(context, saved.original, saved.receipt);
      model.update({ phase: receipt.outcome === "PENDING_REVIEW" ? "RECORDED" : "NOT_VISIBLE" });
    } else if (saved.rejection && saved.rejectionSource === "INITIAL_EXECUTION") {
      await ports.attempts.clearResolvedResolution(context, saved.original.operationId);
      await model.guard();
      model.update({ phase: "UNAVAILABLE" });
    } else model.update({ phase: "UNKNOWN" });
    return true;
  }
  async function fail() {
    try { await model.guard(); if (await restore()) return; }
    catch { /* A different or unreadable original must remain untouched. */ }
    await model.fail({ phase: "UNAVAILABLE", invitation: null, preview: null });
  }
  return {
    context, getSnapshot: model.getSnapshot, subscribe: model.subscribe, dispose: model.dispose,
    async load() {
      if (running) return;
      running = true;
      try {
        await model.guard();
        model.update({ phase: "LOADING", invitation: null, preview: null });
        if (await restore()) return;
        const detail = directedInvitationDetailSchema.parse(await ports.invitations.invitation(context, inviteId));
        await model.guard();
        const invitation = detail.invitation;
        if (detail.accountId !== context.accountId || invitation.tripId !== context.tripId || invitation.inviteId !== inviteId)
          throw Error("PENDING_CLAIM_INVITATION_SCOPE_MISMATCH");
        if (invitation.status !== "PENDING") { model.update({ phase: "NOT_VISIBLE" }); return; }
        const requestId = createUuid();
        const preview = pendingClaimPreviewSchema.nullable().parse(await ports.reader.preview(context, {
          requestId, inviteId, requestedPersonId: invitation.personId,
        }));
        await model.guard();
        if (!preview) { model.update({ phase: "NOT_VISIBLE" }); return; }
        if (preview.claimantAccountId !== context.accountId || preview.tripId !== context.tripId || preview.requestId !== requestId ||
            preview.inviteId !== inviteId || preview.requestedPersonId !== invitation.personId)
          throw Error("PENDING_CLAIM_PREVIEW_SCOPE_MISMATCH");
        model.update({ phase: "READY", invitation, preview, requestId, operationId: null });
      } catch { await fail(); }
      finally { running = false; }
    },
    async submit() {
      if (running || model.getSnapshot().phase !== "READY") return;
      running = true;
      try {
        await model.guard();
        const preview = model.getSnapshot().preview;
        if (!preview) throw Error("PENDING_CLAIM_PREVIEW_REQUIRED");
        const operationId = createUuid();
        model.update({ phase: "BUSY", operationId });
        // Existing repository checkpoints before POST; no automatic retry on response loss.
        await ports.attempts.executeResolutionOnce(context, { kind: "SUBMIT_PENDING_CLAIM", operationId,
          requestId: preview.requestId, inviteId, requestedPersonId: preview.requestedPersonId,
          expectedRevision: null, expectedPreviewDigest: preview.previewDigest, explicitConsent: true });
        await model.guard();
        if (!await restore()) throw Error("PENDING_CLAIM_ORIGINAL_REQUIRED");
      } catch { await fail(); }
      finally { running = false; }
    },
    async checkOriginal() {
      if (running) return;
      running = true;
      try {
        await model.guard();
        const saved = await retained();
        if (!saved) throw Error("PENDING_CLAIM_ORIGINAL_REQUIRED");
        model.update({ phase: "BUSY" });
        if (!saved.receipt && !(saved.rejection && saved.rejectionSource === "INITIAL_EXECUTION")) await ports.attempts.recoverResolution(context);
        await model.guard();
        await restore();
      } catch { await fail(); }
      finally { running = false; }
    },
  };
}
