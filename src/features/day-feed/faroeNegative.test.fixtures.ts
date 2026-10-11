// Test-only builders copied from the accepted presentation suite. No runtime caller.
import type { DayBoundary, DayEvent, DayProjection } from "@/domain/trip/dayReadModel";
import type { FlightService } from "@/domain/trip/flightAdmission";
export const blankBoundary = {
  instant: null,
  local_date: null,
  local_time: null,
  clock_precision: null,
  quality: null,
  basis: null,
  zone_id: null,
  supplied_offset_seconds: null,
  source_instant: null,
  source_instant_precision: null,
  civil_resolution: null,
  resolution_offset_seconds: null,
  interpretation_key: null,
  interpretation_input_sha256: null,
  provenance_refs: null,
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
  instant: string | null = null,
  fields: Partial<DayBoundary> = {},
): DayBoundary {
  return {
    ...blankBoundary,
    role,
    instant,
    quality: instant ? "EXACT" : "UNKNOWN",
    basis: instant ? "SOURCE_INSTANT" : "DERIVED_CIVIL",
    source_instant: instant,
    ...fields,
  };
}
export function event(
  id = "a",
  shape: DayEvent["temporal_shape"] = "POINT",
  start: string | null = null,
  end: string | null = null,
): DayEvent {
  return {
    ...blankBoundary,
    id,
    semantic_revision: 1,
    title: id,
    event_type: "activity",
    status: "planned",
    order_index: null,
    trip_day_id: null,
    temporal_shape: shape,
    participant_scope: "UNASSIGNED",
    timing_label: null,
    timing_provenance_ref: null,
    is_estimated_time: false,
    boundaries:
      shape === "TRANSPORT"
        ? [boundary("ORIGIN", start), boundary("DESTINATION", end)]
        : [boundary("START", start), boundary("END", end)],
  };
}
export function projection(...events: DayEvent[]): DayProjection {
  return {
    accountId: "a",
    tripId: "t",
    version: 1,
    generation: 1,
    source: { epochId: "e", revision: "1", fingerprint: "hash", appliedGeneration: 1 },
    events,
  };
}

// These new values are synthetic. S/Q/TC references describe patterns, not factual mappings.
export const syntheticDate = "2027-02-03";
export const syntheticService: FlightService = {
  service_key: "primary",
  transport_subtype: "FLIGHT",
  attribution: "UNSPECIFIED",
  operator_namespace: "IATA_AIRLINE",
  operator_issuer: "IATA",
  operator_value: "NZ",
  operator_literal: "NZ",
  service_number: "901",
  service_literal: "NZ901",
  codeshare_operating_key: null,
};
export function faroeNegativeFixtures() {
  const before = event("f1-poi-before", "POINT", `${syntheticDate}T08:00:00Z`);
  before.title = "Synthetic harbour walk · 港口 · promenade";
  before.authored_address = "Synthetic quay";
  before.order_index = 1;
  const segment = event(
    "f1-flight",
    "TRANSPORT",
    `${syntheticDate}T10:00:00Z`,
    `${syntheticDate}T12:00:00Z`,
  );
  segment.title = "Synthetic NZ901 flight";
  segment.event_type = "flight";
  segment.order_index = 2;
  segment.boundaries[0].authored_label = "Synthetic origin airport";
  segment.boundaries[1].authored_label = "Synthetic destination airport";
  const after = event("f1-poi-after", "POINT", `${syntheticDate}T14:00:00Z`);
  after.title = before.title; // Equal labels do not establish Event identity.
  after.order_index = 3;
  const incomplete = event("f1-flight-incomplete", "TRANSPORT");
  incomplete.event_type = "flight";
  incomplete.title = "Synthetic incomplete flight";
  incomplete.order_index = 4;
  for (const e of [before, segment, after]) {
    for (const b of e.boundaries) {
      if (!b.instant) continue;
      b.local_date = syntheticDate;
      b.local_time = b.instant.slice(11, 19);
      b.clock_precision = 0;
      b.source_instant_precision = 0;
      b.zone_id = "UTC";
    }
  }
  for (const b of incomplete.boundaries) b.local_date = syntheticDate;
  const civil = structuredClone(segment);
  civil.id = "f1-flight-civil-only";
  civil.boundaries.forEach((b) => {
    b.instant = null;
    b.source_instant = null;
    b.source_instant_precision = null;
    b.zone_id = null;
    b.basis = "DERIVED_CIVIL";
    b.clock_precision = -1;
    b.local_time = b.local_time!.slice(0, 5);
    b.civil_resolution = "PENDING";
  });
  return {
    before,
    segment,
    after,
    incomplete,
    civil,
    day: projection(before, segment, after),
    services: { [segment.id]: [structuredClone(syntheticService)] },
    untrusted: {
      ledgerReference: "L-0806-XX",
      amount: "",
      bookingStatus: null,
      travelerIds: null,
      documentIds: null,
      privateCanary: "F1_SYNTHETIC_PRIVATE_CANARY",
    },
  };
}
export const fixtureProvenance = {
  observed: ["S-ID/hash references only; screenshots were not transcribed during F1"],
  transcribed: ["F0 scenario descriptions; no private names or source text copied"],
  derived: ["Ordering/durations computed only from explicit synthetic test facts"],
  synthetic: [
    "All Event/Trip/Account IDs, dates, instants, labels, services and addresses",
  ],
  unknown: [
    "bookingStatus",
    "travelerIds",
    "documentIds",
    "amount",
    "terminal",
    "gate",
    "attendance",
  ],
  cases: [
    "TC02",
    "TC03",
    "TC07",
    "TC08",
    "TC11",
    "TC12",
    "TC13",
    "TC15",
    "TC16",
    "TC17",
    "TC20",
    "TC22",
  ],
  sourceIds: ["S02", "S03", "S14", "S17", "S22", "S24", "S25", "S26", "S27", "S29"],
  admission: "TEST_DOUBLE_ONLY_NOT_REAL_FAROE",
} as const;
