import type { CreateTripItemInput } from "@/domain/trip/types";
import type { TripRepository } from "../tripRepository";

const id = (value: number) =>
  `b61a0000-0061-4000-8000-${value.toString(16).padStart(12, "0")}`;

// QA-only pending subset of the full sixteen-Item scenario; never accepted authority.
export const referenceTripV1 = {
  version: "otr-reference-trip/1",
  seedVersion: "otr-reference-trip-local-pending/1",
  namespace: "b61a0000-0061-4000-8000",
  createdAt: "2027-01-01T00:00:00Z",
  qaViewClock: { instant: "2027-02-06T03:00:00Z", zone: "Asia/Tokyo" },
  trip: {
    tripId: id(1),
    operationId: id(2),
    name: "OTR Reference Trip V1",
    destination: "Auckland / Tokyo / Kyoto / Osaka",
    startDate: "2027-02-01",
    endDate: "2027-02-12",
  },
  persons: [1, 2, 3].map((number) => ({
    personId: id(100 + number),
    displayName: `Reference Person ${number}`,
    status: "DEFERRED_OWNING_PRODUCER" as const,
  })),
  items: [
    {
      itemId: id(1001),
      operationId: id(2001),
      family: "P1",
      title: "Reference Tokyo neighbourhood walk",
      startDate: "2027-02-02",
    },
    {
      itemId: id(1002),
      operationId: id(2002),
      family: "P1",
      title: "Reference Kyoto market — time undecided",
      startDate: "2027-02-07",
    },
    {
      itemId: id(1005),
      operationId: id(2005),
      family: "P3",
      title: "Reference Tokyo multi-night stay",
      startDate: "2027-02-01",
      endDate: "2027-02-05",
    },
    {
      itemId: id(1006),
      operationId: id(2006),
      family: "P3",
      title: "Reference Kyoto single-night stay",
      startDate: "2027-02-05",
      endDate: "2027-02-06",
    },
    {
      itemId: id(1007),
      operationId: id(2007),
      family: "P3",
      title: "Reference Kyoto replacement base",
      startDate: "2027-02-06",
      endDate: "2027-02-12",
    },
  ] satisfies CreateTripItemInput[],
} as const;

export async function seedReferenceTripV1(
  repository: Pick<TripRepository, "createTrip" | "addItem">,
) {
  const trip = await repository.createTrip(referenceTripV1.trip);
  for (const item of referenceTripV1.items) await repository.addItem(trip.id, item);
  return trip;
}
