import { expect, it, vi } from "vitest";
import { advanceAccountGeneration } from "@/data/auth/accountGeneration";
import { createTripMembersInvocations, type TripMembersProps } from "./hostedTripMembers";

const entry = (tripId: string): TripMembersProps => ({
  visible: true,
  tripId,
  members: null,
  onClose: vi.fn(),
});

it("reuses the live roster and callbacks only for the issuing trip and account", () => {
  const host = createTripMembersInvocations();
  const listener = vi.fn();
  const unsubscribe = host.subscribe(listener);
  const initial = entry("trip-a");
  const id = host.stage(initial);
  expect(host.read(id)).toBe(initial);
  const updated = { ...initial, onAddTraveler: vi.fn(async () => {}) };
  host.update(id, updated);
  expect(host.read(id)).toBe(updated);
  host.update(id, entry("trip-b"));
  expect(host.read(id)).toBe(updated);
  advanceAccountGeneration();
  expect(host.read(id)).toBeUndefined();
  expect(listener).toHaveBeenCalledTimes(3);
  unsubscribe();
});

it("rejects a missing scope and dispatches close only through the current invocation", () => {
  const host = createTripMembersInvocations();
  expect(host.stage({ ...entry("trip-a"), tripId: undefined })).toBeUndefined();
  const first = host.stage(entry("trip-a"));
  const second = host.stage(entry("trip-b"));
  host.release(first);
  expect(host.read(first)).toBeUndefined();
  expect(host.read(second)?.tripId).toBe("trip-b");
  host.release(second);
  expect(host.read(second)).toBeUndefined();
});
