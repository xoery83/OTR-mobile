import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import {
  createAcceptedHostQaReceiver,
  createNativeCaseReloginReceiver,
} from "../../scripts/auth/resend-inbound-otp-native-relogin";
import {
  runRegisteredQaHostSession,
  registeredHostQa,
  type RegisteredQaHostContext,
} from "../../scripts/auth/registered-qa-host-session";
function setup() {
  const time = Date.parse("2026-10-31T00:00:00Z"),
    wire = vi.fn<typeof fetch>(),
    notes: Record<string, unknown>[] = [];
  const receiver = createAcceptedHostQaReceiver({
    key: "re_unit_only",
    scope: "dedicated-qa-team",
    reserve: () => {},
    fetch: wire,
    now: () => time,
  });
  const mail = {
    id: randomUUID(),
    to: [registeredHostQa.email],
    from: "OTR <noreply@auth.xoery.art>",
    subject: "Your OTR verification code",
    created_at: new Date(time).toISOString(),
    cc: [],
    bcc: [],
  };
  wire
    .mockResolvedValueOnce(Response.json({ data: [mail], has_more: false }))
    .mockResolvedValueOnce(Response.json({ ...mail, text: "12345678" }));
  const session = {
    accessToken: "unit-host-access",
    refreshToken: "unit-host-refresh",
    expiresAt: "2026-11-01T00:00:00Z",
    identity: {
      userId: registeredHostQa.accountId,
      displayName: "",
      email: registeredHostQa.email,
    },
  };
  const request = vi.fn(async (_email: string) => {}),
    verify = vi.fn(async (_email: string, _code: string) => structuredClone(session)),
    readUser = vi.fn(async () => ({
      id: registeredHostQa.accountId,
      email: registeredHostQa.email,
      created_at: registeredHostQa.createdAt,
      email_confirmed_at: "2026-10-30T00:17:41.921994Z",
      is_anonymous: false,
    })),
    revoke = vi.fn(async (_token: string) => {}),
    isRevoked = vi.fn(async () => true);
  const deps = {
    receiver,
    request,
    verify,
    readUser,
    revoke,
    isRevoked,
    note: (v: Record<string, unknown>) => notes.push(v),
  };
  return { deps, notes, wire, request, verify, readUser, revoke, isRevoked, session };
}
it("uses one normal OTP/verify, proves canonical existing Account and exposes only its own repository Session", async () => {
  const f = setup();
  let saved: RegisteredQaHostContext | undefined;
  const result = await runRegisteredQaHostSession(f.deps, async (context) => {
    saved = context;
    expect(context.accountId).toBe(registeredHostQa.accountId);
    expect(context.tripId).toBe(registeredHostQa.tripId);
    expect(await context.readSession()).toEqual(f.session);
  });
  expect(result.status).toBe("PASS");
  expect(f.request).toHaveBeenCalledExactlyOnceWith(registeredHostQa.email);
  expect(f.verify).toHaveBeenCalledExactlyOnceWith(registeredHostQa.email, "12345678");
  expect(f.revoke).toHaveBeenCalledExactlyOnceWith("unit-host-access");
  expect(f.isRevoked).toHaveBeenCalledOnce();
  expect(JSON.stringify(f.notes)).not.toMatch(
    /unit-host-access|unit-host-refresh|12345678/,
  );
  await expect(saved!.readSession()).rejects.toThrow("SCOPE_RELEASED");
});
it.each(["id", "email", "created_at", "is_anonymous"])(
  "rejects wrong %s without revoking an unproven or iPad Session",
  async (field) => {
    const f = setup();
    f.readUser.mockResolvedValueOnce({
      ...(await f.readUser()),
      [field]:
        field === "is_anonymous"
          ? true
          : field === "created_at"
            ? "2026-10-31T00:00:00Z"
            : field === "email"
              ? "other@example.test"
              : randomUUID(),
    });
    f.readUser.mockClear();
    const work = vi.fn();
    await expect(runRegisteredQaHostSession(f.deps, work)).rejects.toThrow(
      "CLEANUP_UNRESOLVED",
    );
    expect(work).not.toHaveBeenCalled();
    expect(f.revoke).not.toHaveBeenCalled();
    expect(f.isRevoked).not.toHaveBeenCalled();
  },
);
it("cleans only the proven Host Session when business action fails, without retrying the action", async () => {
  const f = setup(),
    work = vi.fn(async () => {
      throw Error("private details");
    });
  await expect(runRegisteredQaHostSession(f.deps, work)).rejects.toThrow("ACTION_FAILED");
  expect(work).toHaveBeenCalledOnce();
  expect(f.revoke).toHaveBeenCalledExactlyOnceWith(f.session.accessToken);
  expect(JSON.stringify(f.notes)).not.toContain("private details");
});
it("retains UNKNOWN on failed logout and never retries or probes refresh as success", async () => {
  const f = setup();
  f.revoke.mockRejectedValueOnce(Error("unknown"));
  await expect(runRegisteredQaHostSession(f.deps, async () => {})).rejects.toThrow(
    "CLEANUP_UNRESOLVED",
  );
  expect(f.revoke).toHaveBeenCalledOnce();
  expect(f.isRevoked).not.toHaveBeenCalled();
});
it("refuses to claim cleanup when the revoked refresh was not proven invalid", async () => {
  const f = setup();
  f.isRevoked.mockResolvedValueOnce(false);
  await expect(runRegisteredQaHostSession(f.deps, async () => {})).rejects.toThrow(
    "CLEANUP_UNRESOLVED",
  );
  expect(f.revoke).toHaveBeenCalledOnce();
});
it("does not repeat an uncertain OTP send or create a Host action", async () => {
  const f = setup();
  f.request.mockRejectedValueOnce(Error("unknown"));
  const work = vi.fn();
  await expect(runRegisteredQaHostSession(f.deps, work)).rejects.toThrow(
    "CLEANUP_UNRESOLVED",
  );
  expect(f.request).toHaveBeenCalledOnce();
  expect(f.verify).not.toHaveBeenCalled();
  expect(f.wire).not.toHaveBeenCalled();
  expect(work).not.toHaveBeenCalled();
});
it("does not extend the old Native incident window while accepted Host reuse is available", () => {
  const receiver = createNativeCaseReloginReceiver({
    key: "re_unit",
    scope: "dedicated-qa-team",
    reserve: vi.fn(),
    now: () => Date.parse("2026-10-31T00:00:00Z"),
  });
  expect(() => receiver.createChallenge()).toThrow("CASE_WINDOW_CLOSED");
});
it.each(["accessToken", "refreshToken"] as const)(
  "rejects missing %s before trusted user IO or cleanup binding",
  async (field) => {
    const f = setup(),
      work = vi.fn();
    const verify = vi.fn(
      async (): Promise<import("../../src/domain/auth/localSession").LocalSession> => ({
        ...f.session,
        [field]: null,
      }),
    );
    await expect(runRegisteredQaHostSession({ ...f.deps, verify }, work)).rejects.toThrow(
      "CLEANUP_UNRESOLVED",
    );
    expect(f.readUser).not.toHaveBeenCalled();
    expect(f.revoke).not.toHaveBeenCalled();
    expect(work).not.toHaveBeenCalled();
  },
);
it("rejects a Session read that finishes after the action scope was released", async () => {
  const f = setup();
  let late: Promise<string> | undefined;
  await runRegisteredQaHostSession(f.deps, async (context) => {
    late = context.readSession().then(
      () => "LEAKED",
      (e) => e.code,
    );
  });
  expect(await late).toBe("REGISTERED_HOST_SCOPE_RELEASED");
});
