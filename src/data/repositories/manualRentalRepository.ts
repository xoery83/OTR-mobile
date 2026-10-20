import { createUuid } from "@/domain/localId";
import { requireActiveUserId } from "../auth/authRepository";
import { readInitializedDatabase } from "../db/database";
import { createTripCoreV2Repository, type CoreDatabase } from "./tripCoreV2Repository";
import { tripCoreSha256Hex } from "./tripCoreSha256";
import { createManualItemRepository } from "./manualPlanRepository";
export {
  manualRentalFieldsSchema,
  manualRentalDetailsSchema,
  type ManualRentalFields,
} from "./manualPlanRepository";
export function createManualRentalRepository(
  database: CoreDatabase,
  account: () => Promise<string>,
  core: ReturnType<typeof createTripCoreV2Repository>,
  clock = () => new Date().toISOString(),
  newId = createUuid,
) {
  return createManualItemRepository("P4", database, account, core, clock, newId);
}
export async function createDefaultManualRentalRepository() {
  const database = await readInitializedDatabase();
  return createManualRentalRepository(
    database,
    requireActiveUserId,
    createTripCoreV2Repository(database, requireActiveUserId, tripCoreSha256Hex),
  );
}
export type ManualRentalRepository = ReturnType<typeof createManualRentalRepository>;
export type ManualRentalDraft = Awaited<
  ReturnType<ManualRentalRepository["createDraft"]>
>;
export type ManualRentalSaveResult = Awaited<ReturnType<ManualRentalRepository["save"]>>;
