import type { LlmResponse } from "../frozen-workbench/scripts/import-workbench/llm-first";

type Candidate = LlmResponse["objects"][number];
const date = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.valueOf()) && d.toISOString().slice(0, 10) === value;
};
export function projectUniversalMinimumFacts(candidate: Candidate) {
  const fields = new Map(candidate.fields.map((f) => [f.path, f.raw]));
  const has = (...paths: string[]) => paths.some((p) => !!fields.get(p)?.trim());
  const dated = (...paths: string[]) => paths.some((p) => date(fields.get(p) ?? ""));
  const missing: string[] = [];
  switch (candidate.kind) {
    case "P1":
    case "P6":
      if (!has("activity.name", "title")) missing.push("NAME");
      if (!dated("activity.date", "schedule.start.local_date"))
        missing.push("START_DATE");
      break;
    case "P2":
      if (!has("flight_number", "marketing_flight"))
        missing.push("FLIGHT_NUMBER_OR_QUALIFIED_EXCEPTION");
      if (!dated("origin.local_date")) missing.push("DEPARTURE_DATE");
      break;
    case "P3": {
      if (!has("property.name", "title")) missing.push("NAME");
      const start = ["check_in.date", "checkin.local_date", "schedule.start.local_date"]
        .map((p) => fields.get(p))
        .find((v) => v && date(v));
      const end = ["check_out.date", "checkout.local_date", "schedule.end.local_date"]
        .map((p) => fields.get(p))
        .find((v) => v && date(v));
      if (!start) missing.push("CHECK_IN_DATE");
      if (!end) missing.push("CHECK_OUT_DATE");
      if (start && end && end < start) missing.push("DATE_ORDER");
      break;
    }
    case "P4":
      if (!has("title")) missing.push("TITLE");
      if (!dated("pickup.date")) missing.push("PICKUP_DATE");
      break;
    case "P5":
      if (!has("service", "service.number")) missing.push("SERVICE");
      if (!dated("origin.local_date")) missing.push("ORIGIN_DATE");
      break;
  }
  return {
    token: candidate.token,
    kind: candidate.kind,
    minimumFacts: missing.length
      ? ("INCOMPLETE" as const)
      : ("EVIDENCED_CANDIDATE_FACTS" as const),
    missing,
    createReady: false as const,
    formalAdmission: "OWNING_INTERFACE_UNAVAILABLE" as const,
  };
}
