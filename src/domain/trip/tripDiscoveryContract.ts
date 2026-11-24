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

const tripDiscoveryListedStateSchema = z.enum(["ACTIVE", "ARCHIVED"]);

export const tripDiscoveryLifecycleSchema = z.enum(["ACTIVE", "ARCHIVED", "ALL"]);
export const tripDiscoveryLifecyclePageSchema = tripDiscoveryPageSchema.extend({
  trips: z
    .array(tripDiscoverySummarySchema.extend({
      lifecycleState: tripDiscoveryListedStateSchema,
      metadataRevision: z.number().int().nonnegative().safe(),
    }))
    .max(25),
});

export type TripDiscoverySummary = z.infer<typeof tripDiscoverySummarySchema>;
export type TripDiscoveryPage = z.infer<typeof tripDiscoveryPageSchema>;
export type TripDiscoveryLifecycle = z.infer<typeof tripDiscoveryLifecycleSchema>;
