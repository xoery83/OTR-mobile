import pack from "./fixtures/p5-fidelity-v1.json";
import type { ScheduledTransportFacts } from "@/features/day-feed/ScheduledTransportRow";
import { t } from "@/ui/locale";

// Diagnostics only: this exact frozen package is never installed in Core/SQLite.
// All original actions are synthetic intents; no network, custody or real ticket open.
type Endpoint = {
  date?: string;
  time?: string;
  zone?: string;
  place?: { name?: string; address?: string };
};
type Segment = {
  id: string;
  visible: boolean;
  name: string;
  mode: string;
  operator?: string;
  departure: Endpoint;
  arrival: Endpoint;
  serviceNumber?: string;
  duration?: { minutes: number; basis: string };
  facts?: {
    visible: boolean;
    label: string;
    value: string;
    language?: string;
    evidence?: string;
    semantic?: string;
  }[];
  passengers?: {
    id: string;
    visible: boolean;
    name: string;
    seat?: string;
    coach?: string;
  }[];
  participants?: { visible: boolean; mode: string };
  booking?: { id: string; visible: boolean; ref: string };
  ticketIds?: string[];
  relatedSegmentIds?: string[];
  contact?: string;
  instructions?: string;
  note?: string;
  photos?: { id: string; visible: boolean; segmentId: string }[];
  documents?: {
    id: string;
    visible: boolean;
    title: string;
    canOpenOriginal?: boolean;
  }[];
  expenses?: { id: string; visible: boolean; coverageSegmentIds: string[] }[];
};
type Ticket = {
  id: string;
  title: string;
  visible: boolean;
  classification: string;
  segmentIds: string[];
  canOpenOriginal: boolean;
  requiresSelection?: boolean;
  access: "availableOffline" | "onlineRequired" | "notDownloaded" | "unavailable";
};
export type P5FixtureScenario = {
  id: string;
  label: string;
  segments: Segment[];
  tickets: Ticket[];
};
export const transportFidelityScenarios = pack.scenarios as P5FixtureScenario[];
const modes: Record<string, string> = {
  train: "TRAIN",
  bus: "BUS",
  coach: "BUS",
  ferry: "FERRY",
  waterTaxi: "WATER_TAXI",
  shuttle: "SHUTTLE",
  privateTransfer: "TRANSFER",
  taxi: "TAXI",
  cableCar: "CABLE_CAR",
  custom: "OTHER",
};
const endpoint = (value: Endpoint) => ({
  date: value.date,
  time: value.time,
  zone: value.zone,
  ...(value.place
    ? {
        place: {
          qualification: "TEXT_ONLY" as const,
          authoredLabel: value.place.name,
          authoredAddress: value.place.address,
        },
      }
    : {}),
});
export type P5FixtureIntent = {
  kind: "ticket" | "document" | "segment" | "contact";
  id: string;
};
export function transportFidelityFacts(
  scenarioId: string,
  segmentId?: string,
  onIntent?: (intent: P5FixtureIntent) => void,
): ScheduledTransportFacts {
  const scenario = transportFidelityScenarios.find((value) => value.id === scenarioId);
  const item = scenario?.segments.find(
    (value) => value.visible && (!segmentId || value.id === segmentId),
  );
  if (!scenario || !item) throw new Error("P5_FIXTURE_NOT_FOUND");
  const eligible = new Set(item.ticketIds ?? []);
  const open = (kind: P5FixtureIntent["kind"], id: string) =>
    onIntent ? () => onIntent({ kind, id }) : undefined;
  return {
    family: "P5",
    title: item.name,
    subtype: modes[item.mode] ?? "OTHER",
    operator: item.operator,
    origin: endpoint(item.departure),
    destination: endpoint(item.arrival),
    service: item.serviceNumber,
    // Only explicitly sourced fixture duration, never endpoint-clock subtraction.
    duration:
      item.duration && item.duration.basis === "SYNTHETIC_SOURCE_DURATION"
        ? t("flight.duration", {
            hours: Math.floor(item.duration.minutes / 60),
            minutes: item.duration.minutes % 60,
          })
        : undefined,
    dynamicBoarding: item.facts
      ?.filter((value) => value.visible)
      .map(({ visible: _visible, ...value }) => value),
    passengers: item.passengers?.filter((value) => value.visible),
    participants:
      item.participants?.visible && item.participants.mode === "WHOLE_GROUP"
        ? [t("settlement.everyone")]
        : undefined,
    bookingMarker: item.booking?.visible ? item.booking.ref : undefined,
    instructions: item.instructions,
    onCall: item.contact ? open("contact", item.id) : undefined,
    note: item.note,
    tickets: scenario.tickets
      .filter(
        (value) =>
          value.visible &&
          value.classification === "TICKET" &&
          eligible.has(value.id) &&
          value.segmentIds.includes(item.id),
      )
      .map((value) => ({
        id: value.id,
        title: value.title,
        requiresSelection: value.requiresSelection,
        access: value.access,
        onOpen:
          value.canOpenOriginal &&
          ["availableOffline", "onlineRequired"].includes(value.access)
            ? open("ticket", value.id)
            : undefined,
      })),
    documents: item.documents
      ?.filter((value) => value.visible)
      .map((value) => ({
        id: value.id,
        title: value.title,
        onOpen: value.canOpenOriginal ? open("document", value.id) : undefined,
      })),
    relatedSegments: item.booking?.visible
      ? item.relatedSegmentIds?.flatMap((id) => {
          const other = scenario.segments.find(
            (value) =>
              value.visible &&
              value.id === id &&
              value.booking?.visible &&
              value.booking.id === item.booking!.id,
          );
          return other ? [{ id, title: other.name, onOpen: open("segment", id) }] : [];
        })
      : undefined,
    photos: {
      count:
        item.photos?.filter((photo) => photo.visible && photo.segmentId === item.id)
          .length ?? 0,
      previews: [],
    },
    expenseCount: new Set(
      item.expenses
        ?.filter((value) => value.visible && value.coverageSegmentIds.includes(item.id))
        .map((value) => value.id),
    ).size,
  };
}
