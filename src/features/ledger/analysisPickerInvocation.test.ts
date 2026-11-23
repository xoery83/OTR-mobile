import { expect, it, vi } from "vitest";
import { advanceAccountGeneration } from "@/data/auth/accountGeneration";
import {
  completeAnalysisPicker,
  openAnalysisPicker,
  readAnalysisPicker,
  releaseAnalysisPicker,
  type AnalysisPicker,
} from "./analysisPickerInvocation";

it("returns a choice only to the current Ledger report and Account", () => {
  const choose = vi.fn();
  const owner = vi.fn(() => true);
  const picker: AnalysisPicker = {
    kind: "category",
    options: ["FOOD"],
    selected: null,
    choose,
  };
  const old = openAnalysisPicker(picker, owner, () => true);
  const current = openAnalysisPicker(picker, owner, () => true);

  releaseAnalysisPicker(old);
  expect(readAnalysisPicker(old)).toBeUndefined();
  expect(readAnalysisPicker(current)).toBe(picker);

  owner.mockReturnValue(false);
  expect(readAnalysisPicker(current)).toBeUndefined();
  owner.mockReturnValue(true);
  advanceAccountGeneration();
  expect(readAnalysisPicker(current)).toBeUndefined();
  expect(choose).not.toHaveBeenCalled();
});

it("applies once after dismissal exposes the original report", () => {
  const focused = vi.fn(() => false);
  const apply = vi.fn();
  const picker: AnalysisPicker = { kind: "category", options: [], selected: null, choose: vi.fn() };
  const invocation = openAnalysisPicker(picker, () => true, focused);

  completeAnalysisPicker(invocation, picker, apply);
  expect(apply).not.toHaveBeenCalled();
  focused.mockReturnValue(true);
  completeAnalysisPicker(invocation, picker, apply);
  completeAnalysisPicker(invocation, picker, apply);
  expect(apply).toHaveBeenCalledOnce();
});
