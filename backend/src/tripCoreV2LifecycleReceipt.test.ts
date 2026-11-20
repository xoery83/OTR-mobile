import { createHash, randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { executeCoreCommandV2, type CoreCommandStorage } from "./tripCoreV2Commands";
import {
  emptyCoreGraph,
  type CoreMutation,
} from "../../src/domain/trip/tripCoreV2Mutation";
import { coreDefaults } from "../../src/domain/trip/tripCoreV2";
import { coreDateBoundary } from "../../src/domain/trip/tripCoreV2Temporal";
import { type CoreReceipt } from "../../src/domain/trip/tripCoreV2Receipt";
const hash = async (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
it.each(["ARCHIVED", "DELETED"] as const)(
  "journals and recovers %s rejection after owning admission without business mutation",
  async (tripState) => {
    const tripId = randomUUID(),
      accountId = randomUUID(),
      id = randomUUID(),
      domainReceiptId = randomUUID();
    let admitted = false,
      saved: CoreReceipt | null = null;
    const admission = vi.fn(async () => {
      admitted = true;
    });
    const commit = vi.fn(async (mutation: CoreMutation | null, receipt: CoreReceipt) => {
      expect(admitted).toBe(true);
      expect(mutation).toBeNull();
      saved = receipt;
      return domainReceiptId;
    });
    const storage: CoreCommandStorage = {
      withLockedCommand: async (_scope, work) =>
        work({
          actor: {
            accountId,
            tripId,
            active: true,
            personId: null,
            personIds: [],
            canManageShared: false,
          },
          readReceipt: async () =>
            saved ? { domainReceiptId, receiptText: JSON.stringify(saved) } : null,
          hasLegacyOperation: async () => false,
          canReadReceipt: async () => true,
          enabledCommands: async () => ["CREATE_ITEM"],
          readLockedGraph: async () => emptyCoreGraph(),
          verifyAdmission: admission,
          lifecycleContext: async () => ({ tripState, deletedItemIds: [] }),
          lifecycleGraphHash: async () => undefined,
          commit,
        }),
    };
    const command = {
      contractVersion: 2,
      intentVersion: 2,
      operationId: randomUUID(),
      tripId,
      command: "CREATE_ITEM",
      target: { kind: "ITEM", id },
      baseVector: [{ kind: "ITEM", id, revision: null }],
      admission: { mode: "MANUAL", sourceIntentId: null, policyVersion: null },
      payload: {
        family: "P1",
        core: { title: "Lifecycle rejection" },
        schedule: { start: coreDateBoundary("2026-12-01") },
        ...coreDefaults("member"),
      },
    };
    const first = await executeCoreCommandV2(storage, accountId, tripId, command, hash);
    expect(first).toMatchObject({
      projection: "FULL",
      receipt: { outcome: "REJECTED", errorCode: "TRIP_" + tripState },
    });
    expect(await executeCoreCommandV2(storage, accountId, tripId, command, hash)).toEqual(
      first,
    );
    expect(admission).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenCalledTimes(1);
  },
);
