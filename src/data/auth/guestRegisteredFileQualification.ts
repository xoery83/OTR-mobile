import { canonicalCoreJson, type Json } from "@/domain/trip/tripCoreV2Json";
import { tripCoreSha256Hex } from "../repositories/tripCoreSha256";
import type { GuestDraftScope } from "./guestDraftInventory";
import type { createGuestDatasetCensus } from "./guestDatasetCensus";
import type { createGuestCaptureInventory } from "./guestCaptureInventory";

// Explicit qualification, not inferred from future additions to census support.
const filelessTables = new Set([
  "schema_migrations",
  "sqlite_sequence",
  "local_trip_containers",
  "local_trip_destinations",
  "local_trip_ledger_bindings",
  "ledger_journeys",
  "ledger_members",
  "ledger_actor_context",
  "account_trip_cover_preferences",
  "sync_operations",
  "trip_core_pending_intents",
]);
export const guestFilelessCapabilityVersion =
  "otr.auth.guest-trip-p1-no-file-producers/1";
export const guestCensusTablesSha256 = (tables: unknown) =>
  tripCoreSha256Hex(new TextEncoder().encode(canonicalCoreJson(tables as Json)));

export async function readGuestRegisteredFileQualification(deps: {
  scope: GuestDraftScope;
  assertCurrent(): Promise<void>;
  readCensus: ReturnType<typeof createGuestDatasetCensus>;
  readCaptureInventory: ReturnType<typeof createGuestCaptureInventory>;
}) {
  await deps.assertCurrent();
  const census = await deps.readCensus();
  if (
    census.sqliteVersion !== 74 ||
    census.scope.localId !== deps.scope.localId ||
    census.scope.generation !== deps.scope.generation ||
    census.blockers.some(
      (blocker) => blocker !== "FILE_AND_LIVE_DRAFT_COLLECTORS_REQUIRED",
    ) ||
    census.tables.some((table) => table.rows > 0 && !filelessTables.has(table.name))
  )
    throw Error("GUEST_REGISTERED_FILES_QUALIFICATION_REQUIRED");
  const capture = await deps.readCaptureInventory();
  if (capture.totalPayloads !== 0 || capture.entries.length !== 0)
    throw Error("GUEST_REGISTERED_FILES_QUALIFICATION_REQUIRED");
  const sourceTablesSha256 = await guestCensusTablesSha256(census.tables);
  await deps.assertCurrent();
  return Object.freeze({
    schemaId: "otr.auth.guest-registered-file-qualification/1" as const,
    scope: deps.scope,
    capabilityVersion: guestFilelessCapabilityVersion,
    coverage: "CURRENT_GUEST_TRIP_P1_REGISTERED_FILES" as const,
    registeredFileCount: 0 as const,
    entries: Object.freeze([] as { id: string; sha256: string; bytes: number }[]),
    sourceTablesSha256,
    physicalDiskEmptyClaim: false as const,
    accountDirectoriesInspected: false as const,
  });
}
