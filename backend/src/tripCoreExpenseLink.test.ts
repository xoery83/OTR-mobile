import { randomUUID, createHash } from "node:crypto";
import { expect, it, vi } from "vitest";
import {
  applyCoreCommand,
  emptyCoreGraph,
  type CoreActor,
} from "../../src/domain/trip/tripCoreV2Mutation";
import { coreDefaults } from "../../src/domain/trip/tripCoreV2";
import { coreDateBoundary } from "../../src/domain/trip/tripCoreV2Temporal";
import { validateCoreCommand } from "../../src/domain/trip/tripCoreV2Commands";
import {
  validateCoreReceipt,
  type CoreReceipt,
} from "../../src/domain/trip/tripCoreV2Receipt";
import { executeCoreCommandV2, type CoreCommandStorage } from "./tripCoreV2Commands";
import type { CoreExpenseLinkDecision } from "./tripCoreExpenseLink";
const hash = async (bytes: Uint8Array) =>
    createHash("sha256").update(bytes).digest("hex"),
  now = "2026-11-16T00:00:00Z";
function fixture() {
  const actor: CoreActor = {
      accountId: randomUUID(),
      tripId: randomUUID(),
      active: true,
      canManageShared: false,
      personId: null,
      personIds: [],
    },
    item = randomUUID(),
    link = randomUUID(),
    expense = randomUUID();
  const common = {
    contractVersion: 2,
    intentVersion: 2,
    operationId: randomUUID(),
    tripId: actor.tripId,
    admission: { mode: "MANUAL", sourceIntentId: null, policyVersion: null },
  };
  let graph = applyCoreCommand(
    emptyCoreGraph(),
    {
      ...common,
      command: "CREATE_ITEM",
      target: { kind: "ITEM", id: item },
      baseVector: [{ kind: "ITEM", id: item, revision: null }],
      payload: {
        family: "P1",
        core: { title: "Original", description: "Retained" },
        schedule: { start: coreDateBoundary("2026-12-01") },
        ...coreDefaults("member"),
      },
    },
    actor,
    now,
  ).graph;
  const saved = new Map<string, CoreReceipt>(),
    proof = vi
      .fn<() => Promise<CoreExpenseLinkDecision | undefined>>()
      .mockResolvedValue({
        actorAccountId: actor.accountId,
        tripId: actor.tripId,
        linkId: link,
        expenseId: expense,
        itemId: item,
        expenseRevision: 3,
      }),
    commit = vi.fn();
  const storage: CoreCommandStorage = {
    withLockedCommand: async (scope, work) =>
      work({
        actor,
        readReceipt: async () =>
          saved.has(scope.operationId)
            ? {
                domainReceiptId: scope.operationId,
                receiptText: JSON.stringify(saved.get(scope.operationId)),
              }
            : null,
        hasLegacyOperation: async () => false,
        canReadReceipt: async () => true,
        enabledCommands: async () => ["LINK_EXPENSE", "UNLINK_EXPENSE"],
        readLockedGraph: async () => graph,
        verifyAdmission: async () => undefined,
        verifyExpenseLink: proof,
        lifecycleGraphHash: async () => undefined,
        commit: async (mutation, receipt) => {
          await validateCoreReceipt(receipt, hash);
          if (mutation) graph = mutation.graph;
          saved.set(scope.operationId, receipt);
          commit(receipt);
          return scope.operationId;
        },
      }),
  };
  const command = (
    name = "LINK_EXPENSE",
    present = false,
    revision = Number(graph.itinerary_events[0].semantic_revision),
  ) =>
    validateCoreCommand({
      ...common,
      operationId: randomUUID(),
      command: name,
      target: { kind: "EXPENSE_LINK", id: link },
      baseVector: [
        { kind: "EXPENSE_LINK", id: link, revision: present ? 1 : null },
        { kind: "ITEM", id: item, revision },
      ],
      payload: {
        expenseId: expense,
        targetKind: "ITEM",
        targetId: item,
        expectedExpenseRevision: 3,
      },
    });
  const execute = (c = command()) =>
    executeCoreCommandV2(storage, actor.accountId, actor.tripId, c, hash, () => now);
  return {
    actor,
    item,
    link,
    expense,
    proof,
    commit,
    command,
    execute,
    get graph() {
      return graph;
    },
  };
}
it("records immutable relation facts and presence vector in the original Core journal", async () => {
  const f = fixture(),
    before = structuredClone(f.graph.itinerary_events[0]),
    command = f.command(),
    linked = await f.execute(command);
  expect(linked.projection).toBe("FULL");
  if (linked.projection !== "FULL") throw Error("FULL required");
  expect(linked.receipt.outcome).toBe("APPLIED");
  expect(
    linked.receipt.targetVector.find((v) => v.kind === "EXPENSE_LINK")?.committedRevision,
  ).toBe(1);
  expect(linked.receipt.result.created).toContainEqual({
    kind: "EXPENSE_LINK",
    id: f.link,
  });
  expect(linked.receipt.audit.after.some((a) => a.kind === "EXPENSE_LINK")).toBe(true);
  expect(f.graph.itinerary_events[0].field_state).toEqual(before.field_state);
  const removed = await f.execute(f.command("UNLINK_EXPENSE", true));
  if (removed.projection !== "FULL") throw Error("FULL required");
  expect(removed.receipt.outcome).toBe("APPLIED");
  expect(
    removed.receipt.targetVector.find((v) => v.kind === "EXPENSE_LINK")
      ?.committedRevision,
  ).toBeNull();
  expect(removed.receipt.audit.before.some((a) => a.kind === "EXPENSE_LINK")).toBe(true);
  expect(removed.receipt.audit.after.some((a) => a.kind === "EXPENSE_LINK")).toBe(false);
  expect(f.graph.expense_links).toEqual([]);
  expect(f.graph.itinerary_events[0].semantic_revision).toBe(3);
  const commits = f.commit.mock.calls.length;
  expect(await f.execute(command)).toEqual(linked);
  expect(f.commit.mock.calls).toHaveLength(commits);
});
it("keeps same-state link requests NO_CHANGE and fences stale Item or Expense bases", async () => {
  const f = fixture();
  await f.execute();
  const noop = await f.execute(f.command("LINK_EXPENSE", true));
  if (noop.projection !== "FULL") throw Error("FULL required");
  expect(noop.receipt.outcome).toBe("NO_CHANGE");
  const stale = await f.execute(f.command("UNLINK_EXPENSE", true, 1));
  if (stale.projection !== "FULL") throw Error("FULL required");
  expect(stale.receipt.outcome).toBe("CONFLICT");
  f.proof.mockResolvedValue({ errorCode: "REVISION_CONFLICT" });
  const rejected = await f.execute(f.command("UNLINK_EXPENSE", true));
  if (rejected.projection !== "FULL") throw Error("FULL required");
  expect(rejected.receipt.outcome).toBe("CONFLICT");
  expect(f.graph.expense_links).toHaveLength(1);
});
it("does not upgrade an old pending payload or bypass Item visibility", async () => {
  const f = fixture(),
    old = f.command();
  delete (old.payload as { expectedExpenseRevision?: number }).expectedExpenseRevision;
  expect(
    Object.hasOwn(validateCoreCommand(old).payload as object, "expectedExpenseRevision"),
  ).toBe(false);
  const rejected = await f.execute(old);
  if (rejected.projection !== "FULL") throw Error("FULL required");
  expect(rejected.receipt.errorCode).toBe("OWNING_CAPABILITY_REQUIRED");
  expect(f.proof).not.toHaveBeenCalled();
  f.graph.itinerary_events[0].owner_account_id = randomUUID();
  f.graph.itinerary_events[0].visibility = "PRIVATE";
  const invisible = await f.execute();
  if (invisible.projection !== "FULL") throw Error("FULL required");
  expect(invisible.receipt.errorCode).toBe("NOT_VISIBLE");
  expect(f.graph.expense_links).toEqual([]);
});
