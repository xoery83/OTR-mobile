import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { migrations } from "../migrations";
import {
  runMigrations,
  getSchemaVersion,
  type MigrationDatabase,
} from "../migrationRunner";
import { captureFilePngPhotoDecisionsDefinition as definition } from "./captureFilePngPhotoDecisions";
import { capturePhotoImportDecisionsDefinition as originalDefinition } from "./capturePhotoImportDecisions";
import { fixture, now } from "@/data/repositories/__fixtures__/captureBatchAssessment";

it.each([null, "AFTER_DDL", "AFTER_MARKER"])(
  "upgrades retained v75 photo decisions atomically, preserves originals and cold reopens: %s",
  async (faultPoint) => {
    const registry = [...migrations];
    try {
      migrations.splice(0, migrations.length, ...registry.filter((m) => m.id <= 75));
      const f = fixture(true, 0);
      let fault = false;
      const db: MigrationDatabase = {
        ...f.db,
        async execAsync(sql) {
          f.sql.exec(sql);
          if (fault && faultPoint === "AFTER_DDL" && sql === definition.sql)
            throw Error(faultPoint);
        },
        async runAsync(sql, ...args) {
          const value = await f.db.runAsync(sql, ...(args as never[]));
          if (
            fault &&
            faultPoint === "AFTER_MARKER" &&
            sql.startsWith("INSERT INTO schema_migrations") &&
            args[0] === 76
          )
            throw Error(faultPoint);
          return value;
        },
      };
      await runMigrations(db);
      expect(await getSchemaVersion(db)).toBe(75);
      const request = f.request(2);
      Object.assign(request.inputs[0], {
        kind: "IMAGE",
        acquisitionSource: "photos",
        declaredContentType: "image/jpeg",
      });
      Object.assign(request.inputs[1], {
        kind: "FILE",
        acquisitionSource: "files",
        declaredContentType: "image/png",
        originalFilename: "retained.png",
      });
      const bytes = [
        Uint8Array.of(255, 216, 255, 1),
        Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10, 0),
      ];
      const job = await f.submissions.submit(
        request,
        new Map(
          request.inputs.map((input, i) => [input.id, async () => ({ bytes: bytes[i] })]),
        ),
      );
      const bodies = await Promise.all(
        job.inputs.map(async (input) => {
          const { capture } = await f.captures.getForSourceHandoff(input.captureId!);
          return JSON.stringify({
            version: 1,
            pin: {
              accountId: request.accountId,
              batchId: job.batch.batchId,
              inputId: input.id,
              ordinal: input.ordinal,
              captureId: capture.id,
              captureRevision: capture.revision,
              payloadId: capture.payloadId,
              sha256: capture.sha256,
              byteCount: capture.byteCount,
              mediaType: capture.declaredContentType,
            },
            relevance: { status: "UNCERTAIN", reason: "OCR_UNAVAILABLE" },
            choice: "UNDECIDED",
          });
        }),
      );
      const insert = (index: number) =>
        f.sql
          .prepare(
            "INSERT INTO capture_photo_import_decisions(account_id,input_id,decision_revision,body_json,recorded_at) VALUES(?,?,1,?,?)",
          )
          .run(request.accountId, job.inputs[index].id, bodies[index], now());
      insert(0);
      expect(() => insert(1)).toThrow("PHOTO_DECISION_ORIGINAL_CHANGED");
      const rows = () =>
        Object.fromEntries(
          [
            "local_capture_inbox",
            "local_capture_payloads",
            "capture_submission_batches",
            "capture_submission_inputs",
            "capture_photo_import_decisions",
            "sync_operations",
          ].map((table) => [table, f.sql.prepare(`SELECT * FROM ${table}`).all()]),
        );
      const before = rows();
      const triggers = () =>
        f.sql
          .prepare(
            "SELECT name,sql FROM sqlite_master WHERE type='trigger' AND tbl_name='capture_photo_import_decisions' ORDER BY name",
          )
          .all();
      const oldTriggers = triggers();
      migrations.push({ id: 76, ...definition });
      if (faultPoint) {
        fault = true;
        await expect(runMigrations(db)).rejects.toThrow(faultPoint);
        expect(await getSchemaVersion(db)).toBe(75);
        expect(triggers()).toEqual(oldTriggers);
        expect(rows()).toEqual(before);
        fault = false;
      }
      await runMigrations(db);
      expect(await getSchemaVersion(db)).toBe(76);
      expect(rows()).toEqual(before);
      insert(1);
      const after = rows();
      f.reopen();
      expect(rows()).toEqual(after);
      expect(await getSchemaVersion(db)).toBe(76);
      await runMigrations(db);
      expect(rows()).toEqual(after);
      expect(createHash("sha256").update(originalDefinition.sql).digest("hex")).toBe(
        "45a7e26d82aaddd99100bcff64bb2b8591ba1365351931bfdbf0f966b2a18b1f",
      );
    } finally {
      migrations.splice(0, migrations.length, ...registry);
    }
  },
);
