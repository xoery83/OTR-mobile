import { getSyncTransportMode } from "../operations/transportMode";
export { getSyncTransportMode } from "../operations/transportMode";

import {
  createDevExpenseTransport,
  createDevItineraryTransport,
} from "./devCreateTransports";
import { createFakeExpenseTransport } from "./fakeExpenseTransport";
import { createFakeItineraryTransport } from "./fakeItineraryTransport";

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
