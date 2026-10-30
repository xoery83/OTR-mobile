import { withAcceptedUniversalReceiptRead } from "./universalAcceptedSourceReceipt";
import type { CoreSourceStoredSlotV2 } from "./tripCoreV2Source";
import { sourcePdfV2ProofFixture } from "./__fixtures__/sourcePdfV2Proof";
import { PDF_V2_OPTIONS_SHA } from "./sourcePdfV2Contracts";
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
    representationRoles: ["ORIGINAL", "ORIGINAL"],
    principal: "otr_trip_core_v2_gateway",
    scopeCount: inputs.length,
    lockNull: false,
    badHash: false,
    foreignRep: false,
    missingRep: false,
    actor,
    trip,
  };
  const query = vi.fn(
    async (
      sql: string,
      args: unknown[] = [],
    ): Promise<{ rows: Record<string, unknown>[] }> => {
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
              pins: inputs.map((pin, i) => ({
                pin,
                valid: state.valid,
                representationRole: state.representationRoles[i],
              })),
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
            role: state.representationRoles[i],
            material_kind: "TEXT",
            encoding: "UTF-8",
            remote_state: "NOT_APPLICABLE",
            text_content: state.texts[i],
          })),
        };
      throw Error("UNEXPECTED_SQL");
    },
  );
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

async function pdfFixture() {
  const f = fixture();
  const pdf = await sourcePdfV2ProofFixture({
    actorAccountId: f.state.actor,
    tripId: f.state.trip,
    sourceId: f.inputs[0].source_id,
  });
  Object.assign(f.inputs[0], {
    representation_id: pdf.derivedId,
    payload_sha256: pdf.derived.payload_sha256,
    byte_count: pdf.derived.byte_count,
    observed_source_row_revision: 2,
  });
  Object.assign(f.task.input_pins[0], {
    representation_id: pdf.derivedId,
    payload_sha256: pdf.derived.payload_sha256,
    byte_count: pdf.derived.byte_count,
    transform_sha256: PDF_V2_OPTIONS_SHA,
  });
  f.state.texts[0] = pdf.derived.text_content;
  f.state.representationRoles[0] = "DERIVED";
  pdf.close();
  pdf.continuousScope();
  const originalQuery = f.query.getMockImplementation()!;
  f.query.mockImplementation(async (sql, args = []) => {
    if (sql.includes("AS pdf_body"))
      return {
        rows: [
          {
            source: {
              ...(pdf.catalog.source as object),
              id: pdf.catalog.sourceId,
              trip_id: f.state.trip,
              acquired_by: f.state.actor,
              lifecycle: "ACTIVE",
              retention_state: "RETAINED",
            },
            pdf_body: pdf.body,
          },
        ],
      };
    if (
      [
        "AS derived",
        "page_map_sha256",
        "to_regclass",
        "SELECT s.body",
        "SELECT enabled",
        "to_regprocedure",
        "trip_sustained_universal_pdf_allowed",
        "SELECT to_jsonb(r) AS row",
      ].some((part) => sql.includes(part))
    )
      return pdf.lease.query(sql, args);
    return originalQuery(sql, args);
  });
  return { ...f, pdf };
}
it("reuses its held Core lease to verify sealed PDF material before returning owning provenance", async () => {
  const f = await pdfFixture();
  const manifest = await f.source.readManifest(f.task);
  expect(manifest.representations[0].pdfSource).toMatchObject({
    original: {
      representationId: f.pdf.originalId,
      sha256: f.pdf.original.payload_sha256,
    },
    sealSha256: f.pdf.sealed.seal_sha256,
    pageMapSha256: f.pdf.body.pageMapSha256,
  });
  expect(manifest.representations[0].bytes.toString()).toBe(f.pdf.derived.text_content);
  expect(
    f.query.mock.calls.some(
      ([sql]) => sql.includes("BEGIN") || sql.includes("trip_source_find_sustained"),
    ),
  ).toBe(false);
});
it.each(["scope", "seal", "parent", "currentRow"])(
  "rejects PDF %s without trusting Candidate provenance",
  async (failure) => {
    const f = await pdfFixture();
    if (failure === "scope") f.pdf.continuousScope(false);
    if (failure === "seal") f.pdf.sealed.seal_sha256 = "c".repeat(64);
    if (failure === "parent") f.pdf.derived.parent_ids = [randomUUID()];
    if (failure === "currentRow") f.pdf.original.row_revision++;
    await expect(f.source.readManifest(f.task)).rejects.toThrow();
  },
);

it("does not reuse cached PDF provenance after capability closes", async () => {
  const f = await pdfFixture();
  await f.source.readManifest(f.task);
  f.pdf.continuousScope(false);
  await expect(f.source.readManifest(f.task)).rejects.toThrow("CONTRACT_UNSUPPORTED");
});

it("does not leak accepted-read provenance into a later fresh read on the same lease", async () => {
  const f = await pdfFixture();
  f.pdf.continuousScope(false);
  const baseQuery = f.query.getMockImplementation()!;
  f.query.mockImplementation(async (sql, args = []) =>
    sql.includes("AS accepted") ? { rows: [{ accepted: true }] } : baseQuery(sql, args),
  );
  const scope = {
    actorAccountId: f.state.actor,
    tripId: f.state.trip,
    sourceId: f.inputs[0].source_id,
    planId: randomUUID(),
  };
  const slot = {
    p1: {},
    state: "EVIDENCE_PENDING",
    domainReceiptId: randomUUID(),
    intentSha256: "d".repeat(64),
    proposed: {
      slotId: randomUUID(),
      operationId: randomUUID(),
      candidateId: randomUUID(),
      target: { id: randomUUID() },
    },
    receipt: { outcome: "APPLIED", receiptSha256: "e".repeat(64) },
  } as CoreSourceStoredSlotV2;
  expect(
    (
      await withAcceptedUniversalReceiptRead(f.lease, scope, slot, () =>
        f.source.readManifest(f.task),
      )
    ).representations,
  ).toHaveLength(2);
  await expect(f.source.readManifest(f.task)).rejects.toThrow("CONTRACT_UNSUPPORTED");
});
