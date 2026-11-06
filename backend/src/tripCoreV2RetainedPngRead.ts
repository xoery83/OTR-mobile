import type { CorePgConnection } from "./tripCoreV2PgStorage";
import type { CoreGateMode } from "./tripSustainedGate";
import {
  assertCoreReadScope,
  requireCoreReadActor,
  setCoreReadIdentity,
} from "./tripCoreV2PgRead";
import { createCoreUniversalSourceRead } from "./universalCoreSourceRead";
import type { UniversalRunBinding } from "./universalBatchSource";

export type RetainedPngScope = Readonly<{
  accountId: string;
  tripId: string;
  batchId: string;
  taskId: string;
}>;

export type RetainedPngTarget = RetainedPngScope &
  Readonly<{
    runId: string;
    inputId: string;
    sourceId: string;
    representationId: string;
    sourceRevision: number;
    sourceRowRevision: number;
    representationRowRevision: number;
    sha256: string;
    byteCount: number;
  }>;

export type RetainedPngReader = {
  target: RetainedPngTarget;
  read(
    source: Readonly<{
      binding: UniversalRunBinding;
      withRetainedMetadata: ReturnType<
        typeof createCoreUniversalSourceRead
      >["withRetainedMetadata"];
      recheck(): Promise<void>;
    }>,
  ): Promise<Uint8Array>;
};

export function createCoreRetainedPngRead(
  connection: CorePgConnection,
  reader: RetainedPngReader,
  gateMode?: CoreGateMode,
) {
  const target = Object.freeze({ ...reader.target });
  return async (scope: RetainedPngScope, assertCurrent: () => Promise<void>) => {
    const { accountId, tripId, batchId, taskId } = target;
    if (
      scope.accountId !== accountId ||
      scope.tripId !== tripId ||
      scope.batchId !== batchId ||
      scope.taskId !== taskId
    )
      return null;
    await assertCurrent();
    return connection.withLease(async (lease) => {
      await lease.query("BEGIN ISOLATION LEVEL READ COMMITTED");
      try {
        await lease.query("SET LOCAL statement_timeout='5000ms'");
        await lease.query("SET LOCAL lock_timeout='1000ms'");
        await lease.query("SET LOCAL idle_in_transaction_session_timeout='20000ms'");
        await setCoreReadIdentity(lease, accountId, tripId);
        await assertCoreReadScope(lease, accountId, tripId, gateMode);
        // Core89 takes the Source advisory lock before locking Actor/Trip rows.
        // Let the owning reader keep that order before rechecking the Actor.
        const source = createCoreUniversalSourceRead(
          lease,
          accountId,
          tripId,
          undefined,
          target.sourceId,
        );
        const binding = await source.lookup(accountId, tripId, batchId);
        const pin = binding.inputs[0];
        if (
          binding.taskId !== taskId ||
          binding.runId !== target.runId ||
          binding.inputs.length !== 1 ||
          pin.id !== target.inputId ||
          pin.source_id !== target.sourceId ||
          pin.representation_id !== target.representationId ||
          pin.material_revision !== target.sourceRevision ||
          pin.observed_source_row_revision !== target.sourceRowRevision ||
          pin.payload_sha256 !== target.sha256 ||
          pin.byte_count !== target.byteCount ||
          pin.pdfSource
        )
          throw Error("UNIVERSAL_SOURCE_BINDING_INVALID");
        const recheck = async () => {
          await assertCurrent();
          await requireCoreReadActor(lease, accountId, tripId, gateMode);
          await lease.query("SET LOCAL ROLE otr_trip_core_v2_writer");
          try {
            const rows = (
              await lease.query(
                `SELECT r.row_revision::float8 AS revision
                 FROM public.trip_sources s
                 JOIN public.trip_source_representations r ON r.source_id=s.id
                WHERE s.acquired_by=$1::uuid AND s.trip_id=$2::uuid AND s.id=$3::uuid
                  AND r.id=$4::uuid AND s.current_material_revision=$5::bigint
                  AND r.introduced_revision=$5::bigint AND s.row_revision=$6::bigint
                  AND s.lifecycle='ACTIVE' AND s.retention_state='RETAINED'
                  AND r.role='ORIGINAL' AND r.material_kind='BINARY' AND r.mime_type='image/png'
                  AND r.remote_state='VERIFIED' AND r.retention_state='RETAINED'
                  AND r.payload_sha256=$7 AND r.byte_count=$8::bigint`,
                [
                  accountId,
                  tripId,
                  target.sourceId,
                  target.representationId,
                  target.sourceRevision,
                  target.sourceRowRevision,
                  target.sha256,
                  target.byteCount,
                ],
              )
            ).rows;
            if (
              rows.length !== 1 ||
              rows[0].revision !== target.representationRowRevision
            )
              throw Error("UNIVERSAL_SOURCE_IMAGE_UNQUALIFIED");
          } finally {
            await lease.query("SET LOCAL ROLE otr_trip_core_v2_gateway");
          }
        };
        await recheck();
        const bytes = await reader.read({
          binding,
          withRetainedMetadata: source.withRetainedMetadata,
          recheck,
        });
        await recheck();
        await lease.query("COMMIT");
        return bytes;
      } catch (error) {
        try {
          await lease.query("ROLLBACK");
        } catch {
          lease.retire();
        }
        throw error;
      }
    });
  };
}
