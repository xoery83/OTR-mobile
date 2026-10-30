import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  constants,
  closeSync,
  lstatSync,
  openSync,
  readFileSync,
  writeSync,
} from "node:fs";
import { z } from "zod";
import {
  createRequestBoundary,
  readBoundedJson,
} from "../../src/data/api/requestBoundary";
import { extractQaOtp, OtpQaError } from "./resend-inbound-otp";
import { inboundKeychainArgs, publicConfiguration } from "./resend-inbound-otp-e2e";

const root = "/private/tmp/otr-ipad-native-20261030";
const caseHash = "33a154f354d11495f909b714cad493950790ca492a958dfa44ab3ce9e4b4103c";
const email = "otr-qa-fde969f2-2dc5-4a33-83a1-268ac5fd6424@eldouzileu.resend.app";
const requestedAt = Date.parse("2026-10-30T00:09:03.519Z");
const sha = (text: string | Buffer) => createHash("sha256").update(text).digest("hex");
const mail = z.object({
  id: z.uuid(),
  to: z.array(z.string()),
  from: z.string(),
  subject: z.string(),
  created_at: z.string(),
  cc: z.array(z.string()).nullish(),
  bcc: z.array(z.string()).nullish(),
});
const body = mail.extend({ text: z.string().nullish(), html: z.string().nullish() });
function requireCase(ok: unknown, code: string): asserts ok {
  if (!ok) throw new OtpQaError(code);
}

// One registered incident, not a mailbox lease factory or general re-login API.
// Injected host IO is only for tests; the lane-facing entry below fixes all paths.
export async function recoverFixedNativeSignupOtp(deps: {
  caseText: string;
  key(): string;
  claim(): void;
  fetch: typeof fetch;
  now(): number;
}) {
  requireCase(sha(deps.caseText) === caseHash, "RECOVERY_CASE_CHANGED");
  const assertWindow = () =>
    requireCase(
      deps.now() >= requestedAt && deps.now() < requestedAt + 15 * 60000,
      "RECOVERY_WINDOW_CLOSED",
    );
  assertWindow();
  const key = deps.key();
  requireCase(/^re_[A-Za-z0-9_\-]+$/.test(key), "RECEIVING_CREDENTIAL_REQUIRED");
  assertWindow();
  // Reserve before any Receiving IO. UNKNOWN/error does not release this claim.
  deps.claim();
  const boundary = createRequestBoundary(20000);
  async function read(path: string) {
    boundary.assertCurrent();
    assertWindow();
    let response: Response;
    try {
      response = await boundary.run(() =>
        deps.fetch(`https://api.resend.com/emails/receiving${path}`, {
          method: "GET",
          redirect: "error",
          signal: boundary.signal,
          headers: { Authorization: `Bearer ${key}` },
        }),
      );
    } catch {
      throw new OtpQaError("RECOVERY_TRANSPORT_UNKNOWN_NO_RETRY");
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw new OtpQaError(
        response.status === 429 ? "RECEIVING_RATE_LIMITED" : "RECOVERY_HTTP_FAILED",
      );
    }
    return readBoundedJson(response, 262144, boundary);
  }
  function matches(m: z.infer<typeof mail>) {
    const time = Date.parse(m.created_at);
    const sender = (m.from.match(/<([^<>]+)>$/)?.[1] ?? m.from).toLowerCase();
    return (
      m.to.length === 1 &&
      m.to[0].toLowerCase() === email &&
      !(m.cc?.length || m.bcc?.length) &&
      sender === "noreply@auth.xoery.art" &&
      m.subject === "Your OTR verification code" &&
      Number.isFinite(time) &&
      time >= requestedAt &&
      time <= requestedAt + 120000 &&
      time <= deps.now()
    );
  }
  try {
    const parsed = z
      .object({ data: z.array(mail).max(20), has_more: z.boolean() })
      .safeParse(await read("?limit=20"));
    requireCase(parsed.success, "RECEIVING_RESPONSE_INVALID");
    const found = parsed.data.data.filter(matches);
    requireCase(found.length === 1, "RECOVERY_UNIQUE_MESSAGE_REQUIRED");
    const selected = found[0];
    const detail = body.safeParse(await read(`/${selected.id}`));
    requireCase(
      detail.success &&
        matches(detail.data) &&
        detail.data.id === selected.id &&
        detail.data.created_at === selected.created_at,
      "RECEIVING_MESSAGE_MISMATCH",
    );
    const code = extractQaOtp(detail.data);
    boundary.assertCurrent();
    assertWindow();
    return { code, messageId: selected.id, receivedAt: selected.created_at };
  } finally {
    boundary.close();
  }
}

// Host-only: no Supabase send/verify, no Session, no OTP/Key/raw mail output or storage.
export async function recoverInterruptedNativeSignupOtp() {
  publicConfiguration(process.env);
  requireCase(
    process.env.OTR_QA_RESEND_SCOPE === "dedicated-qa-team",
    "RECEIVING_SCOPE_REQUIRED",
  );
  const proof = JSON.parse(
    readFileSync("docs/ops/auth-inbound-otp-20261030/FIRST_USER_E2E.json", "utf8"),
  );
  requireCase(
    proof.status === "PASS" && proof.reuseReleased === true,
    "FIRST_USER_PROOF_REQUIRED",
  );
  for (const name of [
    "resend-inbound-otp.ts",
    "resend-inbound-otp-e2e.ts",
    "otp-test-vault.ts",
    "otp-test-cleanup.ts",
  ])
    requireCase(
      proof.toolHashes?.[name] === sha(readFileSync(`scripts/auth/${name}`)),
      "FIRST_USER_PROOF_CODE_CHANGED",
    );
  for (const path of [root, `${root}/native-signup-case.json`]) {
    const stat = lstatSync(path);
    requireCase(
      !stat.isSymbolicLink() && stat.uid === process.getuid?.() && !(stat.mode & 0o022),
      "RECOVERY_CASE_FILE_UNSAFE",
    );
  }
  const caseText = readFileSync(`${root}/native-signup-case.json`, "utf8");
  return recoverFixedNativeSignupOtp({
    caseText,
    now: Date.now,
    fetch,
    key() {
      if (process.env.OTR_QA_RESEND_API_KEY) return process.env.OTR_QA_RESEND_API_KEY;
      try {
        return execFileSync("/usr/bin/security", [...inboundKeychainArgs], {
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
          timeout: 15000,
        }).trim();
      } catch {
        throw new OtpQaError("RECEIVING_CREDENTIAL_REQUIRED");
      }
    },
    claim() {
      let fd: number;
      try {
        fd = openSync(
          `${root}/auth-inbound-recovery-once.json`,
          constants.O_WRONLY |
            constants.O_CREAT |
            constants.O_EXCL |
            constants.O_NOFOLLOW,
          0o600,
        );
      } catch {
        throw new OtpQaError("RECOVERY_ALREADY_CLAIMED_OR_UNSAFE");
      }
      try {
        writeSync(
          fd,
          JSON.stringify({
            caseSha256: caseHash,
            claimedAt: new Date().toISOString(),
            outcome: "UNKNOWN_UNTIL_NATIVE_READBACK",
            automaticRetry: false,
          }) + "\n",
        );
      } finally {
        closeSync(fd);
      }
    },
  });
}
