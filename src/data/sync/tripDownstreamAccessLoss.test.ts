import { coreAccessLossSchema } from "@/domain/trip/tripCoreMemberAccess";
import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { ApiClientError } from "../api/client";
import { getAccountGeneration } from "../auth/accountGeneration";
import { refreshCoreDownstream } from "./tripDownstreamCoordinator";
vi.mock("react-native", () => ({ AppState: { currentState: "active" } }));

function fixture(status: number) {
  const context = {
    accountId: randomUUID(),
    tripId: randomUUID(),
    generation: getAccountGeneration(),
  };
  const error = new ApiClientError("READ_DENIED", "http", status);
  const core = {
    acceptedSnapshot: vi.fn(async () => null),
    refresh: vi.fn(async () => {
      throw Error("UNEXPECTED_COLLECTION_APPLY");
    }),
  };
  const transport = {
    collection: vi.fn(async () => {
      throw error;
    }),
  };
  return { context, error, core, transport };
}

it.each([403, 404])(
  "a denied %s read uses the formal self observation before notifying cache change",
  async (status) => {
    const f = fixture(status);
    const loss = vi.fn(async () => ({
      status: "ACCESS_REVOKED" as const,
      observation: coreAccessLossSchema.parse({
        schemaId: "otr.trip.core-access-loss/1",
        accountId: f.context.accountId,
        tripId: f.context.tripId,
        personId: randomUUID(),
        state: "ACCESS_REVOKED",
        coreReference: { epoch: randomUUID(), revision: 2, accessRevision: 2 },
      }),
    }));
    await expect(
      refreshCoreDownstream(f.core, f.context, f.transport, loss),
    ).resolves.toBe(true);
    expect(loss).toHaveBeenCalledExactlyOnceWith(f.context);
    expect(f.core.refresh).not.toHaveBeenCalled();
  },
);

it("an unconfirmed 404 preserves the original read failure, not a successful empty collection", async () => {
  const f = fixture(404);
  const loss = vi.fn(async () => ({ status: "ABSENT_UNCONFIRMED" as const }));
  await expect(refreshCoreDownstream(f.core, f.context, f.transport, loss)).rejects.toBe(
    f.error,
  );
  expect(loss).toHaveBeenCalledExactlyOnceWith(f.context);
  expect(f.core.refresh).not.toHaveBeenCalled();
});

it.each([401, 409, 503, 0])(
  "a %s failure never starts the access-loss observation",
  async (status) => {
    const f = fixture(status);
    const loss = vi.fn(async () => ({ status: "ABSENT_UNCONFIRMED" as const }));
    await expect(
      refreshCoreDownstream(f.core, f.context, f.transport, loss),
    ).rejects.toBe(f.error);
    expect(loss).not.toHaveBeenCalled();
  },
);

it("strict adapter scope or transport failure remains an error and never applies an empty snapshot", async () => {
  const f = fixture(403),
    stale = Error("ACCOUNT_REQUEST_CONTEXT_CHANGED");
  const loss = vi.fn(async () => {
    throw stale;
  });
  await expect(refreshCoreDownstream(f.core, f.context, f.transport, loss)).rejects.toBe(
    stale,
  );
  expect(f.core.refresh).not.toHaveBeenCalled();
});

it("legacy callers without the formal observer retain the original rejection", async () => {
  const f = fixture(403);
  await expect(refreshCoreDownstream(f.core, f.context, f.transport)).rejects.toBe(
    f.error,
  );
  expect(f.core.refresh).not.toHaveBeenCalled();
});

it.each(["network", "timeout"] as const)(
  "a %s failure with stale HTTP metadata does not start the observer",
  async (kind) => {
    const f = fixture(403),
      error = new ApiClientError("TRANSPORT_FAILURE", kind, 403);
    f.transport.collection.mockRejectedValue(error);
    const loss = vi.fn(async () => ({ status: "ABSENT_UNCONFIRMED" as const }));
    await expect(
      refreshCoreDownstream(f.core, f.context, f.transport, loss),
    ).rejects.toBe(error);
    expect(loss).not.toHaveBeenCalled();
  },
);
