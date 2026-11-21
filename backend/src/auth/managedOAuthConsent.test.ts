import type { ManagedConsentConnection } from "./managedOAuthConsent";
import { expect, it, vi } from "vitest";
import { createManagedConsentRequest, createManagedOAuthConsent } from "./managedOAuthConsent";

it.each([undefined, 600, 60])("bounds stored consent independently of the runtime (%s seconds)", async (grantTtlSeconds) => {
  const session = {
    issuer: "https://tuqigdxrvrerfewsxqgm.supabase.co/auth/v1" as const,
    accountId: "11111111-1111-4111-8111-111111111111",
    clientId: "22222222-2222-4222-8222-222222222222",
    sessionId: "33333333-3333-4333-8333-333333333333",
    expiresAt: Date.now() + 180_000,
  };
  const policy = {
    policyId: "unit",
    policyVersion: "1",
    policyHash: "a".repeat(64),
    expiresAt: grantTtlSeconds === undefined ? Date.now() + 900_000 : Number.MAX_SAFE_INTEGER,
    ...(grantTtlSeconds === undefined ? {} : { grantTtlSeconds }),
  };
  let inserted: readonly string[] = [];
  const adapter = createManagedOAuthConsent({
    withLease: async (work) => work({
      retire() {},
      async query(sql, args) {
        if (sql.includes("AS session_state")) return { rows: [{ session_state: "SESSION_OPEN" }] };
        if (sql.includes("'PENDING',to_timestamp")) inserted = args;
        if (sql.includes("WHERE id=$1::uuid")) {
          const [id, secret_hash, oauthSession, nativeSnapshot, storedPolicy, challenge, consent] = inserted;
          return { rows: [{ id, secret_hash, oauth_session: JSON.parse(oauthSession),
            native_snapshot: JSON.parse(nativeSnapshot), policy: JSON.parse(storedPolicy),
            state: "PENDING", challenge_expires_ms: challenge, consent_expires_ms: consent }] };
        }
        return { rows: [] };
      },
    }),
  }, () => policy);
  const start = Date.now();
  await adapter.begin(session, createManagedConsentRequest(), new AbortController().signal);
  const deadline = Number(inserted[6]);
  if (grantTtlSeconds === 60) {
    expect(deadline).toBeGreaterThanOrEqual(start + 60_000);
    expect(deadline).toBeLessThanOrEqual(Date.now() + 60_000);
    expect(Number(inserted[5])).toBe(deadline);
  } else {
    expect(deadline).toBe(grantTtlSeconds === undefined ? policy.expiresAt : session.expiresAt);
    expect(Number(inserted[5])).toBe(session.expiresAt);
  }
});

it.each(["expired", "active", "revoked", "busy", "busy-at-commit"] as const)(
  "renews only an expired approval in the same session and policy (%s)",
  async (previous) => {
    const now = Date.now();
    const session = {
      issuer: "https://tuqigdxrvrerfewsxqgm.supabase.co/auth/v1",
      accountId: "11111111-1111-4111-8111-111111111111",
      clientId: "22222222-2222-4222-8222-222222222222",
      sessionId: "33333333-3333-4333-8333-333333333333",
      expiresAt: now + 120_000,
    };
    const policy = {
      policyId: "unit",
      policyVersion: "1",
      policyHash: "a".repeat(64),
      expiresAt: now + 120_000,
    };
    const { id } = createManagedConsentRequest();
    const pending = {
      id,
      secret_hash: "b".repeat(64),
      oauth_session: session,
      native_snapshot: {
        issuer: session.issuer,
        accountId: session.accountId,
        clientId: session.clientId,
        sessionId: session.sessionId,
      },
      policy,
      state: "PENDING",
      challenge_expires_ms: now + 60_000,
      consent_expires_ms: now + 120_000,
    };
    const writes: string[] = [];
    let leases = 0;
    const consent = createManagedOAuthConsent(
      {
        withLease: async (work) => {
          leases++;
          if (previous === "busy" && leases === 1)
            throw Object.assign(new Error("capacity"), { code: "53300" });
          return work({
            retire() {},
            async query(sql, args) {
              if (sql.includes("AS session_state")) {
                return {
                  rows: [
                    {
                      session_state: previous === "revoked" ? "REVOKED" : "SESSION_OPEN",
                    },
                  ],
                };
              }
              if (sql.startsWith("SELECT") && sql.includes("WHERE id=$1::uuid")) {
                return { rows: [pending] };
              }
              if (sql.includes("SET state='EXPIRED'")) {
                expect(args).toEqual([
                  session.issuer,
                  session.accountId,
                  session.clientId,
                  session.sessionId,
                  policy.policyHash,
                ]);
                expect(sql).toContain(
                  "state='APPROVED' AND consent_expires_at<=clock_timestamp()",
                );
                writes.push("archive expired");
              }
              if (sql.includes("SET state=$2")) {
                expect(args).toEqual([id, "APPROVED", String(pending.consent_expires_ms)]);
                writes.push("approve");
                if (previous === "active") throw new Error("23505");
                return { rows: [{ id }] };
              }
              if (sql === "COMMIT" || sql === "ROLLBACK") writes.push(sql);
              if (sql === "COMMIT" && previous === "busy-at-commit")
                throw Object.assign(new Error("capacity"), { code: "53300" });
              return { rows: [] };
            },
          });
        },
      },
      () => policy,
    );
    const result = consent.decideById(
      { accountId: session.accountId, kind: "FIRST_PARTY" },
      id,
      true,
      new AbortController().signal,
    );
    if (previous === "expired" || previous === "busy") {
      await expect(result).resolves.toEqual({ id, decision: "APPROVED" });
      expect(writes).toEqual(["archive expired", "approve", "COMMIT"]);
    } else {
      await expect(result).rejects.toThrow("MANAGED_CONSENT_UNAVAILABLE");
      expect(writes).toEqual(
        previous === "active" ? ["archive expired", "approve", "ROLLBACK"]
          : previous === "busy-at-commit" ? ["archive expired", "approve", "COMMIT", "ROLLBACK"]
          : ["ROLLBACK"],
      );
    }
    expect(leases).toBe(previous === "busy" ? 2 : 1);
  },
);

it.each([
  { errors: ["53300"], leases: 2, active: true, inspect: false },
  { errors: ["53300"], leases: 2, active: true, inspect: true },
  { errors: ["42501"], leases: 1, active: false, inspect: false },
  { errors: ["53300", "53300"], leases: 2, active: false, inspect: false },
])("bounds the consent read retry after an acquisition error ($errors, inspect=$inspect)", async ({ errors, leases, active, inspect }) => {
  const now = Date.now();
  const native = {
    issuer: "https://tuqigdxrvrerfewsxqgm.supabase.co/auth/v1" as const,
    accountId: "11111111-1111-4111-8111-111111111111",
    clientId: "22222222-2222-4222-8222-222222222222",
    sessionId: "33333333-3333-4333-8333-333333333333",
  };
  const session = { ...native, expiresAt: now + 120_000 };
  const policy = { policyId: "unit", policyVersion: "1", policyHash: "a".repeat(64), expiresAt: now + 120_000 };
  const { id, secret } = createManagedConsentRequest();
  let attempts = 0;
  const adapter = createManagedOAuthConsent({
    async withLease(work) {
      const code = errors[attempts++];
      if (code) throw Object.assign(new Error(), { code });
      const statements: string[] = [];
      const result = await work({
        retire() {},
        async query(sql) {
          statements.push(sql);
          const row = {
            id, secret_hash: secret, oauth_session: session, native_snapshot: native, policy,
            state: "APPROVED", challenge_expires_ms: now + 60_000, consent_expires_ms: now + 120_000,
          };
          return { rows: sql.includes("state='APPROVED'") || sql.includes("WHERE id=$1::uuid") ? [row] : [] };
        },
      });
      expect(statements[0]).toBe("BEGIN READ ONLY");
      expect(statements).toHaveLength(3);
      expect(statements[2]).toBe("COMMIT");
      return result;
    },
  }, () => policy);
  const signal = new AbortController().signal;
  const binding = inspect
    ? adapter.inspectById({ accountId: native.accountId, kind: "FIRST_PARTY" }, id, signal)
    : adapter.readBinding(session, signal);
  if (active)
    await expect(binding).resolves.toMatchObject({ accountId: native.accountId, ...(inspect ? { id } : { evidenceId: id }) });
  else
    await expect(binding).rejects.toThrow("MCP_CONSENT_STORE_UNAVAILABLE");
  expect(attempts).toBe(leases);
});
it("starts the finite standing Consent at approval and preserves it across same-session token refresh", async () => {
  const now = Date.now();
  const clock = vi.spyOn(Date, "now").mockReturnValue(now);
  try {
    const native = { issuer: "https://tuqigdxrvrerfewsxqgm.supabase.co/auth/v1" as const,
      accountId: "11111111-1111-4111-8111-111111111111",
      clientId: "22222222-2222-4222-8222-222222222222",
      sessionId: "33333333-3333-4333-8333-333333333333" };
    const session = { ...native, expiresAt: now + 30_000 };
    const policy = {
      policyId: "unit", policyVersion: "standing", policyHash: "a".repeat(64),
      expiresAt: Number.MAX_SAFE_INTEGER, grantTtlSeconds: 3600,
    };
    const { id, secret } = createManagedConsentRequest();
    const row = {
      id, secret_hash: secret, oauth_session: session, native_snapshot: native, policy,
      state: "PENDING", challenge_expires_ms: session.expiresAt, consent_expires_ms: session.expiresAt,
    };
    const lease = {
        retire() {},
        async query(sql: string, args: readonly string[] = []) {
          if (sql.includes("AS session_state")) return { rows: [{ session_state: "SESSION_OPEN" }] };
          if (sql.includes("WHERE id=$1::uuid") && sql.startsWith("SELECT")) return { rows: [row] };
          if (sql.includes("SET state=$2")) {
            row.state = args[1];
            row.consent_expires_ms = Number(args[2]);
            return { rows: [{ id }] };
          }
          if (sql.includes("state='APPROVED' AND consent_expires_at>clock_timestamp()")) {
            return { rows: row.state === "APPROVED" && args[3] === native.sessionId &&
              row.consent_expires_ms > Date.now() ? [row] : [] };
          }
          return { rows: [] };
        },
    };
    const withLease = vi.fn(async <T>(work: (port: typeof lease) => Promise<T>) => work(lease));
    const adapter = createManagedOAuthConsent({ withLease: withLease as ManagedConsentConnection["withLease"] }, () => policy);
    const signal = new AbortController().signal;
    clock.mockReturnValue(now + 5000);
    await adapter.decideById({ kind: "FIRST_PARTY", accountId: native.accountId }, id, true, signal);
    expect(row.consent_expires_ms).toBe(now + 5000 + 3_600_000);
    clock.mockReturnValue(now + 45_000);
    await expect(adapter.readBinding(session, signal)).resolves.toBeNull();
    const refreshed = { ...session, expiresAt: now + 7_200_000 };
    await expect(adapter.readBinding(refreshed, signal)).resolves.toMatchObject({ evidenceId: id });
    const previousLeases = withLease.mock.calls.length;
    await expect(adapter.readBinding(refreshed, signal, lease)).resolves.toMatchObject({ evidenceId: id });
    expect(withLease).toHaveBeenCalledTimes(previousLeases);
    await expect(adapter.readBinding({ ...refreshed,
      sessionId: "44444444-4444-4444-8444-444444444444" }, signal)).resolves.toBeNull();
    clock.mockReturnValue(row.consent_expires_ms);
    await expect(adapter.readBinding(refreshed, signal)).resolves.toBeNull();
  } finally {
    clock.mockRestore();
  }
});

it.each([
  { aborted: false, invalid: false, category: "OTHER" },
  { aborted: true, invalid: false, category: "OTHER" },
  { aborted: false, invalid: true, category: "CORE_CONNECTION_BUSY" },
])("logs only bounded lease metadata on consent read failure ($category, aborted=$aborted)", async ({ aborted, invalid, category }) => {
  const signal = new AbortController();
  const error = Object.assign(new Error(invalid ? "CORE_CONNECTION_BUSY" : "PRIVATE_SQL_TOKEN_ACCOUNT"), {
    coreLeaseDiagnostic: { waitMs: invalid ? 120_001 : 15_000, holderAgeMs: 20_000, holderPhase: "SQL", waiterCount: 2, sql: "PRIVATE_SQL" },
  });
  const log = vi.spyOn(console, "info").mockImplementation(() => {});
  try {
    const adapter = createManagedOAuthConsent({ async withLease() {
      if (aborted) signal.abort();
      throw error;
    } }, () => ({ policyId: "unit", policyVersion: "1", policyHash: "a".repeat(64), expiresAt: Date.now() + 120_000 }));
    await expect(adapter.readBinding({
      issuer: "https://tuqigdxrvrerfewsxqgm.supabase.co/auth/v1",
      accountId: "11111111-1111-4111-8111-111111111111",
      clientId: "22222222-2222-4222-8222-222222222222",
      sessionId: "33333333-3333-4333-8333-333333333333", expiresAt: Date.now() + 120_000,
    }, signal.signal)).rejects.toThrow("MCP_CONSENT_STORE_UNAVAILABLE");
    expect(log).toHaveBeenCalledTimes(1);
    const entry = JSON.parse(log.mock.calls[0][0]);
    expect(entry).toEqual({ event: "mcp_managed_consent_read_unavailable", stage: "lease", category, aborted,
      ...(invalid ? {} : { waitMs: 15_000, holderAgeMs: 20_000, holderPhase: "SQL", waiterCount: 2 }), durationMs: expect.any(Number) });
    expect(JSON.stringify(entry)).not.toContain("PRIVATE");
  } finally { log.mockRestore(); }
});
