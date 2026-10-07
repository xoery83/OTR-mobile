import { afterEach, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createCaptureStaging, emptyCaptureStaging } from "./captureStaging";
import { pickCaptureMaterial } from "@/native/capturePicker";
import {
  advanceAccountGeneration,
  getAccountGeneration,
  subscribeAccountGeneration,
} from "@/data/auth/accountGeneration";
import {
  assertAccountRequestGeneration,
  beginAccountTransition,
  endAccountTransition,
} from "@/data/auth/accountRequestContext";

const native = vi.hoisted(() => ({ files: vi.fn(), photos: vi.fn() }));
vi.mock("expo-document-picker", () => ({ getDocumentAsync: native.files }));
vi.mock("expo-image-picker", () => ({ launchImageLibraryAsync: native.photos }));
afterEach(() => vi.resetAllMocks());
function scope() {
  const context = {
    accountId: "real-account",
    tripId: "",
    generation: getAccountGeneration(),
  };
  return () => {
    try {
      assertAccountRequestGeneration(context);
      return true;
    } catch {
      return false;
    }
  };
}
const file = (name: string, uri = "temporary://file") => ({
  name,
  uri,
  size: 7,
  mimeType: "application/pdf",
});
const photo = {
  fileName: null,
  uri: "temporary://photo",
  width: 800,
  height: 600,
  fileSize: 3,
  mimeType: "image/heic",
};
it("stages ordered multiple Files, then Photos, then repeated Files; removal is session-only", async () => {
  native.files.mockResolvedValue({
    canceled: false,
    assets: [file("one.pdf"), file("中文".repeat(100) + ".pdf")],
  });
  native.photos.mockResolvedValue({ canceled: false, assets: [photo] });
  const staging = createCaptureStaging(pickCaptureMaterial, scope());
  expect(staging.getSnapshot()).toBe(emptyCaptureStaging);
  await staging.pick("files");
  await staging.pick("photos");
  await staging.pick("files");
  const items = staging.getSnapshot().items;
  expect(items.map((item) => item.source)).toEqual([
    "files",
    "files",
    "photos",
    "files",
    "files",
  ]);
  expect(items.map((item) => item.stagingId)).toEqual([1, 2, 3, 4, 5]);
  expect(items[2]).toMatchObject({
    name: null,
    width: 800,
    height: 600,
    size: 3,
    availability: "unverified",
  });
  expect(native.files).toHaveBeenCalledWith({
    multiple: true,
    copyToCacheDirectory: false,
    base64: false,
  });
  expect(native.photos).toHaveBeenCalledWith(
    expect.objectContaining({
      allowsMultipleSelection: true,
      orderedSelection: true,
      base64: false,
      exif: false,
      quality: 1,
    }),
  );
  staging.remove(2);
  expect(staging.getSnapshot().items.map((item) => item.stagingId)).toEqual([1, 3, 4, 5]);
  staging.getSnapshot().items.forEach((item) => staging.remove(item.stagingId));
  expect(staging.getSnapshot().items).toEqual([]);
});
it("both picker cancellations preserve the tray; missing URI is not accepted evidence", async () => {
  native.files
    .mockResolvedValueOnce({ canceled: false, assets: [file("missing.pdf", "")] })
    .mockResolvedValue({ canceled: true, assets: null });
  native.photos.mockResolvedValue({ canceled: true, assets: null });
  const staging = createCaptureStaging(pickCaptureMaterial, scope());
  await staging.pick("files");
  const items = staging.getSnapshot().items;
  await staging.pick("files");
  await staging.pick("photos");
  expect(staging.getSnapshot().items).toEqual(items);
  expect(items[0]).toMatchObject({ temporaryUri: null, availability: "unavailable" });
});
it("serializes rapid taps, suppresses private native errors and permits a fresh retry", async () => {
  let reject!: (error: Error) => void;
  native.files
    .mockImplementationOnce(
      () =>
        new Promise((_, fail) => {
          reject = fail;
        }),
    )
    .mockResolvedValue({ canceled: false, assets: [file("retry.pdf")] });
  const staging = createCaptureStaging(pickCaptureMaterial, scope());
  const pending = staging.pick("files");
  await staging.pick("photos");
  expect(native.photos).not.toHaveBeenCalled();
  reject(new Error("private temporary path"));
  await pending;
  expect(staging.getSnapshot()).toEqual({ items: [], selecting: false, error: "picker" });
  await staging.pick("files");
  expect(staging.getSnapshot().items).toHaveLength(1);
  expect(staging.getSnapshot().error).toBeNull();
});
it("A→B→A generations hide old items and reject old callbacks, including transition-in-progress", async () => {
  native.files.mockResolvedValueOnce({ canceled: false, assets: [file("A.pdf")] });
  let resolve!: (value: unknown) => void;
  native.photos.mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const staging = createCaptureStaging(pickCaptureMaterial, scope());
  await staging.pick("files");
  const pending = staging.pick("photos");
  const observer = vi.fn();
  const unsubscribe = subscribeAccountGeneration(observer);
  const lease = await beginAccountTransition();
  expect(observer).toHaveBeenCalledOnce();
  expect(staging.getSnapshot()).toBe(emptyCaptureStaging);
  endAccountTransition(lease);
  advanceAccountGeneration();
  resolve({ canceled: false, assets: [photo] });
  await pending;
  expect(staging.getSnapshot()).toBe(emptyCaptureStaging);
  unsubscribe();
});
it("cancel and unmount during a picker never resurrect a choice; fresh session starts empty", async () => {
  for (const close of ["cancel", "unmount"] as const) {
    let resolve!: (value: unknown) => void;
    native.files.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const staging = createCaptureStaging(pickCaptureMaterial, scope());
    const unmount = staging.attach();
    const listener = vi.fn();
    staging.subscribe(listener);
    const pending = staging.pick("files");
    if (close === "cancel") staging.cancel();
    else unmount();
    const calls = listener.mock.calls.length;
    resolve({ canceled: false, assets: [file("late.pdf")] });
    await pending;
    expect(staging.getSnapshot()).toBe(emptyCaptureStaging);
    expect(listener).toHaveBeenCalledTimes(calls);
  }
});
it("host context invalidation rejects stale Trip selections without rebinding them", async () => {
  let current = true;
  let resolve!: (value: unknown) => void;
  native.files.mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const staging = createCaptureStaging(pickCaptureMaterial, () => current);
  const pending = staging.pick("files");
  current = false;
  resolve({ canceled: false, assets: [file("old-trip.pdf")] });
  await pending;
  expect(staging.getSnapshot()).toBe(emptyCaptureStaging);
});
it("production staging/acquisition/content have no repository, durable submit, file byte reader or scheduler dependency", () => {
  for (const path of [
    "src/features/capture/captureStaging.ts",
    "src/features/capture/CaptureContent.tsx",
    "src/native/capturePicker.ts",
  ]) {
    const source = readFileSync(path, "utf8");
    expect(source).not.toMatch(
      /from ["'][^"']*(?:repositories|operations|sync|expo-file-system|expo-crypto|expo-sqlite)/,
    );
    expect(source).not.toMatch(/\.intake\(|getForSourceHandoff|createSource|setInterval/);
  }
});
