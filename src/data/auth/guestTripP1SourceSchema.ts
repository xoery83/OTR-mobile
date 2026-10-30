import { z } from "zod";
import { coreHash, coreUuid } from "@/domain/trip/tripCoreV2";
import { validateCoreCommand } from "@/domain/trip/tripCoreV2Commands";
import { coreHashValue } from "@/domain/trip/tripCoreV2Read";
import { canonicalCoreJson, type Json } from "@/domain/trip/tripCoreV2Json";
import { tripCreateWireRequestSchema } from "@/domain/trip/tripCreateWireContract";
import { tripMetadataSchema } from "@/domain/trip/tripMetadataContract";
import { structuredTripMetadataSchema } from "@/domain/trip/tripStructuredDestinationContract";
import { retainedDeferredTripMetadataSchema } from "@/domain/trip/tripDeferredMetadata";
import { localPersonCreateSchema } from "@/domain/trip/localTripPerson";
import { isTripCoverAssetId } from "@/domain/trip/tripCoverAssets";
import { ledgerBootstrapResponseSchema } from "../api/ledgerReadContracts";
import { tripCoreSha256Hex } from "../repositories/tripCoreSha256";
import { guestFilelessCapabilityVersion } from "./guestRegisteredFileQualification";

const canonical = (value: unknown) => canonicalCoreJson(value as Json);
const count = z.number().int().nonnegative().safe();
const cover = z.string().refine(isTripCoverAssetId).nullable();
const instant = z.iso.datetime({ offset: true });
const sourceSchema = z.strictObject({
  schemaId: z.literal("otr.auth.guest-trip-p1-source/1"),
  sourceKind: z.literal("GUEST"),
  capabilityVersion: z.literal(guestFilelessCapabilityVersion),
  sqliteVersion: z.union([z.literal(74), z.literal(75)]),
  sourceGuestLocalId: coreUuid,
  sourceTablesSha256: coreHash,
  cloudAuthority: z.literal(false),
  totals: z.strictObject({
    trips: count,
    people: count,
    p1Items: count,
    queueOperations: count,
  }),
  trips: z.array(
    z.strictObject({
      create: tripCreateWireRequestSchema,
      metadata: z.union([structuredTripMetadataSchema, tripMetadataSchema]),
      sourceTimeline: z.strictObject({ createdAt: instant, updatedAt: instant }),
      ledgerInitialization: ledgerBootstrapResponseSchema.shape.journey.strict(),
      creator: z.strictObject({ personId: coreUuid, displayName: z.string().max(256) }),
      people: z.array(localPersonCreateSchema),
      selectedCoverAssetId: cover,
      personalCover: z.strictObject({ selectedCoverAssetId: cover }).nullable(),
      deferredMetadata: z.array(retainedDeferredTripMetadataSchema),
      coreIntents: z.array(
        z.strictObject({
          command: z.unknown().transform((value, context) => {
            try {
              return validateCoreCommand(value);
            } catch {
              context.addIssue({
                code: "custom",
                message: "GUEST_SOURCE_COMMAND_INVALID",
              });
              return z.NEVER;
            }
          }),
          canonicalText: z.string(),
          sha256: coreHash,
          createdAt: instant,
          state: z.enum(["PENDING", "BLOCKED"]),
        }),
      ),
      queueOperationIds: z.array(coreUuid),
    }),
  ),
});

export const guestSourceCheckpointSchema = z.strictObject({
  canonicalText: z.string(),
  sha256: coreHash,
  bytes: count,
});

// Hashes detect corruption; this local record never grants server authority.
export async function verifyGuestSourceCheckpoint(
  input: z.input<typeof guestSourceCheckpointSchema>,
  scope: { sourceGuestLocalId: string; tripIds: string[] },
) {
  const record = guestSourceCheckpointSchema.parse(input);
  const source = sourceSchema.parse(JSON.parse(record.canonicalText));
  const fail = () => {
    throw Error("GUEST_ADOPTION_RECOVERY_SOURCE_PIN");
  };
  if (
    canonical(source) !== record.canonicalText ||
    new TextEncoder().encode(record.canonicalText).byteLength !== record.bytes ||
    (await tripCoreSha256Hex(new TextEncoder().encode(record.canonicalText))) !==
      record.sha256 ||
    source.sourceGuestLocalId !== scope.sourceGuestLocalId ||
    canonical(source.trips.map((t) => t.create.tripId).sort()) !==
      canonical([...scope.tripIds].sort())
  )
    fail();

  const operations = new Set<string>(),
    queue = new Set<string>(),
    people = new Set<string>();
  let p1Items = 0;
  function unique(set: Set<string>, id: string) {
    if (set.has(id)) fail();
    set.add(id);
  }
  const tripIds = new Set<string>();
  for (const trip of source.trips) {
    const tripId = trip.create.tripId;
    unique(tripIds, tripId);
    unique(people, trip.creator.personId);
    if (trip.ledgerInitialization.id !== tripId) fail();
    const { operationId, tripId: _tripId, ...initial } = trip.create;
    unique(operations, operationId);
    const expectedQueue = new Set([operationId]);
    for (const person of trip.people) {
      if (
        person.tripId !== tripId ||
        person.accountId !== source.sourceGuestLocalId ||
        person.tripCreateOperationId !== operationId
      )
        fail();
      unique(people, person.personId);
      unique(operations, person.operationId);
      unique(expectedQueue, person.operationId);
    }
    let predecessor = operationId;
    let metadata =
      "formatVersion" in initial
        ? structuredTripMetadataSchema.parse(
            (({ formatVersion: _version, ...rest }) => rest)(initial),
          )
        : tripMetadataSchema.parse(initial);
    for (const action of trip.deferredMetadata) {
      if (
        action.tripId !== tripId ||
        action.dependencyOperationId !== predecessor ||
        canonical(action.before) !== canonical(metadata)
      )
        fail();
      if (
        action.cover &&
        [action.cover.before, action.cover.after].some(
          (id) => id !== null && !isTripCoverAssetId(id),
        )
      )
        fail();
      unique(operations, action.operationId);
      unique(expectedQueue, action.actionId);
      predecessor = action.operationId;
      metadata = action.after;
    }
    if (canonical(metadata) !== canonical(trip.metadata)) fail();
    const created = new Set<string>();
    for (const { command } of trip.coreIntents) {
      if (command.command === "CREATE_ITEM") {
        if ((command.payload as { family: string }).family !== "P1") fail();
        unique(created, command.target.id);
      }
    }
    p1Items += created.size;
    for (const intent of trip.coreIntents) {
      const command = intent.command;
      if (
        command.tripId !== tripId ||
        command.target.kind !== "ITEM" ||
        !created.has(command.target.id) ||
        command.admission.mode !== "MANUAL" ||
        ![
          "CREATE_ITEM",
          "SET_ITEM_TEXT",
          "SET_ITEM_SCHEDULE",
          "SET_ITEM_PLACE",
          "SET_ITEM_PARTICIPATION",
        ].includes(command.command) ||
        intent.canonicalText !== canonical(command) ||
        intent.sha256 !==
          (await coreHashValue("otr-trip-core-intent-v2", command, tripCoreSha256Hex))
      )
        fail();
      unique(operations, command.operationId);
      unique(expectedQueue, command.operationId);
    }
    for (const id of trip.queueOperationIds) unique(queue, id);
    if (
      trip.queueOperationIds.length !== expectedQueue.size ||
      trip.queueOperationIds.some((id) => !expectedQueue.has(id))
    )
      fail();
  }
  if (
    source.trips.some((t) => t.deferredMetadata.some((a) => queue.has(a.operationId))) ||
    source.totals.trips !== tripIds.size ||
    source.totals.people !== people.size ||
    source.totals.p1Items !== p1Items ||
    source.totals.queueOperations !== queue.size
  )
    fail();
  return source;
}
