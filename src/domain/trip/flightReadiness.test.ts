import { expect, it } from "vitest";
import type { InterpretationItem } from "../intelligence/interpretation";
import { normalizeFlightObservation } from "./referenceFlightExtractor";
import { assessFlightReadiness } from "./flightReadiness";
const field = (path: string, raw: string): InterpretationItem["fields"][number] => {
  const normalized = normalizeFlightObservation(path, raw);
  return {
    path,
    raw,
    normalized: normalized.value,
    uncertainty: normalized.uncertainty,
    fragment_ids: [`evidence-${path}-${raw}`],
  };
};
const ready = () => [
  field("service", "NZ 5069"),
  field("origin.airport", "AKL"),
  field("destination.airport", "CHC"),
  field("origin.local_date", "2026-12-14"),
  field("origin.local_time", "09:00"),
  field("origin.zone_id", "Pacific/Auckland"),
];
it.each([
  { name: "zero fields", fields: [], decision: "NO_FLIGHT_INFORMATION" },
  {
    name: "one flight number",
    fields: [field("service", "NZ 5069")],
    decision: "NEEDS_EVIDENCE",
  },
  {
    name: "one complete deterministic leg, no Apple or PNR",
    fields: ready(),
    decision: "TYPED_READY",
  },
])("$name", ({ fields, decision }) => {
  expect(assessFlightReadiness({ fields })).toMatchObject({
    decision,
    authority: "ASSEMBLY_ADVISORY_ONLY",
    grantsAdmission: false,
  });
});
it("multiple legs are assessed separately; merging different route evidence produces conflict rather than new identities", () => {
  const legs = [
    ready(),
    ready().map((f) =>
      f.path === "origin.airport"
        ? field(f.path, "CHC")
        : f.path === "destination.airport"
          ? field(f.path, "AKL")
          : f,
    ),
  ];
  expect(legs.map((fields) => assessFlightReadiness({ fields }).decision)).toEqual([
    "TYPED_READY",
    "TYPED_READY",
  ]);
  expect(assessFlightReadiness({ fields: legs.flat() }).decision).toBe("CONFLICT");
});
it.each([
  { path: "service", action: "ENTER_FLIGHT_NUMBER", reason: "MISSING_FLIGHT_NUMBER" },
  {
    path: "origin.local_date",
    action: "CONFIRM_DEPARTURE_DATE",
    reason: "MISSING_DEPARTURE_DATE",
  },
])(
  "missing $path retains structure and asks for an explicit reviewed value",
  ({ path, action, reason }) => {
    const result = assessFlightReadiness({
      fields: ready().filter((f) => f.path !== path),
    });
    expect(result.decision).toBe("NEEDS_REVIEW");
    expect(result.missingFields).toContain(path);
    expect(result.nextActions).toContain(action);
    expect(result.reasonCodes).toContain(reason);
  },
);
it("unknown arrival and absent PNR do not prevent typed readiness or create admission authority", () => {
  const result = assessFlightReadiness({ fields: ready() });
  expect(result.decision).toBe("TYPED_READY");
  expect(result.missingFields).toEqual([]);
  expect(result.nextActions).toContain("OWNING_ASSESSMENT");
  expect(result.grantsAdmission).toBe(false);
});
it("offset-only civil arithmetic cannot substitute for a zone or independent instant", () => {
  const result = assessFlightReadiness({
    fields: [
      ...ready().filter((f) => f.path !== "origin.zone_id"),
      field("origin.supplied_offset_seconds", "+13:00"),
    ],
  });
  expect(result.decision).toBe("NEEDS_REVIEW");
  expect(result.missingFields).toContain("origin.timeline");
});
it("independent instant supports its own date basis without inventing local date, clock or zone", () => {
  const result = assessFlightReadiness({
    fields: [
      ...ready().filter(
        (f) => !f.path.startsWith("origin.") || f.path === "origin.airport",
      ),
      field("origin.source_instant", "depinstant=2026-12-13T20:00Z"),
    ],
  });
  expect(result.decision).toBe("TYPED_READY");
  expect(result.missingFields).toEqual([]);
});
it("estimated departure and unresolved evidence need review; named labels do not resolve airport identity", () => {
  const fields = ready().map((f) =>
    f.path === "origin.local_time"
      ? field(f.path, "~09:00")
      : f.path === "origin.airport"
        ? { ...f, normalized: "Auckland" }
        : f,
  );
  const result = assessFlightReadiness({ fields });
  expect(result.decision).toBe("NEEDS_REVIEW");
  expect(result.missingFields).toEqual(
    expect.arrayContaining(["origin.airport", "origin.local_time"]),
  );
});
it("airport conflict has priority, preserves alternatives/evidence and does not mutate observations", () => {
  const fields = [...ready(), field("origin.airport", "WLG")],
    before = JSON.stringify(fields);
  const result = assessFlightReadiness({
    fields,
    associationPending: true,
    extractionFailed: true,
  });
  expect(result.decision).toBe("CONFLICT");
  expect(result.conflictingFields).toContain("origin.airport");
  expect(
    result.conflicts
      .find((c) => c.field === "origin.airport")!
      .alternatives.map((f) => f.raw),
  ).toEqual(["AKL", "WLG"]);
  expect(result.conflicts[0].alternatives.every((f) => f.fragment_ids.length)).toBe(true);
  expect(JSON.stringify(fields)).toBe(before);
});
it("lossless printed service whitespace is not a conflicting flight identity", () => {
  expect(
    assessFlightReadiness({ fields: [...ready(), field("service", "NZ5069")] }).decision,
  ).toBe("TYPED_READY");
});
it.each([
  {
    fields: [],
    extractionFailed: true,
    decision: "EXTRACTION_FAILED",
    action: "RETRY_LOCAL_EXTRACTION",
  },
  {
    fields: [],
    unsupportedType: true,
    decision: "UNSUPPORTED_TYPE",
    action: "SELECT_SUPPORTED_TYPE",
  },
  { fields: [], decision: "NO_FLIGHT_INFORMATION", action: "PROVIDE_FLIGHT_EVIDENCE" },
])("$decision is an honest distinct empty result", ({ decision, action, ...input }) => {
  const result = assessFlightReadiness(input);
  expect(result.decision).toBe(decision);
  expect(result.nextActions).toEqual([action]);
});
it("missing evidence refs, association uncertainty and change notices cannot become ready", () => {
  expect(
    assessFlightReadiness({ fields: ready().map((f) => ({ ...f, fragment_ids: [] })) })
      .decision,
  ).not.toBe("TYPED_READY");
  expect(
    assessFlightReadiness({ fields: ready(), associationPending: true }).nextActions,
  ).toContain("REVIEW_ASSOCIATIONS");
  expect(
    assessFlightReadiness({
      fields: [...ready(), field("change_notice", "change: reissued")],
    }).decision,
  ).toBe("NEEDS_REVIEW");
});
it("known independent arrival before departure is a conflict; unknown arrival is not inferred", () => {
  const result = assessFlightReadiness({
    fields: [
      ...ready(),
      field("origin.source_instant", "depinstant=2026-12-13T20:00Z"),
      field("destination.source_instant", "arrinstant=2026-12-13T19:00Z"),
    ],
  });
  expect(result.decision).toBe("CONFLICT");
  expect(result.reasonCodes).toContain("ARRIVAL_BEFORE_DEPARTURE");
});
it("independent instant disagreement with evidenced civil date/zone remains an explicit conflict", () => {
  const result = assessFlightReadiness({
    fields: [...ready(), field("origin.source_instant", "depinstant=2026-12-14T20:00Z")],
  });
  expect(result.decision).toBe("CONFLICT");
  expect(result.reasonCodes).toContain("INDEPENDENT_INSTANT_CIVIL_CONFLICT");
});
it("same-airport unusual travel requires review without inventing contradictory observations", () => {
  const result = assessFlightReadiness({
    fields: ready().map((f) =>
      f.path === "destination.airport" ? field(f.path, "AKL") : f,
    ),
  });
  expect(result.decision).toBe("NEEDS_REVIEW");
  expect(result.reasonCodes).toContain("SAME_AIRPORT_REQUIRES_REVIEW");
  expect(result.conflicts).toEqual([]);
});
