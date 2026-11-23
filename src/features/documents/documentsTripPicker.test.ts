import { expect, it, vi } from "vitest";
import { advanceAccountGeneration, getAccountGeneration } from "@/data/auth/accountGeneration";
import { openDocumentsTripPicker, readDocumentsTripPicker, releaseDocumentsTripPicker } from "./documentsTripPicker";

it("isolates the choice by invocation, owning Documents route and Account generation", () => {
  const picker = {
    accountId: "qa-account",
    generation: getAccountGeneration(),
    isCurrent: vi.fn(() => true),
    select: vi.fn(),
  };
  const previous = openDocumentsTripPicker(picker);
  const current = openDocumentsTripPicker(picker);
  releaseDocumentsTripPicker(previous);
  expect(readDocumentsTripPicker(previous)).toBeUndefined();
  expect(readDocumentsTripPicker(current)).toBe(picker);
  picker.isCurrent.mockReturnValue(false);
  expect(readDocumentsTripPicker(current)).toBeUndefined();
  picker.isCurrent.mockReturnValue(true);
  advanceAccountGeneration();
  expect(readDocumentsTripPicker(current)).toBeUndefined();
  expect(picker.select).not.toHaveBeenCalled();
});
