import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { loadDevTripCreateWithMemberClaimQaRuntime as load } from "./tripMemberClaimQaRuntime";
const f = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock("./tripCreateRuntime", () => ({ loadDevTripCreateRuntime: f.load }));
const env = {
  OTR_DEV_BACKEND_NETWORK_MODE: "host",
  OTR_DEV_SUPABASE_URL: "https://tuqigdxrvrerfewsxqgm.supabase.co",
};
function config() {
  return {
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
  };
}
function fixture() {
  const qa = config(),
    close = vi.fn(),
    ordinary = { create: vi.fn() };
  const atomic = vi.fn(async (_scope, work) => work({}));
  f.load.mockResolvedValue({
    tripCreatePort: ordinary,
    memberClaimPort: { atomic },
    close,
  });
  return {
    qa,
    close,
    ordinary,
    atomic,
    selected: { ...env, OTR_DEV_AUTH_MEMBER_CLAIM_QA_CONFIG: JSON.stringify(qa) },
  };
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-03T00:01:00Z"));
  f.load.mockReset();
  vi.spyOn(console, "info").mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
it("default keeps ordinary runtime but strips any unqualified Claim port", async () => {
  const v = fixture(),
    runtime = await load(env);
  expect(runtime?.tripCreatePort).toBe(v.ordinary);
  expect(runtime).not.toHaveProperty("memberClaimPort");
  expect(f.load).toHaveBeenCalledWith(env, undefined, undefined);
});
it.each([
  "invalid",
  "large",
  "wrongDev",
  "wrongNetwork",
  "future",
  "expired",
  "activationTtl",
  "inviteTtl",
  "inviteExpired",
])("%s cannot select QA PG options or leak raw port", async (kind) => {
  const v = fixture(),
    input = { ...v.selected },
    qa = { ...v.qa };
  if (kind === "invalid") input.OTR_DEV_AUTH_MEMBER_CLAIM_QA_CONFIG = "{";
  if (kind === "large") input.OTR_DEV_AUTH_MEMBER_CLAIM_QA_CONFIG = " ".repeat(4097);
  if (kind === "wrongDev") input.OTR_DEV_SUPABASE_URL = "https://other.supabase.co";
  if (kind === "wrongNetwork") input.OTR_DEV_BACKEND_NETWORK_MODE = "bridge";
  if (kind === "future") qa.opensAt = "2026-11-03T00:02:00Z";
  if (kind === "expired") qa.closesAt = "2026-11-03T00:01:00Z";
  if (kind === "activationTtl") qa.closesAt = "2026-11-03T00:31:00Z";
  if (kind === "inviteTtl") qa.inviteExpiresAt = "2026-11-03T00:11:00Z";
  if (kind === "inviteExpired") qa.inviteExpiresAt = "2026-11-03T00:01:00Z";
  if (!["invalid", "large"].includes(kind))
    input.OTR_DEV_AUTH_MEMBER_CLAIM_QA_CONFIG = JSON.stringify(qa);
  const runtime = await load(input);
  expect(runtime?.tripCreatePort).toBe(v.ordinary);
  expect(runtime).not.toHaveProperty("memberClaimPort");
  expect(v.atomic).not.toHaveBeenCalled();
  expect(f.load).toHaveBeenCalledWith(input, undefined, undefined);
  expect(console.info).toHaveBeenCalledWith("MEMBER_CLAIM_QA_SELECTION_CLOSED");
});
it("valid fixed scope constructs only explicit invite expiry and uses real QA wrapper until close", async () => {
  const v = fixture(),
    runtime = await load(v.selected);
  expect(f.load).toHaveBeenCalledWith(v.selected, undefined, {
    memberClaim: { inviteExpiresAt: v.qa.inviteExpiresAt },
  });
  if (!runtime?.memberClaimPort) throw Error("fixture");
  const scope = { tripId: v.qa.tripId, actorAccountId: v.qa.ownerAccountId };
  await expect(runtime.memberClaimPort.atomic(scope, async () => "ok")).resolves.toBe(
    "ok",
  );
  await expect(
    runtime.memberClaimPort.atomic({ ...scope, tripId: randomUUID() }, async () => {}),
  ).rejects.toThrow("MEMBER_CLAIM_QA_CLOSED");
  expect(v.atomic).toHaveBeenCalledTimes(1);
  await runtime.close();
  expect(v.close).toHaveBeenCalledOnce();
  await expect(runtime.memberClaimPort.atomic(scope, async () => {})).rejects.toThrow(
    "MEMBER_CLAIM_QA_CLOSED",
  );
});
it("activation deadline stays separate from invite TTL and blocks later transactions", async () => {
  const v = fixture(),
    runtime = await load(v.selected);
  if (!runtime?.memberClaimPort) throw Error("fixture");
  vi.setSystemTime(new Date(v.qa.closesAt));
  await expect(
    runtime.memberClaimPort.atomic(
      { tripId: v.qa.tripId, actorAccountId: v.qa.claimantAccountId },
      async () => {},
    ),
  ).rejects.toThrow("MEMBER_CLAIM_QA_CLOSED");
  expect(v.atomic).not.toHaveBeenCalled();
  expect(runtime.tripCreatePort).toBe(v.ordinary);
});
it("absent ordinary runtime remains absent", async () => {
  f.load.mockResolvedValue(undefined);
  expect(await load(env)).toBeUndefined();
});
