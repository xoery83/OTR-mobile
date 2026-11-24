import { expect, it, vi } from "vitest";
import { ownsImportSheetOrigin, popImportSheetPage } from "./importSheetNavigation";

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
