import { beforeEach, expect, it, vi } from "vitest";
import { advanceAccountGeneration } from "@/data/auth/accountGeneration";
import { useTripCoverPhoto } from "./useTripCoverPhoto";
const state = vi.hoisted(() => ({
  value: null as any,
  deps: "",
  cleanup: null as null | (() => void),
  repository: vi.fn(),
  published: 0,
}));
vi.mock("react", () => ({
  useSyncExternalStore: (_: any, get: any) => get(),
  useState: () => [
    state.value,
    (v: any) => {
      state.value = v;
      state.published++;
    },
  ],
  useEffect: (effect: any, deps: any[]) => {
    const next = JSON.stringify(deps);
    if (next !== state.deps) {
      state.cleanup?.();
      state.deps = next;
      state.cleanup = effect();
    }
  },
}));
vi.mock("@/data/repositories/tripPhotoRepository", () => ({
  readLocalTripPhotoRepository: () => state.repository(),
}));
const ref = "photo-00000000-0000-4000-8000-000000000001";
const photo = {
  tripId: "a",
  assetId: "00000000-0000-4000-8000-000000000001",
  localUri: "file://retained/a",
};
const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};
beforeEach(() => {
  state.cleanup?.();
  state.value = null;
  state.deps = "";
  state.cleanup = null;
  state.published = 0;
  state.repository.mockReset();
});
it("uses the scoped repository and honestly withholds missing personal files", async () => {
  const read = vi.fn().mockResolvedValue(photo);
  state.repository.mockResolvedValue({ readSelectedTripCoverPhoto: read });
  expect(useTripCoverPhoto("a", ref)).toEqual({ requested: true, photo: null });
  await flush();
  expect(read).toHaveBeenCalledExactlyOnceWith("a", ref);
  expect(useTripCoverPhoto("a", ref).photo).toBe(photo);
  state.repository.mockResolvedValue({
    readSelectedTripCoverPhoto: vi.fn().mockResolvedValue(null),
  });
  expect(useTripCoverPhoto("b", ref).photo).toBeNull();
  await flush();
  expect(useTripCoverPhoto("b", ref)).toEqual({ requested: true, photo: null });
});
it("does not publish a previous Trip completion over the new scoped selection", async () => {
  let finish!: (p: any) => void;
  const read = vi.fn((id: string) =>
    id === "a"
      ? new Promise((r) => {
          finish = r;
        })
      : Promise.resolve({ ...photo, tripId: "b" }),
  );
  state.repository.mockResolvedValue({ readSelectedTripCoverPhoto: read });
  useTripCoverPhoto("a", ref);
  await flush();
  useTripCoverPhoto("b", ref);
  await flush();
  finish(photo);
  await flush();
  expect(useTripCoverPhoto("b", ref).photo?.tripId).toBe("b");
  expect(state.published).toBe(1);
});
it("drops account ABA and unmount completions without publishing private URI", async () => {
  let finish!: (p: any) => void;
  state.repository.mockResolvedValue({
    readSelectedTripCoverPhoto: () =>
      new Promise((r) => {
        finish = r;
      }),
  });
  useTripCoverPhoto("a", ref);
  await flush();
  advanceAccountGeneration();
  advanceAccountGeneration();
  finish(photo);
  await flush();
  expect(state.published).toBe(0);
  useTripCoverPhoto("a", ref);
  await flush();
  state.cleanup?.();
  finish(photo);
  await flush();
  expect(state.published).toBe(0);
});
it("never resolves static or unknown raw references as personal photos", () => {
  expect(useTripCoverPhoto("a", "city").requested).toBe(false);
  expect(useTripCoverPhoto("a", "future-raw").requested).toBe(false);
  expect(state.repository).not.toHaveBeenCalled();
});
