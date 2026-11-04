import { createHash } from "node:crypto";
import { expect, it, vi } from "vitest";
import plan from "../../docs/ops/auth-c04-distinct-p1-next-day-20261104/CASE.json";
import {
  distinctSharedP1CaseId as caseId, distinctSharedP1Command as command,
  fixtureCommands, createOwnerItemFixtures, fixtureTransport,
  checkDistinctSharedP1Read, readOriginalFixtureOutcome, runItemFixtureProbe,
} from "../../scripts/auth/member-claim-qa-item-fixtures";
import { coreClosedCapabilities } from "../../src/domain/trip/tripCoreV2Commands";
import { coreHashValue, type CoreReadRecord } from "../../src/domain/trip/tripCoreV2Read";
const ctx = { accountId: plan.ownerAccountId, tripId: plan.tripId, generation: 0 };
const binding = (account_id: string, person_id: string): CoreReadRecord => ({
  kind: "PERSON_BINDING", id: person_id, revision: 1,
  body: { account_id, person_id, active: true, participating: true },
});
const a = binding(plan.ownerAccountId, plan.ownerPersonId);
const b = binding(plan.memberAccountId, plan.memberPersonId);
const item: CoreReadRecord = { kind: "ITEM", id: plan.itemId, revision: 1, body: {
  id: plan.itemId, trip_id: plan.tripId, owner_account_id: plan.ownerAccountId,
  visibility: "GROUP", experience_family: "P1", participation_mode: "WHOLE_GROUP",
  title: plan.intent.title, description: plan.intent.description,
  start_local_date: plan.intent.date,
} };
const hash = async (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
async function setup() {
  const receipt = { projection: "FULL", domainReceiptId: plan.itemId, receipt: {
    actorAccountId: plan.ownerAccountId, tripId: plan.tripId,
    operationId: plan.operationId, command: "CREATE_ITEM",
    intentSha256: await coreHashValue("otr-trip-core-intent-v2", command, hash),
    outcome: "APPLIED", result: { created: [command.target] }, receiptSha256: "a".repeat(64),
  } };
  const transport = {
    capabilities: vi.fn().mockResolvedValue({ ...coreClosedCapabilities,
      activationState: "ENABLED", enabledCommands: ["CREATE_ITEM"],
      enabledFamilies: ["P1"], enabledAdmissionModes: ["MANUAL"],
    }),
    collection: vi.fn().mockResolvedValue({ pages: [{ records: [a, item] }] }),
    receipt: vi.fn().mockResolvedValue(null),
    submit: vi.fn().mockResolvedValue(receipt),
  };
  transport.collection.mockResolvedValueOnce({ pages: [{ records: [a] }] });
  return { transport, receipt, context: ctx, caseId: caseId as typeof caseId, qualifyDistinct: vi.fn().mockResolvedValue(undefined),
    reserve: vi.fn().mockResolvedValue(undefined), note: vi.fn() };
}
it("fixes a substantively separate event and immutable command without modifying the historical UNKNOWN", () => {
  expect(command.operationId).not.toBe(fixtureCommands[0].operationId);
  expect(command.target.id).not.toBe(fixtureCommands[0].target.id);
  expect(command.payload).not.toEqual(fixtureCommands[0].payload);
  expect(plan.intent.date).not.toBe(plan.distinctFromOriginal.originalDate);
  expect(plan.intent.title).not.toBe(plan.distinctFromOriginal.originalTitle);
  expect(plan.distinctFromOriginal.originalReplayAllowed).toBe(false);
  expect(Object.isFrozen(command.payload)).toBe(true);
});
it("requires current distinct-case qualification before any session or Core IO", async () => {
  const s = await setup();
  const session = vi.fn();
  await expect(runItemFixtureProbe({ caseId, withOwnerSession: session, withMemberSession: session,
    reserve: s.reserve, note: s.note })).rejects.toThrow("QUALIFICATION_REQUIRED");
  expect(session).not.toHaveBeenCalled();
  await expect(createOwnerItemFixtures({ ...s, qualifyDistinct: undefined })).rejects.toThrow("QUALIFICATION_REQUIRED");
  expect(s.transport.capabilities).not.toHaveBeenCalled();
});
it("writes only the fixed new command once; response loss recovers the same new receipt, not f5e", async () => {
  const s = await setup();
  s.transport.submit.mockRejectedValueOnce(Error("lost response"));
  s.transport.receipt.mockResolvedValueOnce(null).mockResolvedValueOnce(s.receipt);
  s.reserve.mockImplementation(async (copy) => { copy.operationId = plan.tripId; });
  await createOwnerItemFixtures(s);
  expect(s.transport.submit).toHaveBeenCalledExactlyOnceWith(ctx, command);
  expect(s.qualifyDistinct).toHaveBeenCalledTimes(2);
  expect(s.transport.receipt.mock.calls.map((x) => x[1])).toEqual([plan.operationId, plan.operationId]);
});
it("stops on new UNKNOWN and leaves all historical operations untouched", async () => {
  const s = await setup();
  s.transport.submit.mockRejectedValueOnce(Error("lost response"));
  await expect(createOwnerItemFixtures(s)).rejects.toThrow("UNKNOWN_OR_REDACTED");
  expect(s.transport.submit).toHaveBeenCalledTimes(1);
  expect(s.transport.receipt.mock.calls.every((x) => x[1] === plan.operationId)).toBe(true);
  const recovery = { receipt: vi.fn().mockResolvedValue(null),
    collection: vi.fn().mockResolvedValue({ pages: [{ records: [a, item] }] }) };
  await expect(readOriginalFixtureOutcome(recovery, ctx, caseId)).resolves.toMatchObject({
    outcome: "UNKNOWN", itemObserved: true, automaticRetry: false,
  });
  expect(recovery.receipt).toHaveBeenCalledExactlyOnceWith(ctx, plan.operationId);
});
it("requires independent exact member/item/date/revision readback, not an empty success or private-item claim", () => {
  expect(checkDistinctSharedP1Read([a, item], [b, item])).toMatchObject({ sharedItemRead: "PASS",
    privateItemNegative: "NO_QUALIFIED_PRIVATE_FIXTURE" });
  for (const rows of [[b], [a, item], [b, { ...item, revision: 2 }],
    [b, { ...item, body: { ...(item.body as object), start_local_date: "2026-11-04" } }]])
    expect(() => checkDistinctSharedP1Read([a, item], rows)).toThrow();
});
it("rejects historical POST bodies and all member POSTs before the wire", async () => {
  const wire = vi.fn(); vi.stubGlobal("fetch", wire);
  try {
    for (const accountId of [plan.ownerAccountId, plan.memberAccountId]) {
      const t = fixtureTransport({ accountId, tripId: plan.tripId,
        readSession: async () => ({ identity: { userId: accountId }, accessToken: "unit-only" }) as never,
      }, vi.fn(), caseId);
      const c = { ...ctx, accountId };
      await expect(t.submit(c, accountId === plan.ownerAccountId ? fixtureCommands[0] : command)).rejects.toThrow();
      if (accountId === plan.memberAccountId) {
        await expect(t.capabilities(c)).rejects.toThrow();
        await expect(t.receipt(c, plan.operationId)).rejects.toThrow();
      }
    }
    expect(wire).not.toHaveBeenCalled();
  } finally { vi.unstubAllGlobals(); }
});

it("checks expiry before submit and limits the new case to one wire POST even on401 retry", async () => {
  const s = await setup();
  s.qualifyDistinct.mockResolvedValueOnce(undefined).mockRejectedValueOnce(Error("SCOPE_EXPIRED"));
  await expect(createOwnerItemFixtures(s)).rejects.toThrow("SCOPE_EXPIRED");
  expect(s.transport.submit).not.toHaveBeenCalled();
  const wire = vi.fn().mockResolvedValue(new Response("{}", { status: 401 }));
  vi.stubGlobal("fetch", wire);
  try {
    const qualify = vi.fn().mockResolvedValue(undefined);
    const t = fixtureTransport({ accountId: plan.ownerAccountId, tripId: plan.tripId,
      readSession: async () => ({ identity: { userId: plan.ownerAccountId }, accessToken: "unit-only" }) as never,
    }, vi.fn(), caseId, qualify);
    await expect(t.submit(ctx, command)).rejects.toThrow();
    expect(wire).toHaveBeenCalledTimes(1);
    expect(qualify).toHaveBeenCalledTimes(1);
    expect(wire.mock.calls[0][1].body).toBe(JSON.stringify(command));
  } finally { vi.unstubAllGlobals(); }
});

it("keeps the actual exclusive reservation across process restarts without any Auth or network IO", async () => {
  const { execFileSync } = await import("node:child_process");
  const { mkdtempSync, mkdirSync, rmSync, readFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { resolve, join } = await import("node:path");
  const directory = mkdtempSync(join(tmpdir(), "otr-distinct-reserve-test-"));
  const target = "docs/ops/auth-c04-distinct-p1-next-day-20261104";
  mkdirSync(join(directory, target), { recursive: true });
  const runner = resolve("scripts/auth/distinct-shared-p1-next-day.ts");
  const fixture = resolve("scripts/auth/member-claim-qa-item-fixtures.ts");
  const tsx = resolve("node_modules/tsx/dist/loader.mjs");
  const childOptions = { cwd: directory, stdio: "pipe" as const,
    env: { ...process.env, TSX_TSCONFIG_PATH: resolve("tsconfig.json") } };
  const call = `import {reserveDistinctSharedP1Attempt} from ${JSON.stringify(runner)};
    import {distinctSharedP1Command} from ${JSON.stringify(fixture)};
    await reserveDistinctSharedP1Attempt(distinctSharedP1Command,
      "4c2efd64aa6537a2694da25dfe44ebb2c96c3a734f48083b15b78b43382858b5");`;
  try {
    execFileSync(process.execPath, ["--import", tsx, "--input-type=module", "-e", call], childOptions);
    expect(JSON.parse(readFileSync(join(directory, target, "ATTEMPT.json"), "utf8"))).toMatchObject({
      phase: "RESERVED_NOT_PROOF_OF_COMMIT", command: { operationId: plan.operationId }, automaticRetry: false,
    });
    expect(() => execFileSync(process.execPath, ["--import", tsx, "--input-type=module", "-e", call],
      childOptions)).toThrow();
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

it("accepts full Item projection fields while preserving qualified private-item leakage rejection", () => {
  const privateItem = { ...item, id: "retained-private-fixture", body: {
    ...(item.body as object), visibility: "PRIVATE",
  } };
  expect(checkDistinctSharedP1Read([a, item, privateItem], [b, item])).toMatchObject({
    privateItemNegative: "OWNER_PRIVATE_ITEMS_ABSENT_FOR_B", qualifiedPrivateItemCount: 1,
  });
  expect(() => checkDistinctSharedP1Read([a, item, privateItem], [b, item, privateItem])).toThrow("PRIVATE_ITEM_LEAK");
});
