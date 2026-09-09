export type ItinerarySyncStatus = "PENDING_CREATE" | "SYNCING" | "SYNCED" | "FAILED";

export type ItineraryItem = {
  id: string;
  serverId: string | null;
  tripId: string;
  title: string;
  scheduledDate: string;
  startTime: string | null;
  location: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  syncStatus: ItinerarySyncStatus;
  syncVersion: number;
};

export type CreateItineraryItemInput = {
  title: string;
  scheduledDate: string;
  startTime?: string | null;
  location?: string | null;
  notes?: string | null;
};
