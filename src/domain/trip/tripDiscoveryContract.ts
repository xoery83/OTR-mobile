import { z } from "zod";
import { coreUuid } from "./tripCoreV2";

export const tripDiscoverySummarySchema = z.object({
  id: coreUuid,
  name: z.string().min(1),
  destination: z.string().nullable(),
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
  createdAt: z.string().nullable(),
});

export const tripDiscoveryPageSchema = z.object({
  trips: z.array(tripDiscoverySummarySchema).max(25),
  nextCursor: coreUuid.nullable(),
});

export type TripDiscoverySummary = z.infer<typeof tripDiscoverySummarySchema>;
export type TripDiscoveryPage = z.infer<typeof tripDiscoveryPageSchema>;
