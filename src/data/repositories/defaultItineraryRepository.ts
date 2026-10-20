import { openDatabase } from "@/data/db/database";
import { requireActiveUserId } from "@/data/auth/authRepository";

import { createItineraryRepository } from "./itineraryRepository";

export async function getDefaultItineraryRepository() {
  return createItineraryRepository(await openDatabase(), requireActiveUserId);
}
