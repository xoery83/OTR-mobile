export type SyncStatus =
  | "SYNCED"
  | "PENDING_CREATE"
  | "PENDING_UPDATE"
  | "PENDING_DELETE"
  | "CONFLICT"
  | "FAILED";

export type SyncableRecord = {
  id: string;
  serverId: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  syncStatus: SyncStatus;
  syncVersion: number;
};
