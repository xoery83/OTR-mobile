import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import {
  betaItemCommandSchema,
  betaExpenseLinkCommandSchema,
} from "./tripBetaCommandContract";
import { corePayloadSchemas } from "./tripCoreV2Commands";
import { coreDefaults } from "./tripCoreV2";
const trip = randomUUID(),
  item = randomUUID();
const command = (name: string, payload: unknown, revision: number | null = 1) => ({
  contractVersion: 2,
  intentVersion: 2,
  operationId: randomUUID(),
  tripId: trip,
  command: name,
  target: { kind: "ITEM", id: item },
  baseVector: [{ kind: "ITEM", id: item, revision }],
  admission: { mode: "MANUAL", sourceIntentId: null, policyVersion: null },
  payload,
});
it("pins P2 title/description and manual source boundaries without granting provider input", () => {
  const create = command("CREATE_SPARSE_FLIGHT", {
    flightNumberLiteral: "NZ123",
    departureDate: "2026-12-01",
    core: { title: "NZ123" },
    ...coreDefaults("organizer"),
  });
  create.baseVector[0].revision = null;
  const schema = betaItemCommandSchema("P2", "create");
  expect(schema.safeParse(create).success).toBe(true);
  expect(
    schema.safeParse({
      ...create,
      payload: { ...(create.payload as object), core: { title: "Unrelated" } },
    }).success,
  ).toBe(false);
  expect(
    schema.safeParse({
      ...create,
      admission: {
        mode: "REVIEWED_SOURCE",
        sourceIntentId: randomUUID(),
        policyVersion: null,
      },
    }).success,
  ).toBe(false);
  expect(
    betaItemCommandSchema("P2", "update").safeParse(
      command("SET_ITEM_TEXT", { title: "Bypass" }),
    ).success,
  ).toBe(false);
  expect(
    betaItemCommandSchema("P2", "update").safeParse(
      command("SET_ITEM_TEXT", { description: null }),
    ).success,
  ).toBe(true);
  expect(
    betaItemCommandSchema("P2", "update").safeParse(
      command("SET_AUTHORED_FLIGHT_DETAILS", {
        patch: { origin: { time: { local_time: "10:30", clock_precision: -1 } } },
      }),
    ).success,
  ).toBe(true);
});
it("keeps frozen sparse Room writes separate from historical Native complete setters", () => {
  const payload = { details: { property_name: "Hotel" }, rooms: [] };
  expect(corePayloadSchemas.SET_STAY_DETAILS.safeParse(payload).success).toBe(true);
  expect(
    betaItemCommandSchema("P3", "update").safeParse(command("SET_STAY_DETAILS", payload))
      .success,
  ).toBe(false);
  expect(
    betaItemCommandSchema("P3", "update").safeParse(
      command("SET_STAY_DETAILS", {
        roomChanges: [
          { operation: "PATCH", room_id: randomUUID(), changes: { quantity: 2 } },
        ],
      }),
    ).success,
  ).toBe(true);
});
it("preserves false/null/omission and prohibits accepted Place fabrication", () => {
  const rental = betaItemCommandSchema("P4", "update").parse(
    command("SET_RENTAL_DETAILS", {
      details: { or_similar: false, verified_plate: null },
    }),
  );
  expect(rental.payload).toEqual({
    details: { or_similar: false, verified_plate: null },
  });
  const activity = betaItemCommandSchema("P6", "update").parse(
    command("SET_ACTIVITY_DETAILS", { details: { session_label: "Evening" } }),
  );
  expect(Object.hasOwn(activity.payload as object, "entryPlace")).toBe(false);
  expect(
    betaItemCommandSchema("P1", "update").safeParse(
      command("SET_ITEM_PLACE", { place: { accepted_latitude: 12 } }),
    ).success,
  ).toBe(false);
  expect(
    betaItemCommandSchema("P1", "update").safeParse(
      command("SET_ITEM_PLACE", { place: { authored_label: null } }),
    ).success,
  ).toBe(true);
});
it("requires the approved link dual CAS without upgrading legacy pending payloads", () => {
  const link = { expenseId: randomUUID(), targetKind: "ITEM", targetId: item };
  expect(corePayloadSchemas.LINK_EXPENSE.safeParse(link).success).toBe(true);
  const input = {
    ...command("LINK_EXPENSE", link),
    target: { kind: "EXPENSE_LINK", id: randomUUID() },
  };
  input.baseVector = [
    { kind: "ITEM", id: item, revision: 1 },
    { kind: "EXPENSE_LINK", id: input.target.id, revision: null },
  ];
  input.baseVector.sort((a, b) =>
    (a.kind + ":" + a.id).localeCompare(b.kind + ":" + b.id),
  );
  expect(betaExpenseLinkCommandSchema(false).safeParse(input).success).toBe(false);
  expect(
    betaExpenseLinkCommandSchema(false).safeParse({
      ...input,
      payload: { ...link, expectedExpenseRevision: 2 },
    }).success,
  ).toBe(true);
});
it("publishes sparse schedule edits while retaining the Native complete setter", () => {
  const schedule = {
    start: {
      instant: null,
      local_date: "2026-12-01",
      local_time: null,
      clock_precision: null,
      quality: "UNKNOWN",
      basis: "DERIVED_CIVIL",
      zone_id: null,
      supplied_offset_seconds: null,
      source_instant: null,
      source_instant_precision: null,
      civil_resolution: "PENDING",
      resolution_offset_seconds: null,
      interpretation_key: null,
      interpretation_input_sha256: null,
      provenance_refs: null,
    },
  };
  expect(corePayloadSchemas.SET_ITEM_SCHEDULE.safeParse({ schedule }).success).toBe(true);
  expect(
    betaItemCommandSchema("P1", "update").safeParse(
      command("SET_ITEM_SCHEDULE", { schedule }),
    ).success,
  ).toBe(false);
  expect(
    betaItemCommandSchema("P1", "update").safeParse(
      command("SET_ITEM_SCHEDULE", {
        schedulePatch: { start: { local_date: "2026-12-02" } },
      }),
    ).success,
  ).toBe(true);
});
