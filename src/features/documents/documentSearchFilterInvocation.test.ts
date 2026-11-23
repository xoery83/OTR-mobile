import { expect, it, vi } from "vitest";
import {
  advanceAccountGeneration,
  getAccountGeneration,
} from "@/data/auth/accountGeneration";
import {
  openDocumentSearchFilters,
  readDocumentSearchFilters,
  releaseDocumentSearchFilters,
} from "./documentSearchFilterInvocation";

it("retains the search's current facets and rejects replaced search or Account ownership", () => {
  const apply = vi.fn();
  const isCurrent = vi.fn(() => true);
  const invocation = {
    generation: getAccountGeneration(),
    initial: { storage: "LOCAL" as const },
    isCurrent,
    apply,
  };
  const previous = openDocumentSearchFilters(invocation);
  const current = openDocumentSearchFilters(invocation);

  releaseDocumentSearchFilters(previous);
  expect(readDocumentSearchFilters(previous)).toBeUndefined();
  expect(readDocumentSearchFilters(current)?.initial).toEqual({ storage: "LOCAL" });
  readDocumentSearchFilters(current)?.apply({ visibility: "GROUP" });
  expect(apply).toHaveBeenCalledExactlyOnceWith({ visibility: "GROUP" });

  isCurrent.mockReturnValue(false);
  expect(readDocumentSearchFilters(current)).toBeUndefined();
  isCurrent.mockReturnValue(true);
  advanceAccountGeneration();
  expect(readDocumentSearchFilters(current)).toBeUndefined();
});
