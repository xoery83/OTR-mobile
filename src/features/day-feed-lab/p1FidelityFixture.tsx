import { Fragment, createElement, type ReactNode } from "react";
import type { FixtureMovePreview, MovePoint } from "./useP1FixtureMove";
import { P1FixtureNowMarker } from "./P1FixtureNowMarker";
import pack from "./fixtures/p1-fidelity-v2.json";
import {
  itemsForLocalDate,
  type DayEvent,
  type DayBoundary,
} from "@/domain/trip/dayReadModel";
import { composeDayStream } from "@/features/day-feed/composition";
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
  onDetail?: (itemId: string) => void,
  move?: {
    previews: Record<string, FixtureMovePreview>;
    wrapRow?(key: string, date: string, content: ReactNode): ReactNode;
    handlers: {
      start(id: string, point: MovePoint): void;
      change(point: MovePoint): void;
      end(): void;
      cancel?(): void;
    };
  },
): FixtureContribution {
  const visible = pack.items
    .filter((item) => item.availability !== "UNAVAILABLE")
    .map((item) => ({ ...item, ...move?.previews[item.id] }));
  const events = visible.map((item) => {
    const original = pack.items.find((source) => source.id === item.id)!;
    const hasEnd = "endTime" in original;
    const b = (
      role: DayBoundary["role"],
      date: string,
      time: string | null | undefined,
      instant: string | null | undefined,
    ): DayBoundary => ({
      ...boundary(role, date),
      local_time: time ? time + ":00" : null,
      clock_precision: time ? 0 : null,
      zone_id: item.zone,
      quality: time ? "EXACT" : "UNKNOWN",
      instant: instant ?? null,
      source_instant: move?.previews[item.id] ? null : (instant ?? null),
      source_instant_precision: move?.previews[item.id] ? null : instant ? 0 : null,
      basis: instant && !move?.previews[item.id] ? "SOURCE_INSTANT" : "DERIVED_CIVIL",
      civil_resolution: instant ? "UNIQUE" : "PENDING",
    });
    return {
      ...place(item.id, item.title, item.date),
      authored_label: item.place ?? null,
      authored_address: "address" in item ? item.address : null,
      temporal_shape: hasEnd ? "SPAN" : "POINT",
      boundaries: [
        b("START", item.date, item.time, "instant" in item ? item.instant : undefined),
        ...(hasEnd
          ? [
              b(
                "END",
                ("endDate" in item ? item.endDate : undefined) ?? item.date,
                "endTime" in item ? item.endTime : null,
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
  const referenceNowBefore =
    clock === "today"
      ? visible
          .filter(
            (item) =>
              item.availability === "AVAILABLE" &&
              "instant" in item &&
              item.instant &&
              item.time &&
              item.zone &&
              item.date === pack.clockPresets[clock].slice(0, 10) &&
              Date.parse(item.instant) > Date.parse(pack.clockPresets[clock]),
          )
          .sort(
            (a, b) =>
              Date.parse("instant" in a ? (a.instant ?? "") : "") -
              Date.parse("instant" in b ? (b.instant ?? "") : ""),
          )[0]?.id
      : null;
  const renderer: DayRowRenderer = (props) => {
    const content = createElement(
      Fragment,
      null,
      props.depth !== "I" && props.row.item.event.id === referenceNowBefore
        ? createElement(P1FixtureNowMarker)
        : null,
      createElement(P1Row, {
        event: props.row.item.event,
        depth: props.depth,
        moveGesture:
          move &&
          !facts[props.row.item.event.id]?.pending &&
          props.row.item.roles.includes("START")
            ? {
                start: (point) => move.handlers.start(props.row.item.event.id, point),
              }
            : undefined,
        onDepth: (next) => {
          if (next === "I" && onDetail) onDetail(props.row.item.event.id);
          else props.onDepth(next);
        },
        withinMarker: props.withinMarker,
        hideDivider: props.nextFocused,
        showHeader: false,
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
      }),
    );
    const role = props.row.item.roles.includes("START") ? "START" : "END";
    const date = props.row.item.event.boundaries.find((b) => b.role === role)?.local_date;
    return move?.wrapRow && date ? move.wrapRow(props.row.key, date, content) : content;
  };
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
        fingerprint:
          move && Object.keys(move.previews).length
            ? `fixture-move-preview:${JSON.stringify(move.previews)}`
            : "frozen-883e6b5",
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

// Direct detail must use the continuous-list occurrence key, not the Item identity.
export function p1FidelityFocusKey(fixture: FixtureContribution, itemId: string) {
  return fixture.dates
    .flatMap(
      (date) =>
        composeDayStream(
          itemsForLocalDate(fixture.projection, date, fixture.zone),
          fixture.instant,
          { occurrenceFocus: true },
        ).rows,
    )
    .find((row) => row.item.event.id === itemId)?.focusKey;
}
