import { expect, it, vi } from "vitest";
import {
  createTripPrivateSubscription,
  tripPrivateSubscription,
} from "./tripPrivateSubscription";
import { getAccountGeneration } from "../auth/accountGeneration";

it("keeps the normal mount closed without owning admission, with zero Account I/O", () => {
  const account = vi.fn();
  expect(tripPrivateSubscription).toBeUndefined();
  expect(
    createTripPrivateSubscription({ account, accessRevoked: vi.fn() }),
  ).toBeUndefined();
  expect(account).not.toHaveBeenCalled();
});

it("forwards a qualified lease through the existing Auth adapter and closes once", async () => {
  const accountId = "11111111-1111-4111-8111-111111111111",
    tripId = "22222222-2222-4222-8222-222222222222";
  const close = vi.fn(),
    accessRevoked = vi.fn(),
    invalidated = vi.fn();
  const controller = new AbortController();
  const subscribe = createTripPrivateSubscription({
    account: async () => accountId,
    accessRevoked,
    open: async () => ({
      lease: {
        accountId,
        tripId,
        actorPersonId: accountId,
        leaseId: "33333333-3333-4333-8333-333333333333",
        channel: "fixture-only",
        authorizationRevision: 41,
        expiresAt: Date.now() + 60_000,
      },
      close,
    }),
  });
  const cleanup = await subscribe!(
    { accountId, tripId, generation: getAccountGeneration() },
    invalidated,
    vi.fn(),
    controller.signal,
  );
  controller.abort();
  cleanup();
  expect(close).toHaveBeenCalledOnce();
  expect(accessRevoked).not.toHaveBeenCalled();
  expect(invalidated).not.toHaveBeenCalled();
});
