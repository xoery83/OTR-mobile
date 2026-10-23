import { canonicalEventJson, type Json } from "../../src/domain/trip/eventIntentJson";
import { universalImportSnapshotSchema } from "../../src/data/api/tripImportCatalogContracts";
import type { Task } from "../../src/domain/intelligence/persistence";
import {
  readPublicationCatalog,
  type PublicationCatalogConnection,
} from "./tripPublicationCatalogRead";

// Same owning generic catalog and canonical cache; only the initial Run state view is V2.
export async function readUniversalCatalog(
  connection: PublicationCatalogConnection,
  task: Task,
  signal: AbortSignal,
) {
  if (!task.trip_id || !task.run_id) throw Error("UNIVERSAL_CATALOG_SCOPE");
  return readPublicationCatalog(
    connection,
    task.account_id,
    task.trip_id,
    signal,
    (raw, actor, trip) => {
      const snapshot = universalImportSnapshotSchema.parse({
        ...(raw as object),
        version: 2,
      });
      if (snapshot.actor_account_id !== actor || snapshot.trip_id !== trip)
        throw Error("UNIVERSAL_CATALOG_SCOPE");
      const runs = snapshot.trip_source_runs as { id: string; generation: number }[];
      if (
        !runs.some(
          (r) => r.id === task.run_id && r.generation === task.expected_run_generation,
        )
      )
        throw Error("UNIVERSAL_CATALOG_RUN_UNAVAILABLE");
      const body = canonicalEventJson(snapshot as Json);
      if (Buffer.byteLength(body) > 4194304) throw Error("IMPORT_READ_RESOURCE_LIMIT");
      return body;
    },
  );
}
