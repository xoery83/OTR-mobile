import { createHash, randomUUID } from "node:crypto";
import { constants, type Stats } from "node:fs";
import { link, lstat, mkdir, open, readdir, unlink } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { z } from "zod";
import { canonicalEventJson, type Json } from "../../src/domain/trip/eventIntentJson";
import {
  universalV3Manifest,
  type UniversalV3Manifest,
} from "../../src/data/api/universalV3Contracts";
import type { UniversalV3Execution } from "./universalV3Execution";
import type { Task } from "../../src/domain/intelligence/persistence";
import type { universalTaskDatabase } from "./universalTaskBootstrap";
import { universalBatchIdentity } from "./universalBatchSource";

export const universalV3IntakePath =
  /^\/v2\/import-batches\/([^/]+)\/interpretations\/intake(?:\/files\/([^/]+)|(\/capability))?$/;
type File = UniversalV3Manifest["files"][number];
type Scope = { accountId: string; tripId: string; analysisId: string };
type Db = ReturnType<typeof universalTaskDatabase>;
type Row = {
  trip_id: string;
  manifest_sha256: string;
  v3_manifest_json: string | null;
  v3_accepted_at: string | null;
};
const remove = (path: string) =>
  unlink(path).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") throw error;
  });
const maxManifestBytes = 65536;
const blobLifetimeMs = 60 * 60_000;
const intakeLifetimeMs = 2 * 60 * 60_000;
const partialLifetimeMs = 15 * 60_000;
const spoolLimit = 512 * 1024 * 1024;
const digest = (bytes: string | Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
const uuid = z.uuid();

export function universalV3TaskId({ accountId, tripId, analysisId }: Scope) {
  return universalBatchIdentity(accountId, tripId, analysisId, "local-first/task");
}

export function universalV3IntakePins(input: UniversalV3Manifest) {
  return input.files.map((file) => ({
    kind: "IMPORT_INTAKE" as const,
    file_id: file.fileId,
    document_id: file.documentId,
    payload_sha256: file.sha256,
    byte_count: file.length,
  }));
}

export function createUniversalV3Intake(db: Db, root: string) {
  if (!isAbsolute(root)) throw Error("UNIVERSAL_V3_PRIVATE_DIRECTORY");
  async function directory() {
    await mkdir(root, { mode: 0o700, recursive: true });
    const stat = await lstat(root);
    if (
      !stat.isDirectory() ||
      (stat.mode & 0o777) !== 0o700 ||
      stat.uid !== process.getuid?.()
    )
      throw Error("UNIVERSAL_V3_PRIVATE_DIRECTORY");
  }
  const active = new Map<
    string,
    { accountId: string; temporary: string; length: number }
  >();
  let scanning: Promise<number> | undefined;
  async function sweep() {
    await directory();
    const now = Date.now();
    let bytes = 0;
    for (const name of await readdir(root)) {
      const partial = name.startsWith(".partial-");
      if (!(partial ? /^\.partial-[a-f0-9-]{36}$/ : /^[a-f0-9]{64}$/).test(name))
        continue;
      const entry = join(root, name);
      if ([...active.values()].some((upload) => upload.temporary === entry)) continue;
      try {
        const stat = await lstat(entry);
        if (!stat.isFile() || stat.uid !== process.getuid?.()) continue;
        if (now - stat.mtimeMs >= (partial ? partialLifetimeMs : blobLifetimeMs))
          await remove(entry);
        else bytes += stat.size;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
    return bytes;
  }
  function cleanup() {
    scanning ??= sweep().finally(() => {
      scanning = undefined;
    });
    return scanning;
  }
  const row = ({ accountId, analysisId }: Scope) =>
    db.getFirstAsync<Row>(
      "SELECT trip_id,manifest_sha256,v3_manifest_json,v3_accepted_at FROM universal_material_intake WHERE account_id=? AND batch_id=?",
      accountId,
      analysisId,
    );
  async function retained(scope: Scope) {
    const found = await row(scope);
    if (
      !found ||
      found.trip_id !== scope.tripId ||
      !found.v3_manifest_json ||
      !found.v3_accepted_at
    )
      return null;
    const acceptedAt = z.iso.datetime().parse(found.v3_accepted_at);
    if (digest(found.v3_manifest_json) !== found.manifest_sha256)
      throw Error("UNIVERSAL_V3_MANIFEST_INTEGRITY");
    return {
      input: universalV3Manifest.parse(JSON.parse(found.v3_manifest_json)),
      acceptedAt,
      manifestSha256: found.manifest_sha256,
    };
  }
  const path = (scope: Scope, file: File) =>
    join(
      root,
      digest(
        [scope.accountId, scope.tripId, scope.analysisId, file.fileId, file.sha256].join(
          "/",
        ),
      ),
    );
  function valid(stat: Stats, file: File) {
    return (
      stat.isFile() &&
      (stat.mode & 0o777) === 0o400 &&
      stat.uid === process.getuid?.() &&
      stat.size === file.length
    );
  }
  async function readFile(scope: Scope, file: File) {
    await directory();
    const handle = await open(
      path(scope, file),
      constants.O_RDONLY | constants.O_NOFOLLOW,
    );
    try {
      const stat = await handle.stat();
      if (!valid(stat, file) || Date.now() - stat.mtimeMs >= blobLifetimeMs)
        throw Error("UNIVERSAL_V3_FILE_MISMATCH");
      const bytes = await handle.readFile();
      if (bytes.length !== file.length || digest(bytes) !== file.sha256)
        throw Error("UNIVERSAL_V3_FILE_MISMATCH");
      return bytes;
    } finally {
      await handle.close();
    }
  }
  async function hasFile(scope: Scope, file: File) {
    try {
      const stat = await lstat(path(scope, file));
      if (!valid(stat, file)) throw Error("UNIVERSAL_V3_FILE_MISMATCH");
      return Date.now() - stat.mtimeMs < blobLifetimeMs;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
      throw error;
    }
  }
  async function hasAcceptedAttempt(scope: Scope) {
    return Boolean(
      await db.getFirstAsync<{ accepted: number }>(
        `SELECT 1 AS accepted FROM intelligence_continuations
       WHERE account_id=? AND task_id=? AND trip_id=? AND import_id=?
         AND (current_attempt_id IS NOT NULL OR work_disposition IN ('PUBLISHED','UNKNOWN'))`,
        scope.accountId,
        universalV3TaskId(scope),
        scope.tripId,
        scope.analysisId,
      ),
    );
  }
  async function status(scope: Scope, input: UniversalV3Manifest) {
    // After admission, deleting temporary bytes cannot reopen this analysis for upload.
    if (await hasAcceptedAttempt(scope))
      return { analysisId: scope.analysisId, missingFiles: [] };
    const present = await Promise.all(input.files.map((file) => hasFile(scope, file)));
    return {
      analysisId: scope.analysisId,
      missingFiles: input.files
        .filter((_, index) => !present[index])
        .map(({ fileId }) => fileId),
    };
  }
  return {
    cleanup,
    async discardFiles(scope: Scope) {
      const item = await retained(scope);
      if (!item) return;
      await Promise.all(item.input.files.map((file) => remove(path(scope, file))));
    },
    async load(scope: Scope) {
      const item = await retained(scope);
      return (
        item &&
        Date.now() - Date.parse(item.acceptedAt) < intakeLifetimeMs && {
          manifest: item.input,
          acceptedAt: item.acceptedAt,
          manifestSha256: item.manifestSha256,
          readFile: (file: File) => readFile(scope, file),
        }
      );
    },
    async validateImportIntakePins(task: Task) {
      if (!task.trip_id) throw Error("UNIVERSAL_V3_TASK_SCOPE");
      const item = await retained({
        accountId: task.account_id,
        tripId: task.trip_id,
        analysisId: task.import_id,
      });
      if (
        !item ||
        task.manifest_sha256 !== item.manifestSha256 ||
        canonicalEventJson(task.input_pins as Json) !==
          canonicalEventJson(universalV3IntakePins(item.input))
      )
        throw Error("UNIVERSAL_V3_TASK_SCOPE");
    },
    async start(scope: Scope, input: UniversalV3Manifest) {
      const encoded = canonicalEventJson(input as Json);
      const sha = digest(encoded);
      let matches = false;
      await db.withImmediateTransactionAsync(async () => {
        await db.runAsync(
          `INSERT INTO universal_material_intake
             (account_id,trip_id,batch_id,manifest_sha256,state,input_id,owner_run,v3_manifest_json,v3_accepted_at)
           VALUES(?,?,?,?,'PREPARING',NULL,?,?,?) ON CONFLICT DO NOTHING`,
          scope.accountId,
          scope.tripId,
          scope.analysisId,
          sha,
          randomUUID(),
          encoded,
          new Date().toISOString(),
        );
        const current = await row(scope);
        matches =
          current?.trip_id === scope.tripId &&
          current.manifest_sha256 === sha &&
          current.v3_manifest_json === encoded;
      });
      if (!matches) return null;
      return status(scope, input);
    },
    async read(scope: Scope) {
      const item = await retained(scope);
      return item && status(scope, item.input);
    },
    async receive(scope: Scope, fileId: string, request: Request) {
      const item = await retained(scope);
      if (item && Date.now() - Date.parse(item.acceptedAt) >= intakeLifetimeMs)
        return 410;
      const file = item?.input.files.find((entry) => entry.fileId === fileId);
      if (!file) return 404;
      const body = request.body;
      if (
        !body ||
        request.headers.get("content-length") !== String(file.length) ||
        request.headers.get("content-type") !== "application/octet-stream"
      )
        return 400;
      if (await hasAcceptedAttempt(scope)) {
        await body.cancel().catch(() => {});
        return 204;
      }
      const target = path(scope, file);
      const uploads = [...active.values()];
      if (
        active.has(target) ||
        uploads.length >= 8 ||
        uploads.filter((item) => item.accountId === scope.accountId).length >= 2
      ) {
        await body.cancel().catch(() => {});
        return 429;
      }
      const temporary = join(root, ".partial-" + randomUUID());
      active.set(target, { accountId: scope.accountId, temporary, length: file.length });
      try {
        const stored = await cleanup();
        if (await hasFile(scope, file)) return 204;
        if (
          stored + [...active.values()].reduce((total, item) => total + item.length, 0) >
          spoolLimit
        )
          return 429;
        const handle = await open(temporary, "wx", 0o600);
        const reader = body.getReader();
        const hash = createHash("sha256");
        try {
          let size = 0;
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            size += value.byteLength;
            if (size > file.length) return 413;
            hash.update(value);
            await handle.writeFile(value);
          }
          if (size !== file.length || hash.digest("hex") !== file.sha256) return 422;
          if (await hasAcceptedAttempt(scope)) return 204;
          await handle.chmod(0o400);
          await handle.sync();
          await link(temporary, target).catch((error: NodeJS.ErrnoException) => {
            if (error.code !== "EEXIST") throw error;
          });
          const folder = await open(root, constants.O_RDONLY | constants.O_NOFOLLOW);
          try {
            await folder.sync();
          } finally {
            await folder.close();
          }
          await readFile(scope, file);
          return 204;
        } finally {
          await reader.cancel().catch(() => {});
          reader.releaseLock();
          await handle.close();
        }
      } finally {
        await body.cancel().catch(() => {});
        try {
          await remove(temporary);
        } finally {
          active.delete(target);
        }
      }
    },
  };
}

export type UniversalV3Intake = ReturnType<typeof createUniversalV3Intake>;

export async function universalV3IntakeBoundary(
  request: Request,
  actor: string,
  canReadTrip: (account: string, trip: string) => Promise<boolean>,
  intake?: UniversalV3Intake,
  execution?: UniversalV3Execution,
  canWriteTrip?: typeof canReadTrip,
) {
  const headers = { "Cache-Control": "private, no-store", Vary: "Authorization" };
  const reply = (status: number) =>
    status === 204
      ? new Response(null, { status, headers })
      : Response.json(
          { error: { code: "UNIVERSAL_V3_INTAKE_UNAVAILABLE" } },
          { status, headers },
        );

  const url = new URL(request.url);
  const ids = universalV3IntakePath.exec(url.pathname);
  const analysisId = uuid.safeParse(ids?.[1]);
  const tripId = uuid.safeParse(url.searchParams.get("tripId"));
  if (!analysisId.success || !tripId.success) return reply(400);
  if (!intake && !ids?.[3]) return reply(503);
  const writes = request.method === "POST" || request.method === "PUT";
  if (writes && canWriteTrip) {
    if (!(await canWriteTrip(actor, tripId.data))) return reply(403);
  } else if (!(await canReadTrip(actor, tripId.data))) return reply(404);
  const scope = { accountId: actor, tripId: tripId.data, analysisId: analysisId.data };
  const advance = () =>
    (execution?.ordinary
      ? execution.start(scope, request)
      : execution?.available(scope, request).then(async (allowed) => {
          if (allowed) await execution.start(scope, request);
        })
    )?.catch(() => {
      console.info(
        JSON.stringify({
          event: "universal_v3_start_unavailable",
          analysisId: scope.analysisId,
        }),
      );
    });
  if (request.method === "GET" && ids?.[3]) {
    const existing = await execution?.read(scope, request);
    const available =
      existing || (await execution?.available(scope, request).catch(() => false));
    return Response.json(
      { localFirst: Boolean(available), existing: existing ?? null },
      { headers },
    );
  }
  if (!intake || ids?.[3]) return reply(405);
  if (ids?.[2]) {
    const fileId = uuid.safeParse(ids[2]);
    if (request.method !== "PUT") return reply(405);
    if (!fileId.success) return reply(400);
    const code = await intake.receive(scope, fileId.data, request);
    if (code === 204) await advance();
    return reply(code);
  }
  if (request.method === "GET") {
    const readsExecution = url.searchParams.get("execution") === "1";
    const found = readsExecution
      ? await execution?.read(scope, request)
      : await intake.read(scope);
    if (found) return Response.json(found, { headers });
    // The installed client cannot distinguish the empty execution 404 from an API failure.
    if (readsExecution && execution?.ordinary &&
        canWriteTrip && await canWriteTrip(actor, tripId.data))
      return Response.json({ state: "NEEDS_ACTION" }, { headers });
    return reply(404);
  }
  if (request.method !== "POST") return reply(405);
  if (request.headers.get("Idempotency-Key") !== scope.analysisId) return reply(400);
  if (!request.body) return reply(400);
  const reader = request.body.getReader();
  const chunks: Buffer[] = [];
  let bytes = 0;
  let json: unknown;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.length;
      if (bytes > maxManifestBytes) return reply(413);
      chunks.push(Buffer.from(value));
    }
    json = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return reply(400);
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  const parsed = universalV3Manifest.safeParse(json);
  if (!parsed.success || parsed.data.tripId !== scope.tripId) return reply(400);
  const accepted = await intake.start(scope, parsed.data);
  if (accepted && !accepted.missingFiles.length) await advance();
  return accepted ? Response.json(accepted, { status: 202, headers }) : reply(409);
}
