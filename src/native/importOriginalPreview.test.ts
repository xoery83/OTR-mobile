import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex } from "@noble/hashes/utils";
import {
  previewImportOriginal,
  isImportOriginalPreviewAvailable,
} from "./importOriginalPreview";
import { advanceAccountGeneration } from "@/data/auth/accountGeneration";
import type { ImportDocument } from "@/data/repositories/importDocumentsRepository";
const bridge = vi.hoisted(() => ({
  importOriginalPreviewContractVersion: undefined as number | undefined,
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
  bridge.importOriginalPreviewContractVersion = undefined;
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

it("passes the document display name separately from the opaque private file token", async () => {
  bridge.previewImportOriginal.mockResolvedValueOnce(undefined);
  await previewImportOriginal(original, () => true, "synthetic-roundtrip.pdf");
  expect(bridge.previewImportOriginal).toHaveBeenCalledWith(
    expect.any(Uint8Array),
    "single-preview-token",
    "synthetic-roundtrip.pdf",
  );
});

it("opens the versioned three-argument bridge without a QA feature flag", async () => {
  vi.stubEnv("EXPO_PUBLIC_OTR_IMPORT_ORIGINAL_PREVIEW_ENABLED", undefined);
  bridge.importOriginalPreviewContractVersion = 2;
  bridge.previewImportOriginal.mockResolvedValueOnce(undefined);
  await expect(
    previewImportOriginal(original, () => true, "retained.pdf"),
  ).resolves.toBeUndefined();
  expect(bridge.previewImportOriginal).toHaveBeenCalledExactlyOnceWith(
    expect.any(Uint8Array),
    "single-preview-token",
    "retained.pdf",
  );
});
it("rejects an explicitly incompatible bridge even in the paired QA bundle", async () => {
  bridge.importOriginalPreviewContractVersion = 3;
  await expect(previewImportOriginal(original, () => true)).rejects.toThrow(
    "IMPORT_PREVIEW_UNAVAILABLE",
  );
  expect(bridge.previewImportOriginal).not.toHaveBeenCalled();
});

it("requires the exact protocol and both methods for ordinary availability", () => {
  vi.stubEnv("EXPO_PUBLIC_OTR_IMPORT_ORIGINAL_PREVIEW_ENABLED", undefined);
  expect(isImportOriginalPreviewAvailable()).toBe(false);
  bridge.importOriginalPreviewContractVersion = 2;
  expect(isImportOriginalPreviewAvailable()).toBe(true);
  const close = bridge.closeImportOriginal;
  try {
    Reflect.set(bridge, "closeImportOriginal", undefined);
    expect(isImportOriginalPreviewAvailable()).toBe(false);
  } finally {
    Reflect.set(bridge, "closeImportOriginal", close);
  }
});
it("does not log bridge diagnostics in ordinary versioned preview", async () => {
  vi.stubEnv("EXPO_PUBLIC_OTR_IMPORT_ORIGINAL_PREVIEW_ENABLED", undefined);
  bridge.importOriginalPreviewContractVersion = 2;
  bridge.previewImportOriginal.mockResolvedValueOnce(undefined);
  const info = vi.spyOn(console, "info").mockImplementation(() => {});
  try {
    await previewImportOriginal(original, () => true);
    expect(info).not.toHaveBeenCalled();
  } finally {
    info.mockRestore();
  }
});
