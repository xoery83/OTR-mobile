import { requireActiveUserId } from "@/data/auth/authRepository";
import { openDatabase } from "@/data/db/database";

import { createPersonalSettlementReviewRepository } from "./personalSettlementReviewRepository";

export async function getDefaultPersonalSettlementReviewRepository() {
  return createPersonalSettlementReviewRepository(
    await openDatabase(),
    requireActiveUserId,
  );
}
