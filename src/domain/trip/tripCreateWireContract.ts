import { z } from "zod";
import { tripCreateRequestSchema, tripCreateResultSchema } from "./tripCreateContract";
import {
  structuredTripCreateRequestSchema,
  tripDestinationsSchema,
} from "./tripStructuredDestinationContract";
export const structuredTripCreateResultSchema = tripCreateResultSchema.extend({
  formatVersion: z.literal(2),
  destination: z.null(),
  destinations: tripDestinationsSchema,
  metadataRevision: z.literal(0),
});
export const tripCreateWireRequestSchema = z.union([
  structuredTripCreateRequestSchema,
  tripCreateRequestSchema,
]);
export const tripCreateWireResultSchema = z.union([
  structuredTripCreateResultSchema,
  tripCreateResultSchema,
]);
export type TripCreateWireRequest = z.infer<typeof tripCreateWireRequestSchema>;
export type TripCreateWireResult = z.infer<typeof tripCreateWireResultSchema>;
export const tripCreateWireVersion = (v: TripCreateWireRequest | TripCreateWireResult) =>
  "formatVersion" in v ? 2 : 1;
