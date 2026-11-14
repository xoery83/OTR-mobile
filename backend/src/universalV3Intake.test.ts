import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, readdir, rm, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { expect, it } from "vitest";
import { createUniversalV3Intake, universalV3IntakeBoundary } from "./universalV3Intake";
import { initializeUniversalTaskDatabase } from "./universalTaskBootstrap";
import { createUniversalMaterialIntake } from "./universalMaterialIntake";

it("accepts files under one immutable scoped identity, survives reopen, and expires temporary files", async () => {
  const root = await mkdtemp(join(tmpdir(), "otr-v3-intake-"));
  const path = join(root, "task.sqlite");
  const spool = join(root, "spool");
  let sql = new DatabaseSync(path);
  try {
    const actor = randomUUID();
    const tripId = randomUUID();
    const analysis = randomUUID();
    const base = `http://localhost/v2/import-batches/${analysis}/interpretations/intake`;
    const url = `${base}?tripId=${tripId}`;
    const data = "two days in Osaka";
    const fileId = randomUUID();
    const manifest = {
      version: "otr.import.local-first/1",
      tripId,
      mode: "UNIVERSAL",
      files: [
        {
          fileId,
          documentId: randomUUID(),
          mediaType: "text/plain",
          length: Buffer.byteLength(data),
          sha256: createHash("sha256").update(data).digest("hex"),
        },
      ],
    };
    let db = initializeUniversalTaskDatabase(sql);
    let intake = createUniversalV3Intake(db, spool);
    const call = (request: Request, who = actor) =>
      universalV3IntakeBoundary(request, who, async () => true, intake);
    const start = (value: unknown) =>
      new Request(url, {
        method: "POST",
        headers: { "Idempotency-Key": analysis },
        body: JSON.stringify(value),
      });
    const upload = (body: string) =>
      new Request(`${base}/files/${fileId}?tripId=${tripId}`, {
        method: "PUT",
        body,
        headers: {
          "content-type": "application/octet-stream",
          "content-length": String(manifest.files[0].length),
        },
      });
    expect((await call(start(manifest))).status).toBe(202);
    expect((await call(start(manifest))).status).toBe(202);
    expect(
      (await call(start({ ...manifest, mode: "TYPE_SCOPED", family: "P1" }))).status,
    ).toBe(409);
    expect(
      await createUniversalMaterialIntake(db).read(actor, tripId, analysis),
    ).toBeNull();
    expect((await call(new Request(url), randomUUID())).status).toBe(404);
    expect((await call(upload("a".repeat(data.length)))).status).toBe(422);
    expect(await readdir(spool)).toEqual([]);
    expect((await call(upload(data))).status).toBe(204);
    expect((await call(upload(data))).status).toBe(204);
    const files = await readdir(spool);
    expect(files).toHaveLength(1);
    sql.close();
    sql = new DatabaseSync(path);
    db = initializeUniversalTaskDatabase(sql);
    intake = createUniversalV3Intake(db, spool);
    expect(await (await call(new Request(url))).json()).toEqual({
      analysisId: analysis,
      missingFiles: [],
    });
    const expired = new Date(Date.now() - 61 * 60_000);
    await utimes(join(spool, files[0]), expired, expired);
    expect(await (await call(new Request(url))).json()).toEqual({
      analysisId: analysis,
      missingFiles: [fileId],
    });
    await intake.cleanup();
    expect(await readdir(spool)).toEqual([]);
    expect((await call(upload(data))).status).toBe(204);
  } finally {
    sql.close();
    await rm(root, { recursive: true, force: true });
  }
});
