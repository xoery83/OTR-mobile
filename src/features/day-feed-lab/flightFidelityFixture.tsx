import { createElement } from "react";
import { t } from "@/ui/locale";
import pack from "./fixtures/p2-fidelity-v7.json";
import { boundary, place, scenario } from "./fixtureFacts";
import { FlightLegRow } from "@/features/day-feed/FlightJourneyView";
import {
  readableDocuments,
  type FlightJourneyRead,
  type ReadDocument,
} from "@/features/day-feed/bookingReadPresentation";
import type { DayBoundary } from "@/domain/trip/dayReadModel";
import type { FlightService } from "@/domain/trip/flightAdmission";
import type { FixtureContribution } from "./contribution";
import { itemsForLocalDate } from "@/domain/trip/dayReadModel";
import { composeDayStream } from "@/features/day-feed/composition";
type Doc = {
  id: string;
  contentVersion?: number;
  title: string;
  visible?: boolean;
  canOpenOriginal?: boolean;
  previewText?: string;
  bookingId?: string;
};
type End = {
  date?: string;
  time?: string;
  zone?: string;
  instant?: string;
  airportCode?: string;
  airportName?: string;
  terminal?: string;
  navigationTarget?: { query: string; qualification: string };
};
type Leg = {
  id: string;
  flightNumberLiteral?: string;
  origin: End;
  destination: End;
  services?: { attribution: string; literal: string }[];
  bookingSummaries?: { id: string; confirmationCode?: string; visible: boolean }[];
  seatSummaries?: { seat: string; visible: boolean }[];
  documentSummaries?: Doc[];
};
type Sample = {
  label?: string;
  id: string;
  date: string;
  title: string;
  legs: Leg[];
  grouping?: { basis: string; orderedLegIds: string[] };
  participation?: {
    mode: "WHOLE_GROUP" | "SELF" | "SELECTED_MEMBERS";
    personIds?: string[];
  };
  linkedExpenseIds?: string[];
  linkedPhotoIds?: string[];
  note?: string;
  documentSummaries?: Doc[];
  bookingSummaries?: {
    id: string;
    visible: boolean;
    title?: string;
    confirmationCode?: string;
  }[];
};
export type FidelityAction = (
  title: string,
  text?: string,
  choices?: readonly ReadDocument[],
) => void;
export const flightSamples = pack.items as unknown as Sample[];
function descriptiveAirport(endpoint: End) {
  const records = pack.airportDisplayReference.records;
  let code = endpoint.airportCode ?? null,
    name = endpoint.airportName ?? null;
  const hits = records.filter((r) =>
    code ? r.iata === code && (!name || r.name === name) : name && r.name === name,
  );
  if (hits.length === 1) {
    code ??= hits[0].iata;
    name ??= hits[0].name;
  }
  return { code, name, terminal: endpoint.terminal ?? null };
}
function flightBoundary(role: "ORIGIN" | "DESTINATION", end: End): DayBoundary {
  const b = boundary(role, end.date ?? "2027-01-16");
  return {
    ...b,
    local_date: end.date ?? null,
    local_time: end.time ? end.time + ":00" : null,
    clock_precision: end.time ? 0 : null,
    quality: end.instant ? "EXACT" : end.time ? "ESTIMATED" : "UNKNOWN",
    basis: end.instant ? "SOURCE_INSTANT" : null,
    instant: end.instant ?? null,
    source_instant: end.instant ?? null,
    source_instant_precision: end.instant ? 0 : null,
    zone_id: end.zone ?? null,
  };
}
export function flightFidelityFixture(
  id: string,
  clock: string,
  action: FidelityAction,
  open: (legId: string) => void,
  insert: (legId: string, date: string, side: "BEFORE" | "AFTER") => void,
): FixtureContribution & { journey: FlightJourneyRead; locationSummary: string } {
  const sample = flightSamples.find((s) => s.id === id) ?? flightSamples[1];
  const allDocs: ReadDocument[] = [];
  const docs = (input?: Doc[]) =>
    (input ?? [])
      .filter(
        (d) =>
          d.visible === true &&
          (!d.bookingId ||
            sample.bookingSummaries?.some((b) => b.id === d.bookingId && b.visible)),
      )
      .map((d) => {
        const value: ReadDocument = {
          id: d.id,
          version: String(d.contentVersion ?? 1),
          title: d.title,
          contentKey: d.previewText,
          ...(d.canOpenOriginal && d.previewText
            ? { onOpen: () => action(d.title, d.previewText) }
            : {}),
        };
        allDocs.push(value);
        return value;
      });
  const members =
    sample.grouping?.basis === "SYNTHETIC_EXPLICIT_MANUAL"
      ? sample.grouping.orderedLegIds.flatMap(
          (id) => sample.legs.find((l) => l.id === id) ?? [],
        )
      : [];
  const legs = members.map((leg) => {
    const event = {
      ...place(
        leg.id,
        leg.flightNumberLiteral ?? sample.title,
        leg.origin.date ?? sample.date,
      ),
      event_type: "flight" as const,
      temporal_shape: "TRANSPORT" as const,
      boundaries: [
        flightBoundary("ORIGIN", leg.origin),
        flightBoundary("DESTINATION", leg.destination),
      ],
    };
    const services: FlightService[] = (leg.services ?? []).map((s, i) => ({
      service_key: String(i),
      transport_subtype: "FLIGHT",
      attribution: s.attribution as FlightService["attribution"],
      operator_namespace: "NAME",
      operator_issuer: "SYNTHETIC",
      operator_value: s.literal,
      operator_literal: s.literal,
      service_number: s.literal,
      service_literal: s.literal,
      codeshare_operating_key: null,
    }));
    const query =
      leg.origin.navigationTarget?.query ??
      leg.origin.airportName ??
      leg.origin.airportCode;
    return {
      id: leg.id,
      flight: {
        canonical: event,
        services,
        numberLiteral: leg.flightNumberLiteral,
        supplemental: {
          endpoints: {
            ORIGIN: descriptiveAirport(leg.origin),
            DESTINATION: descriptiveAirport(leg.destination),
          },
        },
      },
      bookingRefs: leg.bookingSummaries
        ?.filter((b) => b.visible && b.confirmationCode)
        .map((b) => b.confirmationCode!),
      seats: leg.seatSummaries?.filter((s) => s.visible).map((s) => s.seat),
      documents: docs(leg.documentSummaries),
      ...(query ? { map: () => action(query) } : {}),
      ...(leg.origin.navigationTarget?.qualification === "SYNTHETIC_QUALIFIED_PLACE"
        ? { navigate: () => action(query ?? "") }
        : {}),
    };
  });
  const commonDocs = docs(sample.documentSummaries);
  const documents = readableDocuments([commonDocs, allDocs]);
  for (const leg of legs) {
    leg.documents = leg.documents.flatMap(
      (doc) => documents.find((d) => d.id === doc.id) ?? [],
    );
  }
  const preview = () => action(sample.title);
  const expenseAction = (label: string) => () => {
    const bookings = sample.bookingSummaries?.filter((b) => b.visible) ?? [];
    if (bookings.length > 1)
      action(
        t("bookingRead.chooseBooking"),
        undefined,
        bookings.map((b) => ({
          id: b.id,
          version: "1",
          title: b.title ?? b.confirmationCode ?? t("bookingRead.booking"),
          onOpen: () => action(label, b.title ?? b.confirmationCode),
        })),
      );
    else action(label, bookings[0]?.title ?? bookings[0]?.confirmationCode);
  };
  const journey: FlightJourneyRead = {
    id: sample.id,
    legs,
    documents,
    ...(sample.participation
      ? { participation: { ...sample.participation, onOpen: preview } }
      : {}),
    note: sample.note,
    photoIds: sample.linkedPhotoIds,
    expenseIds: sample.linkedExpenseIds,
    onPhotos: preview,
    onExpenses: preview,
    onDocuments: () => action(t("fidelity.attachmentsTitle"), undefined, documents),
    onEdit: preview,
    addPhoto: preview,
    addAttachment: preview,
    addExpense: expenseAction(t("fidelity.addExpense")),
    linkExpense: expenseAction(t("fidelity.linkExpense")),
  };
  const base = scenario(
    "p2-fidelity-only",
    pack.trip.title,
    legs.map((l) => l.flight.canonical),
  );
  // Frozen reference/model.js supplies this synthetic Trip calendar.
  const referenceDates = Array.from(
    { length: 10 },
    (_, i) => `2027-01-${String(16 + i).padStart(2, "0")}`,
  );
  const dates = [
    ...new Set([
      ...referenceDates,
      sample.date,
      ...legs.flatMap((l) =>
        l.flight.canonical.boundaries.flatMap((b) =>
          b.local_date ? [b.local_date] : [],
        ),
      ),
    ]),
  ].sort();
  const instant =
    pack.clockPresets[clock === "future" || clock === "past" ? clock : "today"];
  return {
    ...base,
    journey,
    locationSummary: pack.trip.destinations
      .map((d) => d.displayLabel.split(",")[0])
      .join(" · "),
    instant,
    selectedDate: dates[0],
    dates,
    dateRange: { start: dates[0], end: dates[dates.length - 1] },
    renderer: (props) => {
      const leg = legs.find((l) => l.id === props.row.item.event.id);
      if (!leg) return null;
      return createElement(FlightLegRow, {
        leg: {
          ...leg,
          onDocuments: () =>
            action(t("fidelity.attachmentsTitle"), undefined, leg.documents),
        },
        journey,
        focused: props.depth === "F",
        context: props.context ?? "UNKNOWN",
        hideDivider: props.nextFocused,
        onFocus: () => props.onDepth(props.depth === "F" ? "B" : "F"),
        onOpen: () => open(leg.id),
        onInsert: (side) =>
          insert(
            leg.id,
            leg.flight.canonical.boundaries[0].local_date ?? sample.date,
            side,
          ),
      });
    },
  };
}

export function flightFidelityFocusKey(fixture: FixtureContribution, legId: string) {
  return fixture.dates
    .flatMap(
      (date) =>
        composeDayStream(
          itemsForLocalDate(fixture.projection, date, fixture.zone),
          fixture.instant,
          { occurrenceFocus: true },
        ).rows,
    )
    .find((row) => row.item.event.id === legId)?.focusKey;
}
