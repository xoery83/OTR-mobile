import { z } from "zod";
import {
  VERSION,
  civilDate,
  zone,
  flightNumber,
  evidenceSchema,
  proposalSchema,
  type FlightEnrichmentRequest,
} from "./contracts";
import type { CacheEntry, CachePort, CacheGrant } from "./ports";
export const grantSchema = z.strictObject({
  licenseReference: z.string().min(1).max(128),
  licenseUntil: z.iso.datetime(),
  maxRetentionMs: z
    .number()
    .int()
    .positive()
    .max(30 * 86400000),
  identity: z.strictObject({
    instanceId: z.string().min(1).max(128),
    flightNumber,
    departureLocalDate: civilDate,
    departureAirport: z.string().regex(/^[A-Z]{3}$/),
    arrivalAirport: z.string().regex(/^[A-Z]{3}$/),
    departureTimezone: zone,
    departureInstant: z.iso.datetime(),
    uniqueDesignatorOnDate: z.boolean(),
  }),
});
export const cacheEntrySchema = z.strictObject({
  version: z.literal(VERSION),
  providerId: z.string().min(1).max(128),
  modelId: z.string().min(1).max(128),
  observedAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  grant: grantSchema,
  result: z.strictObject({
    proposal: proposalSchema,
    evidence: z.array(evidenceSchema).max(5),
  }),
});
export function freshUntil(
  observedAt: number,
  departure: number,
  now: number,
  licenseUntil: number,
  maxRetentionMs: number,
  nearHours = 3,
): number {
  if (
    !Number.isFinite(observedAt) ||
    !Number.isFinite(departure) ||
    observedAt > now ||
    ![3, 4, 5, 6].includes(nearHours)
  )
    return now;
  const remaining = departure - now;
  if (remaining <= 0) return now;
  const tier =
    remaining > 72 * 3600000
      ? Math.min(observedAt + 30 * 86400000, departure - 72 * 3600000)
      : observedAt + (remaining > 24 * 3600000 ? 24 : nearHours) * 3600000;
  return Math.min(tier, observedAt + maxRetentionMs, licenseUntil, departure);
}
export function matchCache(
  entry: CacheEntry,
  request: FlightEnrichmentRequest,
  now: number,
  nearHours = 3,
): number | null {
  const checked = cacheEntrySchema.safeParse(entry);
  if (!checked.success) return null;
  const e = checked.data,
    i = e.grant.identity;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: i.departureTimezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(i.departureInstant));
  const part = (kind: string) => parts.find((p) => p.type === kind)?.value;
  if (`${part("year")}-${part("month")}-${part("day")}` !== i.departureLocalDate)
    return null;
  if (
    i.flightNumber !== request.flightNumber ||
    i.departureLocalDate !== request.departureLocalDate ||
    e.result.proposal.status === "AMBIGUOUS" ||
    e.result.proposal.candidates.length > 1
  )
    return null;
  if (!request.knownFields.departureAirport && !i.uniqueDesignatorOnDate) return null;
  for (const field of [
    "departureAirport",
    "arrivalAirport",
    "departureTimezone",
  ] as const)
    if (request.knownFields[field] && request.knownFields[field] !== i[field])
      return null;
  for (const field of [
    "flightNumber",
    "departureLocalDate",
    "departureAirport",
    "arrivalAirport",
    "departureTimezone",
  ] as const) {
    const v = e.result.proposal.fields[field]?.value;
    if (v !== undefined && v !== i[field]) return null;
  }
  const expires = Math.min(
    Date.parse(e.expiresAt),
    freshUntil(
      Date.parse(e.observedAt),
      Date.parse(i.departureInstant),
      now,
      Date.parse(e.grant.licenseUntil),
      e.grant.maxRetentionMs,
      nearHours,
    ),
  );
  return expires > now ? expires : null;
}
// Test/local implementation only. No database, background timer or Provider dispatch.
export class InMemoryFlightCache implements CachePort {
  private entries = new Map<string, CacheEntry>();
  private readonly capacity: number;
  constructor(capacity = 128) {
    this.capacity = capacity;
  }
  async lookup(
    query: Pick<
      FlightEnrichmentRequest,
      "flightNumber" | "departureLocalDate" | "knownFields"
    >,
  ): Promise<CacheEntry[]> {
    return structuredClone(
      [...this.entries.values()].filter(
        (e) =>
          e.grant.identity.flightNumber === query.flightNumber &&
          e.grant.identity.departureLocalDate === query.departureLocalDate,
      ),
    );
  }
  async put(entry: CacheEntry): Promise<void> {
    const e = cacheEntrySchema.parse(entry);
    if (
      !this.entries.has(e.grant.identity.instanceId) &&
      this.entries.size >= this.capacity
    )
      throw Error("CACHE_CAPACITY");
    this.entries.set(e.grant.identity.instanceId, structuredClone(e));
  }
}
export function buildCacheEntry(
  query: FlightEnrichmentRequest,
  result: CacheEntry["result"],
  grant: CacheGrant,
  providerId: string,
  modelId: string,
  now: number,
): CacheEntry | null {
  const parsed = grantSchema.safeParse(grant);
  if (!parsed.success) return null;
  const expiry = freshUntil(
    now,
    Date.parse(parsed.data.identity.departureInstant),
    now,
    Date.parse(parsed.data.licenseUntil),
    parsed.data.maxRetentionMs,
  );
  const entry: CacheEntry = {
    version: VERSION,
    providerId,
    modelId,
    observedAt: new Date(now).toISOString(),
    expiresAt: new Date(expiry).toISOString(),
    grant: parsed.data,
    result,
  };
  return matchCache(entry, query, now) !== null ? entry : null;
}
