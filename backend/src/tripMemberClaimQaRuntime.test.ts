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

it("RECOVERY_ONLY selection denies mutation delegation and keeps the original runtime expiry constructor", async () => {
  const v = fixture();
  const receipt = vi.fn(async () => null), issue = vi.fn();
  v.atomic.mockImplementation(async (_scope, work) => work({ receipt, issue }));
  const runtime = await load({ ...v.selected, OTR_DEV_AUTH_MEMBER_CLAIM_QA_MODE: "RECOVERY_ONLY" });
  if (!runtime?.memberClaimPort) throw Error("fixture");
  const scope = { tripId: v.qa.tripId, actorAccountId: v.qa.ownerAccountId };
  await runtime.memberClaimPort.atomic(scope, tx => tx.receipt(v.qa.issueOperationId));
  expect(receipt).toHaveBeenCalledWith(v.qa.issueOperationId);
  await expect(runtime.memberClaimPort.atomic(scope, tx => tx.issue(v.qa.personId, { kind: "REGISTERED_ACCOUNT", accountId: v.qa.claimantAccountId }))).rejects.toThrow("RECOVERY_ONLY");
  expect(issue).not.toHaveBeenCalled();
});
it("unknown QA mode never exposes the underlying Claim port", async () => {
  const v = fixture();
  const runtime = await load({ ...v.selected, OTR_DEV_AUTH_MEMBER_CLAIM_QA_MODE: "INVALID" });
  expect(runtime).not.toHaveProperty("memberClaimPort");
  expect(v.atomic).not.toHaveBeenCalled();
});

it("forwards explicit normal Reader selection without selecting a QA Claim authority", async () => {
  const v = fixture();
  const reader = { incoming: vi.fn(), recipients: vi.fn(), invitation: vi.fn() };
  f.load.mockResolvedValue({ tripCreatePort: v.ordinary, directedInviteReadPort: reader,
    memberClaimPort: { atomic: v.atomic }, close: v.close });
  const runtime = await load(env, undefined, { directedInviteRead: true });
  expect(f.load).toHaveBeenCalledWith(env, undefined, { directedInviteRead: true });
  if (!runtime || !("directedInviteReadPort" in runtime))
    throw Error("DIRECTED_READER_EXPECTED");
  expect(runtime.directedInviteReadPort).toBe(reader);
  expect(runtime).not.toHaveProperty("memberClaimPort");
  await runtime.close();
  expect(v.close).toHaveBeenCalledOnce();
});

function nativeFixture() {
  const v = fixture();
  const q = v.qa;
  const nativeCase = { projectRef: q.projectRef, tripId: q.tripId, personId: q.personId,
    ownerAccountId: q.ownerAccountId, claimantAccountId: q.claimantAccountId,
    opensAt: q.opensAt, inviteExpiresAt: q.inviteExpiresAt, closesAt: q.closesAt };
  const environment = { ...env, OTR_DEV_AUTH_MEMBER_CLAIM_NATIVE_MODE: "ORIGINAL_ID_FINITE",
    OTR_DEV_AUTH_MEMBER_CLAIM_NATIVE_CONFIG: JSON.stringify(nativeCase) };
  return { ...v, nativeCase, environment };
}
it("Native finite selection binds normal original UUIDs per transaction, not a fixed case ID or window quota", async () => {
  const v = nativeFixture();
  const receipt = vi.fn(async (_operationId: string) => null);
  v.atomic.mockImplementation(async (_scope, work) => work({ receipt }));
  const runtime = await load(v.environment);
  expect(f.load.mock.calls.at(-1)?.[2]).toEqual({ memberClaim: { inviteExpiresAt: v.nativeCase.inviteExpiresAt } });
  if (!runtime?.memberClaimPort) throw Error("MISSING_NATIVE_CLAIM_PORT");
  const scope = { actorAccountId: v.nativeCase.ownerAccountId, tripId: v.nativeCase.tripId };
  const original1 = randomUUID(), original2 = randomUUID();
  await expect(runtime.memberClaimPort.atomic(scope, tx => tx.receipt(original1))).resolves.toBeNull();
  await expect(runtime.memberClaimPort.atomic(scope, tx => tx.receipt(original2))).resolves.toBeNull();
  expect(receipt.mock.calls.map(([id]) => id)).toEqual([original1, original2]);
  await runtime.close();
  await expect(runtime.memberClaimPort.atomic(scope, async () => null)).rejects.toThrow("MEMBER_CLAIM_QA_CLOSED");
});
it.each(["missingMode", "wrongMode", "wrongProject", "wrongEndpoint", "wrongNetwork", "future", "expired", "missingExpiry", "presetId", "legacyConfig", "legacyMode", "oversized"])(
  "Native selection %s fails closed without selecting or leaking raw Claim", async kind => {
    const v = nativeFixture();
    const config: Record<string, unknown> = { ...v.nativeCase };
    const selected: Record<string, string | undefined> = { ...v.environment };
    if (kind === "missingMode") delete selected.OTR_DEV_AUTH_MEMBER_CLAIM_NATIVE_MODE;
    if (kind === "wrongMode") selected.OTR_DEV_AUTH_MEMBER_CLAIM_NATIVE_MODE = "RECOVERY_ONLY";
    if (kind === "wrongProject") config.projectRef = "production";
    if (kind === "wrongEndpoint") selected.OTR_DEV_SUPABASE_URL = "https://other.example.test";
    if (kind === "wrongNetwork") selected.OTR_DEV_BACKEND_NETWORK_MODE = "bridge";
    if (kind === "future") config.opensAt = "2026-11-03T00:02:00Z";
    if (kind === "expired") config.inviteExpiresAt = "2026-11-03T00:00:30Z";
    if (kind === "missingExpiry") delete config.inviteExpiresAt;
    if (kind === "presetId") config.issueOperationId = randomUUID();
    if (kind === "legacyConfig") selected.OTR_DEV_AUTH_MEMBER_CLAIM_QA_CONFIG = JSON.stringify(v.qa);
    if (kind === "legacyMode") selected.OTR_DEV_AUTH_MEMBER_CLAIM_QA_MODE = "RECOVERY_ONLY";
    selected.OTR_DEV_AUTH_MEMBER_CLAIM_NATIVE_CONFIG = kind === "oversized" ? "x".repeat(4097) : JSON.stringify(config);
    const runtime = await load(selected);
    expect(runtime).not.toHaveProperty("memberClaimPort");
    expect(f.load.mock.calls.at(-1)?.[2]).toBeUndefined();
    expect(v.atomic).not.toHaveBeenCalled();
    await runtime?.close();
  },
);
it("Native config never falls back to valid legacy IDs when selectors conflict", async () => {
  const v = nativeFixture();
  const runtime = await load({ ...v.environment, OTR_DEV_AUTH_MEMBER_CLAIM_QA_CONFIG: JSON.stringify(v.qa),
    OTR_DEV_AUTH_MEMBER_CLAIM_NATIVE_CONFIG: "malformed" });
  expect(runtime).not.toHaveProperty("memberClaimPort");
  expect(v.atomic).not.toHaveBeenCalled();
});
it("Native finite invitation expiry is explicit and not the legacy ten-minute product default", async () => {
  const v = nativeFixture();
  const explicit = { ...v.nativeCase, inviteExpiresAt: "2026-11-03T00:20:00Z" };
  const runtime = await load({ ...v.environment, OTR_DEV_AUTH_MEMBER_CLAIM_NATIVE_CONFIG: JSON.stringify(explicit) });
  expect(f.load.mock.calls.at(-1)?.[2]).toEqual({ memberClaim: { inviteExpiresAt: explicit.inviteExpiresAt } });
  expect(runtime).toHaveProperty("memberClaimPort");
  await runtime?.close();
});
