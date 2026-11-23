import { expect, it, vi } from "vitest";
import { advanceAccountGeneration } from "@/data/auth/accountGeneration";
import { readStartTrip, releaseStartTrip, stageStartTrip } from "./startTripHandoff";

it("stages one start chooser without selecting anything and drops it after account change", () => {
  const create = vi.fn();
  const invocation = stageStartTrip(create);
  expect(readStartTrip(invocation)?.create).toBe(create);
  expect(stageStartTrip(vi.fn())).toBeUndefined();
  expect(create).not.toHaveBeenCalled();
  advanceAccountGeneration();
  expect(readStartTrip(invocation)).toBeUndefined();
  const next = stageStartTrip(vi.fn());
  releaseStartTrip(invocation);
  expect(readStartTrip(next)).toBeDefined();
  releaseStartTrip(next);
});
