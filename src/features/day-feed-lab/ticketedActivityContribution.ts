import {
  itinerary_eventsSchema,
  trip_activity_detailsSchema,
  trip_activity_entry_placesSchema,
} from "@/domain/trip/tripCoreV2";
import { emptyCoreGraph, type CoreActor } from "@/domain/trip/tripCoreV2Mutation";
import { projectCoreP6Feed } from "@/domain/trip/tripCoreV2P6DayFeed";
import { bindRenderer } from "@/features/day-feed/rendererContribution";
import { coreTicketedActivityFacts } from "@/features/day-feed/coreTicketedActivityRenderer";
import {
  TicketedActivityRow,
  type TicketedActivityFacts,
} from "@/features/day-feed/TicketedActivityRow";
import { t } from "@/ui/locale";
import { scenario } from "./fixtureFacts";
import type { FixtureContribution } from "./contribution";

type Period = "FUTURE" | "TODAY" | "PAST" | "TNS";
const suffix = { FUTURE: "1", TODAY: "2", PAST: "3", TNS: "4" } as const;
const instant = {
  FUTURE: "2027-01-14T12:00:00Z",
  TODAY: "2027-01-15T12:00:00Z",
  PAST: "2027-01-18T12:00:00Z",
  TNS: "2027-01-14T12:00:00Z",
} as const;
const defaults = <T extends { shape: Record<string, unknown> }>(schema: T) =>
  Object.fromEntries(Object.keys(schema.shape).map((key) => [key, null]));

// Synthetic presentation data only. Required meeting time is deliberately a
// Lab-only supplied fact because accepted Core lacks a typed field for it.
export function ticketedActivityContribution(period: Period): FixtureContribution {
  const ending = suffix[period];
  const tripId = `e1000000-0000-4000-8000-00000000000${ending}`;
  const accountId = "e1000000-0000-4000-8000-000000000000";
  const eventId = `e1000000-0000-4000-8000-00000000001${ending}`;
  const actor: CoreActor = {
    accountId,
    tripId,
    personId: null,
    personIds: [],
    active: true,
    canManageShared: false,
  };
  const graph = emptyCoreGraph();
  graph.itinerary_events = [
    itinerary_eventsSchema.parse({
      ...defaults(itinerary_eventsSchema),
      id: eventId,
      trip_id: tripId,
      owner_account_id: accountId,
      semantic_revision: 1,
      visibility: "PRIVATE",
      created_at: "2027-01-01T00:00:00Z",
      updated_at: "2027-01-01T00:00:00Z",
      field_state: {},
      business_contract_version: 2,
      experience_family: "P6",
      temporal_contract_version: 1,
      temporal_shape: "POINT",
      title: t("p6Lab.title"),
      event_type: "activity",
      status: "planned",
      participation_mode: "SELF",
      participant_scope: "ASSIGNED",
      start_local_date: "2027-01-15",
      start_local_time: "09:00:00",
      start_clock_precision: 0,
      start_quality: period === "TNS" ? "ESTIMATED" : "EXACT",
      start_basis: period === "TNS" ? "DERIVED_CIVIL" : "SOURCE_INSTANT",
      start_zone_id: "UTC",
      start_civil_resolution: period === "TNS" ? "PENDING" : "UNIQUE",
      ...(period !== "TNS"
        ? {
            start_source_instant: "2027-01-15T09:00:00Z",
            start_source_instant_precision: 0,
            planned_start: "2027-01-15T09:00:00Z",
          }
        : {}),
      authored_label: t("p6Lab.venue"),
    }),
  ];
  graph.trip_activity_details = [
    trip_activity_detailsSchema.parse({
      event_id: eventId,
      trip_id: tripId,
      session_label: null,
      admission_note: null,
    }),
  ];
  graph.trip_activity_entry_places = [
    trip_activity_entry_placesSchema.parse({
      ...defaults(trip_activity_entry_placesSchema),
      event_id: eventId,
      trip_id: tripId,
      role: "ENTRY",
      authored_label: t("p6Lab.venue"),
    }),
  ];
  const projection = projectCoreP6Feed(
    graph,
    actor,
    {
      generation: 1,
      epoch: "synthetic",
      revision: "1",
      accessRevision: 1,
      actorPersonBindingHash: "synthetic",
      participatingRosterHash: "synthetic",
      manifestSha256: "synthetic",
    },
    [],
  );
  const facts = coreTicketedActivityFacts(projection);
  const baseFacts = facts[eventId];
  const syntheticFacts: TicketedActivityFacts = {
    ...baseFacts,
    ...(period === "FUTURE" || period === "TODAY"
      ? {
          requiredArrival: {
            date: "2027-01-15",
            time: "08:30",
            label: t("p6Lab.meet"),
            place: baseFacts.entryPlace,
          },
        }
      : {}),
  };
  const base = scenario(tripId, t(`p6Lab.scenario.${period}`), projection.events);
  return {
    ...base,
    projection: { ...base.projection, accountId },
    dateRange: { start: "2027-01-15", end: "2027-01-15" },
    dates: ["2027-01-15"],
    selectedDate: "2027-01-15",
    instant: instant[period],
    metadata: {
      summary: t("p6Lab.proof"),
      expected: ["ENTRY_BEFORE_START", "NO_FAKE_TICKET", "TNS_CLOCK_VISIBLE"],
    },
    query: projection.query,
    renderer: bindRenderer({
      version: "day-feed-renderer/1",
      family: "P6",
      facts: { [eventId]: syntheticFacts },
      render: TicketedActivityRow,
    }),
  };
}
