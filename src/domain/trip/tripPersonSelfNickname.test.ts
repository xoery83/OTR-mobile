import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  parseSelfNicknameCommand,
  parseSelfNicknameObservation,
  parseSelfNicknameReceipt,
  selfNicknameCommandSchema,
  selfNicknameFromStorage,
  selfNicknameIntentBytes,
  selfNicknameIntentDigest,
  selfNicknameReceiptSchema,
  selfNicknameToStorage,
  type SelfNicknameIntent,
} from "./tripPersonSelfNickname";

import golden from "../../../docs/ops/core-self-trip-nickname-contract-20261105/GOLDEN_VECTOR.json";
import {
  parseSelfNicknameMutationResponse,
  parseSelfNicknameRecoverResponse,
  selfNicknameRecoverRequestSchema,
} from "./tripPersonSelfNickname";

const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const context = { accountId: id(1), tripId: id(2), personId: id(3) };
const time = "2026-11-05T00:00:00Z";
const intent: SelfNicknameIntent = {
  contractVersion: 1,
  command: "SET_SELF_TRIP_NICKNAME",
  operationId: id(4),
  tripId: id(2),
  personId: id(3),
  expectedNicknameRevision: 0,
  nickname: "旅人 Å",
};
const command = (value = intent) => ({
  ...value,
  intentDigest: selfNicknameIntentDigest(value, context.accountId),
});
const receipt = () => ({
  receiptVersion: 1,
  receiptId: id(5),
  actorAccountId: context.accountId,
  tripId: context.tripId,
  personId: context.personId,
  operationId: id(4),
  intentDigest: command().intentDigest,
  expectedNicknameRevision: 0,
  desiredNickname: intent.nickname,
  outcome: "APPLIED",
  prior: { nickname: " old ".repeat(100), nicknameRevision: 0 },
  resulting: { nickname: intent.nickname, nicknameRevision: 1 },
  acceptedAt: time,
});

describe("Self Trip Nickname proposed canonical v1", () => {
  it("binds exact canonical bytes independently, without normalizing Unicode", () => {
    const bytes = selfNicknameIntentBytes(intent, context.accountId);
    expect(selfNicknameIntentDigest(intent, context.accountId)).toBe(
      createHash("sha256").update(bytes, "utf8").digest("hex"),
    );
    expect(
      selfNicknameIntentDigest({ ...intent, nickname: "é" }, context.accountId),
    ).not.toBe(
      selfNicknameIntentDigest({ ...intent, nickname: "e\u0301" }, context.accountId),
    );
    expect(parseSelfNicknameCommand(command(), context)).toEqual(command());
  });
  it.each(["accountId", "tripId", "personId"] as const)(
    "rejects different trusted %s",
    (key) => {
      expect(() =>
        parseSelfNicknameCommand(command(), { ...context, [key]: id(9) }),
      ).toThrow();
    },
  );
  it.each([
    {},
    { nickname: undefined },
    { nickname: "" },
    { nickname: " a" },
    { nickname: "a " },
    { nickname: "a\0" },
    { nickname: "\ud800" },
    { nickname: "a".repeat(257) },
    { expectedNicknameRevision: -0 },
    { expectedNicknameRevision: -1 },
    { expectedNicknameRevision: 0.5 },
    { expectedNicknameRevision: Number.MAX_SAFE_INTEGER + 1 },
    { operationId: "invalid" },
    { actorAccountId: id(9) },
    { participationRevision: 0 },
    { expectedRevision: 0 },
    { displayName: "x" },
  ])("rejects invalid/foreign fields %j", (patch) => {
    const raw: Record<string, unknown> = { ...command(), ...patch };
    if (!Object.keys(patch).length) delete raw.nickname;
    expect(selfNicknameCommandSchema.safeParse(raw).success).toBe(false);
  });
  it("counts Unicode scalars for SET and keeps explicit null distinct from omission", () => {
    expect(
      parseSelfNicknameCommand(
        command({ ...intent, nickname: "🚂".repeat(256) }),
        context,
      ).nickname,
    ).toHaveLength(512);
    expect(
      parseSelfNicknameCommand(command({ ...intent, nickname: null }), context).nickname,
    ).toBeNull();
    expect(selfNicknameFromStorage("")).toBeNull();
    expect(selfNicknameToStorage(null)).toBe("");
    expect(() => selfNicknameToStorage("")).toThrow();
  });
  it("accepts unbounded legacy prior and observation while still rejecting empty wire observation", () => {
    const legacy = " old ".repeat(100);
    expect(parseSelfNicknameReceipt(receipt(), command(), context).prior.nickname).toBe(
      legacy,
    );
    expect(selfNicknameFromStorage(legacy)).toBe(legacy);
    const read = {
      ...context,
      contractVersion: 1,
      nickname: legacy,
      nicknameRevision: 11,
      observedAt: time,
    };
    expect(parseSelfNicknameObservation(read, context).nickname).toBe(legacy);
    expect(() =>
      parseSelfNicknameObservation({ ...read, nickname: "" }, context),
    ).toThrow();
    expect(() =>
      parseSelfNicknameObservation(read, { ...context, accountId: id(9) }),
    ).toThrow();
  });
  it("accepts clearing legacy value and leaves historical receipt independent of fresh read", () => {
    const c = command({ ...intent, nickname: null });
    const r = {
      ...receipt(),
      desiredNickname: null,
      intentDigest: c.intentDigest,
      resulting: { nickname: null, nicknameRevision: 1 },
    };
    expect(parseSelfNicknameReceipt(r, c, context).resulting.nickname).toBeNull();
    expect(
      parseSelfNicknameObservation(
        {
          ...context,
          contractVersion: 1,
          nickname: "later",
          nicknameRevision: 8,
          observedAt: time,
        },
        context,
      ).nicknameRevision,
    ).toBe(8);
    expect(parseSelfNicknameReceipt(r, c, context).resulting.nicknameRevision).toBe(1);
  });
  it("validates UNCHANGED and REVISION_CONFLICT without rebase", () => {
    const r = receipt();
    expect(
      selfNicknameReceiptSchema.parse({
        ...r,
        outcome: "UNCHANGED",
        prior: r.resulting,
        expectedNicknameRevision: 1,
      }).outcome,
    ).toBe("UNCHANGED");
    expect(
      selfNicknameReceiptSchema.parse({
        ...r,
        outcome: "REVISION_CONFLICT",
        prior: r.resulting,
      }).outcome,
    ).toBe("REVISION_CONFLICT");
    expect(() =>
      selfNicknameReceiptSchema.parse({
        ...r,
        outcome: "REVISION_CONFLICT",
        resulting: r.prior,
      }),
    ).toThrow();
  });
  it.each(["actorAccountId", "tripId", "personId", "operationId", "receiptId"])(
    "validates receipt %s",
    (key) => {
      const r = { ...receipt(), [key]: key === "receiptId" ? "bad" : id(9) };
      expect(() => parseSelfNicknameReceipt(r, command(), context)).toThrow();
    },
  );
  it("rejects tampered desired/digest/base and outcome revisions, including overflow", () => {
    for (const patch of [
      { desiredNickname: "other" },
      { intentDigest: "0".repeat(64) },
      { expectedNicknameRevision: 1 },
      { resulting: { nickname: intent.nickname, nicknameRevision: 0 } },
      {
        prior: { nickname: "old", nicknameRevision: Number.MAX_SAFE_INTEGER },
        expectedNicknameRevision: Number.MAX_SAFE_INTEGER,
        resulting: {
          nickname: intent.nickname,
          nicknameRevision: Number.MAX_SAFE_INTEGER + 1,
        },
      },
      { participationRevision: 1 },
    ])
      expect(() =>
        parseSelfNicknameReceipt({ ...receipt(), ...patch }, command(), context),
      ).toThrow();
  });
});

it("matches independent Python UTF8 vector with actual newline byte", () => {
  const v = golden.input;
  const raw: SelfNicknameIntent = {
    contractVersion: 1,
    command: "SET_SELF_TRIP_NICKNAME",
    operationId: v.operationId,
    tripId: v.tripId,
    personId: v.personId,
    expectedNicknameRevision: v.expectedNicknameRevision,
    nickname: v.nickname,
  };
  expect(selfNicknameIntentBytes(raw, v.trustedActorAccountId)).toBe(
    golden.canonicalText,
  );
  expect(
    Buffer.from(selfNicknameIntentBytes(raw, v.trustedActorAccountId)).toString("hex"),
  ).toBe(golden.utf8Hex);
  expect(selfNicknameIntentDigest(raw, v.trustedActorAccountId)).toBe(golden.sha256);
  expect(golden.canonicalText.charCodeAt("otr-self-trip-nickname-intent-v1".length)).toBe(
    10,
  );
});
it("strictly separates mutation replay from read-only recovery", () => {
  const applied = { receipt: receipt(), idempotentReplay: false };
  expect(parseSelfNicknameMutationResponse(applied, command(), context)).toEqual(applied);
  expect(
    parseSelfNicknameRecoverResponse(
      { kind: "EXACT_RECEIPT", receipt: receipt() },
      command(),
      context,
    ).kind,
  ).toBe("EXACT_RECEIPT");
  expect(
    parseSelfNicknameRecoverResponse({ kind: "ABSENT_UNCONFIRMED" }, command(), context),
  ).toEqual({ kind: "ABSENT_UNCONFIRMED" });
  expect(
    selfNicknameRecoverRequestSchema.parse({ intentDigest: command().intentDigest }),
  ).toEqual({ intentDigest: command().intentDigest });
  for (const value of [
    { intentDigest: command().intentDigest, operationId: id(4) },
    {},
    { intentDigest: "bad" },
  ])
    expect(selfNicknameRecoverRequestSchema.safeParse(value).success).toBe(false);
  for (const value of [
    { kind: "EXACT_RECEIPT", receipt: receipt(), idempotentReplay: true },
    { kind: "ABSENT_UNCONFIRMED", receipt: null },
    { ok: true, data: applied },
    null,
  ])
    expect(() => parseSelfNicknameRecoverResponse(value, command(), context)).toThrow();
  expect(() =>
    parseSelfNicknameMutationResponse(
      { ...applied, kind: "EXACT_RECEIPT" },
      command(),
      context,
    ),
  ).toThrow();
});
