import { createUuid } from "@/domain/localId";
import { requireActiveUserId } from "../auth/authRepository";
import { readInitializedDatabase } from "../db/database";
import { createTripCoreV2Repository, type CoreDatabase } from "./tripCoreV2Repository";
import { tripCoreSha256Hex } from "./tripCoreSha256";
import { createManualItemRepository } from "./manualPlanRepository";
export {
  manualActivityFieldsSchema,
  manualActivityDetailsSchema,
  type ManualActivityFields,
} from "./manualPlanRepository";
export function createManualActivityRepository(
  database: CoreDatabase,
  account: () => Promise<string>,
  core: ReturnType<typeof createTripCoreV2Repository>,
  clock = () => new Date().toISOString(),
  newId = createUuid,
) {
  return createManualItemRepository("P6", database, account, core, clock, newId);
}
export async function createDefaultManualActivityRepository() {
  const database = await readInitializedDatabase();
  const core = createTripCoreV2Repository(
    database,
    requireActiveUserId,
    tripCoreSha256Hex,
  );
  return createManualActivityRepository(database, requireActiveUserId, core);
}
export type ManualActivityRepository = ReturnType<typeof createManualActivityRepository>;
export type ManualActivityDraft = Awaited<
  ReturnType<ManualActivityRepository["createDraft"]>
>;
export type ManualActivitySaveResult = Awaited<
  ReturnType<ManualActivityRepository["save"]>
>;
