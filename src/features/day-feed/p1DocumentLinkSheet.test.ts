import { afterEach, expect, it, vi } from "vitest";
import { advanceAccountGeneration, getAccountGeneration } from "@/data/auth/accountGeneration";
import { readP1DocumentLink, releaseP1DocumentLink, stageP1DocumentLink } from "./p1DocumentLinkSheet";

let invocation: string | undefined;
afterEach(() => releaseP1DocumentLink(invocation));

function open(isCurrent = () => true) {
  const onQueued = vi.fn();
  invocation = stageP1DocumentLink({
    tripId: "trip", itemId: "plan", itemRevision: 2, generation: getAccountGeneration(),
    originKey: "detail", isCurrent, revisionCurrent: () => true, onQueued,
  });
  expect(invocation).toBeDefined();
  return { entry: readP1DocumentLink(invocation)!, onQueued };
}

it("refreshes exactly once after the original Detail returns with a queued link", () => {
  const { entry, onQueued } = open();
  releaseP1DocumentLink("different", true);
  expect(onQueued).not.toHaveBeenCalled();
  entry.queued = true;
  releaseP1DocumentLink(invocation, true);
  releaseP1DocumentLink(invocation, true);
  expect(onQueued).toHaveBeenCalledOnce();
});

it("does not refresh after cancel or Account change", () => {
  const first = open();
  releaseP1DocumentLink(invocation, true);
  expect(first.onQueued).not.toHaveBeenCalled();
  const next = open();
  next.entry.queued = true;
  advanceAccountGeneration();
  releaseP1DocumentLink(invocation, true);
  expect(next.onQueued).not.toHaveBeenCalled();
});
