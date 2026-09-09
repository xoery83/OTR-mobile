import type { SyncableRecord } from "@/domain/sync/syncStatus";

export type Trip = SyncableRecord & {
  name: string;
  destination: string | null;
  startDate: string | null;
  endDate: string | null;
  baseCurrency: string;
};
