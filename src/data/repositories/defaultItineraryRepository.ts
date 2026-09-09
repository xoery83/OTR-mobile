import { openDatabase } from "@/data/db/database";

import { createItineraryRepository } from "./itineraryRepository";

export async function getDefaultItineraryRepository() {
  return createItineraryRepository(await openDatabase());
}
