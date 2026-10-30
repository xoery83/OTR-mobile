import { execFileSync } from "node:child_process";
import { randomUUID, createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import {
  createAuthRepository,
  type SecureSessionStorage,
} from "../../src/data/auth/authSessionRepository";
import type { LocalSession } from "../../src/domain/auth/localSession";
import {
  requestSupabaseDevEmailOtp,
  verifySupabaseDevEmailOtp,
  revokeSupabaseDevSession,
  refreshSupabaseDevSession,
  SupabaseDevAuthError,
} from "../../src/data/auth/devSupabaseAuth";
import {
  createRequestBoundary,
  readBoundedJson,
} from "../../src/data/api/requestBoundary";
import { publicConfiguration, inboundKeychainArgs } from "./resend-inbound-otp-e2e";
import { createAcceptedHostQaReceiver } from "./resend-inbound-otp-native-relogin";
import { createQaSessionRevoker } from "./otp-test-cleanup";
import { OtpQaError } from "./resend-inbound-otp";

export const registeredHostQa = Object.freeze({
  accountId: "1f3d7935-1bdc-4952-8d7f-0f72077368c1",
  tripId: "eb3a3e70-fe4d-4cff-81f8-9945bc804f28",
  email: "otr-qa-fde969f2-2dc5-4a33-83a1-268ac5fd6424@eldouzileu.resend.app",
  createdAt: "2026-10-30T00:09:11.910404Z",
});
type Receiver = ReturnType<typeof createAcceptedHostQaReceiver>;
export type RegisteredQaHostContext = Readonly<{
  accountId: string;
  tripId: string;
  readSession(): Promise<LocalSession>;
}>;
const userSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  created_at: z.string(),
  email_confirmed_at: z.string(),
  is_anonymous: z.literal(false),
});
function requireQa(ok: unknown, code: string): asserts ok {
  if (!ok) throw new OtpQaError(code);
}

// Injected normal Auth/Receiving IO is only for host tests. No session is returned
// outside the action scope, and no callback result is serialized by this helper.
export async function runRegisteredQaHostSession(
  deps: {
    receiver: Receiver;
    request(email: string): Promise<void>;
    verify(email: string, code: string): Promise<LocalSession>;
    readUser(session: LocalSession): Promise<unknown>;
    revoke(token: string): Promise<void>;
    isRevoked(session: LocalSession): Promise<boolean>;
    note(value: Record<string, unknown>): void;
  },
  action: (context: RegisteredQaHostContext) => Promise<void>,
) {
  const values = new Map<string, string>();
  const storage: SecureSessionStorage = {
    getItem: async (k) => values.get(k) ?? null,
    setItem: async (k, v) => {
      values.set(k, v);
    },
    deleteItem: async (k) => {
      values.delete(k);
    },
  };
  const repo = createAuthRepository(storage),
    revoker = createQaSessionRevoker(deps.revoke);
  let session: LocalSession | undefined,
    active = false,
    failed = false,
    completed = false,
    clean = false;
  const lease = deps.receiver.createChallenge();
  requireQa(lease.email === registeredHostQa.email, "REGISTERED_HOST_CASE_MISMATCH");
  deps.note({
    phase: "OTP_REQUEST_ATTEMPTED",
    requestedAt: lease.requestedAt,
    otpRequestAttempts: 1,
  });
  try {
    await deps.request(lease.email);
    const message = await deps.receiver.waitForOtp(lease);
    deps.note({
      phase: "OTP_RECEIVED",
      messageId: message.messageId,
      receivedAt: message.receivedAt,
    });
    try {
      session = await deps.verify(lease.email, message.code);
    } finally {
      message.code = "";
    }
    requireQa(
      session.accessToken && session.refreshToken,
      "REGISTERED_HOST_SESSION_INVALID",
    );
    const user = userSchema.safeParse(await deps.readUser(session));
    requireQa(
      user.success &&
        user.data.id === registeredHostQa.accountId &&
        user.data.email.toLowerCase() === registeredHostQa.email &&
        Date.parse(user.data.created_at) === Date.parse(registeredHostQa.createdAt) &&
        Number.isFinite(Date.parse(user.data.email_confirmed_at)) &&
        session.identity?.userId === registeredHostQa.accountId,
      "REGISTERED_HOST_IDENTITY_UNPROVEN",
    );
    revoker.bindProvenToken(session.accessToken);
    await repo.writeLocalSession(session);
    active = true;
    deps.note({
      phase: "HOST_IDENTITY_VERIFIED",
      accountId: registeredHostQa.accountId,
      tripId: registeredHostQa.tripId,
    });
    await action(
      Object.freeze({
        accountId: registeredHostQa.accountId,
        tripId: registeredHostQa.tripId,
        async readSession() {
          requireQa(active, "REGISTERED_HOST_SCOPE_RELEASED");
          const current = await repo.readAdoptedLocalSession();
          requireQa(
            current?.identity?.userId === registeredHostQa.accountId,
            "REGISTERED_HOST_IDENTITY_UNPROVEN",
          );
          requireQa(active, "REGISTERED_HOST_SCOPE_RELEASED");
          return current!;
        },
      }),
    );
    completed = true;
    deps.note({ phase: "HOST_ACTION_COMPLETED" });
  } catch {
    failed = true;
    deps.note({
      phase: "HOST_RUN_FAILED_NO_AUTOMATIC_RETRY",
      actionOutcome: completed ? "COMPLETED" : "UNCONFIRMED_QUERY_OWNING_RECEIPT",
    });
  } finally {
    active = false;
    const revoked = await revoker.cleanupIfUnattempted();
    if (revoked && session) {
      try {
        clean = await deps.isRevoked(session);
      } catch {
        /* UNKNOWN is retained. */
      }
    }
    if (clean) {
      await repo.clearLocalSession();
      values.clear();
    }
    deps.note({
      phase: "HOST_SESSION_CLEANUP",
      ownSessionCleanup: clean
        ? "PASS_LOCAL_SCOPE_REFRESH_REVOKED"
        : "UNKNOWN_OR_UNPROVEN_NO_RETRY",
      actionCompleted: completed,
    });
  }
  if (!clean) throw new OtpQaError("REGISTERED_HOST_CLEANUP_UNRESOLVED");
  if (failed) throw new OtpQaError("REGISTERED_HOST_ACTION_FAILED");
  return Object.freeze({
    status: "PASS",
    accountId: registeredHostQa.accountId,
    tripId: registeredHostQa.tripId,
    ownSessionCleanup: "PASS_LOCAL_SCOPE_REFRESH_REVOKED",
  });
}

// Only the registered DEV QA case. Importing this file performs no IO. The caller
// must first hold the coordinated DEV business window; this flag grants no authority.
export async function withRegisteredQaHostSession(
  action: (context: RegisteredQaHostContext) => Promise<void>,
) {
  const options = { ...publicConfiguration(process.env), allowRegistration: false };
  requireQa(
    process.env.OTR_QA_RESEND_SCOPE === "dedicated-qa-team" &&
      process.env.OTR_QA_DEV_BUSINESS_WINDOW === "HELD",
    "REGISTERED_HOST_WINDOW_REQUIRED",
  );
  const proof = JSON.parse(
    readFileSync("docs/ops/auth-phase2-20261028/NATIVE_NEW_ACCOUNT_E2E.json", "utf8"),
  );
  requireQa(
    proof.status === "NATIVE_FRESH_ACCOUNT_FIRST_USE_PASS_AUTH_ARTIFACTS_VERIFIED" &&
      proof.accountId === registeredHostQa.accountId &&
      proof.tripId === registeredHostQa.tripId,
    "REGISTERED_HOST_CASE_UNPROVEN",
  );
  const first = JSON.parse(
    readFileSync("docs/ops/auth-inbound-otp-20261030/FIRST_USER_E2E.json", "utf8"),
  );
  requireQa(
    first.status === "PASS" && first.reuseReleased === true,
    "FIRST_USER_PROOF_REQUIRED",
  );
  for (const name of [
    "resend-inbound-otp.ts",
    "resend-inbound-otp-e2e.ts",
    "otp-test-vault.ts",
    "otp-test-cleanup.ts",
  ])
    requireQa(
      first.toolHashes?.[name] ===
        createHash("sha256")
          .update(readFileSync(`scripts/auth/${name}`))
          .digest("hex"),
      "FIRST_USER_PROOF_CODE_CHANGED",
    );
  const parent = "/private/tmp/otr-hosted-otp-qa";
  const base = join(parent, "registered-native04");
  for (const path of [parent, base]) {
    if (!existsSync(path)) mkdirSync(path, { mode: 0o700 });
    const st = lstatSync(path);
    requireQa(
      st.isDirectory() &&
        !st.isSymbolicLink() &&
        st.uid === process.getuid?.() &&
        (st.mode & 0o777) === 0o700,
      "REGISTERED_HOST_DIRECTORY_UNSAFE",
    );
  }
  const lock = join(base, "active.lock");
  try {
    mkdirSync(lock, { mode: 0o700 });
  } catch {
    throw new OtpQaError("REGISTERED_HOST_UNRESOLVED_OR_CONCURRENT_RUN");
  }
  const directory = mkdtempSync(join(base, "run-")),
    runId = randomUUID(),
    journal = join(directory, "run.json");
  const record: Record<string, unknown> = {
    runId,
    scope: "REGISTERED_QA_HOST_SESSION",
    accountId: registeredHostQa.accountId,
    tripId: registeredHostQa.tripId,
    secretsOrOtpRecorded: false,
  };
  let clean = false,
    requestAttempted = false;
  const note = (value: Record<string, unknown>) => {
    if (value.phase === "OTP_REQUEST_ATTEMPTED") requestAttempted = true;
    Object.assign(record, value);
    clean = value.ownSessionCleanup === "PASS_LOCAL_SCOPE_REFRESH_REVOKED" || clean;
    writeFileSync(journal, JSON.stringify(record, null, 2) + "\n", { mode: 0o600 });
  };
  try {
    let key = process.env.OTR_QA_RESEND_API_KEY;
    if (!key) {
      try {
        key = execFileSync("/usr/bin/security", [...inboundKeychainArgs], {
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
          timeout: 15000,
        }).trim();
      } catch {
        throw new OtpQaError("RECEIVING_CREDENTIAL_REQUIRED");
      }
    }
    const receiver = createAcceptedHostQaReceiver({
      key,
      scope: "dedicated-qa-team",
      reserve(value) {
        const previous = join(base, "last-request.json");
        if (existsSync(previous)) {
          const st = lstatSync(previous);
          requireQa(
            st.isFile() &&
              !st.isSymbolicLink() &&
              st.uid === process.getuid?.() &&
              (st.mode & 0o777) === 0o600,
            "REGISTERED_HOST_DIRECTORY_UNSAFE",
          );
          const last = JSON.parse(readFileSync(previous, "utf8"));
          requireQa(
            Number.isFinite(Date.parse(last.requestedAt)) &&
              Date.now() - Date.parse(last.requestedAt) >= 60000,
            "REGISTERED_HOST_COOLDOWN",
          );
        }
        note({ phase: "CHALLENGE_RESERVED_BEFORE_NORMAL_HOST_SEND", ...value });
        writeFileSync(previous, JSON.stringify(value) + "\n", { mode: 0o600 });
      },
    });
    const result = await runRegisteredQaHostSession(
      {
        receiver,
        note,
        request: (email) => requestSupabaseDevEmailOtp(email, options),
        verify: (email, code) => verifySupabaseDevEmailOtp(email, code, options),
        readUser: async (session) => {
          const boundary = createRequestBoundary(10000);
          try {
            const response = await boundary.run(() =>
              fetch(`${options.url}/auth/v1/user`, {
                method: "GET",
                redirect: "error",
                signal: boundary.signal,
                headers: {
                  apikey: options.publishableKey,
                  Authorization: `Bearer ${session.accessToken}`,
                },
              }),
            );
            if (!response.ok) {
              await response.body?.cancel();
              throw new OtpQaError("REGISTERED_HOST_IDENTITY_UNPROVEN");
            }
            return await readBoundedJson(response, 262144, boundary);
          } finally {
            boundary.close();
          }
        },
        revoke: (token) => revokeSupabaseDevSession(token, options),
        isRevoked: async (session) => {
          requireQa(session.refreshToken, "REGISTERED_HOST_SESSION_INVALID");
          try {
            await refreshSupabaseDevSession(
              session.refreshToken,
              options,
              session.identity,
            );
            return false;
          } catch (error) {
            return (
              error instanceof SupabaseDevAuthError && error.kind === "invalid_session"
            );
          }
        },
      },
      action,
    );
    note({ status: "PASS" });
    return { ...result, runId, journal };
  } catch {
    note({ status: "FAILED_OR_UNKNOWN_NO_AUTOMATIC_RETRY" });
    throw new OtpQaError("REGISTERED_HOST_RUN_FAILED");
  } finally {
    if (clean || !requestAttempted) rmSync(lock, { recursive: true });
  }
}
