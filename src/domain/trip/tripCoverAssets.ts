import { z } from "zod";

// Reuse main’s existing registered covers; Native asset-program additions stay in its lane.
export const tripCoverAssetIds = Object.freeze(["city", "coast", "mountain", "cultural-oldtown"] as const);
export type TripCoverAssetId = (typeof tripCoverAssetIds)[number];
const registeredIds: ReadonlySet<string> = new Set(tripCoverAssetIds);
export function isTripCoverAssetId(value: unknown): value is TripCoverAssetId {
  return typeof value === "string" && registeredIds.has(value);
}

// A retained device-local photo reference is separate from the static registry.
export type TripPhotoCoverRef = `photo-${string}`;
const canonicalPhotoId = z.uuid().regex(/^[0-9a-f-]{36}$/);
export function parseTripPhotoCoverRef(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.startsWith("photo-")) return null;
  const parsed = canonicalPhotoId.safeParse(raw.slice(6));
  return parsed.success ? parsed.data : null;
}
export function tripPhotoCoverRef(assetId: string): TripPhotoCoverRef {
  return `photo-${canonicalPhotoId.parse(assetId)}`;
}
export type TripCoverChoice = TripCoverAssetId | TripPhotoCoverRef;

// Only `after` is eligibility checked; `before` can retain a future client's raw ID for CAS.
export type TripCoverUpdate = Readonly<{
  before: string | null;
  after: TripCoverChoice | null;
}>;
