import { readLocalSession } from "@/data/auth/authRepository";
import { openDatabase } from "@/data/db/database";
import { createItineraryRepository } from "@/data/repositories/itineraryRepository";

import { createItinerarySyncWorker } from "./itinerarySyncWorker";
import { createSyncEngine } from "./syncEngine";
import { createSyncOperationRepository } from "./syncOperationRepository";
import {
  fakeItineraryTransport,
  getItineraryCreateTransport,
  getSyncTransportMode,
} from "./transportSelection";

function nextAttemptAt(attemptCount: number) {
  return new Date(Date.now() + attemptCount * 30_000).toISOString();
}

export async function runItineraryDemoSync() {
  const database = await openDatabase();
  const itineraryRepository = createItineraryRepository(database);
  const operationRepository = createSyncOperationRepository(database);
  const worker = createItinerarySyncWorker(
    itineraryRepository,
    getItineraryCreateTransport(),
  );
  const itineraryEngine = createSyncEngine(
    operationRepository,
    worker,
    nextAttemptAt,
    (operation) =>
      operation.entityType === "itinerary" &&
      operation.operationType === "CREATE_ITINERARY",
  );

  // This is a deliberate development harness, not a production auth bypass.
  const session =
    getSyncTransportMode() === "dev" ? await readLocalSession() : { accessToken: "fake" };
  return itineraryEngine.run(
    session?.accessToken ? "AUTHENTICATED_ONLINE" : "AUTHENTICATED_OFFLINE",
  );
}

export function failNextItineraryDemoSync() {
  if (getSyncTransportMode() === "fake") fakeItineraryTransport.failNextCreate();
}
