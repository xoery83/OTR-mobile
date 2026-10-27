import {
  fields,
  fieldNames,
  type FlightEnrichmentRequest,
  type RawResult,
  type Suggestion,
  type Status,
} from "./contracts";
function mentions(text: string, value: string): boolean {
  if (text.toUpperCase().includes(value.toUpperCase())) return true;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split("-");
    return new RegExp(`${y}年\\s*0?${Number(m)}月\\s*0?${Number(d)}日`).test(text);
  }
  return false;
}
export function projectFlightSuggestions(
  request: FlightEnrichmentRequest,
  result: RawResult,
) {
  const suggestions: Suggestion[] = [],
    references: Suggestion[] = [];
  const p = result.proposal,
    ambiguous = p.status === "AMBIGUOUS" || p.candidates.length > 1;
  const differentDate =
    p.fields.departureLocalDate?.value !== undefined &&
    p.fields.departureLocalDate.value !== request.departureLocalDate;
  const differentNumber =
    p.fields.flightNumber?.value !== undefined &&
    p.fields.flightNumber.value !== request.flightNumber;
  for (const field of fieldNames) {
    const value = p.fields[field];
    if (!value || !fields[field].safeParse(value.value).success) continue;
    const source = result.evidence.find((e) => e.id === value.evidenceId);
    if (!source || !source.text.includes(value.quote)) continue;
    if (["flightNumber", "departureAirport", "arrivalAirport"].includes(field)) {
      if (!new RegExp(`(^|[^A-Z0-9])${value.value}($|[^A-Z0-9])`, "i").test(value.quote))
        continue;
    } else if (!mentions(value.quote, value.value)) continue;
    const dated =
      !!value.applicableFrom &&
      !!value.applicableTo &&
      !!value.dateEvidenceQuote &&
      source.text.includes(value.dateEvidenceQuote) &&
      (mentions(value.dateEvidenceQuote, request.departureLocalDate) ||
        (mentions(value.dateEvidenceQuote, value.applicableFrom) &&
          mentions(value.dateEvidenceQuote, value.applicableTo))) &&
      value.applicableFrom <= request.departureLocalDate &&
      request.departureLocalDate <= value.applicableTo;
    const existing = request.knownFields[field] ?? null;
    const material =
      existing !== null && existing !== value.value && !field.endsWith("LocalTime");
    const reason: Suggestion["reason"] = ambiguous
      ? "MULTIPLE_LEGS"
      : differentNumber
        ? "IDENTITY_CONFLICT"
        : differentDate || !dated
          ? "DATE_NEEDS_CHECK"
          : material
            ? "EXISTING_VALUE_CONFLICT"
            : null;
    const item: Suggestion = {
      field,
      value: value.value,
      existingValue: existing,
      eligibility:
        existing === value.value
          ? "UNCHANGED"
          : existing === null
            ? "ADOPT"
            : "KEEP_OR_REPLACE",
      source: {
        url: source.url,
        evidenceId: source.id,
        quote: value.quote,
        observedAt: source.observedAt,
      },
      applicableDate: {
        from: value.applicableFrom ?? null,
        to: value.applicableTo ?? null,
        requested: request.departureLocalDate,
      },
      referenceOnly: reason !== null,
      reason,
    };
    (item.referenceOnly ? references : suggestions).push(item);
  }
  const unresolved = fieldNames.filter(
    (field) => !suggestions.some((s) => s.field === field),
  );
  const essential = [
    "marketingCarrier",
    "flightNumber",
    "departureAirport",
    "arrivalAirport",
    "departureLocalDate",
    "departureLocalTime",
    "arrivalLocalDate",
    "arrivalLocalTime",
  ];
  const status: Status = ambiguous
    ? "AMBIGUOUS"
    : suggestions.length
      ? essential.every((f) => suggestions.some((s) => s.field === f))
        ? "SUCCESS"
        : "PARTIAL"
      : references.length
        ? "REFERENCE_ONLY"
        : p.status === "NOT_FOUND"
          ? "NOT_FOUND"
          : "UNAVAILABLE";
  return {
    status,
    suggestions,
    references,
    unresolved,
    candidates: p.candidates,
  };
}
