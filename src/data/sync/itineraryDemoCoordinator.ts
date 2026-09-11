import { openDatabase } from "@/data/db/database";
import { createItineraryRepository } from "@/data/repositories/itineraryRepository";

import { createItinerarySyncWorker } from "./itinerarySyncWorker";
import { createSyncEngine } from "./syncEngine";
import { createSyncOperationRepository } from "./syncOperationRepository";
import { fakeItineraryTransport } from "./transportSelection";

function nextAttemptAt(attemptCount: number) {
  return new Date(Date.now() + attemptCount * 30_000).toISOString();
}

export async function runItineraryDemoSync() {
  const database = await openDatabase();
  const itineraryRepository = createItineraryRepository(database);
  const operationRepository = createSyncOperationRepository(database);
  const worker = createItinerarySyncWorker(itineraryRepository, fakeItineraryTransport);
  const itineraryEngine = createSyncEngine(
    operationRepository,
    worker,
    nextAttemptAt,
    (operation) =>
      operation.entityType === "itinerary" &&
      operation.operationType === "CREATE_ITINERARY",
  );

  // This is a deliberate Stage 2 validation harness, not a production auth bypass.
  return itineraryEngine.run("AUTHENTICATED_ONLINE");
}

export function failNextItineraryDemoSync() {
  fakeItineraryTransport.failNextCreate();
}
