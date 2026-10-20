import { requireActiveUserId } from "@/data/auth/authRepository";
import { openDatabase } from "@/data/db/database";
import { createTripDayReadRepository } from "./tripDayReadRepository";

// Integration must register SQLite 47 before this factory can be activated.
export async function getDefaultTripDayReadRepository() {
  return createTripDayReadRepository(await openDatabase(), requireActiveUserId);
}
