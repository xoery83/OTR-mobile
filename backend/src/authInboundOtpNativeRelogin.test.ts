import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { createNativeCaseReloginReceiver } from "../../scripts/auth/resend-inbound-otp-native-relogin";
function setup() {
  let time = Date.parse("2026-10-30T00:35:00.000Z");
  const wire = vi.fn<typeof fetch>(),
    reserve = vi.fn();
  const receiver = createNativeCaseReloginReceiver({
    key: "re_unit_only",
    scope: "dedicated-qa-team",
    reserve,
    fetch: wire,
    now: () => time,
    sleep: async (ms) => {
      time += ms;
    },
  });
  const lease = receiver.createChallenge();
  const mail = {
    id: randomUUID(),
    to: [lease.email],
    from: "OTR <noreply@auth.xoery.art>",
    subject: "Your OTR verification code",
    created_at: lease.requestedAt,
    cc: [],
    bcc: [],
  };
  const reply = (value: unknown, status = 200) =>
    new Response(JSON.stringify(value), { status });
  return {
    wire,
    reserve,
    receiver,
    lease,
    mail,
    reply,
    advance(ms: number) {
      time += ms;
    },
  };
}
it("issues only same registered address and accepts only new challenge mail, not old code", async () => {
  const f = setup();
  expect(f.lease.email).toBe(
    "otr-qa-fde969f2-2dc5-4a33-83a1-268ac5fd6424@eldouzileu.resend.app",
  );
  f.wire.mockResolvedValueOnce(
    f.reply({
      data: [{ ...f.mail, id: randomUUID(), created_at: "2026-10-30T00:09:18.223Z" }],
      has_more: true,
    }),
  );
  f.wire.mockResolvedValueOnce(f.reply({ data: [f.mail], has_more: false }));
  f.wire.mockResolvedValueOnce(f.reply({ ...f.mail, text: "12345678" }));
  expect(await f.receiver.waitForOtp(f.lease)).toEqual({
    code: "12345678",
    messageId: f.mail.id,
    receivedAt: f.mail.created_at,
  });
  expect(f.reserve).toHaveBeenCalledOnce();
  expect(f.wire.mock.calls.every(([, o]) => o?.method === "GET")).toBe(true);
  await expect(f.receiver.waitForOtp(f.lease)).rejects.toThrow("LEASE_NOT_OWNED");
  expect(() => f.receiver.createChallenge()).toThrow("ALREADY_ISSUED");
});
it("does not accept copied challenge or expired lease", async () => {
  const f = setup();
  await expect(f.receiver.waitForOtp({ ...f.lease })).rejects.toThrow("LEASE_NOT_OWNED");
  f.advance(120001);
  await expect(f.receiver.waitForOtp(f.lease)).rejects.toThrow("LEASE_INVALID");
  expect(f.wire).not.toHaveBeenCalled();
});
it("reserves once before any IO and retains unknown delivery for no automatic replay", async () => {
  const f = setup();
  expect(f.reserve).toHaveBeenCalledWith(f.lease);
  expect(f.wire).not.toHaveBeenCalled();
  f.wire.mockResolvedValueOnce(f.reply({}, 429));
  await expect(f.receiver.waitForOtp(f.lease)).rejects.toThrow("RATE_LIMITED");
  await expect(f.receiver.waitForOtp(f.lease)).rejects.toThrow("LEASE_NOT_OWNED");
  expect(f.wire).toHaveBeenCalledOnce();
});
it("stops after bounded polls without issuing a resend or paging history", async () => {
  const f = setup();
  f.wire.mockImplementation(async () => f.reply({ data: [], has_more: true }));
  await expect(f.receiver.waitForOtp(f.lease)).rejects.toThrow("NOT_OBSERVED");
  expect(f.wire).toHaveBeenCalledTimes(12);
  expect(new Set(f.wire.mock.calls.map(([url]) => url)).size).toBe(1);
});
it.each(["foreign", "ambiguous", "detail"])(
  "rejects %s message without returning OTP",
  async (kind) => {
    const f = setup();
    const data =
      kind === "foreign"
        ? [{ ...f.mail, to: ["other@example.test"] }]
        : kind === "ambiguous"
          ? [f.mail, { ...f.mail, id: randomUUID() }]
          : [f.mail];
    f.wire.mockImplementation(async () => f.reply({ data, has_more: false }));
    if (kind === "detail") {
      f.wire.mockResolvedValueOnce(f.reply({ data, has_more: false }));
      f.wire.mockResolvedValueOnce(
        f.reply({ ...f.mail, id: randomUUID(), text: "12345678" }),
      );
    }
    await expect(f.receiver.waitForOtp(f.lease)).rejects.toThrow(
      kind === "detail"
        ? "MESSAGE_MISMATCH"
        : kind === "ambiguous"
          ? "MULTIPLE_MATCHING"
          : "NOT_OBSERVED",
    );
  },
);
