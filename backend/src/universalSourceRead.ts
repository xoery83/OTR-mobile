import { createHash } from "node:crypto";
import { z } from "zod";
import type { Task } from "../../src/domain/intelligence/persistence";
import type { CorePgConnection } from "./tripCoreV2PgStorage";
import type { UniversalManifest } from "./universalImport";

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
      }),
    )
    .min(1)
    .max(64),
});

// The owning SQL reader validates current Actor/Trip/Source/Representation access.
// It never asks for a READY Run or creates a Source Plan. Binary material is read
// by existing custody, then the owning read set is checked again before disclosure.
export function createUniversalSourceReader(deps: {
  connection: CorePgConnection;
  readBinary(scope: {
    accountId: string;
    tripId: string;
    sourceId: string;
    representationId: string;
    sha256: string;
    byteCount: number;
  }): Promise<Uint8Array>;
}) {
  async function read(task: Readonly<Task>) {
    if (!task.trip_id || !task.run_id)
      throw new Error("UNIVERSAL_SOURCE_RUN_UNAVAILABLE");
    return deps.connection.withLease(async (lease) => {
      let began = false;
      try {
        await lease.query("BEGIN ISOLATION LEVEL READ COMMITTED");
        began = true;
        await lease.query("SET LOCAL statement_timeout='5000ms'");
        const rows = await lease.query(
          "SELECT public.trip_source_read_universal_inputs($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid) AS manifest",
          [task.account_id, task.trip_id, task.import_id, task.task_id, task.run_id],
        );
        const value = manifestSchema.parse(rows.rows[0]?.manifest);
        if (
          value.accountId !== task.account_id ||
          value.tripId !== task.trip_id ||
          value.batchId !== task.import_id ||
          value.taskId !== task.task_id ||
          value.runId !== task.run_id ||
          value.submissionSha256 !== task.manifest_sha256
        )
          throw new Error("UNIVERSAL_SOURCE_BINDING_INVALID");
        await lease.query("COMMIT");
        began = false;
        return value;
      } catch (error) {
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
  return async (task: Readonly<Task>): Promise<UniversalManifest> => {
    const first = await read(task);
    if (
      new Set(first.representations.map((r) => r.inputId)).size !==
        first.representations.length ||
      new Set(first.representations.map((r) => r.representationId)).size !==
        first.representations.length ||
      task.input_pins.length !== first.representations.length
    )
      throw new Error("UNIVERSAL_SOURCE_BINDING_INVALID");
    const representations = [];
    for (const r of first.representations) {
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
      const raw =
        r.text !== null
          ? Buffer.from(r.text)
          : await deps.readBinary({
              accountId: first.accountId,
              tripId: first.tripId,
              sourceId: r.sourceId,
              representationId: r.representationId,
              sha256: r.sha256,
              byteCount: r.byteCount,
            });
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
        mime: r.mime,
        bytes,
      });
    }
    if (JSON.stringify(await read(task)) !== JSON.stringify(first))
      throw new Error("UNIVERSAL_SOURCE_CHANGED");
    return {
      accountId: first.accountId,
      tripId: first.tripId,
      batchId: first.batchId,
      representations,
    };
  };
}
