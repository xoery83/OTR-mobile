import { afterEach, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
const binding = () => ({
  accountId: randomUUID(),
  tripId: randomUUID(),
  editorId: randomUUID(),
  accountGeneration: 0,
  isCurrent: () => true,
});
afterEach(() => {
  vi.doUnmock("expo");
  vi.resetModules();
});
it("classifies missing native module as unavailable", async () => {
  vi.resetModules();
  vi.doMock("expo", () => ({
    requireNativeModule: () => {
      throw new Error("module missing");
    },
  }));
  const { readApplePlaceProvider } = await import("./applePlaceProvider");
  await expect(readApplePlaceProvider(binding())).rejects.toMatchObject({
    code: "NATIVE_UNAVAILABLE",
  });
});
it("uses the existing Expo loader and retains invalid binding rejection outside catch", async () => {
  vi.resetModules();
  const native = {
    complete: vi.fn(),
    search: vi.fn(),
    resolve: vi.fn(),
    cancel: vi.fn(),
  };
  const requireNativeModule = vi.fn(() => native);
  vi.doMock("expo", () => ({ requireNativeModule }));
  const { readApplePlaceProvider } = await import("./applePlaceProvider");
  const provider = await readApplePlaceProvider(binding());
  expect(requireNativeModule).toHaveBeenCalledWith("OTRPlaceSearch");
  provider.close();
  expect(native.cancel).toHaveBeenCalledOnce();
  await expect(
    readApplePlaceProvider({ ...binding(), tripId: "invalid" }),
  ).rejects.not.toMatchObject({ code: "NATIVE_UNAVAILABLE" });
});

it("distinguishes a missing native registration without logging raw error text", async () => {
  vi.resetModules();
  vi.stubGlobal("__DEV__", true);
  const log = vi.spyOn(console, "info").mockImplementation(() => {});
  vi.doMock("expo", () => ({
    requireNativeModule: () => {
      throw new Error("Cannot find native module 'OTRPlaceSearch'");
    },
  }));
  try {
    const { readApplePlaceProvider } = await import("./applePlaceProvider");
    await expect(readApplePlaceProvider(binding())).rejects.toMatchObject({
      code: "NATIVE_UNAVAILABLE",
    });
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({ phase: "LOOKUP_MODULE", code: "NATIVE_MODULE_MISSING" }),
    );
    expect(JSON.stringify(log.mock.calls)).not.toContain("Cannot find native module");
  } finally {
    vi.unstubAllGlobals();
    log.mockRestore();
  }
});

it("retains manual fallback if the lazy native boundary cannot load", async () => {
  vi.resetModules();
  vi.doMock("expo", () => {
    throw new Error("Unavailable native runtime");
  });
  const { readApplePlaceProvider } = await import("./applePlaceProvider");
  await expect(readApplePlaceProvider(binding())).rejects.toMatchObject({
    code: "NATIVE_UNAVAILABLE",
  });
});
