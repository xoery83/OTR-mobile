import { randomUUID, createHash } from "node:crypto";
import { it, expect, vi } from "vitest";
import { createCorePgStorage, type CorePgLease } from "./tripCoreV2PgStorage";
import { executeCoreCommandV2 } from "./tripCoreV2Commands";
import {
  normalP1Commands,
  normalP3Commands,
  normalP4Commands,
} from "./tripNormalP1Policy";
import { emptyCoreGraph } from "../../src/domain/trip/tripCoreV2Mutation";
import { validateCoreCommand } from "../../src/domain/trip/tripCoreV2Commands";
import { coreDefaults } from "../../src/domain/trip/tripCoreV2";
const actor = randomUUID(),
  trip = randomUUID(),
  id = randomUUID(),
  operation = randomUUID();
const hash = async (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const command = () => ({
  contractVersion: 2,
  intentVersion: 2,
  operationId: operation,
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
});
function fixture(principal = "otr_trip_core_v2_gateway", active = true) {
  const queries: { sql: string; params: readonly unknown[] }[] = [],
    retire = vi.fn();
  const lease: CorePgLease = {
    retire,
    async query(sql, parameters = []) {
      queries.push({ sql, params: parameters });
      if (sql.includes("session_user AS"))
        return { rows: [{ principal, role: principal }] };
      if (sql.includes("trip_core_lock_actor_scope"))
        return {
          rows: [
            {
              actor: {
                accountId: actor,
                tripId: trip,
                active,
                canManageShared: false,
                personId: null,
                personIds: [],
              },
            },
          ],
        };
      if (sql.includes("trip_core_finite_scope_allowed"))
        return { rows: [{ allowed: true }] };
      if (sql.includes("SELECT runtime_enabled"))
        return { rows: [{ runtime_enabled: false, enabled_commands: [] }] };
      return { rows: [] };
    },
  };
  return {
    queries,
    retire,
    lease,
    storage: createCorePgStorage({ withLease: async (work) => work(lease) }, hash),
  };
}
it("checks dedicated principal and rolls back before any foreign actor/table access", async () => {
  const f = fixture("service_role");
  await expect(
    executeCoreCommandV2(f.storage, actor, trip, command(), hash),
  ).rejects.toThrow("CORE_PRINCIPAL_UNAVAILABLE");
  expect(f.queries.at(-1)?.sql).toBe("ROLLBACK");
  expect(f.queries.some((q) => q.sql.includes("trip_core_lock_actor_scope"))).toBe(false);
});
it("keeps fresh closed writes unavailable without an invented receipt or root mutation", async () => {
  const f = fixture();
  await expect(
    executeCoreCommandV2(f.storage, actor, trip, command(), hash),
  ).rejects.toThrow("CORE_CAPABILITY_CLOSED");
  expect(
    f.queries.some(
      (q) =>
        q.sql.startsWith("INSERT") ||
        q.sql.startsWith("UPDATE") ||
        q.sql.startsWith("DELETE"),
    ),
  ).toBe(false);
  const scope = f.queries.find((q) => q.sql.includes("set_config('otr.core.actor'"))!;
  expect(scope.params).toEqual([actor, trip, operation]);
  expect(f.queries.findIndex((q) => q.sql.includes("SELECT id,body"))).toBeLessThan(
    f.queries.findIndex((q) => q.sql.includes("SELECT runtime_enabled")),
  );
});
it("rejects revoked fresh commands before gate or graph access", async () => {
  const f = fixture(undefined, false);
  await expect(
    executeCoreCommandV2(f.storage, actor, trip, command(), hash),
  ).rejects.toThrow("NOT_VISIBLE");
  expect(
    f.queries.some(
      (q) =>
        q.sql.includes("SELECT runtime_enabled") || q.sql.includes("to_jsonb(facts)"),
    ),
  ).toBe(false);
});
it("retires a lease when rollback cannot be proved, retaining the original failure", async () => {
  const f = fixture("service_role"),
    query = f.lease.query;
  f.lease.query = async (sql, params) => {
    if (sql === "ROLLBACK") throw new Error("cleanup lost");
    return query(sql, params);
  };
  await expect(
    executeCoreCommandV2(f.storage, actor, trip, command(), hash),
  ).rejects.toThrow("CORE_PRINCIPAL_UNAVAILABLE");
  expect(f.retire).toHaveBeenCalledOnce();
});

it("expired scope denies receipt replay before any actor/receipt work", async () => {
  const f = fixture(),
    query = f.lease.query;
  f.lease.query = (sql, params) =>
    sql.includes("trip_core_finite_scope_allowed")
      ? Promise.resolve({ rows: [{ allowed: false }] })
      : query(sql, params);
  await expect(
    executeCoreCommandV2(f.storage, actor, trip, command(), hash),
  ).rejects.toThrow("CORE_CAPABILITY_CLOSED");
  expect(
    f.queries.some(
      (q) =>
        q.sql.includes("trip_core_lock_actor_scope") || q.sql.includes("SELECT id,body"),
    ),
  ).toBe(false);
  expect(f.queries.at(-1)?.sql).toBe("ROLLBACK");
});
it("scope expiry after receipt lookup rolls back current replay without deleting retained facts", async () => {
  const f = fixture(),
    query = f.lease.query;
  let checks = 0;
  f.lease.query = (sql, params) =>
    sql.includes("trip_core_finite_scope_allowed")
      ? Promise.resolve({ rows: [{ allowed: ++checks === 1 }] })
      : query(sql, params);
  await expect(
    f.storage.withLockedCommand(
      {
        actorAccountId: actor,
        tripId: trip,
        operationId: operation,
        baseVector: [],
      },
      async (tx) => tx.readReceipt(),
    ),
  ).rejects.toThrow("CORE_CAPABILITY_CLOSED");
  expect(f.queries.some((q) => q.sql.includes("SELECT id,body"))).toBe(true);
  expect(f.queries.at(-1)?.sql).toBe("ROLLBACK");
  expect(f.queries.some((q) => q.sql.startsWith("DELETE"))).toBe(false);
});

it.each(
  ["P1", "P3", "P4", "P5"].flatMap((family) =>
    ["PRIVATE", "SELECTED_PERSONS", "GROUP"].map((visibility) => ({
      family,
      visibility,
    })),
  ),
)(
  "normal $family scope never edits another Creator's $visibility Item, even for organizer",
  async ({ family, visibility }) => {
    const f = fixture(),
      query = f.lease.query;
    f.lease.query = async (sql, params) => {
      if (
        sql ===
        "SELECT enabled_commands,enabled_families,enabled_admission_modes FROM public.trip_core_activation_gate WHERE singleton"
      )
        return {
          rows: [
            {
              runtime_enabled: true,
              enabled_commands:
                family === "P5"
                  ? [...normalP4Commands, "SET_TRANSPORT_DETAILS"]
                  : family === "P4"
                    ? [...normalP4Commands]
                    : family === "P3"
                      ? [...normalP3Commands]
                      : [...normalP1Commands],
              enabled_families:
                family === "P5"
                  ? ["P1", "P3", "P4", "P5"]
                  : family === "P4"
                    ? ["P1", "P3", "P4"]
                    : family === "P3"
                      ? ["P1", "P3"]
                      : ["P1"],
              enabled_admission_modes: ["MANUAL"],
            },
          ],
        };
      if (sql.includes("trip_core_lock_actor_scope"))
        return {
          rows: [
            {
              actor: {
                accountId: actor,
                tripId: trip,
                active: true,
                canManageShared: true,
                personId: randomUUID(),
                personIds: [],
              },
            },
          ],
        };
      return query(sql, params);
    };
    const graph = emptyCoreGraph();
    graph.itinerary_events = [
      {
        id,
        trip_id: trip,
        experience_family: family,
        owner_account_id: randomUUID(),
        visibility,
      } as never,
    ];
    const c = validateCoreCommand({
      ...command(),
      command: "SET_ITEM_TEXT",
      payload: { title: "Forbidden change" },
      baseVector: [{ kind: "ITEM", id, revision: 1 }],
    });
    await expect(
      f.storage.withLockedCommand(
        {
          actorAccountId: actor,
          tripId: trip,
          operationId: operation,
          baseVector: c.baseVector,
        },
        (tx) => tx.verifyAdmission(c, "a".repeat(64), graph),
      ),
    ).rejects.toThrow("CORE_CREATOR_REQUIRED");
    expect(f.queries.some((q) => /^(INSERT|UPDATE|DELETE)/.test(q.sql))).toBe(false);
  },
);

it("accepts a reviewed Sparse P2 only through its exact source capability and owning admission", async () => {
  const f = fixture(),
    query = f.lease.query;
  f.lease.query = async (sql, parameters) =>
    sql.includes("trip_sustained_import_p1_capabilities")
      ? {
          rows: [
            {
              runtime_enabled: true,
              enabled_commands: ["CREATE_SPARSE_FLIGHT"],
              enabled_families: ["P2"],
              enabled_admission_modes: ["REVIEWED_SOURCE"],
            },
          ],
        }
      : query(sql, parameters);
  const verify = vi.fn(async () => {});
  const storage = createCorePgStorage(
    { withLease: async (work) => work(f.lease) },
    hash,
    {
      verify,
      canReadOriginal: async () => false,
      canReadSourceReceipt: async () => false,
    },
    { sustainedDev: true, reviewedP1: true },
  );
  const c = validateCoreCommand({
    ...command(),
    admission: {
      mode: "REVIEWED_SOURCE",
      sourceIntentId: randomUUID(),
      policyVersion: null,
    },
  });
  await storage.withLockedCommand(
    {
      actorAccountId: actor,
      tripId: trip,
      operationId: operation,
      baseVector: c.baseVector,
    },
    async (tx) => {
      expect(await tx.enabledCommands()).toEqual(["CREATE_SPARSE_FLIGHT"]);
      return tx.verifyAdmission(c, "a".repeat(64), emptyCoreGraph());
    },
  );
  expect(verify).toHaveBeenCalledExactlyOnceWith(
    f.lease,
    expect.objectContaining({ accountId: actor, tripId: trip }),
    c,
    "a".repeat(64),
    expect.anything(),
  );
  expect(f.queries.some((q) => /^(INSERT|UPDATE|DELETE)/.test(q.sql))).toBe(false);
});

it.each(["P1", "P3", "P4", "P5"])(
  "normal transport-details command is fenced to P5, target %s",
  async (family) => {
    const f = fixture(),
      query = f.lease.query;
    f.lease.query = async (sql, params) =>
      sql.includes("FROM public.trip_core_activation_gate WHERE singleton")
        ? {
            rows: [
              {
                runtime_enabled: true,
                enabled_commands: [...normalP4Commands, "SET_TRANSPORT_DETAILS"],
                enabled_families: ["P1", "P3", "P4", "P5"],
                enabled_admission_modes: ["MANUAL"],
              },
            ],
          }
        : query(sql, params);
    const graph = emptyCoreGraph();
    graph.itinerary_events = [
      { id, trip_id: trip, experience_family: family, owner_account_id: actor } as never,
    ];
    const c = validateCoreCommand({
      ...command(),
      command: "SET_TRANSPORT_DETAILS",
      payload: { annotations: {} },
      baseVector: [{ kind: "ITEM", id, revision: 1 }],
    });
    const result = f.storage.withLockedCommand(
      {
        actorAccountId: actor,
        tripId: trip,
        operationId: operation,
        baseVector: c.baseVector,
      },
      (tx) => tx.verifyAdmission(c, "a".repeat(64), graph),
    );
    if (family === "P5") await expect(result).resolves.toBeUndefined();
    else await expect(result).rejects.toThrow("CORE_CAPABILITY_CLOSED");
    expect(f.queries.some((q) => /^(INSERT|UPDATE|DELETE)/.test(q.sql))).toBe(false);
  },
);
