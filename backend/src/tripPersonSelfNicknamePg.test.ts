import { describe, expect, it, vi } from "vitest";
import { createTripPersonSelfNicknamePgPort } from "./tripPersonSelfNicknamePg";
import {
  selfNicknameIntentDigest,
  type SelfNicknameIntent,
} from "../../src/domain/trip/tripPersonSelfNickname";
const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ctx = { accountId: id(1), tripId: id(2), personId: id(3) };
const intent: SelfNicknameIntent = {
  contractVersion: 1,
  command: "SET_SELF_TRIP_NICKNAME",
  operationId: id(4),
  tripId: ctx.tripId,
  personId: ctx.personId,
  expectedNicknameRevision: 0,
  nickname: null,
};
const command = {
  ...intent,
  intentDigest: selfNicknameIntentDigest(intent, ctx.accountId),
};
const receipt = {
  receiptVersion: 1,
  receiptId: id(5),
  actorAccountId: ctx.accountId,
  tripId: ctx.tripId,
  personId: ctx.personId,
  operationId: id(4),
  intentDigest: command.intentDigest,
  expectedNicknameRevision: 0,
  desiredNickname: null,
  outcome: "APPLIED",
  prior: { nickname: "old", nicknameRevision: 0 },
  resulting: { nickname: null, nicknameRevision: 1 },
  acceptedAt: "2026-11-05T00:00:00Z",
};
function fixture(initial: unknown) {
  let response = initial;
  let failure: unknown;
  let commitFailure = false;
  let rollbackFailure = false;
  const query = vi.fn(async (sql: string, _params?: readonly unknown[]) => {
    if (sql.includes("trip_person_self_nickname(")) {
      if (failure) throw failure;
      return { rows: [{ result: response }] };
    }
    if (sql === "COMMIT" && commitFailure) throw new Error("private uncertain COMMIT");
    if (sql === "ROLLBACK" && rollbackFailure)
      throw new Error("private rollback failure");
    return { rows: [] };
  });
  const retire = vi.fn();
  const port = createTripPersonSelfNicknamePgPort({
    withLease: async (work) => work({ query, retire }),
  });
  return {
    port,
    query,
    retire,
    set: (v: unknown) => (response = v),
    fail: (e: unknown) => (failure = e),
    commitFail: () => (commitFailure = true),
    rollbackFail: () => (rollbackFailure = true),
  };
}
describe("Self nickname Core PG adapter (no runtime mounting)", () => {
  it("uses one transaction and trusted context, returns exact mutation envelope", async () => {
    const f = fixture({ receipt, idempotentReplay: false });
    expect(await f.port.execute(ctx, command)).toEqual({
      receipt,
      idempotentReplay: false,
    });
    expect(f.query.mock.calls.map((x) => x[0])).toEqual([
      "BEGIN",
      "SELECT set_config('otr.core.actor',$1,true),set_config('otr.core.trip',$2,true)",
      "SELECT public.trip_person_self_nickname($1::uuid,$2::uuid,$3::uuid,$4::text,$5::jsonb) AS result",
      "COMMIT",
    ]);
    expect(f.query.mock.calls[1][1]).toEqual([ctx.accountId, ctx.tripId]);
  });
  it("reads current state independently of historical receipt", async () => {
    const read = {
      ...ctx,
      contractVersion: 1,
      nickname: "later",
      nicknameRevision: 7,
      observedAt: "2026-11-05T00:00:00Z",
    };
    const f = fixture(read);
    expect(await f.port.read(ctx)).toEqual(read);
  });
  it("recovers exact original receipt without mutation or replay flag", async () => {
    const f = fixture({ kind: "EXACT_RECEIPT", receipt });
    expect(
      await f.port.recover(ctx, id(4), { intentDigest: command.intentDigest }),
    ).toEqual({ kind: "EXACT_RECEIPT", receipt });
    expect(f.query.mock.calls[2][1]?.[3]).toBe("RECEIPT");
  });
  it("preserves absent uncertainty without fallback submission", async () => {
    const f = fixture({ kind: "ABSENT_UNCONFIRMED" });
    expect(
      await f.port.recover(ctx, id(4), { intentDigest: command.intentDigest }),
    ).toEqual({ kind: "ABSENT_UNCONFIRMED" });
    expect(
      f.query.mock.calls.filter((x) => x[0].includes("trip_person_self_nickname(")),
    ).toHaveLength(1);
  });
  it.each([
    null,
    { kind: "EXACT_RECEIPT", receipt: { ...receipt, personId: id(9) } },
    { kind: "EXACT_RECEIPT", receipt, idempotentReplay: true },
    { kind: "ABSENT_UNCONFIRMED", receipt: null },
  ])("fails invalid recovery closed before commit %j", async (raw) => {
    const f = fixture(raw);
    await expect(
      f.port.recover(ctx, id(4), { intentDigest: command.intentDigest }),
    ).rejects.toMatchObject({ status: 503 });
    expect(f.query.mock.calls.some((x) => x[0] === "COMMIT")).toBe(false);
    expect(f.query.mock.calls.at(-1)?.[0]).toBe("ROLLBACK");
  });
  it.each([
    ["42501", 403],
    ["23505", 409],
    ["22023", 400],
    ["XX000", 503],
  ])("maps safe DB error %s", async (code, status) => {
    const f = fixture(null);
    f.fail({ code, message: "secret source body" });
    await expect(f.port.execute(ctx, command)).rejects.toMatchObject({ status });
    await expect(f.port.execute(ctx, command)).rejects.not.toMatchObject({
      message: "secret source body",
    });
  });
  it("rejects wrong actor before acquiring connection", async () => {
    const f = fixture(null);
    await expect(f.port.execute({ ...ctx, accountId: id(9) }, command)).rejects.toThrow();
    expect(f.query).not.toHaveBeenCalled();
  });
  it("does not retry uncertain COMMIT and retires on rollback failure", async () => {
    const f = fixture({ receipt, idempotentReplay: false });
    f.commitFail();
    f.rollbackFail();
    await expect(f.port.execute(ctx, command)).rejects.toMatchObject({
      code: "SELF_NICKNAME_UNAVAILABLE",
    });
    expect(f.retire).toHaveBeenCalledTimes(1);
    expect(
      f.query.mock.calls.filter((x) => x[0].includes("trip_person_self_nickname(")),
    ).toHaveLength(1);
  });
});
