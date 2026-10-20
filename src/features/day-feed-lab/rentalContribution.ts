import {
  itinerary_eventsSchema,
  trip_rental_detailsSchema,
  trip_rental_placesSchema,
} from "@/domain/trip/tripCoreV2";
import { emptyCoreGraph, type CoreActor } from "@/domain/trip/tripCoreV2Mutation";
import { coreDateBoundary } from "@/domain/trip/tripCoreV2Temporal";
import { projectCoreP4Feed } from "@/domain/trip/tripCoreV2P4DayFeed";
import { createCoreRentalRenderer } from "@/features/day-feed/coreRentalRenderer";
import { t } from "@/ui/locale";
import { scenario } from "./fixtureFacts";
import type { FixtureContribution } from "./contribution";

type TemporalCase = "FUTURE" | "TODAY" | "TODAY_RETURN" | "PAST" | "SAME_DAY";
const ordinal = {
  FUTURE: "4",
  TODAY: "5",
  TODAY_RETURN: "7",
  PAST: "6",
  SAME_DAY: "8",
} as const;
const instant = {
  FUTURE: "2027-01-14T12:00:00Z",
  TODAY: "2027-01-15T12:00:00Z",
  TODAY_RETURN: "2027-01-18T12:00:00Z",
  PAST: "2027-01-19T12:00:00Z",
  SAME_DAY: "2027-01-15T12:00:00Z",
} as const;
const withPrefix = (date: string, prefix: "start" | "end") =>
  Object.fromEntries(
    Object.entries(coreDateBoundary(date))
      .filter(([key]) => key !== "instant")
      .map(([key, value]) => [`${prefix}_${key}`, value]),
  );

// Existing Lab only. These private synthetic rows never enter accepted storage.
export function rentalContribution(temporalCase: TemporalCase): FixtureContribution {
  const suffix = ordinal[temporalCase];
  const tripId = `c0000000-0000-4000-8000-00000000000${suffix}`;
  const ids = [
    `c0000000-0000-4000-8000-00000000001${suffix}`,
    `c0000000-0000-4000-8000-00000000002${suffix}`,
  ];
  const actor: CoreActor = {
    accountId: "c0000000-0000-4000-8000-000000000001",
    tripId,
    personId: null,
    personIds: [],
    active: true,
    canManageShared: false,
  };
  const graph = emptyCoreGraph();
  graph.itinerary_events = ids.map((id, index) =>
    itinerary_eventsSchema.parse({
      ...Object.fromEntries(
        Object.keys(itinerary_eventsSchema.shape).map((key) => [key, null]),
      ),
      id,
      trip_id: tripId,
      owner_account_id: actor.accountId,
      semantic_revision: 1,
      visibility: "PRIVATE",
      created_at: "2027-01-01T00:00:00Z",
      updated_at: "2027-01-01T00:00:00Z",
      field_state: {},
      business_contract_version: 2,
      experience_family: "P4",
      temporal_contract_version: 1,
      temporal_shape: "SPAN",
      title: t(index ? "p4Lab.vehicleB" : "p4Lab.vehicleA"),
      event_type: "car",
      status: "planned",
      participation_mode: "SELF",
      participant_scope: "ASSIGNED",
      ...withPrefix("2027-01-15", "start"),
      ...withPrefix(temporalCase === "SAME_DAY" ? "2027-01-15" : "2027-01-18", "end"),
      ...(temporalCase === "SAME_DAY"
        ? Object.fromEntries(
            (["start", "end"] as const).flatMap((prefix) => {
              const hour = prefix === "start" ? "09" : "18";
              return [
                [`planned_${prefix}`, `2027-01-15T${hour}:00:00Z`],
                ...Object.entries({
                  local_time: `${hour}:00:00`,
                  clock_precision: 0,
                  quality: "EXACT",
                  basis: "SOURCE_INSTANT",
                  zone_id: "UTC",
                  source_instant: `2027-01-15T${hour}:00:00Z`,
                  source_instant_precision: 0,
                  civil_resolution: null,
                }).map(([key, value]) => [`${prefix}_${key}`, value]),
              ];
            }),
          )
        : {}),
    }),
  );
  graph.trip_rental_details = ids.map((id, index) =>
    trip_rental_detailsSchema.parse({
      event_id: id,
      trip_id: tripId,
      supplier: t("p4Lab.supplier"),
      reserved_category: index ? t("p4Lab.classB") : t("p4Lab.classA"),
      or_similar: true,
      actual_vehicle_model: index ? null : t("p4Lab.actualA"),
      verified_plate: index ? null : "QA-P4-001",
    }),
  );
  graph.trip_rental_places = ids.flatMap((id) =>
    (["PICKUP", "RETURN"] as const).map((role) =>
      trip_rental_placesSchema.parse({
        ...Object.fromEntries(
          Object.keys(trip_rental_placesSchema.shape).map((key) => [key, null]),
        ),
        event_id: id,
        trip_id: tripId,
        role,
        authored_label: t(role === "PICKUP" ? "p4Lab.pickupPlace" : "p4Lab.returnPlace"),
        accepted_address: t(
          role === "PICKUP" ? "p4Lab.pickupAddress" : "p4Lab.returnAddress",
        ),
      }),
    ),
  );
  const projection = projectCoreP4Feed(
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
  const base = scenario(
    tripId,
    t(`p4Lab.scenario.${temporalCase === "SAME_DAY" ? "TODAY" : temporalCase}`),
    projection.events,
  );
  return {
    ...base,
    projection: { ...base.projection, accountId: actor.accountId },
    dateRange: { start: "2027-01-15", end: "2027-01-18" },
    dates: ["2027-01-15", "2027-01-16", "2027-01-18"],
    selectedDate: temporalCase === "TODAY_RETURN" ? "2027-01-18" : "2027-01-15",
    instant: instant[temporalCase],
    metadata: {
      summary: t("p4Lab.proof"),
      expected: ["PICKUP/TNS", "NO_DAILY_BASE", "RETURN/TNS", "SEPARATE_VEHICLES"],
    },
    query: projection.query,
    renderer: createCoreRentalRenderer(projection),
  };
}
