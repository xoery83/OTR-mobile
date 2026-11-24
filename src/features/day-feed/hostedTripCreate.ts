import { router } from "expo-router";
import { createContext } from "react";
import { getAccountGeneration } from "@/data/auth/accountGeneration";

export const hostedTripCreateEnabled: boolean = true;

type CreateInvocation = { id: string; originRouteKey: string; generation: number };
let sequence = 0;
let invocation: CreateInvocation | undefined;

export function openHostedTripCreate(originRouteKey: string, generation: number) {
  if (!hostedTripCreateEnabled || !originRouteKey || generation !== getAccountGeneration())
    return false;
  if (invocation?.generation === generation) return true;
  invocation = { id: String(++sequence), originRouteKey, generation };
  router.push({
    pathname: "/trip-create",
    params: { invocation: invocation.id },
  });
  return true;
}

export function readHostedTripCreate(id: string | undefined) {
  return invocation?.id === id && invocation?.generation === getAccountGeneration()
    ? invocation
    : undefined;
}

export function releaseHostedTripCreate(id: string | undefined) {
  if (invocation?.id === id) invocation = undefined;
}

export const TripCreateSheetContext = createContext<{
  registerClose(guard: () => boolean | Promise<boolean>): () => void;
  recordCreatedTrip(tripId: string, owner: CreateInvocation): void;
} | undefined>(undefined);
