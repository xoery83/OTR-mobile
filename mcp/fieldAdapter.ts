import { z } from "zod";
import {
  createItemInput,
  scheduledCalendar,
  previewChangesInput,
  batchOutput,
} from "./mutationContract";
import { itemEditBaseOutput, itemSchema, uuid } from "./contract";
import { coreParticipationSchema, corePlaceSchema } from "../src/domain/trip/tripCoreV2";
import {
  corePayloadSchemas,
  coreSparseStayPayloadSchema,
  validateCoreCommand,
} from "../src/domain/trip/tripCoreV2Commands";
import { canonicalCoreJson, type Json } from "../src/domain/trip/tripCoreV2Json";
import { contentDigest, prepareCreate, type PreparedMutation } from "./mutation";
import { mapSparseStay } from "./sparseStay";
import {
  mapStructuredManualPlace,
  mapRentalManualPlace,
  structuredManualPlacePatch,
} from "./structuredPlace";

const location = z.strictObject({
  label: z.string().trim().min(1).max(500),
  address: z.string().max(2000).nullable().optional(),
});
const stay = coreSparseStayPayloadSchema.shape.details
  .unwrap()
  .refine((d) => Object.keys(d).length > 0);
const rental = corePayloadSchemas.SET_RENTAL_DETAILS.shape.details;
const activity = corePayloadSchemas.SET_ACTIVITY_DETAILS.shape.details;
const action = {
  mode: z.enum(["PREVIEW", "APPLY"]).default("PREVIEW"),
  preview_digest: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
};
export const fieldCreateInput = z
  .strictObject({
    ...action,
    request_id: uuid,
    trip_id: uuid,
    item: createItemInput.shape.item,
    participation: coreParticipationSchema.optional(),
    category: corePayloadSchemas.SET_ITEM_CATEGORY.shape.category.optional(),
    activity: z
      .strictObject({ details: activity, entry_place: location.optional() })
      .optional(),
  })
  .refine((q) => !q.activity || q.item.family === "P6", "Activity details belong to P6")
  .refine(
    (q) => q.category === undefined || ["P1", "P6"].includes(q.item.family),
    "Category belongs to Plan/Activity",
  );
export const fieldUpdateInput = z.strictObject({
  ...action,
  request_id: uuid,
  trip_id: uuid,
  item_id: uuid,
  expected_revision: z.number().int().positive().safe(),
  base_item: itemSchema,
  change: z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("PLACE"), replacement: location }),
    z.strictObject({
      kind: z.literal("STRUCTURED_PLACE"),
      base: itemEditBaseOutput,
      patch: structuredManualPlacePatch,
    }),
    z.strictObject({
      kind: z.literal("RENTAL_PLACE"),
      base: itemEditBaseOutput,
      role: z.enum(["PICKUP", "RETURN"]),
      patch: structuredManualPlacePatch,
    }),
    z.strictObject({
      kind: z.literal("PARTICIPATION"),
      participation: coreParticipationSchema,
    }),
    z.strictObject({ kind: z.literal("STAY"), details: stay }),
    z.strictObject({
      kind: z.literal("RENTAL"),
      details: rental,
      pickup: location.optional(),
      return: location.optional(),
    }),
    z.strictObject({
      kind: z.literal("ACTIVITY"),
      details: activity,
      entry_place: location.optional(),
    }),
    z
      .strictObject({
        kind: z.literal("TRANSPORT"),
        service: z
          .strictObject({
            subtype: z
              .enum(["TRAIN", "BUS", "FERRY", "WATER_TAXI", "SHUTTLE", "TRANSFER"])
              .optional(),
            operator: z.string().max(128).optional(),
            number: z.string().max(64).optional(),
          })
          .optional(),
        endpoints: z
          .strictObject({
            dates: scheduledCalendar,
            origin: location,
            destination: location,
          })
          .optional(),
      })
      .refine((c) => !!c.service || !!c.endpoints),
  ]),
});
export const assistantChangesInput = z
  .strictObject({
    trip_id: uuid,
    changes: z
      .array(
        z.union([
          previewChangesInput.shape.changes.element,
          z
            .strictObject(fieldCreateInput.shape)
            .omit({ mode: true, preview_digest: true, trip_id: true })
            .extend({ kind: z.literal("FIELD_CREATE") }),
          fieldUpdateInput
            .omit({ mode: true, preview_digest: true, trip_id: true })
            .extend({ kind: z.literal("FIELD_UPDATE") }),
        ]),
      )
      .min(1)
      .max(12),
  })
  .refine(
    (q) => new Set(q.changes.map((c) => c.request_id)).size === q.changes.length,
    "Duplicate operation ID",
  );
export const assistantApplyInput = assistantChangesInput.extend({
  preview_digest: z.string().regex(/^[a-f0-9]{64}$/),
});
export const assistantBatchOutput = batchOutput.extend({
  review: z
    .array(
      z.object({
        operation_id: uuid,
        proposed_change: assistantChangesInput.shape.changes.element,
        update_base: itemSchema.nullable(),
        possible_duplicate_item_ids: z.array(uuid),
      }),
    )
    .max(12),
});
export function prepareAssistantChange(
  account: string,
  trip: string,
  change: z.infer<typeof assistantChangesInput>["changes"][number],
) {
  const { kind, ...rest } = change;
  const input = { ...rest, trip_id: trip };
  return kind === "FIELD_CREATE"
    ? prepareFieldCreate(account, input)
    : kind === "FIELD_UPDATE"
      ? prepareFieldUpdate(input)
      : null;
}
function place(input: z.infer<typeof location>) {
  return corePlaceSchema.parse({
    ...Object.fromEntries(Object.keys(corePlaceSchema.shape).map((k) => [k, null])),
    authored_label: input.label,
    authored_address: input.address ?? null,
  });
}
function protectAddress(
  next: z.infer<typeof location> | undefined,
  current: { authoredAddress?: string; acceptedAddress?: string } | undefined,
) {
  if (
    next &&
    next.address === undefined &&
    (current?.authoredAddress || current?.acceptedAddress)
  )
    throw Error("EXPLICIT_ADDRESS_PRESERVATION_OR_CLEAR_REQUIRED");
}
export function prepareFieldCreate(account: string, raw: unknown): PreparedMutation {
  const q = fieldCreateInput.parse(raw);
  const base = prepareCreate(account, {
    request_id: q.request_id,
    trip_id: q.trip_id,
    item: q.item,
  });
  if (base.kind !== "ITEM") throw Error("ITEM_REQUIRED");
  const payload = {
    ...(base.command.payload as Record<string, unknown>),
    ...(q.category !== undefined ? { category: q.category } : {}),
    ...(q.participation ? { participation: q.participation } : {}),
    ...(q.activity
      ? {
          details: q.activity.details,
          ...(q.activity.entry_place
            ? { entryPlace: place(q.activity.entry_place) }
            : {}),
        }
      : {}),
  };
  return {
    kind: "ITEM",
    command: validateCoreCommand({ ...base.command, payload }),
    summary: `Create typed Item; PRIVATE visibility; explicit participants are not access grants: ${canonicalCoreJson({ item: q.item, participation: q.participation ?? null, activity: q.activity ?? null, category: q.category ?? null } as Json)}`,
  };
}

// Read-dependent replacements bind to the exact revision; never reconstruct qualified tuples from a lossy DTO.
export function prepareFieldUpdate(raw: unknown): PreparedMutation {
  const q = fieldUpdateInput.parse(raw),
    item = q.base_item,
    c = q.change;
  if (item.tripId !== q.trip_id || item.itemId !== q.item_id)
    throw Error("CURRENT_ITEM_SCOPE_MISMATCH");
  if (item.itemRevision !== q.expected_revision) throw Error("CURRENT_REVISION_CONFLICT");
  let command: string, payload: unknown;
  switch (c.kind) {
    case "RENTAL_PLACE":
    case "STRUCTURED_PLACE":
      if (contentDigest(c.base.item) !== contentDigest(item))
        throw Error("STRUCTURED_PLACE_ORIGINAL_BASE_MISMATCH");
      return prepareStructuredPlaceUpdate({
        request_id: q.request_id,
        base: c.base,
        patch: c.patch,
        ...(c.kind === "RENTAL_PLACE" ? { role: c.role } : {}),
      });
    case "PLACE":
      if (["P2", "P4", "P5"].includes(item.family))
        throw Error("USE_FAMILY_PLACE_ADAPTER");
      if (item.place?.qualification === "QUALIFIED")
        throw Error("QUALIFIED_PLACE_REQUIRES_OWNING_ADAPTER");
      if (
        item.place &&
        Object.entries(item.place).some(
          ([key, value]) =>
            !["qualification", "authoredLabel", "authoredAddress"].includes(key) &&
            value !== undefined &&
            value !== null,
        )
      )
        throw Error("PLACE_FIELD_PRESERVATION_REQUIRES_OWNING_PORT");
      command = "SET_ITEM_PLACE";
      payload = {
        place: place({
          ...c.replacement,
          address:
            c.replacement.address === undefined
              ? (item.place?.authoredAddress ?? null)
              : c.replacement.address,
        }),
      };
      break;
    case "PARTICIPATION":
      command = "SET_ITEM_PARTICIPATION";
      payload = { participation: c.participation };
      break;
    case "STAY":
      if (item.family !== "P3") throw Error("FAMILY_MISMATCH");
      if (item.details.rooms.length)
        throw Error("STAY_ROOM_PROVENANCE_PRESERVATION_REQUIRES_OWNING_PORT");
      command = "SET_STAY_DETAILS";
      payload = { details: c.details, rooms: [] };
      break;
    case "RENTAL":
      if (item.family !== "P4") throw Error("FAMILY_MISMATCH");
      protectAddress(c.pickup, item.details.pickupPlace);
      protectAddress(c.return, item.details.returnPlace);
      if (
        (c.pickup && item.details.pickupPlace?.qualification === "QUALIFIED") ||
        (c.return && item.details.returnPlace?.qualification === "QUALIFIED")
      )
        throw Error("QUALIFIED_PLACE_REQUIRES_OWNING_ADAPTER");
      if (c.pickup || c.return)
        throw Error("PLACE_FIELD_PRESERVATION_REQUIRES_OWNING_PORT");
      command = "SET_RENTAL_DETAILS";
      payload = {
        details: c.details,
        places: {},
      };
      break;
    case "ACTIVITY":
      if (item.family !== "P6") throw Error("FAMILY_MISMATCH");
      protectAddress(c.entry_place, item.details.entryPlace);
      if (!c.entry_place && item.details.entryPlace)
        throw Error("ACTIVITY_ENTRY_PRESERVATION_REQUIRES_OWNING_READ");
      if (c.entry_place && item.details.entryPlace?.qualification === "QUALIFIED")
        throw Error("QUALIFIED_PLACE_REQUIRES_OWNING_ADAPTER");
      throw Error("ACTIVITY_ENTRY_PRESERVATION_REQUIRES_OWNING_PORT");
    case "TRANSPORT": {
      if (item.family !== "P5") throw Error("FAMILY_MISMATCH");
      const s = item.details.service;
      if (c.service && (!s?.serviceKey || !s.transportSubtype))
        throw Error("FULL_SERVICE_READ_REQUIRED");
      if (
        c.endpoints &&
        [item.schedule.origin, item.schedule.destination].some(
          (e) =>
            e?.place?.qualification === "QUALIFIED" ||
            e?.time.instant ||
            e?.time.quality === "EXACT" ||
            (e?.time.precision !== undefined && e.time.precision !== -1),
        )
      )
        throw Error("QUALIFIED_TRANSPORT_REQUIRES_OWNING_ADAPTER");
      const d = c.endpoints?.dates;
      if (c.endpoints) {
        protectAddress(c.endpoints.origin, item.schedule.origin?.place);
        protectAddress(c.endpoints.destination, item.schedule.destination?.place);
      }
      if (
        d &&
        ((item.schedule.origin?.time.zoneId && d.start_zone === undefined) ||
          (item.schedule.destination?.time.zoneId && d.end_zone === undefined))
      )
        throw Error("EXPLICIT_TRANSPORT_ZONE_REQUIRED");
      if (
        d &&
        [
          [item.schedule.origin?.time, d.start_date, d.start_time],
          [item.schedule.destination?.time, d.end_date, d.end_time],
        ].some(([old, date, time]) => {
          const current = old as typeof item.schedule.start;
          return (
            current && ((current.localDate && !date) || (current.localTime && !time))
          );
        })
      )
        throw Error("TRANSPORT_FIELDS_WOULD_BE_CLEARED");
      // Existing Core replaces service/endpoints and their provenance as a whole.
      throw Error("TRANSPORT_DETAILS_PRESERVATION_REQUIRES_OWNING_PORT");
    }
  }
  return {
    kind: "ITEM",
    readBase: item,
    command: validateCoreCommand({
      contractVersion: 2,
      intentVersion: 2,
      operationId: q.request_id,
      tripId: q.trip_id,
      command,
      target: { kind: "ITEM", id: q.item_id },
      baseVector: [{ kind: "ITEM", id: q.item_id, revision: q.expected_revision }],
      admission: { mode: "MANUAL", sourceIntentId: null, policyVersion: null },
      payload,
    }),
    summary: `Edit existing ${item.family} ${item.itemId} at revision${item.itemRevision}; before: ${canonicalCoreJson(item as Json)}; change: ${canonicalCoreJson(c as Json)}${c.kind === "PLACE" ? `; full manual text-only place replacement: ${canonicalCoreJson(payload as Json)}; Core reasserts the entire place group's MANUAL/protected field state at the new revision; other fields and children preserved. Omitted address retained.` : ""}`,
  };
}

// The caller retains the original full Base for stable intent recovery; execution verifies it against the lawful live read.
export function prepareStructuredPlaceUpdate(raw: unknown): PreparedMutation {
  const q = z
    .strictObject({
      request_id: uuid,
      base: itemEditBaseOutput,
      patch: structuredManualPlacePatch,
      role: z.enum(["PICKUP", "RETURN"]).optional(),
    })
    .parse(raw);
  const mapped = q.role
    ? mapRentalManualPlace(q.base, q.role, q.patch)
    : mapStructuredManualPlace(q.base, q.patch);
  const item = q.base.item;
  return {
    kind: "ITEM",
    readBase: item,
    structuredPlace: {
      baseDigest: contentDigest(q.base.record),
      patch: q.patch,
      ...(q.role ? { role: q.role } : {}),
    },
    command: validateCoreCommand({
      contractVersion: 2,
      intentVersion: 2,
      operationId: q.request_id,
      tripId: item.tripId,
      command: q.role ? "SET_RENTAL_DETAILS" : "SET_ITEM_PLACE",
      target: { kind: "ITEM", id: item.itemId },
      baseVector: [{ kind: "ITEM", id: item.itemId, revision: item.itemRevision }],
      admission: { mode: "MANUAL", sourceIntentId: null, policyVersion: null },
      payload: mapped.payload,
    }),
    summary: `Structured manual Place; before: ${canonicalCoreJson(mapped.before as Json)}; after: ${canonicalCoreJson(mapped.payload as Json)}; ${mapped.tracking_effect}`,
  };
}

// Unmounted until the owning Host qualifies sparse Stay software; the legacy STAY guard stays intact.
export function prepareSparseStayUpdate(raw: unknown): PreparedMutation {
  const q = z
    .strictObject({
      request_id: uuid,
      base: itemEditBaseOutput,
      change: coreSparseStayPayloadSchema,
    })
    .parse(raw);
  const mapped = mapSparseStay(q.base, q.change),
    item = q.base.item;
  return {
    kind: "ITEM",
    readBase: item,
    sparseStay: {
      baseDigest: contentDigest(q.base.record),
      change: mapped.payload,
      roomIds: mapped.roomIds,
    },
    command: validateCoreCommand({
      contractVersion: 2,
      intentVersion: 2,
      operationId: q.request_id,
      tripId: item.tripId,
      command: "SET_STAY_DETAILS",
      target: { kind: "ITEM", id: item.itemId },
      baseVector: [{ kind: "ITEM", id: item.itemId, revision: item.itemRevision }],
      admission: { mode: "MANUAL", sourceIntentId: null, policyVersion: null },
      payload: mapped.payload,
    }),
    summary: `Sparse Stay on ${item.itemId} at revision${item.itemRevision}; before: ${canonicalCoreJson(mapped.before as Json)}; change: ${canonicalCoreJson(mapped.payload as Json)}; omitted facts and provenance retained; null explicitly clears; ADD/REMOVE are explicit room operations.`,
  };
}
