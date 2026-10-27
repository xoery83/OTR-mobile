import { beforeEach, expect, it, vi } from "vitest";
import type { CaptureJobReadModel } from "@/domain/capture/captureSubmission";
import type { UniversalImportResult } from "@/data/api/universalImportContracts";
import { useUniversalP1Admission } from "./useUniversalP1Admission";
const hooks = vi.hoisted(() => ({
  slots: [] as unknown[],
  cursor: 0,
  layout: [] as (() => void)[],
}));
vi.mock("react", () => ({
  useRef(initial: unknown) {
    const i = hooks.cursor++;
    if (!(i in hooks.slots)) hooks.slots[i] = { current: initial };
    return hooks.slots[i];
  },
  useState: (initial: unknown) => [initial, vi.fn()],
  useEffect: () => {},
  useLayoutEffect: (effect: () => void) => hooks.layout.push(effect),
}));
vi.mock("@/data/auth/accountGeneration", () => ({ getAccountGeneration: () => 1 }));
function Harness(batchId: string, current = () => true) {
  hooks.cursor = 0;
  hooks.layout = [];
  const actions = useUniversalP1Admission(
    { batch: { accountId: "qa", batchId } } as CaptureJobReadModel,
    current,
  );
  hooks.layout.forEach((effect) => effect());
  return actions;
}
beforeEach(() => {
  hooks.slots = [];
  vi.stubEnv("EXPO_PUBLIC_OTR_UNIVERSAL_P2_ADMISSION_ENABLED", "false");
  vi.stubEnv("EXPO_PUBLIC_OTR_UNIVERSAL_P1_ADMISSION_ENABLED", "true");
});
it("rejects retained actions after the committed Batch scope changes", async () => {
  const retained = Harness("batch-a");
  Harness("batch-b");
  await expect(retained.readOriginal({} as UniversalImportResult, "i1")).rejects.toThrow(
    "OWNING_REVIEW_REQUIRED",
  );
});
it("rejects retained actions after the current view is invalidated", async () => {
  const retained = Harness("batch-a");
  Harness("batch-a", () => false);
  await expect(retained.readOriginal({} as UniversalImportResult, "i1")).rejects.toThrow(
    "OWNING_REVIEW_REQUIRED",
  );
});
it("keeps P3 disabled under the P1 opt-in and requires its own opt-in", async () => {
  vi.stubEnv("EXPO_PUBLIC_OTR_UNIVERSAL_P3_ADMISSION_ENABLED", "false");
  const p1 = Harness("batch-a");
  expect(p1.enabledFamilies).toEqual(["P1"]);
  await expect(
    p1.readOriginal(
      { candidates: [{ token: "stay", kind: "P3" }] } as UniversalImportResult,
      "stay",
    ),
  ).rejects.toThrow("OWNING_REVIEW_REQUIRED");
  vi.stubEnv("EXPO_PUBLIC_OTR_UNIVERSAL_P1_ADMISSION_ENABLED", "false");
  vi.stubEnv("EXPO_PUBLIC_OTR_UNIVERSAL_P3_ADMISSION_ENABLED", "true");
  expect(Harness("batch-a").enabledFamilies).toEqual(["P3"]);
});

it("requires a separate default-closed P2 opt-in", () => {
  vi.stubEnv("EXPO_PUBLIC_OTR_UNIVERSAL_P1_ADMISSION_ENABLED", "false");
  vi.stubEnv("EXPO_PUBLIC_OTR_UNIVERSAL_P3_ADMISSION_ENABLED", "false");
  expect(Harness("batch-a").enabledFamilies).toEqual([]);
  vi.stubEnv("EXPO_PUBLIC_OTR_UNIVERSAL_P2_ADMISSION_ENABLED", "true");
  expect(Harness("batch-a").enabledFamilies).toEqual(["P2"]);
});
