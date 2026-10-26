import { randomUUID, createHash } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { buildSync } from "esbuild";
import { expect, it } from "vitest";
import {
  fixture,
  sha256,
  now,
} from "../repositories/__fixtures__/captureBatchAssessment";
import { createCaptureSourceAdmissionRepository } from "../repositories/captureSourceAdmissionRepository";
import {
  readUniversalOriginalPins,
  prepareUniversalOriginalBatch,
  recoverUniversalOriginalPlans,
} from "./universalOriginalBatch";
import { UTF8_TEXT_FILE_PROFILE } from "@/domain/capture/utf8TextFile";
async function setup(approved = false) {
  const f = fixture(true, 73),
    q = f.request(3),
    trip = randomUUID();
  q.formatVersion = 2;
  q.manifestVersion = 2;
  q.context.tripPrior = { id: trip, origin: "PRIOR", observedAt: now() };
  q.inputs = q.inputs.map((i, n) => ({
    ...i,
    kind: n < 2 ? "FILE" : "TEXT",
    acquisitionSource: n < 2 ? "files" : "magic_input",
    originalFilename:
      n < 2
        ? approved
          ? ["universal-mixed-bookings-utf8.txt", "lodging-supplement.txt"][n]
          : `Original${n}.txt`
        : null,
    declaredContentType: n < 2 ? "text/plain" : null,
  }));
  const text = ["first original", "second original", "typed secret phrase"],
    bytes = approved
      ? [
          "universal-mixed-bookings-utf8.txt",
          "lodging-supplement.txt",
          "submitted-user-text.txt",
        ].map((name) =>
          readFileSync(
            join(
              process.cwd(),
              "docs/ops/universal-dev-execution-20261024/qa-originals",
              name,
            ),
          ),
        )
      : text.map((s) => new TextEncoder().encode(s));
  await f.submissions.submit(
    q,
    new Map(q.inputs.map((i, n) => [i.id, async () => ({ bytes: bytes[n] })])),
  );
  f.sql
    .prepare(
      "INSERT INTO ledger_actor_context(user_id,journey_id,role,capabilities_json,updated_at) VALUES(?,?,'owner','{}',?)",
    )
    .run(q.accountId, trip, now());
  const sources = createCaptureSourceAdmissionRepository(f.db, f.getAccount, {
    sha256,
    now,
    newId: randomUUID,
    handoff: f.captures.getForSourceHandoff,
    readSelectedMaterial: async () => null,
    utf8FileProfile: UTF8_TEXT_FILE_PROFILE,
  });
  const context = await sources.captureContext(trip),
    deps = {
      getAccountId: f.getAccount,
      hash: sha256,
      newId: randomUUID,
      captures: f.captures,
      submissions: f.submissions,
      sources,
    };
  const changes = () => f.sql.prepare("SELECT total_changes() AS n").get()!.n;
  return { f, q, trip, context, deps, changes };
}
it("reads actual 2FILE+typed C3 identities without generating missing Source operations or leaking text", async () => {
  const x = await setup(),
    before = x.changes();
  const result = await readUniversalOriginalPins(x.context, x.q.jobId, x.deps);
  expect(result.batchId).toBe(x.q.batchId);
  expect(result.inputs.map((i) => i.acquisitionSource)).toEqual([
    "files",
    "files",
    "magic_input",
  ]);
  expect(
    result.inputs.every(
      (i) =>
        i.sourceState === "SOURCE_OPERATION_NOT_PREPARED" && i.sourceCommandPin === null,
    ),
  ).toBe(true);
  expect(JSON.stringify(result)).not.toContain("typed secret phrase");
  expect(x.changes()).toBe(before);
  expect(
    x.f.sql
      .prepare(
        "SELECT count(*) AS n FROM sync_operations WHERE operation_type='C_ADMIT_CAPTURE_SOURCE'",
      )
      .get()!.n,
  ).toBe(0);
});
it("reads exactly existing Source pins after normal preparation and cold reopen without writes", async () => {
  const x = await setup(),
    plans = await recoverUniversalOriginalPlans(x.context, x.q.jobId, x.deps);
  const prepared = await prepareUniversalOriginalBatch(
    x.context,
    x.q.jobId,
    plans,
    x.deps,
  );
  const first = await readUniversalOriginalPins(x.context, x.q.jobId, x.deps);
  x.f.reopen();
  const before = x.changes();
  expect(await readUniversalOriginalPins(x.context, x.q.jobId, x.deps)).toEqual(first);
  expect(x.changes()).toBe(before);
  expect(first.inputs.map((i) => i.sourceCommandPin?.sourceId)).toEqual(
    prepared.inputs.map((i) => i.sourceId),
  );
  expect(first.inputs.map((i) => i.sourceCommandPin?.profile)).toEqual([
    UTF8_TEXT_FILE_PROFILE,
    UTF8_TEXT_FILE_PROFILE,
    "OTR_SUBMITTED_TEXT_V1",
  ]);
  expect(x.f.sql.prepare("SELECT count(*) AS n FROM trip_source_runs").get()!.n).toBe(0);
});
it("account and Trip mismatches are rejected without a mutation", async () => {
  const x = await setup(),
    before = x.changes();
  await expect(
    readUniversalOriginalPins({ ...x.context, tripId: randomUUID() }, x.q.jobId, x.deps),
  ).rejects.toThrow();
  await x.f.switchTo(randomUUID());
  await expect(readUniversalOriginalPins(x.context, x.q.jobId, x.deps)).rejects.toThrow();
  expect(x.changes()).toBe(before);
});

it("the actual bundled operator reads the same file in SQLite readOnly mode with no copied DB/session", async () => {
  const x = await setup(true),
    directory = mkdtempSync(join(tmpdir(), "otr-pin-reader-"));
  try {
    // Match the real App migration journal; PRAGMA user_version remains zero.
    x.f.sql.exec("CREATE TABLE schema_migrations (id INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL); INSERT INTO schema_migrations VALUES(73, 'capture_mixed_inputs_v2', '2026-10-24T00:00:00Z')");
    expect(x.f.sql.prepare("PRAGMA user_version").get()).toMatchObject({ user_version: 0 });
    const bundle = join(directory, "reader.mjs"),
      expectedPath = join(
        process.cwd(),
        "docs/ops/universal-native-capture-pins-20261024/EXPECTED_INPUTS.json",
      );
    buildSync({
      entryPoints: ["scripts/import/read-native-capture-pins.ts"],
      bundle: true,
      platform: "node",
      target: "node24",
      format: "esm",
      alias: { "@": join(process.cwd(), "src") },
      outfile: bundle,
      external: ["react-native", "expo-*"],
      banner: {
        js: 'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);',
      },
    });
    const local = await readUniversalOriginalPins(x.context, x.q.jobId, x.deps);
    const hash = () => createHash("sha256").update(readFileSync(x.f.path)).digest("hex"),
      before = hash();
    const output = execFileSync(
      process.execPath,
      [
        bundle,
        "--sqlite",
        x.f.path,
        "--account",
        x.q.accountId,
        "--trip",
        x.trip,
        "--job",
        x.q.jobId,
        "--expected-inputs",
        expectedPath,
      ],
      { encoding: "utf8" },
    );
    expect(JSON.parse(output)).toEqual(local);
    expect(output).not.toContain("typed secret phrase");
    expect(hash()).toBe(before);
    // Even a valid 2 FILE + 1 TEXT replacement whitelist cannot widen this QA CLI.
    const other = await setup();
    other.f.sql.exec("CREATE TABLE schema_migrations (id INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL); INSERT INTO schema_migrations VALUES(73, 'capture_mixed_inputs_v2', '2026-10-24T00:00:00Z')");
    const otherPins = await readUniversalOriginalPins(
      other.context,
      other.q.jobId,
      other.deps,
    );
    const substitute = join(directory, "substituted.json"),
      out = join(directory, "must-not-exist.json");
    writeFileSync(
      substitute,
      JSON.stringify(
        otherPins.inputs.map((i) => ({
          kind: i.kind,
          originalFilename: i.originalFilename,
          byteCount: i.byteCount,
          sha256: i.sha256,
        })),
        null,
        2,
      ) + "\n",
    );
    const otherHash = () =>
      createHash("sha256").update(readFileSync(other.f.path)).digest("hex");
    const otherBefore = otherHash();
    for (const selector of [["--job", other.q.jobId], ["--list"]]) {
      const rejected = spawnSync(
        process.execPath,
        [
          bundle,
          "--sqlite",
          other.f.path,
          "--account",
          other.q.accountId,
          "--trip",
          other.trip,
          ...selector,
          "--expected-inputs",
          substitute,
          "--out",
          out,
        ],
        { encoding: "utf8" },
      );
      expect(rejected.status).toBe(2);
      expect(rejected.stdout).toBe("");
      expect(rejected.stderr).toContain("READ_ONLY_CAPTURE_PINS_BLOCKED");
      expect(existsSync(out)).toBe(false);
      expect(otherHash()).toBe(otherBefore);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
