import { expect, it } from "vitest";
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

it.each(["expired", "active", "revoked"] as const)(
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
    const consent = createManagedOAuthConsent(
      {
        withLease: async (work) =>
          work({
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
                expect(args).toEqual([id, "APPROVED"]);
                writes.push("approve");
                if (previous === "active") throw new Error("23505");
                return { rows: [{ id }] };
              }
              if (sql === "COMMIT" || sql === "ROLLBACK") writes.push(sql);
              return { rows: [] };
            },
          }),
      },
      () => policy,
    );
    const result = consent.decideById(
      { accountId: session.accountId, kind: "FIRST_PARTY" },
      id,
      true,
      new AbortController().signal,
    );
    if (previous === "expired") {
      await expect(result).resolves.toEqual({ id, decision: "APPROVED" });
      expect(writes).toEqual(["archive expired", "approve", "COMMIT"]);
    } else {
      await expect(result).rejects.toThrow("MANAGED_CONSENT_UNAVAILABLE");
      expect(writes).toEqual(
        previous === "active" ? ["archive expired", "approve", "ROLLBACK"] : ["ROLLBACK"],
      );
    }
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
