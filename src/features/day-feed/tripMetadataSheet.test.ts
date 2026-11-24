import { createElement } from "react";
import { expect, it, vi } from "vitest";
import {
  interceptTripMetadataClose,
  openTripMetadataSheet,
  readTripMetadataCurrency,
  readTripMetadataSheet,
  releaseTripMetadataCurrency,
  releaseTripMetadataSheet,
  stageTripMetadataCurrency,
  updateTripMetadataSheet,
} from "./tripMetadataSheet";

const account = vi.hoisted(() => ({ generation: 1, changed: () => {} }));
vi.mock("@/data/auth/accountGeneration", () => ({
  getAccountGeneration: () => account.generation,
  subscribeAccountGeneration: (changed: () => void) => {
    account.changed = changed;
  },
}));

it("asks the exact owner to close and retires the editor before the exit animation", () => {
  const editor = createElement(() => null);
  const requestClose = vi.fn();
  const id = openTripMetadataSheet(account.generation, { editor, requestClose });
  expect(id).toBeDefined();
  expect(interceptTripMetadataClose("stale")).toBe(false);
  expect(requestClose).not.toHaveBeenCalled();
  expect(interceptTripMetadataClose(id)).toBe(true);
  expect(requestClose).toHaveBeenCalledOnce();
  expect(readTripMetadataSheet(id)?.open).toBe(true);

  updateTripMetadataSheet(id, { editor: null, requestClose });
  expect(readTripMetadataSheet(id)).toMatchObject({ editor: null, open: false });
  expect(interceptTripMetadataClose(id)).toBe(false);
  releaseTripMetadataSheet(id);
  expect(readTripMetadataSheet(id)).toBeUndefined();
});

it("clears the editor and exit callback when the account changes", () => {
  const editor = createElement(() => null);
  const requestClose = vi.fn();
  const id = openTripMetadataSheet(account.generation, { editor, requestClose });
  account.generation += 1;
  account.changed();
  expect(readTripMetadataSheet(id)).toBeUndefined();
  expect(interceptTripMetadataClose(id)).toBe(false);
  expect(requestClose).not.toHaveBeenCalled();
});

it("keeps currency work and close readback bound to the exact metadata owner", () => {
  const requestClose = vi.fn();
  const onClose = vi.fn();
  const id = openTripMetadataSheet(account.generation, { editor: createElement(() => null), requestClose })!;
  const selection = stageTripMetadataCurrency(id, "trip", "editor", onClose)!;
  expect(stageTripMetadataCurrency(id, "other-trip", "editor", onClose)).toBeUndefined();
  expect(readTripMetadataCurrency("other-editor", selection)).toBeUndefined();
  const entry = readTripMetadataCurrency(id, selection)!;
  expect(entry).toMatchObject({ tripId: "trip", editorKey: "editor" });
  entry.working = true;
  expect(interceptTripMetadataClose(id)).toBe(true);
  expect(requestClose).not.toHaveBeenCalled();
  releaseTripMetadataCurrency("other-editor", selection);
  expect(onClose).not.toHaveBeenCalled();
  entry.working = false;
  releaseTripMetadataCurrency(id, selection);
  releaseTripMetadataCurrency(id, selection);
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(interceptTripMetadataClose(id)).toBe(true);
  expect(requestClose).toHaveBeenCalledTimes(1);
  releaseTripMetadataSheet(id);
});
