import { z } from "zod";
import { coreHash, coreUuid } from "./tripCoreV2";
import { coreHashValue, validateCoreReadCollection } from "./tripCoreV2Read";
import type { ImportHash } from "./flightImportReview";

// Read projection only; never an access certificate or a Core mutation proof.
export const authorizedTripVersionSchema = z.strictObject({
  version: z.literal("otr.core.authorized-trip-version/1"),
  actorAccountId: coreUuid,
  tripId: coreUuid,
  token: coreHash,
});
export type AuthorizedTripVersion = z.infer<typeof authorizedTripVersionSchema>;

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
