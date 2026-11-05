import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdtempSync,
  mkdirSync,
  readdirSync,
  symlinkSync,
  readFileSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  factory: vi.fn(),
  gateway: vi.fn(() => ({})),
  mcp: vi.fn(async () => undefined),
  listen: vi.fn(),
  on: vi.fn(),
}));
vi.mock("./app", () => ({ createDevBackendHandler: mocks.factory }));
vi.mock("./supabaseGateway", () => ({ createSupabaseDevGateway: mocks.gateway }));
vi.mock("./mcpQaRuntime", () => ({ loadMcpQaRuntime: mocks.mcp }));
vi.mock("./tripPublicationCatalogRuntime", () => ({
  loadDevPublicationCatalog: () => null,
}));
vi.mock("./flightLiveHost", () => ({
  initializeDevFlightLiveHost: async () => ({ status: "CLOSED" }),
}));
vi.mock("./receiptOcrProvider", () => ({ createReceiptOcrProvider: () => undefined }));
vi.mock("./rateDemandScanner", () => ({
  createRateDemandScanner: () => ({ wake: vi.fn(), start: vi.fn(), stop: vi.fn() }),
}));
vi.mock("node:http", () => ({
  createServer: () => ({ listen: mocks.listen, on: mocks.on }),
}));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  vi.resetModules();
});
async function fixture() {
  for (const [key, value] of Object.entries({
    OTR_DEV_SUPABASE_URL: "https://tuqigdxrvrerfewsxqgm.supabase.co",
    OTR_DEV_SUPABASE_PUBLISHABLE_KEY: "FAKE_PUBLIC",
    OTR_DEV_SUPABASE_SECRET_KEY: "FAKE_BACKEND",
    OTR_DEV_BACKEND_NETWORK_MODE: undefined,
    OTR_DEV_BACKEND_BIND_ADDRESS: undefined,
    OTR_DEV_BACKEND_PORT: undefined,
    OTR_DEV_RECEIPT_OCR_ACCEPTANCE_FIXTURE: undefined,
  }))
    vi.stubEnv(key, value);
  mocks.factory.mockReturnValue(async () => Response.json({}));
  const packet = "docs/ops/auth-c03-self-nickname-20261105/startup-forward-candidate";
  const meta = JSON.parse(readFileSync(join(packet, "PREIMAGE.json"), "utf8"));
  const dir = mkdtempSync(join(tmpdir(), "otr-startup-forward-unit-")),
    target = join(dir, "backend/src");
  mkdirSync(target, { recursive: true });
  const hash = (b: Buffer) => createHash("sha256").update(b).digest("hex");
  try {
    for (const e of readdirSync("backend/src", { withFileTypes: true })) {
      if (e.name === "serverStartup.ts") continue;
      symlinkSync(
        join(process.cwd(), "backend/src", e.name),
        join(target, e.name),
        e.isDirectory() ? "dir" : "file",
      );
    }
    symlinkSync(join(process.cwd(), "node_modules"), join(dir, "node_modules"), "dir");
    const before = execFileSync("git", [
      "show",
      `${meta.sourceMain}:backend/src/serverStartup.ts`,
    ]);
    expect(hash(before)).toBe(meta.preSHA256);
    writeFileSync(join(target, "serverStartup.ts"), before);
    const patch = join(process.cwd(), packet, "STARTUP_EXPLICIT_PORT.patch");
    expect(hash(readFileSync(patch))).toBe(meta.patchSHA256);
    execFileSync("git", ["apply", "--check", patch], { cwd: dir });
    execFileSync("git", ["apply", patch], { cwd: dir });
    expect(hash(readFileSync(join(target, "serverStartup.ts")))).toBe(meta.postSHA256);
    const module = await import(
      /* @vite-ignore */ pathToFileURL(join(target, "serverStartup.ts")).href
    );
    return {
      start: module.startDevBackend as (options?: Record<string, unknown>) => unknown,
      cleanup: () => rmSync(dir, { recursive: true, force: true }),
    };
  } catch (e) {
    rmSync(dir, { recursive: true, force: true });
    throw e;
  }
}
it("default explicit startup option forwards undefined and does not create a nickname capability", async () => {
  const f = await fixture();
  try {
    f.start();
    expect(mocks.factory).toHaveBeenCalledOnce();
    expect(mocks.gateway).toHaveBeenCalledOnce();
    expect(mocks.mcp).toHaveBeenCalledOnce();
    expect(mocks.factory.mock.calls[0][0].selfTripNicknamePort).toBeUndefined();
    expect(mocks.listen).toHaveBeenCalledOnce(); // mocked only; no socket/listen callback executed.
  } finally {
    f.cleanup();
  }
});
it("forwards the exact caller-supplied port unchanged without deriving it from a connection", async () => {
  const f = await fixture(),
    port = { read: vi.fn(), execute: vi.fn(), recover: vi.fn() },
    coreConnection = { marker: "opaque-existing-http-port" };
  try {
    f.start({ selfTripNicknamePort: port, coreConnection });
    expect(mocks.factory.mock.calls[0][0].selfTripNicknamePort).toBe(port);
    expect(mocks.factory.mock.calls[0][0].coreConnection).toBe(coreConnection);
    expect(port.read).not.toHaveBeenCalled();
    expect(port.execute).not.toHaveBeenCalled();
    expect(port.recover).not.toHaveBeenCalled();
  } finally {
    f.cleanup();
  }
});
