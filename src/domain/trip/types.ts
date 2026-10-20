import type {
  LocalTripDestination,
  LocalTripDestinationInput,
} from "./localTripDestination";
import type { LocalPersonNameSlot } from "./localTripPerson";
import type { SyncableRecord } from "@/domain/sync/syncStatus";

import type { TripCoverAssetId } from "./tripCoverAssets";

export type BuiltInTripCoverId = TripCoverAssetId;

export type Trip = SyncableRecord & {
  destinations?: readonly LocalTripDestination[];
  name: string;
  destination: string | null;
  startDate: string | null;
  endDate: string | null;
  baseCurrency: string | null;
  ownerPersonId: string | null;
  selectedCoverAssetId?: BuiltInTripCoverId | null;
  /** Read-only stored preference, including unknown IDs; null alone means AUTO. */
  readonly selectedCoverAssetIdRaw?: string | null;
};

export type CreateTripInput = {
  /** Local ordered authored destinations, excluded from Hosted CREATE proof. */
  destinations?: readonly LocalTripDestinationInput[];
  /** Local creator nickname only; never changes Account identity or Hosted CREATE proof. */
  creatorDisplayName?: string;
  /** Local-only named slots; never part of the Hosted CREATE proof. */
  travelers?: readonly LocalPersonNameSlot[];
  operationId: string;
  tripId: string;
  name: string;
  destination?: string | null;
  startDate?: string | null;
  endDate?: string | null;
};
export type CreateTripItemInput = {
  operationId: string;
  itemId: string;
  family: "P1" | "P3";
  title: string;
  startDate: string;
  endDate?: string;
};
