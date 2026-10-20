import { createHash, randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { coreTableSchemas } from "../../src/domain/trip/tripCoreV2";
import { emptyCoreGraph, type CoreActor } from "../../src/domain/trip/tripCoreV2Mutation";
import { createCorePgReader } from "./tripCoreV2PgRead";
import type { CorePgConnection } from "./tripCoreV2PgStorage";
import { createTripDocumentOriginalRead } from "./tripDocumentOriginalRead";

function fixture() {
  const actor: CoreActor = {
    accountId: randomUUID(),
    tripId: randomUUID(),
    active: true,
    canManageShared: false,
    personId: null,
    personIds: [],
  };
  const bytes = Uint8Array.from([37, 80, 68, 70, 45, 49]);
  const hash = async (value: Uint8Array) =>
    createHash("sha256").update(value).digest("hex");
  const document = {
    ...Object.fromEntries(
      Object.keys(coreTableSchemas.trip_operational_documents.shape).map((key) => [
        key,
        null,
      ]),
    ),
    id: randomUUID(),
    trip_id: actor.tripId,
    revision: 1,
    owner_account_id: actor.accountId,
    visibility: "PRIVATE",
    hidden_at: null,
    created_at: "2026-10-14T00:00:00Z",
    updated_at: "2026-10-14T00:00:00Z",
    field_state: {},
    title: "Synthetic original",
    media_type: "application/pdf",
    byte_size: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    custody: "AUTHORIZED_COPY",
    source_representation_id: null,
    storage_object_key: "private/internal/key",
    content_version: 1,
    custody_receipt_id: randomUUID(),
  };
  const graph = emptyCoreGraph();
  graph.trip_operational_documents = [document];
  const state = { epoch: randomUUID(), revision: 1, access_revision: 4 };
  const identity = {
    principal: "otr_trip_core_v2_gateway",
    role: "otr_trip_core_v2_gateway",
  };
  const gate = { runtime_enabled: true };
  const lease = {
    retire: vi.fn(),
    query: vi.fn(async (sql: string) => {
      if (sql === "SELECT session_user AS principal,current_user AS role")
        return { rows: [identity] };
      if (sql.includes("trip_core_finite_scope_allowed"))
        return { rows: [{ allowed: gate.runtime_enabled }] };
      if (sql.includes("trip_core_lock_actor_scope")) return { rows: [{ actor }] };
      if (sql.includes("trip_core_activation_gate")) return { rows: [gate] };
      if (sql.includes("FROM public.trip_core_read_state")) return { rows: [state] };
      if (sql.includes('FROM public."trip_operational_documents"'))
        return {
          rows: graph.trip_operational_documents.map((fact) => ({ fact })),
        };
      if (sql.includes("trip_core_read_person_bindings"))
        return { rows: [{ bindings: [] }] };
      return { rows: [] };
    }),
  };
  const acquire = vi.fn();
  const connection: CorePgConnection = {
    async withLease(work) {
      acquire();
      return work(lease);
    },
  };
  const reader = createCorePgReader(connection, hash);
  const request = {
    actorAccountId: actor.accountId,
    tripId: actor.tripId,
    documentId: document.id,
    contentVersion: 1,
    sha256: document.sha256,
  };
  const retained = {
    ...request,
    custodyReceiptId: document.custody_receipt_id,
    byteSize: bytes.length,
    custody: "AUTHORIZED_COPY" as const,
    state: "BOUND" as const,
    right: "CURRENT_COPY_GRANT" as const,
    generation: "retention-1",
  };
  const ports = {
    currentAccess: reader.currentDocumentAccess,
    currentRetention: vi.fn(async () => retained),
    readRetained: vi.fn(async () => ({ ...retained, bytes })),
  };
  return {
    actor,
    document,
    state,
    identity,
    gate,
    lease,
    connection,
    acquire,
    reader,
    request,
    ports,
  };
}

it("returns current internal ACL state only after the existing snapshot commits; collection remains original-disabled", async () => {
  const f = fixture();
  expect(f.acquire).not.toHaveBeenCalled();
  const access = await f.reader.currentDocumentAccess(f.request);
  expect(access).toMatchObject({ actor: f.actor, accessRevision: 4 });
  expect(access.graph.trip_operational_documents).toEqual([f.document]);
  const queries = f.lease.query.mock.calls.map(([sql]) => sql);
  expect(queries[0]).toBe("BEGIN ISOLATION LEVEL REPEATABLE READ");
  expect(queries.at(-1)).toBe("COMMIT");
  expect(queries).toContain("SET LOCAL ROLE otr_trip_core_v2_writer");
  const collection = await f.reader.collection(f.actor.accountId, f.actor.tripId);
  expect(
    collection.pages
      .flatMap((page) => page.records)
      .some((row) => row.kind === "DOCUMENT"),
  ).toBe(false);
  await expect(
    createTripDocumentOriginalRead({
      currentAccess: f.reader.currentDocumentAccess,
    }).read(f.actor.accountId, f.request),
  ).resolves.toEqual({ status: "UNAVAILABLE" });
});

it("composes with independent custody and rejects access-revision drift after byte acquisition", async () => {
  const f = fixture();
  const read = createTripDocumentOriginalRead(f.ports);
  expect((await read.read(f.actor.accountId, f.request)).status).toBe("AVAILABLE");
  f.ports.readRetained.mockImplementationOnce(async () => {
    f.state.access_revision++;
    return {
      ...(await f.ports.currentRetention()),
      bytes: Uint8Array.from([37, 80, 68, 70, 45, 49]),
    };
  });
  await expect(read.read(f.actor.accountId, f.request)).resolves.toEqual({
    status: "UNAVAILABLE",
  });
});

it("denies a different private-document owner before invoking custody", async () => {
  const f = fixture();
  f.document.owner_account_id = randomUUID();
  await expect(
    createTripDocumentOriginalRead(f.ports).read(f.actor.accountId, f.request),
  ).resolves.toEqual({ status: "UNAVAILABLE" });
  expect(f.ports.currentRetention).not.toHaveBeenCalled();
  expect(f.ports.readRetained).not.toHaveBeenCalled();
});

it.each(["principal", "gate", "actor", "scope", "revision", "graph"])(
  "preserves the snapshot's %s rejection and rollback",
  async (reason) => {
    const f = fixture();
    if (reason === "principal") f.identity.principal = "service_role";
    if (reason === "gate") f.gate.runtime_enabled = false;
    if (reason === "actor") f.actor.active = false;
    if (reason === "scope") f.actor.tripId = randomUUID();
    if (reason === "revision") f.state.access_revision = 0;
    if (reason === "graph") f.document.trip_id = randomUUID();
    await expect(f.reader.currentDocumentAccess(f.request)).rejects.toThrow();
    expect(f.lease.query.mock.calls.at(-1)?.[0]).toBe("ROLLBACK");
    expect(f.lease.query.mock.calls.some(([sql]) => sql === "COMMIT")).toBe(false);
  },
);

it("rejects malformed account scope before a lease and retires when rollback fails", async () => {
  const f = fixture();
  await expect(
    f.reader.currentDocumentAccess({ ...f.request, actorAccountId: "invalid" }),
  ).rejects.toThrow();
  expect(f.acquire).not.toHaveBeenCalled();
  f.gate.runtime_enabled = false;
  const query = f.lease.query.getMockImplementation()!;
  f.lease.query.mockImplementation(async (sql) => {
    if (sql === "ROLLBACK") throw new Error("synthetic rollback unavailable");
    return query(sql);
  });
  await expect(f.reader.currentDocumentAccess(f.request)).rejects.toThrow(
    "CORE_CAPABILITY_CLOSED",
  );
  expect(f.lease.retire).toHaveBeenCalledOnce();
});

it("finite capabilities require current linked actor and owning read state, never listing alone", async () => {
  const f = fixture();
  expect(
    (await f.reader.capabilities(f.actor.accountId, f.actor.tripId)).activationState,
  ).toBe("CLOSED");
  f.actor.personId = randomUUID();
  const c = await f.reader.capabilities(f.actor.accountId, f.actor.tripId);
  expect(c.activationState).toBe("ENABLED");
  expect(c.enabledCommands).toEqual(["CREATE_ITEM"]);
  expect(c.enabledFamilies).toEqual(["P1", "P3"]);
  expect(c.enabledAdmissionModes).toEqual(["MANUAL"]);
  expect(c.operationalCustodyAvailable).toBe(false);
  f.actor.active = false;
  expect(
    (await f.reader.capabilities(f.actor.accountId, f.actor.tripId)).activationState,
  ).toBe("CLOSED");
});
it("expired read scope rejects before graph access and leaves cached data untouched", async () => {
  const f = fixture();
  f.gate.runtime_enabled = false;
  await expect(f.reader.collection(f.actor.accountId, f.actor.tripId)).rejects.toThrow(
    "CORE_CAPABILITY_CLOSED",
  );
  expect(f.lease.query.mock.calls.some(([q]) => q.includes("to_jsonb(facts)"))).toBe(
    false,
  );
});
