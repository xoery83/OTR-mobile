import { beforeEach, expect, it, vi } from "vitest";
import { captureAccountScope } from "@/data/auth/accountRequestContext";
import { advanceAccountGeneration } from "@/data/auth/accountGeneration";
import { listCaptureTripPriors } from "./captureTripPrior";
const state = vi.hoisted(() => ({ account: "A", list: vi.fn() }));
vi.mock("@/data/auth/authRepository", () => ({
  requireActiveUserId: async () => state.account,
}));
vi.mock("@/data/repositories/tripRepository", () => ({
  readLocalTripRepository: async () => ({ listTrips: state.list }),
}));
beforeEach(() => {
  state.account = "A";
  state.list.mockReset();
});
it("lists only the current repository's Trip labels without granting association", async () => {
  state.list.mockResolvedValue([
    { id: "1", name: "one", destinations: [{ private: "not returned" }] },
  ]);
  expect(
    await listCaptureTripPriors(await captureAccountScope(async () => state.account)),
  ).toEqual([{ id: "1", name: "one" }]);
});
it("rejects a late list after an account ABA transition", async () => {
  const scope = await captureAccountScope(async () => state.account);
  state.list.mockImplementation(async () => {
    advanceAccountGeneration();
    return [{ id: "1", name: "one" }];
  });
  await expect(listCaptureTripPriors(scope)).rejects.toThrow();
});
