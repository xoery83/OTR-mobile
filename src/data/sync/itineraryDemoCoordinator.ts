import { openDatabase } from "@/data/db/database";
import { createItineraryRepository } from "@/data/repositories/itineraryRepository";

import { createFakeItineraryTransport } from "./fakeItineraryTransport";
import { createItinerarySyncWorker } from "./itinerarySyncWorker";
import { createSyncEngine } from "./syncEngine";
import { createSyncOperationRepository } from "./syncOperationRepository";

const fakeTransport = createFakeItineraryTransport();

function nextAttemptAt(attemptCount: number) {
  return new Date(Date.now() + attemptCount * 30_000).toISOString();
}

export async function runItineraryDemoSync() {
  const database = await openDatabase();
  const itineraryRepository = createItineraryRepository(database);
  const operationRepository = createSyncOperationRepository(database);
  const worker = createItinerarySyncWorker(itineraryRepository, fakeTransport);
  const itineraryEngine = createSyncEngine(
    operationRepository,
    worker,
    nextAttemptAt,
    (operation) =>
      operation.entityType === "itinerary" &&
      operation.operationType === "CREATE_ITINERARY",
  );

  // This is a deliberate development harness, not a production auth bypass.
  return itineraryEngine.run("AUTHENTICATED_ONLINE");
}

export function failNextItineraryDemoSync() {
  fakeTransport.failNextCreate();
}
