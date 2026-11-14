import {
  guestVerificationSession,
  readCommittedLocalPrincipal,
} from "./authRepository";
import { getAccountGeneration } from "./accountGeneration";
import { assertAccountRequestGeneration } from "./accountRequestContext";
import { openGuestAdoptionRecovery } from "./guestAdoptionRecovery";
import { createGuestAdoptionTransport } from "./guestAdoptionTransport";
import { hasActiveGuestInventory } from "./guestLocalWorkspace";
import { refreshSupabaseDevSession, revokeSupabaseDevSession, SupabaseDevAuthError } from "./devSupabaseAuth";
import { prepareGuestTripP1Adoption } from "./guestTripP1Adoption";

// Restore the original attempt without automatically requesting adoption.
export async function readPendingGuestAdoption(signal: AbortSignal) {
  const generation = getAccountGeneration();
  const principal = await readCommittedLocalPrincipal();
  if (principal?.kind !== "GUEST") return null;
  const scope = { kind: "GUEST" as const, localId: principal.localId, generation };
  const current = () => {
    if (signal.aborted) throw Error("AUTH_ACTIVATION_CANCELED");
    assertAccountRequestGeneration({ accountId: scope.localId, generation });
  };
  current();
  const recovery = await openGuestAdoptionRecovery(scope);
  const publications = await recovery.inspectPublicationRequests();
  const preparations = await recovery.inspectPreparedAttempts();
  const attempts = [...publications, ...preparations];
  current();
  if (!attempts.length) return null;
  if (attempts.length !== 1 || hasActiveGuestInventory(scope.localId))
    throw Error("GUEST_ADOPTION_RECOVERY_REQUIRED");
  const prior = attempts[0], p = prior.preparation;
  const binding = {
    sourceGuestLocalId: scope.localId,
    adoptionId: p.adoptionId,
    targetAccountId: p.targetAccountId,
  };
  const expected = { contractVersion: 1 as const, ...binding, inventorySha256: p.inventorySha256 };
  const transport = createGuestAdoptionTransport(scope, binding, { signal });
  async function finishCancellation() {
    current();
    await guestVerificationSession.revoke(binding, async (session) => {
      try {
        await revokeSupabaseDevSession(session.accessToken!, { signal });
      } catch (error) {
        if (!(error instanceof SupabaseDevAuthError && error.kind === "invalid_session")) throw error;
      }
    }, async (session) => {
      try {
        return await refreshSupabaseDevSession(session.refreshToken!, {
          signal, persistSession: async () => undefined,
        }, session.identity);
      } catch (error) {
        if (error instanceof SupabaseDevAuthError && error.kind === "invalid_session" &&
            error.invalidSessionReason === "provider_refresh_rejected") return null;
        throw error;
      }
    });
    current();
    await recovery.finishServerCancellation(binding.adoptionId, binding.targetAccountId);
    await recovery.inspectPublicationRequests();
    current();
  }
  if (prior.cancellationReceipt) {
    await finishCancellation();
    return null;
  }
  const verified = await guestVerificationSession.read(binding);
  current();
  if (verified.status !== "SESSION" || verified.session.identity?.userId !== binding.targetAccountId)
    throw Error("GUEST_ADOPTION_VERIFICATION_REQUIRED");
  async function cancelOriginal() {
    current();
    const receipt = await transport.cancel(expected);
    current();
    await recovery.recordServerCancellation(binding.adoptionId, binding.targetAccountId, receipt);
    await finishCancellation();
  }
  if (prior.nextAction === "RESUME_PREFLIGHT") {
    const attempt = await prepareGuestTripP1Adoption(
      verified.session, binding.targetAccountId, generation, signal,
      { adoptionId: binding.adoptionId, cancel: cancelOriginal },
    );
    current();
    return { session: verified.session, generation, signal, attempt };
  }
  let published = false;
  const attempt = {
    targetAccountId: binding.targetAccountId,
    get canCancel() { return !published; },
    async publish() {
      current();
      const status = await transport.status(expected);
      if (status.status !== "PUBLISHED") throw Error("GUEST_ADOPTION_AUTHORITATIVE_STATUS_REQUIRED");
      const receipt = await transport.receipt({ ...expected, ...status.receipt });
      current();
      if (receipt.outcome !== "PUBLISHED") throw Error("GUEST_ADOPTION_AUTHORITATIVE_STATUS_REQUIRED");
      published = true;
      return receipt;
    },
    async cancel() {
      current();
      if (published) throw Error("GUEST_ADOPTION_AUTHORITATIVE_STATUS_REQUIRED");
      // The existing server lock refuses cancellation if publication committed or is unresolved.
      await cancelOriginal();
    },
  };
  return { session: verified.session, generation, signal, attempt };
}
