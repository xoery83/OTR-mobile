import { createElement } from "react";
import pack from "./fixtures/p1-fidelity-v2.json";
import type { DayEvent, DayBoundary } from "@/domain/trip/dayReadModel";
import { P1Row } from "@/features/day-feed/P1Row";
import type { P1ReadFacts, P1ReadActions } from "@/features/day-feed/p1ReadPresentation";
import type { DayRowRenderer } from "@/features/day-feed/rendererContribution";
import { place, boundary } from "./fixtureFacts";
import type { FixtureContribution } from "./contribution";
export type P1FidelityClock = keyof typeof pack.clockPresets;
export const p1FidelityPack = pack;
export function p1FidelityFixture(
  clock: P1FidelityClock,
  actions: P1ReadActions = {},
  onInsert?: (side: "BEFORE" | "AFTER", itemId: string, date: string) => void,
): FixtureContribution {
  const visible = pack.items.filter((item) => item.availability !== "UNAVAILABLE");
  const events = visible.map((item) => {
    const b = (
      role: DayBoundary["role"],
      date: string,
      time: string | null | undefined,
      instant: string | undefined,
    ): DayBoundary => ({
      ...boundary(role, date),
      local_time: time ? time + ":00" : null,
      clock_precision: time ? 0 : null,
      zone_id: item.zone,
      quality: time ? "EXACT" : "UNKNOWN",
      instant: instant ?? null,
      source_instant: instant ?? null,
      source_instant_precision: instant ? 0 : null,
      basis: instant ? "SOURCE_INSTANT" : "DERIVED_CIVIL",
      civil_resolution: instant ? "UNIQUE" : "PENDING",
    });
    return {
      ...place(item.id, item.title, item.date),
      authored_label: item.place ?? null,
      authored_address: "address" in item ? item.address : null,
      temporal_shape: "endTime" in item ? "SPAN" : "POINT",
      boundaries: [
        b("START", item.date, item.time, "instant" in item ? item.instant : undefined),
        ...("endTime" in item
          ? [
              b(
                "END",
                ("endDate" in item ? item.endDate : undefined) ?? item.date,
                item.endTime,
                "endInstant" in item ? item.endInstant : undefined,
              ),
            ]
          : []),
      ],
    } as DayEvent;
  });
  const facts = Object.fromEntries(
    visible.map((item) => [
      item.id,
      {
        itemId: item.id,
        semanticRevision: 1,
        note: "note" in item ? item.note : undefined,
        participation: "participation" in item ? item.participation : undefined,
        photoIds: "linkedPhotoIds" in item ? item.linkedPhotoIds : [],
        expenseIds: "linkedExpenseIds" in item ? item.linkedExpenseIds : [],
        documentIds: [],
        navigationQualified: "navigationTarget" in item,
        pending: item.availability === "PENDING",
      } as P1ReadFacts,
    ]),
  );
  const renderer: DayRowRenderer = (props) =>
    createElement(P1Row, {
      event: props.row.item.event,
      depth: props.depth,
      onDepth: props.onDepth,
      withinMarker: props.withinMarker,
      hideDivider: props.nextFocused,
      facts: facts[props.row.item.event.id],
      actions,
      context: props.context,
      occurrence:
        props.row.item.roles.includes("END") && !props.row.item.roles.includes("START")
          ? "END"
          : "START",
      instant: pack.clockPresets[clock],
      onInsert: onInsert
        ? (side) =>
            onInsert(
              side,
              props.row.item.event.id,
              props.row.item.event.boundaries.find((b) => b.role === "START")
                ?.local_date ?? "",
            )
        : undefined,
    });
  const dates = Array.from({ length: 10 }, (_, i) => `2027-01-${16 + i}`);
  return {
    version: "day-feed-lab/1",
    synthetic: true,
    id: pack.trip.id,
    title: pack.trip.title,
    dateRange: { start: dates[0], end: dates[9] },
    dates,
    selectedDate: dates[0],
    zone: pack.trip.zone,
    instant: pack.clockPresets[clock],
    projection: {
      version: 1,
      accountId: "p1-fidelity-synthetic-account",
      tripId: pack.trip.id,
      generation: 1,
      source: {
        epochId: "p1-fidelity-synthetic",
        revision: "2",
        fingerprint: "frozen-883e6b5",
        appliedGeneration: 1,
      },
      events,
    },
    services: {},
    renderer,
    metadata: {
      summary: pack.version,
      expected: visible.map((x) => x.expected),
    },
  };
}
