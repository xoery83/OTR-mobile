import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { createTripRepository } from "../../src/data/repositories/tripRepository";
import { createTripCoreV2Repository } from "../../src/data/repositories/tripCoreV2Repository";
import { tripCoreSha256Hex } from "../../src/data/repositories/tripCoreSha256";
import { openQaDatabase } from "./c-execution/headless";
import { tripCreateWireRequestSchema } from "../../src/domain/trip/tripCreateWireContract";
import { tripMetadataWireUpdateSchema } from "../../src/domain/trip/tripMetadataV2Contract";
const A = "10000000-0000-4000-8000-000000000001",
  B = "10000000-0000-4000-8000-000000000002",
  trip = "10000000-0000-4000-8000-000000000003",
  createOp = "10000000-0000-4000-8000-000000000004",
  editOp = "10000000-0000-4000-8000-000000000005";
const d1 = {
  destinationId: "10000000-0000-4000-8000-000000000006",
  displayLabel: "Auckland",
  source: "MANUAL" as const,
};
const d2 = {
  destinationId: "10000000-0000-4000-8000-000000000007",
  displayLabel: "Nelson",
  source: "APPLE_PLACE_ID" as const,
  provider: "apple" as const,
  providerPlaceId: "apple-approved-id",
};
test("explicit structured operations retain list/order/IDs/confirmed receipts across real SQLite reopen and account fences", async () => {
  const dir = mkdtempSync("/private/tmp/otr-c-qa-structured-");
  let db = await openQaDatabase(dir + "/qa-state.sqlite");
  let actor = A;
  const account = async () => actor;
  const make = () =>
    createTripRepository(
      db.database,
      account,
      createTripCoreV2Repository(db.database, account, tripCoreSha256Hex),
      () => new Date().toISOString(),
      async () => "Fixture",
    );
  let repo = make();
  try {
    await repo.createTrip({
      syncFormatVersion: 2,
      tripId: trip,
      operationId: createOp,
      name: "New QA",
      destinations: [d1, d2],
    });
    const raw = db.sql
      .prepare("SELECT payload_json FROM sync_operations WHERE id=?")
      .get(createOp)!;
    const request = tripCreateWireRequestSchema.parse({
      ...JSON.parse(String(raw.payload_json)),
      operationId: createOp,
    });
    assert.equal("formatVersion" in request ? request.formatVersion : 1, 2);
    assert.deepEqual("destinations" in request ? request.destinations : [], [d1, d2]);
    const original = {
      ...request,
      actorAccountId: A,
      ownerPersonId: "10000000-0000-4000-8000-000000000008",
      coreEpoch: "10000000-0000-4000-8000-000000000009",
      coreRevision: 1,
      coreAccessRevision: 1,
      metadataRevision: 0,
    };
    await repo.acceptCreate(original);
    const base = (await repo.readMetadataEditBase(trip)).confirmed!;
    assert.equal(base.metadataRevision, 0);
    assert.deepEqual(base.metadata.destinations, [d1, d2]);
    const after = {
      ...base.metadata,
      name: "Edited QA",
      destinations: [{ ...d2, displayLabel: "Nelson updated" }, d1],
    };
    const edit = tripMetadataWireUpdateSchema.parse({
      formatVersion: 3,
      operationId: editOp,
      tripId: trip,
      expectedMetadataRevision: 0,
      before: base.metadata,
      after,
    });
    await repo.updateMetadata(edit);
    assert.deepEqual(
      (await repo.getTrip(trip))?.destinations?.map((d) => d.destinationId),
      [d2.destinationId, d1.destinationId],
    );
    assert.deepEqual((await repo.readMetadataEditBase(trip)).pendingOperationIds, [
      editOp,
    ]);
    assert.equal((await repo.readMetadataEditBase(trip)).confirmed?.metadataRevision, 0);
    db.close();
    db = await openQaDatabase(dir + "/qa-state.sqlite");
    repo = make();
    assert.deepEqual(
      (await repo.getTrip(trip))?.destinations?.map((d) => d.destinationId),
      [d2.destinationId, d1.destinationId],
    );
    assert.equal((await repo.readMetadataEditBase(trip)).confirmed?.metadataRevision, 0);
    await repo.acceptMetadataUpdate({
      ...edit,
      actorAccountId: A,
      resultMetadataRevision: 1,
    });
    await repo.acceptMetadataUpdate({
      ...edit,
      actorAccountId: A,
      resultMetadataRevision: 1,
    });
    assert.equal((await repo.readMetadataEditBase(trip)).confirmed?.metadataRevision, 1);
    assert.deepEqual((await repo.readMetadataEditBase(trip)).pendingOperationIds, []);
    await repo.acceptCreate(original);
    assert.deepEqual(
      (await repo.getTrip(trip))?.destinations?.map((d) => d.destinationId),
      [d2.destinationId, d1.destinationId],
    );
    assert.equal((await repo.readMetadataEditBase(trip)).confirmed?.metadataRevision, 1);
    await assert.rejects(
      () =>
        repo.updateMetadata({
          operationId: "10000000-0000-4000-8000-000000000010",
          tripId: trip,
          before: { name: after.name, destination: null, startDate: null, endDate: null },
          after: {
            name: "Old client",
            destination: "flattened",
            startDate: null,
            endDate: null,
          },
        }),
      /TRIP_STRUCTURED_WIRE_VERSION_REQUIRED/,
    );
    const confirmed1 = (await repo.readMetadataEditBase(trip)).confirmed!;
    // Fixture-only removal of rebuildable rows; no Auth/operations/receipt data removed.
    db.sql
      .prepare("DELETE FROM local_trip_destinations WHERE account_id=? AND trip_id=?")
      .run(A, trip);
    await repo.retainMetadataSnapshot(confirmed1, "10000000-0000-4000-8000-000000000011");
    assert.deepEqual(
      (await repo.getTrip(trip))?.destinations?.map((d) => d.destinationId),
      [d2.destinationId, d1.destinationId],
    );
    db.close();
    db = await openQaDatabase(dir + "/qa-state.sqlite");
    repo = make();
    assert.deepEqual(
      (await repo.getTrip(trip))?.destinations?.map((d) => d.destinationId),
      [d2.destinationId, d1.destinationId],
    );
    const pendingOp = "10000000-0000-4000-8000-000000000012";
    const dirty = {
      formatVersion: 3 as const,
      operationId: pendingOp,
      tripId: trip,
      expectedMetadataRevision: 1,
      before: confirmed1.metadata,
      after: { ...confirmed1.metadata, name: "Unsynced preserved", destinations: [d1] },
    };
    await repo.updateMetadata(dirty);
    const newServer = {
      ...confirmed1,
      metadataRevision: 2,
      metadata: {
        ...confirmed1.metadata,
        name: "Different canonical",
        destinations: [d2],
      },
    };
    await repo.retainMetadataSnapshot(newServer, "10000000-0000-4000-8000-000000000013");
    assert.equal((await repo.getTrip(trip))?.name, "Unsynced preserved");
    assert.deepEqual(
      (await repo.getTrip(trip))?.destinations?.map((d) => d.destinationId),
      [d1.destinationId],
    );
    assert.equal((await repo.readMetadataEditBase(trip)).confirmed?.metadataRevision, 2);
    assert.deepEqual((await repo.readMetadataEditBase(trip)).pendingOperationIds, [
      pendingOp,
    ]);
    await repo.retainMetadataSnapshot(confirmed1, "10000000-0000-4000-8000-000000000014");
    assert.equal((await repo.readMetadataEditBase(trip)).confirmed?.metadataRevision, 2);
    assert.equal((await repo.getTrip(trip))?.name, "Unsynced preserved");
    actor = B;
    assert.equal((await repo.readMetadataEditBase(trip)).confirmed, null);
    assert.equal(await repo.getTrip(trip), null);
  } finally {
    db.close();
    rmSync(dir, { recursive: true });
  }
});
