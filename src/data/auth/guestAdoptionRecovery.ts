import {
  noteGuestPublicationRequested,
  noteInspectedGuestPublications,
} from "./guestPublicationHold";
import { z } from "zod";
import { coreUuid } from "@/domain/trip/tripCoreV2";
import { canonicalCoreJson, type Json } from "@/domain/trip/tripCoreV2Json";
import { tripCoreSha256Hex } from "../repositories/tripCoreSha256";
import {
  withAccountApplyGate,
  assertAccountRequestGeneration,
} from "./accountRequestContext";
import { guestVerificationSession, requireCommittedGuestPrincipal } from "./authRepository";
import { verifyGuestSourceCheckpoint } from "./guestTripP1SourceSchema";
import { validateGuestAdoptionCancellationReceipt } from "@/domain/auth/guestAdoptionReceipt";
import {
  guestAdoptionBindingSchema as binding,
  guestAdoptionPreparationSchema,
  verifyGuestAdoptionDrafts,
  type GuestAdoptionPreparation,
} from "./guestAdoptionPreparation";
export {
  guestAdoptionPreparationSchema,
  verifyGuestAdoptionDrafts,
} from "./guestAdoptionPreparation";
export type { GuestAdoptionPreparation } from "./guestAdoptionPreparation";
const digest = z.string().regex(/^[0-9a-f]{64}$/);

const transitionSchema = binding.extend({
  checkpoint: z.enum(["PUBLISH_REQUESTED", "CANCELLED"]),
  preparationSha256: digest,
});
export type GuestRecoveryCheckpoint = "prepared" | "publish-requested" | "cancelled" | "cancellation-receipt";
export type GuestRecoveryFiles = {
  listAttempts(): Promise<string[]>;
  read(adoptionId: string, checkpoint: GuestRecoveryCheckpoint): Promise<string | null>;
  create(
    adoptionId: string,
    checkpoint: GuestRecoveryCheckpoint,
    text: string,
  ): Promise<void>;
};
type Scope = Readonly<{ kind: "GUEST"; localId: string; generation: number }>;
const scopeSchema = z.strictObject({
  kind: z.literal("GUEST"),
  localId: coreUuid,
  generation: z.number().int().nonnegative().safe(),
});
const canonical = (value: unknown) => canonicalCoreJson(value as Json);
const sha = (text: string) => tripCoreSha256Hex(new TextEncoder().encode(text));

// Local recovery material only. A checkpoint never authorizes upload or Session installation.
export function createGuestAdoptionRecovery(deps: {
  scope: Scope;
  files: GuestRecoveryFiles;
  assertGuest(): Promise<void>;
}) {
  const scope = Object.freeze(scopeSchema.parse(deps.scope));
  async function pinned<T>(work: () => Promise<T>) {
    return withAccountApplyGate(async () => {
      await deps.assertGuest();
      const result = await work();
      await deps.assertGuest();
      return result;
    });
  }
  function assertBinding(
    value: z.infer<typeof binding>,
    adoptionId: string,
    targetAccountId?: string,
  ) {
    if (
      value.sourceGuestLocalId !== scope.localId ||
      value.adoptionId !== adoptionId ||
      (targetAccountId !== undefined && value.targetAccountId !== targetAccountId)
    )
      throw Error("GUEST_ADOPTION_RECOVERY_SCOPE");
  }
  async function checkedPreparation(
    raw: string,
    adoptionId: string,
    targetAccountId?: string,
  ) {
    const parsed = JSON.parse(raw) as unknown;
    assertBinding(binding.strip().parse(parsed), adoptionId, targetAccountId);
    const value = guestAdoptionPreparationSchema.parse(parsed);
    await verifyGuestAdoptionDrafts(value);
    if (value.source) await verifyGuestSourceCheckpoint(value.source, value);
    if (canonical(value) !== raw) throw Error("GUEST_ADOPTION_RECOVERY_NONCANONICAL");
    return { preparation: value, preparationSha256: await sha(raw) };
  }
  async function read(adoptionId: string, targetAccountId?: string) {
    coreUuid.parse(adoptionId);
    if (targetAccountId !== undefined) coreUuid.parse(targetAccountId);
    const [raw, publish, cancel, cancellation] = await Promise.all([
      deps.files.read(adoptionId, "prepared"),
      deps.files.read(adoptionId, "publish-requested"),
      deps.files.read(adoptionId, "cancelled"),
      deps.files.read(adoptionId, "cancellation-receipt"),
    ]);
    if (raw === null) {
      if (publish !== null || cancel !== null || cancellation !== null)
        throw Error("GUEST_ADOPTION_RECOVERY_ORPHAN");
      return null;
    }
    const prepared = await checkedPreparation(raw, adoptionId, targetAccountId);
    for (const [text, checkpoint] of [
      [publish, "PUBLISH_REQUESTED"],
      [cancel, "CANCELLED"],
    ] as const) {
      if (text === null) continue;
      const record = transitionSchema.parse(JSON.parse(text));
      assertBinding(record, adoptionId, prepared.preparation.targetAccountId);
      if (
        record.checkpoint !== checkpoint ||
        record.schemaId !== prepared.preparation.schemaId ||
        record.preparationSha256 !== prepared.preparationSha256 ||
        canonical(record) !== text
      )
        throw Error("GUEST_ADOPTION_RECOVERY_CHECKPOINT_PIN");
    }
    let cancellationReceipt;
    if (cancellation !== null) {
      if (publish === null) throw Error("GUEST_ADOPTION_RECOVERY_ORPHAN");
      cancellationReceipt = await validateCancellation(JSON.parse(cancellation), prepared);
      if (canonical(cancellationReceipt) !== cancellation)
        throw Error("GUEST_ADOPTION_RECOVERY_NONCANONICAL");
    }
    if (publish !== null && cancel !== null && !cancellationReceipt)
      throw Error("GUEST_ADOPTION_RECOVERY_CONFLICT");
    return {
      ...prepared,
      ...(cancellationReceipt ? { cancellationReceipt } : {}),
      nextAction:
        cancel !== null
            ? ("REMAIN_GUEST" as const)
            : publish !== null
              ? ("QUERY_SERVER_STATUS" as const)
              : ("RESUME_PREFLIGHT" as const),
    };
  }
  async function validateCancellation(input: unknown, prepared: Awaited<ReturnType<typeof checkedPreparation>>) {
    const p = prepared.preparation;
    const receipt = await validateGuestAdoptionCancellationReceipt(input, {
      contractVersion: 1,
      adoptionId: p.adoptionId,
      sourceGuestLocalId: p.sourceGuestLocalId,
      targetAccountId: p.targetAccountId,
      inventorySha256: p.inventorySha256,
    }, tripCoreSha256Hex);
    if (receipt.preparationSha256 !== prepared.preparationSha256 || !receipt.planSha256)
      throw Error("GUEST_ADOPTION_CANCELLATION_CHECKPOINT_MISMATCH");
    return receipt;
  }
  async function immutable(
    adoptionId: string,
    checkpoint: GuestRecoveryCheckpoint,
    text: string,
  ) {
    const existing = await deps.files.read(adoptionId, checkpoint);
    if (existing !== null) {
      if (existing !== text) throw Error("GUEST_ADOPTION_RECOVERY_REUSE_MISMATCH");
      return;
    }
    await deps.assertGuest();
    await deps.files.create(adoptionId, checkpoint, text);
    if ((await deps.files.read(adoptionId, checkpoint)) !== text)
      throw Error("GUEST_ADOPTION_RECOVERY_WRITE_UNVERIFIED");
  }
  return {
    recordServerCancellation(adoptionId: string, targetAccountId: string, receipt: unknown) {
      return pinned(async () => {
        const prior = await read(adoptionId, targetAccountId);
        if (!prior || prior.nextAction !== "QUERY_SERVER_STATUS")
          throw Error("GUEST_ADOPTION_AUTHORITATIVE_STATUS_REQUIRED");
        const checked = await validateCancellation(receipt, prior);
        await immutable(adoptionId, "cancellation-receipt", canonical(checked));
        return read(adoptionId, targetAccountId);
      });
    },
    finishServerCancellation(adoptionId: string, targetAccountId: string) {
      return pinned(async () => {
        const prior = await read(adoptionId, targetAccountId);
        if (!prior?.cancellationReceipt)
          throw Error("GUEST_ADOPTION_AUTHORITATIVE_STATUS_REQUIRED");
        const p = prior.preparation;
        // This getter is already under the apply gate; do not acquire it recursively.
        const verification = await guestVerificationSession.readForLocalCache({
          sourceGuestLocalId: p.sourceGuestLocalId, targetAccountId,
          adoptionId,
        }, scope.generation);
        if (verification.status !== "REVOKED")
          throw Error("GUEST_VERIFICATION_REVOCATION_PENDING");
        await immutable(adoptionId, "cancelled", canonical({
          schemaId: p.schemaId, sourceKind: p.sourceKind,
          sourceGuestLocalId: p.sourceGuestLocalId, adoptionId, targetAccountId,
          checkpoint: "CANCELLED", preparationSha256: prior.preparationSha256,
        }));
        return read(adoptionId, targetAccountId);
      });
    },
    inspectPublicationRequests() {
      return pinned(async () => {
        try {
          const requested = [];
          for (const id of await deps.files.listAttempts()) {
            const state = await read(id);
            if (state?.nextAction === "QUERY_SERVER_STATUS") requested.push(state);
          }
          noteInspectedGuestPublications(
            scope.localId,
            requested.map((state) => state.preparation.adoptionId),
          );
          return requested;
        } catch (error) {
          noteGuestPublicationRequested(scope.localId);
          throw error;
        }
      });
    },
    read: (adoptionId: string, targetAccountId?: string) =>
      pinned(() => read(adoptionId, targetAccountId)),
    async prepare(input: GuestAdoptionPreparation) {
      const candidate = guestAdoptionPreparationSchema.parse(input);
      const text = canonical(candidate);
      return pinned(async () => {
        const checked = await checkedPreparation(
          text,
          candidate.adoptionId,
          candidate.targetAccountId,
        );
        const attempts = await deps.files.listAttempts();
        for (const attemptId of attempts) {
          const prior = await read(attemptId);
          if (
            attemptId !== checked.preparation.adoptionId &&
            prior &&
            prior.nextAction !== "REMAIN_GUEST"
          )
            throw Error("GUEST_ADOPTION_ALREADY_IN_PROGRESS");
        }
        await immutable(checked.preparation.adoptionId, "prepared", text);
        return read(checked.preparation.adoptionId, checked.preparation.targetAccountId);
      });
    },
    requestPublication(
      adoptionId: string,
      targetAccountId: string,
      preparationSha256: string,
    ) {
      return pinned(async () => {
        const prior = await read(adoptionId, targetAccountId);
        if (
          !prior ||
          prior.preparationSha256 !== digest.parse(preparationSha256) ||
          prior.nextAction === "REMAIN_GUEST"
        )
          throw Error("GUEST_ADOPTION_PREPARATION_REQUIRED");
        const { preparation: p } = prior;
        noteGuestPublicationRequested(scope.localId);
        await immutable(
          adoptionId,
          "publish-requested",
          canonical({
            schemaId: p.schemaId,
            sourceKind: p.sourceKind,
            sourceGuestLocalId: p.sourceGuestLocalId,
            adoptionId,
            targetAccountId,
            checkpoint: "PUBLISH_REQUESTED",
            preparationSha256,
          }),
        );
        return read(adoptionId, targetAccountId);
      });
    },
    cancelBeforePublication(adoptionId: string, targetAccountId: string) {
      return pinned(async () => {
        const prior = await read(adoptionId, targetAccountId);
        if (!prior || prior.nextAction === "QUERY_SERVER_STATUS")
          throw Error("GUEST_ADOPTION_AUTHORITATIVE_STATUS_REQUIRED");
        const { preparation: p, preparationSha256 } = prior;
        await immutable(
          adoptionId,
          "cancelled",
          canonical({
            schemaId: p.schemaId,
            sourceKind: p.sourceKind,
            sourceGuestLocalId: p.sourceGuestLocalId,
            adoptionId,
            targetAccountId,
            checkpoint: "CANCELLED",
            preparationSha256,
          }),
        );
        return read(adoptionId, targetAccountId);
      });
    },
  };
}

export async function openGuestAdoptionRecovery(scope: Scope) {
  scope = Object.freeze(scopeSchema.parse(scope));
  const assertGuest = async () => {
    assertAccountRequestGeneration({
      accountId: scope.localId,
      generation: scope.generation,
    });
    const guest = await requireCommittedGuestPrincipal();
    if (guest.localId !== scope.localId) throw Error("GUEST_ADOPTION_RECOVERY_SCOPE");
    assertAccountRequestGeneration({
      accountId: scope.localId,
      generation: scope.generation,
    });
  };
  await assertGuest();
  const { createGuestRecoveryFiles } = await import("./guestRecoveryFiles");
  return createGuestAdoptionRecovery({
    scope,
    files: createGuestRecoveryFiles(scope.localId),
    assertGuest,
  });
}
