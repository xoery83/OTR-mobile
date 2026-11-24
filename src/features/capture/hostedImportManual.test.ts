import { expect, it, vi } from "vitest";
import { readImportManualFallback, releaseImportManualFallback, stageImportManualFallback } from "./hostedImportManual";

const account = vi.hoisted(() => ({ generation: 1, onChange: () => {} }));
vi.mock("@/data/auth/accountGeneration", () => ({
  getAccountGeneration: () => account.generation,
  subscribeAccountGeneration: (onChange: () => void) => { account.onChange = onChange; },
}));

it("uses one invocation for repeated taps and retires it when the original Batch or account changes", () => {
  let current = true;
  const owner = { generation: 1, sourceKey: "batch", tripId: "trip-a", isBatchCurrent: () => current };
  const id = stageImportManualFallback(owner);
  expect(stageImportManualFallback(owner)).toBe(id);
  expect(stageImportManualFallback({ ...owner, sourceKey: "other-batch" })).toBeUndefined();
  expect(readImportManualFallback(id)).toBe(owner);

  current = false;
  expect(readImportManualFallback(id)).toBeUndefined();
  const replacement = { ...owner, isBatchCurrent: () => true, tripId: "trip-b" };
  const next = stageImportManualFallback(replacement);
  expect(next).not.toBe(id);
  releaseImportManualFallback(id);
  expect(readImportManualFallback(next)).toBe(replacement);
  account.generation += 1;
  account.onChange();
  expect(readImportManualFallback(next)).toBeUndefined();
});
