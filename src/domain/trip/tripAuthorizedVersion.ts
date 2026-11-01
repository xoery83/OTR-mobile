import { z } from "zod";
import {
  coreHash,
  coreUuid,
  itinerary_eventsSchema,
  coreTableSchemas,
} from "./tripCoreV2";
import {
  coreHashValue,
  validateCoreReadCollection,
  coreReadItemChildren,
  corePersonBindingSchema,
} from "./tripCoreV2Read";
import type { ImportHash } from "./flightImportReview";

// Read projection only; never an access certificate or a Core mutation proof.
export const authorizedTripVersionSchema = z.strictObject({
  version: z.literal("otr.core.authorized-trip-version/1"),
  actorAccountId: coreUuid,
  tripId: coreUuid,
  token: coreHash,
});
export type AuthorizedTripVersion = z.infer<typeof authorizedTripVersionSchema>;

// Only these authored families have a proved child-to-Item revision contract here.
export const authoredVersionItemSchema = itinerary_eventsSchema
  .pick({
    id: true,
    trip_id: true,
    semantic_revision: true,
    owner_account_id: true,
    visibility: true,
    field_state: true,
    experience_family: true,
    start_provenance_refs: true,
    end_provenance_refs: true,
    spatial_provenance_refs: true,
  })
  .extend({
    experience_family: z.enum(["P1", "P3"]),
    start_provenance_refs: z.null(),
    end_provenance_refs: z.null(),
    spatial_provenance_refs: z.null(),
  })
  .refine((r) =>
    Object.values(r.field_state).every(
      (s) => s.origin === "MANUAL" && s.evidence_ref === null,
    ),
  );

const authoredProjectionSchema = z.strictObject({
  actorAccountId: coreUuid,
  tripId: coreUuid,
  epoch: coreUuid,
  items: z.array(authoredVersionItemSchema).max(20000),
  participants: z.array(coreTableSchemas.trip_item_participants).max(20000),
  visibilityPeople: z.array(coreTableSchemas.trip_item_visibility_people).max(20000),
  bindings: z
    .array(
      corePersonBindingSchema.extend({
        revision: z.number().int().min(0).safe(),
      }),
    )
    .max(20000),
});
export type AuthoredVersionProjection = z.input<typeof authoredProjectionSchema>;

export async function authorizedTripVersionFromAuthoredProjection(
  input: AuthoredVersionProjection,
  hash: ImportHash,
): Promise<AuthorizedTripVersion> {
  const p = authoredProjectionSchema.parse(input);
  if (
    [...p.items, ...p.participants, ...p.visibilityPeople].some(
      (r) => r.trip_id !== p.tripId,
    )
  )
    throw Error("CORE_VERSION_SCOPE_MISMATCH");
  const sort = <T>(rows: T[], key: (row: T) => string) =>
    [...rows].sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));
  return {
    version: "otr.core.authorized-trip-version/1",
    actorAccountId: p.actorAccountId,
    tripId: p.tripId,
    token: await coreHashValue(
      "otr.core.authorized-authored-revisions/1",
      {
        ...p,
        readVersion: 2,
        projectionVersion: 2,
        items: sort(p.items, (r) => r.id),
        participants: sort(p.participants, (r) => r.item_id + ":" + r.person_id),
        visibilityPeople: sort(p.visibilityPeople, (r) => r.item_id + ":" + r.person_id),
        bindings: sort(p.bindings, (r) => r.person_id),
      },
      hash,
    ),
  };
}

export async function authorizedTripVersionFromCollection(
  collection: { manifest: unknown; pages: readonly unknown[] },
  actorAccountId: string,
  tripId: string,
  hash: ImportHash,
): Promise<AuthorizedTripVersion> {
  const snapshot = await validateCoreReadCollection(
    collection.manifest,
    [...collection.pages],
    actorAccountId,
    tripId,
    hash,
  );
  const records = [...snapshot.records].sort((a, b) =>
    a.kind !== b.kind
      ? a.kind < b.kind
        ? -1
        : 1
      : a.id < b.id
        ? -1
        : a.id > b.id
          ? 1
          : 0,
  );
  const projected: AuthoredVersionProjection = {
    actorAccountId,
    tripId,
    epoch: snapshot.manifest.epoch,
    items: [],
    participants: [],
    visibilityPeople: [],
    bindings: [],
  };
  let authored = snapshot.manifest.ordinaryOrderVersion === undefined;
  for (const r of records) {
    const body = r.body as Record<string, unknown>;
    if (r.kind === "ITEM") {
      const item = authoredVersionItemSchema.safeParse(
        Object.fromEntries(
          Object.keys(authoredVersionItemSchema.shape).map((k) => [k, body[k]]),
        ),
      );
      if (
        !item.success ||
        coreReadItemChildren.some(
          (table) =>
            (body[table] as unknown[]).length > 0 &&
            !(
              item.data.experience_family === "P3" &&
              (table === "trip_stay_details" || table === "trip_stay_rooms")
            ),
        )
      ) {
        authored = false;
        continue;
      }
      projected.items.push(item.data);
    } else if (r.kind === "PERSON_BINDING") {
      projected.bindings.push({
        ...corePersonBindingSchema.parse(body),
        revision: r.revision,
      });
    } else if (r.kind === "RELATION" && body.tableName === "trip_item_participants") {
      projected.participants.push(
        coreTableSchemas.trip_item_participants.parse(body.row),
      );
    } else if (
      r.kind === "RELATION" &&
      body.tableName === "trip_item_visibility_people"
    ) {
      projected.visibilityPeople.push(
        coreTableSchemas.trip_item_visibility_people.parse(body.row),
      );
    } else authored = false;
  }
  if (authored) return authorizedTripVersionFromAuthoredProjection(projected, hash);
  return {
    version: "otr.core.authorized-trip-version/1",
    actorAccountId,
    tripId,
    token: await coreHashValue(
      "otr.core.authorized-trip-visible-state/1",
      {
        actorAccountId,
        tripId,
        epoch: snapshot.manifest.epoch,
        readVersion: snapshot.manifest.readVersion,
        projectionVersion: snapshot.manifest.projectionVersion,
        ordinaryOrderVersion: snapshot.manifest.ordinaryOrderVersion ?? 0,
        records,
      },
      hash,
    ),
  };
}
