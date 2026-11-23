import { expect, it, vi } from "vitest";
import { advanceAccountGeneration } from "@/data/auth/accountGeneration";
import { readHostedQuickAdd, releaseHostedQuickAdd, releaseStaleHostedQuickAdd, stageHostedQuickAdd, subscribeHostedQuickAdd } from "./quickAddHandoff";

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

it("unmounts a hosted action when its originating shell scope is retired", () => {
  const isCurrentOwner = vi.fn(() => true);
  const current = stageHostedQuickAdd({ ...invocation("trip-a"), isCurrentOwner });
  const listener = vi.fn();
  const detach = subscribeHostedQuickAdd(listener);
  isCurrentOwner.mockReturnValue(false);
  releaseStaleHostedQuickAdd();
  expect(readHostedQuickAdd(current)).toBeUndefined();
  expect(listener).toHaveBeenCalledOnce();
  detach();
});
