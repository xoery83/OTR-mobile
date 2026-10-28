import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import {
  requestSupabaseDevEmailOtp,
  verifySupabaseDevEmailOtp,
  refreshSupabaseDevSession,
  revokeSupabaseDevSession,
  SupabaseDevAuthError,
} from "../../src/data/auth/devSupabaseAuth";
import { createAuthRepository } from "../../src/data/auth/authSessionRepository";

// Exercise the real application transport against one isolated local Auth authority.
let local: {
  API_URL: string;
  MAILPIT_URL: string;
  PUBLISHABLE_KEY?: string;
  ANON_KEY: string;
};
const nominalOrigin = "https://tuqigdxrvrerfewsxqgm.supabase.co";
const results: Record<string, unknown> = {
  runId: randomUUID(),
  observedAt: new Date().toISOString(),
  scope: "ISOLATED_LOCAL_SUPABASE_MAILPIT_NOT_HOSTED_DEV_OR_NATIVE",
  serverGeneratedOtp: true,
  secretsOrOtpRecorded: false,
};
let step = "configuration";
const verifiedAccountIds: string[] = [];
const receiptPath = "docs/ops/auth-phase1-20261028/EMAIL_OTP_MAILPIT_E2E.json";
const writeReceipt = () =>
  writeFileSync(receiptPath, JSON.stringify(results, null, 2) + "\n");
function localFetch(input: string, init?: RequestInit) {
  const url = new URL(input);
  assert([local.API_URL, local.MAILPIT_URL].includes(url.origin));
  return fetch(input, {
    ...init,
    redirect: "error",
    signal: init?.signal
      ? AbortSignal.any([init.signal, AbortSignal.timeout(5000)])
      : AbortSignal.timeout(5000),
  });
}
const options = {
  url: nominalOrigin,
  get publishableKey() {
    return local.PUBLISHABLE_KEY ?? local.ANON_KEY;
  },
  fetchImplementation: (async (input, init) => {
    const url = new URL(String(input));
    assert.equal(url.origin, nominalOrigin);
    assert(url.pathname.startsWith("/auth/v1/"));
    return localFetch(local.API_URL + url.pathname + url.search, init);
  }) as typeof fetch,
  persistSession: async () => assert.fail("provisional flow cannot install Session"),
};
async function codeFor(email: string, previous = new Set<string>()) {
  for (let attempt = 0; attempt < 40; attempt++) {
    const response = await localFetch(`${local.MAILPIT_URL}/api/v1/messages`);
    assert(response.ok);
    const list = await response.json();
    const found = list.messages?.find(
      (message: { ID: string; To: { Address: string }[] }) =>
        !previous.has(message.ID) && message.To?.some((to) => to.Address === email),
    );
    if (found) {
      const body = await localFetch(
        `${local.MAILPIT_URL}/api/v1/message/${encodeURIComponent(found.ID)}`,
      ).then((value) => value.json());
      assert(!String(body.HTML).includes(".ConfirmationURL"));
      assert(!String(body.HTML).includes("/auth/v1/verify?"));
      const code = String(body.Text || body.HTML).match(/\b\d{6}\b/)?.[0];
      assert(code, "mail must contain a real generated six-digit OTP");
      previous.add(found.ID);
      return code;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  assert.fail("Mailpit delivery timed out");
}
async function rejectedCode(email: string, code: string) {
  await assert.rejects(
    verifySupabaseDevEmailOtp(email, code, options),
    (error) => error instanceof SupabaseDevAuthError && error.kind === "invalid_code",
  );
}
async function self(accessToken: string) {
  const response = await localFetch(`${local.API_URL}/auth/v1/user`, {
    headers: { apikey: options.publishableKey, Authorization: `Bearer ${accessToken}` },
  });
  assert(response.ok);
  return response.json();
}

async function main() {
  try {
    results.status = "RUNNING";
    writeReceipt();
    local = JSON.parse(
      readFileSync("/private/tmp/otr-auth-mailpit-20261028/status.private.json", "utf8"),
    );
    assert.equal(local.API_URL, "http://127.0.0.1:54331");
    assert.equal(local.MAILPIT_URL, "http://127.0.0.1:54334");
    results.runnerSHA256 = createHash("sha256")
      .update(readFileSync("scripts/auth/mailpit-otp-e2e.ts"))
      .digest("hex");
    const emailA = `otr-otp-a-${randomUUID()}@example.invalid`;
    const emailB = `otr-otp-b-${randomUUID()}@example.invalid`;
    step = "new-user-delivery";
    await requestSupabaseDevEmailOtp(emailA, options);
    const messagesA = new Set<string>();
    const codeA = await codeFor(emailA, messagesA);
    results.newUserOtpDelivery = "PASS";
    step = "wrong-code";
    const wrong = `${codeA[0] === "9" ? "0" : "9"}${codeA.slice(1)}`;
    await rejectedCode(emailA, wrong);
    results.wrongCodeRejected = "PASS";
    step = "verification";
    const a = await verifySupabaseDevEmailOtp(emailA, codeA, options);
    assert(a.identity?.userId);
    assert(a.accessToken);
    verifiedAccountIds.push(a.identity.userId);
    assert.equal((await self(a.accessToken)).id, a.identity.userId);
    results.normalOtpVerificationAndSelfRead = "PASS";
    step = "replay";
    await rejectedCode(emailA, codeA);
    results.usedOtpReplayRejected = "PASS";
    step = "repository-restore";
    const memory = new Map<string, string>();
    const storage = {
      getItem: async (key: string) => memory.get(key) ?? null,
      setItem: async (key: string, value: string) => {
        memory.set(key, value);
      },
      deleteItem: async (key: string) => {
        memory.delete(key);
      },
    };
    await createAuthRepository(storage).writeLocalSession(a);
    const repo = createAuthRepository(storage);
    assert.equal(
      (await repo.readAdoptedLocalSession())?.identity?.userId,
      a.identity.userId,
    );
    results.memoryRepositoryReconstruction = "PASS_NOT_NATIVE_KEYCHAIN_COLD_START";
    step = "second-account";
    await requestSupabaseDevEmailOtp(emailB, options);
    const b = await verifySupabaseDevEmailOtp(emailB, await codeFor(emailB), options);
    assert(b.identity?.userId);
    assert(b.accessToken);
    verifiedAccountIds.push(b.identity.userId);
    assert.notEqual(a.identity.userId, b.identity.userId);
    assert.equal((await self(b.accessToken)).id, b.identity.userId);
    await repo.writeLocalSession(b);
    assert.equal(
      (await repo.readAdoptedLocalSession())?.identity?.userId,
      b.identity.userId,
    );
    results.distinctAccountIdsAndPrivateSessionSelection = "PASS";
    step = "refresh";
    const refreshed = await refreshSupabaseDevSession(
      b.refreshToken!,
      { ...options, persistSession: async () => {} },
      b.identity,
    );
    assert.equal(refreshed.identity?.userId, b.identity.userId);
    assert(refreshed.accessToken);
    results.refresh = "PASS";
    step = "current-session-logout";
    await revokeSupabaseDevSession(refreshed.accessToken, options);
    await assert.rejects(
      refreshSupabaseDevSession(refreshed.refreshToken!, options, refreshed.identity),
      (error) =>
        error instanceof SupabaseDevAuthError && error.kind === "invalid_session",
    );
    await repo.clearLocalSession();
    assert.equal(await repo.readAdoptedLocalSession(), null);
    assert(await repo.selectAccount(a.identity.userId));
    assert.equal(
      (await repo.readAdoptedLocalSession())?.identity?.userId,
      a.identity.userId,
    );
    results.logoutRefreshRejectionAndRememberedAccountRestore = "PASS";
    step = "other-session-preserved";
    const activeA = await refreshSupabaseDevSession(
      a.refreshToken!,
      { ...options, persistSession: async () => {} },
      a.identity,
    );
    assert.equal(activeA.identity?.userId, a.identity.userId);
    assert(activeA.accessToken);
    await revokeSupabaseDevSession(activeA.accessToken, options);
    results.otherAccountSessionPreservedAndOwnTestSessionCleanup = "PASS";
    step = "existing-user-otp";
    // The isolated fixture permits one request per second; do not bypass throttling.
    await new Promise((resolve) => setTimeout(resolve, 1100));
    await requestSupabaseDevEmailOtp(emailA, options);
    const existing = await verifySupabaseDevEmailOtp(
      emailA,
      await codeFor(emailA, messagesA),
      options,
    );
    assert.equal(existing.identity?.userId, a.identity.userId);
    assert(existing.accessToken);
    await revokeSupabaseDevSession(existing.accessToken, options);
    results.existingUserOtpReturnsSameCanonicalAccount = "PASS";
    results.ownSessionCleanup = "PASS_NORMAL_CURRENT_SESSION_LOGOUT";
    results.localSyntheticAccountIds = verifiedAccountIds;
    results.status = "PASS";
    writeReceipt();
    console.log(JSON.stringify(results));
  } catch (error) {
    results.status = "FAIL";
    results.failedAt = step;
    results.localSyntheticAccountIds = verifiedAccountIds;
    results.ownSessionCleanup = "PENDING_ISOLATED_PROJECT_ONLY_NO_UNKNOWN_RETRY";
    writeReceipt();
    console.error(
      JSON.stringify({
        failedAt: step,
        kind:
          error instanceof SupabaseDevAuthError ? error.kind : "assertion_or_transport",
        status: error instanceof SupabaseDevAuthError ? error.status : undefined,
      }),
    );
    process.exitCode = 1;
  }
}
void main();
