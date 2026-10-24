import { constants } from "node:fs";
import { open, lstat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { universalFiniteConfigSchema } from "./universalFiniteConfig";
import { createFlightPrivateCustody } from "./flightPrivateCustody";
import { createPublicationCatalogPgConnection } from "./tripPublicationCatalogPgConnection";
import { createModelTaskPgConnection } from "./tripCoreV2PgConnection";
import { createSupabaseDevGateway } from "./supabaseGateway";
import { readUniversalCatalog } from "./universalCatalog";
import { universalImportSnapshotSchema } from "../../src/data/api/tripImportCatalogContracts";
import { createTripImportAdmissionRepository } from "../../src/data/repositories/tripImportAdmissionRepository";
import { createIntelligenceContinuationRepository } from "../../src/data/repositories/intelligenceContinuationRepository";
import { captureAccountRequestContext } from "../../src/data/auth/accountRequestContext";
import { universalTaskDatabase } from "./universalTaskBootstrap";
import { createUniversalTaskReceiptChecks } from "./universalTaskReceipt";
import {
  recoverSettledUniversalTask,
  createSettledUniversalReadPort,
} from "./universalSettledRecovery";
import type { Task } from "../../src/domain/intelligence/persistence";
import {
  prepareUniversalDispatch,
  UNIVERSAL_IMPORT_VERSION,
  type UniversalManifest,
} from "./universalImport";
import type { UniversalPriceSchedule } from "./universalDeepSeekProvider";
import { createRequestBoundary } from "../../src/data/api/requestBoundary";

const digest = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
// Current generic owning catalog, never an Operator-created Source proof. This
// bounded recovery supports retained text only; binary recovery is not implied.
export function retainedRecoveryManifest(
  task: Readonly<Task>,
  raw: string,
): UniversalManifest {
  const catalog = universalImportSnapshotSchema.parse(JSON.parse(raw));
  if (
    catalog.actor_account_id !== task.account_id ||
    catalog.trip_id !== task.trip_id
  )
    throw Error("UNIVERSAL_RECOVERY_CATALOG_SCOPE");
  const rows = catalog as unknown as Record<string, Record<string, unknown>[]>;
  const run = rows.trip_source_runs.find(
    (r) =>
      r.id === task.run_id &&
      r.actor_account_id === task.account_id &&
      r.trip_id === task.trip_id &&
      r.generation === task.expected_run_generation &&
      r.retention_state === "RETAINED" &&
      r.superseded_by === null,
  );
  if (!run) throw Error("UNIVERSAL_RECOVERY_RUN_UNAVAILABLE");
  const representations = task.input_pins.map((pin) => {
    if (pin.kind !== "SOURCE" || !pin.input_id)
      throw Error("UNIVERSAL_RECOVERY_SOURCE_REQUIRED");
    const source = rows.trip_sources.find(
      (s) =>
        s.id === pin.source_id &&
        s.acquired_by === task.account_id &&
        s.trip_id === task.trip_id &&
        s.lifecycle === "ACTIVE" &&
        s.retention_state === "RETAINED" &&
        s.current_material_revision === pin.material_revision,
    );
    const input = rows.trip_source_inputs.find(
      (i) =>
        i.id === pin.input_id &&
        i.run_id === task.run_id &&
        i.source_id === pin.source_id &&
        i.representation_id === pin.representation_id &&
        i.payload_sha256 === pin.payload_sha256 &&
        i.byte_count === pin.byte_count &&
        i.material_revision === pin.material_revision,
    );
    const rep = rows.trip_source_representations.find(
      (r) =>
        r.id === pin.representation_id &&
        r.source_id === pin.source_id &&
        r.retention_state === "RETAINED" &&
        r.payload_sha256 === pin.payload_sha256 &&
        r.byte_count === pin.byte_count &&
        r.material_kind === "TEXT" &&
        typeof r.text_content === "string" &&
        ["text/plain", "text/html"].includes(r.mime_type as string),
    );
    if (
      !source ||
      !input ||
      !rep ||
      source.row_revision !== input.observed_source_row_revision ||
      input.historical_selection !== false
    )
      throw Error("UNIVERSAL_RECOVERY_CURRENT_SOURCE_UNAVAILABLE");
    const bytes = Buffer.from(rep.text_content as string, "utf8");
    if (bytes.length !== pin.byte_count || digest(bytes) !== pin.payload_sha256)
      throw Error("UNIVERSAL_RECOVERY_SOURCE_BYTES");
    return {
      accountId: task.account_id,
      tripId: task.trip_id!,
      batchId: task.import_id!,
      inputId: pin.input_id,
      sourceId: pin.source_id,
      representationId: pin.representation_id,
      revision: pin.material_revision,
      originalSha256: pin.payload_sha256,
      mime: rep.mime_type as string,
      bytes,
    };
  });
  return {
    accountId: task.account_id,
    tripId: task.trip_id!,
    batchId: task.import_id!,
    representations,
  };
}

// Explicit Operator invocation only. Original config/task deadline is never renewed.
// The independent recovery window authorizes only existing local publication and reads.
export async function loadSettledUniversalReadRuntime(
  args: {
    configPath: string;
    configSHA256: string;
    startsAt: string;
    expiresAt: string;
    priceSchedule: UniversalPriceSchedule;
  },
  environment: Record<string, string | undefined>,
) {
  const start = Date.parse(args.startsAt),
    end = Date.parse(args.expiresAt);
  const current = () => {
    if (
      !Number.isFinite(start) ||
      !Number.isFinite(end) ||
      end <= start ||
      end - start > 600000 ||
      Date.now() < start ||
      Date.now() >= end
    )
      throw Error("UNIVERSAL_RECOVERY_WINDOW_CLOSED");
  };
  current();
  if (
    args.configPath !== "/run/otr/universal-recovery.json" ||
    environment.OTR_DEV_BACKEND_NETWORK_MODE !== "host" ||
    environment.OTR_DEV_SUPABASE_URL !==
      "https://tuqigdxrvrerfewsxqgm.supabase.co" ||
    environment.OTR_DEV_UNIVERSAL_REMOTE_TRANSPORT === "enabled"
  )
    throw Error("UNIVERSAL_RECOVERY_CLOSED");
  const f = await open(
    args.configPath,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  let config;
  try {
    const st = await f.stat();
    if (
      !st.isFile() ||
      st.uid !== 0 ||
      st.gid !== 999 ||
      (st.mode & 0o777) !== 0o440 ||
      st.nlink !== 1 ||
      st.size > 131072
    )
      throw Error("UNIVERSAL_RECOVERY_CONFIG");
    const body = await f.readFile();
    if (body.byteLength > 131072 || digest(body) !== args.configSHA256)
      throw Error("UNIVERSAL_RECOVERY_CONFIG_HASH");
    config = universalFiniteConfigSchema.parse(
      JSON.parse(body.toString("utf8")),
    );
  } finally {
    await f.close();
  }
  if (
    config.actorId !== config.task.account_id ||
    config.task.task_id !== config.attempt.task_id ||
    config.task.account_id !== config.attempt.account_id ||
    !config.task.trip_id
  )
    throw Error("UNIVERSAL_RECOVERY_CONFIG_SCOPE");
  const gateway = createSupabaseDevGateway({
    url: environment.OTR_DEV_SUPABASE_URL!,
    publishableKey: environment.OTR_DEV_SUPABASE_PUBLISHABLE_KEY ?? "",
    secretKey: environment.OTR_DEV_SUPABASE_SECRET_KEY ?? "",
  });
  const auth = async () => {
    current();
    const b = createRequestBoundary(Math.min(5000, end - Date.now()));
    try {
      const result = await b.run(() =>
        gateway.validatePublicationAccessToken!(config.bearer, b.signal),
      );
      if (
        result.disposition !== "VERIFIED" ||
        result.user.id !== config.actorId ||
        !(await b.run(() =>
          gateway.canReadTrip(config.actorId, config.task.trip_id!),
        ))
      )
        throw Error("UNIVERSAL_RECOVERY_AUTH_REJECTED");
      b.assertCurrent();
      current();
    } finally {
      b.close();
    }
  };
  await auth();
  const stores = await createFlightPrivateCustody(
    config.directory,
    config.identity,
  );
  const stat = await lstat(config.taskDatabase);
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    stat.uid !== process.getuid!() ||
    (stat.mode & 0o777) !== 0o600 ||
    stat.nlink !== 1
  ) {
    await stores.close();
    throw Error("UNIVERSAL_RECOVERY_DATABASE");
  }
  const sql = new DatabaseSync(config.taskDatabase);
  const catalogConnection = createPublicationCatalogPgConnection(
    config.catalogPg,
  );
  try {
    const after = await lstat(config.taskDatabase);
    if (after.ino !== stat.ino || after.dev !== stat.dev)
      throw Error("UNIVERSAL_RECOVERY_DATABASE_CHANGED");
    // No migrations/bootstrap/create/queue dispatch; this must already be the accepted Backend DB.
    sql.exec("PRAGMA foreign_keys=ON");
    const db = universalTaskDatabase(sql);
    const context = await captureAccountRequestContext(
      config.task.trip_id,
      async () => {
        current();
        return config.actorId;
      },
    );
    const imports = createTripImportAdmissionRepository(
      db,
      async () => config.actorId,
      async (b) => digest(b),
      () => new Date().toISOString(),
      () => {
        throw Error("UNIVERSAL_RECOVERY_NO_CREATE");
      },
    );
    const readSourceManifest = async (task: Readonly<Task>) => {
      await auth();
      const raw = await readUniversalCatalog(
        catalogConnection,
        task,
        AbortSignal.timeout(Math.min(5000, end - Date.now())),
      );
      current();
      await imports.applyUniversalCatalogs(context, raw);
      return retainedRecoveryManifest(task, raw);
    };
    const repository = createIntelligenceContinuationRepository(db, {
      getAccountId: async () => {
        current();
        return config.actorId;
      },
      now: () => new Date().toISOString(),
      sha256: async (b) => digest(b),
      async validateAdmission(t) {
        current();
        if (
          t.task_id !== config.task.task_id ||
          t.account_id !== config.actorId ||
          t.policy_sha256 !== config.task.policy_sha256 ||
          t.input_sha256 !== config.task.input_sha256 ||
          t.publication_fence !== config.task.publication_fence
        )
          throw Error("UNIVERSAL_RECOVERY_TASK_CHANGED");
      },
      async validateAttemptAdmission() {
        throw Error("UNIVERSAL_RECOVERY_NO_ATTEMPT");
      },
      async eligibleWait() {
        return false;
      },
      async verifyRecovery() {
        throw Error("UNIVERSAL_RECOVERY_UNKNOWN_REQUIRES_PROOF");
      },
    });
    const deps = {
      context,
      task: config.task,
      attemptId: config.attempt.attempt_id,
      callId: config.attempt.usage_correlation_id!,
      requestMaterialByteCount: 1,
      repository,
      stores,
      checks: createUniversalTaskReceiptChecks(
        createModelTaskPgConnection(config.taskPg),
      ),
      priceSchedule: args.priceSchedule,
      assertCurrentAuth: auth,
      readSourceManifest,
    };
    let closed = false;
    const close = async () => {
      if (closed) return;
      closed = true;
      sql.close();
      await stores.close();
      await catalogConnection.close();
    };
    const timer = setTimeout(() => {
      void close().catch(() => {});
    }, end - Date.now());
    timer.unref();
    return {
      universalImportPort: createSettledUniversalReadPort(deps),
      async recoverOnce() {
        current();
        if (closed) throw Error("UNIVERSAL_RECOVERY_CLOSED");
        const firstManifest = await readSourceManifest(config.task);
        const dispatch = prepareUniversalDispatch(
          config.actorId,
          config.task.import_id!,
          {
            version: UNIVERSAL_IMPORT_VERSION,
            tripId: config.task.trip_id!,
            taskId: config.task.task_id,
          },
          firstManifest,
        );
        const marker = Buffer.from(JSON.stringify(dispatch.dispatchMarker));
        if (digest(marker) !== config.attempt.request_material_sha256)
          throw Error("UNIVERSAL_RECOVERY_REQUEST_MATERIAL_CHANGED");
        let first = true;
        const sources = async (t: Readonly<Task>) => {
          if (first) {
            first = false;
            return firstManifest;
          }
          return readSourceManifest(t);
        };
        const result = await recoverSettledUniversalTask({
          ...deps,
          requestMaterialByteCount: marker.length,
          readSourceManifest: sources,
        });
        return {
          status: "SETTLED_EXISTING_TASK_PUBLISHED",
          taskId: config.task.task_id,
          resultStatus: result.status,
          candidateCount: result.candidates.length,
          providerCalls: 0,
        };
      },
      async close() {
        clearTimeout(timer);
        await close();
      },
    };
  } catch (error) {
    sql.close();
    await stores.close();
    await catalogConnection.close();
    throw error;
  }
}

export async function runSettledUniversalRecoveryOperator(
  args: Parameters<typeof loadSettledUniversalReadRuntime>[0],
  environment: Record<string, string | undefined>,
) {
  const runtime = await loadSettledUniversalReadRuntime(args, environment);
  try {
    return await runtime.recoverOnce();
  } finally {
    await runtime.close();
  }
}
