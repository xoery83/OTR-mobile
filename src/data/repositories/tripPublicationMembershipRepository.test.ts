import { createHash, randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runMigrations } from "@/data/db/migrationRunner";
import { afterEach, describe, expect, it, vi } from "vitest";
import { migrations } from "@/data/db/migrations";
import { serializeDatabaseTransactions } from "@/data/db/databaseConnection";
import {
  beginAccountTransition,
  endAccountTransition,
} from "@/data/auth/accountRequestContext";
import { canonicalEventJson, type Json } from "@/domain/trip/eventIntentJson";
import { flightInputSchema, importDigest } from "@/domain/trip/flightImportReview";
import { flightRunInputDigest } from "@/data/interpretation/flightInterpretation";
import { tripImportCatalogSchemas } from "@/data/api/tripImportCatalogContracts";
import {
  parsePublicationMembership,
  sealPublicationMembership,
  PUBLICATION_MEMBERSHIP_BYTES,
} from "@/data/api/tripPublicationMembershipContracts";
import { createTripImportAdmissionRepository } from "./tripImportAdmissionRepository";
import { createCaptureSourceBindingTransactionStore } from "./captureSourceAdmissionRepository";
import {
  createClosedPublicationMembershipReader,
  createDormantPublicationMembershipRepository,
  type PublicationMembershipDatabase,
} from "./tripPublicationMembershipRepository";
import catalogs from "./__fixtures__/tripImportCatalogs.json";

// Real SQLite1–53 catalogs and committed envelopes; the injected CLOSED RPC is TEST-ONLY.
const hash = async (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
const json = (value: unknown) => canonicalEventJson(value as Json);
const actor = catalogs.actor_account_id,
  trip = catalogs.trip_id;
const runId = catalogs.trip_source_runs[0].id;
const originalId = catalogs.trip_source_representations[0].id;
const inputId = catalogs.trip_source_inputs[0].id;
const cleanup: (() => void)[] = [];
afterEach(() => {
  for (const close of cleanup.splice(0)) close();
});

function snapshot(count = 1) {
  const value: Omit<typeof catalogs, "trip_source_representations"> & {
    trip_source_representations: ReturnType<
      typeof tripImportCatalogSchemas.trip_source_representations.parse
    >[];
  } = {
    ...structuredClone(catalogs),
    trip_source_representations: catalogs.trip_source_representations.map((r) =>
      tripImportCatalogSchemas.trip_source_representations.parse(r),
    ),
  };
  value.trip_sources = value.trip_sources.filter(
    (r) => r.id === catalogs.trip_sources[0].id,
  );
  value.trip_source_revisions = value.trip_source_revisions.filter(
    (r) => r.source_id === value.trip_sources[0].id,
  );
  value.trip_source_representations = value.trip_source_representations.filter(
    (r) => r.id === originalId,
  );
  value.trip_source_runs = value.trip_source_runs.filter((r) => r.id === runId);
  value.trip_source_inputs = value.trip_source_inputs.filter((r) => r.id === inputId);
  const candidate = value.trip_source_candidates.find((r) => r.run_id === runId)!;
  value.trip_source_candidates = Array.from({ length: count }, (_, i) => ({
    ...structuredClone(candidate),
    id: `ca140000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
    candidate_key: `candidate-${i + 1}`,
  }));
  value.trip_source_confirmations = [];
  value.trip_source_output_slots = [];
  value.trip_source_associations = [];
  value.trip_source_run_predecessors = [];
  value.trip_source_candidate_lineage = [];
  value.trip_source_slot_lineage_dispositions = [];
  value.trip_source_slot_dependencies = [];
  return value;
}
async function digest(value: ReturnType<typeof snapshot>) {
  const inputs = value.trip_source_inputs.map((i) => ({
    pin: flightInputSchema.parse(
      Object.fromEntries(
        Object.keys(flightInputSchema.shape).map((k) => [k, i[k as keyof typeof i]]),
      ),
    ),
  }));
  value.trip_source_runs[0].input_sha256 = await flightRunInputDigest(
    inputs,
    value.trip_source_representations.map((r) =>
      tripImportCatalogSchemas.trip_source_representations.parse(r),
    ),
    hash,
  );
}
function fixture(schemaAvailable = true, foreignKeys = true, fileBacked = false) {
  const dir = fileBacked ? mkdtempSync(join(tmpdir(), "otr-publication53-")) : null;
  const path = dir ? join(dir, "local.db") : ":memory:";
  let sql = new DatabaseSync(path);
  cleanup.push(() => {
    sql.close();
    if (dir) rmSync(dir, { recursive: true, force: true });
  });
  sql.exec(`PRAGMA foreign_keys=${foreignKeys ? "ON" : "OFF"}`);
  for (const m of migrations.filter((m) => m.id <= (schemaAvailable ? 53 : 52)))
    sql.exec(m.sql);
  sql
    .prepare(
      "INSERT INTO ledger_actor_context(user_id,journey_id,role,capabilities_json,updated_at) VALUES(?,?,'group_member','{}',?)",
    )
    .run(actor, trip, "2026-10-08T00:00:00.000000Z");
  let currentAccount = actor,
    loseAck = false,
    transactionActive = false;
  const database: PublicationMembershipDatabase = serializeDatabaseTransactions({
    async isInTransactionAsync() {
      return transactionActive;
    },
    async getFirstAsync<T>(query: string, ...args: unknown[]) {
      return (sql.prepare(query).get(...(args as never[])) ?? null) as T | null;
    },
    async getAllAsync<T>(query: string, ...args: unknown[]) {
      return sql.prepare(query).all(...(args as never[])) as T[];
    },
    async runAsync(query: string, ...args: unknown[]) {
      const result = sql.prepare(query).run(...(args as never[]));
      return {
        changes: Number(result.changes),
        lastInsertRowId: Number(result.lastInsertRowid),
      };
    },
    async withTransactionAsync(work: () => Promise<void>) {
      sql.exec("BEGIN");
      transactionActive = true;
      try {
        await work();
        sql.exec("COMMIT");
      } catch (e) {
        sql.exec("ROLLBACK");
        throw e;
      } finally {
        transactionActive = false;
      }
      if (loseAck) {
        loseAck = false;
        throw new Error("TEST_LOST_COMMIT_ACK");
      }
    },
  });
  const getAccountId = async () => currentAccount;
  const owning = createTripImportAdmissionRepository(
    database,
    getAccountId,
    hash,
    () => "2026-10-08T00:00:00.000000Z",
    randomUUID,
  );
  const repo = createDormantPublicationMembershipRepository(
    database,
    owning.transactionStore,
    getAccountId,
    hash,
  );
  function reader(value: ReturnType<typeof snapshot>) {
    const rpc = vi.fn(async () => json(value));
    return {
      rpc,
      boundary: createClosedPublicationMembershipReader({
        mode: "CLOSED",
        rpc,
        getAccountId,
        sha256: hash,
      }),
    };
  }
  return {
    get sql() {
      return sql;
    },
    path,
    reopen: () => {
      if (!dir) throw new Error("FILE_BACKED_FIXTURE_REQUIRED");
      sql.close();
      sql = new DatabaseSync(path);
      sql.exec(`PRAGMA foreign_keys=${foreignKeys ? "ON" : "OFF"}`);
    },
    database,
    owning,
    repo,
    reader,
    getAccountId,
    setAccount: (id: string) => {
      currentAccount = id;
    },
    loseAck: () => {
      loseAck = true;
    },
    corrupt: (raw: string) => {
      // TEST-ONLY guard bypass models stored corruption; real guard denial is tested separately.
      sql.exec(
        "DROP TRIGGER local_publication_membership_immutable; DROP TRIGGER local_publication_membership_install",
      );
      sql
        .prepare("UPDATE trip_source_runs SET publication_membership=? WHERE id=?")
        .run(raw, runId);
      for (const trigger of migrations
        .find((m) => m.id === 53)!
        .sql.split(/(?=CREATE TRIGGER)/)
        .slice(1))
        if (/local_publication_membership_(immutable|install)\b/.test(trigger))
          sql.exec(trigger);
    },
  };
}
async function installed(count = 1) {
  const f = fixture(),
    value = snapshot(count);
  await digest(value);
  const context = await f.owning.captureContext(trip),
    r = f.reader(value);
  const handle = await r.boundary.read(context);
  await f.repo.install(context, handle);
  return { ...f, value, context, handle, rpc: r.rpc };
}

function bindCapture(
  f: ReturnType<typeof fixture>,
  original: ReturnType<typeof snapshot>["trip_source_representations"][number],
) {
  const bytes = new TextEncoder().encode(original.text_content!);
  const captureId = randomUUID(),
    payloadId = randomUUID(),
    bindingId = randomUUID();
  f.sql
    .prepare(
      "INSERT INTO local_capture_payloads(account_id,id,byte_count,sha256,bytes) VALUES(?,?,?,?,?)",
    )
    .run(actor, payloadId, BigInt(bytes.length), original.payload_sha256, bytes);
  f.sql
    .prepare(
      "INSERT INTO local_capture_inbox(account_id,id,payload_id,kind,original_filename,declared_content_type,created_at,trip_id,state,revision) VALUES(?,?,?,'TEXT',NULL,NULL,?,NULL,'INBOX',1)",
    )
    .run(actor, captureId, payloadId, "2026-10-08T00:00:00.000000Z");
  f.sql
    .prepare(
      "UPDATE local_capture_inbox SET trip_id=?,state='ASSIGNED',revision=revision+1 WHERE id=?",
    )
    .run(trip, captureId);
  f.sql
    .prepare(
      "INSERT INTO local_capture_source_bindings(account_id,id,admission_key,capture_id,capture_revision,capture_payload_id,material_sha256,byte_count,trip_id,intent_kind,source_id,representation_id,material_revision,expected_source_revision,state,created_at) VALUES(?,?,?,?,?,?,?,?,?,'REUSE',?,?,1,1,'ADMITTED',?)",
    )
    .run(
      actor,
      bindingId,
      `binding-${bindingId}`,
      captureId,
      2,
      payloadId,
      original.payload_sha256,
      bytes.length,
      trip,
      original.source_id,
      original.id,
      "2026-10-08T00:00:00.000000Z",
    );
  return bindingId;
}

describe("Owner correction F1–F3", () => {
  it("internal stores fail closed when transaction-state capability is absent", async () => {
    const f = fixture(),
      context = await f.owning.captureContext(trip);
    const { isInTransactionAsync: _capability, ...database } = f.database;
    const owning = createTripImportAdmissionRepository(
      database,
      f.getAccountId,
      hash,
      () => "2026-10-08T00:00:00.000000Z",
      randomUUID,
    );
    await expect(
      owning.transactionStore.applyCatalogs(context, json(snapshot())),
    ).rejects.toThrow("IMPORT_TRANSACTION_REQUIRED");
    await expect(
      createCaptureSourceBindingTransactionStore(
        database,
        f.getAccountId,
        hash,
      ).assertCurrent(context, randomUUID(), {
        sourceId: catalogs.trip_sources[0].id,
        materialRevision: 1,
        originalIds: [originalId],
      }),
    ).rejects.toThrow("CAPTURE_SOURCE_TRANSACTION_REQUIRED");
    expect(f.sql.prepare("SELECT count(*) n FROM trip_source_runs").get()?.n).toBe(0);
  });
  it("rejects correctly rehashed out-of-scope Inputs but allows scoped Sources without Inputs", async () => {
    const f = fixture(),
      value = snapshot(),
      sid = randomUUID(),
      rid = randomUUID();
    value.trip_sources.push({
      ...value.trip_sources[0],
      id: sid,
      acquisition_key: "correction-other-source",
    });
    value.trip_source_revisions.push({
      ...value.trip_source_revisions[0],
      source_id: sid,
      original_representation_ids: [rid],
    });
    value.trip_source_representations.push({
      ...value.trip_source_representations[0],
      id: rid,
      source_id: sid,
    });
    value.trip_source_runs[0].scope_source_ids.push(sid);
    value.trip_source_runs[0].scope_source_ids.sort();
    value.trip_source_runs[0].scope_sha256 = await importDigest(
      "otr-source-run-scope-v1",
      [1, trip, actor, value.trip_source_runs[0].scope_source_ids],
      hash,
    );
    await digest(value);
    const context = await f.owning.captureContext(trip);
    await f.repo.install(context, await f.reader(value).boundary.read(context));
    expect(
      (await f.repo.read(context, runId)).membership.body.scope_source_ids,
    ).toContain(sid);
    const bad = structuredClone(value);
    bad.trip_source_runs[0].scope_source_ids = [bad.trip_sources[0].id];
    bad.trip_source_runs[0].scope_sha256 = await importDigest(
      "otr-source-run-scope-v1",
      [1, trip, actor, bad.trip_source_runs[0].scope_source_ids],
      hash,
    );
    bad.trip_source_inputs.push({
      ...bad.trip_source_inputs[0],
      id: randomUUID(),
      source_id: sid,
      representation_id: rid,
    });
    await digest(bad);
    await expect(f.reader(bad).boundary.read(context)).rejects.toThrow(
      "PUBLICATION_MEMBERSHIP_INTEGRITY",
    );
    // Persist the self-consistent catalog through historical Import, then owning read must reject.
    const other = fixture();
    const c = await other.owning.captureContext(trip);
    await other.owning.applyCatalogs(c, json(bad));
    const envelope = await parsePublicationMembership(
      (await f.reader(value).boundary.read(context)).memberships[0],
      hash,
    );
    other.corrupt(
      await sealPublicationMembership(
        {
          ...envelope.body,
          scope_source_ids: bad.trip_source_runs[0].scope_source_ids,
          scope_sha256: bad.trip_source_runs[0].scope_sha256,
          input_sha256: bad.trip_source_runs[0].input_sha256,
        },
        hash,
      ),
    );
    await expect(other.repo.read(c, runId)).rejects.toThrow(
      "PUBLICATION_MEMBERSHIP_INTEGRITY",
    );
  });

  it.each([false, true])(
    "single-Capture support resolves only one distinct Original (two roots=%s)",
    async (twoRoots) => {
      const f = fixture(),
        value = snapshot(),
        original = value.trip_source_representations[0];
      const second = { ...original, id: randomUUID() };
      if (twoRoots) {
        value.trip_source_representations.push(second);
        value.trip_source_revisions[0].original_representation_ids.push(second.id);
        value.trip_source_revisions[0].original_representation_ids.sort();
      }
      const a = {
        ...original,
        id: randomUUID(),
        role: "DERIVED" as const,
        parent_ids: [original.id],
      };
      const b = {
        ...a,
        id: randomUUID(),
        parent_ids: [twoRoots ? second.id : original.id],
      };
      const child = { ...a, id: randomUUID(), parent_ids: [a.id, b.id].sort() };
      value.trip_source_representations.push(a, b, child);
      value.trip_source_inputs[0].representation_id = child.id;
      await digest(value);
      const context = await f.owning.captureContext(trip);
      await f.repo.install(context, await f.reader(value).boundary.read(context));
      expect((await f.repo.read(context, runId)).roots[inputId]).toHaveLength(
        twoRoots ? 2 : 1,
      );
      const bindings = [bindCapture(f, original)];
      if (twoRoots) bindings.push(bindCapture(f, second));
      for (const id of bindings) {
        const support = () =>
          f.database.withTransactionAsync(async () => {
            await f.repo.transactionStore.readCaptureSupport(context, runId, inputId, id);
          });
        if (twoRoots)
          await expect(support()).rejects.toThrow("CAPTURE_SOURCE_AMBIGUOUS_ORIGINAL");
        else await support();
      }
    },
  );

  it("internal Import/Source stores require an active transaction, current Account and Trip", async () => {
    const f = await installed();
    const source = createCaptureSourceBindingTransactionStore(
      f.database,
      f.getAccountId,
      hash,
    );
    const binding = bindCapture(f, f.value.trip_source_representations[0]);
    const input = {
      sourceId: f.value.trip_sources[0].id,
      materialRevision: 1,
      originalIds: [originalId],
    };
    await expect(
      f.owning.transactionStore.applyCatalogs(f.context, json(f.value)),
    ).rejects.toThrow("IMPORT_TRANSACTION_REQUIRED");
    await expect(
      f.owning.transactionStore.assertInput(
        f.context,
        flightInputSchema.parse(
          Object.fromEntries(
            Object.keys(flightInputSchema.shape).map((k) => [
              k,
              f.value.trip_source_inputs[0][
                k as keyof (typeof f.value.trip_source_inputs)[0]
              ],
            ]),
          ),
        ),
      ),
    ).rejects.toThrow();
    await expect(source.assertCurrent(f.context, binding, input)).rejects.toThrow(
      "CAPTURE_SOURCE_TRANSACTION_REQUIRED",
    );
    f.setAccount(randomUUID());
    await expect(
      f.database.withTransactionAsync(async () => {
        await f.owning.transactionStore.applyCatalogs(f.context, json(f.value));
      }),
    ).rejects.toThrow("Account changed");
    f.setAccount(actor);
    f.sql.prepare("DELETE FROM ledger_actor_context").run();
    for (const work of [
      () => f.owning.transactionStore.applyCatalogs(f.context, json(f.value)),
      () => source.assertCurrent(f.context, binding, input),
    ])
      await expect(
        f.database.withTransactionAsync(async () => {
          await work();
        }),
      ).rejects.toThrow("IMPORT_TRIP_ACCESS");
  });
});

describe("dormant complete publication ownership", () => {
  it.each([0, 1, 2, 64])(
    "projects and verifies %s complete members deterministically",
    async (count) => {
      const f = await installed(count),
        read = await f.repo.read(f.context, runId);
      expect(read.membership.body.candidates).toHaveLength(count);
      expect(f.rpc).toHaveBeenCalledWith("trip_source_read_import_catalogs", {
        actor,
        trip,
      });
      const reversed = structuredClone(f.value);
      reversed.trip_source_candidates.reverse();
      expect((await f.reader(reversed).boundary.read(f.context)).memberships).toEqual(
        f.handle.memberships,
      );
      await f.repo.install(f.context, f.handle);
      expect((await f.repo.read(f.context, runId)).readSet).toBe(read.readSet);
    },
  );
  it.each(["missing", "pending", "extra", "substituted"])(
    "rejects %s sibling without filtering the roster",
    async (mutation) => {
      const f = await installed(2),
        sibling = f.value.trip_source_candidates[1];
      if (mutation === "missing")
        f.sql.prepare("DELETE FROM trip_source_candidates WHERE id=?").run(sibling.id);
      if (mutation === "pending")
        f.sql
          .prepare(
            "UPDATE trip_source_candidates SET registration_state='PENDING' WHERE id=?",
          )
          .run(sibling.id);
      if (mutation === "extra") {
        const added = structuredClone(f.value);
        added.trip_source_candidates.push({
          ...sibling,
          id: randomUUID(),
          candidate_key: "extra",
        });
        await f.owning.applyCatalogs(f.context, json(added));
      }
      if (mutation === "substituted")
        f.sql
          .prepare("UPDATE trip_source_candidates SET id=? WHERE id=?")
          .run(randomUUID(), sibling.id);
      await expect(f.repo.read(f.context, runId)).rejects.toThrow();
    },
  );
  it("detects an unreferenced missing Input and wrong Run digest", async () => {
    const f = fixture(),
      value = snapshot();
    value.trip_source_inputs.push({ ...value.trip_source_inputs[0], id: randomUUID() });
    await digest(value);
    const context = await f.owning.captureContext(trip),
      handle = await f.reader(value).boundary.read(context);
    await f.repo.install(context, handle);
    f.sql
      .prepare("DELETE FROM trip_source_inputs WHERE id=?")
      .run(value.trip_source_inputs[1].id);
    await expect(f.repo.read(context, runId)).rejects.toThrow(
      "PUBLICATION_MEMBERSHIP_INPUT_DIGEST",
    );
    expect(() =>
      f.sql
        .prepare("UPDATE trip_source_runs SET input_sha256=? WHERE id=?")
        .run("0".repeat(64), runId),
    ).toThrow("PUBLICATION_MEMBERSHIP_IMMUTABLE");
    await expect(f.repo.read(context, runId)).rejects.toThrow(
      "PUBLICATION_MEMBERSHIP_INPUT_DIGEST",
    );
  });
  it("wrong authoritative Input digest cannot mint a handoff", async () => {
    const f = fixture(),
      value = snapshot();
    value.trip_source_runs[0].input_sha256 = "0".repeat(64);
    await expect(
      f.reader(value).boundary.read(await f.owning.captureContext(trip)),
    ).rejects.toThrow("PUBLICATION_MEMBERSHIP_INPUT_DIGEST");
  });
  it("FK OFF cannot make deletion of an unreferenced sibling look complete", async () => {
    const f = fixture(true, false),
      value = snapshot(2);
    await digest(value);
    const context = await f.owning.captureContext(trip);
    await f.repo.install(context, await f.reader(value).boundary.read(context));
    f.sql
      .prepare("DELETE FROM trip_source_candidates WHERE id=?")
      .run(value.trip_source_candidates[1].id);
    await expect(f.repo.read(context, runId)).rejects.toThrow(
      "PUBLICATION_MEMBERSHIP_INTEGRITY",
    );
  });
  it("validates derived ancestry with distinct child bytes and original roots", async () => {
    const f = fixture(),
      value = snapshot(),
      original = value.trip_source_representations[0];
    const bytes = new TextEncoder().encode("Derived exact text");
    const child = tripImportCatalogSchemas.trip_source_representations.parse({
      ...original,
      id: randomUUID(),
      role: "DERIVED",
      parent_ids: [original.id],
      text_content: new TextDecoder().decode(bytes),
      payload_sha256: await hash(bytes),
      byte_count: bytes.length,
      transform_key: "fixture",
      transform_version: "1",
      transform_options_sha256: "0".repeat(64),
      regenerability: "POSSIBLE",
    });
    value.trip_source_representations.push(child);
    Object.assign(value.trip_source_inputs[0], {
      representation_id: child.id,
      payload_sha256: child.payload_sha256,
      byte_count: child.byte_count,
    });
    await digest(value);
    const context = await f.owning.captureContext(trip);
    await f.repo.install(context, await f.reader(value).boundary.read(context));
    expect((await f.repo.read(context, runId)).roots[inputId]).toEqual([original.id]);
    for (const broken of [[], [randomUUID()], [child.id]]) {
      const bad = structuredClone(value);
      bad.trip_source_representations[1].parent_ids = broken;
      await expect(f.reader(bad).boundary.read(context)).rejects.toThrow();
    }
  });
  it("denies absent transport, copied handles and foreign scope", async () => {
    const f = fixture(),
      context = await f.owning.captureContext(trip);
    await expect(
      createClosedPublicationMembershipReader({
        mode: "CLOSED",
        rpc: null,
        getAccountId: f.getAccountId,
        sha256: hash,
      }).read(context),
    ).rejects.toThrow("TRANSPORT_UNAVAILABLE");
    await expect(f.repo.install(context, { memberships: [] })).rejects.toThrow(
      "UNTRUSTED_HANDOFF",
    );
    const value = snapshot();
    value.actor_account_id = randomUUID();
    await expect(f.reader(value).boundary.read(context)).rejects.toThrow();
  });
  it("transaction-local methods reject use outside a transaction", async () => {
    const f = await installed();
    await expect(f.repo.transactionStore.read(f.context, runId)).rejects.toThrow(
      "TRANSACTION_REQUIRED",
    );
    await expect(f.repo.transactionStore.install(f.context, f.handle)).rejects.toThrow(
      "TRANSACTION_REQUIRED",
    );
  });
  it("rejects an owning Import store bound to a different database", () => {
    const a = fixture(),
      b = fixture();
    expect(() =>
      createDormantPublicationMembershipRepository(
        a.database,
        b.owning.transactionStore,
        a.getAccountId,
        hash,
      ),
    ).toThrow("DATABASE_MISMATCH");
  });
  it.each([
    "trip_id",
    "actor_account_id",
    "run_id",
    "generation",
    "scope_source_ids",
    "operation_key",
    "proposal_sha256",
  ])("rejects a self-consistent envelope with substituted %s", async (field) => {
    const f = await installed(),
      value = await parsePublicationMembership(f.handle.memberships[0], hash);
    const body = value.body;
    if (field === "generation") body.generation++;
    else if (field === "scope_source_ids") body.scope_source_ids = [randomUUID()];
    else if (field === "operation_key") body.operation_key = "wrong-key";
    else if (field === "proposal_sha256")
      body.candidates[0].proposal_sha256 = "0".repeat(64);
    else if (field === "trip_id") body.trip_id = randomUUID();
    else if (field === "actor_account_id") body.actor_account_id = randomUUID();
    else body.run_id = randomUUID();
    f.corrupt(await sealPublicationMembership(body, hash));
    await expect(f.repo.read(f.context, runId)).rejects.toThrow(
      "PUBLICATION_MEMBERSHIP_INTEGRITY",
    );
  });
  it("switch during protected read cannot mint an admitted handle", async () => {
    const f = fixture(),
      context = await f.owning.captureContext(trip),
      value = snapshot();
    await digest(value);
    const reader = createClosedPublicationMembershipReader({
      mode: "CLOSED",
      getAccountId: f.getAccountId,
      sha256: hash,
      rpc: async () => {
        let lease = await beginAccountTransition();
        f.setAccount(randomUUID());
        endAccountTransition(lease);
        lease = await beginAccountTransition();
        f.setAccount(actor);
        endAccountTransition(lease);
        return json(value);
      },
    });
    await expect(reader.read(context)).rejects.toThrow("Account changed");
  });
  it("preserves historical catalogs and denies SQLite52 installation before any catalog write", async () => {
    const f = fixture(false),
      value = snapshot();
    await digest(value);
    const context = await f.owning.captureContext(trip),
      handle = await f.reader(value).boundary.read(context);
    await expect(f.repo.install(context, handle)).rejects.toThrow("SCHEMA_UNAVAILABLE");
    expect(f.sql.prepare("SELECT count(*) n FROM trip_source_runs").get()?.n).toBe(0);
    await f.owning.applyCatalogs(context, json(value));
    expect(
      await f.owning.readClosureEvidence(context, value.trip_source_candidates[0].id),
    ).toBeDefined();
    await expect(f.repo.read(context, runId)).rejects.toThrow("SCHEMA_UNAVAILABLE");
    expect(migrations.at(-1)?.id).toBe(53);
  });
  it("historical NULL remains unavailable, not a certified empty publication", async () => {
    const f = fixture(),
      value = snapshot(0);
    await digest(value);
    const context = await f.owning.captureContext(trip);
    await f.owning.applyCatalogs(context, json(value));
    await expect(f.repo.read(context, runId)).rejects.toThrow("MEMBERSHIP_UNAVAILABLE");
  });
  it("exact historical installation replay survives later Source revision without granting current support", async () => {
    const f = await installed(),
      later = structuredClone(f.value);
    later.trip_sources[0].row_revision++;
    const handle = await f.reader(later).boundary.read(f.context);
    expect(handle.memberships).toEqual(f.handle.memberships);
    await f.repo.install(f.context, handle);
    await f.repo.install(f.context, f.handle);
    await expect(f.repo.read(f.context, runId)).rejects.toThrow("INPUT_STALE");
  });
  it("an older stale READY Run does not prevent a fresh complete publication", async () => {
    const f = await installed(),
      later = structuredClone(f.value);
    later.trip_sources[0].row_revision++;
    const nextId = randomUUID();
    const nextInput = {
      ...later.trip_source_inputs[0],
      id: randomUUID(),
      run_id: nextId,
      confirmation_id: null,
      observed_source_row_revision: 2,
    };
    const pin = flightInputSchema.parse(
      Object.fromEntries(
        Object.keys(flightInputSchema.shape).map((k) => [
          k,
          nextInput[k as keyof typeof nextInput],
        ]),
      ),
    );
    const inputDigest = await flightRunInputDigest(
      [{ pin }],
      later.trip_source_representations,
      hash,
    );
    later.trip_source_inputs.push(nextInput);
    later.trip_source_runs.push({
      ...later.trip_source_runs[0],
      id: nextId,
      operation_key: "fixture-next-run",
      generation: 2,
      input_sha256: inputDigest,
    });
    const handle = await f.reader(later).boundary.read(f.context);
    expect(handle.memberships).toHaveLength(2);
    await f.repo.install(f.context, handle);
    expect(
      (await f.repo.read(f.context, nextId)).membership.body.candidates,
    ).toHaveLength(0);
    await expect(f.repo.read(f.context, runId)).rejects.toThrow("INPUT_STALE");
  });
  it("A→B→A invalidates retained handoff and old reads", async () => {
    const f = await installed();
    let lease = await beginAccountTransition();
    f.setAccount(randomUUID());
    endAccountTransition(lease);
    lease = await beginAccountTransition();
    f.setAccount(actor);
    endAccountTransition(lease);
    await expect(f.repo.read(f.context, runId)).rejects.toThrow("Account changed");
    const fresh = await f.owning.captureContext(trip);
    await expect(f.repo.install(fresh, f.handle)).rejects.toThrow("UNTRUSTED_HANDOFF");
    expect((await f.repo.read(fresh, runId)).membership.body.actor_account_id).toBe(
      actor,
    );
  });
  it("corrupt or noncanonical envelope rejects; exact readback recovers simulated lost ACK", async () => {
    const f = fixture(),
      value = snapshot();
    await digest(value);
    const context = await f.owning.captureContext(trip),
      handle = await f.reader(value).boundary.read(context);
    f.loseAck();
    await expect(f.repo.install(context, handle)).rejects.toThrow("TEST_LOST_COMMIT_ACK");
    expect((await f.repo.read(context, runId)).membership.body.run_id).toBe(runId);
    await f.repo.install(context, handle);
    for (const raw of [
      "{}",
      handle.memberships[0] + " ",
      handle.memberships[0].replace(
        /"body_sha256":"[a-f0-9]+"/,
        `"body_sha256":"${"0".repeat(64)}"`,
      ),
    ]) {
      f.corrupt(raw);
      await expect(f.repo.read(context, runId)).rejects.toThrow();
    }
  });
  it("final transaction-local validator detects late permission and Source change", async () => {
    const f = await installed(),
      read = await f.repo.read(f.context, runId);
    f.sql
      .prepare("UPDATE trip_sources SET row_revision=row_revision+1 WHERE id=?")
      .run(f.value.trip_sources[0].id);
    await expect(
      f.database.withTransactionAsync(async () => {
        await f.repo.transactionStore.assertCurrent(f.context, runId, read.readSet);
      }),
    ).rejects.toThrow("INPUT_STALE");
    f.sql
      .prepare("DELETE FROM ledger_actor_context WHERE user_id=? AND journey_id=?")
      .run(actor, trip);
    await expect(f.repo.read(f.context, runId)).rejects.toThrow("IMPORT_TRIP_ACCESS");
  });
  it("failed installation rolls back catalog and committed envelope together", async () => {
    const f = await installed(2),
      before = await f.repo.read(f.context, runId);
    f.sql
      .prepare(
        "UPDATE trip_source_candidates SET registration_state='PENDING' WHERE id=?",
      )
      .run(f.value.trip_source_candidates[1].id);
    const modified = structuredClone(f.value);
    modified.trip_source_candidates.pop();
    await expect(
      f.repo.install(f.context, await f.reader(modified).boundary.read(f.context)),
    ).rejects.toThrow();
    expect(
      f.sql
        .prepare("SELECT registration_state FROM trip_source_candidates WHERE id=?")
        .get(f.value.trip_source_candidates[1].id)?.registration_state,
    ).toBe("PENDING");
    f.sql
      .prepare(
        "UPDATE trip_source_candidates SET registration_state='REGISTERED' WHERE id=?",
      )
      .run(f.value.trip_source_candidates[1].id);
    expect((await f.repo.read(f.context, runId)).readSet).toBe(before.readSet);
  });
  it("strict envelope rejects duplicate keys, versions, unsorted membership and oversized bytes", async () => {
    const f = await installed(2),
      body = (await parsePublicationMembership(f.handle.memberships[0], hash)).body;
    await expect(
      parsePublicationMembership('{"body":{},"body":{}}', hash),
    ).rejects.toThrow();
    const inspect = vi.fn(() => {
      throw new Error("must not inspect");
    });
    await expect(
      parsePublicationMembership(new Proxy({}, { get: inspect }) as string, hash),
    ).rejects.toThrow("PUBLICATION_MEMBERSHIP_INTEGRITY");
    expect(inspect).not.toHaveBeenCalled();
    await expect(
      parsePublicationMembership(" ".repeat(PUBLICATION_MEMBERSHIP_BYTES + 1), hash),
    ).rejects.toThrow();
    for (const changed of [
      { ...body, version: 2 },
      { ...body, candidates: [...body.candidates].reverse() },
      { ...body, candidates: [body.candidates[0], body.candidates[0]] },
    ])
      await expect(
        sealPublicationMembership(changed as typeof body, hash),
      ).rejects.toThrow();
  });
  it("current Capture support rejects future revisions and later unassignment", async () => {
    const f = await installed(),
      original = f.value.trip_source_representations[0];
    const bytes = new TextEncoder().encode(original.text_content!);
    const captureId = "test-capture",
      payloadId = "test-payload",
      bindingId = randomUUID();
    f.sql
      .prepare(
        "INSERT INTO local_capture_payloads(account_id,id,byte_count,sha256,bytes) VALUES(?,?,?,?,?)",
      )
      .run(actor, payloadId, BigInt(bytes.length), original.payload_sha256, bytes);
    f.sql
      .prepare(
        "INSERT INTO local_capture_inbox(account_id,id,payload_id,kind,original_filename,declared_content_type,created_at,trip_id,state,revision) VALUES(?,?,?,'TEXT',NULL,NULL,?,NULL,'INBOX',1)",
      )
      .run(actor, captureId, payloadId, "2026-10-08T00:00:00.000000Z");
    f.sql
      .prepare(
        "UPDATE local_capture_inbox SET trip_id=?,state='ASSIGNED',revision=revision+1 WHERE id=?",
      )
      .run(trip, captureId);
    const insertBinding = (id: string, revision: number) =>
      f.sql
        .prepare(
          "INSERT INTO local_capture_source_bindings(account_id,id,admission_key,capture_id,capture_revision,capture_payload_id,material_sha256,byte_count,trip_id,intent_kind,source_id,representation_id,material_revision,expected_source_revision,state,created_at) VALUES(?,?,?,?,?,?,?,?,?,'REUSE',?,?,1,1,'ADMITTED',?)",
        )
        .run(
          actor,
          id,
          `binding-${id}`,
          captureId,
          revision,
          payloadId,
          original.payload_sha256,
          bytes.length,
          trip,
          original.source_id,
          original.id,
          "2026-10-08T00:00:00.000000Z",
        );
    insertBinding(bindingId, 2);
    const current = () =>
      f.database.withTransactionAsync(async () => {
        await f.repo.transactionStore.readCaptureSupport(
          f.context,
          runId,
          inputId,
          bindingId,
        );
      });
    await current();
    const future = randomUUID();
    insertBinding(future, Number.MAX_SAFE_INTEGER);
    await expect(
      f.database.withTransactionAsync(async () => {
        await f.repo.transactionStore.readCaptureSupport(
          f.context,
          runId,
          inputId,
          future,
        );
      }),
    ).rejects.toThrow("CAPTURE_SOURCE_STALE");
    f.sql
      .prepare(
        "UPDATE local_capture_inbox SET trip_id=NULL,state='INBOX',revision=revision+1 WHERE id=?",
      )
      .run(captureId);
    await expect(current()).rejects.toThrow("CAPTURE_SOURCE_STALE");
  });
  it("maximum bounded roster fits the accepted envelope limit and uses a separate digest", async () => {
    const f = fixture(),
      value = snapshot(64);
    await digest(value);
    for (const p of value.trip_source_candidates)
      p.candidate_key = p.candidate_key.padEnd(128, "x");
    const handle = await f
      .reader(value)
      .boundary.read(await f.owning.captureContext(trip));
    expect(new TextEncoder().encode(handle.memberships[0]).length).toBeLessThanOrEqual(
      PUBLICATION_MEMBERSHIP_BYTES,
    );
    const e = await parsePublicationMembership(handle.memberships[0], hash);
    expect(e.body_sha256).not.toBe(e.body.input_sha256);
    expect(e.body_sha256).not.toBe(e.body.candidates[0].proposal_sha256);
  });
});

describe("SQLite53 real publication persistence (CLOSED transport fixtures only)", () => {
  it.each([true, false])(
    "file-backed lost COMMIT ACK, cold exact read and replay FK=%s",
    async (fk) => {
      const f = fixture(true, fk, true),
        value = snapshot(2);
      value.trip_source_inputs.push({ ...value.trip_source_inputs[0], id: randomUUID() });
      const original = value.trip_source_representations[0];
      const bytes = new TextEncoder().encode("cold derived material");
      const child = tripImportCatalogSchemas.trip_source_representations.parse({
        ...original,
        id: randomUUID(),
        role: "DERIVED",
        parent_ids: [original.id],
        text_content: new TextDecoder().decode(bytes),
        payload_sha256: await hash(bytes),
        byte_count: bytes.length,
        transform_key: "test-only",
        transform_version: "1",
        transform_options_sha256: "0".repeat(64),
        regenerability: "POSSIBLE",
      });
      value.trip_source_representations.push(child);
      Object.assign(value.trip_source_inputs[0], {
        representation_id: child.id,
        payload_sha256: child.payload_sha256,
        byte_count: child.byte_count,
      });
      await digest(value);
      const context = await f.owning.captureContext(trip),
        r = f.reader(value),
        handle = await r.boundary.read(context);
      f.loseAck();
      await expect(f.repo.install(context, handle)).rejects.toThrow(
        "TEST_LOST_COMMIT_ACK",
      );
      f.reopen();
      const fresh = await f.owning.captureContext(trip),
        recovered = await f.repo.read(fresh, runId);
      expect(recovered.membership.body.candidates).toHaveLength(2);
      expect(recovered.roots[inputId]).toEqual([original.id]);
      expect(
        f.sql
          .prepare("SELECT count(*) n FROM trip_source_inputs WHERE run_id=?")
          .get(runId)?.n,
      ).toBe(2);
      expect(
        f.sql
          .prepare("SELECT publication_membership FROM trip_source_runs WHERE id=?")
          .get(runId)?.publication_membership,
      ).toBe(handle.memberships[0]);
      const before = f.sql.prepare("SELECT * FROM trip_source_runs").all();
      await f.repo.install(fresh, handle);
      expect(f.sql.prepare("SELECT * FROM trip_source_runs").all()).toEqual(before);
      expect((await f.repo.read(fresh, runId)).readSet).toBe(recovered.readSet);
      expect(r.rpc).toHaveBeenCalledTimes(1);
      // Existing pre53 Import callers ignore the additive column and preserve its exact bytes.
      await f.owning.applyCatalogs(fresh, json(value));
      expect(
        await f.owning.readClosureEvidence(fresh, value.trip_source_candidates[0].id),
      ).toBeDefined();
      f.reopen();
      expect(
        (await f.repo.read(await f.owning.captureContext(trip), runId)).readSet,
      ).toBe(recovered.readSet);
      expect(f.sql.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    },
  );

  it.each([true, false])(
    "committed column/Run identity and retention guards FK=%s",
    async (fk) => {
      const f = fixture(true, fk),
        value = snapshot();
      await digest(value);
      const c = await f.owning.captureContext(trip),
        handle = await f.reader(value).boundary.read(c);
      await f.repo.install(c, handle);
      const before = f.sql
        .prepare("SELECT * FROM trip_source_runs WHERE id=?")
        .get(runId)!;
      const substitutions: Record<string, unknown> = {
        publication_membership: null,
        cache_account_id: randomUUID(),
        id: randomUUID(),
        trip_id: randomUUID(),
        actor_account_id: randomUUID(),
        operation_key: "different",
        scope_source_ids: "[]",
        scope_sha256: "0".repeat(64),
        generation: Number(before.generation) + 1,
        input_sha256: "0".repeat(64),
        extractor_key: "different",
        extractor_version: "different",
        extractor_options_sha256: "f".repeat(64),
        state: "FAILED",
        created_at: "2026-10-09T00:00:00.000000Z",
        completed_at: "2026-10-09T00:00:00.000000Z",
        error_code: "different",
      };
      for (const [column, substitute] of Object.entries(substitutions)) {
        expect(() =>
          f.sql
            .prepare(`UPDATE trip_source_runs SET ${column}=? WHERE id=?`)
            .run(substitute as never, runId),
        ).toThrow("PUBLICATION_MEMBERSHIP_IMMUTABLE");
        expect(
          f.sql.prepare("SELECT * FROM trip_source_runs WHERE id=?").get(runId),
        ).toEqual(before);
      }
      expect(() =>
        f.sql
          .prepare("UPDATE trip_source_runs SET publication_membership=? WHERE id=?")
          .run(handle.memberships[0] + " ", runId),
      ).toThrow("PUBLICATION_MEMBERSHIP_IMMUTABLE");
      expect(() =>
        f.sql.prepare("DELETE FROM trip_source_runs WHERE id=?").run(runId),
      ).toThrow("PUBLICATION_MEMBERSHIP_RETAINED");
      const copy = {
        ...before,
        id: randomUUID(),
        operation_key: "insert-copy",
        generation: 2,
      };
      expect(() =>
        f.sql
          .prepare(
            `INSERT INTO trip_source_runs(${Object.keys(copy).join(",")}) VALUES(${Object.keys(
              copy,
            )
              .map(() => "?")
              .join(",")})`,
          )
          .run(...(Object.values(copy) as never[])),
      ).toThrow("PUBLICATION_MEMBERSHIP_INSTALL_REQUIRED");
      f.sql
        .prepare(
          "UPDATE trip_source_runs SET publication_membership=publication_membership,row_revision=row_revision+1,registration_state='PENDING',retention_state='IDENTITY_ONLY' WHERE id=?",
        )
        .run(runId);
      expect(
        f.sql
          .prepare("SELECT publication_membership FROM trip_source_runs WHERE id=?")
          .get(runId)?.publication_membership,
      ).toBe(handle.memberships[0]);
      await expect(f.repo.read(c, runId)).rejects.toThrow();
    },
  );

  it.each([true, false])(
    "NULL install requires all accepted Run/body bindings FK=%s",
    async (fk) => {
      const f = fixture(true, fk),
        value = snapshot();
      await digest(value);
      const c = await f.owning.captureContext(trip),
        handle = await f.reader(value).boundary.read(c);
      await f.owning.applyCatalogs(c, json(value));
      const parsed = await parsePublicationMembership(handle.memberships[0], hash);
      for (const [field, wrong] of Object.entries({
        version: 2,
        run_id: randomUUID(),
        actor_account_id: randomUUID(),
        trip_id: randomUUID(),
        operation_key: "wrong",
        generation: parsed.body.generation + 1,
        scope_source_ids: [],
        scope_sha256: "0".repeat(64),
        input_sha256: "0".repeat(64),
        extractor_key: "wrong",
        extractor_version: "wrong",
        extractor_options_sha256: "f".repeat(64),
      })) {
        const raw = json({ ...parsed, body: { ...parsed.body, [field]: wrong } });
        expect(() =>
          f.sql
            .prepare("UPDATE trip_source_runs SET publication_membership=? WHERE id=?")
            .run(raw, runId),
        ).toThrow("PUBLICATION_MEMBERSHIP_INVALID_INSTALL");
      }
      for (const [column, wrong] of Object.entries({
        registration_state: "PENDING",
        state: "RUNNING",
        retention_state: "IDENTITY_ONLY",
        cache_account_id: randomUUID(),
      })) {
        expect(() =>
          f.sql
            .prepare(
              `UPDATE trip_source_runs SET publication_membership=?,${column}=? WHERE id=?`,
            )
            .run(handle.memberships[0], wrong, runId),
        ).toThrow("PUBLICATION_MEMBERSHIP_INVALID_INSTALL");
      }
      for (const raw of ["", "not-json", "[]", "null", "1", new Uint8Array([123, 125])])
        expect(() =>
          f.sql
            .prepare("UPDATE trip_source_runs SET publication_membership=? WHERE id=?")
            .run(raw as never, runId),
        ).toThrow();
      expect(
        f.sql
          .prepare("SELECT publication_membership FROM trip_source_runs WHERE id=?")
          .get(runId)?.publication_membership,
      ).toBeNull();
      await f.repo.install(c, handle);
      expect((await f.repo.read(c, runId)).membership).toEqual(parsed);
    },
  );

  it.each([true, false].flatMap((fk) => [32768, 32769].map((size) => ({ fk, size }))))(
    "SQL UTF8 envelope boundary $size bytes FK=$fk; structural admission never certifies semantic validity",
    async ({ fk, size }) => {
      const f = fixture(true, fk),
        value = snapshot();
      await digest(value);
      const c = await f.owning.captureContext(trip),
        handle = await f.reader(value).boundary.read(c);
      await f.owning.applyCatalogs(c, json(value));
      const envelope = JSON.parse(handle.memberships[0]);
      envelope.padding = "";
      const remaining = size - new TextEncoder().encode(json(envelope)).length;
      envelope.padding =
        "旅".repeat(Math.floor(remaining / 3)) + "x".repeat(remaining % 3);
      const raw = json(envelope);
      expect(new TextEncoder().encode(raw)).toHaveLength(size);
      const update = () =>
        f.sql
          .prepare("UPDATE trip_source_runs SET publication_membership=? WHERE id=?")
          .run(raw, runId);
      if (size === 32768) {
        update();
        expect(
          f.sql
            .prepare(
              "SELECT length(CAST(publication_membership AS BLOB)) n FROM trip_source_runs",
            )
            .get()?.n,
        ).toBe(32768);
        await expect(f.repo.read(c, runId)).rejects.toThrow();
      } else {
        expect(update).toThrow();
        expect(
          f.sql.prepare("SELECT publication_membership FROM trip_source_runs").get()
            ?.publication_membership,
        ).toBeNull();
      }
      await expect(parsePublicationMembership(raw, hash)).rejects.toThrow();
    },
  );

  it.each([
    "missing Candidate",
    "extra Candidate",
    "substituted Candidate",
    "missing Input",
  ])(
    "cold complete owning read rejects %s without repairing evidence",
    async (damage) => {
      const f = fixture(true, false, true),
        value = snapshot(2);
      value.trip_source_inputs.push({ ...value.trip_source_inputs[0], id: randomUUID() });
      await digest(value);
      const c = await f.owning.captureContext(trip),
        handle = await f.reader(value).boundary.read(c);
      await f.repo.install(c, handle);
      const sibling = value.trip_source_candidates[1];
      if (damage === "missing Candidate")
        f.sql.prepare("DELETE FROM trip_source_candidates WHERE id=?").run(sibling.id);
      if (damage === "substituted Candidate")
        f.sql
          .prepare("UPDATE trip_source_candidates SET id=? WHERE id=?")
          .run(randomUUID(), sibling.id);
      if (damage === "missing Input")
        f.sql
          .prepare("DELETE FROM trip_source_inputs WHERE id=?")
          .run(value.trip_source_inputs[1].id);
      if (damage === "extra Candidate") {
        const extra = structuredClone(value);
        extra.trip_source_candidates.push({
          ...sibling,
          id: randomUUID(),
          candidate_key: "extra-cold",
        });
        await f.owning.applyCatalogs(c, json(extra));
      }
      f.reopen();
      const before = f.sql
        .prepare("SELECT publication_membership FROM trip_source_runs WHERE id=?")
        .get(runId);
      await expect(
        f.repo.read(await f.owning.captureContext(trip), runId),
      ).rejects.toThrow();
      expect(
        f.sql
          .prepare("SELECT publication_membership FROM trip_source_runs WHERE id=?")
          .get(runId),
      ).toEqual(before);
    },
  );

  it.each([true, false])(
    "populated52→53 keeps historical NULL and every prior typed catalog value/history FK=%s",
    async (fk) => {
      const f = fixture(false, fk, true),
        value = snapshot(2);
      await digest(value);
      const c = await f.owning.captureContext(trip);
      await f.owning.applyCatalogs(c, json(value));
      f.sql.exec(
        "CREATE TABLE schema_migrations(id INTEGER PRIMARY KEY,name TEXT NOT NULL,applied_at TEXT NOT NULL)",
      );
      for (const m of migrations.filter((m) => m.id <= 52))
        f.sql
          .prepare("INSERT INTO schema_migrations VALUES(?,?,?)")
          .run(m.id, m.name, "retained52");
      const history = f.sql.prepare("SELECT * FROM schema_migrations ORDER BY id").all();
      const tables = f.sql
        .prepare(
          "SELECT name FROM sqlite_schema WHERE type='table' AND name<>'schema_migrations'",
        )
        .all()
        .map((r) => String(r.name));
      const projections = tables.map((table) => ({
        table,
        columns: f.sql
          .prepare(`PRAGMA table_info(${table})`)
          .all()
          .map((r) => String(r.name)),
      }));
      const rows = () =>
        projections.map(({ table, columns }) =>
          f.sql
            .prepare(
              `SELECT ${columns.flatMap((c) => [`"${c}"`, `typeof("${c}") AS "type_${c}"`]).join(",")} FROM "${table}"`,
            )
            .all(),
        );
      const before = rows();
      const adapter = {
        ...f.database,
        execAsync: async (q: string) => {
          f.sql.exec(q);
        },
      };
      await runMigrations(adapter);
      await runMigrations(adapter);
      expect(rows()).toEqual(before);
      expect(
        f.sql.prepare("SELECT * FROM schema_migrations WHERE id<=52 ORDER BY id").all(),
      ).toEqual(history);
      expect(
        f.sql.prepare("SELECT publication_membership FROM trip_source_runs").get()
          ?.publication_membership,
      ).toBeNull();
      await expect(f.repo.read(c, runId)).rejects.toThrow(
        "PUBLICATION_MEMBERSHIP_UNAVAILABLE",
      );
      expect(
        await f.owning.readClosureEvidence(c, value.trip_source_candidates[0].id),
      ).toBeDefined();
      f.reopen();
      expect(rows()).toEqual(before);
      await f.repo.install(
        await f.owning.captureContext(trip),
        await f.reader(value).boundary.read(await f.owning.captureContext(trip)),
      );
      expect(
        (await f.repo.read(await f.owning.captureContext(trip), runId)).membership.body
          .candidates,
      ).toHaveLength(2);
    },
  );
});

it("file-backed A→B→A rejects old contexts/handles and admits only fresh A recovery", async () => {
  const f = fixture(true, true, true),
    value = snapshot();
  await digest(value);
  const c = await f.owning.captureContext(trip),
    handle = await f.reader(value).boundary.read(c);
  await f.repo.install(c, handle);
  const before = f.sql
    .prepare("SELECT publication_membership FROM trip_source_runs WHERE id=?")
    .get(runId);
  let lease = await beginAccountTransition();
  f.setAccount(randomUUID());
  endAccountTransition(lease);
  const other = await f.owning.captureContext(trip);
  await expect(f.repo.read(other, runId)).rejects.toThrow("IMPORT_TRIP_ACCESS");
  lease = await beginAccountTransition();
  f.setAccount(actor);
  endAccountTransition(lease);
  f.reopen();
  await expect(f.repo.read(c, runId)).rejects.toThrow("Account changed");
  const fresh = await f.owning.captureContext(trip);
  await expect(f.repo.install(fresh, handle)).rejects.toThrow("UNTRUSTED_HANDOFF");
  expect((await f.repo.read(fresh, runId)).membership.body.actor_account_id).toBe(actor);
  expect(
    f.sql
      .prepare("SELECT publication_membership FROM trip_source_runs WHERE id=?")
      .get(runId),
  ).toEqual(before);
});

it.each([true, false])(
  "first envelope write and catalog merge roll back together on complete-roster rejection FK=%s",
  async (fk) => {
    const f = fixture(true, fk),
      complete = snapshot(2);
    await digest(complete);
    const c = await f.owning.captureContext(trip);
    await f.owning.applyCatalogs(c, json(complete));
    const before = f.sql.prepare("SELECT * FROM trip_source_runs").all();
    const candidates = f.sql
      .prepare("SELECT * FROM trip_source_candidates ORDER BY id")
      .all();
    const incomplete = structuredClone(complete);
    incomplete.trip_source_candidates.pop();
    const handle = await f.reader(incomplete).boundary.read(c),
      writes = vi.spyOn(f.database, "runAsync");
    await expect(f.repo.install(c, handle)).rejects.toThrow(
      "PUBLICATION_MEMBERSHIP_INTEGRITY",
    );
    expect(
      writes.mock.calls.filter(([q]) =>
        q.startsWith("UPDATE trip_source_runs SET publication_membership="),
      ),
    ).toHaveLength(1);
    expect(f.sql.prepare("SELECT * FROM trip_source_runs").all()).toEqual(before);
    expect(
      f.sql.prepare("SELECT * FROM trip_source_candidates ORDER BY id").all(),
    ).toEqual(candidates);
    expect(
      f.sql.prepare("SELECT publication_membership FROM trip_source_runs").get()
        ?.publication_membership,
    ).toBeNull();
    await f.repo.install(c, await f.reader(complete).boundary.read(c));
    expect((await f.repo.read(c, runId)).membership.body.candidates).toHaveLength(2);
  },
);

const replacementPragmas = [false, true].flatMap((fk) =>
  [false, true].map((recursive) => ({ fk, recursive })),
);
it.each(
  replacementPragmas.flatMap((pragmas) =>
    ["INSERT", "UPDATE"].flatMap((operation) =>
      ["primary", "operation", "scope"].map((constraint) => ({
        ...pragmas,
        operation,
        constraint,
      })),
    ),
  ),
)(
  "F1 retains committed cold Run: $operation replacement $constraint FK=$fk recursive=$recursive",
  async ({ fk, recursive, operation, constraint }) => {
    const f = fixture(true, fk, true),
      value = snapshot();
    f.sql.exec(`PRAGMA recursive_triggers=${recursive ? "ON" : "OFF"}`);
    await digest(value);
    const context = await f.owning.captureContext(trip);
    const handle = await f.reader(value).boundary.read(context);
    await f.repo.install(context, handle);
    const committed = f.sql
      .prepare("SELECT * FROM trip_source_runs WHERE id=?")
      .get(runId)!;
    const next = {
      ...committed,
      id: randomUUID(),
      operation_key: "f1-null-run",
      generation: 2,
      publication_membership: null,
    };
    const insert = (row: typeof next, replace = false) =>
      f.sql
        .prepare(
          `INSERT ${replace ? "OR REPLACE" : ""} INTO trip_source_runs(${Object.keys(row).join(",")}) VALUES(${Object.keys(
            row,
          )
            .map(() => "?")
            .join(",")})`,
        )
        .run(...(Object.values(row) as never[]));
    if (operation === "UPDATE") insert(next);
    const read = await f.repo.read(context, runId);
    const before = f.sql
      .prepare("SELECT * FROM trip_source_runs ORDER BY cache_account_id,id")
      .all();
    const guards = f.sql
      .prepare(
        "SELECT name,sql FROM sqlite_schema WHERE name LIKE 'local_publication_membership_%' ORDER BY name",
      )
      .all();
    const column =
      constraint === "primary"
        ? "id"
        : constraint === "operation"
          ? "operation_key"
          : "generation";
    const substitute = committed[column];
    expect(() =>
      operation === "INSERT"
        ? insert({ ...next, [column]: substitute }, true)
        : f.sql
            .prepare(`UPDATE OR REPLACE trip_source_runs SET ${column}=? WHERE id=?`)
            .run(substitute, next.id),
    ).toThrow(
      operation === "INSERT"
        ? "PUBLICATION_MEMBERSHIP_INSTALL_REQUIRED"
        : "PUBLICATION_MEMBERSHIP_IMMUTABLE",
    );
    expect(
      f.sql.prepare("SELECT * FROM trip_source_runs ORDER BY cache_account_id,id").all(),
    ).toEqual(before);
    f.reopen();
    f.sql.exec(`PRAGMA recursive_triggers=${recursive ? "ON" : "OFF"}`);
    expect(
      f.sql.prepare("SELECT * FROM trip_source_runs ORDER BY cache_account_id,id").all(),
    ).toEqual(before);
    expect(
      f.sql
        .prepare(
          "SELECT name,sql FROM sqlite_schema WHERE name LIKE 'local_publication_membership_%' ORDER BY name",
        )
        .all(),
    ).toEqual(guards);
    expect(await f.repo.read(await f.owning.captureContext(trip), runId)).toEqual(read);
  },
);
it.each(replacementPragmas)(
  "F1 preserves legitimate NULL replacement and committed observation/retention updates FK=$fk recursive=$recursive",
  async ({ fk, recursive }) => {
    const f = fixture(true, fk, true),
      value = snapshot();
    f.sql.exec(`PRAGMA recursive_triggers=${recursive ? "ON" : "OFF"}`);
    await digest(value);
    const context = await f.owning.captureContext(trip);
    const handle = await f.reader(value).boundary.read(context);
    await f.repo.install(context, handle);
    const committed = f.sql
      .prepare("SELECT * FROM trip_source_runs WHERE id=?")
      .get(runId)!;
    const nullRun = {
      ...committed,
      id: randomUUID(),
      operation_key: "f1-historical-null",
      generation: 2,
      publication_membership: null,
    };
    const insert = f.sql.prepare(
      `INSERT OR REPLACE INTO trip_source_runs(${Object.keys(nullRun).join(",")}) VALUES(${Object.keys(
        nullRun,
      )
        .map(() => "?")
        .join(",")})`,
    );
    insert.run(...(Object.values(nullRun) as never[]));
    insert.run(...(Object.values({ ...nullRun, row_revision: 2 }) as never[]));
    f.sql
      .prepare(
        "UPDATE OR REPLACE trip_source_runs SET operation_key='f1-allowed-null',generation=3,row_revision=3 WHERE id=?",
      )
      .run(nullRun.id);
    f.sql
      .prepare(
        "UPDATE OR REPLACE trip_source_runs SET row_revision=row_revision+1,retention_state='IDENTITY_ONLY' WHERE id=?",
      )
      .run(runId);
    const before = f.sql.prepare("SELECT * FROM trip_source_runs ORDER BY id").all();
    f.reopen();
    expect(f.sql.prepare("SELECT * FROM trip_source_runs ORDER BY id").all()).toEqual(
      before,
    );
    expect(
      f.sql
        .prepare("SELECT publication_membership FROM trip_source_runs WHERE id=?")
        .get(nullRun.id)?.publication_membership,
    ).toBeNull();
    expect(f.sql.prepare("SELECT * FROM trip_source_runs WHERE id=?").get(runId)).toEqual(
      {
        ...committed,
        row_revision: Number(committed.row_revision) + 1,
        retention_state: "IDENTITY_ONLY",
      },
    );
  },
);
