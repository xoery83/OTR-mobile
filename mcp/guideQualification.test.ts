import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { expect, it } from "vitest";
import { reconcileMaterials } from "./reconcile";

type RecordedCall = {
  mode: string;
  tool: string | null;
  arguments: unknown;
  result: {
    isError?: boolean;
    structuredContent?: Record<string, unknown>;
    tools?: { name: string }[];
  };
};
const transcript = gunzipSync(
  readFileSync(new URL("../docs/mcp/phase4b/blank-model-v3.jsonl.gz", import.meta.url)),
)
  .toString("utf8")
  .trim()
  .split("\n")
  .map((line) => JSON.parse(line)) as RecordedCall[];

it("replays the actual third blank-model request without pending-date, flight or optional-field regression", () => {
  const calls = transcript.filter((r) => r.mode === "call");
  const discovered = transcript[0].result.tools!.map((t) => t.name);
  for (const call of calls) {
    expect(discovered).toContain(call.tool);
    expect(call.result.isError).not.toBe(true);
  }
  expect(
    calls
      .filter((r) => r.tool === "get_otr_operating_guide")
      .every((r) => r.result.structuredContent?.version === "otr.ai.guide/2"),
  ).toBe(true);
  const item = calls.find((r) => r.tool === "get_trip_item")!.result.structuredContent!
    .item;
  const reviews = calls.filter((r) => r.tool === "review_travel_materials");
  const input = reviews.at(-1)!.arguments as { trip_id: string };
  const result = reconcileMaterials(input, {
    tripId: input.trip_id,
    complete: true,
    items: [item],
  });
  const hotel = result.rows.find((r) => r.candidate_key === "hotel")!;
  expect(hotel.expected_revision).toBe(1);
  expect(hotel.coverage.find((c) => c.field === "dates.end_date")).toMatchObject({
    state: "PENDING_CHANGE",
    value: "2026-12-12",
  });
  expect(hotel.changes.some((c) => c.field === "dates.end_date")).toBe(false);
  expect(hotel.proposed_fields).toMatchObject({ dates: { end_date: "2026-12-12" } });
  expect(hotel.create_schema_valid).toBe(true);
  const flights = result.rows.filter((r) => r.family === "P2");
  expect(flights).toHaveLength(2);
  expect(flights.map((r) => r.proposed_fields.flight_number)).toEqual(["QA101", "QA202"]);
  for (const flight of flights) {
    expect(flight).toMatchObject({ decision: "CREATE", create_schema_valid: true });
    expect(flight.proposed_fields).toHaveProperty(
      "flight_details_follow_up.requires",
      "CREATE_APPLIED_AND_FRESH_ITEM_REVISION",
    );
    expect(flight.proposed_fields).toHaveProperty(
      "flight_details_follow_up.change.origin.zone",
      null,
    );
    expect(flight.proposed_fields.dates).not.toHaveProperty("start_time");
    expect(JSON.stringify(flight.proposed_fields)).not.toContain("instant");
  }
  const rental = result.rows.find((r) => r.family === "P4")!;
  expect(rental).toMatchObject({ decision: "CREATE", create_schema_valid: true });
  expect(rental.proposed_fields.rental).not.toHaveProperty("actual_vehicle_model");
  expect(result.rows.find((r) => r.candidate_key === "water-taxi")?.decision).toBe(
    "NEEDS_INPUT",
  );
  expect(result.rows.find((r) => r.candidate_key === "hut")?.decision).toBe(
    "NEEDS_INPUT",
  );
  expect(result.people_review.every((r) => r.decision === "BLOCKED")).toBe(true);
  expect(
    result.expense_review.every((r) => r.decision === "BLOCKED" && r.writes === 0),
  ).toBe(true);
  expect(result.writes).toBe(0);
});
