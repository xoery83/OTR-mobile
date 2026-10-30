import { openDatabase } from "../db/database";
import { getAccountGeneration } from "./accountGeneration";
import { requireCommittedGuestPrincipal } from "./authRepository";
import { openGuestAdoptionRecovery } from "./guestAdoptionRecovery";
import { createGuestAdoptionTransport } from "./guestAdoptionTransport";
import { restoreGuestAdoption } from "./guestAdoptionRestore";
import { canonicalCoreJson, type Json } from "@/domain/trip/tripCoreV2Json";

// Resume only an existing durable publication request through normal server reads.
export async function preparePublishedGuestSession(
  localId: string,
  targetAccountId: string,
) {
  const generation = getAccountGeneration();
  const guest = await requireCommittedGuestPrincipal();
  if (guest.localId !== localId) throw Error("GUEST_ADOPTION_TARGET_MISMATCH");
  const scope = { kind: "GUEST" as const, localId, generation };
  const recovery = await openGuestAdoptionRecovery(scope);
  const attempts = (await recovery.inspectPublicationRequests()).filter(
    (attempt) => attempt.preparation.targetAccountId === targetAccountId,
  );
  if (attempts.length !== 1) throw Error("GUEST_ADOPTION_PREFLIGHT_REQUIRED");
  const { preparation, preparationSha256 } = attempts[0];
  const binding = {
    sourceGuestLocalId: localId,
    targetAccountId,
    adoptionId: preparation.adoptionId,
  };
  const canonicalText = canonicalCoreJson(preparation as unknown as Json);
  const restored = await restoreGuestAdoption(
    await openDatabase(),
    createGuestAdoptionTransport(scope, binding),
    { contractVersion: 1, ...binding, inventorySha256: preparation.inventorySha256 },
    {
      canonicalText,
      sha256: preparationSha256,
      bytes: new TextEncoder().encode(canonicalText).byteLength,
    },
  );
  return { binding, qualifyLocalCache: restored.qualifyLocalCache };
}
