import { z } from "zod";

import {
  createDevExpenseTransport,
  createDevItineraryTransport,
} from "./devCreateTransports";
import { createFakeExpenseTransport } from "./fakeExpenseTransport";
import { createFakeItineraryTransport } from "./fakeItineraryTransport";

const transportModeSchema = z.enum(["fake", "dev"]);

export function getSyncTransportMode() {
  return transportModeSchema.parse(process.env.EXPO_PUBLIC_OTR_SYNC_TRANSPORT ?? "fake");
}

export const fakeExpenseTransport = createFakeExpenseTransport();
export const fakeItineraryTransport = createFakeItineraryTransport();

export function getExpenseCreateTransport() {
  return getSyncTransportMode() === "dev"
    ? createDevExpenseTransport()
    : fakeExpenseTransport;
}

export function getItineraryCreateTransport() {
  return getSyncTransportMode() === "dev"
    ? createDevItineraryTransport()
    : fakeItineraryTransport;
}
