import { expect, it, vi } from "vitest";
import { advanceAccountGeneration } from "@/data/auth/accountGeneration";
import {
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
  const old = openAnalysisPicker(picker, owner);
  const current = openAnalysisPicker(picker, owner);

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
