import { z } from "zod";
import { coreUuid, coreHash } from "../../src/domain/trip/tripCoreV2";
import { coreHashValue } from "../../src/domain/trip/tripCoreV2Read";
import type { ImportHash } from "../../src/domain/trip/flightImportReview";
import type { CorePgLease } from "./tripCoreV2PgStorage";

const rowSchema = z.strictObject({
  personId: coreUuid,
  tripId: coreUuid,
  ledgerMemberId: coreUuid.nullable(),
  ledgerTripId: coreUuid.nullable(),
  authority: z.literal("JOURNEY_MEMBERS_A1"),
  displayName: z.string(),
  role: z.string().nullable(),
  participationActive: z.boolean(),
  participationRevision: z.number().int().nonnegative().safe(),
});
const personSchema = z
  .strictObject({
    personId: coreUuid,
    ledgerMemberId: coreUuid.nullable(),
    memberMappingStatus: z.enum(["VERIFIED", "UNAVAILABLE"]),
    mappingReasonCode: z.string().min(1).nullable(),
    displayName: z.string(),
    role: z.enum(["OWNER", "ORGANIZER", "MEMBER"]).nullable(),
    participationActive: z.boolean().nullable(),
    participationRevision: z.number().int().nonnegative().safe().nullable(),
  })
  .refine((p) =>
    p.memberMappingStatus === "VERIFIED"
      ? p.ledgerMemberId !== null && p.mappingReasonCode === null
      : p.ledgerMemberId === null && p.mappingReasonCode !== null,
  );
export const rosterSnapshotSchema = z
  .strictObject({
    tripId: coreUuid,
    actorAccountId: coreUuid,
    rosterHash: coreHash,
    complete: z.boolean(),
    memberMappingsComplete: z.boolean(),
    memberMappingHash: coreHash,
    people: z.array(personSchema).max(20000),
  })
  .refine(
    (r) =>
      r.memberMappingsComplete ===
      r.people.every((p) => p.memberMappingStatus === "VERIFIED"),
  );
export async function readRosterRows(lease: CorePgLease, actor: string, trip: string) {
  return z
    .array(rowSchema)
    .max(20000)
    .parse(
      (
        await lease.query(
          "SELECT public.trip_core_read_roster($1::uuid,$2::uuid) AS result",
          [actor, trip],
        )
      ).rows[0]?.result,
    );
}
export async function projectTripRoster(
  input: unknown,
  actor: string,
  trip: string,
  hash: ImportHash,
) {
  coreUuid.parse(actor);
  coreUuid.parse(trip);
  const rows = z
    .array(rowSchema)
    .max(20000)
    .parse(input)
    .sort((a, b) => a.personId.localeCompare(b.personId));
  if (
    rows.some((p) => p.tripId !== trip) ||
    new Set(rows.map((p) => p.personId)).size !== rows.length
  )
    throw new Error("NOT_VISIBLE");
  const mappingCounts = new Map<string, number>();
  for (const row of rows)
    if (row.ledgerMemberId !== null)
      mappingCounts.set(
        row.ledgerMemberId,
        (mappingCounts.get(row.ledgerMemberId) ?? 0) + 1,
      );
  const people = rows.map((p) => {
    const mappingReasonCode =
      p.ledgerMemberId === null
        ? "MISSING_LEDGER_MEMBER"
        : p.ledgerTripId !== trip
          ? "CROSS_TRIP_MAPPING"
          : mappingCounts.get(p.ledgerMemberId) !== 1
            ? "AMBIGUOUS_LEDGER_MEMBER"
            : p.personId !== p.ledgerMemberId
              ? "A1_IDENTITY_MISMATCH"
              : null;
    const role =
      p.role === "owner"
        ? "OWNER"
        : p.role === "organizer"
          ? "ORGANIZER"
          : p.role === "member" || p.role === "group_member"
            ? "MEMBER"
            : null;
    return {
      personId: p.personId,
      ledgerMemberId: mappingReasonCode ? null : p.ledgerMemberId,
      memberMappingStatus: mappingReasonCode
        ? ("UNAVAILABLE" as const)
        : ("VERIFIED" as const),
      mappingReasonCode,
      displayName: p.displayName,
      role,
      participationActive: p.participationActive,
      participationRevision: p.participationRevision,
    };
  });
  const rosterHash = await coreHashValue(
    "otr-trip-roster-v1",
    { actorAccountId: actor, tripId: trip, people },
    hash,
  );
  return rosterSnapshotSchema.parse({
    actorAccountId: actor,
    tripId: trip,
    rosterHash,
    complete: true,
    memberMappingsComplete: people.every((p) => p.memberMappingStatus === "VERIFIED"),
    people,
    memberMappingHash: await coreHashValue(
      "otr-trip-ledger-member-mapping-v1",
      {
        actorAccountId: actor,
        tripId: trip,
        rosterHash,
        mappings: people.map(
          ({ personId, ledgerMemberId, memberMappingStatus, mappingReasonCode }) => ({
            personId,
            ledgerMemberId,
            memberMappingStatus,
            mappingReasonCode,
          }),
        ),
      },
      hash,
    ),
  });
}
export async function tripPeopleBoundary(
  request: Request,
  actor: string,
  canRead: (actor: string, trip: string) => Promise<boolean>,
  read?: { people?(actor: string, trip: string): Promise<unknown> },
) {
  const reply = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
      status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "private, no-store",
        Vary: "Authorization",
      },
    });
  const fail = (status: number, code: string) =>
    reply(status, { error: { code, message: code } });
  const url = new URL(request.url),
    match = /^\/v2\/trips\/([^/]+)\/people$/.exec(url.pathname);
  if (request.method !== "GET") return fail(405, "METHOD_NOT_ALLOWED");
  if (
    !match ||
    !coreUuid.safeParse(match[1]).success ||
    url.search ||
    request.body !== null
  )
    return fail(400, "INVALID_PAYLOAD");
  try {
    if (!(await canRead(actor, match[1]))) return fail(403, "FORBIDDEN");
    if (!read?.people) return fail(503, "CAPABILITY_UNAVAILABLE");
    const result = rosterSnapshotSchema.parse(await read.people(actor, match[1]));
    if (result.actorAccountId !== actor || result.tripId !== match[1])
      return fail(503, "RESULT_MISMATCH");
    return reply(200, result);
  } catch (error) {
    return error instanceof Error && error.message === "NOT_VISIBLE"
      ? fail(403, "NOT_VISIBLE")
      : fail(503, "CAPABILITY_UNAVAILABLE");
  }
}
