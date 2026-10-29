import { execFileSync, spawn } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { resolve, join, basename } from "node:path";
import { z } from "zod";
import { createAuthRepository } from "../../src/data/auth/authSessionRepository";
import {
  requestSupabaseDevEmailOtp,
  verifySupabaseDevEmailOtp,
  refreshSupabaseDevSession,
  revokeSupabaseDevSession,
  SupabaseDevAuthError,
} from "../../src/data/auth/devSupabaseAuth";
import { tripDiscoveryPageSchema } from "../../src/domain/trip/tripDiscoveryContract";
import {
  createRequestBoundary,
  readBoundedJson,
} from "../../src/data/api/requestBoundary";
import type { LocalSession } from "../../src/domain/auth/localSession";
import { createResendQaReceiver, OtpQaError } from "./resend-inbound-otp";
import { createOtpTestVault } from "./otp-test-vault";
import { createQaSessionRevoker } from "./otp-test-cleanup";

export const devOrigin = "https://tuqigdxrvrerfewsxqgm.supabase.co";
const backendOrigin = "https://api-dev.xoery.art";
const reportPath = resolve("docs/ops/auth-inbound-otp-20261030/FIRST_USER_E2E.json");
const knownAccounts = [
  "3f7e964e-79d3-4028-a585-470e798e41ec",
  "38e4c610-4a53-4bd2-976e-42de679a8f9b",
  "4ebd0cbd-6fbb-41fb-8322-7eca5a563cb4",
  "f4b059c5-8241-4ffb-aa15-37fa25474543",
];
const foreignQaTrip = "a788cb44-fbde-43b7-8bdf-c89cb940cec9";
function requireTrue(value: unknown, code: string): asserts value {
  if (!value) throw new OtpQaError(code);
}
export function publicConfiguration(env: NodeJS.ProcessEnv) {
  requireTrue(
    env.OTR_DEV_OTP_TEST === "1" && env.EXPO_PUBLIC_OTR_DEV_SUPABASE_URL === devOrigin,
    "DEV_ONLY_CONFIGURATION_REQUIRED",
  );
  const key = env.EXPO_PUBLIC_OTR_DEV_SUPABASE_PUBLISHABLE_KEY ?? "";
  if (!key.startsWith("sb_publishable_")) {
    let claims: { role?: string; ref?: string } = {};
    try {
      claims = JSON.parse(Buffer.from(key.split(".")[1], "base64url").toString("utf8"));
    } catch {
      /* Reject below. */
    }
    requireTrue(
      claims.role === "anon" && claims.ref === "tuqigdxrvrerfewsxqgm",
      "PUBLIC_ANON_KEY_REQUIRED",
    );
  }
  requireTrue(
    key.length > 30 && !key.startsWith("sb_secret_"),
    "PUBLIC_ANON_KEY_REQUIRED",
  );
  return { url: devOrigin, publishableKey: key, persistSession: async () => undefined };
}
async function jsonRead(response: Response) {
  const boundary = createRequestBoundary(10000);
  try {
    return await readBoundedJson(response, 262144, boundary);
  } finally {
    boundary.close();
  }
}
async function self(accessToken: string, publicKey: string) {
  const response = await fetch(`${devOrigin}/auth/v1/user`, {
    redirect: "error",
    signal: AbortSignal.timeout(10000),
    headers: { apikey: publicKey, Authorization: `Bearer ${accessToken}` },
  });
  requireTrue(response.ok, "NORMAL_SESSION_READ_FAILED");
  return z
    .object({
      id: z.uuid(),
      email: z.string(),
      is_anonymous: z.literal(false),
      created_at: z.string(),
      email_confirmed_at: z.string(),
    })
    .parse(await jsonRead(response));
}
async function coldChild() {
  const input = JSON.parse(readFileSync(3, "utf8"));
  const repo = createAuthRepository(
    createOtpTestVault(input.directory, Buffer.from(input.key, "base64")),
  );
  const session = await repo.readAdoptedLocalSession();
  requireTrue(
    session?.accessToken && session.identity?.userId === input.accountId,
    "COLD_RESTORE_IDENTITY_FAILED",
  );
  const user = await self(session.accessToken, input.publicKey);
  requireTrue(user.id === input.accountId, "COLD_SESSION_SERVER_READ_FAILED");
  process.stdout.write(JSON.stringify({ accountId: user.id, restored: true }));
}
async function coldRestore(
  directory: string,
  key: Buffer,
  accountId: string,
  publicKey: string,
) {
  const child = spawn(
    process.execPath,
    ["--import", "tsx", resolve(process.argv[1]), "--cold-child"],
    {
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        TMPDIR: process.env.TMPDIR,
        NODE_ENV: process.env.NODE_ENV ?? "test",
      },
      stdio: ["ignore", "pipe", "pipe", "pipe"],
    },
  );
  // No Receiving key, Session token or vault key in child argv/environment/stdout.
  child.stdio[3]!.on("error", () => undefined);
  (child.stdio[3] as NodeJS.WritableStream).end(
    JSON.stringify({ directory, key: key.toString("base64"), accountId, publicKey }),
  );
  let output = "";
  child.stdout!.on("data", (part) => {
    output += part;
    if (output.length > 1024) child.kill();
  });
  child.stderr!.resume();
  const timer = setTimeout(() => child.kill(), 20000);
  try {
    await new Promise<void>((done, reject) => {
      child.once("error", () => reject(new OtpQaError("COLD_PROCESS_FAILED")));
      child.once("exit", (code) =>
        code === 0 ? done() : reject(new OtpQaError("COLD_PROCESS_FAILED")),
      );
    });
  } finally {
    clearTimeout(timer);
  }
  requireTrue(JSON.parse(output).accountId === accountId, "COLD_PROCESS_IDENTITY_FAILED");
}
export const inboundKeychainArgs = [
  "find-generic-password",
  "-s",
  "OTR_QA_RESEND_API_KEY",
  "-a",
  "resend",
  "-l",
  "OTR-QA-Inbound",
  "-w",
] as const;
function readReceivingKey(keychain: boolean) {
  let receivingKey = process.env.OTR_QA_RESEND_API_KEY;
  if (!receivingKey && keychain) {
    try {
      receivingKey = execFileSync("/usr/bin/security", [...inboundKeychainArgs], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 15000,
      }).trim();
    } catch {
      throw new OtpQaError("RECEIVING_CREDENTIAL_REQUIRED");
    }
  }
  requireTrue(receivingKey, "RECEIVING_CREDENTIAL_REQUIRED");
  return receivingKey;
}
// Lane-facing entry stays closed until the actual first-user proof matches this code.
export function openReleasedQaReceiver(options: { keychain?: boolean } = {}) {
  publicConfiguration(process.env);
  requireTrue(
    process.env.OTR_QA_RESEND_SCOPE === "dedicated-qa-team",
    "RECEIVING_SCOPE_REQUIRED",
  );
  let proof: Record<string, unknown>;
  try {
    proof = JSON.parse(readFileSync(reportPath, "utf8"));
  } catch {
    throw new OtpQaError("FIRST_USER_PROOF_REQUIRED");
  }
  requireTrue(
    proof.status === "PASS" &&
      proof.reuseReleased === true &&
      proof.normalOtpVerification === "PASS" &&
      proof.logout === "PASS_CURRENT_SESSION_ONLY_REFRESH_REVOKED",
    "FIRST_USER_PROOF_REQUIRED",
  );
  const hashes = proof.toolHashes as Record<string, string> | undefined;
  for (const name of [
    "resend-inbound-otp.ts",
    "resend-inbound-otp-e2e.ts",
    "otp-test-vault.ts",
    "otp-test-cleanup.ts",
  ])
    requireTrue(
      hashes?.[name] ===
        createHash("sha256")
          .update(readFileSync(resolve("scripts/auth", name)))
          .digest("hex"),
      "FIRST_USER_PROOF_CODE_CHANGED",
    );
  return createResendQaReceiver({
    key: readReceivingKey(options.keychain ?? false),
    scope: process.env.OTR_QA_RESEND_SCOPE,
  });
}
export async function main() {
  if (process.argv.includes("--cold-child")) {
    await coldChild();
    return;
  }
  requireTrue(process.argv.includes("--e2e"), "FIRST_E2E_MODE_REQUIRED");
  const options = publicConfiguration(process.env);
  requireTrue(
    process.env.OTR_QA_RESEND_SCOPE === "dedicated-qa-team",
    "RECEIVING_SCOPE_REQUIRED",
  );
  const receivingKey = readReceivingKey(process.argv.includes("--keychain"));
  if (existsSync(reportPath)) {
    const prior = JSON.parse(readFileSync(reportPath, "utf8"));
    requireTrue(prior.status !== "PASS", "FIRST_USER_PROOF_ALREADY_COMPLETE");
  }
  const receiver = createResendQaReceiver({
    key: receivingKey,
    scope: process.env.OTR_QA_RESEND_SCOPE!,
  });
  await receiver.checkPermission(); // No new Account/OTP before actual read permission succeeds.
  const lease = receiver.createMailbox(),
    runId = randomUUID();
  const base = "/private/tmp/otr-hosted-otp-qa";
  if (!existsSync(base)) mkdirSync(base, { mode: 0o700 });
  const baseInfo = lstatSync(base);
  requireTrue(
    baseInfo.isDirectory() &&
      !baseInfo.isSymbolicLink() &&
      (baseInfo.mode & 0o777) === 0o700 &&
      baseInfo.uid === process.getuid?.(),
    "RUN_DIRECTORY_UNSAFE",
  );
  const lock = join(base, "active.lock");
  try {
    mkdirSync(lock, { mode: 0o700 });
  } catch {
    throw new OtpQaError("UNRESOLVED_OR_CONCURRENT_RUN");
  }
  const directory = mkdtempSync(join(base, "run-")),
    vaultKey = randomBytes(32);
  const journal = join(directory, "run.json");
  const result: Record<string, unknown> = {
    status: "RUNNING",
    runId,
    email: lease.email,
    requestedAt: lease.requestedAt,
    projectRef: "tuqigdxrvrerfewsxqgm",
    scope: "HOSTED_DEV_FIRST_OTP_USER_HOST_PROCESS_RECOVERY_NOT_NATIVE",
    secretsOrOtpRecorded: false,
    receivingBoundary: "OWNER_CONFIRMED_DEDICATED_QA_TEAM_KEY_REMAINS_FULL_ACCESS",
  };
  const save = () => {
    result.phase = stage;
    writeFileSync(journal, JSON.stringify(result, null, 2) + "\n", { mode: 0o600 });
  };
  let session: LocalSession | undefined,
    sent = false,
    cleanup = false;
  const revoker = createQaSessionRevoker((token) =>
    revokeSupabaseDevSession(token, options),
  );
  let stage = "reserve";
  save();
  try {
    stage = "request";
    sent = true;
    result.otpRequestAttempts = 1;
    save();
    await requestSupabaseDevEmailOtp(lease.email, options);
    stage = "receive";
    result.requestAccepted = true;
    save();
    const message = await receiver.waitForOtp(lease);
    result.receivedAt = message.receivedAt;
    result.receivingMessageId = message.messageId;
    stage = "verify";
    save();
    session = await verifySupabaseDevEmailOtp(lease.email, message.code, options);
    requireTrue(
      session.accessToken && session.refreshToken && session.identity,
      "VERIFIED_SESSION_REQUIRED",
    );
    const user = await self(session.accessToken, options.publishableKey);
    requireTrue(
      user.id === session.identity.userId &&
        user.email.toLowerCase() === lease.email &&
        !knownAccounts.includes(user.id) &&
        Date.parse(user.created_at) >= Date.parse(lease.requestedAt) - 5000 &&
        Date.parse(user.created_at) <= Date.now() &&
        Number.isFinite(Date.parse(user.email_confirmed_at)),
      "NEW_ACCOUNT_PROOF_FAILED",
    );
    revoker.bindProvenToken(session.accessToken);
    result.accountId = user.id;
    result.accountCreatedAt = user.created_at;
    result.normalOtpVerification = "PASS";
    stage = "cold-restore";
    const repo = createAuthRepository(createOtpTestVault(directory, vaultKey));
    await repo.writeLocalSession(session);
    await coldRestore(directory, vaultKey, user.id, options.publishableKey);
    result.coldRestore =
      "PASS_SEPARATE_HOST_PROCESS_ENCRYPTED_STORAGE_NOT_NATIVE_KEYCHAIN";
    for (const other of knownAccounts)
      requireTrue(!(await repo.selectAccount(other)), "LOCAL_ACCOUNT_ISOLATION_FAILED");
    requireTrue(
      (await repo.readAdoptedLocalSession())?.identity?.userId === user.id,
      "ACTIVE_ACCOUNT_CHANGED",
    );
    stage = "backend-isolation";
    const headers = { Authorization: `Bearer ${session.accessToken}` };
    const list = await fetch(`${backendOrigin}/v2/trips`, {
      headers,
      redirect: "error",
      signal: AbortSignal.timeout(10000),
    });
    requireTrue(list.status === 200, "NEW_ACCOUNT_DISCOVERY_UNAVAILABLE");
    requireTrue(
      tripDiscoveryPageSchema.parse(await jsonRead(list)).trips.length === 0,
      "FOREIGN_TRIPS_DISCOVERED",
    );
    const foreign = await fetch(
      `${backendOrigin}/v2/trips/${foreignQaTrip}/core/capabilities`,
      { headers, redirect: "error", signal: AbortSignal.timeout(10000) },
    );
    const denied = z
      .object({ error: z.object({ code: z.literal("NOT_VISIBLE") }) })
      .safeParse(await jsonRead(foreign));
    requireTrue(
      foreign.status === 404 && denied.success,
      "FOREIGN_TRIP_NEGATIVE_UNVERIFIED",
    );
    result.accountIsolation =
      "PASS_LOCAL_REPOSITORY_AND_HOSTED_EMPTY_DISCOVERY_FOREIGN_TRIP_NOT_VISIBLE";
    stage = "refresh";
    session = await refreshSupabaseDevSession(
      session.refreshToken,
      options,
      session.identity,
    );
    requireTrue(
      session.identity?.userId === user.id && session.accessToken && session.refreshToken,
      "REFRESH_IDENTITY_FAILED",
    );
    const refreshedUser = await self(session.accessToken, options.publishableKey);
    requireTrue(
      refreshedUser.id === user.id && refreshedUser.email.toLowerCase() === lease.email,
      "REFRESH_SERVER_IDENTITY_FAILED",
    );
    revoker.bindProvenToken(session.accessToken);
    result.refresh = "PASS";
    stage = "logout";
    await revoker.revokeOnce();
    let revoked = false;
    try {
      await refreshSupabaseDevSession(session.refreshToken, options, session.identity);
    } catch (error) {
      revoked = error instanceof SupabaseDevAuthError && error.kind === "invalid_session";
    }
    requireTrue(revoked, "REVOKED_REFRESH_NOT_CONFIRMED");
    cleanup = true;
    await repo.clearLocalSession();
    requireTrue((await repo.readAdoptedLocalSession()) === null, "LOCAL_LOGOUT_FAILED");
    result.logout = "PASS_CURRENT_SESSION_ONLY_REFRESH_REVOKED";
    stage = "complete";
    result.ownSessionCleanup = "LOCAL_SCOPE_REVOKED";
    result.toolHashes = Object.fromEntries(
      [
        "resend-inbound-otp.ts",
        "resend-inbound-otp-e2e.ts",
        "otp-test-vault.ts",
        "otp-test-cleanup.ts",
      ].map((name) => [
        name,
        createHash("sha256")
          .update(readFileSync(resolve("scripts/auth", name)))
          .digest("hex"),
      ]),
    );
    result.status = "PASS";
    result.nativeE2E = false;
    result.reuseReleased = true;
    save();
    writeFileSync(reportPath, JSON.stringify(result, null, 2) + "\n", { mode: 0o600 });
    console.log(JSON.stringify(result));
  } catch (error) {
    result.status = "FAILED_OR_UNKNOWN";
    result.failedAt = stage;
    result.errorCode =
      error instanceof OtpQaError
        ? error.code
        : error instanceof SupabaseDevAuthError
          ? `AUTH_${error.kind.toUpperCase()}`
          : "VALIDATION_OR_TRANSPORT_FAILED";
    save();
    throw new OtpQaError(String(result.errorCode));
  } finally {
    if (!cleanup) cleanup = await revoker.cleanupIfUnattempted();
    result.ownSessionCleanup = cleanup
      ? "LOCAL_SCOPE_REVOKED"
      : "UNRESOLVED_NO_AUTOMATIC_RETRY_OR_NO_PROVEN_SESSION";
    save();
    vaultKey.fill(0);
    if (cleanup || !sent) rmSync(lock, { recursive: true });
    // Ciphertext can remain for diagnosis, but its ephemeral key is never persisted.
  }
}
if (basename(process.argv[1] ?? "") === "resend-inbound-otp-e2e.ts") {
  void main().catch((error) => {
    console.error(
      JSON.stringify({
        status: "PENDING_OR_FAILED",
        code: error instanceof OtpQaError ? error.code : "VALIDATION_OR_TRANSPORT_FAILED",
        secretsOrOtpRecorded: false,
      }),
    );
    process.exitCode = 1;
  });
}
