import { createHash, randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it, vi } from "vitest";
import { migrations } from "@/data/db/migrations";
import { serializeDatabaseTransactions } from "@/data/db/databaseConnection";
import {
  beginAccountTransition,
  endAccountTransition,
} from "@/data/auth/accountRequestContext";
import {
  canonicalSubmission,
  boundedSubmissionJson,
  type SubmissionRequest,
} from "@/domain/capture/captureSubmission";
import { importDigest, flightInputSchema } from "@/domain/trip/flightImportReview";
import { canonicalEventJson, type Json } from "@/domain/trip/eventIntentJson";
import { createCaptureSubmissionRepository } from "./captureSubmissionRepository";
import { createTripImportAdmissionRepository } from "./tripImportAdmissionRepository";
import { createLocalCaptureInboxRepository } from "./localCaptureInboxRepository";
import { createCaptureSourceAdmissionRepository } from "./captureSourceAdmissionRepository";
import { flightRunInputDigest } from "@/data/interpretation/flightInterpretation";
import { tripImportCatalogSchemas } from "@/data/api/tripImportCatalogContracts";
import {
  createClosedPublicationMembershipReader,
  createDormantPublicationMembershipRepository,
  type PublicationMembershipDatabase,
} from "./tripPublicationMembershipRepository";
import { createCaptureBatchAssessmentAdapter } from "./captureBatchAssessmentAdapter";
import catalogs from "./__fixtures__/tripImportCatalogs.json";
const sha256 = async (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
const now = () => "2026-10-08T00:00:00.000Z";
const cleanup: (() => void)[] = [];
afterEach(() => cleanup.splice(0).forEach((fn) => fn()));
function fixture() {
  const sql = new DatabaseSync(":memory:");
  cleanup.push(() => sql.close());
  sql.exec("PRAGMA foreign_keys=ON");
  for (const migration of migrations) sql.exec(migration.sql);
  let account = catalogs.actor_account_id;
  const getAccount = async () => account;
  let active = false;
  const db: PublicationMembershipDatabase = serializeDatabaseTransactions({
    async isInTransactionAsync() {
      return active;
    },
    async getFirstAsync<T>(q: string, ...p: unknown[]) {
      return (sql.prepare(q).get(...(p as never[])) ?? null) as T | null;
    },
    async getAllAsync<T>(q: string, ...p: unknown[]) {
      return sql.prepare(q).all(...(p as never[])) as T[];
    },
    async runAsync(q: string, ...p: unknown[]) {
      const result = sql.prepare(q).run(...(p as never[]));
      return {
        changes: Number(result.changes),
        lastInsertRowId: Number(result.lastInsertRowid),
      };
    },
    async withTransactionAsync(fn: () => Promise<void>) {
      expect(active).toBe(false);
      sql.exec("BEGIN");
      active = true;
      try {
        await fn();
        sql.exec("COMMIT");
      } catch (e) {
        sql.exec("ROLLBACK");
        throw e;
      } finally {
        active = false;
      }
    },
  });
  const submissions = createCaptureSubmissionRepository(db, getAccount, {
    sha256,
    now,
    newId: randomUUID,
  });
  const admission = createTripImportAdmissionRepository(
    db,
    getAccount,
    sha256,
    now,
    randomUUID,
  );
  const deps = { sha256, now, newId: randomUUID };
  const captures = createLocalCaptureInboxRepository(db, getAccount, deps);
  const membership = createDormantPublicationMembershipRepository(
    db,
    admission.transactionStore,
    getAccount,
    sha256,
  );
  const adapter = createCaptureBatchAssessmentAdapter(
    db,
    admission.transactionStore,
    getAccount,
    deps,
  );
  function late(work: () => Promise<void> | void) {
    let fired = false;
    return createCaptureBatchAssessmentAdapter(
      db,
      admission.transactionStore,
      getAccount,
      {
        ...deps,
        sha256: async (bytes) => {
          if (!active && !fired) {
            fired = true;
            await work();
          }
          return sha256(bytes);
        },
      },
    );
  }
  function request(n = 1): SubmissionRequest {
    const batchId = randomUUID();
    return {
      formatVersion: 1,
      manifestVersion: 1,
      accountId: account,
      batchId,
      jobId: randomUUID(),
      submissionKey: randomUUID(),
      createdAt: now(),
      context: {
        id: randomUUID(),
        version: 1,
        accountId: account,
        batchId,
        observedAt: now(),
        clock: "DEVICE_WALL",
        entrySurface: "CAPTURE",
        tripPrior: null,
      },
      inputs: Array.from({ length: n }, (_, ordinal) => ({
        id: randomUUID(),
        itemKey: randomUUID(),
        ordinal,
        acquisitionSource: "files",
        kind: "TEXT",
        originalFilename: null,
        declaredContentType: null,
        continuesFromInputId: null,
      })),
    };
  }
  async function submit(n = 1) {
    const r = request(n);
    await submissions.submit(
      r,
      new Map(
        r.inputs.map((i) => [
          i.id,
          async () => ({ bytes: new TextEncoder().encode("abc") }),
        ]),
      ),
    );
    return r;
  }
  async function publish(
    r: SubmissionRequest,
    edit?: (c: typeof catalogs) => Promise<void> | void,
    trusted = true,
  ) {
    const job = await submissions.reopen(r.jobId);
    const item = job.inputs[0];
    const c = structuredClone(catalogs);
    for (const key of Object.keys(c))
      if (Array.isArray(c[key as keyof typeof c]))
        (c as unknown as Record<string, unknown>)[key] = [];
    c.trip_sources = [structuredClone(catalogs.trip_sources[0])];
    c.trip_source_revisions = [structuredClone(catalogs.trip_source_revisions[0])];
    c.trip_source_representations = [
      structuredClone(catalogs.trip_source_representations[0]),
    ];
    c.trip_source_runs = [structuredClone(catalogs.trip_source_runs[0])];
    c.trip_source_inputs = [
      structuredClone(
        catalogs.trip_source_inputs.find((i) => i.run_id === c.trip_source_runs[0].id)!,
      ),
    ];
    c.trip_source_candidates = [structuredClone(catalogs.trip_source_candidates[0])];
    const rep = c.trip_source_representations[0];
    rep.text_content = "abc";
    rep.byte_count = 3;
    rep.payload_sha256 = item.contentSha256!;
    c.trip_source_inputs[0].payload_sha256 = item.contentSha256!;
    c.trip_source_inputs[0].byte_count = 3;
    const inputId = c.trip_source_inputs[0].id;
    const proposal = {
      fields: {
        title: {
          proposed_value: "Flight",
          input_ids: [inputId],
          locators: [
            {
              input_id: inputId,
              kind: "WHOLE",
              page: null,
              start: null,
              end: null,
              region: null,
            },
          ],
        },
      },
    };
    c.trip_source_candidates[0].proposal = proposal as never;
    c.trip_source_candidates[0].proposal_sha256 = await importDigest(
      "otr-source-candidate-v1",
      proposal as Json,
      sha256,
    );
    sql
      .prepare(
        "INSERT INTO ledger_actor_context(user_id,journey_id,role,capabilities_json,updated_at) VALUES(?,?,'group_member','{}',?)",
      )
      .run(account, c.trip_id, now());
    if (edit) await edit(c);
    c.trip_source_runs[0].input_sha256 = await flightRunInputDigest(
      c.trip_source_inputs.map((i) => ({
        pin: flightInputSchema.parse(
          Object.fromEntries(
            Object.keys(flightInputSchema.shape).map((k) => [k, i[k as keyof typeof i]]),
          ),
        ),
      })),
      c.trip_source_representations.map((r) =>
        tripImportCatalogSchemas.trip_source_representations.parse(r),
      ),
      sha256,
    );
    const context = await admission.captureContext(c.trip_id);
    if (trusted) {
      // TEST-ONLY CLOSED Transport; production composition stays absent.
      const reader = createClosedPublicationMembershipReader({
        mode: "CLOSED",
        rpc: async () => canonicalEventJson(c as Json),
        getAccountId: getAccount,
        sha256,
      });
      await membership.install(context, await reader.read(context));
    } else await admission.applyCatalogs(context, JSON.stringify(c));
    const current = await captures.assign(
      item.captureId!,
      c.trip_id,
      item.captureRevision!,
    );
    const source = createCaptureSourceAdmissionRepository(db, getAccount, {
      ...deps,
      handoff: (id) => captures.getForSourceHandoff(id),
      readSelectedMaterial: async () => new TextEncoder().encode("abc"),
    });
    await source.admit(context, {
      id: randomUUID(),
      admission_key: randomUUID(),
      capture_id: item.captureId!,
      capture_revision: current.revision,
      intent_kind: "REUSE",
      source_id: c.trip_sources[0].id,
      representation_id: rep.id,
      material_revision: 1,
      expected_source_revision: c.trip_sources[0].row_revision,
      source_operation_id: null,
      source_operation_key: null,
    });
    return c;
  }
  async function switchTo(next: string) {
    const lease = await beginAccountTransition();
    account = next;
    endAccountTransition(lease);
  }
  return {
    sql,
    db,
    late,
    captures,
    membership,
    submissions,
    admission,
    adapter,
    request,
    submit,
    publish,
    switchTo,
    getAccount,
  };
}
describe("dormant integrated P2b-A adapter / SQLite51–53", () => {
  it("preserves exact C2 digests, distinct C4a domains and UNKNOWN without writes", async () => {
    const f = fixture(),
      r = await f.submit();
    const before = f.sql.prepare("SELECT total_changes() n").get()!.n;
    const writes = vi
      .spyOn(f.db, "runAsync")
      .mockRejectedValue(new Error("WRITE_DENIED"));
    const a = await f.adapter.assess(r.jobId);
    expect(await f.adapter.assess(r.jobId)).toEqual(a);
    expect(a.c2).toEqual({
      requestSha256: await sha256(new TextEncoder().encode(canonicalSubmission(r))),
      manifestSha256: await sha256(
        new TextEncoder().encode(boundedSubmissionJson(r.inputs)),
      ),
    });
    expect(a.manifest.contextSha256).toBe(
      await importDigest("otr-capture-context-v1", r.context as Json, sha256),
    );
    expect(a.snapshot.manifestSha256).toBe(
      await importDigest("otr-capture-intake-manifest-v1", a.manifest as Json, sha256),
    );
    expect(a.snapshot.manifestSha256).not.toBe(a.c2.manifestSha256);
    expect(a.snapshot.inputs[0].processing).toBe("UNKNOWN");
    expect(a.assessment.barrier).toBe("PENDING");
    expect(writes).not.toHaveBeenCalled();
    expect(f.sql.prepare("SELECT total_changes() n").get()!.n).toBe(before);
  });
  it("preserves failed, pending and uncertain commit occurrences", async () => {
    const f = fixture(),
      r = f.request(3);
    await f.submissions.register(r);
    f.sql
      .prepare(
        "UPDATE capture_submission_inputs SET acceptance_state='FAILED',pending_reason=NULL,failure_code='READER_FAILURE',row_revision=row_revision+1 WHERE input_id=?",
      )
      .run(r.inputs[0].id);
    f.sql
      .prepare(
        "UPDATE capture_submission_inputs SET pending_reason='RECOVER_COMMIT',row_revision=row_revision+1 WHERE input_id=?",
      )
      .run(r.inputs[2].id);
    const a = await f.adapter.assess(r.jobId);
    expect(a.assessment.coverage.map((i) => i.inputId)).toEqual(
      r.inputs.map((i) => i.id),
    );
    expect(a.assessment.coverage.map((i) => i.acquisition.state)).toEqual([
      "FAILED",
      "PENDING",
      "UNKNOWN",
    ]);
  });
  it("retains 64 occurrences and rejects 65 whole", async () => {
    const f = fixture(),
      a = f.request(64),
      b = f.request(65);
    await f.submissions.register(a);
    await f.submissions.register(b);
    expect((await f.adapter.assess(a.jobId)).snapshot.inputs).toHaveLength(64);
    await expect(f.adapter.assess(b.jobId)).rejects.toThrow("C4A_RESOURCE_LIMIT");
  });
  it("keeps duplicate bytes distinct and blocks unproven sibling independence", async () => {
    const f = fixture(),
      r = await f.submit(2);
    await f.publish(r);
    const a = await f.adapter.assess(r.jobId);
    const originals = a.snapshot.inputs.map((i) =>
      i.acquisition.state === "ACCEPTED" ? i.acquisition.original : null,
    );
    expect(originals[0]!.payloadId).toBe(originals[1]!.payloadId);
    expect(originals[0]!.captureId).not.toBe(originals[1]!.captureId);
    expect(a.snapshot.inputs.map((i) => i.processing)).toEqual(["UNDERSTOOD", "UNKNOWN"]);
    expect(a.assessment.findings[0]).toMatchObject({
      dependencyState: "BLOCKED",
      reasons: ["DEPENDENCY_UNKNOWN"],
      matureActionableAttention: false,
    });
    expect(a.assessment.preparation).toBe("NOT_AUTHORIZED");
  });
  it("preserves acceptance-time revision separately from current assigned Capture", async () => {
    const f = fixture(),
      r = await f.submit();
    await f.publish(r);
    const a = await f.adapter.assess(r.jobId);
    expect(a.snapshot.inputs[0].acquisition).toMatchObject({ original: { revision: 1 } });
    expect(
      f.sql.prepare("SELECT capture_revision FROM local_capture_source_bindings").get()!
        .capture_revision,
    ).toBe(2);
    const writes = vi
      .spyOn(f.db, "runAsync")
      .mockRejectedValue(new Error("WRITE_DENIED"));
    await f.adapter.assess(r.jobId);
    expect(writes).not.toHaveBeenCalled();
  });
  it.each([
    "missing candidate",
    "extra candidate",
    "pending candidate",
    "substituted proposal",
    "missing sibling Input",
    "all Inputs missing",
    "pending Input",
    "substituted Input",
    "missing membership",
    "extra Input",
    "false Run digest",
    "Run generation",
    "Candidate scope",
  ])("F1 rejects %s in the complete publication", async (kind) => {
    const f = fixture(),
      r = await f.submit();
    const c = await f.publish(r, (value) => {
      value.trip_source_candidates.push({
        ...structuredClone(value.trip_source_candidates[0]),
        id: randomUUID(),
        candidate_key: "unreferenced-candidate",
      });
      value.trip_source_inputs.push({
        ...structuredClone(value.trip_source_inputs[0]),
        id: randomUUID(),
      });
    });
    expect((await f.adapter.assess(r.jobId)).snapshot.findings).toHaveLength(2);
    const candidate = c.trip_source_candidates[1].id,
      input = c.trip_source_inputs[1].id;
    if (kind === "missing candidate")
      f.sql.prepare("DELETE FROM trip_source_candidates WHERE id=?").run(candidate);
    if (kind === "extra candidate") {
      const columns = f.sql
        .prepare("PRAGMA table_info(trip_source_candidates)")
        .all()
        .map((row) => row.name as string);
      const values = columns.map((col) =>
        col === "id" ? "?" : col === "candidate_key" ? "'extra'" : col,
      );
      f.sql
        .prepare(
          `INSERT INTO trip_source_candidates (${columns.join(",")}) SELECT ${values.join(",")} FROM trip_source_candidates WHERE id=?`,
        )
        .run(randomUUID(), candidate);
    }
    if (kind === "pending candidate")
      f.sql
        .prepare(
          "UPDATE trip_source_candidates SET registration_state='PENDING' WHERE id=?",
        )
        .run(candidate);
    if (kind === "substituted proposal")
      f.sql
        .prepare("UPDATE trip_source_candidates SET proposal_sha256=? WHERE id=?")
        .run("0".repeat(64), candidate);
    if (kind === "missing sibling Input")
      f.sql.prepare("DELETE FROM trip_source_inputs WHERE id=?").run(input);
    if (kind === "all Inputs missing") f.sql.exec("DELETE FROM trip_source_inputs");
    if (kind === "pending Input")
      f.sql
        .prepare("UPDATE trip_source_inputs SET registration_state='PENDING' WHERE id=?")
        .run(input);
    if (kind === "substituted Input")
      f.sql
        .prepare("UPDATE trip_source_inputs SET payload_sha256=? WHERE id=?")
        .run("0".repeat(64), input);
    // TEST-ONLY lost committed envelope, bypassing the production immutable guard.
    if (kind === "missing membership")
      f.sql.exec(
        "DROP TRIGGER local_publication_membership_immutable; UPDATE trip_source_runs SET publication_membership=NULL",
      );
    if (kind === "extra Input") {
      const columns = f.sql
        .prepare("PRAGMA table_info(trip_source_inputs)")
        .all()
        .map((row) => row.name as string);
      f.sql
        .prepare(
          `INSERT INTO trip_source_inputs (${columns.join(",")}) SELECT ${columns.map((col) => (col === "id" ? "?" : col)).join(",")} FROM trip_source_inputs WHERE id=?`,
        )
        .run(randomUUID(), input);
    }
    if (kind === "false Run digest" || kind === "Run generation") {
      // TEST-ONLY damage to protected identity; production53 already rejects these writes.
      f.sql.exec("DROP TRIGGER local_publication_membership_immutable");
      if (kind === "false Run digest")
        f.sql.prepare("UPDATE trip_source_runs SET input_sha256=?").run("0".repeat(64));
      else f.sql.exec("UPDATE trip_source_runs SET generation=generation+1");
    }
    if (kind === "Candidate scope") {
      // TEST-ONLY foreign-scope storage corruption with FK enforcement disabled.
      f.sql.exec("PRAGMA foreign_keys=OFF");
      f.sql
        .prepare("UPDATE trip_source_candidates SET run_id=? WHERE id=?")
        .run(randomUUID(), candidate);
    }
    await expect(f.adapter.assess(r.jobId)).rejects.toThrow();
  });
  it.each(["unassigned", "stale", "future", "payload", "Trip"])(
    "F2 rejects current Capture %s",
    async (kind) => {
      const f = fixture(),
        r = await f.submit();
      await f.publish(r);
      const job = await f.submissions.reopen(r.jobId),
        id = job.inputs[0].captureId!;
      if (kind === "unassigned") await f.captures.assign(id, null, 2);
      if (kind === "stale") {
        await f.captures.assign(id, null, 2);
        await f.captures.assign(id, catalogs.trip_id, 3);
      }
      // TEST-ONLY damaged storage: production guards also deny these identity mutations.
      if (kind === "future" || kind === "payload") {
        const triggers = f.sql
          .prepare(
            "SELECT name FROM sqlite_master WHERE type='trigger' AND tbl_name='local_capture_source_bindings'",
          )
          .all();
        for (const trigger of triggers) f.sql.exec(`DROP TRIGGER ${trigger.name}`);
      }
      if (kind === "future")
        f.sql.exec(
          "UPDATE local_capture_source_bindings SET capture_revision=capture_revision+1",
        );
      if (kind === "payload")
        f.sql.exec(
          "UPDATE local_capture_source_bindings SET material_sha256='" +
            "0".repeat(64) +
            "'",
        );
      if (kind === "Trip") f.sql.exec("DELETE FROM ledger_actor_context");
      await expect(f.adapter.assess(r.jobId)).rejects.toThrow();
    },
  );
  it.each([
    "Trip",
    "Source",
    "Run",
    "earlier Candidate",
    "Account A→B→A",
    "Capture",
    "Representation",
  ])("F3 rejects late %s outside the final gate", async (kind) => {
    const f = fixture(),
      r = await f.submit();
    await f.publish(r, (value) => {
      value.trip_source_candidates.push({
        ...structuredClone(value.trip_source_candidates[0]),
        id: randomUUID(),
        candidate_key: "later-candidate",
      });
    });
    const a = f.late(async () => {
      if (kind === "Trip") f.sql.exec("DELETE FROM ledger_actor_context");
      if (kind === "Capture") {
        const job = await f.submissions.reopen(r.jobId);
        await f.captures.assign(job.inputs[0].captureId!, null, 2);
      }
      if (kind === "Representation")
        f.sql.exec("UPDATE trip_source_representations SET row_revision=row_revision+1");
      if (kind === "Source")
        f.sql.exec("UPDATE trip_sources SET row_revision=row_revision+1");
      // TEST-ONLY damaged Run identity; SQLite53 also forbids this mutation.
      if (kind === "Run")
        f.sql.exec(
          "DROP TRIGGER local_publication_membership_immutable; UPDATE trip_source_runs SET state='FAILED'",
        );
      if (kind === "earlier Candidate")
        f.sql.exec(
          "UPDATE trip_source_candidates SET row_revision=row_revision+1 WHERE candidate_key='occurrence-1'",
        );
      if (kind === "Account A→B→A") {
        await f.switchTo(randomUUID());
        await f.switchTo(r.accountId);
      }
    });
    await expect(a.assess(r.jobId)).rejects.toThrow();
  });
  it("F3 rejects a legal late PENDING C2 revision at the final gate", async () => {
    const f = fixture(),
      r = f.request(2);
    await f.submissions.submit(
      r,
      new Map([
        [r.inputs[0].id, async () => ({ bytes: new TextEncoder().encode("abc") })],
      ]),
    );
    await f.publish(r);
    const pendingId = r.inputs[1].id;
    const pending = () =>
      f.sql
        .prepare(
          "SELECT acceptance_state, pending_reason, row_revision FROM capture_submission_inputs WHERE account_id=? AND input_id=?",
        )
        .get(r.accountId, pendingId);
    expect(pending()).toMatchObject({
      acceptance_state: "PENDING",
      pending_reason: "REACQUIRE",
      row_revision: 2,
    });
    let mutationChanges = 0;
    const a = f.late(() => {
      mutationChanges = Number(
        f.sql
          .prepare(
            "UPDATE capture_submission_inputs SET pending_reason='RECOVER_COMMIT',row_revision=row_revision+1 WHERE account_id=? AND input_id=? AND acceptance_state='PENDING' AND row_revision=2",
          )
          .run(r.accountId, pendingId).changes,
      );
    });
    const transactions = vi.spyOn(f.db, "withTransactionAsync");
    const reads = vi.spyOn(f.db, "getAllAsync");
    await expect(a.assess(r.jobId)).rejects.toEqual(new Error("C4A_STALE_REVISION"));
    expect(mutationChanges).toBe(1);
    expect(pending()).toMatchObject({
      acceptance_state: "PENDING",
      pending_reason: "RECOVER_COMMIT",
      row_revision: 3,
    });
    expect(transactions).toHaveBeenCalledTimes(2);
    expect(
      reads.mock.calls.filter(([query]) =>
        query.includes("typeof(row_revision) AS revisionStorage"),
      ),
    ).toHaveLength(2);
  });
  it("fails closed for historical NULL and missing CLOSED Transport", async () => {
    const f = fixture(),
      r = await f.submit();
    const c = await f.publish(r, undefined, false);
    await expect(f.adapter.assess(r.jobId)).rejects.toThrow();
    await expect(
      createClosedPublicationMembershipReader({
        mode: "CLOSED",
        rpc: null,
        getAccountId: f.getAccount,
        sha256,
      }).read(await f.admission.captureContext(c.trip_id)),
    ).rejects.toThrow("TRANSPORT_UNAVAILABLE");
    await expect(
      f.membership.install(await f.admission.captureContext(c.trip_id), {
        memberships: [],
      }),
    ).rejects.toThrow("UNTRUSTED_HANDOFF");
  });
  it("isolates Account B while fresh A can reopen", async () => {
    const f = fixture(),
      r = await f.submit();
    await f.switchTo(randomUUID());
    await expect(f.adapter.assess(r.jobId)).rejects.toThrow();
    await f.switchTo(r.accountId);
    expect((await f.adapter.assess(r.jobId)).manifest.accountId).toBe(r.accountId);
  });
});

async function derive(
  c: typeof catalogs,
  shape: "simple" | "diamond" | "two roots" | "missing" | "foreign",
) {
  const original = c.trip_source_representations[0];
  const make = async (parents: string[], text: string) =>
    tripImportCatalogSchemas.trip_source_representations.parse({
      ...original,
      id: randomUUID(),
      role: "DERIVED",
      parent_ids: parents.sort(),
      text_content: text,
      payload_sha256: await sha256(new TextEncoder().encode(text)),
      byte_count: new TextEncoder().encode(text).length,
      transform_key: "test-only",
      transform_version: "1",
      transform_options_sha256: "0".repeat(64),
      regenerability: "POSSIBLE",
    });
  let parents = [original.id];
  if (shape === "diamond") {
    const left = await make(parents, "left"),
      right = await make(parents, "right");
    c.trip_source_representations.push(left as never, right as never);
    parents = [left.id, right.id];
  }
  if (shape === "two roots") {
    const other = { ...structuredClone(original), id: randomUUID() };
    c.trip_source_representations.push(other);
    parents.push(other.id);
    c.trip_source_revisions[0].original_representation_ids.push(other.id);
    c.trip_source_revisions[0].original_representation_ids.sort();
  }
  if (shape === "missing") parents = [randomUUID()];
  if (shape === "foreign") {
    const other = {
      ...structuredClone(original),
      id: randomUUID(),
      source_id: randomUUID(),
    };
    c.trip_source_representations.push(other);
    parents = [other.id];
  }
  const child = await make(parents, "legitimate derived bytes");
  c.trip_source_representations.push(child as never);
  Object.assign(c.trip_source_inputs[0], {
    representation_id: child.id,
    payload_sha256: child.payload_sha256,
    byte_count: child.byte_count,
  });
  return child;
}
describe("F4 owning Representation ancestry", () => {
  it.each(["simple", "diamond"] as const)(
    "preserves distinct original/derived pins for %s",
    async (shape) => {
      const f = fixture(),
        r = await f.submit();
      let derived: Awaited<ReturnType<typeof derive>>;
      const c = await f.publish(r, async (value) => {
        derived = await derive(value, shape);
      });
      const a = await f.adapter.assess(r.jobId),
        i = a.snapshot.inputs[0];
      expect(i.processing).toBe("UNDERSTOOD");
      expect(a.provenance[0]).toMatchObject({
        original: {
          id: c.trip_source_representations[0].id,
          sha256: c.trip_source_representations[0].payload_sha256,
          byteCount: 3,
        },
        selected: {
          id: derived!.id,
          sha256: derived!.payload_sha256,
          byteCount: derived!.byte_count,
        },
      });
      expect(i.bindings[0].pin).toMatchObject({
        representation_id: derived!.id,
        payload_sha256: derived!.payload_sha256,
        byte_count: derived!.byte_count,
      });
      expect(i.acquisition).toMatchObject({
        original: {
          sha256: c.trip_source_representations[0].payload_sha256,
          byteCount: 3,
        },
      });
      expect(i.bindings[0].pin.representation_id).not.toBe(
        c.trip_source_representations[0].id,
      );
      expect(i.bindings[0].pin.payload_sha256).not.toBe(
        c.trip_source_representations[0].payload_sha256,
      );
    },
  );
  it("rejects multiple distinct Original roots at the single-Capture support seam", async () => {
    const f = fixture(),
      r = await f.submit();
    await f.publish(r, (c) => derive(c, "two roots").then(() => undefined));
    await expect(f.adapter.assess(r.jobId)).rejects.toThrow("AMBIGUOUS_ORIGINAL");
  });
  it.each(["missing", "foreign"] as const)(
    "denies %s ancestry before owning installation",
    async (shape) => {
      const f = fixture(),
        r = await f.submit();
      await expect(
        f.publish(r, (c) => derive(c, shape).then(() => undefined)),
      ).rejects.toThrow();
      expect((await f.adapter.assess(r.jobId)).snapshot.inputs[0].processing).toBe(
        "UNKNOWN",
      );
    },
  );
});
