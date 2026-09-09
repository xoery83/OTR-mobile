import type { Trip } from "@/domain/trip/types";

export type TripRepository = {
  listTrips(): Promise<Trip[]>;
  getTrip(id: string): Promise<Trip | null>;
};

export function createTripRepository(): TripRepository {
  return {
    async listTrips() {
      return [];
    },
    async getTrip() {
      return null;
    },
  };
}
