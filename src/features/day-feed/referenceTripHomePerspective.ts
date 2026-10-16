import type { createTripDayFeedReader } from "@/data/repositories/tripDayFeedRepository";
type TripRead = Awaited<ReturnType<ReturnType<typeof createTripDayFeedReader>["trip"]>>;
const instants = {
  FUTURE: "2027-01-20T03:00:00Z",
  TODAY: "2027-02-06T03:00:00Z",
  PAST: "2027-02-20T03:00:00Z",
} as const;
// Existing approved Reference-only QA perspective; never changes Trip facts or admission.
export function referenceTripHomePerspective(
  read: TripRead | null,
  scenario: unknown,
  generation: number,
) {
  if (
    typeof __DEV__ === "undefined" ||
    !__DEV__ ||
    typeof scenario !== "string" ||
    !Object.hasOwn(instants, scenario)
  )
    return undefined;
  const projection = read?.observed?.projection;
  if (
    !read ||
    read.scope.generation !== generation ||
    read.scope.accountId !== "3a44420f-ec2b-4d7e-9770-410a5ed5e77e" ||
    read.observed?.sourceStatus !== "CURRENTLY_MATCHES_SOURCE" ||
    projection?.version !== 2 ||
    projection.tripId !== "b61b0000-0061-4000-8000-000000000001" ||
    projection.accountId !== read.scope.accountId ||
    // Projection generation belongs to the accepted certificate, not the Auth session.
    projection.source.epoch !== "72ac3662-e554-4f7c-9819-c18702d10650" ||
    !["70", "70.0"].includes(String(projection.source.revision)) ||
    projection.source.accessRevision !== 1 ||
    projection.source.manifestSha256 !==
      "225f00979f5251869f080df9e9565c1628af8b20ca38804545989390615a37d2"
  )
    return undefined;
  const now = instants[scenario as keyof typeof instants];
  return { now, date: now.slice(0, 10), zone: "Asia/Tokyo" };
}
