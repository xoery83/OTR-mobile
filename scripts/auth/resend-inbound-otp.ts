import { randomUUID } from "node:crypto";
import { z } from "zod";

export const qaDomain = "eldouzileu.resend.app";
export class OtpQaError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}
const meta = z.object({
  id: z.uuid(),
  to: z.array(z.string()),
  from: z.string(),
  subject: z.string(),
  created_at: z.string(),
  cc: z.array(z.string()).nullish(),
  bcc: z.array(z.string()).nullish(),
});
const page = z.object({ data: z.array(meta).max(100), has_more: z.boolean() });
const detail = meta.extend({
  text: z.string().nullable().optional(),
  html: z.string().nullable().optional(),
});
const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
function createQaMailbox() {
  return Object.freeze({
    email: `otr-qa-${randomUUID()}@${qaDomain}`,
    requestedAt: new Date().toISOString(),
  });
}
function sender(value: string) {
  return (value.match(/<([^<>]+)>$/)?.[1] ?? value).toLowerCase();
}
export function extractQaOtp(body: { text?: string | null; html?: string | null }) {
  let html = body.html ?? "";
  if (html.startsWith("data:text/html;base64,"))
    html = Buffer.from(html.slice(22), "base64").toString("utf8");
  if (html.startsWith("data:text/html,")) html = decodeURIComponent(html.slice(15));
  const text = `${body.text ?? ""}\n${html}`;
  if (text.includes("/auth/v1/verify?") || text.includes(".ConfirmationURL"))
    throw new OtpQaError("MAGIC_LINK_NOT_OTP");
  const codes = [...new Set([...text.matchAll(/(?<!\d)\d{8}(?!\d)/g)].map((m) => m[0]))];
  if (codes.length !== 1) throw new OtpQaError("OTP_BODY_AMBIGUOUS");
  return codes[0];
}

// A dedicated QA team is the external boundary. Local filters never narrow a full key.
export function createResendQaReceiver(config: {
  key: string;
  scope: string;
  fetch?: typeof fetch;
  sleep?: typeof pause;
  now?: () => number;
}) {
  if (config.scope !== "dedicated-qa-team")
    throw new OtpQaError("RECEIVING_SCOPE_REQUIRED");
  if (!/^re_[A-Za-z0-9_\-]+$/.test(config.key))
    throw new OtpQaError("RECEIVING_CREDENTIAL_REQUIRED");
  const key = config.key;
  let lease: ReturnType<typeof createQaMailbox> | undefined;
  let consumed = false;
  const wire = config.fetch ?? fetch,
    sleep = config.sleep ?? pause,
    now = config.now ?? Date.now;
  return {
    async checkPermission() {
      let response: Response;
      try {
        response = await wire("https://api.resend.com/emails/receiving?limit=1", {
          method: "GET",
          redirect: "error",
          signal: AbortSignal.timeout(10000),
          headers: { Authorization: `Bearer ${key}` },
        });
      } catch {
        throw new OtpQaError("RECEIVING_TRANSPORT_FAILED");
      }
      await response.body?.cancel().catch(() => undefined);
      if (!response.ok)
        throw new OtpQaError(
          response.status === 429
            ? "RECEIVING_RATE_LIMITED"
            : "RECEIVING_PERMISSION_DENIED",
        );
    },
    createMailbox() {
      if (lease) throw new OtpQaError("QA_MAILBOX_ALREADY_ALLOCATED");
      lease = createQaMailbox();
      return lease;
    },
    async waitForOtp(input: ReturnType<typeof createQaMailbox>) {
      if (!lease || input !== lease || consumed)
        throw new OtpQaError("MAILBOX_LEASE_NOT_OWNED");
      consumed = true;
      const email = input.email,
        requestedAt = Date.parse(input.requestedAt);
      if (
        !new RegExp(`^otr-qa-[0-9a-f-]{36}@${qaDomain.replaceAll(".", "\\.")}$`).test(
          email,
        ) ||
        !Number.isFinite(requestedAt) ||
        requestedAt > now() ||
        now() - requestedAt > 120000
      )
        throw new OtpQaError("MAILBOX_LEASE_INVALID");
      const deadline = requestedAt + 120000;
      let requests = 0;
      async function read(path: string) {
        if (++requests > 30 || now() >= deadline)
          throw new OtpQaError("RECEIVING_BUDGET_EXHAUSTED");
        let response: Response;
        try {
          response = await wire(`https://api.resend.com/emails/receiving${path}`, {
            method: "GET",
            redirect: "error",
            signal: AbortSignal.timeout(Math.max(1, Math.min(10000, deadline - now()))),
            headers: { Authorization: `Bearer ${key}` },
          });
        } catch {
          throw new OtpQaError("RECEIVING_TRANSPORT_FAILED");
        }
        if (response.status === 429) {
          const wait = Number(response.headers.get("retry-after") ?? "3");
          await response.body?.cancel().catch(() => undefined);
          if (
            !Number.isFinite(wait) ||
            wait < 0 ||
            wait > 30 ||
            now() + Math.max(3000, wait * 1000) >= deadline
          )
            throw new OtpQaError("RECEIVING_RATE_LIMITED");
          await sleep(Math.max(3000, wait * 1000));
          return null;
        }
        if (!response.ok) {
          await response.body?.cancel().catch(() => undefined);
          throw new OtpQaError(
            response.status === 401 || response.status === 403
              ? "RECEIVING_PERMISSION_DENIED"
              : "RECEIVING_HTTP_FAILED",
          );
        }
        const reader = response.body?.getReader();
        if (!reader) throw new OtpQaError("RECEIVING_RESPONSE_INVALID");
        const chunks: Uint8Array[] = [];
        let bytes = 0;
        try {
          while (true) {
            const part = await reader.read();
            if (part.done) break;
            bytes += part.value.byteLength;
            if (bytes > 262144) throw new OtpQaError("RECEIVING_BODY_LIMIT");
            chunks.push(part.value);
          }
        } catch (error) {
          if (error instanceof OtpQaError) throw error;
          throw new OtpQaError("RECEIVING_TRANSPORT_FAILED");
        } finally {
          await reader.cancel().catch(() => undefined);
        }
        try {
          return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
        } catch {
          throw new OtpQaError("RECEIVING_RESPONSE_INVALID");
        }
      }
      function matches(m: z.infer<typeof meta>) {
        const time = Date.parse(m.created_at);
        return (
          m.to.length === 1 &&
          m.to[0].toLowerCase() === email &&
          !(m.cc?.length || m.bcc?.length) &&
          sender(m.from) === "noreply@auth.xoery.art" &&
          m.subject === "Your OTR verification code" &&
          Number.isFinite(time) &&
          time >= requestedAt &&
          time <= now()
        );
      }
      for (let attempt = 0; attempt < 12 && now() < deadline; attempt++) {
        const raw = await read("?limit=20");
        if (raw === null) continue;
        const parsed = page.safeParse(raw);
        if (!parsed.success) throw new OtpQaError("RECEIVING_RESPONSE_INVALID");
        const found = parsed.data.data.filter(matches);
        if (found.length > 1) throw new OtpQaError("MULTIPLE_MATCHING_MESSAGES");
        if (found.length === 1) {
          const rawBody = await read(`/${found[0].id}`);
          if (rawBody === null) continue;
          const parsedBody = detail.safeParse(rawBody);
          if (
            !parsedBody.success ||
            !matches(parsedBody.data) ||
            parsedBody.data.id !== found[0].id ||
            parsedBody.data.created_at !== found[0].created_at
          )
            throw new OtpQaError("RECEIVING_MESSAGE_MISMATCH");
          return {
            code: extractQaOtp(parsedBody.data),
            messageId: found[0].id,
            receivedAt: found[0].created_at,
          };
        }
        // Bounded newest page only; never enumerate an entire team's history.
        await sleep(3000);
      }
      throw new OtpQaError("OTP_DELIVERY_NOT_OBSERVED");
    },
  };
}
