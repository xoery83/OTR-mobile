import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { fixture } from "./guestAdoptionCompositePlan.fixture";
import { prepareGuestAdoptionCompositePlan } from "./guestAdoptionCompositePlan";
import { publishGuestAdoptionPg } from "./guestAdoptionPublicationPg";
import { executeGuestAdoptionCompositePgOnTransaction } from "./guestAdoptionCompositePg";
import { coreHashValue } from "../../src/domain/trip/tripCoreV2Read";
import { mapGuestAdoptionCommandIdentity } from "../../src/domain/auth/guestAdoptionIdentityMapping";
import { validateCoreCommand } from "../../src/domain/trip/tripCoreV2Commands";
import { tripCoreSha256Hex } from "../../src/data/repositories/tripCoreSha256";
import type { GuestAdoptionReceipt } from "../../src/domain/auth/guestAdoptionReceipt";
import type { CorePgConnection } from "./tripCoreV2PgStorage";
vi.mock("./guestAdoptionCompositePg", () => ({
  executeGuestAdoptionCompositePgOnTransaction: vi.fn(async () => ({
    authority: "NONE",
    canonicalText: "unused-component",
    sha256: "a".repeat(64),
  })),
}));
async function harness() {
  vi.mocked(executeGuestAdoptionCompositePgOnTransaction).mockClear();
  const f = fixture(),
    checkpoint = await f.source();
  const plan = await prepareGuestAdoptionCompositePlan(
    f.user,
    { grant: f.grant, preparationSha256: checkpoint.sha256 },
    checkpoint,
  );
  const {
    resources: _resources,
    status: _status,
    grantId: _grant,
    policyVersion: _policy,
    expiresAt: _expiry,
    ...binding
  } = f.grant;
  const owner = randomUUID(),
    source = f.body.trips[0],
    command = mapGuestAdoptionCommandIdentity(
      validateCoreCommand(source.coreIntents[0].command),
      new Map([[source.creator.personId, owner]]),
    );
  const body: Omit<
    Extract<GuestAdoptionReceipt, { outcome: "PUBLISHED" }>,
    "receiptSha256"
  > = {
    ...binding,
    contractVersion: 1,
    schemaId: "otr.auth.guest-adoption-receipt/1",
    receiptId: randomUUID(),
    grantId: f.grant.grantId,
    policyVersion: f.grant.policyVersion,
    recordedAt: "2026-10-30T00:00:00Z",
    outcome: "PUBLISHED",
    preparationSha256: checkpoint.sha256,
    planSha256: plan.sha256,
    executionSha256: "a".repeat(64),
    trips: [
      {
        tripId: source.create.tripId,
        createOperationId: source.create.operationId,
        sourceCreatorPersonId: source.creator.personId,
        ownerPersonId: owner,
        personMappings: [
          { sourcePersonId: source.creator.personId, targetPersonId: owner },
        ],
        ledgerSnapshotSha256: "b".repeat(64),
        operations: [
          {
            queueId: source.create.operationId,
            operationId: source.create.operationId,
            kind: "TRIP_CREATE",
            owningReceiptSha256: "c".repeat(64),
            domainReceiptId: null,
            sourceIntentSha256: null,
            mappedIntentSha256: null,
          },
          {
            queueId: command.operationId,
            operationId: command.operationId,
            kind: "CORE",
            owningReceiptSha256: "d".repeat(64),
            domainReceiptId: randomUUID(),
            sourceIntentSha256: source.coreIntents[0].sha256,
            mappedIntentSha256: await coreHashValue(
              "otr-trip-core-intent-v2",
              command,
              tripCoreSha256Hex,
            ),
          },
        ],
      },
    ],
  };
  let receipt = {
    ...body,
    receiptSha256: await coreHashValue(
      "otr-auth-guest-adoption-receipt-v1",
      body,
      tripCoreSha256Hex,
    ),
  };
  const flags = {
    existing: false,
    commitLost: false,
    wrongStatus: false,
    wrongPlan: false,
  };
  const retire = vi.fn(),
    statements: string[] = [],
    controller = new AbortController();
  const query = vi.fn(async (sql: string, _params?: readonly unknown[]) => {
    statements.push(sql);
    if (sql.includes("session_user AS principal"))
      return {
        rows: [
          { principal: "otr_trip_core_v2_gateway", role: "otr_trip_core_v2_gateway" },
        ],
      };
    if (sql.includes(".publication_lock("))
      return { rows: [{ result: flags.existing ? receipt : null }] };
    if (sql.includes(".read_scope("))
      return {
        rows: [
          {
            result: {
              planText: plan.canonicalText,
              planSha256: flags.wrongPlan ? "0".repeat(64) : plan.sha256,
            },
          },
        ],
      };
    if (sql.includes(".publish(")) return { rows: [{ result: receipt }] };
    if (sql.includes(".status("))
      return {
        rows: [
          {
            result: {
              ...binding,
              status: "PUBLISHED",
              nextAction: "READ_PUBLICATION_RECEIPT",
              receipt: {
                receiptId: flags.wrongStatus ? randomUUID() : receipt.receiptId,
                receiptSha256: receipt.receiptSha256,
              },
            },
          },
        ],
      };
    if (sql === "COMMIT" && flags.commitLost) throw Error("reply lost");
    return { rows: [] };
  });
  const connection: CorePgConnection = {
    withLease: async (work) => work({ query, retire }),
  };
  const request = { ...binding, planSha256: plan.sha256 };
  return {
    f,
    plan,
    receipt,
    flags,
    request,
    query,
    retire,
    statements,
    controller,
    connection,
    async corruptCoverage() {
      body.trips[0].operations[1].mappedIntentSha256 = "9".repeat(64);
      receipt = {
        ...body,
        receiptSha256: await coreHashValue(
          "otr-auth-guest-adoption-receipt-v1",
          body,
          tripCoreSha256Hex,
        ),
      };
    },
    publish: () => publishGuestAdoptionPg(connection, f.user, request, controller.signal),
  };
}
it("commits only after owning execution, source coverage and actual terminal pointer qualification", async () => {
  const h = await harness();
  expect(await h.publish()).toEqual(h.receipt);
  expect(executeGuestAdoptionCompositePgOnTransaction).toHaveBeenCalledOnce();
  expect(h.statements.at(-1)).toBe("COMMIT");
  expect(h.statements.findIndex((s) => s.includes(".publish("))).toBeLessThan(
    h.statements.indexOf("COMMIT"),
  );
});
it("returns the same committed receipt without invoking execution again", async () => {
  const h = await harness();
  h.flags.existing = true;
  expect(await h.publish()).toEqual(h.receipt);
  expect(executeGuestAdoptionCompositePgOnTransaction).not.toHaveBeenCalled();
  expect(
    h.statements.some((s) => s.includes(".publish(") || s.includes(".read_scope(")),
  ).toBe(false);
});
it.each(["wrongStatus", "wrongPlan"] as const)(
  "rolls back before COMMIT on %s",
  async (flag) => {
    const h = await harness();
    h.flags[flag] = true;
    await expect(h.publish()).rejects.toThrow();
    expect(h.statements.at(-1)).toBe("ROLLBACK");
    expect(h.statements).not.toContain("COMMIT");
  },
);
it("does not accept a self-consistently hashed but wrong mapped intent", async () => {
  const h = await harness();
  await h.corruptCoverage();
  await expect(h.publish()).rejects.toThrow("COVERAGE_MISMATCH");
  expect(h.statements).not.toContain("COMMIT");
});
it("keeps commit response loss UNKNOWN without retrying the owning mutation", async () => {
  const h = await harness();
  h.flags.commitLost = true;
  await expect(h.publish()).rejects.toThrow("PUBLICATION_OUTCOME_UNKNOWN");
  expect(h.retire).toHaveBeenCalled();
  expect(executeGuestAdoptionCompositePgOnTransaction).toHaveBeenCalledOnce();
  expect(h.statements.filter((s) => s.includes(".publish("))).toHaveLength(1);
});
it("rejects a different target before opening a connection", async () => {
  const h = await harness();
  h.request.targetAccountId = randomUUID();
  await expect(h.publish()).rejects.toThrow("TARGET_MISMATCH");
  expect(h.query).not.toHaveBeenCalled();
});
it("rejects non-normal Accounts and pre-cancelled requests before work", async () => {
  const h = await harness();
  await expect(
    publishGuestAdoptionPg(
      h.connection,
      { id: h.f.user.id, accountClass: "ANONYMOUS" },
      h.request,
      h.controller.signal,
    ),
  ).rejects.toThrow("NORMAL_ACCOUNT_REQUIRED");
  h.controller.abort();
  await expect(h.publish()).rejects.toThrow("PUBLICATION_ABORTED");
  expect(h.query).not.toHaveBeenCalled();
});
it("pins the target and request before an awaited connection lease", async () => {
  const h = await harness(),
    actor = h.f.user.id;
  const connection: CorePgConnection = {
    withLease: async (work) => {
      h.f.user.id = randomUUID();
      h.request.targetAccountId = randomUUID();
      return h.connection.withLease(work);
    },
  };
  expect(
    await publishGuestAdoptionPg(
      connection,
      { ...h.f.user, id: actor },
      { ...h.request, targetAccountId: actor },
      h.controller.signal,
    ),
  ).toEqual(h.receipt);
  expect(
    h.query.mock.calls.find(([sql]) => sql.includes(".publication_lock("))![1]![0],
  ).toBe(actor);
});
it("fences late SQL completion after an outer connection deadline", async () => {
  const h = await harness();
  let entered!: () => void, finish!: () => void, task: Promise<unknown> | undefined;
  const started = new Promise<void>((r) => {
      entered = r;
    }),
    pending = new Promise<void>((r) => {
      finish = r;
    });
  const connection: CorePgConnection = {
    withLease: async (work) => {
      task = work({
        retire: h.retire,
        query: async (sql, params) => {
          const result = await h.query(sql, params);
          if (sql.includes(".publish(")) {
            entered();
            await pending;
          }
          return result;
        },
      });
      void task.catch(() => undefined);
      await started;
      throw Error("lease deadline");
    },
  };
  await expect(
    publishGuestAdoptionPg(connection, h.f.user, h.request, h.controller.signal),
  ).rejects.toThrow("lease deadline");
  finish();
  await expect(task).rejects.toThrow("PUBLICATION_ABORTED");
  expect(h.statements).not.toContain("COMMIT");
  expect(h.retire).toHaveBeenCalled();
});
