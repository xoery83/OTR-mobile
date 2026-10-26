import { createHash, randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { createCoreUniversalSourceRead } from "./universalCoreSourceRead";
import type { UniversalSourceTask } from "./universalSourceRead";
function fixture(role = "otr_trip_core_v2_writer") {
  const actor = randomUUID(),
    trip = randomUUID(),
    batch = randomUUID(),
    runId = randomUUID(),
    taskId = randomUUID();
  const inputs = [0, 1].map((n) => ({
    id: randomUUID(),
    source_id: randomUUID(),
    material_revision: 1,
    representation_id: randomUUID(),
    payload_sha256: createHash("sha256")
      .update("source " + n)
      .digest("hex"),
    byte_count: 8,
    observed_source_row_revision: 1,
    historical_selection: false as const,
  }));
  const run = {
    id: runId,
    actor_account_id: actor,
    trip_id: trip,
    capture_batch_id: batch,
    interpretation_task_id: taskId,
    scope_source_ids: inputs.map((p) => p.source_id),
    capture_submission_sha256: "a".repeat(64),
    input_sha256: "b".repeat(64),
    state: "PENDING",
    retention_state: "RETAINED",
    superseded_by: null,
    extractor_key: "otr-universal-interpretation-v1",
    generation: 1,
    created_at: new Date().toISOString(),
  };
  const state = {
    role,
    valid: true,
    allowed: true,
    texts: ["source 0", "source 1"],
    principal: "otr_trip_core_v2_gateway",
    scopeCount: inputs.length,
    lockNull: false,
    badHash: false,
    foreignRep: false,
    missingRep: false,
    actor,
    trip,
  };
  const query = vi.fn(async (sql: string, args: unknown[] = []) => {
    if (sql.includes("session_user")) return { rows: [{ ...state }] };
    if (sql.startsWith("SET LOCAL ROLE")) {
      state.role = sql.split(" ").at(-1)!;
      return { rows: [] };
    }
    if (sql.includes("WITH actual AS MATERIALIZED"))
      return {
        rows: [
          {
            run,
            pins: inputs.map((pin) => ({ pin, valid: state.valid })),
            checked_hash: state.badHash ? "0".repeat(64) : run.input_sha256,
          },
        ],
      };
    if (sql.includes("AS run FROM")) return { rows: [{ run }] };
    if (sql.includes("trip_core_lock_actor_scope"))
      return {
        rows: [{ actor: { accountId: actor, tripId: trip, active: state.allowed } }],
      };
    if (sql.includes("trip_core_lock_source_scope"))
      return {
        rows: [
          {
            source_count: state.scopeCount,
            allowed: state.lockNull ? null : state.allowed,
          },
        ],
      };
    if (sql.includes("trip_import_input_valid"))
      return { rows: inputs.map((pin) => ({ pin, valid: state.valid })) };
    if (sql.includes("trip_import_run_input_hash"))
      return { rows: [{ hash: run.input_sha256 }] };
    if (sql.includes("material_kind,encoding"))
      return {
        rows: (state.missingRep ? inputs.slice(1) : inputs).map((p, i) => ({
          id: p.representation_id,
          source_id: state.foreignRep ? trip : p.source_id,
          material_kind: "TEXT",
          encoding: "UTF-8",
          remote_state: "NOT_APPLICABLE",
          text_content: state.texts[i],
        })),
      };
    throw Error("UNEXPECTED_SQL");
  });
  const lease = { query, retire: vi.fn() },
    source = createCoreUniversalSourceRead(lease, actor, trip);
  const task: UniversalSourceTask = {
    account_id: actor,
    trip_id: trip,
    import_id: batch,
    run_id: runId,
    task_id: taskId,
    manifest_sha256: run.capture_submission_sha256,
    input_pins: inputs.map((p) => ({
      kind: "SOURCE",
      transform_sha256: null,
      input_id: p.id,
      source_id: p.source_id,
      representation_id: p.representation_id,
      material_revision: p.material_revision,
      payload_sha256: p.payload_sha256,
      byte_count: p.byte_count,
    })),
  };
  return { source, task, state, run, query, lease, inputs };
}
it.each(["otr_trip_core_v2_gateway", "otr_trip_core_v2_writer"])(
  "reuses the held Core scope for every Run input and restores %s",
  async (role) => {
    const f = fixture(role);
    const m = await f.source.readManifest(f.task);
    expect(m.representations).toHaveLength(2);
    expect(m.representations[1].bytes.toString()).toBe("source 1");
    expect(f.state.role).toBe(role);
    expect(
      f.query.mock.calls.some(
        ([s]) =>
          s.includes("trip_source_find_sustained") ||
          s.includes("trip_source_read_sustained") ||
          s.includes("BEGIN"),
      ),
    ).toBe(false);
  },
);
it.each(["identity", "permission", "pin", "second-source-bytes", "run"])(
  "fails closed on changed %s",
  async (kind) => {
    const f = fixture("otr_trip_core_v2_gateway");
    if (kind === "identity") f.state.actor = randomUUID();
    if (kind === "permission") f.state.allowed = false;
    if (kind === "pin") f.state.valid = false;
    if (kind === "second-source-bytes") f.state.texts[1] = "tampered";
    if (kind === "run") f.run.superseded_by = randomUUID() as never;
    await expect(f.source.readManifest(f.task)).rejects.toThrow();
    expect(f.state.role).toBe("otr_trip_core_v2_gateway");
  },
);

it("reuses only the locked binding and rechecks representation bytes", async () => {
  const f = fixture();
  await f.source.readManifest(f.task);
  await f.source.readManifest(f.task);
  expect(
    f.query.mock.calls.filter(([s]) => s.includes("trip_core_lock_source_scope")),
  ).toHaveLength(1);
  f.state.texts[1] = "tampered";
  await expect(f.source.readManifest(f.task)).rejects.toThrow(
    "UNIVERSAL_SOURCE_MATERIAL_INVALID",
  );
  await expect(
    f.source.lookup(f.state.actor, f.state.trip, randomUUID()),
  ).rejects.toThrow("CORE_SCOPE_MISMATCH");
});

it("retains owning Actor authorization and rejects a changed lease scope", async () => {
  const f = fixture("otr_trip_core_v2_gateway");
  await f.source.assertCurrent();
  expect(f.state.role).toBe("otr_trip_core_v2_gateway");
  f.state.actor = randomUUID();
  await expect(f.source.assertCurrent()).rejects.toThrow("CORE_SCOPE_MISMATCH");
  expect(f.state.role).toBe("otr_trip_core_v2_gateway");
});

it("rejects inactive owning Actor before any published read", async () => {
  const f = fixture();
  f.state.allowed = false;
  await expect(f.source.assertCurrent()).rejects.toThrow("SOURCE_ACCESS_DENIED");
});

it.each(["null", "zero", "short", "extra", "hash"])(
  "rejects incomplete aggregate scope or changed %s",
  async (kind) => {
    const f = fixture();
    if (kind === "null") f.state.lockNull = true;
    if (kind === "zero") f.state.scopeCount = 0;
    if (kind === "short") f.state.scopeCount = 1;
    if (kind === "extra") f.state.scopeCount = 3;
    if (kind === "hash") f.state.badHash = true;
    await expect(f.source.readManifest(f.task)).rejects.toThrow(
      kind === "hash" ? "INPUT_STALE" : "SOURCE_ACCESS_DENIED",
    );
  },
);

it.each(["foreign", "missing"])("rejects %s representation mapping", async (kind) => {
  const f = fixture();
  if (kind === "foreign") f.state.foreignRep = true;
  else f.state.missingRep = true;
  await expect(f.source.readManifest(f.task)).rejects.toThrow(
    "UNIVERSAL_SOURCE_BINDING_INVALID",
  );
});
