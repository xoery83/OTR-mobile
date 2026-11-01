import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import type { CoreActor } from "../../src/domain/trip/tripCoreV2Mutation";
import type { CorePgConnection } from "./tripCoreV2PgStorage";
import {
  createCoreRealtimeQualification,
  coreRealtimeRevocationMapping,
} from "./tripCoreRealtimeQualification";

function fixture() {
  const user = { id: randomUUID(), accountClass: "NORMAL_ACCOUNT" as const },
    tripId = randomUUID(),
    actor: CoreActor = {
      accountId: user.id,
      tripId,
      personId: randomUUID(),
      active: true,
      canManageShared: false,
      personIds: [],
    },
    state: { epoch: string; access_revision: number } = {
      epoch: randomUUID(),
      access_revision: 4,
    },
    gate = { runtime_enabled: true, allowed: true },
    identity = {
      principal: "otr_trip_core_v2_gateway",
      role: "otr_trip_core_v2_gateway",
    },
    query = vi.fn(
      async (
        sql: string,
        _parameters?: readonly unknown[],
      ): Promise<{ rows: Record<string, unknown>[] }> => {
        if (sql === "SELECT session_user AS principal,current_user AS role")
          return { rows: [identity] };
        if (sql.includes("trip_core_finite_scope_allowed"))
          return { rows: [{ allowed: gate.allowed }] };
        if (sql.includes("trip_core_lock_actor_scope")) return { rows: [{ actor }] };
        if (sql.includes("trip_core_activation_gate")) return { rows: [gate] };
        if (sql.includes("FROM public.trip_core_read_state")) return { rows: [state] };
        return { rows: [] };
      },
    ),
    retire = vi.fn(),
    acquire = vi.fn(),
    connection: CorePgConnection = {
      async withLease(work) {
        acquire();
        return work({ query, retire });
      },
    },
    hash = vi.fn(async () => {
      throw Error("NO_GRAPH_OR_COMMAND_HASH_EXPECTED");
    }),
    port = createCoreRealtimeQualification(connection, hash);
  return {
    user,
    tripId,
    actor,
    state,
    gate,
    identity,
    query,
    retire,
    acquire,
    hash,
    port,
  };
}

it("observes only linked Actor and epoch/access metadata inside the owning transaction", async () => {
  const f = fixture(),
    result = await f.port.observe(f.user, f.tripId),
    queries = f.query.mock.calls.map(([q]) => q);
  expect(result).toEqual({
    qualification: "NOT_A_PRIVATE_JOIN_LEASE",
    actorAccountId: f.user.id,
    tripId: f.tripId,
    actorPersonId: f.actor.personId,
    coreEpoch: f.state.epoch,
    coreAccessRevision: 4,
  });
  expect(Object.isFrozen(result)).toBe(true);
  expect(queries[0]).toBe("BEGIN ISOLATION LEVEL READ COMMITTED");
  expect(queries.at(-1)).toBe("COMMIT");
  const actorIndex = queries.findIndex((q) => q.includes("trip_core_lock_actor_scope")),
    stateIndex = queries.findIndex((q) => q.includes("FROM public.trip_core_read_state"));
  expect(actorIndex).toBeGreaterThan(
    queries.findIndex((q) => q.includes("set_config('otr.core.actor'")),
  );
  expect(stateIndex).toBeGreaterThan(actorIndex);
  expect(f.query).toHaveBeenCalledWith(
    expect.stringContaining("trip_core_lock_actor_scope"),
    [f.user.id, f.tripId],
  );
  expect(f.query).toHaveBeenCalledWith(
    expect.stringContaining("FROM public.trip_core_read_state"),
    [f.tripId],
  );
  expect(
    queries.filter((q) => q.includes("trip_core_finite_scope_allowed")),
  ).toHaveLength(2);
  expect(f.hash).not.toHaveBeenCalled();
  expect(f.acquire).toHaveBeenCalledOnce();
});

it.each([undefined, "ANONYMOUS", "UNKNOWN"] as const)(
  "rejects non-normal %s before checkout",
  async (accountClass) => {
    const f = fixture();
    await expect(
      f.port.observe({ id: f.user.id, accountClass }, f.tripId),
    ).rejects.toThrow("NORMAL_ACCOUNT_REQUIRED");
    expect(f.acquire).not.toHaveBeenCalled();
  },
);
it("rejects invalid scope before checkout", async () => {
  const f = fixture();
  await expect(f.port.observe(f.user, "invalid-trip")).rejects.toThrow();
  expect(f.acquire).not.toHaveBeenCalled();
});

it.each([
  "ACCOUNT",
  "TRIP",
  "INACTIVE",
  "UNLINKED",
  "FINITE",
  "RUNTIME",
  "EPOCH",
  "REVISION",
  "PRINCIPAL",
])("withholds invalid %s observation and rolls back", async (failure) => {
  const f = fixture();
  if (failure === "ACCOUNT") f.actor.accountId = randomUUID();
  if (failure === "TRIP") f.actor.tripId = randomUUID();
  if (failure === "INACTIVE") f.actor.active = false;
  if (failure === "UNLINKED") f.actor.personId = null;
  if (failure === "FINITE") f.gate.allowed = false;
  if (failure === "RUNTIME") f.gate.runtime_enabled = false;
  if (failure === "EPOCH") f.state.epoch = "not-an-epoch";
  if (failure === "REVISION") f.state.access_revision = Number.MAX_SAFE_INTEGER + 1;
  if (failure === "PRINCIPAL") f.identity.role = "postgres";
  await expect(f.port.observe(f.user, f.tripId)).rejects.toThrow();
  const queries = f.query.mock.calls.map(([q]) => q);
  expect(queries.at(-1)).toBe("ROLLBACK");
  expect(queries).not.toContain("COMMIT");
});

it("returns no observation on COMMIT failure and retains the exact owning error", async () => {
  const f = fixture(),
    query = f.query.getMockImplementation()!,
    failure = Error("commit unknown");
  f.query.mockImplementation(async (q, p) => {
    if (q === "COMMIT") throw failure;
    return query(q, p);
  });
  await expect(f.port.observe(f.user, f.tripId)).rejects.toBe(failure);
});

it("never maps Core counters or old epochs into Native revocation numbers", async () => {
  const f = fixture(),
    current = await f.port.observe(f.user, f.tripId);
  expect(
    coreRealtimeRevocationMapping(current, {
      ...current,
      coreEpoch: randomUUID(),
      coreAccessRevision: 999,
    }),
  ).toEqual({ status: "NOT_MAPPABLE", reason: "EPOCH_MISMATCH" });
  expect(
    coreRealtimeRevocationMapping(current, { ...current, actorAccountId: randomUUID() }),
  ).toEqual({ status: "NOT_MAPPABLE", reason: "SCOPE_MISMATCH" });
  expect(
    coreRealtimeRevocationMapping(current, { ...current, tripId: randomUUID() }),
  ).toEqual({ status: "NOT_MAPPABLE", reason: "SCOPE_MISMATCH" });
  expect(
    coreRealtimeRevocationMapping(current, { ...current, coreAccessRevision: 999 }),
  ).toEqual({ status: "NOT_MAPPABLE", reason: "AUTH_TRANSITION_RECEIPT_UNAVAILABLE" });
  expect(
    coreRealtimeRevocationMapping(current, {
      authorizationRevision: 999,
      receiptId: randomUUID(),
    }),
  ).toEqual({ status: "NOT_MAPPABLE", reason: "INVALID_OBSERVATION" });
});
