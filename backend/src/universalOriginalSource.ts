import { performance } from "node:perf_hooks";
import type { DatabaseSync } from "node:sqlite";
import { CAPTURE_CUSTODY_MAX_BYTES } from "../../src/domain/capture/captureCustody";
import { z } from "zod";
import {
  createRequestBoundary,
  readBoundedJson,
  RequestBoundaryError,
} from "../../src/data/api/requestBoundary";
import { coreUuid } from "../../src/domain/trip/tripCoreV2";
import {
  canonicalEventJson,
  parseEventJson,
  type Json,
} from "../../src/domain/trip/eventIntentJson";
import { importDigest, type ImportHash } from "../../src/domain/trip/flightImportReview";
import { verifyUtf8TextFile } from "../../src/domain/capture/utf8TextFile";
import {
  flightTextAcquisitionSchema,
  verifySourceAcquisitionResult,
} from "./flightTextSource";
import type { CorePgConnection, CorePgLease } from "./tripCoreV2PgStorage";
import {
  universalBatchInputsSchema,
  universalRunBindingSchema,
  type UniversalRunBinding,
} from "./universalBatchSource";
import {
  assertTaskForeignKeys,
  mixedBInitialDigest,
  mixedBInitialManifestSchema,
  reserveMixedBTask,
  type MixedBInitialManifest,
} from "./universalMixedBTaskReservation";

const fileAcquisition = flightTextAcquisitionSchema.extend({
  payload: flightTextAcquisitionSchema.shape.payload.extend({
    source_input: flightTextAcquisitionSchema.shape.payload.shape.source_input.extend({
      source_kind: z.literal("FILE"),
      acquisition_channel: z.literal("FILES"),
    }),
    original: flightTextAcquisitionSchema.shape.payload.shape.original.extend({
      original_filename: z.string().min(1).max(255),
      byte_count: z.number().int().min(1).max(262144),
    }),
  }),
});
const pendingPdfAcquisition = fileAcquisition.extend({
  payload: fileAcquisition.shape.payload.extend({
    original: fileAcquisition.shape.payload.shape.original.extend({
      material_kind: z.literal("BINARY"),
      original_filename: z
        .string()
        .min(1)
        .max(255)
        .regex(/\.pdf$/i),
      mime_type: z.literal("application/pdf"),
      encoding: z.null(),
      text_content: z.null(),
      byte_count: z.number().int().positive().max(CAPTURE_CUSTODY_MAX_BYTES),
    }),
  }),
});
const pendingPngAcquisition = pendingPdfAcquisition.extend({
  payload: pendingPdfAcquisition.shape.payload.extend({
    source_input: pendingPdfAcquisition.shape.payload.shape.source_input.extend({
      source_kind: z.literal("IMAGE"),
    }),
    original: pendingPdfAcquisition.shape.payload.shape.original.extend({
      original_filename: z.string().min(1).max(255).nullable(),
      mime_type: z.literal("image/png"),
    }),
  }),
});
export const universalOriginalAcquisitionSchema = z.union([
  flightTextAcquisitionSchema,
  fileAcquisition,
  pendingPdfAcquisition,
  pendingPngAcquisition,
]);
type MixedBInitialSource = Readonly<{
  manifest: MixedBInitialManifest;
  taskDb: DatabaseSync;
  assertCurrent(): void;
  // The owning material CAS supplies this independently of the initial digest.
  expectedMaterial?: { inputSha256: string; expiresAt: string };
}>;

const materialScopeSchema = z.strictObject({
  inputSha256: z.string().regex(/^[a-f0-9]{64}$/),
  expiresAt: z.iso.datetime({ offset: true }),
});
async function readMixedBObservation(
  lease: CorePgLease,
  initial: MixedBInitialManifest,
  envelope: Json,
) {
  const { rows } = await lease.query(
    `SELECT public.trip_source_find_finite_universal_binding(
      $1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6,$7::jsonb
    ) AS result`,
    [
      initial.actorId,
      initial.tripId,
      initial.batchId,
      initial.taskId,
      initial.runId,
      initial.submissionSha256,
      canonicalEventJson(envelope),
    ],
  );
  if (rows.length !== 1) throw Error("MIXED_B_SOURCE_OBSERVATION_UNAVAILABLE");
  return rows[0].result;
}

async function proveMixedBPristine(
  lease: CorePgLease,
  initial: MixedBInitialManifest,
  firstCommandSha256?: string,
) {
  const result = await readMixedBObservation(lease, initial, initial as Json);
  const parsed = z
    .strictObject({
      version: z.literal("otr.import.mixed-b-pristine/1"),
      initialManifestSha256: z.literal(mixedBInitialDigest(initial)),
      firstCommandSha256: z.string().regex(/^[a-f0-9]{64}$/),
    })
    .safeParse(result);
  if (
    !parsed.success ||
    (firstCommandSha256 !== undefined &&
      parsed.data.firstCommandSha256 !== firstCommandSha256)
  )
    throw Error("MIXED_B_SOURCE_NOT_PRISTINE");
}

export function assertMixedBTaskFence(
  sql: DatabaseSync,
  initial: MixedBInitialManifest,
  reserved: boolean,
) {
  assertTaskForeignKeys(sql);
  if (sql.isTransaction) throw Error("MIXED_B_TASK_TRANSACTION");
  const state = sql
    .prepare(
      `SELECT
    EXISTS(SELECT 1 FROM intelligence_continuations WHERE task_id=? OR import_id=?) AS task,
    EXISTS(SELECT 1 FROM intelligence_continuation_attempts WHERE task_id=?) AS attempt,
    EXISTS(SELECT 1 FROM sync_operations WHERE entity_type='INTELLIGENCE_CONTINUATION' AND entity_id=?) AS wake,
    (SELECT count(*) FROM universal_mixed_b_task_reservations WHERE task_id=? OR batch_id=?) AS reservation,
    EXISTS(SELECT 1 FROM universal_mixed_b_task_reservations WHERE task_id=? AND account_id=? AND
      trip_id=? AND batch_id=? AND run_id=? AND submission_sha256=? AND initial_manifest_sha256=?
      AND phase='RESERVED') AS exactReserved`,
    )
    .get(
      initial.taskId,
      initial.batchId,
      initial.taskId,
      initial.taskId,
      initial.taskId,
      initial.batchId,
      initial.taskId,
      initial.actorId,
      initial.tripId,
      initial.batchId,
      initial.runId,
      initial.submissionSha256,
      mixedBInitialDigest(initial),
    );
  if (
    state?.task !== 0 ||
    state.attempt !== 0 ||
    state.wake !== 0 ||
    state.reservation !== (reserved ? 1 : 0) ||
    (reserved && state.exactReserved !== 1)
  )
    throw Error("MIXED_B_TASK_FENCE");
}

type OriginalSourcePort = {
  acquire(actor: string, trip: string, raw: unknown): Promise<Record<string, Json>>;
  lookup(actor: string, trip: string, raw: unknown): Promise<Record<string, Json> | null>;
};
export type MixedBPristineSource = {
  proveInitialMixedBTaskAbsent(
    actor: string,
    trip: string,
    batch: string,
    expectedInitialDigest: string,
  ): Promise<void>;
  proveContinuationMixedBTaskAbsent?(
    actor: string,
    trip: string,
    batch: string,
    expectedInitialDigest: string,
  ): Promise<void>;
};
type MixedBMaterialLease = {
  observeMixedBMaterialReady(raw: unknown): Promise<{
    runState: "ABSENT" | "PENDING";
    normalizedInputSha256: string;
    assertCurrent(): void;
  }>;
  withCurrentMixedBMaterial<T>(
    raw: unknown,
    expected: UniversalRunBinding,
    use: (assertLockedCurrent: () => void) => Promise<T>,
  ): Promise<T>;
};
type OriginalSourceOptions = { pendingPdf?: boolean; pendingPng?: boolean };

// Only the explicit owner composition exposes the private Context observation.
export function createUniversalOriginalSourceConnection(
  connection: CorePgConnection,
  hash: ImportHash,
  options: OriginalSourceOptions & {
    mixedBInitial: MixedBInitialSource & {
      expectedMaterial: z.infer<typeof materialScopeSchema>;
    };
  },
): OriginalSourcePort & MixedBPristineSource & MixedBMaterialLease;
export function createUniversalOriginalSourceConnection(
  connection: CorePgConnection,
  hash: ImportHash,
  options: OriginalSourceOptions & { mixedBInitial: MixedBInitialSource },
): OriginalSourcePort & MixedBPristineSource;
export function createUniversalOriginalSourceConnection(
  connection: CorePgConnection,
  hash: ImportHash,
  options?: OriginalSourceOptions,
): OriginalSourcePort;
export function createUniversalOriginalSourceConnection(
  connection: CorePgConnection,
  hash: ImportHash,
  options: OriginalSourceOptions & { mixedBInitial?: MixedBInitialSource } = {},
) {
  const mixedB = options.mixedBInitial;
  const initial = mixedB && mixedBInitialManifestSchema.parse(mixedB.manifest);
  const expectedMaterial =
    mixedB?.expectedMaterial && materialScopeSchema.parse(mixedB.expectedMaterial);
  if (mixedB) assertTaskForeignKeys(mixedB.taskDb);
  async function transaction<T>(work: (lease: CorePgLease) => Promise<T>) {
    return connection.withLease(async (lease) => {
      await lease.query("BEGIN ISOLATION LEVEL READ COMMITTED");
      try {
        const result = await work(lease);
        await lease.query("COMMIT");
        return result;
      } catch (error) {
        try {
          await lease.query("ROLLBACK");
        } catch {
          lease.retire();
        }
        throw error;
      }
    });
  }
  async function readOne(lease: CorePgLease, query: string, params: unknown[]) {
    const { rows } = await lease.query(query, params);
    if (rows.length !== 1) throw new Error("SOURCE_IO_UNAVAILABLE");
    return rows[0].result;
  }
  function mixedBOrdinal(
    actor: string,
    trip: string,
    q: z.infer<typeof universalOriginalAcquisitionSchema>,
  ) {
    if (!initial) return -1;
    const ordinal = initial.originals.findIndex(
      (pin) =>
        pin.sourceId === q.source_id &&
        pin.operationId === q.operation_id &&
        pin.operationKey === q.operation_key &&
        pin.operationSha256 === q.operation_sha256 &&
        pin.originalRepresentationId === q.payload.original.id &&
        pin.byteCount === q.payload.original.byte_count &&
        pin.sha256 === q.payload.original.payload_sha256,
    );
    if (actor !== initial.actorId || trip !== initial.tripId || ordinal < 0)
      throw Error("MIXED_B_SOURCE_COMMAND");
    return ordinal;
  }
  async function input(actor: string, trip: string, raw: unknown) {
    coreUuid.parse(actor);
    coreUuid.parse(trip);
    const q = universalOriginalAcquisitionSchema.parse(raw);
    if (q.actor_account_id !== actor || q.trip_id !== trip)
      throw new Error("SOURCE_ACCESS_DENIED");
    if (q.payload.original.material_kind === "BINARY") {
      const allowed =
        q.payload.original.mime_type === "image/png"
          ? options.pendingPng === true
          : options.pendingPdf === true;
      if (!allowed) throw Error("UNIVERSAL_SOURCE_SCOPE_CLOSED");
      // Metadata only. Actual bytes must pass the existing Stage/upload/verify/seal path.
      return q;
    }
    const bytes = new TextEncoder().encode(q.payload.original.text_content);
    if (
      bytes.length !== q.payload.original.byte_count ||
      (await hash(bytes)) !== q.payload.original.payload_sha256
    )
      throw new Error("MATERIAL_INTEGRITY_MISMATCH");
    if (q.payload.source_input.source_kind === "FILE")
      verifyUtf8TextFile(bytes, q.payload.original.original_filename, "text/plain");
    return q;
  }
  return {
    // Owning Context may consume this only as a point-in-time Task/Run absence.
    // This candidate does not change the HTTP or runtime lookup mapping.
    async proveInitialMixedBTaskAbsent(
      actor: string,
      trip: string,
      batch: string,
      expectedInitialDigest: string,
    ) {
      if (
        !mixedB ||
        !initial ||
        actor !== initial.actorId ||
        trip !== initial.tripId ||
        batch !== initial.batchId ||
        expectedInitialDigest !== mixedBInitialDigest(initial)
      )
        throw Error("MIXED_B_INITIAL_BINDING");
      mixedB.assertCurrent();
      return transaction(async (lease) => {
        await proveMixedBPristine(lease, initial);
        mixedB.assertCurrent();
        assertMixedBTaskFence(mixedB.taskDb, initial, false);
      });
    },
    async proveContinuationMixedBTaskAbsent(
      actor: string,
      trip: string,
      batch: string,
      expectedInitialDigest: string,
    ) {
      if (
        !mixedB || !initial ||
        actor !== initial.actorId || trip !== initial.tripId || batch !== initial.batchId ||
        expectedInitialDigest !== mixedBInitialDigest(initial)
      )
        throw Error("MIXED_B_INITIAL_BINDING");
      mixedB.assertCurrent();
      return transaction(async (lease) => {
        const observed = z.strictObject({
          version: z.literal("otr.import.mixed-b-acquire-current/1"),
          initialManifestSha256: z.literal(expectedInitialDigest),
          ordinal: z.number().int().min(0).max(2),
        }).safeParse(await readMixedBObservation(lease, initial, {
          version: "otr.import.mixed-b-acquire-next/1",
          initialManifest: initial,
        } as Json));
        if (!observed.success) throw Error("MIXED_B_SOURCE_NOT_PRISTINE");
        mixedB.assertCurrent();
        assertMixedBTaskFence(mixedB.taskDb, initial, observed.data.ordinal !== 0);
      });
    },
    async withCurrentMixedBMaterial<T>(
      raw: unknown,
      rawExpected: UniversalRunBinding,
      use: (assertLockedCurrent: () => void) => Promise<T>,
    ) {
      if (!mixedB || !initial || !expectedMaterial)
        throw Error("MIXED_B_MATERIAL_SCOPE_UNAVAILABLE");
      const request = universalBatchInputsSchema.parse(raw);
      const expected = universalRunBindingSchema.parse(rawExpected);
      if (
        request.batchId !== initial.batchId ||
        request.submissionSha256 !== initial.submissionSha256 ||
        expected.actorId !== initial.actorId ||
        expected.tripId !== initial.tripId ||
        expected.batchId !== initial.batchId ||
        expected.taskId !== initial.taskId ||
        expected.runId !== initial.runId ||
        expected.submissionSha256 !== initial.submissionSha256
      )
        throw Error("MIXED_B_MATERIAL_BINDING");
      mixedB.assertCurrent();
      return transaction(async (lease) => {
        // Starting the local budget before the request subtracts all query latency.
        const started = performance.now();
        const parsedProof = z
          .strictObject({
            version: z.literal("otr.import.mixed-b-material-current/1"),
            initialManifestSha256: z.literal(mixedBInitialDigest(initial)),
            materialInputSha256: z.literal(expectedMaterial.inputSha256),
            scopeExpiresAt: z.iso.datetime({ offset: true }),
            scopeRemainingMs: z.number().int().positive().safe(),
            binding: universalRunBindingSchema,
          })
          .safeParse(
            await readMixedBObservation(lease, initial, {
              version: "otr.import.mixed-b-material-current/1",
              initialManifest: initial,
              inputs: request.inputs,
            } as Json),
          );
        // Keep owning-response failures separate from caller request validation.
        if (!parsedProof.success) throw Error("MIXED_B_MATERIAL_BINDING");
        const proof = parsedProof.data;
        const expiresAt = Date.parse(proof.scopeExpiresAt);
        if (
          expiresAt !== Date.parse(expectedMaterial.expiresAt) ||
          canonicalEventJson(proof.binding as Json) !==
            canonicalEventJson(expected as Json)
        )
          throw Error("MIXED_B_MATERIAL_BINDING");
        // A short local budget is useful even in isolation. The real driver has no commit fence.
        const localBudgetMs = Math.min(proof.scopeRemainingMs, 1000);
        const assertLockedCurrent = () => {
          mixedB.assertCurrent();
          if (performance.now() - started >= localBudgetMs || !(Date.now() < expiresAt))
            throw Error("MIXED_B_MATERIAL_WINDOW_CLOSED");
        };
        assertLockedCurrent();
        return use(assertLockedCurrent);
      });
    },
    async observeMixedBMaterialReady(raw: unknown) {
      if (!mixedB || !initial || !expectedMaterial)
        throw Error("MIXED_B_MATERIAL_SCOPE_UNAVAILABLE");
      const request = universalBatchInputsSchema.parse(raw);
      if (request.batchId !== initial.batchId || request.submissionSha256 !== initial.submissionSha256)
        throw Error("MIXED_B_MATERIAL_BINDING");
      mixedB.assertCurrent();
      return transaction(async (lease) => {
        const started = performance.now();
        const proof = z.strictObject({
          version: z.literal("otr.import.mixed-b-material-ready/1"),
          initialManifestSha256: z.literal(mixedBInitialDigest(initial)),
          materialInputSha256: z.literal(expectedMaterial.inputSha256),
          normalizedInputSha256: z.string().regex(/^[a-f0-9]{64}$/),
          runState: z.enum(["ABSENT", "PENDING"]),
          scopeExpiresAt: z.iso.datetime({ offset: true }),
          scopeRemainingMs: z.number().int().positive().safe(),
        }).safeParse(await readMixedBObservation(lease, initial, {
          version: "otr.import.mixed-b-material-ready/1",
          initialManifest: initial,
          inputs: request.inputs,
          materialInputSha256: expectedMaterial.inputSha256,
        } as Json));
        if (!proof.success || Date.parse(proof.data.scopeExpiresAt) !== Date.parse(expectedMaterial.expiresAt))
          throw Error("MIXED_B_MATERIAL_BINDING");
        const { normalizedInputSha256, runState, scopeExpiresAt, scopeRemainingMs } = proof.data;
        const assertCurrent = () => {
          mixedB.assertCurrent();
          if (performance.now() - started >= Math.min(scopeRemainingMs, 1000) ||
            !(Date.now() < Date.parse(scopeExpiresAt)))
            throw Error("MIXED_B_MATERIAL_WINDOW_CLOSED");
        };
        assertCurrent();
        return { runState, normalizedInputSha256, assertCurrent };
      });
    },
    async acquire(actor: string, trip: string, raw: unknown) {
      const q = await input(actor, trip, raw);
      const ordinal = mixedBOrdinal(actor, trip, q);
      const firstCommandSha256 = ordinal === 0
        ? await importDigest("otr.import.mixed-b-first-acquire/1", q as Json, hash)
        : undefined;
      const canonical = canonicalEventJson(q as Json);
      const verify = async (result: unknown) => {
        const receipt = result as Record<string, Json>;
        await verifySourceAcquisitionResult(
          q,
          receipt,
          hash,
          q.payload.original.material_kind === "BINARY" ? "PENDING" : "NOT_APPLICABLE",
        );
        return receipt;
      };
      return transaction(async (lease) => {
        if (mixedB && initial) {
          mixedB.assertCurrent();
          const prior = await readOne(
            lease,
            "SELECT public.trip_source_lookup_universal_original($1::uuid,$2) AS result",
            [actor, canonical],
          );
          if (prior !== null) return verify(prior);
          if (ordinal === 0) {
            await proveMixedBPristine(lease, initial, firstCommandSha256);
            mixedB.assertCurrent();
            assertMixedBTaskFence(mixedB.taskDb, initial, false);
            reserveMixedBTask(mixedB.taskDb, initial);
            await proveMixedBPristine(lease, initial, firstCommandSha256);
          } else {
            assertMixedBTaskFence(mixedB.taskDb, initial, true);
            const proof = z.strictObject({
              version: z.literal("otr.import.mixed-b-acquire-current/1"),
              initialManifestSha256: z.literal(mixedBInitialDigest(initial)),
              ordinal: z.literal(ordinal),
            }).safeParse(await readMixedBObservation(lease, initial, {
              version: "otr.import.mixed-b-acquire-current/1",
              initialManifest: initial,
              command: q,
            } as Json));
            if (!proof.success) throw Error("MIXED_B_FINAL_ORIGINAL_PROOF_REQUIRED");
          }
          mixedB.assertCurrent();
          assertMixedBTaskFence(mixedB.taskDb, initial, true);
        }
        const receipt = await verify(
          await readOne(
            lease,
            "SELECT public.trip_source_acquire_universal_original($1::uuid,$2) AS result",
            [actor, canonical],
          ),
        );
        mixedB?.assertCurrent();
        return receipt;
      });
    },
    async lookup(actor: string, trip: string, raw: unknown) {
      const q = await input(actor, trip, raw);
      const ordinal = mixedBOrdinal(actor, trip, q);
      const execute = (query: string, params: unknown[]) =>
        transaction((lease) => readOne(lease, query, params));
      let r: Record<string, Json> | null;
      try {
        r = (await execute(
          "SELECT public.trip_source_lookup_universal_original($1::uuid,$2) AS result",
          [actor, canonicalEventJson(q as Json)],
        )) as Record<string, Json> | null;
      } catch (error) {
        if (
          ordinal >= 0 ||
          !(error instanceof Error) ||
          error.message !== "UNIVERSAL_SOURCE_SCOPE_CLOSED" ||
          q.payload.source_input.source_kind !== "FILE" ||
          q.payload.original.material_kind !== "TEXT"
        )
          throw error;
        // execute has rolled back/released the failed lease; this port only reads an existing receipt.
        r = (await execute(
          "SELECT public.trip_source_operation_lookup($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5,$6) AS result",
          [actor, trip, q.source_id, q.operation_id, q.operation_key, q.operation_sha256],
        )) as Record<string, Json> | null;
        // Absence after close must not invite another ACQUIRE or replace an UNKNOWN intent.
        if (r === null) throw error;
      }
      if (r !== null)
        await verifySourceAcquisitionResult(
          q,
          r,
          hash,
          q.payload.original.material_kind === "BINARY" ? "PENDING" : "NOT_APPLICABLE",
        );
      return r;
    },
  };
}

export async function universalOriginalSourceBoundary(
  request: Request,
  actor: string,
  canReadTrip: (actor: string, trip: string) => Promise<boolean>,
  connection?: ReturnType<typeof createUniversalOriginalSourceConnection>,
) {
  const reply = (status: number, value: unknown) =>
    new Response(JSON.stringify(value), {
      status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "private, no-store",
        Vary: "Authorization",
      },
    });
  const fail = (status: number, code: string) =>
    reply(status, { error: { code, message: code } });
  const url = new URL(request.url);
  const match =
    /^\/v2\/trips\/([^/]+)\/universal-source-originals\/(acquire|result)$/.exec(
      url.pathname,
    );
  if (!match || !coreUuid.safeParse(match[1]).success || url.search)
    return fail(400, "INVALID_SOURCE_COMMAND");
  if (request.method !== "POST") return fail(405, "METHOD_NOT_ALLOWED");
  try {
    if (!(await canReadTrip(actor, match[1]))) return fail(403, "SOURCE_ACCESS_DENIED");
    if (!connection) return fail(503, "SOURCE_CAPABILITY_CLOSED");
    const boundary = createRequestBoundary(15000, request.signal);
    let value: unknown;
    try {
      value = await readBoundedJson(
        new Response(request.body),
        2097152,
        boundary,
        (raw) => parseEventJson(raw, 2097152),
      );
    } finally {
      boundary.close();
    }
    return reply(
      200,
      match[2] === "acquire"
        ? await connection.acquire(actor, match[1], value)
        : await connection.lookup(actor, match[1], value),
    );
  } catch (error) {
    const code = error instanceof Error ? error.message : "SOURCE_IO_UNAVAILABLE";
    if (error instanceof RequestBoundaryError)
      return fail(error.code === "BODY_LIMIT" ? 413 : 400, "INVALID_SOURCE_COMMAND");
    if (
      error instanceof z.ZodError ||
      [
        "INVALID_SOURCE_COMMAND",
        "UTF8_TEXT_FILE_UNSUPPORTED",
        "UTF8_FILE_PROFILE_UNSUPPORTED",
        "UTF8_FILE_CONTENT_UNSUPPORTED",
        "MATERIAL_INTEGRITY_MISMATCH",
      ].includes(code)
    )
      return fail(422, "INVALID_SOURCE_COMMAND");
    if (code === "SOURCE_ACCESS_DENIED") return fail(403, code);
    if (code === "UNIVERSAL_SOURCE_SCOPE_CLOSED")
      return fail(503, "SOURCE_CAPABILITY_CLOSED");
    if (["OPERATION_ID_REUSED", "OPERATION_KEY_REUSED", "INPUT_STALE"].includes(code))
      return fail(409, code);
    return fail(503, "SOURCE_IO_UNAVAILABLE");
  }
}
