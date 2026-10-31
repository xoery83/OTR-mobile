import { z } from "zod";
import { uuid, date, itemSchema } from "./contract";
const action = {
  mode: z.enum(["PREVIEW", "APPLY"]).default("PREVIEW"),
  preview_digest: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
};
const calendar = z
  .strictObject({ start_date: date, end_date: date.optional() })
  .refine((x) => !x.end_date || x.end_date >= x.start_date);
const minute = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const zone = z
  .string()
  .min(1)
  .max(128)
  .refine((value) => {
    if (/^[+-]/.test(value)) return false;
    try {
      new Intl.DateTimeFormat("en", { timeZone: value }).format(0);
      return true;
    } catch {
      return false;
    }
  });
export const scheduledCalendar = calendar
  .safeExtend({
    start_time: minute.optional(),
    end_time: minute.optional(),
    start_zone: zone.optional(),
    end_zone: zone.optional(),
  })
  .superRefine((v, c) => {
    if (
      ((v.end_time || v.end_zone) && !v.end_date) ||
      (v.start_zone && !v.start_time) ||
      (v.end_zone && !v.end_time) ||
      (v.start_date === v.end_date &&
        v.start_time &&
        v.end_time &&
        v.start_zone === v.end_zone &&
        v.end_time < v.start_time)
    )
      c.addIssue({ code: "custom", message: "INVALID_CIVIL_RANGE" });
  });
const label = z.string().trim().min(1).max(500);
const stay = z.strictObject({
  permitted_checkin_from: minute.optional(),
  permitted_checkin_until: minute.optional(),
  permitted_checkout_by: minute.optional(),
});
const rental = z.strictObject({
  supplier: label.optional(),
  reserved_category: label.optional(),
  or_similar: z.boolean().optional(),
  actual_vehicle_model: label.optional(),
  verified_plate: z.string().trim().min(1).max(64).optional(),
});
const transport = z.strictObject({
  subtype: z.enum(["TRAIN", "BUS", "FERRY", "WATER_TAXI", "SHUTTLE", "TRANSFER"]),
  origin: label,
  destination: label,
  operator: z.string().trim().min(1).max(128).optional(),
  service_number: z.string().trim().min(1).max(64).optional(),
  checkin: z
    .strictObject({ date, time: minute, zone: zone.optional(), place: label.optional() })
    .optional(),
});
const flightEndpoint = z
  .strictObject({
    date: date.nullable(),
    time: minute.nullable(),
    zone: zone.nullable(),
    airport_code: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .nullable(),
    name: label.nullable(),
    terminal: label.nullable(),
  })
  .refine(
    (v) => (!v.time || !!v.date) && (!v.zone || !!v.time),
    "Flight civil date required",
  );
export const createItemInput = z.strictObject({
  ...action,
  request_id: uuid,
  trip_id: uuid,
  item: z
    .strictObject({
      family: z.enum(["P1", "P2", "P3", "P4", "P5", "P6"]),
      title: z.string().trim().min(1).max(200),
      notes: z.string().max(5000).nullable().optional(),
      dates: scheduledCalendar,
      place: z.string().trim().min(1).max(256).optional(),
      property_name: z.string().trim().min(1).max(256).optional(),
      place_address: z.string().trim().min(1).max(2000).optional(),
      return_place: label.optional(),
      return_address: z.string().trim().min(1).max(2000).optional(),
      stay: stay.optional(),
      rental: rental.optional(),
      transport: transport.optional(),
      flight_number: z.string().trim().min(1).max(255).optional(),
    })
    .refine((x) => x.family !== "P3" || !!x.dates.end_date, "P3 needs checkout date")
    .refine(
      (x) => (x.family === "P2") === !!x.flight_number,
      "P2 needs explicit flight number literal",
    )
    .refine(
      (x) =>
        x.family !== "P2" ||
        (!x.dates.start_time &&
          !x.dates.end_time &&
          !x.dates.end_date &&
          !x.dates.start_zone &&
          !x.dates.end_zone &&
          !x.place &&
          !x.place_address),
      "Sparse flight create is date-only; preserve route/clocks with a later FLIGHT_DETAILS operation",
    )
    .refine((x) => !x.property_name || x.family === "P3", "property_name belongs to P3")
    .refine((x) => !x.stay || x.family === "P3", "stay belongs to P3")
    .refine((x) => !x.rental || x.family === "P4", "rental belongs to P4")
    .refine(
      (x) => (!x.return_place && !x.return_address) || x.family === "P4",
      "return belongs to P4",
    )
    .refine((x) => !x.return_address || !!x.return_place, "return address needs place")
    .refine((x) => !x.place_address || !!x.place, "address needs place")
    .refine((x) => (x.family === "P5") === !!x.transport, "P5 needs transport endpoints")
    .refine(
      (x) => x.family !== "P5" || (!x.place && !x.place_address),
      "P5 uses endpoint places",
    ),
});
export const updateItemInput = z.strictObject({
  ...action,
  request_id: uuid,
  trip_id: uuid,
  item_id: uuid,
  expected_revision: z.number().int().positive().safe(),
  change: z.discriminatedUnion("kind", [
    z.strictObject({
      kind: z.literal("TEXT"),
      title: z.string().trim().min(1).max(200),
      notes: z.string().max(5000).nullable().optional(),
    }),
    z.strictObject({ kind: z.literal("DATES"), dates: calendar }),
    z.strictObject({ kind: z.literal("SCHEDULE"), dates: scheduledCalendar }),
    z.strictObject({
      kind: z.literal("FLIGHT_DETAILS"),
      flight_number: z.string().trim().min(1).max(255),
      origin: flightEndpoint.refine((v) => v.date !== null, "Departure date required"),
      destination: flightEndpoint,
    }),
  ]),
});
export const createTripInput = z.strictObject({
  ...action,
  request_id: uuid,
  name: z.string().trim().min(1).max(256),
  destinations: z.array(z.string().trim().min(1).max(256)).max(20),
  dates: calendar.optional(),
});
export const operationInput = z.strictObject({
  trip_id: uuid,
  operation_id: uuid,
  target: z.enum(["TRIP", "ITEM"]),
});
export const mutationOutput = z.object({
  version: z.literal("otr.mcp.mutation/1"),
  trip_id: uuid,
  item_id: uuid.optional(),
  operation_id: uuid,
  outcome: z.enum([
    "PREVIEW",
    "NEEDS_CONFIRMATION",
    "APPLIED",
    "NO_CHANGE",
    "CONFLICT",
    "UNKNOWN",
    "REJECTED",
  ]),
  current_revision: z.number().int().nonnegative().nullable(),
  preview_digest: z.string(),
  summary: z.string(),
  error_code: z.string().optional(),
  query: operationInput,
});
export type MutationResult = z.infer<typeof mutationOutput>;
export const previewChangesInput = z
  .strictObject({
    trip_id: uuid,
    changes: z
      .array(
        z.union([
          createItemInput
            .omit({ mode: true, preview_digest: true, trip_id: true })
            .extend({ kind: z.literal("CREATE") }),
          updateItemInput
            .omit({ mode: true, preview_digest: true, trip_id: true })
            .extend({ kind: z.literal("UPDATE") }),
        ]),
      )
      .min(1)
      .max(12),
  })
  .refine(
    (x) => new Set(x.changes.map((c) => c.request_id)).size === x.changes.length,
    "Duplicate operation ID",
  );
export const applyChangesInput = previewChangesInput.extend({
  preview_digest: z.string().regex(/^[a-f0-9]{64}$/),
});
export const batchOutput = z.object({
  version: z.literal("otr.mcp.batch/1"),
  trip_id: uuid,
  preview_digest: z.string(),
  outcome: z.enum([
    "PREVIEW",
    "NEEDS_CONFIRMATION",
    "PARTIAL",
    "APPLIED",
    "UNKNOWN",
    "CONFLICT",
    "REJECTED",
  ]),
  operations: z.array(mutationOutput).max(12),
  review_basis: z.literal("CURRENT_VISIBLE_COLLECTION_AND_UPDATE_DETAILS"),
  review: z
    .array(
      z.object({
        operation_id: uuid,
        proposed_change: previewChangesInput.shape.changes.element,
        update_base: itemSchema.nullable(),
        possible_duplicate_item_ids: z.array(uuid),
      }),
    )
    .max(12),
  warnings: z.array(z.string()).max(24),
});

export const operationOutput = z.object({
  version: z.literal("otr.mcp.status/1"),
  ...operationInput.shape,
  outcome: z.enum(["APPLIED", "NO_CHANGE", "CONFLICT", "REJECTED", "UNKNOWN"]),
  current_revision: z.number().int().nonnegative().nullable(),
  error_code: z.string().optional(),
});
