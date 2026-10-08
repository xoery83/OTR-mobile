import { z } from "zod";
import { tripImportSnapshotSchema } from "../../src/data/api/tripImportCatalogContracts";
import { canonicalEventJson, type Json } from "../../src/domain/trip/eventIntentJson";
import { createRequestBoundary } from "../../src/data/api/requestBoundary";

export class PublicationCatalogError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
  ) {
    super("Publication catalog read is unavailable.");
  }
}
export type PublicationAuthResult =
  | { disposition: "VERIFIED"; user: { id: string } }
  | { disposition: "REJECTED" }
  | { disposition: "UNAVAILABLE" };

// The injected driver must lease one primary session and retire it on uncertain cleanup.
export type PublicationCatalogLease = {
  query(
    sql: string,
    parameters: readonly string[],
    signal?: AbortSignal,
  ): Promise<{ rows: Record<string, unknown>[] }>;
};
export type PublicationCatalogConnection = {
  withLease<T>(
    work: (lease: PublicationCatalogLease) => Promise<T>,
    signal: AbortSignal,
  ): Promise<T>;
};
const unavailable = () =>
  new PublicationCatalogError(503, "PUBLICATION_MEMBERSHIP_TRANSPORT_UNAVAILABLE");
export function publicationCatalogBody(
  raw: unknown,
  actor: string,
  trip: string,
): string {
  if (
    raw &&
    typeof raw === "object" &&
    Object.values(raw).some((v) => Array.isArray(v) && v.length > 64)
  )
    throw new PublicationCatalogError(503, "IMPORT_READ_RESOURCE_LIMIT");
  const parsed = tripImportSnapshotSchema.safeParse(raw);
  if (
    !parsed.success ||
    parsed.data.actor_account_id !== actor ||
    parsed.data.trip_id !== trip
  )
    throw new PublicationCatalogError(503, "PUBLICATION_MEMBERSHIP_INTEGRITY");
  const body = canonicalEventJson(parsed.data as Json);
  if (Buffer.byteLength(body, "utf8") > 4194304)
    throw new PublicationCatalogError(503, "IMPORT_READ_RESOURCE_LIMIT");
  return body;
}
export async function readPublicationCatalog(
  connection: PublicationCatalogConnection | undefined,
  actor: string,
  trip: string,
  signal: AbortSignal,
) {
  if (
    !connection ||
    !z.uuid().safeParse(actor).success ||
    !z.uuid().safeParse(trip).success
  )
    throw unavailable();
  const boundary = createRequestBoundary(5000, signal);
  try {
    return await boundary.run(() =>
      connection.withLease(async (lease) => {
        let began = false;
        try {
          await boundary.run(() =>
            lease.query(
              "BEGIN ISOLATION LEVEL READ COMMITTED READ ONLY",
              [],
              boundary.signal,
            ),
          );
          began = true;
          await boundary.run(() =>
            lease.query("SET LOCAL statement_timeout = '5000ms'", [], boundary.signal),
          );
          await boundary.run(() =>
            lease.query("SET LOCAL lock_timeout = '1000ms'", [], boundary.signal),
          );
          const identity = await boundary.run(() =>
            lease.query("SELECT session_user AS principal", [], boundary.signal),
          );
          if (
            identity.rows.length !== 1 ||
            identity.rows[0].principal !== "otr_trip_source_command_gateway"
          )
            throw unavailable();
          const result = await boundary.run(() =>
            lease.query(
              "SELECT public.trip_source_read_import_catalogs($1::uuid,$2::uuid) AS catalog",
              [actor, trip],
              boundary.signal,
            ),
          );
          if (result.rows.length !== 1) throw unavailable();
          const body = publicationCatalogBody(result.rows[0].catalog, actor, trip);
          await boundary.run(() => lease.query("COMMIT", [], boundary.signal));
          began = false;
          return body;
        } finally {
          // Cleanup never reuses an aborted query signal; the driver must destroy a stuck lease.
          if (began) await lease.query("ROLLBACK", []);
        }
      }, boundary.signal),
    );
  } catch (error) {
    if (error instanceof PublicationCatalogError) throw error;
    const row = error as { code?: string; message?: string };
    if (row.code === "42501" && row.message === "FORBIDDEN")
      throw new PublicationCatalogError(403, "TRIP_READ_FORBIDDEN");
    if (row.message === "IMPORT_READ_RESOURCE_LIMIT")
      throw new PublicationCatalogError(503, "IMPORT_READ_RESOURCE_LIMIT");
    throw unavailable();
  } finally {
    boundary.close();
  }
}
