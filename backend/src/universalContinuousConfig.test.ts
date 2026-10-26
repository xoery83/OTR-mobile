import { createHash } from "node:crypto";
import { beforeEach, expect, it, vi } from "vitest";
import { readUniversalContinuousConfig } from "./universalContinuousConfig";
const f = vi.hoisted(() => ({ open: vi.fn() }));
vi.mock("node:fs/promises", async () => ({
  ...(await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises")),
  open: f.open,
}));
beforeEach(() => vi.resetAllMocks());
it("default CLOSED does not open a runtime file or access any key", async () => {
  expect(await readUniversalContinuousConfig({})).toBeUndefined();
  expect(f.open).not.toHaveBeenCalled();
});
it("missing explicit V2 configuration remains CLOSED", async () => {
  f.open.mockRejectedValueOnce(Object.assign(Error(), { code: "ENOENT" }));
  expect(
    await readUniversalContinuousConfig({
      OTR_DEV_UNIVERSAL_CONTINUOUS_HOST: "enabled",
      OTR_DEV_BACKEND_NETWORK_MODE: "host",
      OTR_DEV_SUPABASE_URL: "https://tuqigdxrvrerfewsxqgm.supabase.co",
    }),
  ).toBeUndefined();
});
it.each(["mode", "hash", "actor"])(
  "rejects unsafe %s configuration before opening Task DB or network",
  async (kind) => {
    const body = JSON.stringify({ version: 2, actorId: "forbidden" }),
      close = vi.fn();
    f.open.mockResolvedValueOnce({
      stat: async () => ({
        isFile: () => true,
        uid: 0,
        gid: 999,
        mode: kind === "mode" ? 0o644 : 0o440,
        nlink: 1,
        size: body.length,
      }),
      readFile: async () => body,
      close,
    });
    await expect(
      readUniversalContinuousConfig({
        OTR_DEV_UNIVERSAL_CONTINUOUS_HOST: "enabled",
        OTR_DEV_BACKEND_NETWORK_MODE: "host",
        OTR_DEV_SUPABASE_URL: "https://tuqigdxrvrerfewsxqgm.supabase.co",
        OTR_DEV_UNIVERSAL_RUNTIME_SHA256:
          kind === "hash"
            ? "a".repeat(64)
            : createHash("sha256").update(body).digest("hex"),
      }),
    ).rejects.toThrow("CLOSED");
    expect(close).toHaveBeenCalledOnce();
  },
);
