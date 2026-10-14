import type { SyncableRecord } from "@/domain/sync/syncStatus";

export type BuiltInTripCoverId = "city" | "coast" | "mountain" | "cultural-oldtown";

export type Trip = SyncableRecord & {
  name: string;
  destination: string | null;
  startDate: string | null;
  endDate: string | null;
  baseCurrency: string | null;
  ownerPersonId: string | null;
  selectedCoverAssetId?: BuiltInTripCoverId | null;
};

export type CreateTripInput = {
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
