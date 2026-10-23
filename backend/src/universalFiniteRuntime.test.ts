import { createHash } from "node:crypto";
import { beforeEach, expect, it, vi } from "vitest";
import { loadDevUniversalRuntime } from "./universalFiniteRuntime";
const f = vi.hoisted(() => ({ open: vi.fn() }));
vi.mock("node:fs/promises", async () => ({
  ...(await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises")),
  open: f.open,
}));
beforeEach(() => vi.resetAllMocks());
it("missing Operator capability is CLOSED without credentials or database access", async () => {
  f.open.mockRejectedValueOnce(Object.assign(Error(), { code: "ENOENT" }));
  expect(await loadDevUniversalRuntime({})).toBeUndefined();
});
it.each(["owner", "group", "mode", "hardlink", "size", "hash"])(
  "rejects %s before private config or network work",
  async (kind) => {
    const body = "{}",
      close = vi.fn();
    const stat = {
      isFile: () => true,
      uid: 0,
      gid: 999,
      mode: 0o440,
      nlink: 1,
      size: body.length,
    };
    if (kind === "owner") stat.uid = 999;
    if (kind === "group") stat.gid = 0;
    if (kind === "mode") stat.mode = 0o644;
    if (kind === "hardlink") stat.nlink = 2;
    if (kind === "size") stat.size = 131073;
    f.open.mockResolvedValueOnce({
      stat: async () => stat,
      readFile: async () => body,
      close,
    });
    await expect(
      loadDevUniversalRuntime({
        OTR_DEV_UNIVERSAL_RUNTIME_SHA256:
          kind === "hash"
            ? "0".repeat(64)
            : createHash("sha256").update(body).digest("hex"),
      }),
    ).rejects.toThrow("UNIVERSAL_RUNTIME_CLOSED");
    expect(close).toHaveBeenCalledOnce();
  },
);
