import { z } from "zod";
import { instantMicroseconds, validateCalendarDate } from "./dayReadModel";

// Command minute labels are expanded for storage without claiming second precision.
export function normalizeCoreClock(value: string, precision: number): string {
  if (!Number.isInteger(precision) || precision < -1 || precision > 6)
    throw new Error("INVALID_CLOCK_PRECISION");
  const minute = /^([01]\d|2[0-3]):[0-5]\d$/;
  const second = /^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/;
  if (precision === -1 && minute.test(value)) return `${value}:00`;
  if (precision === -1 && second.test(value) && value.endsWith(":00")) return value;
  if (precision === 0 && second.test(value)) return value;
  if (
    precision > 0 &&
    new RegExp(`^([01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d\\.\\d{${precision}}$`).test(value)
  )
    return value;
  throw new Error("INVALID_CLOCK_PRECISION");
}

const precision = z.number().int().min(-1).max(6).nullable();
const instant = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/)
  .nullable();
export const coreBoundarySchema = z
  .strictObject({
    instant,
    local_date: z.string().nullable(),
    local_time: z.string().nullable(),
    clock_precision: precision,
    quality: z.enum(["UNKNOWN", "EXACT", "ESTIMATED"]).nullable(),
    basis: z.enum(["DERIVED_CIVIL", "SOURCE_INSTANT"]).nullable(),
    zone_id: z.string().min(1).max(128).nullable(),
    supplied_offset_seconds: z.number().int().min(-64800).max(64800).nullable(),
    source_instant: instant,
    source_instant_precision: precision,
    civil_resolution: z
      .enum(["PENDING", "UNIQUE", "GAP", "FOLD", "FOLD_RESOLVED"])
      .nullable(),
    resolution_offset_seconds: z.number().int().min(-64800).max(64800).nullable(),
    interpretation_key: z.string().max(256).nullable(),
    interpretation_input_sha256: z
      .string()
      .regex(/^[0-9a-f]{64}$/)
      .nullable(),
    provenance_refs: z.record(z.string().max(128), z.string().max(512)).nullable(),
  })
  .superRefine((t, c) => {
    const fail = () => c.addIssue({ code: "custom", message: "INVALID_TEMPORAL_TUPLE" });
    try {
      if (t.local_date) validateCalendarDate(t.local_date);
      if ((t.local_time === null) !== (t.clock_precision === null)) return fail();
      if (t.local_time) normalizeCoreClock(t.local_time, t.clock_precision!);
      if ((t.source_instant === null) !== (t.source_instant_precision === null))
        return fail();
      if (t.source_instant) {
        instantMicroseconds(t.source_instant);
        const n = t.source_instant_precision!;
        const m = t.source_instant.match(/\.(\d+)(?:Z|[+-])/);
        if (
          n < 0
            ? !/:00(?:Z|[+-])/.test(t.source_instant) || !!m
            : (m?.[1].length ?? 0) !== n
        )
          return fail();
      }
      if (t.instant) {
        instantMicroseconds(t.instant);
        if (t.quality !== "EXACT") return fail();
        if (t.basis === "SOURCE_INSTANT") {
          if (
            !t.source_instant ||
            instantMicroseconds(t.source_instant) !== instantMicroseconds(t.instant)
          )
            return fail();
        } else if (
          t.basis !== "DERIVED_CIVIL" ||
          !t.local_date ||
          !t.local_time ||
          !t.zone_id ||
          !["UNIQUE", "FOLD_RESOLVED"].includes(t.civil_resolution ?? "") ||
          t.resolution_offset_seconds === null ||
          !t.interpretation_key ||
          !t.interpretation_input_sha256 ||
          instantMicroseconds(`${t.local_date}T${t.local_time}Z`) -
            BigInt(t.resolution_offset_seconds) * 1000000n !==
            instantMicroseconds(t.instant)
        )
          return fail();
      } else if (
        t.basis === "SOURCE_INSTANT" ||
        t.source_instant !== null ||
        !["PENDING", null].includes(t.civil_resolution)
      )
        return fail();
      if (!t.local_time && !t.source_instant && t.quality !== "UNKNOWN") return fail();
      if (t.local_time && !t.instant && t.quality !== "ESTIMATED") return fail();
      if (t.civil_resolution === "GAP" || t.civil_resolution === "FOLD") return fail();
    } catch {
      fail();
    }
  });
export type CoreBoundary = z.infer<typeof coreBoundarySchema>;
export function coreDateBoundary(date: string): CoreBoundary {
  return coreBoundarySchema.parse({
    instant: null,
    local_date: date,
    local_time: null,
    clock_precision: null,
    quality: "UNKNOWN",
    basis: "DERIVED_CIVIL",
    zone_id: null,
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

export function coreStoredBoundary(
  row: Record<string, unknown>,
  role?: "start" | "end",
): CoreBoundary {
  const fields = Object.keys(coreBoundarySchema.shape);
  return coreBoundarySchema.parse(
    Object.fromEntries(
      fields.map((key) => [
        key,
        row[role ? (key === "instant" ? "planned_" + role : role + "_" + key) : key] ??
          null,
      ]),
    ),
  );
}
