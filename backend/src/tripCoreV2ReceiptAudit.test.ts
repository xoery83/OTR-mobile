import { createHash, randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { executeCoreCommandV2, type CoreCommandStorage } from "./tripCoreV2Commands";
import { emptyCoreGraph } from "../../src/domain/trip/tripCoreV2Mutation";
import { coreDefaults } from "../../src/domain/trip/tripCoreV2";
import { validateCoreReceipt } from "../../src/domain/trip/tripCoreV2Receipt";
const hash = async (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
it.each([false, true])(
  "binds owning audit to the exact immutable receipt only after successful admission (reject=%s)",
  async (reject) => {
    const account = randomUUID(),
      trip = randomUUID(),
      id = randomUUID();
    const audit = vi.fn(async () => ({
      evidenceRefs: ["track-c/field-evidence/" + randomUUID() + "/service"],
      authorizationRefs: ["registry/synthetic-registry/1"],
    }));
    const storage: CoreCommandStorage = {
      withLockedCommand: async (_scope, work) =>
        work({
          actor: {
            accountId: account,
            tripId: trip,
            personId: null,
            personIds: [],
            active: true,
            canManageShared: false,
          },
          readReceipt: async () => null,
          hasLegacyOperation: async () => false,
          canReadReceipt: async () => true,
          enabledCommands: async () => ["CREATE_SPARSE_FLIGHT"],
          readLockedGraph: async () => emptyCoreGraph(),
          verifyAdmission: async () => {
            if (reject) throw new Error("INVALID_PROVENANCE");
          },
          lifecycleGraphHash: async () => undefined,
          admissionAudit: audit,
          commit: async () => randomUUID(),
        }),
    };
    const response = await executeCoreCommandV2(
      storage,
      account,
      trip,
      {
        contractVersion: 2,
        intentVersion: 2,
        operationId: randomUUID(),
        tripId: trip,
        command: "CREATE_SPARSE_FLIGHT",
        target: { kind: "ITEM", id },
        baseVector: [{ kind: "ITEM", id, revision: null }],
        admission: { mode: "MANUAL", sourceIntentId: null, policyVersion: null },
        payload: {
          flightNumberLiteral: "NZ5069",
          departureDate: "2026-12-14",
          ...coreDefaults("member"),
        },
      },
      hash,
    );
    expect(response.projection).toBe("FULL");
    if (response.projection !== "FULL") throw new Error("REDACTED");
    expect(await validateCoreReceipt(response.receipt, hash)).toEqual(response.receipt);
    expect(audit).toHaveBeenCalledTimes(reject ? 0 : 1);
    expect(response.receipt.audit.evidenceRefs).toHaveLength(reject ? 0 : 1);
    expect(response.receipt.audit.authorizationRefs).toHaveLength(reject ? 0 : 1);
    expect(response.receipt.outcome).toBe(reject ? "REJECTED" : "APPLIED");
  },
);
