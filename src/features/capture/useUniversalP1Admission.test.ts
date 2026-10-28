import { beforeEach, expect, it, vi } from "vitest";
import type { CaptureJobReadModel } from "@/domain/capture/captureSubmission";
import type { UniversalImportResult } from "@/data/api/universalImportContracts";
import { useUniversalP1Admission } from "./useUniversalP1Admission";
const hooks = vi.hoisted(() => ({
  slots: [] as unknown[],
  cursor: 0,
  layout: [] as (() => void)[],
  effects: [] as (() => void)[],
  transport: vi.fn(),
  accepted: vi.fn(),
}));
vi.mock("react", () => ({
  useRef(initial: unknown) {
    const i = hooks.cursor++;
    if (!(i in hooks.slots)) hooks.slots[i] = { current: initial };
    return hooks.slots[i];
  },
  useState: (initial: unknown) => [initial, vi.fn()],
  useEffect: (effect: () => void) => hooks.effects.push(effect),
  useLayoutEffect: (effect: () => void) => hooks.layout.push(effect),
}));
vi.mock("@/data/auth/accountGeneration", () => ({ getAccountGeneration: () => 1 }));
function Harness(batchId: string, current = () => true, result?: UniversalImportResult) {
  hooks.cursor = 0;
  hooks.layout = [];
  const actions = useUniversalP1Admission(
    { batch: { accountId: "qa", batchId } } as CaptureJobReadModel,
    current,
    result,
  );
  hooks.layout.forEach((effect) => effect());
  return actions;
}
beforeEach(() => {
  hooks.slots = [];
  hooks.effects = [];
  hooks.transport.mockReset();
  hooks.accepted.mockReset();
  vi.stubEnv("EXPO_PUBLIC_OTR_UNIVERSAL_P6_ADMISSION_ENABLED", "false");
  vi.stubEnv("EXPO_PUBLIC_OTR_UNIVERSAL_P4_ADMISSION_ENABLED", "false");
  vi.stubEnv("EXPO_PUBLIC_OTR_UNIVERSAL_P5_ADMISSION_ENABLED", "false");
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

it("requires its own default-closed Rental opt-in", async () => {
  const p1 = Harness("batch-a");
  expect(p1.enabledFamilies).not.toContain("P4");
  await expect(
    p1.readOriginal(
      { candidates: [{ token: "rental", kind: "P4" }] } as UniversalImportResult,
      "rental",
    ),
  ).rejects.toThrow("OWNING_REVIEW_REQUIRED");
  vi.stubEnv("EXPO_PUBLIC_OTR_UNIVERSAL_P1_ADMISSION_ENABLED", "false");
  vi.stubEnv("EXPO_PUBLIC_OTR_UNIVERSAL_P3_ADMISSION_ENABLED", "false");
  vi.stubEnv("EXPO_PUBLIC_OTR_UNIVERSAL_P4_ADMISSION_ENABLED", "true");
  expect(Harness("batch-a").enabledFamilies).toEqual(["P4"]);
});

it("keeps P5 closed until its own explicit opt-in", () => {
  vi.stubEnv("EXPO_PUBLIC_OTR_UNIVERSAL_P1_ADMISSION_ENABLED", "false");
  expect(Harness("batch-a").enabledFamilies).not.toContain("P5");
  vi.stubEnv("EXPO_PUBLIC_OTR_UNIVERSAL_P5_ADMISSION_ENABLED", "true");
  expect(Harness("batch-a").enabledFamilies).toEqual(["P5"]);
});

it("keeps P6 closed until its own opt-in", () => {
  vi.stubEnv("EXPO_PUBLIC_OTR_UNIVERSAL_P1_ADMISSION_ENABLED", "false");
  vi.stubEnv("EXPO_PUBLIC_OTR_UNIVERSAL_P3_ADMISSION_ENABLED", "false");
  expect(Harness("batch-a").enabledFamilies).toEqual([]);
  vi.stubEnv("EXPO_PUBLIC_OTR_UNIVERSAL_P6_ADMISSION_ENABLED", "true");
  expect(Harness("batch-a").enabledFamilies).toEqual(["P6"]);
});

vi.mock("@/data/auth/authRepository", () => ({ requireAdoptedUserId: async () => "qa" }));
vi.mock("@/data/repositories/tripCoreSha256", () => ({ tripCoreSha256Hex: vi.fn() }));
vi.mock("@/data/api/tripCoreV2Transport", () => ({
  createCoreV2Transport: hooks.transport,
}));
vi.mock("@/data/operations/universalP1AdmissionConsumer", () => ({
  readUniversalAcceptedItems: hooks.accepted,
}));
it("receipt-only cold recovery keeps the same Core request budget as explicit confirmation", async () => {
  const transport = { receipt: vi.fn() };
  hooks.transport.mockReturnValue(transport);
  hooks.accepted.mockResolvedValue({});
  Harness("batch-a", () => true, {} as UniversalImportResult);
  hooks.effects.forEach((effect) => effect());
  await vi.waitFor(() => expect(hooks.accepted).toHaveBeenCalledOnce());
  expect(hooks.transport).toHaveBeenCalledWith(
    expect.any(Function),
    expect.any(Function),
    { timeoutMs: 60000 },
  );
  expect(hooks.accepted).toHaveBeenCalledWith(
    expect.any(Object),
    expect.any(Object),
    expect.objectContaining({ transport }),
  );
});
