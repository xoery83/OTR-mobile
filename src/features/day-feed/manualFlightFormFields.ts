import { z } from "zod";
import { coreParticipationSchema } from "@/domain/trip/tripCoreV2";
import { localCalendarDate, validateCalendarDate } from "@/domain/trip/dayReadModel";
import type {
  ManualFlightFields,
  ManualFlightRead,
} from "@/data/repositories/localManualFlightRepository";
const text = z.string().max(255);
const minute = z.union([z.literal(""), z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)]);
export const flightSegmentDraftSchema = z
  .strictObject({
    key: z.string().min(1),
    flightNumberLiteral: text,
    departureDate: text,
    originCode: text,
    originName: text,
    originTerminal: text,
    departureTime: minute,
    departureZone: text,
    destinationCode: text,
    destinationName: text,
    destinationTerminal: text,
    arrivalDate: text,
    arrivalTime: minute,
    arrivalZone: text,
    participation: coreParticipationSchema,
  })
  .superRefine((value, context) => {
    for (const field of ["departureDate", "arrivalDate"] as const) {
      if (value[field])
        try {
          validateCalendarDate(value[field]);
        } catch {
          context.addIssue({
            code: "custom",
            path: [field],
          });
        }
    }
    for (const field of ["departureZone", "arrivalZone"] as const) {
      if (value[field])
        try {
          localCalendarDate("2000-01-01T12:00:00Z", value[field]);
        } catch {
          context.addIssue({
            code: "custom",
            path: [field],
          });
        }
    }
    if (value.arrivalTime && !value.arrivalDate)
      context.addIssue({
        code: "custom",
        path: ["arrivalDate"],
      });
  });
export type FlightSegmentDraft = z.infer<typeof flightSegmentDraftSchema>;
export function emptyFlightSegment(key: string, departureDate = ""): FlightSegmentDraft {
  return {
    key,
    flightNumberLiteral: "",
    departureDate,
    originCode: "",
    originName: "",
    originTerminal: "",
    departureTime: "",
    departureZone: "",
    destinationCode: "",
    destinationName: "",
    destinationTerminal: "",
    arrivalDate: "",
    arrivalTime: "",
    arrivalZone: "",
    participation: { mode: "WHOLE_GROUP", people: [], selfPersonId: null },
  };
}
const endpointFields = [
  "originCode",
  "originName",
  "originTerminal",
  "departureTime",
  "departureZone",
  "destinationCode",
  "destinationName",
  "destinationTerminal",
  "arrivalDate",
  "arrivalTime",
  "arrivalZone",
] as const;
// Restrict submission to the existing lawful writer. Never truncate populated manual fields.
export function sparseFlightSavePlan(
  segments: readonly FlightSegmentDraft[],
  editing = false,
):
  | { kind: "READY"; fields: ManualFlightFields }
  | { kind: "INVALID" }
  | { kind: "CORE_PENDING"; reason: "EDIT" | "JOURNEY" | "ENDPOINTS" } {
  if (!segments.length) return { kind: "INVALID" };
  const parsed = segments.map((segment) => flightSegmentDraftSchema.safeParse(segment));
  if (
    parsed.some(
      (result) =>
        !result.success ||
        !result.data.flightNumberLiteral.trim() ||
        !result.data.departureDate,
    )
  )
    return { kind: "INVALID" };
  if (editing) return { kind: "CORE_PENDING", reason: "EDIT" };
  if (segments.length > 1) return { kind: "CORE_PENDING", reason: "JOURNEY" };
  if (endpointFields.some((field) => segments[0][field].trim()))
    return { kind: "CORE_PENDING", reason: "ENDPOINTS" };
  return {
    kind: "READY",
    fields: {
      flightNumberLiteral: segments[0].flightNumberLiteral.trim(),
      departureDate: segments[0].departureDate,
      participation: structuredClone(segments[0].participation),
    },
  };
}

// Already actor-filtered read only; this does not grant Edit or infer missing endpoint facts.
export function flightSegmentFromRead(item: ManualFlightRead): FlightSegmentDraft {
  const record = (value: unknown): Record<string, unknown> =>
    value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const string = (value: unknown) => (typeof value === "string" ? value : "");
  const schedule = record(item.schedule),
    origin = record(schedule.origin),
    destination = record(schedule.destination);
  const start = record(origin.time ?? schedule.start),
    end = record(destination.time ?? schedule.end);
  const mode = item.participation.mode;
  const participation = coreParticipationSchema.parse({
    mode,
    people: mode === "SELECTED_MEMBERS" ? item.participation.personIds : [],
    selfPersonId: mode === "SELF" ? (item.participation.selfPersonId ?? null) : null,
  });
  return {
    ...emptyFlightSegment(item.itemId),
    flightNumberLiteral: string(item.details.flightNumberLiteral),
    departureDate: string(start.localDate),
    departureTime: string(start.localTime).slice(0, 5),
    departureZone: string(start.zoneId),
    originCode: string(origin.airport_code),
    originName: string(record(origin.place).authoredLabel),
    originTerminal: string(origin.terminal),
    destinationCode: string(destination.airport_code),
    destinationName: string(record(destination.place).authoredLabel),
    destinationTerminal: string(destination.terminal),
    arrivalDate: string(end.localDate),
    arrivalTime: string(end.localTime).slice(0, 5),
    arrivalZone: string(end.zoneId),
    participation,
  };
}
