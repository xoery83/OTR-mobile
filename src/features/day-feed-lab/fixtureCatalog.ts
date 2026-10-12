import { t } from "@/ui/locale";
import type { DayBoundary, DayEvent, DayProjection } from "@/domain/trip/dayReadModel";
import type { FlightService } from "@/domain/trip/flightAdmission";

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
function boundary(
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
function place(
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
function flight(id: string, date: string, start?: string, end?: string): DayEvent {
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
export type LabScenario = {
  id: string;
  title: string;
  dates: readonly string[];
  zone: string;
  instant: string;
  projection: DayProjection;
  services: Record<string, FlightService[]>;
};
function scenario(id: string, title: string, events: DayEvent[]): LabScenario {
  return {
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
const first = "2027-01-15",
  second = "2027-01-16";
export function getFixtureCatalog(): readonly LabScenario[] {
  return [
    scenario("day-lab-nelson", t("dayLab.fixture3"), [
      place("nelson-walk", t("dayLab.fixture4"), first, "11:00", "13:00"),
      place("nelson-lookout", t("dayLab.fixture5"), first, "15:00"),
      ...Array.from({ length: 8 }, (_, i) =>
        place(
          `nelson-stop-${i}`,
          t("dayLab.trailStop", { number: i + 1 }),
          first,
          `${16 + i}:00`,
        ),
      ),
      place("nelson-day-two", t("dayLab.fixture6"), second, "09:00"),
    ]),
    scenario("day-lab-faroe", t("dayLab.fixture7"), [
      place("faroe-harbour", t("dayLab.fixture8"), first, "09:00"),
      flight("faroe-flight", first, "11:00", "13:00"),
      place("faroe-date-only", t("dayLab.fixture9"), first),
      place("faroe-day-two", t("dayLab.fixture10"), second, "10:00"),
    ]),
    scenario("day-lab-europe", t("dayLab.fixture11"), [
      flight("europe-flight", first, "10:00", "13:00"),
      place("europe-square", t("dayLab.fixture12"), first, "15:00"),
      flight("europe-unknown-arrival", second, "10:00"),
    ]),
    scenario("day-lab-urban", t("dayLab.fixture13"), [
      place("urban-museum", t("dayLab.fixture14"), first, "11:00", "13:00"),
      {
        ...place("urban-dining", t("dayLab.fixture15"), first, "18:00"),
        event_type: "meal",
      },
      place("urban-park", t("dayLab.fixture16"), second),
    ]),
    scenario("day-lab-sparse", t("dayLab.fixture17"), [
      place("sparse-date-only", t("dayLab.fixture18"), second),
      flight("sparse-flight", second),
    ]),
  ];
}

// Trip changes reset to its first date; date changes are bounded to the catalog.
export function selectLabContext(
  tripId: string,
  date?: string,
  catalog = getFixtureCatalog(),
) {
  const trip = catalog.find((entry) => entry.id === tripId);
  if (!trip || (date !== undefined && !trip.dates.includes(date)))
    throw new Error("DAY_LAB_CONTEXT");
  return { trip, date: date ?? trip.dates[0] };
}
