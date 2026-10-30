import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { recoverFixedNativeSignupOtp } from "../../scripts/auth/resend-inbound-otp-case-recovery";
const caseText =
  JSON.stringify(
    {
      startedAt: "2026-10-30T00:09:02.204Z",
      hostSessionCreated: false,
      otpPrinted: false,
      phase: "OTP_REQUEST_MAY_BE_SENT",
      mailboxEmail: "otr-qa-fde969f2-2dc5-4a33-83a1-268ac5fd6424@eldouzileu.resend.app",
      requestedAt: "2026-10-30T00:09:03.519Z",
      otpRequestAttempts: 1,
      stoppedAt: "2026-10-30T00:09:11.059Z",
      errorCode: "UI_INVALID_ARGS",
    },
    null,
    2,
  ) + "\n";
function setup() {
  const wire = vi.fn<typeof fetch>();
  let claimed = false;
  const claim = vi.fn(() => {
    if (claimed) throw Error("ALREADY_CLAIMED");
    claimed = true;
  });
  const key = vi.fn(() => "re_unit_test_only");
  const deps = {
    caseText,
    key,
    claim,
    fetch: wire,
    now: () => Date.parse("2026-10-30T00:13:00.000Z"),
  };
  const mail = {
    id: randomUUID(),
    to: ["otr-qa-fde969f2-2dc5-4a33-83a1-268ac5fd6424@eldouzileu.resend.app"],
    from: "OTR <noreply@auth.xoery.art>",
    subject: "Your OTR verification code",
    created_at: "2026-10-30T00:09:04.000Z",
    cc: [],
    bcc: [],
  };
  const reply = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status });
  return { deps, wire, key, claim, mail, reply };
}
it("recovers only registered original challenge with two GETs; repeat remains consumed", async () => {
  const f = setup();
  f.wire.mockResolvedValueOnce(
    f.reply({
      data: [{ ...f.mail, id: randomUUID(), to: ["other@example.test"] }, f.mail],
      has_more: true,
    }),
  );
  f.wire.mockResolvedValueOnce(f.reply({ ...f.mail, text: "12345678" }));
  expect(await recoverFixedNativeSignupOtp(f.deps)).toEqual({
    code: "12345678",
    messageId: f.mail.id,
    receivedAt: f.mail.created_at,
  });
  expect(f.wire.mock.calls.map(([url]) => url)).toEqual([
    "https://api.resend.com/emails/receiving?limit=20",
    `https://api.resend.com/emails/receiving/${f.mail.id}`,
  ]);
  expect(
    f.wire.mock.calls.every(([, o]) => o?.method === "GET" && o.redirect === "error"),
  ).toBe(true);
  await expect(recoverFixedNativeSignupOtp(f.deps)).rejects.toThrow("ALREADY_CLAIMED");
  expect(f.wire).toHaveBeenCalledTimes(2);
});
it("rejects case replacement before reading any credential", async () => {
  const f = setup();
  f.deps.caseText = f.deps.caseText.replace("UI_INVALID_ARGS", "OTHER_ERROR");
  await expect(recoverFixedNativeSignupOtp(f.deps)).rejects.toThrow("CASE_CHANGED");
  expect(f.key).not.toHaveBeenCalled();
  expect(f.wire).not.toHaveBeenCalled();
});
it("rejects expired incident before credential IO", async () => {
  const f = setup();
  f.deps.now = () => Date.parse("2026-10-30T00:24:03.519Z");
  await expect(recoverFixedNativeSignupOtp(f.deps)).rejects.toThrow("WINDOW_CLOSED");
  expect(f.key).not.toHaveBeenCalled();
});
it.each(["recipient", "from", "subject", "late", "cc"])(
  "rejects %s mail without body access",
  async (kind) => {
    const f = setup(),
      m = { ...f.mail };
    if (kind === "recipient") m.to = ["otr-qa-other@eldouzileu.resend.app"];
    if (kind === "from") m.from = "other@example.test";
    if (kind === "subject") m.subject = "Other";
    if (kind === "late") m.created_at = "2026-10-30T00:11:04.000Z";
    if (kind === "cc") m.cc = ["other@example.test"] as never[];
    f.wire.mockResolvedValueOnce(f.reply({ data: [m], has_more: true }));
    await expect(recoverFixedNativeSignupOtp(f.deps)).rejects.toThrow(
      "UNIQUE_MESSAGE_REQUIRED",
    );
    expect(f.wire).toHaveBeenCalledTimes(1);
  },
);
it("rejects ambiguous same-case messages without selecting newest", async () => {
  const f = setup();
  f.wire.mockResolvedValueOnce(
    f.reply({ data: [f.mail, { ...f.mail, id: randomUUID() }], has_more: false }),
  );
  await expect(recoverFixedNativeSignupOtp(f.deps)).rejects.toThrow(
    "UNIQUE_MESSAGE_REQUIRED",
  );
  expect(f.wire).toHaveBeenCalledTimes(1);
});
it("repins body identity and never returns mismatched code", async () => {
  const f = setup();
  f.wire.mockResolvedValueOnce(f.reply({ data: [f.mail], has_more: false }));
  f.wire.mockResolvedValueOnce(
    f.reply({ ...f.mail, id: randomUUID(), text: "12345678" }),
  );
  await expect(recoverFixedNativeSignupOtp(f.deps)).rejects.toThrow("MESSAGE_MISMATCH");
});
it("does not retry a 429 or release the one-shot claim", async () => {
  const f = setup();
  f.wire.mockResolvedValueOnce(f.reply({}, 429));
  await expect(recoverFixedNativeSignupOtp(f.deps)).rejects.toThrow("RATE_LIMITED");
  await expect(recoverFixedNativeSignupOtp(f.deps)).rejects.toThrow("ALREADY_CLAIMED");
  expect(f.wire).toHaveBeenCalledTimes(1);
});
it("does not expose arbitrary upstream failures or retry UNKNOWN", async () => {
  const f = setup();
  f.wire.mockRejectedValueOnce(Error("private upstream detail"));
  await expect(recoverFixedNativeSignupOtp(f.deps)).rejects.toThrow(
    "RECOVERY_TRANSPORT_UNKNOWN_NO_RETRY",
  );
  await expect(recoverFixedNativeSignupOtp(f.deps)).rejects.toThrow("ALREADY_CLAIMED");
});
