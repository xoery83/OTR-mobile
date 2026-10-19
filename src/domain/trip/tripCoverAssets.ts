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
export const tripCoverAssetIds = Object.freeze([
  ...legacyTripCoverAssetIds,
  ...nativeTripCoverAssetIds,
] as const);
export type TripCoverAssetId = (typeof tripCoverAssetIds)[number];
const registeredIds: ReadonlySet<string> = new Set(tripCoverAssetIds);
export function isTripCoverAssetId(value: unknown): value is TripCoverAssetId {
  return typeof value === "string" && registeredIds.has(value);
}

// Only `after` is eligibility checked; `before` can retain a future client's raw ID for CAS.
export type TripCoverUpdate = Readonly<{
  before: string | null;
  after: TripCoverAssetId | null;
}>;
