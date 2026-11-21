import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { createNativeDirectedInvitePorts } from "./nativeDirectedInvitePorts";
const f = vi.hoisted(() => ({ createPersonContext: vi.fn() }));
vi.mock("../sync/tripDownstreamCoordinator", () => ({
  refreshDirectedClaimPeople: vi.fn(),
}));
vi.mock("../auth/authRepository", () => ({ requireAdoptedUserId: vi.fn() }));
vi.mock("../repositories/claimResolutionRepository", () => ({
  createClaimResolutionRepository: () => ({ createPersonContext: f.createPersonContext }),
}));
it("prepares only after exact current request/revision provenance and does not borrow Owner identity", async () => {
  const context = { accountId: randomUUID(), tripId: randomUUID(), generation: 1 },
    requestId = randomUUID(),
    parent = randomUUID();
  f.createPersonContext.mockResolvedValue({
    version: 1,
    actorAccountId: context.accountId,
    tripId: context.tripId,
    requestId,
    requestRevision: 4,
    tripCreateOperationId: parent,
  });
  const storage = {
    getItem: vi.fn(async () => null),
    setItem: vi.fn(),
    deleteItem: vi.fn(),
  };
  const ports = createNativeDirectedInvitePorts(storage);
  const intent = await ports.prepareNewResolutionPerson(
    context,
    "Traveler 李",
    requestId,
    4,
  );
  expect(f.createPersonContext).toHaveBeenCalledWith(context, requestId);
  expect(intent).toMatchObject({
    tripId: context.tripId,
    tripCreateOperationId: parent,
    displayName: "Traveler 李",
  });
  expect(intent).not.toHaveProperty("actorAccountId");
  expect(storage.setItem).not.toHaveBeenCalled();
  expect(storage.deleteItem).not.toHaveBeenCalled();
  await expect(
    ports.prepareNewResolutionPerson(context, "Traveler 李", requestId, 3),
  ).rejects.toThrow("CONTEXT_CHANGED");
});
