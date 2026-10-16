import type { InterpretationItem } from "../intelligence/interpretation";
import { canonicalEventJson } from "./eventIntentJson";
import {
  instantMicroseconds,
  localCalendarDate,
  validateCalendarDate,
} from "./dayReadModel";
import { flightServicesSchema, flightTimeInputSchema } from "./flightAdmission";
import { UNKNOWN_FLIGHT_TIME } from "./referenceFlightExtractor";

type Field = InterpretationItem["fields"][number];
export type FlightReadinessDecision =
  | "TYPED_READY"
  | "NEEDS_REVIEW"
  | "CONFLICT"
  | "NEEDS_EVIDENCE"
  | "NO_FLIGHT_INFORMATION"
  | "UNSUPPORTED_TYPE"
  | "EXTRACTION_FAILED";
export type FlightReadiness = {
  authority: "ASSEMBLY_ADVISORY_ONLY";
  grantsAdmission: false;
  decision: FlightReadinessDecision;
  reasonCodes: string[];
  missingFields: string[];
  conflictingFields: string[];
  conflicts: { field: string; alternatives: InterpretationItem["fields"] }[];
  nextActions: string[];
};
const critical = [
  "service",
  "origin.airport",
  "destination.airport",
  "origin.local_date",
  "origin.local_time",
  "origin.timeline",
];
const temporal = ["origin", "destination"].flatMap((role) =>
  [
    "local_date",
    "local_time",
    "zone_id",
    "supplied_offset_seconds",
    "source_instant",
  ].map((key) => `${role}.${key}`),
);
const relevant = new Set([
  "service",
  "operating_service",
  "origin.airport",
  "destination.airport",
  ...temporal,
]);
const object = (
  value: Field["normalized"],
): Record<string, Field["normalized"]> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? value : null;

// Registry I1/C1: one proposal-local leg, never a batch-wide identity/matching test.
// Fragment refs are evidence references, not verified Source or Core airport authority.
// A typed civil zone is not an admitted UNIQUE/FOLD binding; CP13 owns that later gate.
export function assessFlightReadiness(input: {
  fields: InterpretationItem["fields"];
  associationPending?: boolean;
  extractionFailed?: boolean;
  unsupportedType?: boolean;
}): FlightReadiness {
  const fields = input.fields.filter((field) => relevant.has(field.path));
  const evidenced = (field: Field) =>
    !!field.raw.trim() && field.fragment_ids.some((id) => !!id.trim());
  const typed = (field: Field): boolean => {
    const value = field.normalized;
    const part = object(value);
    if (field.path === "service" || field.path === "operating_service")
      return flightServicesSchema.safeParse(Array.isArray(value) ? value : [value])
        .success;
    if (field.path.endsWith(".airport"))
      return (
        part?.namespace === "IATA_AIRPORT" &&
        typeof part.value === "string" &&
        /^[A-Z]{3}$/.test(part.value)
      );
    if (field.path.endsWith(".local_date")) {
      try {
        return typeof value === "string" && validateCalendarDate(value) === value;
      } catch {
        return false;
      }
    }
    if (field.path.endsWith(".local_time"))
      return (
        !!part &&
        flightTimeInputSchema.safeParse({
          ...UNKNOWN_FLIGHT_TIME,
          local_time: part.value,
          clock_precision: part.precision,
          quality: part.quality,
        }).success
      );
    if (field.path.endsWith(".source_instant"))
      return (
        !!part &&
        flightTimeInputSchema.safeParse({
          ...UNKNOWN_FLIGHT_TIME,
          source_instant: part.value,
          source_instant_precision: part.precision,
          quality: "EXACT",
          basis: "SOURCE_INSTANT",
        }).success
      );
    if (field.path.endsWith(".zone_id")) {
      if (typeof value !== "string" || (value !== "UTC" && !value.includes("/")))
        return false;
      try {
        return !!new Intl.DateTimeFormat("en", { timeZone: value }).resolvedOptions()
          .timeZone;
      } catch {
        return false;
      }
    }
    return (
      field.path.endsWith(".supplied_offset_seconds") &&
      typeof value === "number" &&
      Number.isInteger(value) &&
      Math.abs(value) <= 64800
    );
  };
  const semantic = (field: Field) => {
    const part = object(field.normalized);
    if (field.path === "service" || field.path === "operating_service") {
      const services = flightServicesSchema.parse(
        Array.isArray(field.normalized) ? field.normalized : [field.normalized],
      );
      return canonicalEventJson(
        services
          .map((s) => [
            s.operator_namespace,
            s.operator_issuer,
            s.operator_value,
            s.service_number,
          ])
          .sort(),
      );
    }
    if (field.path.endsWith(".local_time")) return String(part!.value);
    if (field.path.endsWith(".source_instant"))
      return instantMicroseconds(String(part!.value)).toString();
    if (field.path.endsWith(".zone_id"))
      return new Intl.DateTimeFormat("en", {
        timeZone: field.normalized as string,
      }).resolvedOptions().timeZone;
    return canonicalEventJson(field.normalized);
  };
  const observations = (path: string) => fields.filter((field) => field.path === path);
  const known = (path: string) =>
    observations(path).filter((field) => evidenced(field) && typed(field));
  const usable = (path: string) => {
    const values = observations(path);
    return (
      values.length > 0 &&
      values.every(
        (field) => evidenced(field) && typed(field) && !field.uncertainty.length,
      )
    );
  };
  const value = (path: string) => known(path)[0]?.normalized;
  const conflicts: FlightReadiness["conflicts"] = [];
  for (const path of relevant) {
    const values = known(path);
    if (new Set(values.map(semantic)).size > 1)
      conflicts.push({ field: path, alternatives: JSON.parse(JSON.stringify(values)) });
  }
  const origin = object(value("origin.airport") ?? null)?.value;
  const destination = object(value("destination.airport") ?? null)?.value;
  const reasons: string[] = [];
  const routeReview = !!origin && !!destination && origin === destination;
  if (routeReview) reasons.push("SAME_AIRPORT_REQUIRES_REVIEW");
  const departureInstant = object(value("origin.source_instant") ?? null)?.value;
  const arrivalInstant = object(value("destination.source_instant") ?? null)?.value;
  if (
    typeof departureInstant === "string" &&
    typeof arrivalInstant === "string" &&
    instantMicroseconds(arrivalInstant) < instantMicroseconds(departureInstant)
  ) {
    reasons.push("ARRIVAL_BEFORE_DEPARTURE");
    for (const path of ["origin.source_instant", "destination.source_instant"])
      if (!conflicts.some((c) => c.field === path))
        conflicts.push({
          field: path,
          alternatives: JSON.parse(JSON.stringify(known(path))),
        });
  }
  for (const role of ["origin", "destination"]) {
    const timestamp = object(value(`${role}.source_instant`) ?? null);
    const zone = value(`${role}.zone_id`);
    if (
      !usable(`${role}.source_instant`) ||
      !usable(`${role}.zone_id`) ||
      typeof timestamp?.value !== "string" ||
      typeof zone !== "string"
    )
      continue;
    const datePath = `${role}.local_date`,
      clockPath = `${role}.local_time`;
    const clock = object(value(clockPath) ?? null);
    let mismatch =
      usable(datePath) && value(datePath) !== localCalendarDate(timestamp.value, zone);
    if (usable(clockPath) && clock?.quality === "EXACT") {
      const parts = new Intl.DateTimeFormat("en-GB", {
        timeZone: zone,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23",
      }).formatToParts(new Date(timestamp.value));
      const part = (type: string) => parts.find((p) => p.type === type)!.value;
      const actual = `${part("hour")}:${part("minute")}:${part("second")}.${(timestamp.value.match(/\.(\d+)Z$/)?.[1] ?? "").padEnd(6, "0")}`;
      const precision = Math.min(Number(clock.precision), Number(timestamp.precision));
      const length = precision === -1 ? 5 : precision === 0 ? 8 : 9 + precision;
      mismatch ||= String(clock.value).slice(0, length) !== actual.slice(0, length);
    }
    if (mismatch) {
      reasons.push("INDEPENDENT_INSTANT_CIVIL_CONFLICT");
      for (const path of [
        datePath,
        clockPath,
        `${role}.source_instant`,
        `${role}.zone_id`,
      ])
        if (known(path).length && !conflicts.some((c) => c.field === path))
          conflicts.push({
            field: path,
            alternatives: JSON.parse(JSON.stringify(known(path))),
          });
    }
  }
  const missing: string[] = [];
  const actions: string[] = routeReview ? ["CONFIRM_UNUSUAL_ROUTE"] : [];
  const require = (present: boolean, path: string, reason: string, action: string) => {
    if (!present) {
      missing.push(path);
      reasons.push(reason);
      actions.push(action);
    }
  };
  require(usable("service") ||
    usable(
      "operating_service",
    ), "service", "MISSING_FLIGHT_NUMBER", "ENTER_FLIGHT_NUMBER");
  require(usable(
    "origin.airport",
  ), "origin.airport", "MISSING_ORIGIN_AIRPORT", "CONFIRM_ORIGIN_AIRPORT");
  require(usable(
    "destination.airport",
  ), "destination.airport", "MISSING_DESTINATION_AIRPORT", "CONFIRM_DESTINATION_AIRPORT");
  const instant = usable("origin.source_instant");
  const clock =
    usable("origin.local_time") &&
    observations("origin.local_time").every(
      (f) => object(f.normalized)?.quality === "EXACT",
    );
  require(instant ||
    usable(
      "origin.local_date",
    ), "origin.local_date", "MISSING_DEPARTURE_DATE", "CONFIRM_DEPARTURE_DATE");
  require(instant ||
    clock, "origin.local_time", "MISSING_OR_INEXACT_DEPARTURE_TIME", "CONFIRM_DEPARTURE_TIME");
  require(instant ||
    usable(
      "origin.zone_id",
    ), "origin.timeline", "MISSING_DEPARTURE_TIME_BASIS", "CONFIRM_DEPARTURE_ZONE_OR_INDEPENDENT_INSTANT");
  const unresolved = fields.filter(
    (field) => !evidenced(field) || !typed(field) || field.uncertainty.length,
  );
  if (unresolved.length) {
    reasons.push("UNRESOLVED_FIELD_EVIDENCE");
    actions.push("REVIEW_FIELD_EVIDENCE");
  }
  const continuityPending = input.fields.some(
    (field) => field.path === "change_notice" && field.normalized !== null,
  );
  if (continuityPending) {
    reasons.push("CHANGE_NOTICE_REQUIRES_REVIEW");
    actions.push("REVIEW_CONTINUITY");
  }
  if (input.associationPending) {
    reasons.push("ASSOCIATION_PENDING");
    actions.push("REVIEW_ASSOCIATIONS");
  }
  const hasFacts = fields.some((field) => field.normalized !== null);
  let decision: FlightReadinessDecision;
  if (conflicts.length) {
    decision = "CONFLICT";
    reasons.unshift("CONFLICTING_FLIGHT_FACTS");
    actions.unshift("RESOLVE_CONFLICTS");
  } else if (input.unsupportedType) {
    decision = "UNSUPPORTED_TYPE";
    reasons.unshift("UNSUPPORTED_FLIGHT_TYPE");
    actions.unshift("SELECT_SUPPORTED_TYPE");
  } else if (input.extractionFailed) {
    decision = "EXTRACTION_FAILED";
    reasons.unshift("EXTRACTION_FAILED");
    actions.unshift("RETRY_LOCAL_EXTRACTION");
  } else if (!hasFacts) {
    decision = "NO_FLIGHT_INFORMATION";
    reasons.unshift("NO_FLIGHT_INFORMATION");
    actions.unshift("PROVIDE_FLIGHT_EVIDENCE");
  } else if (
    !missing.length &&
    !unresolved.length &&
    !input.associationPending &&
    !continuityPending &&
    !routeReview
  ) {
    decision = "TYPED_READY";
    reasons.push("TYPED_FIELDS_COMPLETE");
    actions.push("OWNING_ASSESSMENT");
  } else {
    const factPaths = new Set(
      fields
        .filter((field) => evidenced(field) && typed(field))
        .map((field) => field.path),
    );
    decision =
      factPaths.size <= 1 && !input.associationPending && !continuityPending
        ? "NEEDS_EVIDENCE"
        : "NEEDS_REVIEW";
    if (decision === "NEEDS_EVIDENCE") actions.unshift("PROVIDE_FLIGHT_EVIDENCE");
  }
  if (
    ["UNSUPPORTED_TYPE", "EXTRACTION_FAILED", "NO_FLIGHT_INFORMATION"].includes(decision)
  ) {
    const reason = decision === "UNSUPPORTED_TYPE" ? "UNSUPPORTED_FLIGHT_TYPE" : decision;
    const action =
      decision === "UNSUPPORTED_TYPE"
        ? "SELECT_SUPPORTED_TYPE"
        : decision === "EXTRACTION_FAILED"
          ? "RETRY_LOCAL_EXTRACTION"
          : "PROVIDE_FLIGHT_EVIDENCE";
    reasons.splice(0, reasons.length, reason);
    actions.splice(0, actions.length, action);
    missing.length = 0;
  }
  // PNR and arrival are not universal prerequisites. No Apple/model availability gate exists.
  return {
    authority: "ASSEMBLY_ADVISORY_ONLY",
    grantsAdmission: false,
    decision,
    reasonCodes: [...new Set(reasons)],
    missingFields: critical.filter((path) => missing.includes(path)),
    conflictingFields: conflicts.map((c) => c.field),
    conflicts,
    nextActions: [...new Set(actions)],
  };
}
