import { expect, it, vi } from "vitest";
import { advanceAccountGeneration } from "@/data/auth/accountGeneration";
import { readHostedQuickAdd, releaseHostedQuickAdd, stageHostedQuickAdd } from "./quickAddHandoff";

const invocation = (tripId: string) => ({
  tripId,
  showDate: true,
  date: "2026-11-23",
  expense: vi.fn(),
  triggerStyle: undefined,
});

it("binds origin callbacks to the latest invocation and account generation", () => {
  const first = stageHostedQuickAdd(invocation("trip-a"));
  const secondProps = invocation("trip-b");
  const second = stageHostedQuickAdd(secondProps);
  releaseHostedQuickAdd(first);
  expect(readHostedQuickAdd(first)).toBeUndefined();
  expect(readHostedQuickAdd(second)).toBe(secondProps);
  advanceAccountGeneration();
  expect(readHostedQuickAdd(second)).toBeUndefined();
});
