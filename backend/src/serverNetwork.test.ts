import { afterEach, describe, expect, it, vi } from "vitest";

const base = {
  OTR_DEV_SUPABASE_URL: "https://tuqigdxrvrerfewsxqgm.supabase.co",
  OTR_DEV_SUPABASE_PUBLISHABLE_KEY: "FAKE_PUBLIC",
  OTR_DEV_SUPABASE_SECRET_KEY: "FAKE_BACKEND",
};
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  vi.doUnmock("node:http");
});
async function start(extra: Record<string, string | undefined>) {
  vi.resetModules();
  for (const [key, value] of Object.entries({
    ...base,
    OTR_DEV_BACKEND_NETWORK_MODE: undefined,
    OTR_DEV_BACKEND_BIND_ADDRESS: undefined,
    OTR_DEV_BACKEND_PORT: undefined,
    ...extra,
  }))
    vi.stubEnv(key, value);
  const listen = vi.fn();
  const createServer = vi.fn(() => ({ on: vi.fn(), listen }));
  vi.doMock("node:http", () => ({ createServer }));
  return { loading: import("./server"), listen, createServer };
}
describe("DEV Backend network profile at actual startup", () => {
  it("retains bridge wildcard binding and custom port", async () => {
    const { loading, listen } = await start({ OTR_DEV_BACKEND_PORT: "8989" });
    await loading;
    expect(listen).toHaveBeenCalledWith(8989, "0.0.0.0", expect.any(Function));
  });
  it("host profile binds exact IPv4 loopback on 8787", async () => {
    const { loading, listen } = await start({
      OTR_DEV_BACKEND_NETWORK_MODE: "host",
      OTR_DEV_BACKEND_BIND_ADDRESS: "127.0.0.1",
    });
    await loading;
    expect(listen).toHaveBeenCalledWith(8787, "127.0.0.1", expect.any(Function));
  });
  it.each([
    undefined,
    "",
    "0.0.0.0",
    "::",
    "::1",
    "localhost",
    "127.1",
    "127.0.0.2",
    "127.0.0.1 ",
    "127.0.0.1:8787",
    "178.105.151.143",
  ])("rejects host-mode bind %s before creating any socket", async (address) => {
    const { loading, createServer } = await start({
      OTR_DEV_BACKEND_NETWORK_MODE: "host",
      OTR_DEV_BACKEND_BIND_ADDRESS: address,
    });
    await expect(loading).rejects.toThrow();
    expect(createServer).not.toHaveBeenCalled();
  });
  it("rejects host-mode port drift", async () => {
    const { loading, createServer } = await start({
      OTR_DEV_BACKEND_NETWORK_MODE: "host",
      OTR_DEV_BACKEND_BIND_ADDRESS: "127.0.0.1",
      OTR_DEV_BACKEND_PORT: "8989",
    });
    await expect(loading).rejects.toThrow();
    expect(createServer).not.toHaveBeenCalled();
  });
  it("rejects unknown network mode", async () => {
    const { loading, createServer } = await start({
      OTR_DEV_BACKEND_NETWORK_MODE: "HOST",
    });
    await expect(loading).rejects.toThrow();
    expect(createServer).not.toHaveBeenCalled();
  });
});
