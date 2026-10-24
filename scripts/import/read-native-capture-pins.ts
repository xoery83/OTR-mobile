// Operator-local read-only App SQLite projection. No migration, session/keychain,
// network, source preparation, ID generation or queue dispatch.
import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, writeFileSync } from "node:fs";
import { isAbsolute } from "node:path";
import { parseArgs } from "node:util";
import { z } from "zod";
import { captureAccountRequestContext } from "../../src/data/auth/accountRequestContext";
import { createCaptureSubmissionRepository } from "../../src/data/repositories/captureSubmissionRepository";
import { createLocalCaptureInboxRepository } from "../../src/data/repositories/localCaptureInboxRepository";
import { createCaptureSourceAdmissionRepository } from "../../src/data/repositories/captureSourceAdmissionRepository";
import { readUniversalOriginalPins } from "../../src/data/operations/universalOriginalBatch";

const { values } = parseArgs({
  options: {
    sqlite: { type: "string" },
    account: { type: "string" },
    trip: { type: "string" },
    job: { type: "string" },
    list: { type: "boolean" },
    "expected-inputs": { type: "string" },
    out: { type: "string" },
  },
});
let sql: DatabaseSync | undefined;
try {
  if (
    !values.sqlite ||
    !isAbsolute(values.sqlite) ||
    !values["expected-inputs"] ||
    !!values.job === !!values.list
  )
    throw Error("EXACT_READ_ARGUMENTS_REQUIRED");
  const actor = z.uuid().parse(values.account),
    trip = z.uuid().parse(values.trip);
  const stat = lstatSync(values.sqlite);
  if (!stat.isFile() || stat.isSymbolicLink()) throw Error("REGULAR_SQLITE_REQUIRED");
  // This operator is restricted to the reviewed QA originals, not an arbitrary
  // caller-supplied whitelist. Keep the repository projection itself reusable.
  const expectedBytes = readFileSync(values["expected-inputs"]);
  if (
    createHash("sha256").update(expectedBytes).digest("hex") !==
    "318dac3f8ed0a2153f097fdc80411d34bae25adb8f1ecadb6c91ec4bed92cdc6"
  )
    throw Error("APPROVED_QA_WHITELIST_REQUIRED");
  const expected = z
    .array(
      z.strictObject({
        kind: z.enum(["FILE", "TEXT"]),
        originalFilename: z.string().nullable(),
        byteCount: z.number().int().positive(),
        sha256: z.string().regex(/^[a-f0-9]{64}$/),
      }),
    )
    .length(3)
    .parse(JSON.parse(expectedBytes.toString("utf8")));
  if (
    expected.filter((i) => i.kind === "FILE").length !== 2 ||
    expected.filter((i) => i.kind === "TEXT").length !== 1
  )
    throw Error("EXACT_TWO_FILES_AND_TEXT_REQUIRED");
  sql = new DatabaseSync(values.sqlite, { readOnly: true });
  sql.exec("PRAGMA query_only=ON");
  if (
    Number(
      (sql.prepare("PRAGMA user_version").get() as { user_version: number }).user_version,
    ) < 73
  )
    throw Error("SQLITE73_REQUIRED");
  let inTransaction = false;
  const database = {
    async getFirstAsync<T>(q: string, ...p: unknown[]) {
      return (sql!.prepare(q).get(...(p as never[])) ?? null) as T | null;
    },
    async getAllAsync<T>(q: string, ...p: unknown[]) {
      return sql!.prepare(q).all(...(p as never[])) as T[];
    },
    async runAsync() {
      throw Error("READ_ONLY_TOOL");
    },
    async isInTransactionAsync() {
      return inTransaction;
    },
    async withTransactionAsync(work: () => Promise<void>) {
      sql!.exec("BEGIN");
      inTransaction = true;
      try {
        await work();
        sql!.exec("COMMIT");
      } catch (e) {
        sql!.exec("ROLLBACK");
        throw e;
      } finally {
        inTransaction = false;
      }
    },
  };
  const getAccountId = async () => actor;
  const storage = {
    sha256: async (b: Uint8Array) => createHash("sha256").update(b).digest("hex"),
    now: () => new Date().toISOString(),
    newId: () => {
      throw Error("READ_ONLY_TOOL");
    },
  };
  const captures = createLocalCaptureInboxRepository(database, getAccountId, storage);
  const submissions = createCaptureSubmissionRepository(database, getAccountId, storage);
  const sources = createCaptureSourceAdmissionRepository(database, getAccountId, {
    ...storage,
    handoff: captures.getForSourceHandoff,
    readSelectedMaterial: async () => null,
  });
  const context = await captureAccountRequestContext(trip, getAccountId);
  const key = (a: unknown[]) => JSON.stringify(a.map((v) => JSON.stringify(v)).sort());
  const wanted = key(expected);
  const matches = (model: Awaited<ReturnType<typeof submissions.reopen>>) =>
    model.batch.context.tripPrior?.id === trip &&
    model.allInputsAccepted &&
    key(
      model.inputs.map((i) => ({
        kind: i.kind,
        originalFilename: i.originalFilename,
        byteCount: i.contentByteCount,
        sha256: i.contentSha256,
      })),
    ) === wanted;
  const result = values.list
    ? {
        qualification: "MATCHED_LOCAL_QA_JOBS_ONLY_NOT_AUTH_OR_SOURCE_PROOF",
        jobs: (await submissions.list({ limit: 100 }, context))
          .filter(matches)
          .map((m) => ({
            batchId: m.batch.batchId,
            jobId: m.batch.jobId,
            createdAt: m.batch.createdAt,
          })),
      }
    : await (async () => {
        const model = await submissions.reopen(z.uuid().parse(values.job), context);
        if (!matches(model)) throw Error("QA_ORIGINALS_NOT_MATCHED");
        return readUniversalOriginalPins(context, model.batch.jobId, {
          getAccountId,
          hash: storage.sha256,
          captures,
          submissions,
          sources,
        });
      })();
  const text = JSON.stringify(result, null, 2) + "\n";
  if (values.out) writeFileSync(values.out, text, { flag: "wx", mode: 0o600 });
  else console.log(text);
} catch {
  console.error("READ_ONLY_CAPTURE_PINS_BLOCKED_CHECK_LOCAL_SCOPE_AND_QA_ORIGINALS");
  process.exitCode = 2;
} finally {
  sql?.close();
}
