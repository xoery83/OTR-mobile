import { t } from "@/ui/locale";
import { itemsForLocalDate } from "@/domain/trip/dayReadModel";
import {
  itinerary_eventsSchema,
  trip_stay_detailsSchema,
} from "@/domain/trip/tripCoreV2";
import { emptyCoreGraph, type CoreActor } from "@/domain/trip/tripCoreV2Mutation";
import { projectCoreDay } from "@/domain/trip/tripCoreV2Day";
import { projectCoreItem } from "@/domain/trip/tripCoreV2Views";
import { coreDateBoundary } from "@/domain/trip/tripCoreV2Temporal";
import type { FixtureContribution } from "./contribution";
import { scenario, place, boundary } from "./fixtureFacts";

export const stayTripId = "c0000000-0000-4000-8000-000000000003";
export type StaySupplement = Readonly<{
  family: "P3";
  propertyName?: string;
  checkin: string;
  checkout: string;
  nights: number;
  instructions: string;
}>;
export function stayContribution(): FixtureContribution<StaySupplement> {
  const itemId = "c0000000-0000-4000-8000-000000000013";
  const actor: CoreActor = {
    accountId: "c0000000-0000-4000-8000-000000000001",
    tripId: stayTripId,
    personId: null,
    personIds: [],
    active: true,
    canManageShared: false,
  };
  const checkin = "2027-01-15",
    checkout = "2027-01-18";
  const graph = emptyCoreGraph();
  const root = itinerary_eventsSchema.parse({
    ...Object.fromEntries(
      Object.keys(itinerary_eventsSchema.shape).map((key) => [key, null]),
    ),
    id: itemId,
    trip_id: actor.tripId,
    owner_account_id: actor.accountId,
    semantic_revision: 1,
    visibility: "PRIVATE",
    created_at: "2027-01-01T00:00:00Z",
    updated_at: "2027-01-01T00:00:00Z",
    field_state: {},
    business_contract_version: 2,
    experience_family: "P3",
    temporal_contract_version: 1,
    temporal_shape: "STAY",
    title: t("dayLab.stayProperty"),
    event_type: "hotel",
    status: "planned",
    participation_mode: "SELF",
    participant_scope: "ASSIGNED",
    ...Object.fromEntries(
      Object.entries(coreDateBoundary(checkin))
        .filter(([k]) => k !== "instant")
        .map(([k, v]) => [`start_${k}`, v]),
    ),
    ...Object.fromEntries(
      Object.entries(coreDateBoundary(checkout))
        .filter(([k]) => k !== "instant")
        .map(([k, v]) => [`end_${k}`, v]),
    ),
  });
  graph.itinerary_events = [root];
  graph.trip_stay_details = [
    trip_stay_detailsSchema.parse({
      event_id: itemId,
      trip_id: actor.tripId,
      property_name: t("dayLab.stayProperty"),
      permitted_checkin_from: null,
      permitted_checkin_until: null,
      permitted_checkout_by: null,
    }),
  ];
  const item = projectCoreItem(graph, actor, itemId)!;
  const supplemental: StaySupplement = {
    family: "P3",
    checkin,
    checkout,
    ...(typeof item.details.propertyName === "string"
      ? { propertyName: item.details.propertyName }
      : {}),
    nights: Number(item.details.nights),
    instructions: t("dayLab.stayInstructions"),
  };
  const event = {
    ...place(itemId, root.title, checkin),
    event_type: "hotel" as const,
    temporal_shape: "STAY" as const,
    boundaries: [boundary("START", checkin), boundary("END", checkout)],
  };
  const base = scenario(stayTripId, t("dayLab.stayScenario"), [event]);
  const projection = { ...base.projection, accountId: actor.accountId };
  return {
    ...base,
    projection,
    dates: [checkin, "2027-01-16", "2027-01-17", checkout],
    dateRange: { start: checkin, end: checkout },
    selectedDate: "2027-01-16",
    supplemental,
    metadata: {
      summary: t("dayLab.stayProof"),
      expected: [
        "CHECKIN/TNS",
        "TONIGHT/BASE",
        "CHECKOUT/TNS",
        "MISSING_ADDRESS",
        "SHARED_FOCUS_IMMERSIVE",
      ],
    },
    // shortcut: fixture-only P3 bridge, replace with an owning accepted generic Core Feed adapter before real Stay reads.
    query(date, zone) {
      const coreRows = projectCoreDay(graph, actor, date, 1);
      const events = coreRows.length
        ? [
            {
              ...event,
              temporal_shape: "POINT" as const,
              boundaries: [boundary("START", date)],
            },
          ]
        : [];
      return {
        ...itemsForLocalDate({ ...projection, events }, date, zone),
        unresolved: [],
        coreRows,
      };
    },
  };
}
