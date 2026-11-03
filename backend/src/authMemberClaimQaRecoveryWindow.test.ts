import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import type { MemberClaimQaCase } from "./tripMemberClaimQa";
import {
  createMemberClaimQaRecoveryWindowQualifier,
  createMemberClaimQaResumeWindowQualifier,
} from "../../scripts/auth/member-claim-qa-recovery-window";

function fixture() {
  const qaCase: MemberClaimQaCase = {
    projectRef: "tuqigdxrvrerfewsxqgm" as const,
    tripId: randomUUID(),
    personId: randomUUID(),
    ownerAccountId: randomUUID(),
    claimantAccountId: randomUUID(),
    issueOperationId: randomUUID(),
    claimOperationId: randomUUID(),
    opensAt: "2026-11-03T00:00:00Z",
    inviteExpiresAt: "2026-11-03T00:10:00Z",
    closesAt: "2026-11-03T00:15:00Z",
  };
  const expected = {
    qaCase,
    image: "sha256:" + "a".repeat(64),
    containerId: "b".repeat(64),
    configSHA256: "c".repeat(64),
    planSHA256: "d".repeat(64),
  };
  const response: Record<string, unknown> = {
    ...structuredClone(expected),
    status: "AUTH_C04_RECOVERY_WINDOW_QUALIFIED",
    executionMode: "RECOVERY_ONLY",
    businessMutationAuthorized: false,
  };
  const clock = { time: Date.parse(qaCase.opensAt) };
  const readControl = vi.fn(async (): Promise<unknown> => response);
  const options = { expected, readControl, now: () => clock.time };
  return { qaCase, expected, response, clock, readControl, options };
}

it("accepts only a controller result bound to independently fixed expected identity", async () => {
  const f = fixture();
  await expect(
    createMemberClaimQaRecoveryWindowQualifier(f.options)(f.qaCase),
  ).resolves.toBeUndefined();
  expect(f.readControl).toHaveBeenCalledOnce();
});
it.each([
  "image",
  "containerId",
  "configSHA256",
  "planSHA256",
  "status",
  "executionMode",
  "businessMutationAuthorized",
] as const)("rejects changed controller %s", async (key) => {
  const f = fixture();
  f.response[key] =
    key === "businessMutationAuthorized"
      ? true
      : key === "image"
        ? "sha256:" + "f".repeat(64)
        : ["containerId", "configSHA256", "planSHA256"].includes(key)
          ? "f".repeat(64)
          : "wrong";
  await expect(
    createMemberClaimQaRecoveryWindowQualifier(f.options)(f.qaCase),
  ).rejects.toThrow("WINDOW_UNQUALIFIED");
});
it.each([
  "tripId",
  "personId",
  "ownerAccountId",
  "claimantAccountId",
  "issueOperationId",
  "claimOperationId",
  "opensAt",
  "inviteExpiresAt",
  "closesAt",
] as const)("rejects changed returned qaCase %s", async (key) => {
  const f = fixture();
  const qa = structuredClone(f.qaCase);
  qa[key] = key.endsWith("At") ? "2026-11-03T00:01:00Z" : randomUUID();
  f.response.qaCase = qa;
  await expect(
    createMemberClaimQaRecoveryWindowQualifier(f.options)(f.qaCase),
  ).rejects.toThrow();
});
it.each(["missing", "extra"])("rejects %s wire fields", async (kind) => {
  const f = fixture();
  if (kind === "missing") delete f.response.containerId;
  else f.response.extra = true;
  await expect(
    createMemberClaimQaRecoveryWindowQualifier(f.options)(f.qaCase),
  ).rejects.toThrow("WINDOW_UNQUALIFIED");
});
it("rejects a different caller case before invoking control reader", async () => {
  const f = fixture();
  await expect(
    createMemberClaimQaRecoveryWindowQualifier(f.options)({
      ...f.qaCase,
      tripId: randomUUID(),
    }),
  ).rejects.toThrow();
  expect(f.readControl).not.toHaveBeenCalled();
});
it.each([-1, 600000, 900000, Number.NaN])(
  "rejects invalid/pre-open/constructor-expired time %s before control IO",
  async (delta) => {
    const f = fixture();
    f.clock.time += delta;
    await expect(
      createMemberClaimQaRecoveryWindowQualifier(f.options)(f.qaCase),
    ).rejects.toThrow();
    expect(f.readControl).not.toHaveBeenCalled();
  },
);
it("rejects expiry while the control read is pending", async () => {
  const f = fixture();
  f.readControl.mockImplementation(async () => {
    f.clock.time = Date.parse(f.qaCase.inviteExpiresAt);
    return f.response;
  });
  await expect(
    createMemberClaimQaRecoveryWindowQualifier(f.options)(f.qaCase),
  ).rejects.toThrow();
  expect(f.readControl).toHaveBeenCalledOnce();
});
it("snapshots expected identity instead of trusting later caller mutation", async () => {
  const f = fixture();
  const qualify = createMemberClaimQaRecoveryWindowQualifier(f.options);
  f.expected.image = "sha256:" + "f".repeat(64);
  f.expected.qaCase.tripId = randomUUID();
  await expect(
    qualify(structuredClone(f.response.qaCase) as typeof f.qaCase),
  ).resolves.toBeUndefined();
});
it("does not expose a reader exception or retry it", async () => {
  const f = fixture();
  f.readControl.mockRejectedValue(Error("untrusted transport details"));
  await expect(
    createMemberClaimQaRecoveryWindowQualifier(f.options)(f.qaCase),
  ).rejects.toThrow(/^C04_QA_RECOVERY_WINDOW_UNQUALIFIED$/);
  expect(f.readControl).toHaveBeenCalledOnce();
});
it("rejects a wider expected recovery window before control IO", () => {
  const f = fixture();
  f.expected.qaCase.closesAt = "2026-11-03T00:30:00Z";
  expect(() => createMemberClaimQaRecoveryWindowQualifier(f.options)).toThrow();
  expect(f.readControl).not.toHaveBeenCalled();
});

it("qualifies resume only with its distinct write-capable mode, preserving the read-only boundary", async () => {
  const f = fixture();
  f.response.status = "AUTH_C04_RESUME_WINDOW_QUALIFIED";
  f.response.executionMode = "ORIGINAL_ID_RESUME";
  f.response.businessMutationAuthorized = true;
  await expect(
    createMemberClaimQaResumeWindowQualifier(f.options)(f.qaCase),
  ).resolves.toBeUndefined();
  await expect(
    createMemberClaimQaRecoveryWindowQualifier(f.options)(f.qaCase),
  ).rejects.toThrow();
});
it("does not treat an actual read-only qualification as original-ID submission authority", async () => {
  const f = fixture();
  await expect(
    createMemberClaimQaResumeWindowQualifier(f.options)(f.qaCase),
  ).rejects.toThrow();
});
it("rejects valid-shaped plan drift in resume mode", async () => {
  const f = fixture();
  f.response.status = "AUTH_C04_RESUME_WINDOW_QUALIFIED";
  f.response.executionMode = "ORIGINAL_ID_RESUME";
  f.response.businessMutationAuthorized = true;
  f.response.planSHA256 = "e".repeat(64);
  await expect(
    createMemberClaimQaResumeWindowQualifier(f.options)(f.qaCase),
  ).rejects.toThrow();
});
it("allows at most the existing 30-minute QA envelope for resume without widening the read-only envelope", async () => {
  const f = fixture();
  f.expected.qaCase.closesAt = "2026-11-03T00:30:00Z";
  f.response.qaCase = structuredClone(f.qaCase);
  f.response.status = "AUTH_C04_RESUME_WINDOW_QUALIFIED";
  f.response.executionMode = "ORIGINAL_ID_RESUME";
  f.response.businessMutationAuthorized = true;
  await expect(
    createMemberClaimQaResumeWindowQualifier(f.options)(f.qaCase),
  ).resolves.toBeUndefined();
  expect(() => createMemberClaimQaRecoveryWindowQualifier(f.options)).toThrow();
});
