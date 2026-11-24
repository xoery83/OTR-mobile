import { afterEach, expect, it, vi } from "vitest";
import { advanceAccountGeneration, getAccountGeneration } from "@/data/auth/accountGeneration";
import {
  readDayMoveSheet, releaseDayMoveSheet, stageDayMoveSheet, updateDayMoveSheet,
} from "./dayMoveConfirmationSheet";

let invocation: string | undefined;
afterEach(() => releaseDayMoveSheet(invocation));

function stage(originFocused = () => true, originCurrent = () => true) {
  const confirmation = {
    proposalIdentity: {},
    body: null,
    titleKey: "fidelity.moveTitle" as const,
    disabled: false,
    isBusy: () => false,
    isCurrent: () => true,
    apply: vi.fn(async () => true),
    dismiss: vi.fn(),
  };
  invocation = stageDayMoveSheet({
    generation: getAccountGeneration(), originKey: "day", originFocused, originCurrent, confirmation,
  });
  expect(invocation).toBeDefined();
  return confirmation;
}

it("dismisses the exact move once only after returning to its owner", () => {
  let focused = false;
  const confirmation = stage(() => focused);
  releaseDayMoveSheet("unrelated", true);
  expect(confirmation.dismiss).not.toHaveBeenCalled();
  focused = true;
  releaseDayMoveSheet(invocation, true);
  releaseDayMoveSheet(invocation, true);
  expect(confirmation.dismiss).toHaveBeenCalledOnce();
  expect(confirmation.apply).not.toHaveBeenCalled();
});

it("retires a replaced proposal and drops an old Account without dismissing it", () => {
  const confirmation = stage();
  updateDayMoveSheet(invocation!, { ...confirmation, proposalIdentity: {} });
  expect(readDayMoveSheet(invocation)?.retired).toBe(true);
  advanceAccountGeneration();
  expect(readDayMoveSheet(invocation)).toBeUndefined();
  releaseDayMoveSheet(invocation, true);
  expect(confirmation.dismiss).not.toHaveBeenCalled();
});

it("does not cancel a proposal after the same native route has left Day mode", () => {
  let dayIsCurrent = true;
  const confirmation = stage(() => true, () => dayIsCurrent);
  dayIsCurrent = false;
  releaseDayMoveSheet(invocation, true);
  expect(confirmation.dismiss).not.toHaveBeenCalled();
});
