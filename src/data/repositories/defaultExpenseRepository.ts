import { openDatabase } from "@/data/db/database";
import { requireActiveUserId } from "@/data/auth/authRepository";

import { createExpenseRepository } from "./expenseRepository";

export async function getDefaultExpenseRepository() {
  return createExpenseRepository(await openDatabase(), requireActiveUserId);
}
