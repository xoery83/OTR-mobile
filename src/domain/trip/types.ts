import type { AuthoredCloudTravelers } from "./tripPersonCloudCreate";
import type {
  LocalTripDestination,
  LocalTripDestinationInput,
} from "./localTripDestination";
import type { LocalPersonNameSlot } from "./localTripPerson";
import type { SyncableRecord } from "@/domain/sync/syncStatus";

import type { TripCoverAssetId } from "./tripCoverAssets";

export type BuiltInTripCoverId = TripCoverAssetId;

export type Trip = SyncableRecord & {
  /** Stored original Create contract, never inferred from a local destination list. */
  syncFormatVersion?: 2;
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
  /** Explicit new Cloud-shared structured contract; never upgrades an old operation. */
  syncFormatVersion?: 2;
  /** Ordered destinations; Cloud-shared only for explicit syncFormatVersion2. */
  destinations?: readonly LocalTripDestinationInput[];
  /** Local creator nickname only; never changes Account identity or Hosted CREATE proof. */
  creatorDisplayName?: string;
  /** Local-only named slots; never part of the Hosted CREATE proof. */
  travelers?: readonly LocalPersonNameSlot[];
  /** Explicit current Add Traveler action; independent Person operations, never part of Trip Create wire. */
  cloudTravelers?: AuthoredCloudTravelers;
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
