import { z } from "zod";

// Candidate eligibility only; asset/rights/Native acceptance is a separate boundary.
export const nativeTripCoverAllowlistSha256 =
  "25a8ebf674d33369c8369eeae245ff586de90a788db04ea1feb843e8390a445a";
export const legacyTripCoverAssetIds = Object.freeze([
  "city",
  "coast",
  "mountain",
  "cultural-oldtown",
] as const);
export const nativeTripCoverAssetIds = Object.freeze([
  "wc-142191115",
  "wc-142949336",
  "wc-124361528",
  "wc-80558488",
  "wc-94201576",
  "wc-93673865",
  "wc-10073035",
  "wc-67613001",
  "wc-67612997",
  "wc-67612999",
  "wc-37839083",
  "wc-31260300",
  "wc-132537700",
  "wc-129045078",
  "wc-126724911",
  "wc-122637248",
  "wc-21375035",
  "wc-121485754",
  "wc-79286039",
  "wc-74555821",
  "wc-143514327",
  "wc-130572554",
  "wc-5420726",
  "wc-88746958",
  "wc-438293",
  "wc-82284289",
  "wc-154986747",
  "wc-134682226",
  "wc-38498608",
  "wc-38767181",
  "wc-49380370",
  "gen-b1-001",
  "gen-b1-002",
  "gen-b1-003",
  "gen-b1-004",
  "gen-b1-005",
  "gen-b1-006",
  "gen-b1-007",
  "gen-b1-008",
  "gen-b1-009",
  "gen-b1-010",
  "gen-b1-013",
  "gen-b1-014",
  "gen-b1-015",
  "gen-b1-016",
  "gen-b1-017",
  "gen-b1-018",
  "gen-b1-019",
] as const);
export const ownerPhotoTripCoverAllowlistSha256 =
  "1d9fcbe05882645f7846d253989a2720bb8bf55765c1fd8b1677b4c085051927";
export const ownerPhotoTripCoverAssetIds = Object.freeze([
  "owner-photo-a348f66b8ca5",
  "owner-photo-5e628170d2d6",
  "owner-photo-50aad6a676e3",
  "owner-photo-2fce9bae87de",
  "owner-photo-dc3432ce914a",
  "owner-photo-00b85fe9d39f",
  "owner-photo-ad070c44ed0d",
  "owner-photo-8c2f49c1c398",
  "owner-photo-04647dfa363b",
  "owner-photo-d2ee69b2dc93",
  "owner-photo-09ff913a4afd",
  "owner-photo-06bfb201f85e",
  "owner-photo-e3829c69b852",
  "owner-photo-593487a64e45",
  "owner-photo-ac283d3eb13a",
  "owner-photo-4c2b29ed6902",
  "owner-photo-dbfdcd6ae067",
  "owner-photo-f3bd568e51b0",
  "owner-photo-294588f753cc",
  "owner-photo-c52bee97d049",
  "owner-photo-4ce2b7680dde",
  "owner-photo-80dc5b807b13",
] as const);
export const tripCoverAssetIds = Object.freeze([
  ...legacyTripCoverAssetIds,
  ...nativeTripCoverAssetIds,
  ...ownerPhotoTripCoverAssetIds,
] as const);
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
