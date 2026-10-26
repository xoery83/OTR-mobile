import { z } from "zod";
import { coreDateBoundary } from "@/domain/trip/tripCoreV2Temporal";
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
          if (/^[+-]/.test(value[field])) throw new Error("INVALID_IANA_ZONE");
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
export function flightNextDate(date: string) {
  validateCalendarDate(date);
  const next = new Date(date + "T12:00:00Z");
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
}
// Clock comparison is an editable form suggestion, never an instant/DST qualification.
export function suggestedFlightArrivalDate(
  date: string,
  departure: string,
  arrival: string,
) {
  if (!date) return "";
  return departure && arrival && arrival < departure ? flightNextDate(date) : date;
}
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
  if (segments.length > 1) return { kind: "CORE_PENDING", reason: "JOURNEY" };
  const segment = segments[0];
  const endpoint = (origin: boolean) => {
    const date = origin ? segment.departureDate : segment.arrivalDate;
    const time = origin ? segment.departureTime : segment.arrivalTime;
    const zone = origin ? segment.departureZone : segment.arrivalZone;
    return {
      airportCode: (origin ? segment.originCode : segment.destinationCode).trim() || null,
      name: (origin ? segment.originName : segment.destinationName).trim() || null,
      terminal:
        (origin ? segment.originTerminal : segment.destinationTerminal).trim() || null,
      time: {
        ...coreDateBoundary(segment.departureDate),
        local_date: date || null,
        local_time: time || null,
        clock_precision: time ? -1 : null,
        quality: time ? ("ESTIMATED" as const) : ("UNKNOWN" as const),
        zone_id: zone || null,
      },
    };
  };
  const full = editing || endpointFields.some((field) => segment[field].trim());
  if (
    full &&
    (segment.originCode.length > 8 ||
      segment.destinationCode.length > 8 ||
      segment.originTerminal.length > 128 ||
      segment.destinationTerminal.length > 128)
  )
    return { kind: "INVALID" };
  return {
    kind: "READY",
    fields: {
      flightNumberLiteral: segments[0].flightNumberLiteral.trim(),
      departureDate: segments[0].departureDate,
      participation: structuredClone(segments[0].participation),
      ...(full ? { origin: endpoint(true), destination: endpoint(false) } : {}),
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
    originCode: string(origin.airportCode ?? origin.airport_code),
    originName: string(record(origin.place).authoredLabel),
    originTerminal: string(origin.terminal),
    destinationCode: string(destination.airportCode ?? destination.airport_code),
    destinationName: string(record(destination.place).authoredLabel),
    destinationTerminal: string(destination.terminal),
    arrivalDate: string(end.localDate),
    arrivalTime: string(end.localTime).slice(0, 5),
    arrivalZone: string(end.zoneId),
    participation,
  };
}
