import { createHash, randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import { afterEach, expect } from "vitest";
import { migrations } from "@/data/db/migrations";
import { serializeDatabaseTransactions } from "@/data/db/databaseConnection";
import {
  beginAccountTransition,
  endAccountTransition,
} from "@/data/auth/accountRequestContext";
import { type SubmissionRequest } from "@/domain/capture/captureSubmission";
import { importDigest, flightInputSchema } from "@/domain/trip/flightImportReview";
import { canonicalEventJson, type Json } from "@/domain/trip/eventIntentJson";
import { createCaptureSubmissionRepository } from "../captureSubmissionRepository";
import { createTripImportAdmissionRepository } from "../tripImportAdmissionRepository";
import { createLocalCaptureInboxRepository } from "../localCaptureInboxRepository";
import { createCaptureSourceAdmissionRepository } from "../captureSourceAdmissionRepository";
import { flightRunInputDigest } from "@/data/interpretation/flightInterpretation";
import { tripImportCatalogSchemas } from "@/data/api/tripImportCatalogContracts";
import {
  createClosedPublicationMembershipReader,
  createDormantPublicationMembershipRepository,
  type PublicationMembershipDatabase,
} from "../tripPublicationMembershipRepository";
import { createCaptureBatchAssessmentAdapter } from "../captureBatchAssessmentAdapter";
import catalogs from "./tripImportCatalogs.json";
export const sha256 = async (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
export const now = () => "2026-10-08T00:00:00.000Z";
const cleanup: (() => void)[] = [];
afterEach(() => cleanup.splice(0).forEach((fn) => fn()));
export function fixture(fileBacked = false) {
  const dir = fileBacked ? mkdtempSync(join(tmpdir(), "otr-p2c-")) : null;
  const path = dir ? join(dir, "local.db") : ":memory:";
  let sql = new DatabaseSync(path);
  cleanup.push(() => {
    sql.close();
    if (dir) rmSync(dir, { recursive: true, force: true });
  });
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
    get sql() {
      return sql;
    },
    path,
    reopen() {
      sql.close();
      sql = new DatabaseSync(path);
      sql.exec("PRAGMA foreign_keys=ON");
    },
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
