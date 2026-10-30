import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  closeSync,
  fsyncSync,
  constants,
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
const email = "otr-qa-fde969f2-2dc5-4a33-83a1-268ac5fd6424@eldouzileu.resend.app";
const originalHash = "33a154f354d11495f909b714cad493950790ca492a958dfa44ab3ce9e4b4103c";
const originalRequest = Date.parse("2026-10-30T00:09:03.519Z");
const hash = (b: string | Buffer) => createHash("sha256").update(b).digest("hex");
const metadata = z.object({
  id: z.uuid(),
  to: z.array(z.string()),
  from: z.string(),
  subject: z.string(),
  created_at: z.string(),
  cc: z.array(z.string()).nullish(),
  bcc: z.array(z.string()).nullish(),
});
function requireQa(value: unknown, code: string): asserts value {
  if (!value) throw new OtpQaError(code);
}

// Same registered case only. It receives a new normal App challenge, never sends it.
type ReceiverConfig = {
  key: string;
  scope: string;
  reserve(value: { email: string; requestedAt: string }): void;
  fetch?: typeof fetch;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
};
function createCaseReceiver(config: ReceiverConfig, canIssue: (time: number) => boolean) {
  requireQa(config.scope === "dedicated-qa-team", "RECEIVING_SCOPE_REQUIRED");
  requireQa(/^re_[A-Za-z0-9_\-]+$/.test(config.key), "RECEIVING_CREDENTIAL_REQUIRED");
  const key = config.key;
  const now = config.now ?? Date.now,
    wire = config.fetch ?? fetch,
    sleep = config.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  let lease: Readonly<{ email: string; requestedAt: string }> | undefined,
    consumed = false;
  return {
    createChallenge() {
      requireQa(!lease, "NATIVE_RELOGIN_CHALLENGE_ALREADY_ISSUED");
      requireQa(canIssue(now()), "NATIVE_RELOGIN_CASE_WINDOW_CLOSED");
      lease = Object.freeze({ email, requestedAt: new Date(now()).toISOString() });
      config.reserve(lease);
      return lease;
    },
    async waitForOtp(input: Readonly<{ email: string; requestedAt: string }>) {
      requireQa(input === lease && !consumed && lease, "MAILBOX_LEASE_NOT_OWNED");
      consumed = true;
      const requested = Date.parse(lease.requestedAt),
        remaining = requested + 120000 - now();
      requireQa(remaining > 0 && remaining <= 120000, "MAILBOX_LEASE_INVALID");
      const boundary = createRequestBoundary(remaining);
      let reads = 0;
      async function read(path: string) {
        boundary.assertCurrent();
        requireQa(
          ++reads <= 24 && now() < requested + 120000,
          "RECEIVING_BUDGET_EXHAUSTED",
        );
        let response: Response;
        try {
          response = await boundary.run(() =>
            wire(`https://api.resend.com/emails/receiving${path}`, {
              method: "GET",
              redirect: "error",
              signal: boundary.signal,
              headers: { Authorization: `Bearer ${key}` },
            }),
          );
        } catch {
          throw new OtpQaError("RECEIVING_TRANSPORT_FAILED");
        }
        if (!response.ok) {
          await response.body?.cancel().catch(() => undefined);
          throw new OtpQaError(
            response.status === 429 ? "RECEIVING_RATE_LIMITED" : "RECEIVING_HTTP_FAILED",
          );
        }
        return readBoundedJson(response, 262144, boundary);
      }
      function matches(m: z.infer<typeof metadata>) {
        const time = Date.parse(m.created_at),
          sender = (m.from.match(/<([^<>]+)>$/)?.[1] ?? m.from).toLowerCase();
        return (
          m.to.length === 1 &&
          m.to[0].toLowerCase() === email &&
          !(m.cc?.length || m.bcc?.length) &&
          sender === "noreply@auth.xoery.art" &&
          m.subject === "Your OTR verification code" &&
          Number.isFinite(time) &&
          time >= requested &&
          time <= now() &&
          time <= requested + 120000
        );
      }
      try {
        for (let poll = 0; poll < 12 && now() < requested + 120000; poll++) {
          const page = z
            .object({ data: z.array(metadata).max(20), has_more: z.boolean() })
            .safeParse(await read("?limit=20"));
          requireQa(page.success, "RECEIVING_RESPONSE_INVALID");
          const found = page.data.data.filter(matches);
          requireQa(found.length <= 1, "MULTIPLE_MATCHING_MESSAGES");
          if (found.length === 1) {
            const selected = found[0],
              detail = metadata
                .extend({ text: z.string().nullish(), html: z.string().nullish() })
                .safeParse(await read(`/${selected.id}`));
            requireQa(
              detail.success &&
                matches(detail.data) &&
                detail.data.id === selected.id &&
                detail.data.created_at === selected.created_at,
              "RECEIVING_MESSAGE_MISMATCH",
            );
            const code = extractQaOtp(detail.data);
            boundary.assertCurrent();
            requireQa(now() < requested + 120000, "MAILBOX_LEASE_INVALID");
            return { code, messageId: selected.id, receivedAt: selected.created_at };
          }
          await boundary.run(() => sleep(3000));
        }
        throw new OtpQaError("OTP_DELIVERY_NOT_OBSERVED");
      } finally {
        boundary.close();
      }
    },
  };
}

// The original interrupted Native case keeps its original creation window.
export function createNativeCaseReloginReceiver(config: ReceiverConfig) {
  return createCaseReceiver(
    config,
    (time) => time >= originalRequest + 60000 && time < originalRequest + 6 * 3600000,
  );
}

// Host entry validates the already accepted canonical Account before using this
// receiver. Only the issue window differs; recipient, matching and 120s lease do not.
export function createAcceptedHostQaReceiver(config: ReceiverConfig) {
  return createCaseReceiver(config, (time) => time >= originalRequest + 60000);
}

export function openRegisteredNativeReloginReceiver() {
  publicConfiguration(process.env);
  requireQa(
    process.env.OTR_QA_RESEND_SCOPE === "dedicated-qa-team",
    "RECEIVING_SCOPE_REQUIRED",
  );
  for (const path of [
    root,
    `${root}/native-signup-case.json`,
    `${root}/native-signup-recovery.json`,
  ]) {
    const st = lstatSync(path);
    requireQa(
      !st.isSymbolicLink() && st.uid === process.getuid?.() && !(st.mode & 0o022),
      "NATIVE_RELOGIN_CASE_UNSAFE",
    );
  }
  requireQa(
    hash(readFileSync(`${root}/native-signup-case.json`)) === originalHash,
    "RECOVERY_CASE_CHANGED",
  );
  const recovered = JSON.parse(
    readFileSync(`${root}/native-signup-recovery.json`, "utf8"),
  );
  requireQa(
    recovered.phase === "NATIVE_UI_OBSERVED_AFTER_VERIFY" &&
      recovered.mailboxEmail === email &&
      recovered.messageId === "d3d1fe07-aabd-4a4a-a2ba-28c1068922ce" &&
      recovered.hostSessionCreated === false &&
      recovered.otpPrinted === false,
    "NATIVE_RELOGIN_CASE_UNVERIFIED",
  );
  const proof = JSON.parse(
    readFileSync("docs/ops/auth-inbound-otp-20261030/FIRST_USER_E2E.json", "utf8"),
  );
  requireQa(
    proof.status === "PASS" && proof.reuseReleased === true,
    "FIRST_USER_PROOF_REQUIRED",
  );
  for (const name of [
    "resend-inbound-otp.ts",
    "resend-inbound-otp-e2e.ts",
    "otp-test-vault.ts",
    "otp-test-cleanup.ts",
  ])
    requireQa(
      proof.toolHashes?.[name] === hash(readFileSync(`scripts/auth/${name}`)),
      "FIRST_USER_PROOF_CODE_CHANGED",
    );
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
  return createNativeCaseReloginReceiver({
    key,
    scope: process.env.OTR_QA_RESEND_SCOPE,
    reserve(value) {
      let fd: number;
      try {
        fd = openSync(
          `${root}/auth-native-relogin-once.json`,
          constants.O_WRONLY |
            constants.O_CREAT |
            constants.O_EXCL |
            constants.O_NOFOLLOW,
          0o600,
        );
      } catch {
        throw new OtpQaError("NATIVE_RELOGIN_ALREADY_ISSUED_OR_UNSAFE");
      }
      try {
        writeSync(
          fd,
          JSON.stringify({
            ...value,
            originalCaseSha256: originalHash,
            phase: "CHALLENGE_RESERVED_BEFORE_NORMAL_APP_SEND",
            automaticResend: false,
            hostSessionCreated: false,
          }) + "\n",
        );
        fsyncSync(fd);
      } finally {
        closeSync(fd);
      }
    },
  });
}
