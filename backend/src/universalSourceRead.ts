import { universalBindingDiagnostic } from "./universalBindingDiagnostic";
import { universalPngSourceProofSchema } from "./universalPngSourceMaterial";
import { universalPdfSourceProvenanceSchema } from "../../src/data/api/universalImportContracts";
import { PDF_V2_OPTIONS_SHA } from "./sourcePdfV2Contracts";
import { createHash } from "node:crypto";
import { z } from "zod";
import type { Task } from "../../src/domain/intelligence/persistence";
import type { CorePgConnection } from "./tripCoreV2PgStorage";
import type { UniversalManifest } from "./universalImport";

export type UniversalSourceTask = Pick<
  Task,
  | "account_id"
  | "trip_id"
  | "run_id"
  | "import_id"
  | "task_id"
  | "manifest_sha256"
  | "input_pins"
>;
const identity = z.uuid(),
  digest = z.string().regex(/^[a-f0-9]{64}$/);
const manifestSchema = z.strictObject({
  accountId: identity,
  tripId: identity,
  batchId: identity,
  taskId: identity,
  runId: identity,
  submissionSha256: digest,
  representations: z
    .array(
      z.strictObject({
        inputId: identity,
        sourceId: identity,
        representationId: identity,
        revision: z.number().int().positive().safe(),
        sha256: digest,
        byteCount: z.number().int().positive().max(4194304),
        mime: z.enum(["text/plain", "text/html", "image/jpeg", "image/png"]),
        text: z.string().nullable(),
        pdfSource: universalPdfSourceProvenanceSchema.optional(),
        pngSource: universalPngSourceProofSchema.optional(),
      }),
    )
    .min(1)
    .max(64),
});

export type UniversalSourceMetadata = z.infer<typeof manifestSchema>;

function checkedSnapshot(raw: unknown, task: Readonly<UniversalSourceTask>) {
  const value = manifestSchema.parse(raw);
  if (
    value.accountId !== task.account_id ||
    value.tripId !== task.trip_id ||
    value.batchId !== task.import_id ||
    value.taskId !== task.task_id ||
    value.runId !== task.run_id ||
    value.submissionSha256 !== task.manifest_sha256
  )
    throw new Error("UNIVERSAL_SOURCE_BINDING_INVALID");
  return value;
}

function checkSnapshotPins(
  first: z.infer<typeof manifestSchema>,
  task: Readonly<UniversalSourceTask>,
) {
  if (
    new Set(first.representations.map((r) => r.inputId)).size !==
      first.representations.length ||
    new Set(first.representations.map((r) => r.representationId)).size !==
      first.representations.length ||
    task.input_pins.length !== first.representations.length
  )
    throw new Error("UNIVERSAL_SOURCE_BINDING_INVALID");
  if (first.representations.filter((r) => r.mime === "image/png").length > 1)
    throw Error("UNIVERSAL_SOURCE_IMAGE_UNQUALIFIED");
}
function checkRepresentation(
  r: z.infer<typeof manifestSchema>["representations"][number],
  first: z.infer<typeof manifestSchema>,
  task: Readonly<UniversalSourceTask>,
) {
  const pin = task.input_pins.find(
    (p) => p.kind === "SOURCE" && p.input_id === r.inputId,
  );
  if (
    !pin ||
    pin.kind !== "SOURCE" ||
    pin.source_id !== r.sourceId ||
    pin.representation_id !== r.representationId ||
    pin.material_revision !== r.revision ||
    pin.payload_sha256 !== r.sha256 ||
    pin.byte_count !== r.byteCount
  )
    throw new Error("UNIVERSAL_SOURCE_BINDING_INVALID");
  if (r.mime === "image/png") {
    const proof = r.pngSource;
    if (
      !proof ||
      r.text !== null ||
      r.pdfSource ||
      pin.transform_sha256 != null ||
      r.byteCount > 1048576 ||
      proof.actorAccountId !== first.accountId ||
      proof.tripId !== first.tripId ||
      proof.sourceId !== r.sourceId ||
      proof.representationId !== r.representationId ||
      proof.sourceRevision !== r.revision ||
      proof.sha256 !== r.sha256 ||
      proof.byteCount !== r.byteCount
    )
      throw Error("UNIVERSAL_SOURCE_IMAGE_UNQUALIFIED");
  } else if (r.pngSource) throw Error("UNIVERSAL_SOURCE_IMAGE_UNQUALIFIED");
  if (pin.transform_sha256 === PDF_V2_OPTIONS_SHA && !r.pdfSource)
    throw Error("UNIVERSAL_SOURCE_MATERIAL_INVALID");
  if (
    r.pdfSource &&
    (r.mime !== "text/plain" ||
      r.pdfSource.original.representationId === r.representationId ||
      r.pdfSource.transformOptionsSha256 !== PDF_V2_OPTIONS_SHA ||
      pin.transform_sha256 !== r.pdfSource.transformOptionsSha256)
  )
    throw Error("UNIVERSAL_SOURCE_MATERIAL_INVALID");
}

type SourceReadStage =
  | "FIRST_SNAPSHOT"
  | "OWNING_SNAPSHOT"
  | "LEASE"
  | "BEGIN"
  | "TIMEOUT_SETUP"
  | "SOURCE_SQL"
  | "SNAPSHOT_PARSE"
  | "COMMIT"
  | "PIN_VALIDATION"
  | "BINARY_READ"
  | "MATERIAL_VALIDATION"
  | "SNAPSHOT_COMPARE"
  | "RETAINED_READ";

function reportSourceFailure(
  requestId: string | undefined,
  state: () => { stage: SourceReadStage; snapshot: "FIRST" | "SECOND" },
) {
  let reported = false;
  const diagnosticRequestId = identity.safeParse(requestId);
  return (error: unknown) => {
    if (reported) return;
    reported = true;
    if (!diagnosticRequestId.success) return;
    try {
      console.info(
        JSON.stringify({
          event: "universal_source_read_failed",
          requestId: diagnosticRequestId.data,
          ...state(),
          ...universalBindingDiagnostic(error),
        }),
      );
    } catch {
      /* Diagnostics never replace the owning failure. */
    }
  };
}

// The owning SQL reader validates current Actor/Trip/Source/Representation access.
// It never asks for a READY Run or creates a Source Plan. Binary material is read
// by existing custody, then the owning read set is checked again before disclosure.
export function createUniversalSourceReader(deps: {
  connection: CorePgConnection;
  continuous?: boolean;
  diagnosticRequestId?: string;
  readSnapshot?(task: Readonly<UniversalSourceTask>): Promise<unknown>;
  readBinary(scope: {
    accountId: string;
    tripId: string;
    sourceId: string;
    representationId: string;
    sha256: string;
    byteCount: number;
    mimeType?: string;
  }): Promise<Uint8Array>;
}) {
  async function read(
    task: Readonly<UniversalSourceTask>,
    phase: (value: SourceReadStage) => void,
    failed: (error: unknown) => void,
  ) {
    if (!task.trip_id || !task.run_id)
      throw new Error("UNIVERSAL_SOURCE_RUN_UNAVAILABLE");
    if (deps.readSnapshot) {
      phase("OWNING_SNAPSHOT");
      return checkedSnapshot(await deps.readSnapshot(task), task);
    }
    phase("LEASE");
    return deps.connection.withLease(async (lease) => {
      let began = false;
      try {
        phase("BEGIN");
        await lease.query("BEGIN ISOLATION LEVEL READ COMMITTED");
        began = true;
        phase("TIMEOUT_SETUP");
        await lease.query("SET LOCAL statement_timeout='5000ms'");
        phase("SOURCE_SQL");
        const rows = await lease.query(
          `SELECT public.${deps.continuous ? "trip_source_read_sustained_universal_inputs" : "trip_source_read_universal_inputs"}($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid) AS manifest`,
          [task.account_id, task.trip_id, task.import_id, task.task_id, task.run_id],
        );
        phase("SNAPSHOT_PARSE");
        const value = checkedSnapshot(rows.rows[0]?.manifest, task);
        phase("COMMIT");
        await lease.query("COMMIT");
        began = false;
        return value;
      } catch (error) {
        failed(error);
        if (began)
          try {
            await lease.query("ROLLBACK");
          } catch {
            lease.retire();
          }
        throw error;
      }
    });
  }
  const readOriginal = async (
    task: Readonly<UniversalSourceTask>,
  ): Promise<UniversalManifest> => {
    let stage: SourceReadStage = "FIRST_SNAPSHOT",
      snapshot: "FIRST" | "SECOND" = "FIRST";
    const failed = reportSourceFailure(deps.diagnosticRequestId, () => ({
      stage,
      snapshot,
    }));
    try {
      const first = await read(
        task,
        (value) => {
          stage = value;
        },
        failed,
      );
      stage = "PIN_VALIDATION";
      checkSnapshotPins(first, task);
      const representations = [];
      for (const r of first.representations) {
        stage = "PIN_VALIDATION";
        checkRepresentation(r, first, task);
        let raw: Uint8Array;
        if (r.text !== null) raw = Buffer.from(r.text);
        else {
          stage = "BINARY_READ";
          raw = await deps.readBinary({
            accountId: first.accountId,
            tripId: first.tripId,
            sourceId: r.sourceId,
            representationId: r.representationId,
            sha256: r.sha256,
            byteCount: r.byteCount,
            mimeType: r.mime,
          });
        }
        stage = "MATERIAL_VALIDATION";
        const bytes = Buffer.from(raw);
        if (
          bytes.length !== r.byteCount ||
          createHash("sha256").update(bytes).digest("hex") !== r.sha256 ||
          (r.mime.startsWith("text/") ? r.text === null : r.text !== null)
        )
          throw new Error("UNIVERSAL_SOURCE_MATERIAL_INVALID");
        representations.push({
          accountId: first.accountId,
          tripId: first.tripId,
          batchId: first.batchId,
          inputId: r.inputId,
          sourceId: r.sourceId,
          representationId: r.representationId,
          revision: r.revision,
          originalSha256: r.sha256,
          ...(r.pdfSource ? { pdfSource: structuredClone(r.pdfSource) } : {}),
          mime: r.mime,
          bytes,
        });
      }
      snapshot = "SECOND";
      if (
        JSON.stringify(
          await read(
            task,
            (value) => {
              stage = value;
            },
            failed,
          ),
        ) !== JSON.stringify(first)
      ) {
        stage = "SNAPSHOT_COMPARE";
        throw new Error("UNIVERSAL_SOURCE_CHANGED");
      }
      return {
        accountId: first.accountId,
        tripId: first.tripId,
        batchId: first.batchId,
        representations,
      };
    } catch (error) {
      failed(error);
      throw error;
    }
  };
  return Object.assign(readOriginal, {
    async withRetainedMetadata<T>(
      task: Readonly<UniversalSourceTask>,
      disclose: (snapshot: z.infer<typeof manifestSchema>) => Promise<T>,
    ) {
      let stage: SourceReadStage = "FIRST_SNAPSHOT",
        snapshot: "FIRST" | "SECOND" = "FIRST";
      const failed = reportSourceFailure(deps.diagnosticRequestId, () => ({
        stage,
        snapshot,
      }));
      try {
        const first = await read(
          task,
          (value) => {
            stage = value;
          },
          failed,
        );
        stage = "PIN_VALIDATION";
        checkSnapshotPins(first, task);
        for (const representation of first.representations)
          checkRepresentation(representation, first, task);
        stage = "RETAINED_READ";
        const result = await disclose(first);
        snapshot = "SECOND";
        if (
          JSON.stringify(
            await read(
              task,
              (value) => {
                stage = value;
              },
              failed,
            ),
          ) !== JSON.stringify(first)
        ) {
          stage = "SNAPSHOT_COMPARE";
          throw Error("UNIVERSAL_SOURCE_CHANGED");
        }
        return result;
      } catch (error) {
        failed(error);
        throw error;
      }
    },
  });
}
