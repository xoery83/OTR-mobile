import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  mkdtempSync,
  mkdirSync,
  readdirSync,
  symlinkSync,
  readFileSync,
  writeFileSync,
  rmSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
const mocked = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock("./tripCreateRuntime", () => ({ loadDevTripCreateRuntime: mocked.load }));
let load: (
  env: Record<string, string | undefined>,
  reader?: unknown,
  options?: { selfTripNickname?: true },
) => Promise<any>;
let directory: string;
const packet = "docs/ops/auth-c03-self-nickname-20261105/qa-wrapper-option-candidate";
beforeAll(async () => {
  const meta = JSON.parse(readFileSync(join(packet, "PREIMAGE.json"), "utf8"));
  directory = mkdtempSync(join(tmpdir(), "otr-nickname-qa-option-unit-"));
  const target = join(directory, "backend/src");
  mkdirSync(target, { recursive: true });
  for (const e of readdirSync("backend/src", { withFileTypes: true })) {
    if (e.name === "tripMemberClaimQaRuntime.ts") continue;
    symlinkSync(
      join(process.cwd(), "backend/src", e.name),
      join(target, e.name),
      e.isDirectory() ? "dir" : "file",
    );
  }
  symlinkSync(join(process.cwd(), "src"), join(directory, "src"), "dir");
  symlinkSync(
    join(process.cwd(), "node_modules"),
    join(directory, "node_modules"),
    "dir",
  );
  const hash = (b: Buffer) => createHash("sha256").update(b).digest("hex"),
    before = execFileSync("git", ["show", `${meta.sourceMain}:${meta.target}`]);
  expect(hash(before)).toBe(meta.preSHA256);
  writeFileSync(join(target, "tripMemberClaimQaRuntime.ts"), before);
  // Missing existing Auth recovery wrapper is copied only into this disposabletarget.
  if (!existsSync(join(target, "tripMemberClaimQaRecoveryOnly.ts")))
    writeFileSync(
      join(target, "tripMemberClaimQaRecoveryOnly.ts"),
      execFileSync("git", [
        "show",
        `${meta.sourceMain}:backend/src/tripMemberClaimQaRecoveryOnly.ts`,
      ]),
    );
  const patch = join(process.cwd(), packet, "EXPLICIT_NICKNAME_OPTION.patch");
  expect(hash(readFileSync(patch))).toBe(meta.patchSHA256);
  execFileSync("git", ["apply", "--check", patch], { cwd: directory });
  execFileSync("git", ["apply", patch], { cwd: directory });
  expect(hash(readFileSync(join(target, "tripMemberClaimQaRuntime.ts")))).toBe(
    meta.postSHA256,
  );
  load = (
    await import(
      /* @vite-ignore */ pathToFileURL(join(target, "tripMemberClaimQaRuntime.ts")).href
    )
  ).loadDevTripCreateWithMemberClaimQaRuntime;
});
afterAll(() => directory && rmSync(directory, { recursive: true, force: true }));
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-03T00:01:00Z"));
  mocked.load.mockReset();
  vi.spyOn(console, "info").mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
const env = {
  OTR_DEV_BACKEND_NETWORK_MODE: "host",
  OTR_DEV_SUPABASE_URL: "https://tuqigdxrvrerfewsxqgm.supabase.co",
};
function fixture(support = true) {
  const nickname = { read: vi.fn(), execute: vi.fn(), recover: vi.fn() },
    rawClaim = { atomic: vi.fn() },
    ordinary = { marker: "existing-ordinary" },
    close = vi.fn();
  mocked.load.mockImplementation(async (_env, _reader, opts) => ({
    tripCreatePort: ordinary,
    memberClaimPort: rawClaim,
    ...(support && opts?.selfTripNickname === true
      ? { selfTripNicknamePort: nickname }
      : {}),
    close,
  }));
  return { nickname, rawClaim, ordinary, close };
}
function selected() {
  return {
    ...env,
    OTR_DEV_AUTH_MEMBER_CLAIM_QA_CONFIG: JSON.stringify({
      projectRef: "tuqigdxrvrerfewsxqgm",
      tripId: randomUUID(),
      personId: randomUUID(),
      ownerAccountId: randomUUID(),
      claimantAccountId: randomUUID(),
      issueOperationId: randomUUID(),
      claimOperationId: randomUUID(),
      opensAt: "2026-11-03T00:00:00Z",
      inviteExpiresAt: "2026-11-03T00:10:00Z",
      closesAt: "2026-11-03T00:30:00Z",
    }),
  };
}
it("default2argcaller staysabsent even with unrelated env/connection selection", async () => {
  const f = fixture(),
    input = { ...env, OTR_DEV_SELF_TRIP_NICKNAME: "enabled" };
  const runtime = await load(input);
  expect(mocked.load).toHaveBeenCalledExactlyOnceWith(input, undefined, undefined);
  expect(runtime).not.toHaveProperty("selfTripNicknamePort");
  expect(runtime).not.toHaveProperty("memberClaimPort");
  expect(runtime.tripCreatePort).toBe(f.ordinary);
});
it("only explicittrue selects sameprovider nickname independentof missingorinvalid Claim config", async () => {
  const f = fixture(),
    input = { ...env, OTR_DEV_AUTH_MEMBER_CLAIM_QA_CONFIG: "{" },
    reader = () => {};
  const runtime = await load(input, reader, { selfTripNickname: true });
  expect(mocked.load).toHaveBeenCalledExactlyOnceWith(input, reader, {
    selfTripNickname: true,
  });
  expect(runtime.selfTripNicknamePort).toBe(f.nickname);
  expect(runtime).not.toHaveProperty("memberClaimPort");
  await runtime.close();
  expect(f.close).toHaveBeenCalledOnce();
  expect(f.nickname.execute).not.toHaveBeenCalled();
});
it.each([undefined, false, "true"])(
  "nonliteral selection%s never becomesenabled",
  async (value) => {
    fixture();
    const runtime = await load(env, undefined, { selfTripNickname: value } as any);
    expect(mocked.load).toHaveBeenCalledExactlyOnceWith(env, undefined, undefined);
    expect(runtime).not.toHaveProperty("selfTripNicknamePort");
  },
);
it.each([undefined, "RECOVERY_ONLY"])(
  "preserves existingClaim%s selection andmerges only explicitnickname",
  async (mode) => {
    const f = fixture(),
      input = {
        ...selected(),
        ...(mode ? { OTR_DEV_AUTH_MEMBER_CLAIM_QA_MODE: mode } : {}),
      };
    const runtime = await load(input, undefined, { selfTripNickname: true });
    expect(mocked.load).toHaveBeenCalledExactlyOnceWith(input, undefined, {
      memberClaim: { inviteExpiresAt: "2026-11-03T00:10:00Z" },
      selfTripNickname: true,
    });
    expect(runtime.memberClaimPort).toBeTruthy();
    expect(runtime.memberClaimPort).not.toBe(f.rawClaim);
    expect(runtime.selfTripNicknamePort).toBe(f.nickname);
    await runtime.close();
    expect(f.close).toHaveBeenCalledOnce();
  },
);
it("does not synthesize a port when the upstream finite/v2 result omits it", async () => {
  const f = fixture(false),
    runtime = await load(env, undefined, { selfTripNickname: true });
  expect(runtime).not.toHaveProperty("selfTripNicknamePort");
  expect(runtime.tripCreatePort).toBe(f.ordinary);
  expect(mocked.load).toHaveBeenCalledOnce();
  await runtime.close();
  expect(f.close).toHaveBeenCalledOnce();
});

it("retains the old MemberClaim-only lower options for the unchanged two-argument caller", async () => {
  const f = fixture(),
    input = selected(),
    runtime = await load(input);
  expect(mocked.load).toHaveBeenCalledExactlyOnceWith(input, undefined, {
    memberClaim: { inviteExpiresAt: "2026-11-03T00:10:00Z" },
  });
  expect(runtime.memberClaimPort).toBeTruthy();
  expect(runtime).not.toHaveProperty("selfTripNicknamePort");
  expect(f.rawClaim.atomic).not.toHaveBeenCalled();
});
