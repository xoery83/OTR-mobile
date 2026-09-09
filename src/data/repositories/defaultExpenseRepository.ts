import { openDatabase } from "@/data/db/database";

import { createExpenseRepository } from "./expenseRepository";

export async function getDefaultExpenseRepository() {
  return createExpenseRepository(await openDatabase());
}
