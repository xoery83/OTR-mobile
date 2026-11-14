import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { expect, it } from "vitest";
import { prepareCreate, mutationIdentity } from "./mutation";
import { operatingGuide } from "./guide";

type Entry = {
  mode: string;
  tool: string | null;
  arguments: Record<string, unknown> | null;
  result: {
    isError?: boolean;
    structuredContent?: Record<string, unknown>;
    tools?: { name: string }[];
  };
};
const transcript = (version: number) =>
  gunzipSync(
    readFileSync(new URL(`../docs/mcp/c02/blank-v${version}.jsonl.gz`, import.meta.url)),
  )
    .toString()
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as Entry);

it("keeps actual incomplete model rounds as failures instead of upgrading them to acceptance", () => {
  const create = (n: number) =>
    transcript(n).find((r) => r.mode === "call" && r.tool === "create_trip_item")!
      .arguments!;
  expect((create(1).item as { rooms: { category: string }[] }).rooms[0].category).toBe(
    "Family",
  );
  expect(create(2).item).not.toHaveProperty("notes");
  expect(operatingGuide).toContain('a room category "Family unit" must stay');
  expect(operatingGuide).toContain('belong in item.notes / the material claim "notes"');
});

it("qualifies final blank-model source fidelity and SDK preview without claiming a save", () => {
  const rows = transcript(3),
    calls = rows.filter((r) => r.mode === "call");
  const names = rows[0].result.tools!.map((t) => t.name);
  expect(calls.every((r) => names.includes(r.tool!))).toBe(true);
  expect(calls.every((r) => !r.result.isError)).toBe(true);
  expect(calls.some((r) => r.arguments?.mode === "APPLY")).toBe(false);
  expect(
    calls
      .filter((r) => r.tool === "get_otr_operating_guide")
      .map((r) => r.arguments?.section),
  ).toEqual(["OPERATING", "FIELDS", "CAPABILITIES"]);
  expect(calls.some((r) => r.tool === "get_trip_item")).toBe(true);
  const previews = calls.filter((r) => r.tool === "create_trip_item");
  expect(previews).toHaveLength(1);
  const q = previews[0].arguments!;
  expect(q).toMatchObject({
    mode: "PREVIEW",
    item: {
      family: "P3",
      property_name: "Kowhai Bay QA Lodge",
      place: "Kowhai Bay QA Lodge",
      place_address: "18 Example Quay, Aster Bay, New Zealand (fictional)",
      notes: "Use the east entrance; call reception if arriving after 20:00.",
      dates: {
        start_date: "2026-12-10",
        end_date: "2026-12-12",
        start_time: "17:20",
        end_time: "09:45",
        start_zone: "Pacific/Auckland",
        end_zone: "Pacific/Auckland",
      },
      stay: {
        permitted_checkin_from: "14:00",
        permitted_checkin_until: "20:00",
        permitted_checkout_by: "10:30",
      },
      rooms: [
        { category: "Family unit", quantity: 1, capacity: 4 },
        { category: "Studio", quantity: 1, capacity: 3 },
      ],
    },
  });
  const account = "00000000-0000-4000-8000-000000000001";
  expect(previews[0].result.structuredContent).toMatchObject({
    ...mutationIdentity(account, prepareCreate(account, q)),
    outcome: "PREVIEW",
  });
  expect(calls.some((r) => r.tool === "update_trip_item")).toBe(false);
});
