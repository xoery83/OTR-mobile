import type { ItineraryCreateTransport } from "./itinerarySyncWorker";

export type FakeItineraryTransport = ItineraryCreateTransport & {
  failNextCreate(): void;
};

export function createFakeItineraryTransport(): FakeItineraryTransport {
  let shouldFailNextCreate = false;

  return {
    failNextCreate() {
      shouldFailNextCreate = true;
    },

    async createItineraryItem({ item }) {
      if (shouldFailNextCreate) {
        shouldFailNextCreate = false;
        throw new Error("Phase 2B fake itinerary transport failure.");
      }

      return { serverId: `fake_server_${item.id}`, version: 1 };
    },
  };
}
