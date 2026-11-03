import { createHash, randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { executeCoreCommandV2, type CoreCommandStorage } from "./tripCoreV2Commands";
import {
  applyCoreCommand,
  emptyCoreGraph,
  type CoreActor,
  type CoreMutation,
} from "../../src/domain/trip/tripCoreV2Mutation";
import { coreDefaults } from "../../src/domain/trip/tripCoreV2";
import { coreDateBoundary } from "../../src/domain/trip/tripCoreV2Temporal";
import {
  validateCoreReceipt,
  type CoreReceipt,
} from "../../src/domain/trip/tripCoreV2Receipt";
const hash = async (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
it.each(["APPLIED", "NO_CHANGE", "CONFLICT", "REJECTED"] as const)(
  "uses the existing immutable %s receipt and same-operation recovery without another mutation",
  async (outcome) => {
    const trip = randomUUID(),
      account = randomUUID(),
      id = randomUUID(),
      room = randomUUID();
    const actor: CoreActor = {
      accountId: account,
      tripId: trip,
      active: true,
      personId: null,
      personIds: [],
      canManageShared: false,
    };
    const envelope = {
      contractVersion: 2,
      intentVersion: 2,
      operationId: randomUUID(),
      tripId: trip,
      target: { kind: "ITEM", id },
      admission: { mode: "MANUAL", sourceIntentId: null, policyVersion: null },
    };
    let graph = applyCoreCommand(
      emptyCoreGraph(),
      {
        ...envelope,
        command: "CREATE_ITEM",
        baseVector: [{ kind: "ITEM", id, revision: null }],
        payload: {
          family: "P3",
          core: { title: "QA stay" },
          schedule: {
            start: coreDateBoundary("2026-12-14"),
            end: coreDateBoundary("2026-12-16"),
          },
          rooms: [{ room_id: room, category: "Double", quantity: 1, capacity: 2 }],
          ...coreDefaults("member"),
        },
      },
      actor,
      "2026-11-01T00:00:00Z",
    ).graph;
    let saved: CoreReceipt | null = null;
    const receiptId = randomUUID();
    const read = vi.fn(async () => graph);
    const commit = vi.fn(async (mutation: CoreMutation | null, receipt: CoreReceipt) => {
      if (mutation) graph = mutation.graph;
      saved = receipt;
      return receiptId;
    });
    const storage: CoreCommandStorage = {
      withLockedCommand: async (_scope, work) =>
        work({
          actor,
          readReceipt: async () =>
            saved
              ? { domainReceiptId: receiptId, receiptText: JSON.stringify(saved) }
              : null,
          hasLegacyOperation: async () => false,
          canReadReceipt: async () => true,
          enabledCommands: async () => ["SET_STAY_DETAILS"],
          readLockedGraph: read,
          verifyAdmission: async () => {},
          lifecycleGraphHash: async () => undefined,
          commit,
        }),
    };
    const command = {
      ...envelope,
      operationId: randomUUID(),
      command: "SET_STAY_DETAILS",
      baseVector: [{ kind: "ITEM", id, revision: outcome === "CONFLICT" ? 2 : 1 }],
      payload: {
        roomChanges: [
          {
            operation: "PATCH",
            room_id: outcome === "REJECTED" ? randomUUID() : room,
            changes: { capacity: outcome === "NO_CHANGE" ? 2 : 4 },
          },
        ],
      },
    };
    const first = await executeCoreCommandV2(
      storage,
      account,
      trip,
      command,
      hash,
      () => "2026-11-02T00:00:00Z",
    );
    expect(first.projection).toBe("FULL");
    if (first.projection !== "FULL") throw new Error("REDACTED");
    expect(first.receipt.outcome).toBe(outcome);
    expect(await validateCoreReceipt(first.receipt, hash)).toEqual(first.receipt);
    // Simulate losing the first response: recover the identical operation, not a replacement ID.
    expect(await executeCoreCommandV2(storage, account, trip, command, hash)).toEqual(
      first,
    );
    expect(read).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenCalledTimes(1);
    expect(graph.trip_stay_rooms).toHaveLength(1);
    expect(graph.trip_stay_rooms[0].capacity).toBe(outcome === "APPLIED" ? 4 : 2);
    await expect(
      executeCoreCommandV2(
        storage,
        account,
        trip,
        { ...command, payload: { details: { property_name: "different intent" } } },
        hash,
      ),
    ).rejects.toThrow("OPERATION_REUSE_MISMATCH");
  },
);
