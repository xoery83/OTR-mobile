import { t } from "@/ui/locale";
import type { DayBoundary, DayEvent } from "@/domain/trip/dayReadModel";
import type { FixtureContribution } from "./contribution";

// Synthetic read facts only. This catalog is never admitted to canonical storage.
const spatial = {
  authored_label: null,
  authored_text: null,
  authored_address: null,
  accepted_address: null,
  accepted_latitude: null,
  accepted_longitude: null,
  accepted_place_id: null,
  spatial_provenance_refs: null,
  location_input_revision: null,
  authored_address_line1: null,
  authored_address_line2: null,
  authored_address_locality: null,
  authored_address_region: null,
  authored_address_postal_code: null,
  authored_address_country: null,
  accepted_address_line1: null,
  accepted_address_line2: null,
  accepted_address_locality: null,
  accepted_address_region: null,
  accepted_address_postal_code: null,
  accepted_address_country: null,
};
export function boundary(
  role: DayBoundary["role"],
  date: string,
  hour?: string,
  label?: string,
): DayBoundary {
  const instant = hour ? `${date}T${hour}:00Z` : null;
  return {
    ...spatial,
    role,
    instant,
    local_date: date,
    local_time: hour ? `${hour}:00` : null,
    clock_precision: hour ? 0 : null,
    quality: hour ? "EXACT" : "UNKNOWN",
    basis: hour ? "SOURCE_INSTANT" : null,
    zone_id: hour ? "UTC" : null,
    source_instant: instant,
    source_instant_precision: hour ? 0 : null,
    supplied_offset_seconds: null,
    civil_resolution: null,
    resolution_offset_seconds: null,
    interpretation_key: null,
    interpretation_input_sha256: null,
    provenance_refs: null,
    authored_label: label ?? null,
  };
}
export function place(
  id: string,
  title: string,
  date: string,
  start?: string,
  end?: string,
): DayEvent {
  return {
    ...spatial,
    id,
    title,
    semantic_revision: 1,
    event_type: "activity",
    status: "planned",
    order_index: null,
    trip_day_id: null,
    temporal_shape: end ? "SPAN" : "POINT",
    participant_scope: "UNASSIGNED",
    timing_label: null,
    timing_provenance_ref: null,
    is_estimated_time: false,
    boundaries: [boundary("START", date, start), boundary("END", date, end)],
  };
}
export function flight(id: string, date: string, start?: string, end?: string): DayEvent {
  return {
    ...place(id, t("dayLab.fixture0"), date),
    event_type: "flight",
    temporal_shape: "TRANSPORT",
    boundaries: [
      boundary("ORIGIN", date, start, start ? t("dayLab.fixture1") : undefined),
      boundary("DESTINATION", date, end, end ? t("dayLab.fixture2") : undefined),
    ],
  };
}
export function scenario(
  id: string,
  title: string,
  events: DayEvent[],
): FixtureContribution {
  return {
    version: "day-feed-lab/1",
    synthetic: true,
    metadata: { summary: title, expected: [] },
    dateRange: { start: "2027-01-15", end: "2027-01-17" },
    selectedDate: "2027-01-15",
    id,
    title,
    dates: ["2027-01-15", "2027-01-16", "2027-01-17"],
    zone: "UTC",
    instant: "2027-01-15T12:00:00Z",
    projection: {
      accountId: "day-lab-synthetic-account",
      tripId: id,
      version: 1,
      generation: 1,
      source: {
        epochId: "day-lab-synthetic-epoch",
        revision: "1",
        fingerprint: "day-lab-dl1",
        appliedGeneration: 1,
      },
      events,
    },
    services: {},
  };
}
