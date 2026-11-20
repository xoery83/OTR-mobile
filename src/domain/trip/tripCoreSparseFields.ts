import { z } from "zod";
import { corePlaceSchema, coreText } from "./tripCoreV2";
import {
  coreBoundarySchema,
  normalizeCoreClock,
  type CoreBoundary,
} from "./tripCoreV2Temporal";
import { validateCalendarDate } from "./dayReadModel";
const nonempty = (v: object) => Object.keys(v).length > 0;
export const authoredPlacePatchSchema = corePlaceSchema
  .pick({
    authored_label: true,
    authored_text: true,
    authored_address: true,
    authored_address_line1: true,
    authored_address_line2: true,
    authored_address_locality: true,
    authored_address_region: true,
    authored_address_postal_code: true,
    authored_address_country: true,
  })
  .partial()
  .refine(nonempty);
export const sparseBoundaryPatchSchema = z
  .strictObject({
    local_date: coreBoundarySchema.shape.local_date,
    local_time: coreBoundarySchema.shape.local_time,
    clock_precision: coreBoundarySchema.shape.clock_precision,
    zone_id: coreBoundarySchema.shape.zone_id,
  })
  .partial()
  .refine(nonempty)
  .superRefine((v, c) => {
    const fail = () => c.addIssue({ code: "custom", message: "INVALID_TEMPORAL_TUPLE" });
    try {
      if (v.local_date) validateCalendarDate(v.local_date);
      if (Object.hasOwn(v, "local_time") !== Object.hasOwn(v, "clock_precision"))
        return fail();
      if (Object.hasOwn(v, "local_time")) {
        if ((v.local_time === null) !== (v.clock_precision === null)) return fail();
        if (v.local_time) normalizeCoreClock(v.local_time, v.clock_precision!);
      }
      if (v.zone_id) {
        if (/^[+-]/.test(v.zone_id)) return fail();
        new Intl.DateTimeFormat("en", { timeZone: v.zone_id }).format(0);
      }
    } catch {
      fail();
    }
  });
export const sparseSchedulePatchSchema = z
  .strictObject({
    start: sparseBoundaryPatchSchema.optional(),
    end: sparseBoundaryPatchSchema.nullable().optional(),
  })
  .refine(nonempty);
const flightEndpointPatch = z
  .strictObject({
    airportCode: coreText(8).nullable().optional(),
    name: coreText(255).nullable().optional(),
    terminal: coreText(128).nullable().optional(),
    time: sparseBoundaryPatchSchema.optional(),
  })
  .refine(nonempty);
export const sparseFlightPatchSchema = z
  .strictObject({
    flightNumberLiteral: coreText(255)
      .refine((v) => !!v.trim())
      .optional(),
    origin: flightEndpointPatch.optional(),
    destination: flightEndpointPatch.optional(),
  })
  .refine(nonempty);
export type SparseBoundaryPatch = z.infer<typeof sparseBoundaryPatchSchema>;
export type AuthoredPlacePatch = z.infer<typeof authoredPlacePatchSchema>;
export const emptyCoreBoundary = (): CoreBoundary =>
  coreBoundarySchema.parse({
    ...Object.fromEntries(
      Object.keys(coreBoundarySchema.shape).map((key) => [key, null]),
    ),
    quality: "UNKNOWN",
    basis: "DERIVED_CIVIL",
    civil_resolution: "PENDING",
  });
export function patchCoreBoundary(
  previous: CoreBoundary,
  patch: SparseBoundaryPatch,
): CoreBoundary {
  sparseBoundaryPatchSchema.parse(patch);
  const normalized = {
    ...patch,
    ...(patch.local_time
      ? { local_time: normalizeCoreClock(patch.local_time, patch.clock_precision!) }
      : {}),
  };
  if (
    Object.entries(normalized).every(
      ([key, value]) => previous[key as keyof CoreBoundary] === value,
    )
  )
    return previous;
  const next = { ...previous, ...normalized };
  return coreBoundarySchema.parse({
    ...next,
    instant: null,
    quality: next.local_time ? "ESTIMATED" : "UNKNOWN",
    basis: "DERIVED_CIVIL",
    supplied_offset_seconds: null,
    source_instant: null,
    source_instant_precision: null,
    civil_resolution: "PENDING",
    resolution_offset_seconds: null,
    interpretation_key: null,
    interpretation_input_sha256: null,
    provenance_refs: null,
  });
}
export function authoredPlaceChanges(
  previous: Record<string, unknown>,
  patch: AuthoredPlacePatch,
) {
  authoredPlacePatchSchema.parse(patch);
  const changes: Record<string, unknown> = { ...patch };
  if (Object.entries(patch).some(([key, value]) => (previous[key] ?? null) !== value)) {
    for (const key of Object.keys(corePlaceSchema.shape))
      if (key.startsWith("accepted_") || key === "spatial_provenance_refs")
        if (previous[key] !== null && previous[key] !== undefined) changes[key] = null;
    const revision = previous.location_input_revision;
    if (revision === Number.MAX_SAFE_INTEGER) throw new Error("REVISION_OVERFLOW");
    changes.location_input_revision = typeof revision === "number" ? revision + 1 : 1;
  }
  return changes;
}
