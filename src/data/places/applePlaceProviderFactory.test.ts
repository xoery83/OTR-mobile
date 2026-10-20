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
  vi.doUnmock("expo-modules-core");
  vi.resetModules();
});
it("classifies module import failure as unavailable", async () => {
  vi.resetModules();
  vi.doMock("expo-modules-core", () => {
    throw new Error("import unavailable");
  });
  const { readApplePlaceProvider } = await import("./applePlaceProvider");
  await expect(readApplePlaceProvider(binding())).rejects.toMatchObject({
    code: "NATIVE_UNAVAILABLE",
  });
});
it("classifies missing native module as unavailable", async () => {
  vi.resetModules();
  vi.doMock("expo-modules-core", () => ({
    requireNativeModule: () => {
      throw new Error("module missing");
    },
  }));
  const { readApplePlaceProvider } = await import("./applePlaceProvider");
  await expect(readApplePlaceProvider(binding())).rejects.toMatchObject({
    code: "NATIVE_UNAVAILABLE",
  });
});
it("uses the modules-core loader and retains invalid binding rejection outside catch", async () => {
  vi.resetModules();
  const native = {
    complete: vi.fn(),
    search: vi.fn(),
    resolve: vi.fn(),
    cancel: vi.fn(),
  };
  const requireNativeModule = vi.fn(() => native);
  vi.doMock("expo-modules-core", () => ({ requireNativeModule }));
  const { readApplePlaceProvider } = await import("./applePlaceProvider");
  const provider = await readApplePlaceProvider(binding());
  expect(requireNativeModule).toHaveBeenCalledWith("OTRPlaceSearch");
  provider.close();
  expect(native.cancel).toHaveBeenCalledOnce();
  await expect(
    readApplePlaceProvider({ ...binding(), tripId: "invalid" }),
  ).rejects.not.toMatchObject({ code: "NATIVE_UNAVAILABLE" });
});
