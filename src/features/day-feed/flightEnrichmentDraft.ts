import {
  canApplySuggestions,
  fields,
  type FlightEnrichmentRequest,
  type FlightEnrichmentResponse,
} from "@/domain/intelligence/flightEnrichmentContracts";
import { airportSuggestions, airportTimeZone } from "./airportSuggestions";
import type { FlightSegmentDraft } from "./manualFlightFormFields";
export function flightLookupIdentity(value: FlightSegmentDraft) {
  return `${value.flightNumberLiteral.trim().toUpperCase().replace(/\s+/g, "")}:${value.departureDate}`;
}
export function flightLookupKnownFields(
  value: FlightSegmentDraft,
): FlightEnrichmentRequest["knownFields"] {
  const pairs = {
    flightNumber: value.flightNumberLiteral.trim().toUpperCase().replace(/\s+/g, ""),
    departureLocalDate: value.departureDate,
    departureAirport: value.originCode,
    arrivalAirport: value.destinationCode,
    departureLocalTime: value.departureTime,
    arrivalLocalTime: value.arrivalTime,
    arrivalLocalDate: value.arrivalDate,
    departureTimezone: value.departureZone,
    arrivalTimezone: value.arrivalZone,
  };
  return Object.fromEntries(
    Object.entries(pairs).filter(
      ([key, value]) =>
        value && fields[key as keyof typeof fields].safeParse(value).success,
    ),
  );
}
export function applyFlightLookup(
  response: FlightEnrichmentResponse,
  request: FlightEnrichmentRequest,
  value: FlightSegmentDraft,
) {
  if (
    !canApplySuggestions(response, request) ||
    response.candidates.length > 1 ||
    response.references.some((r) => r.reason === "IDENTITY_CONFLICT")
  )
    return null;
  const changes: Partial<FlightSegmentDraft> = {};
  for (const suggestion of response.suggestions) {
    if (suggestion.referenceOnly || suggestion.eligibility !== "ADOPT") continue;
    const mapped = (
      {
        departureLocalTime: "departureTime",
        arrivalLocalTime: "arrivalTime",
        arrivalLocalDate: "arrivalDate",
      } as const
    )[suggestion.field as "departureLocalTime" | "arrivalLocalTime" | "arrivalLocalDate"];
    if (mapped && !value[mapped]) changes[mapped] = suggestion.value;
    if (
      suggestion.field === "departureAirport" ||
      suggestion.field === "arrivalAirport"
    ) {
      const origin = suggestion.field === "departureAirport";
      if (
        origin
          ? value.originCode || value.originName
          : value.destinationCode || value.destinationName
      )
        continue;
      const matches = airportSuggestions(suggestion.value).filter(
        (a) => a.iata === suggestion.value,
      );
      if (matches.length !== 1) continue;
      const airport = matches[0],
        zone = airportTimeZone(airport) ?? "";
      const existingZone = origin ? value.departureZone : value.arrivalZone;
      if (zone && existingZone && zone !== existingZone) return null;
      Object.assign(
        changes,
        origin
          ? {
              originCode: suggestion.value,
              originName: airport.name,
              ...(!existingZone && zone ? { departureZone: zone } : {}),
            }
          : {
              destinationCode: suggestion.value,
              destinationName: airport.name,
              ...(!existingZone && zone ? { arrivalZone: zone } : {}),
            },
      );
    }
  }
  return changes;
}
