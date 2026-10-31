import { instantMicroseconds } from "../src/domain/trip/dayReadModel";
import { coreHashValue } from "../src/domain/trip/tripCoreV2Read";
import assert from "node:assert/strict";
import { z } from "zod";
import { validateCoreReceipt } from "../src/domain/trip/tripCoreV2Receipt";
import {
  coreStoredBoundary,
  normalizeCoreClock,
  type CoreBoundary,
} from "../src/domain/trip/tripCoreV2Temporal";
import { corePayloadSchemas } from "../src/domain/trip/tripCoreV2Commands";
import { sha, contentDigest, type PreparedMutation } from "./mutation";
function expectedFields(
  actual: Record<string, unknown> | null | undefined,
  expected: Record<string, unknown>,
) {
  assert(actual, "INDEPENDENT_TYPED_ROW_MISSING");
  for (const [key, value] of Object.entries(expected)) {
    const clock = key.startsWith("permitted_");
    assert.deepEqual(
      clock && typeof actual[key] === "string"
        ? normalizeCoreClock(actual[key] as string, -1)
        : actual[key],
      clock && typeof value === "string" ? normalizeCoreClock(value, -1) : value,
      "INDEPENDENT_EXPECTED_FIELD_MISMATCH:" + key,
    );
  }
}
function expectedBoundary(
  actual: Record<string, unknown>,
  expected: CoreBoundary,
  role?: "start" | "end",
) {
  const stored = coreStoredBoundary(actual, role);
  expectedFields(stored, {
    ...expected,
    local_time: expected.local_time
      ? normalizeCoreClock(expected.local_time, expected.clock_precision!)
      : null,
  });
}
export async function verifyGoldenReadback(
  raw: unknown,
  prepared: PreparedMutation,
  accountId: string,
) {
  assert.equal(prepared.kind, "ITEM");
  if (prepared.kind !== "ITEM") throw Error("ITEM_EXPECTED");
  const parsed = z
    .object({
      rows: z
        .array(
          z.object({
            evidence: z.object({
              itemCount: z.number(),
              items: z.array(z.record(z.string(), z.unknown())),
              stay: z.record(z.string(), z.unknown()).nullable(),
              receipt: z.unknown(),
              transportEndpoints: z.array(z.record(z.string(), z.unknown())).optional(),
              transportServices: z.array(z.record(z.string(), z.unknown())).optional(),
              operationalFacts: z.array(z.record(z.string(), z.unknown())).optional(),
              rental: z.record(z.string(), z.unknown()).nullable().optional(),
              rentalPlaces: z.array(z.record(z.string(), z.unknown())).optional(),
            }),
          }),
        )
        .length(1),
    })
    .parse(raw);
  const evidence = parsed.rows[0].evidence;
  assert.equal(evidence.itemCount, 1);
  assert.equal(evidence.items.length, 1);
  const row = evidence.items[0],
    p = prepared.command;
  const receipt = await validateCoreReceipt(evidence.receipt, async (bytes) =>
    sha(bytes),
  );
  assert.equal(receipt.operationId, p.operationId);
  assert.equal(receipt.actorAccountId, accountId);
  assert.equal(receipt.tripId, p.tripId);
  assert.equal(receipt.outcome, "APPLIED");
  assert.equal(
    receipt.intentSha256,
    await coreHashValue("otr-trip-core-intent-v2", p, async (bytes) => sha(bytes)),
  );
  const committed = receipt.targetVector.find(
    (v) => v.kind === "ITEM" && v.id === p.target.id,
  )?.committedRevision;
  assert(committed);
  const historical = Number(row.semantic_revision) > committed;
  const audit = z
    .record(z.string(), z.unknown())
    .parse(
      receipt.audit.after.find((v) => v.kind === "ITEM" && v.id === p.target.id)?.facts,
    );
  assert.equal(audit.id, p.target.id);
  assert.equal(audit.owner_account_id, accountId);
  assert.equal(audit.trip_id, p.tripId);
  if (p.command === "CREATE_ITEM") {
    const payload = corePayloadSchemas.CREATE_ITEM.parse(p.payload);

    assert.equal(audit.title, payload.core.title);
    assert.equal(audit.description, payload.core.description ?? null);
    assert.equal(audit.visibility, payload.acl.visibility);
    assert.equal(audit.participation_mode, payload.participation.mode);
    if (payload.family !== "P5") {
      expectedBoundary(audit, payload.schedule.start, "start");
      if (payload.schedule.end) expectedBoundary(audit, payload.schedule.end, "end");
      else assert.equal(audit.end_local_date, null);
      if ("place" in payload && payload.place) expectedFields(audit, payload.place);
    }
    if (!historical) {
      if (payload.family === "P3" && payload.details)
        expectedFields(evidence.stay, payload.details);
      if (payload.family === "P4") {
        if (payload.details) expectedFields(evidence.rental, payload.details);
        for (const [key, role] of [
          ["pickup", "PICKUP"],
          ["return", "RETURN"],
        ] as const)
          if (payload.places?.[key])
            expectedFields(
              evidence.rentalPlaces?.find((p) => p.role === role),
              payload.places[key]!,
            );
      }
      if (payload.family === "P5") {
        assert.equal(evidence.transportEndpoints?.length, 2);
        assert.equal(evidence.transportServices?.length, 1);
        expectedFields(evidence.transportServices![0], payload.service);
        for (const [key, role] of [
          ["origin", "ORIGIN"],
          ["destination", "DESTINATION"],
        ] as const) {
          const endpoint: Record<string, unknown> | undefined =
            evidence.transportEndpoints!.find((p) => p.role === role);
          assert(endpoint, "INDEPENDENT_ENDPOINT_MISSING");
          expectedBoundary(endpoint, payload.endpoints[key].time);
          expectedFields(endpoint, payload.endpoints[key].place);
        }
        assert.equal(
          evidence.operationalFacts?.length,
          payload.operationalFacts?.length ?? 0,
        );
        for (const fact of payload.operationalFacts ?? []) {
          const actual: Record<string, unknown> | undefined =
            evidence.operationalFacts!.find((p) => p.role === fact.role);
          assert(actual, "INDEPENDENT_OPERATIONAL_FACT_MISSING");
          expectedBoundary(actual, fact.time);
          expectedFields(actual, fact.place);
        }
      }
    }
  } else if (p.command === "SET_ITEM_TEXT") {
    const payload = corePayloadSchemas.SET_ITEM_TEXT.parse(p.payload);
    if (payload.title !== undefined) assert.equal(audit.title, payload.title);
    if (payload.description !== undefined)
      assert.equal(audit.description, payload.description);
  } else if (p.command === "SET_ITEM_SCHEDULE") {
    const payload = corePayloadSchemas.SET_ITEM_SCHEDULE.parse(p.payload);
    expectedBoundary(audit, payload.schedule.start, "start");
    if (payload.schedule.end) expectedBoundary(audit, payload.schedule.end, "end");
    else assert.equal(audit.end_local_date, null);
  } else {
    throw Error("INDEPENDENT_EXPECTED_COMMAND_UNSUPPORTED");
  }
  assert.equal(row.id, p.target.id);
  assert.equal(row.trip_id, p.tripId);
  assert.equal(row.owner_account_id, accountId);
  assert.equal(typeof row.semantic_revision, "number");
  assert(Number(row.semantic_revision) >= committed);
  if (!historical)
    for (const key of Object.keys(audit).filter(
      (k) => !["created_at", "updated_at", "field_state"].includes(k),
    )) {
      const actual = row[key],
        expected = audit[key];
      if (
        [
          "planned_start",
          "planned_end",
          "start_source_instant",
          "end_source_instant",
        ].includes(key) &&
        typeof actual === "string" &&
        typeof expected === "string" &&
        /T\d\d:\d\d:\d\d/.test(actual) &&
        /T\d\d:\d\d:\d\d/.test(expected)
      )
        assert.equal(
          instantMicroseconds(actual),
          instantMicroseconds(expected),
          "INDEPENDENT_BUSINESS_FIELD_MISMATCH:" + key,
        );
      else
        assert.deepEqual(actual, expected, "INDEPENDENT_BUSINESS_FIELD_MISMATCH:" + key);
    }
  return {
    status: historical
      ? "HISTORICAL_RECEIPT_VERIFIED_CURRENT_ADVANCED"
      : "SERVER_VERIFIED",
    itemCount: 1,
    operationId: p.operationId,
    itemId: p.target.id,
    revision: row.semantic_revision,
    receiptRevision: committed,
    committedAt: receipt.committedAt,
    intentSha256: receipt.intentSha256,
    receiptSha256: receipt.receiptSha256,
    fieldsSha256: contentDigest(row),
  };
}
