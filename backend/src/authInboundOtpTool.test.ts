import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import {
  createResendQaReceiver,
  extractQaOtp,
} from "../../scripts/auth/resend-inbound-otp";
function setup() {
  const now = Date.now();
  const wire = vi.fn<typeof fetch>();
  const sleep = vi.fn(async (_ms: number) => undefined);
  const receiver = createResendQaReceiver({
    key: "re_unit_test_not_a_real_key",
    scope: "dedicated-qa-team",
    fetch: wire,
    sleep,
    now: () => now + 1000,
  });
  const lease = receiver.createMailbox();
  const mail = {
    id: randomUUID(),
    to: [lease.email] as string[],
    from: "OTR <noreply@auth.xoery.art>",
    subject: "Your OTR verification code",
    created_at: new Date(Date.parse(lease.requestedAt) + 1).toISOString(),
    cc: [],
    bcc: [],
  };
  const reply = (body: unknown, status = 200, headers = {}) =>
    new Response(JSON.stringify(body), { status, headers });
  return { receiver, lease, wire, sleep, mail, reply };
}
it("matches the exact new address/window/sender then retrieves only that message", async () => {
  const f = setup();
  f.wire.mockResolvedValueOnce(
    f.reply({
      data: [{ ...f.mail, id: randomUUID(), to: ["other@example.test"] }, f.mail],
      has_more: true,
    }),
  );
  f.wire.mockResolvedValueOnce(
    f.reply({ ...f.mail, html: "<strong>12345678</strong>", text: "12345678" }),
  );
  expect(await f.receiver.waitForOtp(f.lease)).toEqual({
    code: "12345678",
    messageId: f.mail.id,
    receivedAt: f.mail.created_at,
  });
  expect(f.wire.mock.calls.map(([url]) => url)).toEqual([
    "https://api.resend.com/emails/receiving?limit=20",
    `https://api.resend.com/emails/receiving/${f.mail.id}`,
  ]);
  for (const [, options] of f.wire.mock.calls)
    expect(options).toMatchObject({ method: "GET", redirect: "error" });
  await expect(f.receiver.waitForOtp(f.lease)).rejects.toThrow("LEASE_NOT_OWNED");
});
it.each(["shared-team", "", "prefix-only"])(
  "refuses broad unisolated scope %s before any access",
  (scope) => {
    expect(() => createResendQaReceiver({ key: "re_test", scope })).toThrow(
      "SCOPE_REQUIRED",
    );
  },
);
it("requires an opaque owned lease and permits one mailbox only", async () => {
  const f = setup();
  expect(() => f.receiver.createMailbox()).toThrow("ALREADY_ALLOCATED");
  await expect(f.receiver.waitForOtp({ ...f.lease })).rejects.toThrow("LEASE_NOT_OWNED");
  expect(f.wire).not.toHaveBeenCalled();
});
it.each(["recipient", "old", "future", "sender", "subject", "cc"])(
  "never fetches a body for mismatched %s",
  async (kind) => {
    const f = setup(),
      mail = { ...f.mail, to: [...f.mail.to], cc: [] as string[] };
    if (kind === "recipient") mail.to = [f.lease.email + ".attacker"];
    if (kind === "old")
      mail.created_at = new Date(Date.parse(f.lease.requestedAt) - 1).toISOString();
    if (kind === "future") mail.created_at = "2099-01-01T00:00:00Z";
    if (kind === "sender") mail.from = "attacker@example.test";
    if (kind === "subject") mail.subject = "other message";
    if (kind === "cc") mail.cc = ["other@example.test"];
    f.wire.mockImplementation(async () => f.reply({ data: [mail], has_more: true }));
    await expect(f.receiver.waitForOtp(f.lease)).rejects.toThrow("DELIVERY_NOT_OBSERVED");
    expect(f.wire).toHaveBeenCalledTimes(12);
    expect(f.wire.mock.calls.every(([url]) => String(url).endsWith("?limit=20"))).toBe(
      true,
    );
  },
);
it("rejects more than one matching message instead of choosing a possibly stale code", async () => {
  const f = setup();
  f.wire.mockResolvedValue(
    f.reply({ data: [f.mail, { ...f.mail, id: randomUUID() }], has_more: false }),
  );
  await expect(f.receiver.waitForOtp(f.lease)).rejects.toThrow("MULTIPLE_MATCHING");
  expect(f.wire).toHaveBeenCalledTimes(1);
});
it("pins the metadata again when retrieving a body", async () => {
  const f = setup();
  f.wire
    .mockResolvedValueOnce(f.reply({ data: [f.mail], has_more: false }))
    .mockResolvedValueOnce(
      f.reply({ ...f.mail, to: ["wrong@example.test"], text: "12345678" }),
    );
  await expect(f.receiver.waitForOtp(f.lease)).rejects.toThrow("MESSAGE_MISMATCH");
});
it("honors bounded Retry-After and never sends an OTP itself", async () => {
  const f = setup();
  f.wire
    .mockResolvedValueOnce(f.reply({}, 429, { "retry-after": "4" }))
    .mockResolvedValueOnce(f.reply({ data: [f.mail], has_more: false }))
    .mockResolvedValueOnce(f.reply({ ...f.mail, text: "12345678" }));
  expect((await f.receiver.waitForOtp(f.lease)).code).toBe("12345678");
  expect(f.sleep).toHaveBeenCalledWith(4000);
  expect(f.wire.mock.calls.every(([, options]) => options?.method === "GET")).toBe(true);
});
it("rejects a long rate-limit instead of spinning or switching identity", async () => {
  const f = setup();
  f.wire.mockResolvedValue(f.reply({}, 429, { "retry-after": "600" }));
  await expect(f.receiver.waitForOtp(f.lease)).rejects.toThrow("RATE_LIMITED");
  expect(f.wire).toHaveBeenCalledTimes(1);
});
it("does not include provider exception/key/body in its error", async () => {
  const f = setup();
  f.wire.mockRejectedValue(Error("secret-key-and-private-mail"));
  await expect(f.receiver.waitForOtp(f.lease)).rejects.toThrow(
    /^RECEIVING_TRANSPORT_FAILED$/,
  );
});
it("bounds response bytes", async () => {
  const f = setup();
  f.wire.mockResolvedValue(new Response("x".repeat(262145)));
  await expect(f.receiver.waitForOtp(f.lease)).rejects.toThrow("BODY_LIMIT");
});
it("checks Receiving permission without returning any mailbox metadata", async () => {
  const f = setup();
  f.wire.mockResolvedValue(f.reply({ privateMetadata: "not exposed" }, 403));
  await expect(f.receiver.checkPermission()).rejects.toThrow("PERMISSION_DENIED");
  expect(f.wire).toHaveBeenCalledTimes(1);
});
it("extracts only one unique eight-digit token and rejects links/ambiguous messages", () => {
  expect(
    extractQaOtp({
      html: "data:text/html;base64," + Buffer.from("<p>12345678</p>").toString("base64"),
    }),
  ).toBe("12345678");
  expect(() => extractQaOtp({ text: "12345678 87654321" })).toThrow("AMBIGUOUS");
  expect(() => extractQaOtp({ text: "123456" })).toThrow("AMBIGUOUS");
  expect(() =>
    extractQaOtp({ text: "12345678 https://x/auth/v1/verify?token=x" }),
  ).toThrow("MAGIC_LINK");
});
