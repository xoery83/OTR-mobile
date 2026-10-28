import { createUuid } from "@/domain/localId";
import { requireActiveUserId } from "../auth/authRepository";
import { readInitializedDatabase } from "../db/database";
import { createTripCoreV2Repository, type CoreDatabase } from "./tripCoreV2Repository";
import { tripCoreSha256Hex } from "./tripCoreSha256";
import { createManualItemRepository } from "./manualPlanRepository";
export {
  manualStayFieldsSchema,
  manualStayDetailsSchema,
  type ManualStayFields,
} from "./manualPlanRepository";
export function createManualStayRepository(
  database: CoreDatabase,
  account: () => Promise<string>,
  core: ReturnType<typeof createTripCoreV2Repository>,
  clock = () => new Date().toISOString(),
  newId = createUuid,
) {
  return createManualItemRepository("P3", database, account, core, clock, newId);
}
export async function createDefaultManualStayRepository() {
  const database = await readInitializedDatabase();
  const core = createTripCoreV2Repository(
    database,
    requireActiveUserId,
    tripCoreSha256Hex,
  );
  return createManualStayRepository(database, requireActiveUserId, core);
}
export type ManualStayRepository = ReturnType<typeof createManualStayRepository>;
export type ManualStayDraft = Awaited<ReturnType<ManualStayRepository["createDraft"]>>;
export type ManualStaySaveResult = Awaited<ReturnType<ManualStayRepository["save"]>>;
