import { describe, it, expect } from "vitest";
import {
  flightCommandLeaves,
  validateFlightCommand,
  matchFlightV1,
  type FlightEndpoint,
  type FlightService,
  type FlightOccurrenceAnchor,
  type FlightMatchScope,
} from "./flightAdmission";
import { flightReviewSchema } from "./flightImportReview";
import { eventIntentCodec } from "../../../backend/src/tripEventIntent";
const id = "12345678-1234-4234-8234-123456789012";
const sourceRef = (key: string) => ({
  kind: "TRACK_C",
  ref: `track-c/field-evidence/${id}/${key}`,
});
const service: FlightService = {
  service_key: "primary",
  transport_subtype: "FLIGHT",
  attribution: "UNSPECIFIED",
  operator_namespace: "IATA_AIRLINE",
  operator_issuer: "IATA",
  operator_value: "NZ",
  operator_literal: "NZ",
  service_number: "0289A",
  service_literal: "NZ0289A",
  codeshare_operating_key: null,
};
const origin: FlightEndpoint = {
  time: {
    local_date: "2026-12-18",
    local_time: "09:00",
    clock_precision: -1,
    quality: "EXACT",
    basis: "SOURCE_INSTANT",
    zone_id: null,
    supplied_offset_seconds: 46800,
    source_instant: "2026-12-17T20:00:00Z",
    source_instant_precision: -1,
    fold_choice: null,
  },
  location: { authored_label: "AKL", authored_text: null, accepted_place_id: null },
};
const destination: FlightEndpoint = {
  time: {
    local_date: null,
    local_time: null,
    clock_precision: null,
    quality: "UNKNOWN",
    basis: "DERIVED_CIVIL",
    zone_id: null,
    supplied_offset_seconds: null,
    source_instant: null,
    source_instant_precision: null,
    fold_choice: null,
  },
  location: { authored_label: "CHC", authored_text: null, accepted_place_id: null },
};
function create() {
  const values = {
    title: "NZ0289A",
    origin: structuredClone(origin),
    destination: structuredClone(destination),
    services: [structuredClone(service)],
  };
  return {
    shape: "TRANSPORT",
    eventType: "TRANSPORT",
    subtype: "FLIGHT",
    participantScope: "UNASSIGNED",
    core: { title: values.title },
    origin: values.origin,
    destination: values.destination,
    services: values.services,
    proofs: Object.fromEntries(
      Object.keys(flightCommandLeaves(values)).map((k) => [k, sourceRef(k)]),
    ),
  };
}
function refreshProofs(p: ReturnType<typeof create>) {
  p.proofs = Object.fromEntries(
    Object.keys(
      flightCommandLeaves({
        title: p.core.title,
        origin: p.origin,
        destination: p.destination,
        services: p.services,
      }),
    ).map((k) => [k, sourceRef(k)]),
  );
}
describe("CP13A Temporal A / typed occurrence boundary", () => {
  it("keeps unknown arrival and service zeros/suffix; B intent digest binds exact reviewed leaves", () => {
    const p = create();
    expect(
      validateFlightCommand("CREATE_TRANSPORT", p).values.destination?.time
        .source_instant,
    ).toBeNull();
    const request = {
      contractVersion: 1,
      intentVersion: 1,
      commandVersion: 1,
      command: "CREATE_TRANSPORT",
      operationKey: id,
      actorAccountId: id,
      tripId: id,
      eventId: id,
      baseSemanticRevision: null,
      payload: p,
    };
    const a = eventIntentCodec(JSON.stringify(request));
    expect(a.intentSha256).toHaveLength(64);
    expect(a.canonical).toContain('"service_number":"0289A"');
    expect(a.intentSha256).not.toBe(
      eventIntentCodec(
        JSON.stringify({ ...request, payload: { ...p, core: { title: "Changed" } } }),
      ).intentSha256,
    );
  });
  it("offset arithmetic alone is blocked", () => {
    const p = create();
    p.origin.time.basis = "DERIVED_CIVIL";
    p.origin.time.source_instant = null;
    p.origin.time.source_instant_precision = null;
    refreshProofs(p);
    expect(() => validateFlightCommand("CREATE_TRANSPORT", p)).toThrow();
  });
  it("complete IANA civil tuples require a separately admitted resolver", () => {
    const p = create();
    p.origin.time.zone_id = "Pacific/Auckland";
    refreshProofs(p);
    expect(() => validateFlightCommand("CREATE_TRANSPORT", p)).toThrow();
  });
  it("preserves exact midnight without inventing unknown midnight", () => {
    const p = create();
    p.origin.time.local_time = "00:00";
    refreshProofs(p);
    expect(
      validateFlightCommand("CREATE_TRANSPORT", p).values.origin?.time.local_time,
    ).toBe("00:00");
    expect(p.destination.time.local_time).toBeNull();
  });
  it("validates real Gregorian dates and timestamp source precision", () => {
    for (const date of ["0000-01-01", "2026-02-29", "2026-13-01"]) {
      const p = create();
      p.origin.time.local_date = date;
      refreshProofs(p);
      expect(() => validateFlightCommand("CREATE_TRANSPORT", p)).toThrow();
    }
    const p = create();
    p.origin.time.source_instant = "2026-12-17T20:00:01Z";
    refreshProofs(p);
    expect(() => validateFlightCommand("CREATE_TRANSPORT", p)).toThrow();
  });
  it.each([
    "passengers",
    "bookings",
    "seats",
    "baggage",
    "reservation_id",
    "participantScope",
    "eventType",
    "status",
  ])("rejects unsupported UPDATE key %s", (key) => {
    expect(() =>
      validateFlightCommand("UPDATE_TRANSPORT", {
        changes: { title: "Flight", [key]: "hidden" },
        proofs: { "ROOT.title": sourceRef("ROOT.title") },
      }),
    ).toThrow();
  });
  it("both endpoints update atomically in one typed payload; no generic patch", () => {
    const values = { origin, destination: { ...destination, time: origin.time } };
    const p = {
      changes: values,
      proofs: Object.fromEntries(
        Object.keys(flightCommandLeaves(values)).map((k) => [k, sourceRef(k)]),
      ),
    };
    expect(
      validateFlightCommand("UPDATE_TRANSPORT", p).values.destination?.time
        .source_instant,
    ).toBe(origin.time.source_instant);
    expect(() =>
      validateFlightCommand("UPDATE_TRANSPORT", { changes: {}, proofs: {} }),
    ).toThrow();
  });
  it("rejects missing/unused/forged proofs and JSON duplicate members", () => {
    const p = create();
    delete p.proofs["ROOT.title"];
    expect(() => validateFlightCommand("CREATE_TRANSPORT", p)).toThrow();
    const q = create();
    q.proofs.passengers = sourceRef("passengers");
    expect(() => validateFlightCommand("CREATE_TRANSPORT", q)).toThrow();
    expect(() =>
      eventIntentCodec('{"command":"CREATE_TRANSPORT","command":"CREATE_EVENT"}'),
    ).toThrow();
  });
  it("requires evidenced operating relationship; marketing codes cannot self-reference", () => {
    const p = create();
    p.services[0].codeshare_operating_key = "primary";
    refreshProofs(p);
    expect(() => validateFlightCommand("CREATE_TRANSPORT", p)).toThrow();
  });
});
const anchor: FlightOccurrenceAnchor = {
  eventId: id,
  semanticRevision: 7,
  namespace: "IATA_AIRLINE",
  issuer: "IATA",
  operator: "NZ",
  serviceNumber: "289",
  originDate: "2026-12-18",
  originAirportId: id,
  destinationAirportId: "22345678-1234-4234-8234-123456789012",
  departureClock: "09:00",
  qualified: true,
};
const scope = (): FlightMatchScope => ({
  complete: true,
  current: true,
  proposalsComplete: true,
  lineageComplete: true,
  servicesAtEventBaselines: true,
  occurrences: [{ ...anchor }],
});
describe("import-flight-match-v1 scoped assessment", () => {
  it("unique complete qualified tuple matches independently of passenger/PNR values", () =>
    expect(matchFlightV1(anchor, scope()).assessment).toBe("SAME_ITEM"));
  it.each([
    "complete",
    "current",
    "proposalsComplete",
    "lineageComplete",
    "servicesAtEventBaselines",
  ] as const)("withholds when %s is missing", (key) =>
    expect(matchFlightV1(anchor, { ...scope(), [key]: false }).assessment).toBe(
      "UNRESOLVED_MATCH",
    ),
  );
  it("different dates and reverse routes are distinct scoped occurrences", () => {
    expect(
      matchFlightV1({ ...anchor, originDate: "2026-12-19" }, scope()).assessment,
    ).toBe("NEW_ITEM");
    expect(
      matchFlightV1(
        {
          ...anchor,
          originAirportId: anchor.destinationAirportId,
          destinationAirportId: anchor.originAirportId,
        },
        scope(),
      ).assessment,
    ).toBe("NEW_ITEM");
  });
  it("number-only unknown codeshare is unresolved; verified operating occurrence can match", () => {
    expect(
      matchFlightV1({ ...anchor, operator: "QF", serviceNumber: "123" }, scope())
        .assessment,
    ).toBe("UNRESOLVED_MATCH");
    const s = scope();
    s.occurrences[0].operatingOccurrence = "qualified:NZ:289:2026-12-18:AKL-CHC";
    expect(
      matchFlightV1(
        {
          ...anchor,
          operator: "QF",
          serviceNumber: "123",
          operatingOccurrence: s.occurrences[0].operatingOccurrence,
        },
        s,
      ).assessment,
    ).toBe("SAME_ITEM");
  });
  it("retiming, contradictory dates/route, and same-day competitors require fresh review", () => {
    expect(
      matchFlightV1({ ...anchor, departureClock: "09:30" }, scope()).assessment,
    ).toBe("UNRESOLVED_MATCH");
    expect(matchFlightV1({ ...anchor, contradictory: true }, scope()).assessment).toBe(
      "UNRESOLVED_MATCH",
    );
    const s = scope();
    s.occurrences.push({
      ...anchor,
      eventId: anchor.destinationAirportId,
      departureClock: "09:30",
    });
    expect(matchFlightV1(anchor, s).assessment).toBe("UNRESOLVED_MATCH");
  });
  it("bounded scope fails closed rather than truncating", () => {
    const s = scope();
    s.occurrences = Array.from({ length: 65 }, () => ({ ...anchor }));
    expect(matchFlightV1(anchor, s).reason).toBe("LIMIT");
  });
});

it("scoped supplier occurrence and explicit number supersession cannot cross scope or stale baselines", () => {
  const supplier = {
    namespace: "SUPPLIER_OCCURRENCE",
    issuer: "fixture-supplier",
    value: "occurrence-42",
    scopeId: id,
    verified: true,
  };
  const target = { ...anchor, supplierOccurrence: supplier };
  const s = { ...scope(), occurrences: [target] };
  const changed = { ...anchor, serviceNumber: "291", supplierOccurrence: supplier };
  expect(matchFlightV1(changed, s).assessment).toBe("SAME_ITEM");
  expect(
    matchFlightV1(
      {
        ...changed,
        supplierOccurrence: { ...supplier, scopeId: anchor.destinationAirportId },
      },
      s,
    ).assessment,
  ).toBe("UNRESOLVED_MATCH");
  expect(
    matchFlightV1({ ...anchor, serviceNumber: "291" }, scope(), {
      targetId: id,
      semanticRevision: 7,
      reason: "NUMBER_SUPERSESSION",
      reviewed: true,
    }).assessment,
  ).toBe("SAME_ITEM");
  expect(
    matchFlightV1({ ...anchor, serviceNumber: "291" }, scope(), {
      targetId: id,
      semanticRevision: 6,
      reason: "NUMBER_SUPERSESSION",
      reviewed: true,
    }).assessment,
  ).toBe("UNRESOLVED_MATCH");
  expect(
    matchFlightV1({ ...anchor, departureClock: "09:30" }, scope(), {
      targetId: id,
      semanticRevision: 7,
      reason: "RETIME",
      reviewed: true,
    }).assessment,
  ).toBe("SAME_ITEM");
});
it("nullable clears have exact typed selected-component leaves, while unselected proofs reject", () => {
  const values = { origin: structuredClone(origin) };
  values.origin.location.authored_text = null;
  const leaves = flightCommandLeaves(values);
  const proofs = Object.fromEntries(Object.keys(leaves).map((k) => [k, sourceRef(k)]));
  proofs["ORIGIN.authored_text"] = sourceRef("ORIGIN.authored_text");
  expect(
    validateFlightCommand("UPDATE_TRANSPORT", { changes: values, proofs }).leaves[
      "ORIGIN.authored_text"
    ],
  ).toBeNull();
  proofs["DESTINATION.authored_text"] = sourceRef("DESTINATION.authored_text");
  expect(() =>
    validateFlightCommand("UPDATE_TRANSPORT", { changes: values, proofs }),
  ).toThrow();
});

it.each([
  ["ORIGIN.local_date", "2026-02-29"],
  ["ORIGIN.local_time", { value: "09:00:00.123", precision: 2 }],
  ["ORIGIN.source_instant", { value: "2026-12-17T20:00:01Z", precision: -1 }],
  ["SERVICE.primary.operator_namespace", "UNREVIEWED_PROVIDER"],
])("rejects malformed typed scalar review %s", (field, value) => {
  expect(
    flightReviewSchema.safeParse({
      schema_key: "flight-v1",
      schema_version: 1,
      normalization_version: 1,
      match_policy: "import-flight-match-v1",
      selected_fields: [field],
      edits: { [field as string]: value },
      association_intents: [],
      deferred_dimensions: [],
    }).success,
  ).toBe(false);
});
