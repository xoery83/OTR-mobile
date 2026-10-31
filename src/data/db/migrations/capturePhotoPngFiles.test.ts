import { createHash } from "node:crypto";
import { expect, it, vi } from "vitest";
import { migrations } from "../migrations";
import { getSchemaVersion, runMigrations } from "../migrationRunner";
import {
  fixture,
  now,
  sha256,
} from "@/data/repositories/__fixtures__/captureBatchAssessment";
import { captureAccountRequestContext } from "@/data/auth/accountRequestContext";
import { createCapturePhotoImportDecisionRepository } from "@/data/repositories/capturePhotoImportDecisionRepository";
import { createUniversalPhotoRelevanceActions } from "@/data/operations/universalPhotoRelevanceActions";

it("upgrades75→76 transactionally, keeps old decisions and FILE provenance, and retains original-pin guards", async () => {
  const f = fixture(true, 75);
  f.sql.exec(
    "CREATE TABLE schema_migrations(id INTEGER PRIMARY KEY,name TEXT NOT NULL,applied_at TEXT NOT NULL)",
  );
  for (const m of migrations.filter((m) => m.id <= 75))
    f.sql.prepare("INSERT INTO schema_migrations VALUES(?,?,?)").run(m.id, m.name, now());
  expect(
    createHash("sha256")
      .update(migrations.find((m) => m.id === 75)!.sql)
      .digest("hex"),
  ).toBe("45a7e26d82aaddd99100bcff64bb2b8591ba1365351931bfdbf0f966b2a18b1f");
  const context = await captureAccountRequestContext("", f.getAccount);
  const deps = {
    getAccountId: f.getAccount,
    submissions: f.submissions,
    captures: f.captures,
  };
  const decisions = createCapturePhotoImportDecisionRepository(f.db, f.getAccount, {
    sha256,
    now,
    newId: crypto.randomUUID,
  });
  const bytes = Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10, 0);
  const actions = createUniversalPhotoRelevanceActions(context, {
    ...deps,
    decisions,
    hash: sha256,
    extract: vi.fn(async () => ({
      engine: "apple-vision" as const,
      text: "",
      originalSha256: await sha256(bytes),
      originalByteCount: bytes.length,
      observations: [],
    })),
  });
  const requests = [];
  for (const files of [false, true]) {
    const q = f.request();
    Object.assign(q.inputs[0], {
      kind: files ? "FILE" : "IMAGE",
      acquisitionSource: files ? "files" : "photos",
      declaredContentType: "image/png",
    });
    await f.submissions.submit(q, new Map([[q.inputs[0].id, async () => ({ bytes })]]));
    requests.push(q);
  }
  const [image, file] = requests;
  await actions.screen(image.jobId, image.inputs[0].id);
  const before = f.sql.prepare("SELECT * FROM capture_photo_import_decisions").all();
  await expect(actions.screen(file.jobId, file.inputs[0].id)).rejects.toThrow(
    "PHOTO_DECISION_ORIGINAL_CHANGED",
  );
  const database = {
    ...f.db,
    execAsync: async (sql: string) => {
      f.sql.exec(sql);
    },
  };
  await expect(
    runMigrations({
      ...database,
      execAsync: async (sql: string) => {
        f.sql.exec(sql);
        if (sql.includes("DROP TRIGGER capture_photo_decision_scope_insert"))
          throw Error("AFTER_DDL");
      },
    }),
  ).rejects.toThrow("AFTER_DDL");
  expect(await getSchemaVersion(database)).toBe(75);
  expect(f.sql.prepare("SELECT * FROM capture_photo_import_decisions").all()).toEqual(
    before,
  );
  await expect(actions.screen(file.jobId, file.inputs[0].id)).rejects.toThrow(
    "PHOTO_DECISION_ORIGINAL_CHANGED",
  );
  await runMigrations(database);
  expect(await getSchemaVersion(database)).toBe(76);
  expect(f.sql.prepare("SELECT * FROM capture_photo_import_decisions").all()).toEqual(
    before,
  );
  const screened = await actions.screen(file.jobId, file.inputs[0].id);
  await actions.choose(file.jobId, screened.revision, screened.decision, "SKIP");
  expect((await f.submissions.reopen(file.jobId, context)).inputs[0]).toMatchObject({
    kind: "FILE",
    acquisitionSource: "files",
  });
  const retained = f.sql
    .prepare("SELECT body_json FROM capture_photo_import_decisions WHERE input_id=?")
    .get(file.inputs[0].id);
  for (const pin of [
    { ...screened.decision.pin, captureRevision: 999 },
    { ...screened.decision.pin, mediaType: "text/plain" },
  ]) {
    expect(() =>
      f.sql
        .prepare(
          "UPDATE capture_photo_import_decisions SET body_json=?,decision_revision=decision_revision+1 WHERE input_id=?",
        )
        .run(JSON.stringify({ ...screened.decision, pin }), file.inputs[0].id),
    ).toThrow("PHOTO_DECISION_ORIGINAL_CHANGED");
    expect(
      f.sql
        .prepare("SELECT body_json FROM capture_photo_import_decisions WHERE input_id=?")
        .get(file.inputs[0].id),
    ).toEqual(retained);
  }
  expect(() =>
    f.sql
      .prepare("DELETE FROM capture_photo_import_decisions WHERE input_id=?")
      .run(file.inputs[0].id),
  ).toThrow("PHOTO_DECISION_RETAINED");
  f.reopen();
  expect((await actions.read(file.jobId, file.inputs[0].id))?.decision.choice).toBe(
    "SKIP",
  );
  await runMigrations(database);
  expect(await getSchemaVersion(database)).toBe(76);
});
