import type { z } from "zod";
import { manualRentalFieldsSchema, manualActivityFieldsSchema } from "@/data/repositories/manualPlanRepository";
import { manualTransportFieldsSchema } from "@/data/repositories/manualTransportRepository";
import { validateCalendarDate } from "@/domain/trip/dayReadModel";
import {
  flightSegmentDraftSchema,
  type FlightSegmentDraft,
} from "./manualFlightFormFields";
import { airportSuggestions, airportTimeZone } from "./airportSuggestions";
import type { StaySuggestionBinding } from "./p3FormSuggestions";
import type { SyntheticFormResult } from "./SyntheticFormScan";

export type FormFieldResult = SyntheticFormResult & {
  kind: "SYNTHETIC_FORM_SUGGESTIONS";
  family: "P2" | "P4" | "P5" | "P6";
};
export const formSuggestionKeys = {
  P2: [
    "flightNumberLiteral",
    "departureDate",
    "originCode",
    "destinationCode",
    "departureTime",
    "arrivalDate",
    "arrivalTime",
  ],
  P4: [
    "title",
    "startDate",
    "endDate",
    "startTime",
    "endTime",
    "pickupLocation",
    "returnLocation",
    "description",
  ],
  P5: [
    "title",
    "transportType",
    "departureDate",
    "departureTime",
    "departureLocation",
    "arrivalDate",
    "arrivalTime",
    "arrivalLocation",
    "description",
  ],
  P6: [
    "title",
    "location",
    "startDate",
    "endDate",
    "startTime",
    "endTime",
    "description",
  ],
} as const;
const schemas = {
  P2: flightSegmentDraftSchema.shape,
  P4: manualRentalFieldsSchema.shape,
  P5: manualTransportFieldsSchema.shape,
  P6: manualActivityFieldsSchema.shape,
};

export function applyFormFieldSuggestions<Fields extends object>(
  family: FormFieldResult["family"],
  result: FormFieldResult,
  current: StaySuggestionBinding,
  candidateId: string,
  selected: readonly string[],
  fields: Fields,
): Fields | null {
  if (
    result.kind !== "SYNTHETIC_FORM_SUGGESTIONS" ||
    result.family !== family ||
    Object.keys(current).some(
      (key) =>
        current[key as keyof StaySuggestionBinding] !==
        result.binding[key as keyof StaySuggestionBinding],
    ) ||
    new Set(result.candidates.map((candidate) => candidate.id)).size !==
      result.candidates.length
  )
    return null;
  const candidate = result.candidates.find((value) => value.id === candidateId);
  if (
    !candidate ||
    (current.mode === "EDIT" && candidate.targetItemId !== current.itemId)
  )
    return null;
  const next = structuredClone(fields) as Fields & Record<string, unknown>;
  const shape = schemas[family] as Record<string, z.ZodType>;
  for (const key of selected) {
    if (
      !(formSuggestionKeys[family] as readonly string[]).includes(key) ||
      !Object.hasOwn(candidate.fields, key)
    )
      return null;
    const parsed = shape[key].safeParse(candidate.fields[key]);
    if (!parsed.success) return null;
    if (/Date$/.test(key) && parsed.data) {
      try {
        validateCalendarDate(String(parsed.data));
      } catch {
        return null;
      }
    }
    Object.assign(next, { [key]: parsed.data });
    if (family === "P2" && (key === "originCode" || key === "destinationCode")) {
      const code = String(parsed.data).trim().toUpperCase();
      const matches = airportSuggestions(code).filter(
        (airport) => airport.iata === code || airport.icao === code,
      );
      if (matches.length !== 1) return null;
      const airport = matches[0];
      Object.assign(
        next,
        key === "originCode"
          ? {
              originCode: code,
              originName: airport.name,
              departureZone: airportTimeZone(airport) ?? "",
              originTerminal: "",
            }
          : {
              destinationCode: code,
              destinationName: airport.name,
              arrivalZone: airportTimeZone(airport) ?? "",
              destinationTerminal: "",
            },
      );
    }
  }
  if (family === "P2") {
    if (
      !flightSegmentDraftSchema.safeParse(next as unknown as FlightSegmentDraft).success
    )
      return null;
  } else if (family === "P4" || family === "P6") {
    if (
      next.startDate &&
      next.endDate &&
      (String(next.endDate) < String(next.startDate) ||
        (next.startDate === next.endDate &&
          next.startTime &&
          next.endTime &&
          String(next.endTime) < String(next.startTime)))
    )
      return null;
  }
  return next;
}
