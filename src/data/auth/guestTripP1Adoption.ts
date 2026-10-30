import type { LocalSession } from "@/domain/auth/localSession";
import { canonicalCoreJson, type Json } from "@/domain/trip/tripCoreV2Json";
import { createUuid } from "@/domain/localId";
import { freezeGuestHandoffInventory } from "./guestHandoffInventory";
import { prepareGuestHandoffCheckpoint } from "./guestHandoffCheckpoint";
import { openGuestAdoptionRecovery } from "./guestAdoptionRecovery";
import { createGuestAdoptionTransport } from "./guestAdoptionTransport";
import { guestVerificationSession } from "./authRepository";
import { assertAccountRequestGeneration } from "./accountRequestContext";
import { revokeSupabaseDevSession, SupabaseDevAuthError } from "./devSupabaseAuth";

// Retain the attempt before its first local write; every Retry keeps the same UUID.
// This flow never installs a Session, deletes source data or resumes after publication.
export async function prepareGuestTripP1Adoption(
  inputSession: LocalSession,
  confirmedTargetAccountId: string,
  generation: number,
  signal: AbortSignal,
) {
  const session = JSON.parse(JSON.stringify(inputSession)) as LocalSession;
  if (!session.identity || confirmedTargetAccountId !== session.identity.userId)
    throw Error("GUEST_ADOPTION_TARGET_CONFIRMATION_REQUIRED");
  const check = () => {
    if (signal.aborted) throw Error("AUTH_ACTIVATION_CANCELED");
    assertAccountRequestGeneration({ accountId: confirmedTargetAccountId, generation });
  };
  check();
  const adoptionId = createUuid();
  let inventory: Awaited<ReturnType<typeof freezeGuestHandoffInventory>> | undefined;
  let checkpoint: Awaited<ReturnType<typeof prepareGuestHandoffCheckpoint>> | undefined;
  let recovery: Awaited<ReturnType<typeof openGuestAdoptionRecovery>> | undefined;
  let transport: ReturnType<typeof createGuestAdoptionTransport> | undefined;
  let checkpointAttempted = false,
    credentialStored = false,
    credentialAttempted = false;
  let grantRequested = false,
    serverCancelled = false,
    credentialRevoked = false,
    busy = false;
  let phase: "PREPARED" | "PUBLISHING" | "PUBLISHED" | "CANCELLED" = "PREPARED";
  let planSha256: string | null = null;
  const binding = () => ({
    sourceGuestLocalId: inventory!.scope.localId,
    targetAccountId: confirmedTargetAccountId,
    adoptionId,
  });
  async function initialize() {
    inventory ??= await freezeGuestHandoffInventory();
    check();
    if (inventory.scope.generation !== generation)
      throw Error("GUEST_ADOPTION_SCOPE_MISMATCH");
    if (inventory.drafts.length || inventory.files.entries.length)
      throw Error("GUEST_ADOPTION_DRAFT_RESTORE_REQUIRED");
    checkpointAttempted = true;
    checkpoint ??= await prepareGuestHandoffCheckpoint(inventory, {
      adoptionId,
      targetAccountId: confirmedTargetAccountId,
    });
    recovery ??= await openGuestAdoptionRecovery(inventory.scope);
    transport ??= createGuestAdoptionTransport(inventory.scope, binding(), { signal });
    return { inventory, checkpoint, recovery, transport };
  }
  async function credential() {
    if (credentialStored) return;
    const prior = await guestVerificationSession.read(binding());
    credentialAttempted = true;
    await guestVerificationSession.store(
      binding(),
      session,
      prior.status === "SESSION" ? (prior.session.refreshToken ?? undefined) : undefined,
    );
    credentialStored = true;
  }
  async function revoke(token: string) {
    try {
      await revokeSupabaseDevSession(token, { signal });
    } catch (error) {
      if (!(error instanceof SupabaseDevAuthError && error.kind === "invalid_session"))
        throw error;
    }
  }
  async function exclusive<T>(work: () => Promise<T>) {
    check();
    if (busy) throw Error("GUEST_ADOPTION_IN_PROGRESS");
    busy = true;
    try {
      return await work();
    } finally {
      busy = false;
    }
  }
  return {
    targetAccountId: confirmedTargetAccountId,
    get canCancel() {
      return phase === "PREPARED";
    },
    publish() {
      return exclusive(async () => {
        if (phase === "CANCELLED") throw Error("GUEST_ADOPTION_CANCELLED");
        const local = await initialize();
        const canonicalText = canonicalCoreJson(
          local.checkpoint.preparation as unknown as Json,
        );
        const preparation = {
          canonicalText,
          sha256: local.checkpoint.preparationSha256,
          bytes: new TextEncoder().encode(canonicalText).byteLength,
        };
        const { resources: _resources, ...expected } = local.checkpoint.preflight;
        if (phase === "PREPARED") {
          await local.inventory.assertCurrent();
          await credential();
          await local.transport.targetReads.ensureProfile();
          grantRequested = true;
          const grant = await local.transport.preflight(
            local.checkpoint.preflight,
            confirmedTargetAccountId,
          );
          planSha256 = (await local.transport.stage({ grant, preparation })).planSha256;
          await local.inventory.assertCurrent();
          phase = "PUBLISHING";
        }
        // Retry this immutable write after filesystem UNKNOWN, before any publication.
        await local.recovery.requestPublication(
          adoptionId,
          confirmedTargetAccountId,
          preparation.sha256,
        );
        const status = await local.transport.status(expected);
        if (status.status === "CANCELLED")
          throw Error("GUEST_ADOPTION_AUTHORITATIVE_STATUS_REQUIRED");
        const receipt =
          status.status === "PUBLISHED"
            ? await local.transport.receipt({ ...expected, ...status.receipt })
            : await local.transport.publish({ ...expected, planSha256: planSha256! });
        if (receipt.outcome !== "PUBLISHED")
          throw Error("GUEST_ADOPTION_AUTHORITATIVE_STATUS_REQUIRED");
        phase = "PUBLISHED";
        return receipt;
      });
    },
    cancel() {
      return exclusive(async () => {
        if (phase !== "PREPARED")
          throw Error("GUEST_ADOPTION_AUTHORITATIVE_STATUS_REQUIRED");
        if (grantRequested && !serverCancelled) {
          const { resources: _resources, ...expected } = checkpoint!.preflight;
          await transport!.cancel(expected);
          serverCancelled = true;
        }
        if (!credentialRevoked) {
          if (credentialAttempted)
            await guestVerificationSession.revoke(binding(), (verified) =>
              revoke(verified.accessToken!),
            );
          else await revoke(session.accessToken!);
          credentialRevoked = true;
        }
        if (inventory && checkpointAttempted) {
          recovery ??= await openGuestAdoptionRecovery(inventory.scope);
          const prepared =
            checkpoint ?? (await recovery.read(adoptionId, confirmedTargetAccountId));
          if (prepared)
            await recovery.cancelBeforePublication(adoptionId, confirmedTargetAccountId);
        }
        await inventory?.resumeGuestBeforePublication();
        phase = "CANCELLED";
      });
    },
  };
}
