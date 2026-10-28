import { randomUUID, createHash } from "node:crypto";
import { it, expect, vi } from "vitest";
import { createCorePgStorage, type CorePgLease } from "./tripCoreV2PgStorage";
import { executeCoreCommandV2 } from "./tripCoreV2Commands";
import {
  normalP1Commands,
  normalP3Commands,
  normalP4Commands,
  normalP2SparseCommands,
} from "./tripNormalP1Policy";
import { emptyCoreGraph } from "../../src/domain/trip/tripCoreV2Mutation";
import { validateCoreCommand } from "../../src/domain/trip/tripCoreV2Commands";
import { coreHashValue } from "../../src/domain/trip/tripCoreV2Read";
import { coreDateBoundary } from "../../src/domain/trip/tripCoreV2Temporal";
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
  ["P1", "P3", "P4", "P5", "P6"].flatMap((family) =>
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
                family === "P6"
                  ? [...normalP4Commands, "SET_ACTIVITY_DETAILS"]
                  : family === "P5"
                    ? [...normalP4Commands, "SET_TRANSPORT_DETAILS"]
                    : family === "P4"
                      ? [...normalP4Commands]
                      : family === "P3"
                        ? [...normalP3Commands]
                        : [...normalP1Commands],
              enabled_families:
                family === "P6"
                  ? ["P1", "P3", "P4", "P6"]
                  : family === "P5"
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

it.each(["P1", "P3", "P4", "P6"])(
  "normal activity-details command is fenced to P6, target %s",
  async (family) => {
    const f = fixture(),
      query = f.lease.query;
    f.lease.query = async (sql, params) =>
      sql.includes("FROM public.trip_core_activation_gate WHERE singleton")
        ? {
            rows: [
              {
                runtime_enabled: true,
                enabled_commands: [...normalP4Commands, "SET_ACTIVITY_DETAILS"],
                enabled_families: ["P1", "P3", "P4", "P6"],
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
      command: "SET_ACTIVITY_DETAILS",
      payload: {
        details: { session_label: null, admission_note: null },
        entryPlace: null,
      },
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
    if (family === "P6") await expect(result).resolves.toBeUndefined();
    else await expect(result).rejects.toThrow("CORE_CAPABILITY_CLOSED");
    expect(f.queries.some((q) => /^(INSERT|UPDATE|DELETE)/.test(q.sql))).toBe(false);
  },
);

const authoredDetails = () => ({
  flightNumberLiteral: "NZ5069",
  origin: {
    airportCode: "AKL",
    name: "Auckland",
    terminal: null,
    time: coreDateBoundary("2026-12-14"),
  },
  destination: {
    airportCode: null,
    name: null,
    terminal: null,
    time: coreDateBoundary("2026-12-14"),
  },
});
async function manualSparseFixture(change?: string) {
  const f = fixture(),
    query = f.lease.query;
  const created = validateCoreCommand(command());
  const intent = await coreHashValue("otr-trip-core-intent-v2", created, hash);
  const body = {
    receiptVersion: 2,
    commandVersion: 2,
    intentVersion: 2,
    actorAccountId: actor,
    tripId: trip,
    operationId: created.operationId,
    command: created.command,
    intentSha256: intent,
    targetVector: [{ kind: "ITEM", id, baseRevision: null, committedRevision: 1 }],
    outcome: "APPLIED",
    result: {
      created: [{ kind: "ITEM", id }],
      changed: [],
      retiredEdges: [],
      replacement: null,
      custodyGrantId: null,
    },
    errorCode: null,
    committedAt: "2026-10-29T00:00:00Z",
    audit: { before: [], after: [], evidenceRefs: [], authorizationRefs: [] },
  };
  const receipt = {
    ...body,
    receiptSha256: await coreHashValue("otr-trip-core-receipt-v2", body, hash),
  };
  let canonical = JSON.stringify(created);
  if (change === "source")
    canonical = JSON.stringify({
      ...created,
      admission: {
        mode: "REVIEWED_SOURCE",
        sourceIntentId: randomUUID(),
        policyVersion: null,
      },
    });
  if (change === "otherTarget")
    canonical = JSON.stringify({
      ...created,
      target: { kind: "ITEM", id: randomUUID() },
    });
  const retained = {
    operation_id: created.operationId,
    canonical_intent_text: canonical,
    intent_sha256: change === "intentHash" ? "a".repeat(64) : intent,
    receipt_sha256: receipt.receiptSha256,
    body:
      change === "receiptHash"
        ? { ...receipt, receiptSha256: "b".repeat(64) }
        : change === "receiptActor"
          ? { ...receipt, actorAccountId: randomUUID() }
          : receipt,
    outcome: "APPLIED",
  };
  f.lease.query = async (sql, params) =>
    sql.includes("FROM public.trip_core_activation_gate WHERE singleton")
      ? {
          rows: [
            {
              runtime_enabled: true,
              enabled_commands: [...normalP2SparseCommands],
              enabled_families: ["P1", "P2", "P3", "P4", "P5", "P6"],
              enabled_admission_modes: ["MANUAL"],
            },
          ],
        }
      : sql.includes("canonical_intent_text,intent_sha256,receipt_sha256,body,outcome")
        ? { rows: change === "missingReceipt" ? [] : [retained] }
        : query(sql, params);
  const graph = emptyCoreGraph();
  graph.itinerary_events = [
    {
      id,
      trip_id: trip,
      experience_family: change === "wrongFamily" ? "P3" : "P2",
      owner_account_id: change === "creator" ? randomUUID() : actor,
    } as never,
  ];
  graph.trip_flight_intents = [
    {
      event_id: id,
      qualification: change === "qualified" ? "QUALIFIED" : "SPARSE",
    } as never,
  ];
  if (change === "booking")
    graph.trip_booking_item_links = [{ item_id: id, active: true } as never];
  if (change === "service")
    graph.itinerary_transport_services = [{ event_id: id } as never];
  const verify = async (
    c = validateCoreCommand({
      ...command(),
      command: "SET_AUTHORED_FLIGHT_DETAILS",
      payload: authoredDetails(),
      baseVector: [{ kind: "ITEM", id, revision: 1 }],
    }),
    g = graph,
  ) =>
    f.storage.withLockedCommand(
      {
        actorAccountId: actor,
        tripId: trip,
        operationId: c.operationId,
        baseVector: c.baseVector,
      },
      (tx) => tx.verifyAdmission(c, "a".repeat(64), g),
    );
  return { ...f, verify, graph };
}
it("dormant exact Manual P2 profile admits Sparse Create without an existing root", async () => {
  const f = await manualSparseFixture();
  await f.verify(validateCoreCommand(command()), emptyCoreGraph());
  expect(
    f.queries
      .find((q) => q.sql.includes("set_config('otr.core.command'"))
      ?.params.slice(0, 3),
  ).toEqual(["CREATE_SPARSE_FLIGHT", "P2", "MANUAL"]);
});
it("Manual authored details requires retained receipted Sparse Create and same Creator", async () => {
  const f = await manualSparseFixture();
  await f.verify();
  expect(
    f.queries
      .find((q) => q.sql.includes("set_config('otr.core.command'"))
      ?.params.slice(0, 3),
  ).toEqual(["SET_AUTHORED_FLIGHT_DETAILS", "P2", "MANUAL"]);
  expect(f.queries.some((q) => /^(INSERT|UPDATE|DELETE)/.test(q.sql))).toBe(false);
});
it.each([
  "creator",
  "qualified",
  "booking",
  "service",
  "wrongFamily",
  "missingReceipt",
  "source",
  "otherTarget",
  "intentHash",
  "receiptHash",
  "receiptActor",
])("authored P2 admission rejects %s before writer context", async (change) => {
  const f = await manualSparseFixture(change);
  await expect(f.verify()).rejects.toThrow();
  expect(f.queries.some((q) => q.sql.includes("set_config('otr.core.command'"))).toBe(
    false,
  );
  expect(f.queries.some((q) => /^(INSERT|UPDATE|DELETE)/.test(q.sql))).toBe(false);
});
it.each([
  "SET_ITEM_TEXT",
  "SET_ITEM_SCHEDULE",
  "SET_ITEM_PLACE",
  "QUALIFY_FLIGHT",
  "UPDATE_FLIGHT_FACTS",
  "REPLACE_FLIGHT_SERVICE",
])("exact P2 profile denies payload-independent command %s", async (name) => {
  const f = await manualSparseFixture();
  const c = {
    ...validateCoreCommand({
      ...command(),
      command: "SET_AUTHORED_FLIGHT_DETAILS",
      payload: authoredDetails(),
      baseVector: [{ kind: "ITEM", id, revision: 1 }],
    }),
    command: name,
  } as never;
  await expect(f.verify(c)).rejects.toThrow("CORE_CAPABILITY_CLOSED");
});

it("authored Manual flight receipt uses ordinary visibility without Source receipt authority", async () => {
  const f = await manualSparseFixture();
  const receipt = {
    command: "SET_AUTHORED_FLIGHT_DETAILS",
    targetVector: [],
    audit: { before: [], after: [], evidenceRefs: [], authorizationRefs: [] },
  } as never;
  await f.storage.withLockedCommand(
    { actorAccountId: actor, tripId: trip, operationId: operation, baseVector: [] },
    async (tx) => {
      expect(await tx.canReadReceipt(receipt)).toBe(true);
      expect(
        await tx.canReadReceipt({
          ...(receipt as object),
          command: "QUALIFY_FLIGHT",
        } as never),
      ).toBe(false);
      expect(
        await tx.canReadReceipt({
          ...(receipt as object),
          audit: {
            before: [],
            after: [],
            evidenceRefs: ["private-source"],
            authorizationRefs: [],
          },
        } as never),
      ).toBe(false);
    },
  );
});
it("P2 never enters through generic CREATE_ITEM despite union family membership", async () => {
  const f = await manualSparseFixture();
  const c = {
    ...validateCoreCommand(command()),
    command: "CREATE_ITEM",
    payload: { family: "P2" },
  } as never;
  await expect(f.verify(c, emptyCoreGraph())).rejects.toThrow("CORE_CAPABILITY_CLOSED");
});
