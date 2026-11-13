import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { mapStructuredManualPlace, structuredManualPlacePatch } from "./structuredPlace";
import { prepareCreate } from "./mutation";
import { prepareFieldUpdate } from "./fieldAdapter";
import { corePlaceSchema } from "../src/domain/trip/tripCoreV2";
import { validateCoreCommand } from "../src/domain/trip/tripCoreV2Commands";
import { applyCoreCommand, emptyCoreGraph } from "../src/domain/trip/tripCoreV2Mutation";
import { coreReadItemChildren } from "../src/domain/trip/tripCoreV2Read";
import { projectCoreItem } from "../src/domain/trip/tripCoreV2Views";

function fixture() {
  const accountId = randomUUID(),
    tripId = randomUUID(),
    personId = randomUUID();
  const actor = {
    accountId,
    tripId,
    personId,
    personIds: [personId],
    active: true,
    canManageShared: true,
  };
  const created = prepareCreate(accountId, {
    request_id: randomUUID(),
    trip_id: tripId,
    item: {
      family: "P3",
      title: "Synthetic structured QA stay",
      dates: { start_date: "2026-12-10", end_date: "2026-12-12" },
      property_name: "QA lodge",
      stay: { permitted_checkout_by: "10:30" },
      rooms: [
        { room_id: randomUUID(), category: "Family unit", quantity: 1, capacity: 4 },
      ],
    },
  });
  if (created.kind !== "ITEM") throw Error("ITEM_REQUIRED");
  const initial = applyCoreCommand(
    emptyCoreGraph(),
    created.command,
    actor,
    "2026-11-03T00:00:00Z",
  ).graph;
  const full = corePlaceSchema.parse({
    ...Object.fromEntries(Object.keys(corePlaceSchema.shape).map((k) => [k, null])),
    authored_label: "QA lodge",
    authored_text: "Entrance beside the gate",
    authored_address: "18 Example Quay, QA Town",
    authored_address_line1: "18 Example Quay",
    authored_address_line2: "Unit B",
    authored_address_locality: "QA Town",
    authored_address_region: "QA Region",
    authored_address_postal_code: "7010",
    authored_address_country: "New Zealand",
  });
  const command = validateCoreCommand({
    ...created.command,
    operationId: randomUUID(),
    command: "SET_ITEM_PLACE",
    baseVector: [{ kind: "ITEM", id: created.command.target.id, revision: 1 }],
    payload: { place: full },
  });
  const graph = applyCoreCommand(initial, command, actor, "2026-11-03T00:01:00Z").graph;
  const item = projectCoreItem(graph, actor, command.target.id);
  if (!item) throw Error("FIXTURE_ITEM_MISSING");
  const row = graph.itinerary_events[0];
  const base = {
    version: "otr.mcp.edit-base/1",
    state: "SERVER_CONFIRMED",
    item,
    record: {
      kind: "ITEM",
      id: item.itemId,
      revision: item.itemRevision,
      body: {
        ...row,
        ...Object.fromEntries(
          coreReadItemChildren.map((table) => [
            table,
            graph[table].filter((r) => r.event_id === item.itemId),
          ]),
        ),
      },
    },
    basis: {
      epoch: randomUUID(),
      revision: 2,
      access_revision: 1,
      manifest_sha256: "a".repeat(64),
    },
    evidence_visibility: "BACKEND_AUTHORIZED_REDACTED_NOT_PROOF_OF_ABSENCE",
  };
  return { base, graph, actor, command };
}
it("maps the full manual structured snapshot rather than the lossy DTO, preserving omitted fields and clearing only explicit null", () => {
  const f = fixture();
  expect(f.base.item.place).not.toHaveProperty("authoredAddressLine2");
  const mapped = mapStructuredManualPlace(f.base, {
    authored_address_locality: "New QA Town",
    authored_address_line2: null,
  });
  expect(mapped.payload.place).toMatchObject({
    authored_address_locality: "New QA Town",
    authored_address_line2: null,
    authored_address_line1: "18 Example Quay",
    authored_address_postal_code: "7010",
    authored_text: "Entrance beside the gate",
    authored_address: "18 Example Quay, QA Town",
    accepted_latitude: null,
    accepted_place_id: null,
  });
  expect(mapped.tracking_effect).toContain("entire place group's");
  const edit = validateCoreCommand({
    ...f.command,
    operationId: randomUUID(),
    baseVector: [{ kind: "ITEM", id: f.command.target.id, revision: 2 }],
    payload: mapped.payload,
  });
  const result = applyCoreCommand(f.graph, edit, f.actor, "2026-11-03T00:02:00Z");
  expect(result.graph.itinerary_events[0]).toMatchObject({
    id: f.base.item.itemId,
    semantic_revision: 3,
    authored_address_locality: "New QA Town",
    authored_address_line2: null,
    authored_address_postal_code: "7010",
  });
  expect(result.graph.trip_stay_rooms).toEqual(f.graph.trip_stay_rooms);
  expect(result.graph.trip_stay_details).toEqual(f.graph.trip_stay_details);
  for (const [key, value] of Object.entries(f.graph.itinerary_events[0]))
    if (
      ![
        ...Object.keys(corePlaceSchema.shape),
        "field_state",
        "semantic_revision",
        "updated_at",
      ].includes(key)
    )
      expect(result.graph.itinerary_events[0][key]).toEqual(value);
  expect(
    mapStructuredManualPlace(f.base, {
      authored_address_line2: undefined,
      authored_label: "Changed",
    }).payload.place.authored_address_line2,
  ).toBe("Unit B");
  expect(() =>
    applyCoreCommand(result.graph, edit, f.actor, "2026-11-03T00:03:00Z"),
  ).toThrow();
});
it.each([
  "accepted_latitude",
  "accepted_address_line1",
  "accepted_place_id",
  "spatial_provenance_refs",
  "location_input_revision",
])("does not manufacture or replace provider facts: %s", (key) => {
  const f = fixture();
  const values: Record<string, unknown> = {
    accepted_latitude: -41,
    accepted_address_line1: "Provider street",
    accepted_place_id: randomUUID(),
    spatial_provenance_refs: { place: "opaque-ref" },
    location_input_revision: 1,
  };
  Object.assign(f.base.record.body, { [key]: values[key] });
  expect(() => mapStructuredManualPlace(f.base, { authored_label: "Other" })).toThrow(
    "MATCHED_PLACE_REQUIRES_OWNING_PRESERVATION",
  );
  expect(structuredManualPlacePatch.safeParse({ [key]: values[key] }).success).toBe(
    false,
  );
});
it("rejects source-backed, evidence-bearing or incomplete provenance even when the DTO omits the field", () => {
  for (const mode of ["SOURCE", "EVIDENCE", "MISSING"]) {
    const f = fixture(),
      states = f.base.record.body.field_state as Record<string, unknown>;
    const key = "itinerary_events.authored_address_postal_code";
    if (mode === "MISSING") delete states[key];
    else
      states[key] = {
        state: "KNOWN",
        origin: mode === "SOURCE" ? "SOURCE" : "MANUAL",
        protected: true,
        changed_revision: 2,
        evidence_ref: mode === "EVIDENCE" ? "opaque-evidence" : null,
      };
    expect(() => mapStructuredManualPlace(f.base, { authored_label: "Other" })).toThrow(
      "SOURCE_PLACE_REQUIRES_OWNING_PRESERVATION",
    );
  }
});
it("rejects malformed, empty, stale or foreign bases and does not enable the public field tool", () => {
  expect(structuredManualPlacePatch.safeParse({}).success).toBe(false);
  expect(
    structuredManualPlacePatch.safeParse({ authored_label: undefined }).success,
  ).toBe(false);
  expect(
    structuredManualPlacePatch.safeParse({ authored_address_postal_code: "x".repeat(65) })
      .success,
  ).toBe(false);
  for (const key of ["revision", "id"]) {
    const f = fixture();
    Object.assign(f.base.record, { [key]: key === "revision" ? 1 : randomUUID() });
    expect(() => mapStructuredManualPlace(f.base, { authored_label: "Other" })).toThrow();
  }
  const f = fixture();
  expect(() =>
    prepareFieldUpdate({
      request_id: randomUUID(),
      trip_id: f.actor.tripId,
      item_id: f.base.item.itemId,
      expected_revision: 2,
      base_item: f.base.item,
      change: { kind: "PLACE", replacement: { label: "Other" } },
    }),
  ).toThrow();
});
