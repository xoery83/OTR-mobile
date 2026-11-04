import { mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import {
  createAcceptedHostQaReceiver,
  createNativeCaseReloginReceiver,
} from "../../scripts/auth/resend-inbound-otp-native-relogin";
import {
  runRegisteredQaHostSession,
  registeredHostQa,
  createNormalRegisteredQaHostDependencies,
  createRegisteredQaChallengeReservation,
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
      userId: String(registeredHostQa.accountId),
      displayName: "",
      email: String(registeredHostQa.email),
    },
  };
  const request = vi.fn(async (_email: string) => {}),
    verify = vi.fn(async (_email: string, _code: string) => structuredClone(session)),
    readUser = vi.fn(async () => ({
      id: String(registeredHostQa.accountId),
      email: String(registeredHostQa.email),
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
it.each(["normal", "foreign", "caller-mutation"])("binds an explicit existing QA Account: %s", async (mode) => {
  const f = setup();
  const qa = { accountId: randomUUID(), tripId: randomUUID(), email: `otr-qa-${randomUUID()}@eldouzileu.resend.app` };
  const expected = { ...qa };
  if (mode === "caller-mutation") f.request.mockImplementationOnce(async () => {
    qa.accountId = randomUUID(); qa.tripId = randomUUID(); qa.email = `otr-qa-${randomUUID()}@eldouzileu.resend.app`;
  });
  f.deps.receiver = createAcceptedHostQaReceiver({ key: "re_unit_only", scope: "dedicated-qa-team", email: qa.email, reserve: () => {}, fetch: f.wire });
  const updated = { ...f.session, identity: { ...f.session.identity, userId: qa.accountId, email: qa.email } };
  f.verify.mockResolvedValue(updated);
  f.readUser.mockResolvedValue({ id: mode === "foreign" ? randomUUID() : qa.accountId, email: qa.email, created_at: registeredHostQa.createdAt, email_confirmed_at: "2026-10-30T00:17:41Z", is_anonymous: false });
  f.wire.mockReset();
  f.wire.mockImplementation(async () => Response.json({ data: [{ id: randomUUID(), to: [qa.email], from: "OTR <noreply@auth.xoery.art>", subject: "Your OTR verification code", created_at: new Date().toISOString() }], has_more: false }));
  // Use the exact receiver lease; receiving transport itself is covered separately.
  const lease = { email: qa.email, requestedAt: new Date().toISOString() };
  f.deps.receiver.createChallenge = () => lease;
  f.deps.receiver.waitForOtp = async () => ({ code: "12345678", messageId: randomUUID(), receivedAt: lease.requestedAt });
  const action = vi.fn(async (context: RegisteredQaHostContext) => {
    expect(context.accountId).toBe(expected.accountId);
    expect(context.tripId).toBe(expected.tripId);
    expect((await context.readSession()).identity?.userId).toBe(expected.accountId);
  });
  if (mode === "foreign") {
    await expect(runRegisteredQaHostSession(f.deps, action, qa)).rejects.toThrow("CLEANUP_UNRESOLVED");
    expect(action).not.toHaveBeenCalled();
    expect(f.revoke).not.toHaveBeenCalled();
  } else {
    expect(await runRegisteredQaHostSession(f.deps, action, qa)).toMatchObject({ accountId: expected.accountId, tripId: expected.tripId });
    expect(f.request).toHaveBeenCalledWith(expected.email);
    expect(f.revoke).toHaveBeenCalledOnce();
  }
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

it("composes extracted normal callbacks through OTP, user verification and local refresh revocation", async () => {
  const f = setup();
  const wire = vi.fn<typeof fetch>(async (url) => {
    const path = new URL(String(url)).pathname;
    if (path.endsWith("/otp")) return Response.json({});
    if (path.endsWith("/verify"))
      return Response.json({
        access_token: "unit-host-access",
        refresh_token: "unit-host-refresh",
        expires_in: 3600,
        user: { id: registeredHostQa.accountId, email: registeredHostQa.email },
      });
    if (path.endsWith("/user")) return Response.json(await f.readUser());
    if (path.endsWith("/logout")) return new Response(null, { status: 204 });
    if (path.endsWith("/token"))
      return Response.json({ error_code: "refresh_token_not_found" }, { status: 400 });
    throw Error("UNEXPECTED_UNIT_AUTH_PATH");
  });
  vi.stubGlobal("fetch", wire);
  try {
    const deps = createNormalRegisteredQaHostDependencies(
      f.deps.receiver,
      (value) => f.notes.push(value),
      {
        url: "https://tuqigdxrvrerfewsxqgm.supabase.co",
        publishableKey: "sb_publishable_unit_only_000000000000000000000000",
        persistSession: async () => undefined,
      },
    );
    expect(
      await runRegisteredQaHostSession(
        deps,
        async (context) => {
          expect((await context.readSession()).identity?.userId).toBe(
            registeredHostQa.accountId,
          );
        },
        registeredHostQa,
      ),
    ).toMatchObject({ ownSessionCleanup: "PASS_LOCAL_SCOPE_REFRESH_REVOKED" });
    expect(wire).toHaveBeenCalledTimes(5);
    expect(JSON.parse(String(wire.mock.calls[0][1]?.body))).toEqual({
      email: registeredHostQa.email,
      create_user: false,
    });
    expect(String(wire.mock.calls[3][0])).toContain("/logout?scope=local");
    expect(String(wire.mock.calls[4][0])).toContain("/token?grant_type=refresh_token");
    expect(JSON.stringify(f.notes)).not.toMatch(
      /unit-host-access|unit-host-refresh|12345678/,
    );
  } finally {
    vi.unstubAllGlobals();
  }
});

it("extracted normal callbacks preserve rate-limit rejection without another OTP attempt", async () => {
  const f = setup(),
    wire = vi.fn<typeof fetch>(async () => Response.json({}, { status: 429 }));
  vi.stubGlobal("fetch", wire);
  try {
    const deps = createNormalRegisteredQaHostDependencies(f.deps.receiver, () => {}, {
      url: "https://tuqigdxrvrerfewsxqgm.supabase.co",
      publishableKey: "sb_publishable_unit_only_000000000000000000000000",
      persistSession: async () => undefined,
    });
    await expect(deps.request(registeredHostQa.email)).rejects.toMatchObject({
      kind: "rate_limited",
      status: 429,
    });
    expect(wire).toHaveBeenCalledOnce();
  } finally {
    vi.unstubAllGlobals();
  }
});

it("extracted normal callbacks snapshot validated DEV options before sending a Session Bearer", async () => {
  const f = setup(), wire = vi.fn<typeof fetch>(async () => Response.json(await f.readUser()));
  const options = { url: "https://tuqigdxrvrerfewsxqgm.supabase.co", publishableKey: "sb_publishable_unit_only_000000000000000000000000", persistSession: vi.fn(async () => undefined) };
  vi.stubGlobal("fetch", wire);
  try {
    expect(() => createNormalRegisteredQaHostDependencies(f.deps.receiver, () => {}, { ...options, url: "https://foreign.example.test" })).toThrow();
    expect(wire).not.toHaveBeenCalled();
    const deps = createNormalRegisteredQaHostDependencies(f.deps.receiver, () => {}, options);
    options.url = "https://foreign.example.test"; options.publishableKey = "changed";
    await deps.readUser(f.session);
    expect(wire).toHaveBeenCalledExactlyOnceWith("https://tuqigdxrvrerfewsxqgm.supabase.co/auth/v1/user", expect.objectContaining({
      redirect: "error", headers: { apikey: "sb_publishable_unit_only_000000000000000000000000", Authorization: "Bearer unit-host-access" },
    }));
    expect(options.persistSession).not.toHaveBeenCalled();
  } finally { vi.unstubAllGlobals(); }
});

it("admits exactly one metadata-only browser challenge in the active proven context and rejects released use", async () => {
  const f = setup(),
    reserveBrowserChallenge = vi.fn();
  let saved: RegisteredQaHostContext | undefined;
  const input = {
    accountId: String(registeredHostQa.accountId),
    email: String(registeredHostQa.email),
    requestedAt: new Date().toISOString(),
  };
  await runRegisteredQaHostSession(
    { ...f.deps, reserveBrowserChallenge },
    async (context) => {
      saved = context;
      expect(context.reserveBrowserChallenge!(input)).toEqual({
        status: "RESERVED_LOCK_RETAINED",
      });
      expect(() => context.reserveBrowserChallenge!(input)).toThrow("ALREADY_ATTEMPTED");
    },
  );
  expect(reserveBrowserChallenge).toHaveBeenCalledExactlyOnceWith({
    email: input.email,
    requestedAt: input.requestedAt,
  });
  expect(() => saved!.reserveBrowserChallenge!(input)).toThrow("SCOPE_RELEASED");
  expect(f.request).toHaveBeenCalledOnce();
});

it.each(["account", "email", "expired", "future", "extra"])(
  "rejects invalid browser metadata before reservation: %s",
  async (mode) => {
    const f = setup(),
      reserveBrowserChallenge = vi.fn();
    await runRegisteredQaHostSession(
      { ...f.deps, reserveBrowserChallenge },
      async (context) => {
        const input = {
          accountId: String(registeredHostQa.accountId),
          email: String(registeredHostQa.email),
          requestedAt: new Date().toISOString(),
          ...(mode === "extra" ? { token: "forbidden" } : {}),
        };
        if (mode === "account") input.accountId = randomUUID();
        if (mode === "email")
          input.email = `otr-qa-${randomUUID()}@eldouzileu.resend.app`;
        if (mode === "expired")
          input.requestedAt = new Date(Date.now() - 120000).toISOString();
        if (mode === "future")
          input.requestedAt = new Date(Date.now() + 60000).toISOString();
        expect(() => context.reserveBrowserChallenge!(input)).toThrow();
      },
    );
    expect(reserveBrowserChallenge).not.toHaveBeenCalled();
  },
);

it("does not supply browser capability for ordinary injected sessions or retry a failed reservation", async () => {
  const f = setup();
  await runRegisteredQaHostSession(f.deps, async (context) => {
    expect(() =>
      context.reserveBrowserChallenge!({
        accountId: String(registeredHostQa.accountId),
        email: String(registeredHostQa.email),
        requestedAt: new Date().toISOString(),
      }),
    ).toThrow("UNAVAILABLE");
  });
  const g = setup(),
    reserveBrowserChallenge = vi.fn(() => {
      throw Error("durable write unknown");
    });
  await runRegisteredQaHostSession(
    { ...g.deps, reserveBrowserChallenge },
    async (context) => {
      const input = {
        accountId: String(registeredHostQa.accountId),
        email: String(registeredHostQa.email),
        requestedAt: new Date().toISOString(),
      };
      expect(() => context.reserveBrowserChallenge!(input)).toThrow(
        "durable write unknown",
      );
      expect(() => context.reserveBrowserChallenge!(input)).toThrow("ALREADY_ATTEMPTED");
    },
  );
  expect(reserveBrowserChallenge).toHaveBeenCalledOnce();
});

it("reuses durable reservation with the original cooldown and fails closed after losing its lock", () => {
  const base = mkdtempSync(join(tmpdir(), "otr-browser-reserve-unit-")),
    notes: Record<string, unknown>[] = [];
  mkdirSync(join(base, "active.lock"), { mode: 0o700 });
  try {
    const reserve = createRegisteredQaChallengeReservation(base, (v) => notes.push(v));
    const host = {
      email: String(registeredHostQa.email),
      requestedAt: new Date(Date.now() - 60001).toISOString(),
    };
    reserve(host, "HOST_UNIT");
    const browser = {
      email: String(registeredHostQa.email),
      requestedAt: new Date().toISOString(),
    };
    const beforeWrite = vi.fn();
    reserve(browser, "BROWSER_UNIT", beforeWrite);
    expect(beforeWrite).toHaveBeenCalledOnce();
    expect(JSON.parse(readFileSync(join(base, "last-request.json"), "utf8"))).toEqual(
      browser,
    );
    expect(() => reserve(browser, "REPEAT", beforeWrite)).toThrow("COOLDOWN");
    expect(beforeWrite).toHaveBeenCalledOnce();
    rmSync(join(base, "active.lock"), { recursive: true });
    expect(() => reserve(browser, "LATE")).toThrow();
    expect(notes).toHaveLength(2);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

it("marks the retention boundary before a durable reservation whose journal acknowledgement fails", () => {
  const base = mkdtempSync(join(tmpdir(), "otr-browser-uncertain-unit-"));
  mkdirSync(join(base, "active.lock"), { mode: 0o700 });
  try {
    const note = vi.fn(() => { throw Error("journal failed after write"); });
    const reserve = createRegisteredQaChallengeReservation(base, note);
    let unresolved = false;
    const browser = { email: registeredHostQa.email, requestedAt: new Date().toISOString() };
    expect(() => reserve(browser, "BROWSER", () => { unresolved = true; })).toThrow("journal failed");
    expect(unresolved).toBe(true);
    expect(JSON.parse(readFileSync(join(base, "last-request.json"), "utf8"))).toEqual(browser);
  } finally { rmSync(base, { recursive: true, force: true }); }
});
