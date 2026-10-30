import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { migrations, type Migration } from "../migrations";
import {
  getSchemaVersion,
  runMigrations,
  type MigrationDatabase,
} from "../migrationRunner";
import { capturePhotoImportDecisionsDefinition as definition } from "./capturePhotoImportDecisions";
import {
  fixture,
  now,
  sha256,
} from "@/data/repositories/__fixtures__/captureBatchAssessment";
import { createCaptureProcessingRepository } from "@/data/repositories/captureProcessingRepository";
import { captureAccountRequestContext } from "@/data/auth/accountRequestContext";
import { createCapturePhotoImportDecisionRepository } from "@/data/repositories/capturePhotoImportDecisionRepository";

const candidate: Migration = { id: 75, ...definition };
const sourceHashes = () =>
  migrations
    .filter((m) => m.id <= 74)
    .map((m) => ({
      id: m.id,
      name: m.name,
      sha256: createHash("sha256").update(m.sql).digest("hex"),
    }));
type Fault = "AFTER_DDL" | "BEFORE_MARKER" | "AFTER_MARKER" | null;

// Test-process registry only: real Runner/SQL, no shared registry source modification.
async function withBaseline(
  work: (f: Awaited<ReturnType<typeof seed>>) => Promise<void>,
) {
  const original = [...migrations];
  try {
    migrations.splice(0, migrations.length, ...original.filter((m) => m.id <= 74));
    expect(migrations.map((m) => m.id)).toEqual(
      Array.from({ length: 74 }, (_, i) => i + 1),
    );
    const f = await seed();
    migrations.push(candidate);
    await work(f);
  } finally {
    migrations.splice(0, migrations.length, ...original);
  }
}
async function seed() {
  const f = fixture(true, 0);
  let fault: Fault = null;
  let candidateExecutions = 0;
  const database: MigrationDatabase = {
    ...f.db,
    async execAsync(sql) {
      f.sql.exec(sql);
      if (sql === candidate.sql) {
        candidateExecutions++;
        if (fault === "AFTER_DDL") {
          fault = null;
          throw new Error("AFTER_DDL");
        }
      }
    },
    async runAsync(sql, ...args) {
      const marker = sql.startsWith("INSERT INTO schema_migrations") && args[0] === 75;
      if (marker && fault === "BEFORE_MARKER") {
        fault = null;
        throw new Error("BEFORE_MARKER");
      }
      const result = await f.db.runAsync(sql, ...(args as unknown as never[]));
      if (marker && fault === "AFTER_MARKER") {
        fault = null;
        throw new Error("AFTER_MARKER");
      }
      return result;
    },
  };
  await runMigrations(database);
  expect(await getSchemaVersion(database)).toBe(74);
  const request = f.request(3);
  request.inputs[0].kind = "TEXT";
  request.inputs[0].declaredContentType = "text/plain";
  request.inputs[1].kind = "FILE";
  request.inputs[1].declaredContentType = "application/pdf";
  request.inputs[1].originalFilename = "retained.pdf";
  request.inputs[2].kind = "IMAGE";
  request.inputs[2].acquisitionSource = "photos";
  request.inputs[2].declaredContentType = "image/jpeg";
  const originals = [
    new TextEncoder().encode("Synthetic existing text source"),
    new Uint8Array(
      readFileSync(
        new URL("../../../../output/pdf/universal-p6-activity-qa.pdf", import.meta.url),
      ),
    ),
    Uint8Array.of(255, 216, 255, 1, 2),
  ];
  await f.submissions.submit(
    request,
    new Map(
      request.inputs.map((input, index) => [
        input.id,
        async () => ({ bytes: originals[index] }),
      ]),
    ),
  );
  const context = await captureAccountRequestContext("", f.getAccount);
  const deps = { sha256, now, newId: randomUUID };
  const processing = createCaptureProcessingRepository(f.db, f.getAccount, deps);
  const queued = await processing.schedule(context, request.jobId);
  expect(queued).toHaveLength(3);
  const tables = [
    "capture_submission_batches",
    "capture_submission_inputs",
    "local_capture_inbox",
    "local_capture_payloads",
    "sync_operations",
    "capture_processing_events",
    "capture_local_interpretation_results",
  ];
  const snapshot = () =>
    tables.map((table) => ({
      table,
      rows: f.sql.prepare(`SELECT rowid,* FROM ${table} ORDER BY rowid`).all(),
    }));
  const objects = () =>
    f.sql
      .prepare(
        "SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND tbl_name<>'capture_photo_import_decisions' ORDER BY type,name",
      )
      .all();
  const markers = () =>
    f.sql.prepare("SELECT * FROM schema_migrations WHERE id<=74 ORDER BY id").all();
  const before = {
    rows: snapshot(),
    objects: objects(),
    markers: markers(),
    sources: sourceHashes(),
  };
  const model = await f.submissions.reopen(request.jobId, context);
  const image = model.inputs[2];
  const { capture } = await f.captures.getForSourceHandoff(image.captureId!);
  const decision = {
    version: 1,
    pin: {
      accountId: context.accountId,
      batchId: request.batchId,
      inputId: image.id,
      ordinal: image.ordinal,
      captureId: capture.id,
      captureRevision: capture.revision,
      payloadId: capture.payloadId,
      sha256: capture.sha256,
      byteCount: capture.byteCount,
      mediaType: "image/jpeg",
    },
    relevance: { status: "UNCERTAIN", reason: "OCR_UNAVAILABLE" },
    choice: "UNDECIDED",
  };
  const repo = () => createCapturePhotoImportDecisionRepository(f.db, f.getAccount, deps);
  async function unchanged() {
    expect(snapshot()).toEqual(before.rows);
    expect(objects()).toEqual(before.objects);
    expect(markers()).toEqual(before.markers);
    expect(sourceHashes()).toEqual(before.sources);
    expect(f.sql.prepare("PRAGMA foreign_keys").get()!.foreign_keys).toBe(1);
    expect(f.sql.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    const reopened = await f.submissions.reopen(
      request.jobId,
      await captureAccountRequestContext("", f.getAccount),
    );
    for (const [index, input] of reopened.inputs.entries())
      expect((await f.captures.getForSourceHandoff(input.captureId!)).bytes).toEqual(
        originals[index],
      );
    expect(reopened.batch).toEqual(request);
  }
  return {
    f,
    database,
    request,
    context,
    decision,
    repo,
    unchanged,
    fault: (value: Fault) => {
      fault = value;
    },
    executions: () => candidateExecutions,
  };
}

it("real 74→candidate75 retains all prior migrations/data/queue/bytes and does not rerun on restart", async () => {
  await withBaseline(
    async ({ f, database, context, request, decision, repo, unchanged, executions }) => {
      await runMigrations(database);
      expect(await getSchemaVersion(database)).toBe(75);
      expect(executions()).toBe(1);
      await unchanged();
      expect(
        f.sql.prepare("SELECT name FROM schema_migrations WHERE id=75").get()!.name,
      ).toBe(definition.name);
      const saved = await repo().save(context, request.jobId, 0, decision);
      const markers = f.sql.prepare("SELECT * FROM schema_migrations ORDER BY id").all();
      f.reopen();
      await runMigrations(database);
      expect(executions()).toBe(1);
      expect(f.sql.prepare("SELECT * FROM schema_migrations ORDER BY id").all()).toEqual(
        markers,
      );
      await unchanged();
      expect(
        await repo().read(
          await captureAccountRequestContext("", f.getAccount),
          request.jobId,
          decision.pin.inputId,
        ),
      ).toEqual(saved);
    },
  );
});
it.each(["AFTER_DDL", "BEFORE_MARKER", "AFTER_MARKER"] as const)(
  "rolls back candidate75 atomically at %s and retains a recoverable74",
  async (point) => {
    await withBaseline(async ({ f, database, unchanged, fault, executions }) => {
      fault(point);
      await expect(runMigrations(database)).rejects.toThrow(point);
      expect(await getSchemaVersion(database)).toBe(74);
      expect(
        f.sql
          .prepare(
            "SELECT name FROM sqlite_master WHERE tbl_name='capture_photo_import_decisions'",
          )
          .all(),
      ).toEqual([]);
      expect(
        f.sql.prepare("SELECT id FROM schema_migrations WHERE id=75").get(),
      ).toBeUndefined();
      await unchanged();
      f.reopen();
      await runMigrations(database);
      expect(await getSchemaVersion(database)).toBe(75);
      expect(executions()).toBe(2);
      await unchanged();
    });
  },
);
