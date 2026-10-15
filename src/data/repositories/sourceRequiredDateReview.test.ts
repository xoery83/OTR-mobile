import { createHash, randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, expect, it } from "vitest";
import { createCaptureSubmissionRepository } from "./captureSubmissionRepository";
import { importDigest } from "@/domain/trip/flightImportReview";
import { migrations } from "@/data/db/migrations";
import { serializeDatabaseTransactions } from "@/data/db/databaseConnection";
import {
  beginAccountTransition,
  endAccountTransition,
} from "@/data/auth/accountRequestContext";
import {
  createTripImportAdmissionRepository,
  type ImportAdmissionDatabase,
} from "./tripImportAdmissionRepository";
import { createLocalCaptureInboxRepository } from "./localCaptureInboxRepository";
import { createCaptureSourceAdmissionRepository } from "./captureSourceAdmissionRepository";
import catalogs from "./__fixtures__/tripImportCatalogs.json";
const hash = async (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
const actor = catalogs.actor_account_id,
  trip = catalogs.trip_id;
const connections: DatabaseSync[] = [];
const folders: string[] = [];
afterEach(() => {
  for (const db of connections.splice(0)) {
    try {
      db.close();
    } catch {}
  }
  for (const dir of folders.splice(0))
    rmSync(dir, { recursive: true, force: true });
});
function fixture(foreignKeys: boolean, path = ":memory:", initialize = true) {
  const sql = new DatabaseSync(path);
  connections.push(sql);
  sql.exec(`PRAGMA foreign_keys=${foreignKeys ? "ON" : "OFF"}`);
  if (initialize) {
    for (const m of migrations) sql.exec(m.sql);
  }
  if (initialize)
    sql
      .prepare(
        "INSERT INTO ledger_actor_context(user_id,journey_id,role,capabilities_json,updated_at) VALUES(?,?,'group_member','{}',?)",
      )
      .run(actor, trip, "2026-10-05T00:00:00.000000Z");
  const database: ImportAdmissionDatabase = serializeDatabaseTransactions({
    async isInTransactionAsync() {
      return sql.isTransaction;
    },
    async getFirstAsync<T>(query: string, ...params: unknown[]) {
      return (sql.prepare(query).get(...(params as never[])) ??
        null) as T | null;
    },
    async getAllAsync<T>(query: string, ...params: unknown[]) {
      return sql.prepare(query).all(...(params as never[])) as T[];
    },
    async runAsync(query: string, ...params: unknown[]) {
      return sql.prepare(query).run(...(params as never[])) as never;
    },
    async withTransactionAsync(work: () => Promise<void>) {
      sql.exec("BEGIN");
      try {
        await work();
        sql.exec("COMMIT");
      } catch (e) {
        sql.exec("ROLLBACK");
        throw e;
      }
    },
  });
  const repo = createTripImportAdmissionRepository(
    database,
    async () => actor,
    hash,
    () => "2026-10-05T00:00:00.000000Z",
    randomUUID,
  );
  return { sql, repo, database };
}

it("saves only genuine current accepted-source date decisions, replays and preserves immutable versions", async () => {
  const dir = mkdtempSync(join(tmpdir(), "required-date-"));
  folders.push(dir);
  const path = join(dir, "local.db");
  const f = fixture(true, path),
    c = await f.repo.captureContext(trip),
    clone = structuredClone(catalogs);
  const candidate = clone.trip_source_candidates[0];
  candidate.proposal.fields.origin.proposed_value.time.local_date =
    null as never;
  candidate.proposal_sha256 = await importDigest(
    "otr-source-candidate-v1",
    candidate.proposal,
    hash,
  );
  await f.repo.applyCatalogs(c, JSON.stringify(catalogs));
  // Synthetic current-owner reassessment fixture; no runtime business write.
  f.sql
    .prepare(
      "UPDATE trip_source_candidates SET proposal=?,proposal_sha256=? WHERE id=?",
    )
    .run(
      JSON.stringify(candidate.proposal),
      candidate.proposal_sha256,
      candidate.id,
    );
  const now = () => "2026-10-15T00:00:00.000000Z",
    deps = { sha256: hash, newId: randomUUID, now };
  const inbox = createLocalCaptureInboxRepository(
    f.database,
    async () => actor,
    deps,
  );
  const submissions = createCaptureSubmissionRepository(
    f.database,
    async () => actor,
    deps,
  );
  const source = clone.trip_sources[0],
    original = clone.trip_source_representations.find(
      (r) => r.source_id === source.id && r.role === "ORIGINAL",
    )!;
  const bytes = new TextEncoder().encode(original.text_content!);
  const jobId = randomUUID(),
    inputId = randomUUID();
  const batchId = randomUUID();
  const request = {
    accountId: actor,
    batchId,
    jobId,
    submissionKey: randomUUID(),
    formatVersion: 1 as const,
    manifestVersion: 1 as const,
    createdAt: now(),
    context: {
      id: randomUUID(),
      version: 1 as const,
      accountId: actor,
      batchId,
      observedAt: now(),
      clock: "DEVICE_WALL" as const,
      entrySurface: "CAPTURE" as const,
      tripPrior: null,
    },
    inputs: [
      {
        id: inputId,
        itemKey: randomUUID(),
        ordinal: 0,
        acquisitionSource: "files" as const,
        kind: "TEXT" as const,
        originalFilename: null,
        declaredContentType: "text/plain",
        continuesFromInputId: null,
      },
    ],
  };
  const model = await submissions.submit(
    request,
    new Map([[inputId, async () => ({ bytes })]]),
  );
  const accepted = model.inputs[0];
  const capture = await inbox.assign(
    accepted.captureId!,
    trip,
    accepted.captureRevision!,
  );
  const sourceRepo = createCaptureSourceAdmissionRepository(
    f.database,
    async () => actor,
    {
      ...deps,
      handoff: (id) => inbox.getForSourceHandoff(id),
      readSelectedMaterial: async () => bytes,
    },
  );
  await expect(
    f.repo.readRequiredDate(c, { jobId, candidateId: candidate.id }),
  ).rejects.toThrow("REQUIRED_DATE_UNAVAILABLE");
  await sourceRepo.admit(c, {
    id: randomUUID(),
    admission_key: "required-date",
    capture_id: capture.id,
    capture_revision: capture.revision,
    intent_kind: "REUSE",
    source_id: source.id,
    representation_id: original.id,
    material_revision: 1,
    expected_source_revision: source.row_revision,
    source_operation_id: null,
    source_operation_key: null,
  });
  const target = { jobId, candidateId: candidate.id };
  const read = await f.repo.readRequiredDate(c, target);
  expect(read.state.application).toBe("APPLY_UNAVAILABLE");
  await expect(
    f.repo.readRequiredDate(c, { ...target, jobId: randomUUID() }),
  ).rejects.toThrow();
  await expect(
    f.repo.saveRequiredDate(c, {
      target,
      pins: { ...read.pins, bindingSha256: "0".repeat(64) },
      decisionId: randomUUID(),
      expectedVersion: 0,
      date: "2026-12-17",
    }),
  ).rejects.toThrow("INPUT_STALE");
  const decision = {
    target,
    pins: read.pins,
    decisionId: randomUUID(),
    expectedVersion: 0,
    date: "2026-12-17",
  };
  // A date already present is outside TYPE05, even with otherwise valid UI pins.
  const originalCandidate = catalogs.trip_source_candidates[0];
  f.sql
    .prepare(
      "UPDATE trip_source_candidates SET proposal=?,proposal_sha256=? WHERE id=?",
    )
    .run(
      JSON.stringify(originalCandidate.proposal),
      originalCandidate.proposal_sha256,
      candidate.id,
    );
  await expect(f.repo.readRequiredDate(c, target)).rejects.toThrow(
    "REQUIRED_DATE_UNAVAILABLE",
  );
  await expect(f.repo.saveRequiredDate(c, decision)).rejects.toThrow(
    "REQUIRED_DATE_UNAVAILABLE",
  );
  f.sql
    .prepare(
      "UPDATE trip_source_candidates SET proposal=?,proposal_sha256=? WHERE id=?",
    )
    .run(
      JSON.stringify(candidate.proposal),
      candidate.proposal_sha256,
      candidate.id,
    );
  const first = await f.repo.saveRequiredDate(c, decision);
  expect(first.state).toMatchObject({
    decision: "SAVED",
    application: "APPLY_UNAVAILABLE",
    remainingChange: 0,
    canonicalReceipt: null,
  });
  expect(await f.repo.saveRequiredDate(c, decision)).toEqual(first);
  const cold = fixture(true, path, false);
  expect(
    (
      await cold.repo.readRequiredDate(
        await cold.repo.captureContext(trip),
        target,
      )
    ).history,
  ).toEqual([first.answer]);
  await expect(
    f.repo.saveRequiredDate({ ...c, tripId: randomUUID() }, decision),
  ).rejects.toThrow("IMPORT_TRIP_ACCESS");
  await expect(
    f.repo.saveRequiredDate(c, { ...decision, decisionId: randomUUID() }),
  ).rejects.toThrow("IMPORT_CAS_CONFLICT");
  await expect(
    f.repo.saveRequiredDate(c, { ...decision, date: "2026-12-18" }),
  ).rejects.toThrow();
  await expect(
    f.repo.saveRequiredDate(c, { ...decision, date: "2026-02-30" }),
  ).rejects.toThrow();
  const concurrent = await Promise.allSettled(
    ["2026-12-18", "2026-12-19"].map((date) =>
      f.repo.saveRequiredDate(c, {
        ...decision,
        decisionId: randomUUID(),
        expectedVersion: 1,
        date,
      }),
    ),
  );
  expect(concurrent.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(concurrent.filter((r) => r.status === "rejected")).toHaveLength(1);
  expect((await f.repo.readRequiredDate(c, target)).history).toHaveLength(2);
  const lease = await beginAccountTransition();
  endAccountTransition(lease);
  await expect(
    f.repo.saveRequiredDate(c, {
      ...decision,
      expectedVersion: 2,
      decisionId: randomUUID(),
    }),
  ).rejects.toThrow("Account changed");
  const fresh = await f.repo.captureContext(trip);
  expect(() =>
    f.sql.exec("UPDATE source_required_date_decisions SET decision_version=3"),
  ).toThrow();
  f.sql
    .prepare("UPDATE trip_source_runs SET generation=generation+100 WHERE id=?")
    .run(candidate.run_id);
  await expect(
    f.repo.saveRequiredDate(fresh, {
      ...decision,
      decisionId: randomUUID(),
      expectedVersion: 2,
    }),
  ).rejects.toThrow("INPUT_STALE");
  expect((await f.repo.readRequiredDate(fresh, target)).state.decision).toBe(
    "NEEDS_RECHECK",
  );
  expect(
    f.sql.prepare("SELECT count(*) n FROM source_required_date_decisions").get()
      ?.n,
  ).toBe(2);
  // Restore the independent generation probe before the legitimate R1→R2 case.
  f.sql
    .prepare("UPDATE trip_source_runs SET generation=? WHERE id=?")
    .run(
      catalogs.trip_source_runs.find((run) => run.id === candidate.run_id)!
        .generation,
      candidate.run_id,
    );
  const beforeSupersede = await f.repo.readRequiredDate(fresh, target);
  const retained = f.sql
    .prepare(
      "SELECT * FROM source_required_date_decisions ORDER BY decision_version",
    )
    .all();
  const replacement = catalogs.trip_source_runs.find(
    (run) => run.id !== candidate.run_id,
  )!;
  // Both registered READY runs came through normal applyCatalogs above.
  f.sql
    .prepare("UPDATE trip_source_runs SET superseded_by=? WHERE id=?")
    .run(replacement.id, candidate.run_id);
  await expect(f.repo.readRequiredDate(fresh, target)).rejects.toThrow(
    "REQUIRED_DATE_UNAVAILABLE",
  );
  await expect(
    f.repo.saveRequiredDate(fresh, {
      ...decision,
      pins: beforeSupersede.pins,
      decisionId: randomUUID(),
      expectedVersion: 2,
    }),
  ).rejects.toThrow("REQUIRED_DATE_UNAVAILABLE");
  expect(
    f.sql
      .prepare(
        "SELECT * FROM source_required_date_decisions ORDER BY decision_version",
      )
      .all(),
  ).toEqual(retained);
});
