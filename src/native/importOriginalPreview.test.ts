import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex } from "@noble/hashes/utils";
import { previewImportOriginal } from "./importOriginalPreview";
import { advanceAccountGeneration } from "@/data/auth/accountGeneration";
import type { ImportDocument } from "@/data/repositories/importDocumentsRepository";
const bridge = vi.hoisted(() => ({
  previewImportOriginal: vi.fn(),
  closeImportOriginal: vi.fn(async () => {}),
}));
vi.mock("expo", () => ({ requireNativeModule: () => bridge }));
vi.mock("expo-crypto", () => ({ randomUUID: () => "single-preview-token" }));
const bytes = new TextEncoder().encode("%PDF-QA");
const original = {
  bytes,
  document: {
    sha256: bytesToHex(sha256(bytes)),
    byteCount: bytes.length,
  } as ImportDocument,
};
beforeEach(() => {
  vi.stubEnv("EXPO_PUBLIC_OTR_IMPORT_ORIGINAL_PREVIEW_ENABLED", "true");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  vi.useRealTimers();
});
it("rejects changed bytes before entering native preview", async () => {
  await expect(
    previewImportOriginal({ ...original, bytes: new Uint8Array([1]) }, () => true),
  ).rejects.toThrow("IMPORT_ORIGINAL_INTEGRITY");
  expect(bridge.previewImportOriginal).not.toHaveBeenCalled();
});
it("closes the exact preview on account invalidation and releases its subscription", async () => {
  let finish!: () => void;
  bridge.previewImportOriginal.mockImplementationOnce(
    () =>
      new Promise<void>((r) => {
        finish = r;
      }),
  );
  const pending = previewImportOriginal(original, () => true);
  advanceAccountGeneration();
  expect(bridge.closeImportOriginal).toHaveBeenCalledExactlyOnceWith(
    "single-preview-token",
  );
  finish();
  await pending;
  advanceAccountGeneration();
  expect(bridge.closeImportOriginal).toHaveBeenCalledOnce();
});
it("closes when the retained page becomes inactive and leaves retained bytes untouched", async () => {
  vi.useFakeTimers();
  let current = true,
    finish!: () => void;
  bridge.previewImportOriginal.mockImplementationOnce((copy: Uint8Array) => {
    copy[0] = 0;
    return new Promise<void>((r) => {
      finish = r;
    });
  });
  const pending = previewImportOriginal(original, () => current);
  current = false;
  await vi.advanceTimersByTimeAsync(100);
  expect(bridge.closeImportOriginal).toHaveBeenCalledOnce();
  expect(bytes[0]).toBe(37);
  finish();
  await pending;
  expect(vi.getTimerCount()).toBe(0);
});
it("does not open an already invalid page", async () => {
  await previewImportOriginal(original, () => false);
  expect(bridge.previewImportOriginal).not.toHaveBeenCalled();
});

it("keeps unverified native binary preview closed by default", async () => {
  vi.stubEnv("EXPO_PUBLIC_OTR_IMPORT_ORIGINAL_PREVIEW_ENABLED", undefined);
  await expect(previewImportOriginal(original, () => true)).rejects.toThrow(
    "IMPORT_PREVIEW_UNAVAILABLE",
  );
  expect(bridge.previewImportOriginal).not.toHaveBeenCalled();
});

it("a failed QA logger neither blocks the native preview nor replaces a missing bridge error", async () => {
  const info = vi.spyOn(console, "info").mockImplementation(() => {
    throw Error("LOG_SINK_FAILED");
  });
  const preview = bridge.previewImportOriginal;
  try {
    preview.mockResolvedValueOnce(undefined);
    await expect(previewImportOriginal(original, () => true)).resolves.toBeUndefined();
    expect(preview).toHaveBeenCalledOnce();
    Reflect.set(bridge, "previewImportOriginal", undefined);
    await expect(previewImportOriginal(original, () => true)).rejects.toThrow(
      "IMPORT_PREVIEW_UNAVAILABLE",
    );
  } finally {
    Reflect.set(bridge, "previewImportOriginal", preview);
    info.mockRestore();
  }
});
