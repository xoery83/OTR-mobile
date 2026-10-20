import { z } from "zod";
import {
  instantMicroseconds,
  localCalendarDate,
  validateCalendarDate,
} from "./dayReadModel";

export const ttrModeSchema = z.enum(["walking", "driving", "transit"]);
export type TtrMode = z.infer<typeof ttrModeSchema>;
const token = z
  .string()
  .min(1)
  .max(256)
  .refine((v) => v.trim() === v);
const uuid = z.uuid().refine((v) => v === v.toLowerCase());
const revision = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const role = z.enum([
  "START",
  "END",
  "ORIGIN",
  "DESTINATION",
  "CHECKIN",
  "CHECKOUT",
  "PICKUP",
  "RETURN",
  "BASE_FROM",
  "BASE_RETURN",
  "ENTRY",
]);
const point = z.strictObject({
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
});
export type TtrPoint = z.infer<typeof point>;
const samePoint = (a: TtrPoint, b: TtrPoint) =>
  a.latitude === b.latitude &&
  (a.longitude === b.longitude ||
    Math.abs(a.longitude - b.longitude) === 360 ||
    Math.abs(a.latitude) === 90);
const scope = z.strictObject({
  accountId: uuid,
  tripId: uuid,
  travellerKey: token,
  generation: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
});
const expiry = z.strictObject({ eventDate: z.string(), zone: z.string() });
export type TtrExpiry = z.infer<typeof expiry>;
const occurrence = z.strictObject({
  accountId: uuid,
  tripId: uuid,
  travellerKey: token,
  sourceKey: token,
  eventId: uuid,
  occurrenceToken: token.nullable(),
  role: role.nullable(),
  semanticRevision: revision,
  applicable: z.enum(["YES", "NO", "UNKNOWN"]),
  title: z.string().optional(),
  notes: z.string().optional(),
  endpoint: z
    .strictObject({
      role,
      qualification: z.enum(["QUALIFIED", "TEXT_ONLY", "UNAVAILABLE"]),
      coordinates: point.nullable(),
      provenance: token.nullable(),
      locationInputRevision: revision.nullable(),
    })
    .nullable(),
});
const queryTime = z.strictObject({
  kind: z.enum(["DEPARTURE", "ARRIVAL"]),
  instant: z.string(),
  zone: z.string(),
  quality: z.enum(["EXACT", "ESTIMATED", "UNKNOWN"]),
  precision: z.number().int().min(-1).max(6),
  comparable: z.boolean(),
});
export const ttrSpatialEquivalenceSchema = z.discriminatedUnion("equivalence", [
  z.strictObject({ equivalence: z.literal("UNKNOWN") }),
  z.strictObject({ equivalence: z.literal("SAME_LOCATION"), provenance: token }),
]);
export type TtrSpatialEquivalence = z.infer<typeof ttrSpatialEquivalenceSchema>;
export const ttrInputSchema = z.strictObject({
  scope,
  source: z.strictObject({ key: token, complete: z.boolean(), accessible: z.boolean() }),
  from: occurrence.nullable(),
  to: occurrence.nullable(),
  continuity: z
    .strictObject({
      fromToken: token,
      toToken: token,
      travellerKey: token,
      provenance: token,
      proven: z.boolean(),
      crossDay: z.boolean(),
    })
    .nullable(),
  special: z.enum([
    "ORDINARY",
    "EXPLICIT_TRANSPORT",
    "FLIGHT_WAIT",
    "FLEXIBLE_POOL",
    "CONFIRMED_BLOCK",
  ]),
  blockAnchorsConfirmed: z.boolean(),
  period: z.enum(["FUTURE", "TODAY", "PAST", "UNKNOWN"]),
  queryTime: queryTime.nullable(),
  expiry: expiry.nullable(),
  // Compatibility: old inputs carry no equivalence evidence, so remain UNKNOWN.
  spatialEquivalence: ttrSpatialEquivalenceSchema.optional(),
  anchors: z.strictObject({ fromRowKey: token, toRowKey: token }),
});
export type TtrInput = z.infer<typeof ttrInputSchema>;
export type TtrIdentity = Readonly<{
  accountId: string;
  tripId: string;
  fromEventId: string;
  toEventId: string;
  occurrenceDiscriminator: string;
}>;
export type TtrUnavailableReason =
  | "INVALID_SOURCE_CONTEXT"
  | "ACCESS_UNAVAILABLE"
  | "MISSING_ENDPOINT"
  | "UNQUALIFIED_COORDINATES"
  | "MISSING_PROVENANCE"
  | "UNKNOWN_APPLICABILITY"
  | "UNKNOWN_CONTINUITY"
  | "AMBIGUOUS_OCCURRENCE"
  | "EXPLICIT_TRANSPORT"
  | "FLIGHT_WAIT"
  | "UNSELECTED_FLEXIBLE_POOL"
  | "UNCONFIRMED_BLOCK";
export type TtrQualification =
  | Readonly<{ status: "UNQUALIFIED"; reason: TtrUnavailableReason }>
  | Readonly<{
      status: "QUALIFIED";
      identity: TtrIdentity;
      input: TtrInput;
      geometricDistance: Readonly<{
        kind: "STRAIGHT_LINE";
        source: "LOCAL_GEOMETRY";
        meters: number;
      }>;
      spatialEquivalence: TtrSpatialEquivalence;
      timedEligible: boolean;
    }>;

export function ttrIdentity(input: TtrInput): TtrIdentity | null {
  const { from, to, scope: s } = input;
  if (!from?.occurrenceToken || !to?.occurrenceToken || !from.role || !to.role)
    return null;
  if (
    [from, to].some(
      (o) =>
        o.accountId !== s.accountId ||
        o.tripId !== s.tripId ||
        o.travellerKey !== s.travellerKey,
    )
  )
    return null;
  return Object.freeze({
    accountId: s.accountId,
    tripId: s.tripId,
    fromEventId: from.eventId,
    toEventId: to.eventId,
    occurrenceDiscriminator: JSON.stringify([
      s.travellerKey,
      from.occurrenceToken,
      from.role,
      to.occurrenceToken,
      to.role,
    ]),
  });
}
export const ttrIdentityKey = (identity: TtrIdentity) =>
  JSON.stringify([
    identity.accountId,
    identity.tripId,
    identity.fromEventId,
    identity.toEventId,
    identity.occurrenceDiscriminator,
  ]);

export function straightLineDistance(from: TtrPoint, to: TtrPoint): number {
  const a = point.parse(from),
    b = point.parse(to);
  if (samePoint(a, b)) return 0;
  const rad = (n: number) => (n * Math.PI) / 180;
  const h =
    Math.sin(rad(b.latitude - a.latitude) / 2) ** 2 +
    Math.cos(rad(a.latitude)) *
      Math.cos(rad(b.latitude)) *
      Math.sin(rad(b.longitude - a.longitude) / 2) ** 2;
  return 6371008.8 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h))));
}
export function exactQueryTime(time: TtrInput["queryTime"]): boolean {
  if (!time || time.quality !== "EXACT" || !time.comparable || time.precision < 0)
    return false;
  try {
    instantMicroseconds(time.instant);
    localCalendarDate(time.instant, time.zone);
    return true;
  } catch {
    return false;
  }
}
export function qualifyTtr(raw: unknown): TtrQualification {
  const parsed = ttrInputSchema.safeParse(raw);
  const fail = (reason: TtrUnavailableReason): TtrQualification => ({
    status: "UNQUALIFIED",
    reason,
  });
  if (!parsed.success) return fail("INVALID_SOURCE_CONTEXT");
  const input = parsed.data,
    { from, to, source, scope: s } = input;
  if (!source.accessible) return fail("ACCESS_UNAVAILABLE");
  if (!source.complete) return fail("INVALID_SOURCE_CONTEXT");
  if (!from || !to) return fail("MISSING_ENDPOINT");
  if (
    [from, to].some(
      (o) =>
        o.accountId !== s.accountId ||
        o.tripId !== s.tripId ||
        o.sourceKey !== source.key ||
        o.travellerKey !== s.travellerKey,
    ) ||
    from.eventId === to.eventId
  )
    return fail("INVALID_SOURCE_CONTEXT");
  if ([from, to].some((o) => o.applicable !== "YES"))
    return fail("UNKNOWN_APPLICABILITY");
  const identity = ttrIdentity(input);
  if (!identity) return fail("AMBIGUOUS_OCCURRENCE");
  if (
    !from.endpoint ||
    !to.endpoint ||
    from.endpoint.role !== from.role ||
    to.endpoint.role !== to.role
  )
    return fail("MISSING_ENDPOINT");
  if (
    [from, to].some(
      (o) => o.endpoint!.qualification !== "QUALIFIED" || !o.endpoint!.coordinates,
    )
  )
    return fail("UNQUALIFIED_COORDINATES");
  if (
    [from, to].some(
      (o) => !o.endpoint!.provenance || o.endpoint!.locationInputRevision === null,
    )
  )
    return fail("MISSING_PROVENANCE");
  const c = input.continuity;
  if (
    !c?.proven ||
    c.fromToken !== from.occurrenceToken ||
    c.toToken !== to.occurrenceToken ||
    c.travellerKey !== s.travellerKey
  )
    return fail("UNKNOWN_CONTINUITY");
  if (input.special === "EXPLICIT_TRANSPORT") return fail("EXPLICIT_TRANSPORT");
  if (input.special === "FLIGHT_WAIT") return fail("FLIGHT_WAIT");
  if (input.special === "FLEXIBLE_POOL") return fail("UNSELECTED_FLEXIBLE_POOL");
  if (input.special === "CONFIRMED_BLOCK" && !input.blockAnchorsConfirmed)
    return fail("UNCONFIRMED_BLOCK");
  const a = from.endpoint.coordinates!,
    b = to.endpoint.coordinates!;
  return {
    status: "QUALIFIED",
    input,
    identity,
    geometricDistance: Object.freeze({
      kind: "STRAIGHT_LINE",
      source: "LOCAL_GEOMETRY",
      meters: straightLineDistance(a, b),
    }),
    spatialEquivalence: Object.freeze(
      input.spatialEquivalence ?? { equivalence: "UNKNOWN" },
    ),
    timedEligible: exactQueryTime(input.queryTime),
  };
}
export function ttrRouteFingerprint(
  q: Extract<TtrQualification, { status: "QUALIFIED" }>,
  mode: TtrMode,
): string {
  const endpoint = (o: NonNullable<TtrInput["from"]>) => [
    o.endpoint!.coordinates,
    o.endpoint!.locationInputRevision,
    o.endpoint!.provenance,
  ];
  return JSON.stringify([
    "ttr-query/1",
    ttrIdentityKey(q.identity),
    ttrModeSchema.parse(mode),
    "ETA",
    endpoint(q.input.from!),
    endpoint(q.input.to!),
    exactQueryTime(q.input.queryTime) ? q.input.queryTime : null,
  ]);
}
export function ttrExpired(value: TtrExpiry | null, now: string): boolean {
  if (!value) return false;
  try {
    validateCalendarDate(value.eventDate);
    return localCalendarDate(now, value.zone) > value.eventDate;
  } catch {
    return false;
  }
}
