import { expect, it } from "vitest";
import { stayBasePresentationRows } from "./stayBasePresentationRows";
import { localDayDisplayOrder } from "./localDayDisplayOrder";
import type { CoreDayRow } from "@/domain/trip/tripCoreV2Day";
import { projectCoreDay } from "@/domain/trip/tripCoreV2Day";
import { coreDateBoundary } from "@/domain/trip/tripCoreV2Temporal";
import { coreDefaults } from "@/domain/trip/tripCoreV2";
import { applyCoreCommand, emptyCoreGraph } from "@/domain/trip/tripCoreV2Mutation";
import { randomUUID } from "node:crypto";
const row = (
  itemId: string,
  projectionRole: string,
  localDate = "2026-10-29",
  family = "P3",
) =>
  ({
    rowKey: { itemId, projectionRole, localDate },
    itemRef: itemId,
    title: "SkyCity Hotel",
    family,
    position:
      family === "P3" && ["TONIGHT", "BASE_FROM", "BASE_RETURN"].includes(projectionRole)
        ? "BASE"
        : "TNS",
  }) as CoreDayRow;
it("adapts the legacy same-Stay Base pair into one original tail occurrence", () => {
  const from = row("stay", "BASE_FROM"),
    back = row("stay", "BASE_RETURN"),
    activity = row("activity", "START", "2026-10-29", "P1");
  const input = [activity, from, back];
  expect(localDayDisplayOrder(input)).toEqual([activity, back]);
  expect(input).toHaveLength(3);
  expect(stayBasePresentationRows([back, from])).toEqual([back]);
});
it("preserves no-activity TONIGHT and never combines another Item or civil day with the same title", () => {
  const one = row("stay-1", "BASE_FROM"),
    back = row("stay-1", "BASE_RETURN"),
    other = row("stay-2", "TONIGHT"),
    next = row("stay-1", "TONIGHT", "2026-10-30");
  expect(stayBasePresentationRows([one, back, other, next])).toEqual([back, other, next]);
  expect(stayBasePresentationRows([other])).toEqual([other]);
});
it("keeps distinct check-in/out on day-use, other families and endpoints unchanged", () => {
  const rows = [
    row("stay", "CHECKIN"),
    row("stay", "CHECKOUT"),
    row("rental", "PICKUP", "2026-10-29", "P4"),
    row("rental", "RETURN", "2026-10-29", "P4"),
  ];
  expect(stayBasePresentationRows(rows)).toEqual(rows);
  expect(
    stayBasePresentationRows(rows).every((value, index) => value === rows[index]),
  ).toBe(true);
});
it("does not render the exact same owning base role twice", () => {
  const tonight = row("stay", "TONIGHT");
  expect(stayBasePresentationRows([tonight, tonight, { ...tonight }])).toEqual([tonight]);
});
it("reproduces the27–30Oct W0 activity-day pair and adapts only its presentation", () => {
  const actor = {
    accountId: randomUUID(),
    tripId: randomUUID(),
    personId: null,
    personIds: [],
    active: true,
    canManageShared: true,
  };
  let graph = emptyCoreGraph();
  function create(family: "P1" | "P3", start: string, end?: string) {
    const id = randomUUID();
    graph = applyCoreCommand(
      graph,
      {
        contractVersion: 2,
        intentVersion: 2,
        operationId: randomUUID(),
        tripId: actor.tripId,
        command: "CREATE_ITEM",
        target: { kind: "ITEM", id },
        baseVector: [{ kind: "ITEM", id, revision: null }],
        admission: { mode: "MANUAL", sourceIntentId: null, policyVersion: null },
        payload: {
          family,
          core: { title: family === "P3" ? "SkyCity Hotel" : "city tour Auckland" },
          schedule: {
            start: coreDateBoundary(start),
            ...(end ? { end: coreDateBoundary(end) } : {}),
          },
          ...(family === "P3" ? { details: { property_name: "SkyCity Hotel" } } : {}),
          ...coreDefaults("organizer"),
        },
      },
      actor,
      "2026-10-27T00:00:00Z",
    ).graph;
    return id;
  }
  const stayId = create("P3", "2026-10-27", "2026-10-30");
  create("P1", "2026-10-29");
  const raw = (day: string) => projectCoreDay(graph, actor, day, 1);
  expect(raw("2026-10-28").map((row) => row.rowKey.projectionRole)).toEqual(["TONIGHT"]);
  const on29 = raw("2026-10-29");
  expect(
    on29.filter((row) => row.itemRef === stayId).map((row) => row.rowKey.projectionRole),
  ).toEqual(["BASE_FROM", "BASE_RETURN"]);
  expect(localDayDisplayOrder(on29).map((row) => row.rowKey.projectionRole)).toEqual([
    "START",
    "BASE_RETURN",
  ]);
  expect(on29).toHaveLength(3);
  expect(raw("2026-10-30").map((row) => row.rowKey.projectionRole)).toEqual(["CHECKOUT"]);
});
