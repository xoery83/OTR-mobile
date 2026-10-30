import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { session } from "../../../../backend/src/__fixtures__/tripCoreV2Sql";
import { publishGuestAdoptionPg } from "../../../../backend/src/guestAdoptionPublicationPg";
import { createGuestAdoptionTerminalPg } from "../../../../backend/src/guestAdoptionTerminalPg";
import { qualifyGuestAdoptionReceiptForRecovery } from "../../../../src/data/auth/guestAdoptionReceiptQualification";
import { tripCoreSha256Hex } from "../../../../src/data/repositories/tripCoreSha256";
import {
  withCorePgStorageTransaction,
  type CorePgConnection,
} from "../../../../backend/src/tripCoreV2PgStorage";
import { withTripPgStorageOnTransaction } from "../../../../backend/src/tripCreatePgStorage";
import { withTripMetadataV2PgStorageOnTransaction } from "../../../../backend/src/tripMetadataV2PgStorage";
import { withTripPersonCloudCreateOnTransaction } from "../../../../backend/src/tripPersonCloudCreatePg";
import { verifyGuestSourceCheckpoint } from "../../../../src/data/auth/guestTripP1SourceSchema";
import { guestAdoptionPreparationSchema } from "../../../../src/data/auth/guestAdoptionPreparation";
import { tripMetadataRevisionedSnapshotSchema } from "../../../../src/domain/trip/tripMetadataV2Contract";
const [container, database, path, mode] = process.argv.slice(2);
assert(["missing-core", "rollback", "unknown", "commit"].includes(mode));
const m = JSON.parse(readFileSync(path, "utf8"));
const { resources: _resources, ...binding } = m.fixture.request;
const request = { ...binding, planSha256: m.plan.sha256 },
  signal = new AbortController().signal;
const ordinary: CorePgConnection = {
  async withLease(work) {
    const handle = session(container, { database });
    try {
      return await work(handle.lease);
    } finally {
      handle.close();
    }
  },
};
let commitCalls = 0,
  commitCompleted = false;
let realCommitError: unknown;
let postFinalDenied = false;
const connection: CorePgConnection = {
  async withLease(work) {
    return ordinary.withLease((lease) =>
      work({
        retire: () => lease.retire(),
        async query(sql, params) {
          if (sql === "COMMIT") {
            commitCalls++;
            if (mode === "rollback") throw Error("EXPECTED_BEFORE_COMMIT_FAILURE");
            if (mode === "unknown") {
              const original = JSON.parse(
                JSON.parse(m.fixture.checkpoint.canonicalText).source.canonicalText,
              ).trips[0];
              const person = original.people[0],
                action = original.deferredMetadata[0],
                actor = binding.targetAccountId;
              const probes: [string, unknown[]][] = [
                [
                  "trip_create_command",
                  [
                    original.create.operationId,
                    actor,
                    original.create.tripId,
                    JSON.stringify(original.create),
                  ],
                ],
                [
                  "trip_metadata_update_command",
                  [
                    action.operationId,
                    actor,
                    original.create.tripId,
                    JSON.stringify({
                      formatVersion: 3,
                      operationId: action.operationId,
                      tripId: original.create.tripId,
                      expectedMetadataRevision: 0,
                      before: action.before,
                      after: action.after,
                    }),
                  ],
                ],
                [
                  "trip_person_cloud_create_command",
                  [
                    actor,
                    original.create.tripId,
                    person.operationId,
                    JSON.stringify({
                      version: 1,
                      operationId: person.operationId,
                      personId: person.personId,
                      tripId: original.create.tripId,
                      tripCreateOperationId: original.create.operationId,
                      dataOwnership: "CLOUD_SHARED_AUTHORED",
                      displayName: person.displayName,
                    }),
                  ],
                ],
              ];
              for (const [name, args] of probes)
                await lease.query(
                  `DO $probe$ BEGIN BEGIN
                PERFORM public.${name}($1::uuid,$2::uuid,$3::uuid,$4::jsonb);
                RAISE EXCEPTION 'POST_FINAL_MUTATION_ALLOWED';
                EXCEPTION WHEN insufficient_privilege THEN
                  IF SQLERRM IS DISTINCT FROM 'AUTH_ADOPTION_OPERATION_ALREADY_FINALIZED' THEN RAISE; END IF;
                END; END $probe$`,
                  args,
                );
              const allowed = await lease.query(
                "SELECT otr_auth_guest_composite.scope_allowed($1::uuid,$2::uuid,$3::uuid,'CORE') AS allowed",
                [actor, original.create.tripId, "11111111-1111-4111-8111-111111111111"],
              );
              assert.equal(allowed.rows[0]?.allowed, false);
              await lease.query("SET LOCAL ROLE otr_trip_core_v2_writer");
              try {
                await lease.query(
                  `DO $probe$ BEGIN BEGIN
                  UPDATE public.itinerary_events SET title='post-final forbidden change' WHERE id=$1::uuid;
                  RAISE EXCEPTION 'POST_FINAL_CORE_DML_ALLOWED';
                  EXCEPTION WHEN insufficient_privilege THEN
                    IF SQLERRM IS DISTINCT FROM 'AUTH_ADOPTION_MUTATION_ALREADY_FINALIZED' THEN RAISE; END IF;
                  END; END $probe$`,
                  [original.coreIntents[0].command.target.id],
                );
              } catch (error) {
                realCommitError = error;
                throw error;
              }
              await lease.query("SET LOCAL ROLE otr_trip_core_v2_gateway");
              postFinalDenied = true;
            }
            let result;
            try {
              result = await lease.query(sql, params);
              commitCompleted = true;
            } catch (error) {
              realCommitError = error;
              throw error;
            }
            if (mode === "unknown") throw Error("EXPECTED_COMMIT_REPLY_LOST");
            return result;
          }
          return lease.query(sql, params);
        },
      }),
    );
  },
};
if (mode === "missing-core") {
  const preparation = guestAdoptionPreparationSchema.parse(
    JSON.parse(m.fixture.checkpoint.canonicalText),
  );
  const source = await verifyGuestSourceCheckpoint(preparation.source!, preparation);
  await assert.rejects(
    withCorePgStorageTransaction(
      ordinary,
      tripCoreSha256Hex,
      async (context) => {
        const actor = m.fixture.user.id;
        await context.lease.query(
          "SELECT otr_auth_guest_composite.begin_scope($1::uuid,$2::uuid,$3::text)",
          [actor, binding.adoptionId, m.plan.sha256],
        );
        await withTripPgStorageOnTransaction(context.lease, async (trips) => {
          for (const t of source.trips) await trips.create(actor, t.create);
        });
        await withTripPersonCloudCreateOnTransaction(context.lease, async (people) => {
          for (const t of source.trips)
            for (const p of t.people)
              await people.create(actor, {
                version: 1,
                operationId: p.operationId,
                personId: p.personId,
                tripId: t.create.tripId,
                tripCreateOperationId: t.create.operationId,
                dataOwnership: "CLOUD_SHARED_AUTHORED",
                displayName: p.displayName,
              });
        });
        await withTripMetadataV2PgStorageOnTransaction(
          context.lease,
          async (metadata) => {
            for (const t of source.trips)
              for (const a of t.deferredMetadata) {
                const snapshot = tripMetadataRevisionedSnapshotSchema.parse(
                  await metadata.snapshot(actor, t.create.tripId, a.operationId),
                );
                await metadata.update(actor, {
                  formatVersion: 3,
                  operationId: a.operationId,
                  tripId: t.create.tripId,
                  expectedMetadataRevision: snapshot.metadataRevision,
                  before: a.before,
                  after: a.after,
                });
              }
          },
        );
        await context.lease.query(
          "SELECT otr_auth_guest_composite.publish($1::uuid,$2::jsonb,$3::text)",
          [actor, JSON.stringify(binding), m.plan.sha256],
        );
      },
      undefined,
      { sustainedDev: true },
    ),
    /AUTH_ADOPTION_CORE_RECEIPT_REQUIRED/,
  );
  process.stdout.write(JSON.stringify({ mode, outcome: "REJECTED_WITHOUT_CORE" }));
} else if (mode === "rollback" || mode === "unknown") {
  await assert.rejects(
    publishGuestAdoptionPg(connection, m.fixture.user, request, signal),
    /GUEST_ADOPTION_PUBLICATION_OUTCOME_UNKNOWN/,
  );
  assert.equal(commitCalls, 1);
  if (mode === "unknown") {
    assert.equal(realCommitError, undefined);
    assert.equal(commitCompleted, true);
    assert.equal(postFinalDenied, true);
  }
  process.stdout.write(
    JSON.stringify({
      mode,
      outcome: "UNKNOWN",
      commitCalls,
      actualCommit: commitCompleted,
      postFinalDenied,
    }),
  );
} else {
  const receipt = await publishGuestAdoptionPg(
    connection,
    m.fixture.user,
    request,
    signal,
  );
  assert.equal(receipt.outcome, "PUBLISHED");
  const port = createGuestAdoptionTerminalPg(ordinary),
    status = await port.readStatus(binding.targetAccountId, binding, signal);
  const qualified = await qualifyGuestAdoptionReceiptForRecovery(
    receipt,
    m.fixture.checkpoint,
    binding,
    status,
    tripCoreSha256Hex,
  );
  assert.equal(qualified.authority, "NONE");
  assert.equal(qualified.nextAction, "VERIFY_PUBLISHED_READBACK");
  assert.deepEqual(
    await port.readReceipt(
      binding.targetAccountId,
      { ...binding, receiptId: receipt.receiptId, receiptSha256: receipt.receiptSha256 },
      signal,
    ),
    receipt,
  );
  assert.deepEqual(
    await publishGuestAdoptionPg(ordinary, m.fixture.user, request, signal),
    receipt,
  );
  await assert.rejects(
    port.cancel(binding.targetAccountId, binding, signal),
    /CANCELLATION_OUTCOME_INVALID/,
  );
  process.stdout.write(
    JSON.stringify({
      mode,
      outcome: receipt.outcome,
      receiptId: receipt.receiptId,
      receiptSha256: receipt.receiptSha256,
      trips: receipt.outcome === "PUBLISHED" ? receipt.trips.length : 0,
      authority: "NONE",
      localRestoreStatus: "REQUIRED_NOT_EXECUTED",
    }),
  );
}
