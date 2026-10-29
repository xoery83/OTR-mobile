import { z } from "zod";
import { coreUuid } from "@/domain/trip/tripCoreV2";
import type { createGuestHandoffInventory } from "./guestHandoffInventory";
import {
  openGuestAdoptionRecovery,
  type createGuestAdoptionRecovery,
} from "./guestAdoptionRecovery";

type Inventory = Awaited<ReturnType<ReturnType<typeof createGuestHandoffInventory>>>;
const targetSchema = z.strictObject({ adoptionId: coreUuid, targetAccountId: coreUuid });

// Local preparation only: neither a server preflight nor permission to upload/install Session.
export async function prepareGuestHandoffCheckpoint(
  inventory: Inventory,
  input: z.input<typeof targetSchema>,
  openRecovery: (
    scope: Inventory["scope"],
  ) => Promise<
    Pick<ReturnType<typeof createGuestAdoptionRecovery>, "prepare">
  > = openGuestAdoptionRecovery,
) {
  const target = targetSchema.parse(input);
  await inventory.assertCurrent();
  const recovery = await openRecovery(inventory.scope);
  await inventory.assertCurrent();
  const source = inventory.source;
  const result = await recovery.prepare({
    schemaId: "otr.auth.guest-adoption-recovery/3",
    sourceKind: "GUEST",
    sourceGuestLocalId: inventory.scope.localId,
    ...target,
    checkpoint: "PREPARED",
    inventorySha256: inventory.census.inventorySha256!,
    tripIds: [...inventory.census.tripIds],
    drafts: [...inventory.drafts],
    source: {
      canonicalText: source.canonicalText,
      sha256: source.sha256,
      bytes: new TextEncoder().encode(source.canonicalText).byteLength,
    },
  });
  await inventory.assertCurrent();
  if (!result || result.nextAction !== "RESUME_PREFLIGHT")
    throw Error("GUEST_HANDOFF_CHECKPOINT_RECOVERY_REQUIRED");
  return result;
}
