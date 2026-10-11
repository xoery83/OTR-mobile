import { expect, it } from "vitest";
import { createHash } from "node:crypto";
import { prepareCoreSourcePlanV2 } from "./tripCoreV2Source";
import { createCoreSourcePgStorageV2 } from "./tripCoreV2SourcePgStorage";
import type { CorePgLease } from "./tripCoreV2PgStorage";
import type { CoreSourceStoredPlanV2 } from "./tripCoreV2Source";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const scope = { actorAccountId: id(1), tripId: id(2), planId: id(3), sourceId: id(4) };
function fixture(
  options: {
    principal?: string;
    allowed?: boolean;
    pinValid?: boolean;
    rollbackFails?: boolean;
  } = {},
) {
  const queries: string[] = [];
  let retired = false;
  const lease: CorePgLease = {
    retire() {
      retired = true;
    },
    async query(sql) {
      queries.push(sql);
      if (sql === "ROLLBACK" && options.rollbackFails) throw new Error("CONNECTION_LOST");
      if (sql.includes("session_user AS principal"))
        return {
          rows: [
            {
              principal: options.principal ?? "otr_trip_core_v2_gateway",
              role: options.principal ?? "otr_trip_core_v2_gateway",
            },
          ],
        };
      if (sql.includes("trip_core_lock_source_scope"))
        return { rows: [{ allowed: options.allowed ?? true }] };
      if (sql.includes("to_jsonb(s) AS source"))
        return {
          rows: [
            {
              source: {
                id: scope.sourceId,
                trip_id: scope.tripId,
                acquired_by: scope.actorAccountId,
                lifecycle: "ACTIVE",
                retention_state: "RETAINED",
                current_material_revision: 1,
              },
            },
          ],
        };
      if (sql.includes("to_jsonb(r) AS run"))
        return {
          rows: [
            {
              run: {
                id: id(5),
                state: "READY",
                retention_state: "RETAINED",
                input_sha256: "a".repeat(64),
              },
            },
          ],
        };
      if (sql.includes("to_jsonb(i) AS pin"))
        return {
          rows: [
            {
              pin: {
                id: id(6),
                run_id: id(5),
                confirmation_id: null,
                source_id: scope.sourceId,
                material_revision: 1,
              },
              valid: options.pinValid ?? true,
            },
          ],
        };
      if (sql.includes("trip_import_run_input_hash"))
        return { rows: [{ hash: "a".repeat(64) }] };
      if (sql.includes("checked_hash"))
        return {
          rows: [
            {
              id: id(7),
              run_id: id(5),
              candidate_kind: "TRANSPORT",
              proposal: { fields: {} },
              proposal_sha256: "b".repeat(64),
              checked_hash: "b".repeat(64),
              retention_state: "RETAINED",
            },
          ],
        };
      if (sql.includes("SELECT s.slot_id")) return { rows: [{ slot_id: id(8) }] };
      return { rows: [] };
    },
  };
  return {
    storage: createCoreSourcePgStorageV2({ withLease: async (work) => work(lease) }),
    queries,
    retired: () => retired,
  };
}
it("reads actual sealed pins but never promotes transient identity to authority", async () => {
  const f = fixture();
  await f.storage.withLockedSourcePlan(scope, async (tx) => {
    const catalog = await tx.readSealedCatalog();
    expect(catalog.candidates[0]).toMatchObject({
      candidateId: id(7),
      identityFacts: null,
      identityEvidenceRefs: null,
    });
    expect(catalog.inputs).toEqual([
      { id: id(6), source_id: scope.sourceId, material_revision: 1 },
    ]);
    expect(await tx.readClaims()).toEqual([
      {
        kind: "LEGACY",
        accountId: scope.actorAccountId,
        tripId: scope.tripId,
        slotId: id(8),
        outcome: "UNKNOWN",
      },
    ]);
  });
  expect(f.queries.at(-1)).toBe("COMMIT");
  expect(f.queries.some((q) => q.includes("INSERT INTO public.itinerary"))).toBe(false);
});
it("refuses unprovisioned principals", async () => {
  const f = fixture({ principal: "service_role" });
  await expect(f.storage.withLockedSourcePlan(scope, async () => null)).rejects.toThrow(
    "CORE_PRINCIPAL_UNAVAILABLE",
  );
  expect(f.queries.at(-1)).toBe("ROLLBACK");
});
it("checks owning Source authorization before reading source facts", async () => {
  const f = fixture({ allowed: false });
  await expect(
    f.storage.withLockedSourcePlan(scope, async (tx) => tx.readSealedCatalog()),
  ).rejects.toThrow("NOT_VISIBLE");
  expect(f.queries.some((q) => q.includes("to_jsonb(s) AS source"))).toBe(false);
});
it("rejects stale Input pins", async () => {
  const f = fixture({ pinValid: false });
  await expect(
    f.storage.withLockedSourcePlan(scope, async (tx) => tx.readSealedCatalog()),
  ).rejects.toThrow("INPUT_STALE");
  expect(f.queries.at(-1)).toBe("ROLLBACK");
});
it("persists REVIEW metadata without manufacturing a certified slot", async () => {
  const f = fixture();
  const plan = {
    scope,
    request: { sourceId: scope.sourceId, sourceRevision: 1 },
    proposalSha256: "c".repeat(64),
    slots: [
      {
        state: "REVIEW",
        certified: null,
        command: null,
        binding: null,
        receipt: null,
        domainReceiptId: null,
      },
    ],
  } as CoreSourceStoredPlanV2;
  await f.storage.withLockedSourcePlan(scope, (tx) => tx.putPlan(plan));
  expect(f.queries.filter((q) => q.startsWith("INSERT"))).toHaveLength(1);
  expect(f.queries.find((q) => q.startsWith("INSERT"))).toContain(
    "trip_source_core_v2_intents",
  );
  await expect(
    f.storage.withLockedSourcePlan(scope, (tx) =>
      tx.putPlan({ ...plan, slots: [{ ...plan.slots[0], state: "READY" }] }),
    ),
  ).rejects.toThrow("CONTRACT_UNSUPPORTED");
});
it("retires a broken connection after rollback fails", async () => {
  const f = fixture({ pinValid: false, rollbackFails: true });
  await expect(
    f.storage.withLockedSourcePlan(scope, (tx) => tx.readSealedCatalog()),
  ).rejects.toThrow("INPUT_STALE");
  expect(f.retired()).toBe(true);
});

it("preparation persists unresolved identity as REVIEW and emits no executable command", async () => {
  const f = fixture();
  const request = {
    captureVersion: 2,
    planId: scope.planId,
    sourceId: scope.sourceId,
    sourceRevision: 1,
    mode: "REVIEWED_SOURCE",
    policyVersion: null,
    candidateIds: [id(7)],
    slots: [
      {
        slotId: id(11),
        slotKey: "flight",
        candidateId: id(7),
        targetKind: "ITEM",
        target: { kind: "ITEM", id: id(9) },
        command: "CREATE_SPARSE_FLIGHT",
        operationId: id(12),
        dependsOn: [],
        selectedFields: ["flightNumberLiteral", "departureDate"],
        evidenceRefs: { service: [`track-c/field-evidence/${id(7)}/service`] },
        baseVector: [{ kind: "ITEM", id: id(9), revision: null }],
        payload: { flightNumberLiteral: "NZ1", departureDate: "2026-12-17" },
      },
    ],
  };
  const result = await prepareCoreSourcePlanV2(
    f.storage,
    scope.actorAccountId,
    scope.tripId,
    request,
    async (bytes) => createHash("sha256").update(bytes).digest("hex"),
  );
  expect(result.readyCommands).toEqual([]);
  expect(result.reviewSlots).toEqual([
    { slotId: id(11), errorCode: "UNRESOLVED_IDENTITY" },
  ]);
  expect(f.queries.filter((q) => q.startsWith("INSERT"))).toHaveLength(1);
});

it("leaves legacy catalogs read-only and uses the owning definer for locks", async () => {
  const f = fixture();
  await f.storage.withLockedSourcePlan(scope, async (tx) => {
    await tx.readSealedCatalog();
    await tx.readClaims();
  });
  const legacyReads = f.queries.filter(
    (q) =>
      q.includes("public.trip_sources ") ||
      q.includes("public.trip_source_runs ") ||
      q.includes("public.trip_source_inputs ") ||
      q.includes("public.trip_source_candidates ") ||
      q.includes("public.trip_source_output_slots "),
  );
  expect(legacyReads).toHaveLength(5);
  expect(legacyReads.every((q) => !q.includes("FOR UPDATE"))).toBe(true);
  expect(f.queries.some((q) => q.includes("trip_core_lock_source_scope"))).toBe(true);
});
