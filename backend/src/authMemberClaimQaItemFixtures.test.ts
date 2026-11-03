import { expect, it, vi } from "vitest";
import qa from "../../docs/ops/auth-c04-item-fixture-20261104/CASE.json";
import {
  createOwnerItemFixtures,
  fixtureCommands,
  checkFixtureIsolation,
  fixtureTransport,
  readOriginalFixtureOutcome,
} from "../../scripts/auth/member-claim-qa-item-fixtures";
import { coreClosedCapabilities } from "../../src/domain/trip/tripCoreV2Commands";
import { coreHashValue, type CoreReadRecord } from "../../src/domain/trip/tripCoreV2Read";
import { createHash } from "node:crypto";
const context = { accountId: qa.ownerAccountId, tripId: qa.tripId, generation: 0 };
const binding = (account_id: string, person_id: string): CoreReadRecord => ({
  kind: "PERSON_BINDING",
  id: person_id,
  revision: 1,
  body: { account_id, person_id, active: true, participating: true },
});
const owner = binding(qa.ownerAccountId, qa.ownerPersonId),
  member = binding(qa.memberAccountId, qa.memberPersonId);
const records = qa.items.map((i): CoreReadRecord => ({
  kind: "ITEM",
  id: i.itemId,
  revision: 1,
  body: { owner_account_id: qa.ownerAccountId, visibility: i.visibility },
}));
const caps = {
  ...coreClosedCapabilities,
  activationState: "ENABLED",
  enabledCommands: ["CREATE_ITEM"],
  enabledFamilies: ["P1"],
  enabledAdmissionModes: ["MANUAL"],
};
function setup() {
  return {
    capabilities: vi.fn().mockResolvedValue(caps),
    collection: vi.fn().mockResolvedValue({ pages: [{ records: [owner] }] }),
    receipt: vi.fn().mockResolvedValue(null),
    submit: vi.fn(),
    reserve: vi.fn().mockResolvedValue(undefined),
    note: vi.fn(),
  };
}
it("requires real qualified shared and private records, not an empty-member success", () => {
  expect(checkFixtureIsolation([owner, ...records], [member, records[0]])).toMatchObject({
    sharedItemRead: "PASS",
    exactPrivateItemAbsent: "PASS",
  });
  for (const rows of [[member], [member, ...records]])
    expect(() => checkFixtureIsolation([owner, ...records], rows)).toThrow();
  expect(() => checkFixtureIsolation([owner], [member, records[0]])).toThrow();
});
it("refuses closed capabilities or wrong actor before any mutation", async () => {
  const s = setup();
  s.capabilities.mockResolvedValue(coreClosedCapabilities);
  await expect(createOwnerItemFixtures({ ...s, transport: s, context })).rejects.toThrow(
    "NOT_AVAILABLE",
  );
  await expect(
    createOwnerItemFixtures({
      ...s,
      transport: s,
      context: { ...context, accountId: qa.memberAccountId },
    }),
  ).rejects.toThrow("SCOPE_MISMATCH");
  expect(s.submit).not.toHaveBeenCalled();
  expect(s.reserve).not.toHaveBeenCalled();
});
it("does not POST when source binding, existing operation or durable journal fails", async () => {
  for (const condition of ["binding", "operation", "journal"]) {
    const s = setup();
    if (condition === "binding")
      s.collection.mockResolvedValue({ pages: [{ records: [member] }] });
    if (condition === "operation")
      s.receipt.mockResolvedValue({ projection: "STATUS_ONLY" });
    if (condition === "journal") s.reserve.mockRejectedValue(Error("disk"));
    await expect(
      createOwnerItemFixtures({ ...s, transport: s, context }),
    ).rejects.toThrow();
    expect(s.submit).not.toHaveBeenCalled();
  }
});
it("UNKNOWN reads only the original receipt, never retries or proceeds to the second mutation", async () => {
  const s = setup();
  s.submit.mockRejectedValue(Error("response lost"));
  await expect(createOwnerItemFixtures({ ...s, transport: s, context })).rejects.toThrow(
    "UNKNOWN_OR_REDACTED",
  );
  expect(s.submit).toHaveBeenCalledTimes(1);
  expect(s.reserve).toHaveBeenCalledTimes(1);
  expect(s.receipt.mock.calls.map((c) => c[1])).toEqual([
    qa.items[0].operationId,
    qa.items[0].operationId,
  ]);
});
it("recovers APPLIED original receipt then creates each remaining item once", async () => {
  const s = setup();
  s.reserve.mockImplementation(async (command) => {
    command.operationId = qa.tripId;
    command.target.id = qa.tripId;
    command.payload.core.title = "mutated journal copy";
  });
  const hash = async (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
  const replies = await Promise.all(
    fixtureCommands.map(async (c) => ({
      projection: "FULL",
      domainReceiptId: c.operationId,
      receipt: {
        actorAccountId: context.accountId,
        tripId: qa.tripId,
        operationId: c.operationId,
        command: "CREATE_ITEM",
        intentSha256: await coreHashValue("otr-trip-core-intent-v2", c, hash),
        outcome: "APPLIED",
        result: { created: [c.target] },
      },
    })),
  );
  s.submit.mockRejectedValueOnce(Error("lost")).mockResolvedValueOnce(replies[1]);
  s.receipt
    .mockResolvedValueOnce(null)
    .mockResolvedValueOnce(replies[0])
    .mockResolvedValueOnce(null);
  await createOwnerItemFixtures({ ...s, transport: s, context });
  expect(s.submit.mock.calls.map((c) => c[1].operationId)).toEqual(
    qa.items.map((i) => i.operationId),
  );
  expect(s.reserve).toHaveBeenCalledTimes(2);
});
it("allows only fixed commands once, including automatic auth retry attempts", async () => {
  const wire = vi.fn().mockResolvedValue(new Response("{}", { status: 401 }));
  vi.stubGlobal("fetch", wire);
  try {
    const transport = fixtureTransport(
      {
        ...context,
        readSession: vi.fn().mockResolvedValue({
          identity: { userId: context.accountId },
          accessToken: "synthetic-test-only",
        }),
      },
      vi.fn(),
    );
    await expect(transport.submit(context, fixtureCommands[0])).rejects.toThrow();
    expect(wire).toHaveBeenCalledTimes(1);
    expect(wire.mock.calls[0][1].body).toBe(JSON.stringify(fixtureCommands[0]));
    await expect(
      transport.submit(context, { ...fixtureCommands[0], operationId: qa.tripId }),
    ).rejects.toThrow();
    expect(wire).toHaveBeenCalledTimes(1);
  } finally {
    vi.unstubAllGlobals();
  }
});
it("read-only original recovery keeps absent or redacted receipts UNKNOWN even when an item exists", async () => {
  for (const receipt of [null, { projection: "STATUS_ONLY", outcome: "APPLIED" }]) {
    const transport = {
      receipt: vi.fn().mockResolvedValue(receipt),
      collection: vi
        .fn()
        .mockResolvedValue({ pages: [{ records: [owner, records[0]] }] }),
    };
    await expect(readOriginalFixtureOutcome(transport, context)).resolves.toEqual({
      outcome: "UNKNOWN",
      itemObserved: true,
      automaticRetry: false,
    });
    expect(transport.receipt).toHaveBeenCalledExactlyOnceWith(
      context,
      qa.items[0].operationId,
    );
  }
});
it("read-only original recovery rejects foreign scope before IO and mismatched intent before accepting a terminal receipt", async () => {
  const transport = {
    receipt: vi.fn().mockResolvedValue({
      projection: "FULL",
      receipt: {
        actorAccountId: context.accountId,
        tripId: context.tripId,
        operationId: qa.items[0].operationId,
        command: "CREATE_ITEM",
        intentSha256: "wrong",
        outcome: "APPLIED",
      },
    }),
    collection: vi.fn().mockResolvedValue({ pages: [{ records: [owner, records[0]] }] }),
  };
  await expect(
    readOriginalFixtureOutcome(transport, { ...context, accountId: qa.memberAccountId }),
  ).rejects.toThrow("SCOPE_MISMATCH");
  expect(transport.receipt).not.toHaveBeenCalled();
  await expect(readOriginalFixtureOutcome(transport, context)).rejects.toThrow(
    "RECEIPT_MISMATCH",
  );
});
it("read-only original recovery accepts exact APPLIED readback and rejects missing, private or foreign-owned item", async () => {
  const command = fixtureCommands[0];
  const transport = {
    receipt: vi.fn().mockResolvedValue({
      projection: "FULL",
      receipt: {
        actorAccountId: context.accountId,
        tripId: context.tripId,
        operationId: command.operationId,
        command: "CREATE_ITEM",
        intentSha256: await coreHashValue("otr-trip-core-intent-v2", command, async (b) =>
          createHash("sha256").update(b).digest("hex"),
        ),
        outcome: "APPLIED",
        result: { created: [command.target] },
        receiptSha256: "a".repeat(64),
      },
    }),
    collection: vi.fn().mockResolvedValue({ pages: [{ records: [owner, records[0]] }] }),
  };
  await expect(readOriginalFixtureOutcome(transport, context)).resolves.toMatchObject({
    outcome: "APPLIED",
    itemObserved: true,
    automaticRetry: false,
  });
  for (const items of [
    [],
    [
      {
        ...records[0],
        body: { owner_account_id: context.accountId, visibility: "PRIVATE" },
      },
    ],
    [
      {
        ...records[0],
        body: { owner_account_id: qa.memberAccountId, visibility: "GROUP" },
      },
    ],
  ]) {
    transport.collection.mockResolvedValue({ pages: [{ records: [owner, ...items] }] });
    await expect(readOriginalFixtureOutcome(transport, context)).rejects.toThrow(
      "APPLIED_READBACK_MISMATCH",
    );
  }
});
