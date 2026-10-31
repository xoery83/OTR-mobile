import { z } from "zod";
import { tripDiscoverySummarySchema } from "../src/domain/trip/tripDiscoveryContract";

export const uuid = z.uuid();
export const date = z.iso.date();
export const listTripsInput = z.strictObject({
  cursor: uuid.optional(),
  limit: z.number().int().min(1).max(25).default(20),
});
export const tripInput = z.strictObject({ trip_id: uuid });
export const itemInput = tripInput.extend({ item_id: uuid });
export const listItemsInput = tripInput
  .extend({
    date_from: date.optional(),
    date_to: date.optional(),
    cursor: z.string().min(1).max(2048).optional(),
    limit: z.number().int().min(1).max(25).default(20),
  })
  .refine((q) => !q.date_to || (!!q.date_from && q.date_from <= q.date_to), {
    message: "date_to requires date_from and must not precede it",
  });
const boundary = z.object({
  comparable: z.boolean(),
  localDate: date.optional(),
  localTime: z.string().optional(),
  precision: z.number().optional(),
  quality: z.string().optional(),
  basis: z.string().optional(),
  zoneId: z.string().optional(),
  instant: z.string().optional(),
  civilResolution: z.string().optional(),
});
const place = z.object({
  qualification: z.enum(["TEXT_ONLY", "QUALIFIED"]),
  authoredLabel: z.string().optional(),
  authoredText: z.string().optional(),
  authoredAddress: z.string().optional(),
  acceptedAddress: z.string().optional(),
  authoredAddressLocality: z.string().optional(),
  authoredAddressRegion: z.string().optional(),
  authoredAddressCountry: z.string().optional(),
  acceptedAddressLocality: z.string().optional(),
  acceptedAddressRegion: z.string().optional(),
  acceptedAddressCountry: z.string().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
});
const service = z.object({
  serviceKey: z.string().optional(),
  transportSubtype: z.string().optional(),
  attribution: z.string().optional(),
  operatorNamespace: z.string().optional(),
  operatorIssuer: z.string().optional(),
  operatorValue: z.string().optional(),
  operatorLiteral: z.string().optional(),
  serviceNumber: z.string().optional(),
  serviceLiteral: z.string().optional(),
  codeshareOperatingKey: z.string().optional(),
});
const endpoint = z.object({
  role: z.string(),
  time: boundary,
  place: place.optional(),
  airportCode: z.string().optional(),
  terminal: z.string().optional(),
  platform: z.string().optional(),
  pier: z.string().optional(),
});
const schedule = z.object({
  shape: z.string(),
  start: boundary.optional(),
  end: boundary.optional(),
  origin: endpoint.optional(),
  destination: endpoint.optional(),
});
const common = {
  itemId: uuid,
  tripId: uuid,
  itemRevision: z.number().int().positive(),
  title: z.string(),
  description: z.string().nullable().optional(),
  status: z.string(),
  hidden: z.boolean(),
  visibility: z.string(),
  localState: z.literal("ACCEPTED"),
  schedule,
  place: place.optional(),
};
export const itemSchema = z.discriminatedUnion("family", [
  z.object({
    ...common,
    family: z.literal("P1"),
    details: z.object({ category: z.string().optional() }),
  }),
  z.object({
    ...common,
    family: z.literal("P2"),
    details: z.object({
      qualification: z.enum(["SPARSE", "QUALIFIED"]),
      flightNumberLiteral: z.string(),
      services: z.array(service),
    }),
  }),
  z.object({
    ...common,
    family: z.literal("P3"),
    details: z.object({
      propertyName: z.string().optional(),
      permittedCheckinFrom: z.string().optional(),
      permittedCheckinUntil: z.string().optional(),
      permittedCheckoutBy: z.string().optional(),
      nights: z.number(),
      rooms: z.array(
        z.object({
          roomId: z.string().optional(),
          category: z.string().optional(),
          quantity: z.number().optional(),
          capacity: z.number().optional(),
        }),
      ),
    }),
  }),
  z.object({
    ...common,
    family: z.literal("P4"),
    details: z.object({
      supplier: z.string().optional(),
      reservedCategory: z.string().optional(),
      orSimilar: z.boolean().optional(),
      actualVehicleModel: z.string().optional(),
      verifiedPlate: z.string().optional(),
      pickupPlace: place.optional(),
      returnPlace: place.optional(),
    }),
  }),
  z.object({
    ...common,
    family: z.literal("P5"),
    details: z.object({
      service: service.optional(),
      operationalFacts: z.array(
        z.object({ role: z.string(), time: boundary, place: place.optional() }),
      ),
    }),
  }),
  z.object({
    ...common,
    family: z.literal("P6"),
    details: z.object({
      sessionLabel: z.string().optional(),
      admissionNote: z.string().optional(),
      entryPlace: place.optional(),
    }),
  }),
]);
const envelope = {
  version: z.literal("otr.mcp.read/1"),
  state: z.literal("SERVER_CONFIRMED"),
};
export const tripsOutput = z.object({
  ...envelope,
  trips: z.array(tripDiscoverySummarySchema).max(25),
  next_cursor: uuid.nullable(),
});
export const tripOutput = z.object({ ...envelope, trip: tripDiscoverySummarySchema });
export const itemSummarySchema = z
  .object({
    view: z.literal("SUMMARY"),
    itemId: uuid,
    tripId: uuid,
    itemRevision: z.number().int().positive(),
    family: z.enum(["P1", "P2", "P3", "P4", "P5", "P6"]),
    title: z.string(),
    localDates: z.array(date),
    status: z.string(),
    hidden: z.boolean(),
    temporalShape: z.string(),
    flight: z
      .object({
        qualification: z.enum(["SPARSE", "QUALIFIED"]),
        flightNumberLiteral: z.string(),
      })
      .optional(),
    transportServices: z.array(service).optional(),
    detail: z.object({ tool: z.literal("get_trip_item"), arguments: itemInput }),
  })
  .refine((v) => v.family !== "P2" || !!v.flight)
  .refine((v) => v.family !== "P5" || !!v.transportServices?.length);
export const itemsOutput = z.object({
  ...envelope,
  items: z.array(itemSummarySchema).max(25),
  next_cursor: z.string().nullable(),
  snapshot: z.string(),
});
export const itemOutput = z.object({ ...envelope, item: itemSchema });
export const envelopeValue = {
  version: "otr.mcp.read/1",
  state: "SERVER_CONFIRMED",
} as const;
