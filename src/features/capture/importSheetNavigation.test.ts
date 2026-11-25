import { expect, it, vi } from "vitest";
import { ownsImportSheetOrigin, popImportSheetPage, pushImportHistoryFromActivity } from "./importSheetNavigation";

it("pushes recent history above its own list without replacing the existing composer", () => {
  const origin = { key: "start-trip-composer" };
  const unrelated = { key: "unrelated" };
  const state = { key: "import-stack", index: 1, routes: [unrelated, origin] };
  const dispatch = vi.fn();
  let focused = false;
  const navigation = {
    dispatch, isFocused: () => focused, getState: () => state,
  } as unknown as Parameters<typeof pushImportHistoryFromActivity>[0];
  const params = { jobId: "original-job", tripId: "original-trip", originGeneration: "4" };

  pushImportHistoryFromActivity(navigation, origin.key, params);
  focused = true;
  pushImportHistoryFromActivity(navigation, unrelated.key, params);
  expect(dispatch).not.toHaveBeenCalled();

  pushImportHistoryFromActivity(navigation, origin.key, params);
  expect(dispatch).toHaveBeenCalledExactlyOnceWith({
    type: "PUSH",
    target: state.key,
    source: origin.key,
    payload: { name: "composer", params: { ...params, originKey: origin.key } },
  });
});

it("pops only a focused Import child immediately above its own Batch", () => {
  const batch = { key: "batch" };
  const updates = { key: "updates" };
  const other = { key: "other" };
  let focused = true;
  let state = { key: "import-stack", index: 1, routes: [batch, updates] };
  const dispatch = vi.fn(() => {
    state = { ...state, index: 0, routes: [batch] };
  });
  const navigation = {
    dispatch, isFocused: () => focused, getState: () => state,
  } as unknown as Parameters<typeof popImportSheetPage>[0];

  expect(ownsImportSheetOrigin(navigation, updates.key, batch.key)).toBe(true);
  popImportSheetPage(navigation, updates.key, other.key);
  focused = false;
  popImportSheetPage(navigation, updates.key, batch.key);
  expect(dispatch).not.toHaveBeenCalled();

  focused = true;
  popImportSheetPage(navigation, updates.key, batch.key);
  popImportSheetPage(navigation, updates.key, batch.key);
  expect(dispatch).toHaveBeenCalledExactlyOnceWith({
    type: "GO_BACK", target: "import-stack", source: updates.key,
  });
});
