import assert from "node:assert/strict";
import { readFileSync, writeFileSync, existsSync, lstatSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { z } from "zod";
import { createHash } from "node:crypto";
import {
  authenticateToSupabaseDev,
  refreshSupabaseDevSession,
  revokeSupabaseDevSession,
  SupabaseDevAuthError,
} from "../../src/data/auth/devSupabaseAuth";
import { createAuthRepository } from "../../src/data/auth/authSessionRepository";
import { createSessionAccessTokenProvider } from "../../src/data/auth/sessionAccessToken";
import { createAccountSwitchCoordinator } from "../../src/data/auth/accountSwitchCoordinator";
import type { LocalSession } from "../../src/domain/auth/localSession";

const project = "tuqigdxrvrerfewsxqgm";
const origin = `https://${project}.supabase.co`;
const accountId = "3f7e964e-79d3-4028-a585-470e798e41ec";
const credentialPath =
  "/Users/xoery/.codex/worktrees/native-forms-p3/otr-mobile-canonical/.env.forms-qa-credentials.json";
const receiptPath = resolve("docs/ops/auth-phase1-20261028/SESSION_DEV_E2E.json");
const journalPath = "/private/tmp/otr-auth-session-dev-e2e-20261028-journal.json";
const sqlPath = "/private/tmp/otr-auth-session-dev-e2e-20261028.sql";

function assertTarget(url: string, method: string) {
  const target = new URL(url);
  assert.equal(target.origin, origin);
  assert(!target.username && !target.password && !target.hash);
  assert(
    (method === "GET" && target.pathname === "/auth/v1/user" && !target.search) ||
      (method === "POST" &&
        [
          "/auth/v1/token?grant_type=password",
          "/auth/v1/token?grant_type=refresh_token",
          "/auth/v1/logout?scope=local",
        ].includes(target.pathname + target.search)),
  );
}

function sqlSnapshot(): { accountId: string; sessionIds: string[] } {
  writeFileSync(
    sqlPath,
    `BEGIN READ ONLY;\nSELECT json_build_object('accountId',u.id,'sessionIds',COALESCE((SELECT json_agg(s.id ORDER BY s.id) FROM auth.sessions s WHERE s.user_id=u.id),'[]'::json)) AS evidence FROM auth.users u WHERE u.id='${accountId}'::uuid;\nROLLBACK;\n`,
    { mode: 0o600 },
  );
  const raw = execFileSync(
    resolve("node_modules/.bin/supabase"),
    [
      "db",
      "query",
      "--linked",
      "--project-ref",
      project,
      "--file",
      sqlPath,
      "--output",
      "json",
    ],
    { encoding: "utf8", timeout: 30000, stdio: ["ignore", "pipe", "pipe"] },
  );
  const parsed = z
    .object({
      rows: z
        .array(
          z.object({
            evidence: z.object({ accountId: z.uuid(), sessionIds: z.array(z.uuid()) }),
          }),
        )
        .length(1),
    })
    .parse(JSON.parse(raw));
  assert.equal(parsed.rows[0].evidence.accountId, accountId);
  return parsed.rows[0].evidence;
}

async function main() {
  if (process.argv.includes("--selfcheck")) {
    for (const path of [
      "/auth/v1/token?grant_type=password",
      "/auth/v1/token?grant_type=refresh_token",
      "/auth/v1/logout?scope=local",
    ])
      assertTarget(origin + path, "POST");
    assertTarget(origin + "/auth/v1/user", "GET");
    for (const url of [
      origin + "/auth/v1/admin/users",
      origin + "/auth/v1/logout?scope=global",
      origin + "/rest/v1/profiles",
      "https://example.invalid/auth/v1/user",
    ])
      assert.throws(() => assertTarget(url, "POST"));
    console.log(
      "Session DEV E2E target self-check PASS; no credential or network access.",
    );
    return;
  }
  assert.equal(process.env.EXPO_PUBLIC_OTR_DEV_SUPABASE_URL, origin);
  execFileSync(
    "git",
    [
      "diff",
      "--exit-code",
      "HEAD",
      "--",
      "src/data/auth",
      "scripts/auth/session-dev-e2e.ts",
    ],
    { stdio: "ignore" },
  );
  const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();
  const runnerSha256 = createHash("sha256")
    .update(readFileSync(resolve("scripts/auth/session-dev-e2e.ts")))
    .digest("hex");
  if (existsSync(journalPath))
    assert.equal(
      JSON.parse(readFileSync(journalPath, "utf8")).closed,
      true,
      "Prior Auth execution is unresolved; reconcile it before another login.",
    );
  const stat = lstatSync(credentialPath);
  assert(stat.isFile() && !stat.isSymbolicLink() && (stat.mode & 0o777) === 0o600);
  const credential = z
    .object({
      project: z.literal(project),
      accountId: z.literal(accountId),
      email: z.literal("otr.forms.qa.20261025@example.invalid"),
      password: z.string().min(32),
    })
    .parse(JSON.parse(readFileSync(credentialPath, "utf8")));
  const before = sqlSnapshot();
  const requests: {
    method: string;
    route: string;
    status: number;
    requestId: string | null;
    errorCode: string | null;
  }[] = [];
  const guardedFetch: typeof fetch = async (input, init) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    assertTarget(url, method);
    const response = await fetch(input, {
      ...init,
      redirect: "error",
      signal: init?.signal ?? AbortSignal.timeout(15000),
    });
    let errorCode: string | null = null;
    if (!response.ok) {
      const body = z
        .object({ code: z.unknown().optional(), error_code: z.string().optional() })
        .safeParse(
          await response
            .clone()
            .json()
            .catch(() => null),
        );
      const candidate = body.success ? (body.data.error_code ?? body.data.code) : null;
      if (typeof candidate === "string" && /^[a-z_]{1,80}$/.test(candidate))
        errorCode = candidate;
    }
    requests.push({
      method,
      route: new URL(url).pathname + new URL(url).search,
      status: response.status,
      errorCode,
      requestId:
        response.headers.get("sb-request-id") ?? response.headers.get("x-request-id"),
    });
    return response;
  };
  const options = { fetchImplementation: guardedFetch };
  const entries = new Map<string, string>();
  const storage = {
    getItem: async (key: string) => entries.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      entries.set(key, value);
    },
    deleteItem: async (key: string) => {
      entries.delete(key);
    },
  };
  const repository = createAuthRepository(storage);
  let latest: LocalSession | null = null;
  let revoked = false;
  let revokeAttempted = false;
  let ownSessionId: string | null = null;
  let ownLogoutToken: string | null = null;
  function assertOwnSession(token: string) {
    const claims = z
      .object({ sub: z.literal(accountId), session_id: z.uuid() })
      .parse(JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString()));
    assert.equal(claims.session_id, ownSessionId);
    assert(!before.sessionIds.includes(claims.session_id));
  }
  let step = "LOGIN";
  writeFileSync(
    journalPath,
    JSON.stringify({
      closed: false,
      step,
      accountId,
      baselineSessionIds: before.sessionIds,
    }) + "\n",
    {
      mode: 0o600,
    },
  );
  try {
    latest = await authenticateToSupabaseDev(
      credential.email,
      credential.password,
      options,
    );
    assert.equal(latest.identity?.userId, accountId);
    assert(latest.accessToken && latest.refreshToken);
    const sessionId = z
      .uuid()
      .parse(
        JSON.parse(Buffer.from(latest.accessToken.split(".")[1], "base64url").toString())
          .session_id,
      );
    const subject = JSON.parse(
      Buffer.from(latest.accessToken.split(".")[1], "base64url").toString(),
    ).sub;
    assert.equal(subject, accountId);
    assert(!before.sessionIds.includes(sessionId));
    ownSessionId = sessionId;
    assertOwnSession(latest.accessToken);
    ownLogoutToken = latest.accessToken;
    writeFileSync(
      journalPath,
      JSON.stringify({
        closed: false,
        step: "SESSION_OBSERVED",
        accountId,
        ownSessionId,
        baselineSessionIds: before.sessionIds,
      }) + "\n",
      { mode: 0o600 },
    );
    assert(!before.sessionIds.includes(sessionId));
    await repository.writeLocalSession(latest);
    step = "INDEPENDENT_SELF_READ";
    async function selfRead(token: string) {
      const response = await guardedFetch(origin + "/auth/v1/user", {
        headers: {
          apikey: process.env.EXPO_PUBLIC_OTR_DEV_SUPABASE_PUBLISHABLE_KEY!,
          Authorization: `Bearer ${token}`,
        },
      });
      assert.equal(response.status, 200);
      const user = z
        .object({ id: z.literal(accountId), email: z.literal(credential.email) })
        .parse(await response.json());
      return user.id;
    }
    await selfRead(latest.accessToken);
    const afterLogin = sqlSnapshot();
    assert(afterLogin.sessionIds.includes(sessionId));
    for (const id of before.sessionIds) assert(afterLogin.sessionIds.includes(id));
    step = "REPOSITORY_RECONSTRUCTION";
    const cold = await createAuthRepository(storage).readLocalSession();
    assert.equal(cold?.identity?.userId, accountId);
    assert.equal(cold?.refreshToken, latest.refreshToken);
    let refreshRequests = 0;
    const accessToken = createSessionAccessTokenProvider({
      readSession: repository.readLocalSession,
      writeSession: async (session) => {
        latest = session;
        await repository.writeLocalSession(session);
      },
      refreshSession: (refresh, persistSession, identity) => {
        refreshRequests++;
        return refreshSupabaseDevSession(
          refresh,
          { ...options, persistSession },
          identity,
        );
      },
      now: Date.now,
    });
    step = "REFRESH";
    const tokens = await Promise.all(
      Array.from({ length: 5 }, () =>
        accessToken({ expectedUserId: accountId, forceRefresh: true }),
      ),
    );
    assert.equal(refreshRequests, 1);
    assertOwnSession(latest!.accessToken!);
    for (const value of tokens) assertOwnSession(value.token);
    ownLogoutToken = latest!.accessToken!;
    assert(
      tokens.every(
        (value) => value.userId === accountId && value.token === tokens[0].token,
      ),
    );
    await selfRead(tokens[0].token);
    step = "WRONG_ACCOUNT_NEGATIVE";
    await assert.rejects(
      accessToken({ expectedUserId: "00000000-0000-4000-8000-000000000001" }),
      (error) =>
        error instanceof Error &&
        "code" in error &&
        error.code === "AUTH_CONTEXT_CHANGED",
    );
    const refreshToReject = latest!.refreshToken!;
    step = "OWN_SESSION_LOGOUT";
    const coordinator = createAccountSwitchCoordinator({
      pauseSync: async () => {},
      assertLogoutAllowed: async () => {},
      restartSync: async () => {},
      readSession: repository.readLocalSession,
      writeSession: repository.writeLocalSession,
      clearSession: repository.clearLocalSession,
      selectAccount: repository.selectAccount,
      adoptLocalState: async () => {},
      clearInMemoryState: () => {},
      bootstrapAccount: async () => {},
      revokeSession: async (_session, context) => {
        const token = await accessToken({ expectedUserId: context.accountId });
        assertOwnSession(token.token);
        revokeAttempted = true;
        await revokeSupabaseDevSession(token.token, options);
        revoked = true;
      },
    });
    await coordinator.logout();
    assert.equal(await repository.readLocalSession(), null);
    assert.equal(
      (await createAuthRepository(storage).readLocalAuthSnapshot()).principal.kind,
      "SIGNED_OUT",
    );
    step = "REVOKED_REFRESH_NEGATIVE";
    await assert.rejects(
      refreshSupabaseDevSession(
        refreshToReject,
        {
          ...options,
          persistSession: async () => {
            throw new Error("Revoked refresh must not persist");
          },
        },
        latest!.identity,
      ),
      (error) =>
        error instanceof SupabaseDevAuthError && error.kind === "invalid_session",
    );
    step = "INDEPENDENT_SESSION_READBACK";
    const afterLogout = sqlSnapshot();
    assert(!afterLogout.sessionIds.includes(sessionId));
    for (const id of before.sessionIds) assert(afterLogout.sessionIds.includes(id));
    const receipt = {
      scope: "HOST_ONLY_NORMAL_PASSWORD_SESSION_NOT_OTP_OR_NATIVE",
      sourceCommit,
      runnerSha256,
      observedAt: new Date().toISOString(),
      projectRef: project,
      accountId,
      ownSessionId: sessionId,
      normalLogin: "PASS",
      independentAuthUserRead: "PASS",
      independentSessionPresentThenAbsent: "PASS",
      baselineSessionsPreserved: before.sessionIds.length,
      repositoryReconstruction: "PASS_MEMORY_STORAGE_ONLY",
      nativeKeychainColdStart: "NOT_TESTED",
      parallelRefreshRequests: 5,
      actualRefreshDispatches: refreshRequests,
      wrongAccountExpectedId: "DENIED",
      localSignoutRestore: "SIGNED_OUT",
      revokedRefresh: "DENIED",
      accessJwtImmediateInvalidation: "NOT_ASSERTED",
      otherDeviceSessionOrKeychainRead: false,
      businessWriteOrGateChange: false,
      requests,
    };
    writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + "\n");
    writeFileSync(
      journalPath,
      JSON.stringify({ closed: true, step: "PASS", accountId, ownSessionId: sessionId }) +
        "\n",
      { mode: 0o600 },
    );
    console.log(
      "Normal Session DEV E2E PASS; sanitized receipt saved; no native/OTP claim.",
    );
  } catch {
    let cleanup = false;
    if (!revokeAttempted && ownLogoutToken) {
      try {
        assertOwnSession(ownLogoutToken);
        revokeAttempted = true;
        await revokeSupabaseDevSession(ownLogoutToken, options);
        revoked = true;
        const observed = sqlSnapshot();
        cleanup =
          !observed.sessionIds.includes(ownSessionId!) &&
          before.sessionIds.every((id) => observed.sessionIds.includes(id));
      } catch {
        /* Unknown revocation remains unresolved in the private operator receipt. */
      }
    }
    writeFileSync(
      journalPath,
      JSON.stringify({
        closed: cleanup,
        step,
        accountId,
        ownSessionId,
        logoutAcknowledged: revoked,
        independentCleanupAbsence: cleanup,
        requests,
        revokeAttempted,
        baselineSessionIds: before.sessionIds,
      }) + "\n",
      { mode: 0o600 },
    );
    console.error(
      `Session DEV E2E stopped at ${step}; own-session cleanup=${cleanup}; no raw error retained.`,
    );
    process.exitCode = 1;
  } finally {
    entries.clear();
    latest = null;
    ownLogoutToken = null;
  }
}
void main().catch(() => {
  console.error(
    "Session DEV E2E stopped; inspect the sanitized operator journal; no private error retained.",
  );
  process.exitCode = 1;
});
