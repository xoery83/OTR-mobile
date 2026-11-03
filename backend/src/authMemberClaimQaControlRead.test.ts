import { expect, it, vi } from "vitest";
import template from "../../docs/ops/auth-c04-20261103/finite-qa-candidate/QA_CASE_TEMPLATE.json";
import { parseMemberClaimQaCase } from "./tripMemberClaimQa";
import { createRootMemberClaimQaRecoveryWindowQualifier, createMemberClaimQaControlRead } from "../../scripts/auth/member-claim-qa-control-read";
const input = { windowId: "10000000-0000-4000-8000-000000000001", planSHA256: "a".repeat(64) };
it("runs only the exact bounded recovery qualification command without session material", async () => {
  const run = vi.fn(async () => ({ stdout: '{"status":"fixture"}' }));
  const reader = createMemberClaimQaControlRead(input, run);
  input.planSHA256 = "b".repeat(64);
  expect(await reader()).toEqual({ status: "fixture" });
  expect(run).toHaveBeenCalledWith("ssh", ["-o", "BatchMode=yes", "-o", "ConnectTimeout=5", "root@178.105.151.143", "python3 /opt/otr/dev-backend/releases/auth-c04-qa-10000000-0000-4000-8000-000000000001/runtime.py qualify-recovery /opt/otr/dev-backend/releases/auth-c04-qa-10000000-0000-4000-8000-000000000001/plan.json " + "a".repeat(64)], { timeout: 15000, maxBuffer: 131072 });
});
it.each([{ windowId: "../other" }, { windowId: "10000000-0000-4000-8000-000000000001;true" }, { planSHA256: "0".repeat(64) }, { planSHA256: "a;echo secret" }])("rejects invalid command binding before subprocess", change => {
  const run = vi.fn();
  expect(() => createMemberClaimQaControlRead({ ...input, ...change }, run)).toThrow();
  expect(run).not.toHaveBeenCalled();
});
it.each(["error", "json"])("fails closed without exposing raw %s output", async kind => {
  const run = vi.fn(async () => { if (kind === "error") throw Error("SECRET_CANARY"); return { stdout: "SECRET_CANARY" }; });
  await expect(createMemberClaimQaControlRead(input, run)()).rejects.toThrow(/^C04_QA_CONTROL_READ_UNCONFIRMED$/);
});

it.each([false, true])("composes the actual Root SSH reader with owning frozen-wire qualifier, drift=%s", async drift => {
  const qaCase = parseMemberClaimQaCase({ ...template.qaCase, opensAt: "2026-11-03T00:00:00Z", inviteExpiresAt: "2026-11-03T00:10:00Z", closesAt: "2026-11-03T00:15:00Z" });
  const expected = { qaCase, image: "sha256:"+"a".repeat(64), containerId: "b".repeat(64), configSHA256: "c".repeat(64), planSHA256: "d".repeat(64) };
  const wire = { ...expected, status: "AUTH_C04_RECOVERY_WINDOW_QUALIFIED", executionMode: "RECOVERY_ONLY", businessMutationAuthorized: false };
  const run = vi.fn(async (_program: string, _args: string[]) => ({ stdout: JSON.stringify({ ...wire, ...(drift ? { configSHA256: "e".repeat(64) } : {}) }) }));
  const qualify = createRootMemberClaimQaRecoveryWindowQualifier({ windowId: input.windowId, expected, now: () => Date.parse("2026-11-03T00:01:00Z") }, run);
  if (drift) await expect(qualify(qaCase)).rejects.toThrow("RECOVERY_WINDOW_UNQUALIFIED");
  else await expect(qualify(qaCase)).resolves.toBeUndefined();
  expect(run).toHaveBeenCalledOnce();
  expect(run.mock.calls[0][1].at(-1)).toContain("qualify-recovery");
});
