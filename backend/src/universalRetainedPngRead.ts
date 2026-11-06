import { createHash } from "node:crypto";
import {
  captureAccountRequestContext,
  type AccountRequestContext,
} from "../../src/data/auth/accountRequestContext";
import {
  createIntelligenceContinuationRepository,
  type ContinuationDatabase,
} from "../../src/data/repositories/intelligenceContinuationRepository";
import type { Attempt, Task } from "../../src/domain/intelligence/persistence";
import type { UniversalRunBinding } from "./universalBatchSource";
import { createUniversalContinuationHost } from "./universalContinuationHost";
import {
  sealedUniversalDispatchMarker,
  UNIVERSAL_IMPORT_VERSION,
} from "./universalImport";
import type { UniversalSourceMetadata } from "./universalSourceRead";
import type { RetainedPngReader, RetainedPngTarget } from "./tripCoreV2RetainedPngRead";

type Repository = ReturnType<typeof createIntelligenceContinuationRepository>;
type Stores = Pick<
  Parameters<typeof createUniversalContinuationHost>[0],
  "custody" | "retained"
>;
const hash = async (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
async function readOnly(): Promise<never> {
  throw Error("UNIVERSAL_READ_ONLY");
}

export async function readRetainedPngReceipt(
  snapshot: UniversalSourceMetadata,
  binding: UniversalRunBinding,
  task: Task,
  attempt: Attempt,
  context: AccountRequestContext,
  repository: Repository,
  stores: Stores,
) {
  const { accountId: actor, tripId: trip } = context;
  const representation = snapshot.representations[0],
    pin = binding.inputs[0];
  if (snapshot.representations.length !== 1 || representation.mime !== "image/png")
    throw Error("UNIVERSAL_SOURCE_IMAGE_UNQUALIFIED");
  if (
    binding.inputs.length !== 1 ||
    pin.pdfSource !== undefined ||
    representation.inputId !== pin.id ||
    representation.sourceId !== pin.source_id ||
    representation.representationId !== pin.representation_id ||
    representation.revision !== pin.material_revision ||
    representation.sha256 !== pin.payload_sha256 ||
    representation.byteCount !== pin.byte_count ||
    !representation.pngSource ||
    representation.pngSource.sourceRowRevision !== pin.observed_source_row_revision
  )
    throw Error("UNIVERSAL_SOURCE_IMAGE_UNQUALIFIED");
  const host = createUniversalContinuationHost({
    context,
    batchId: binding.batchId,
    taskId: task.task_id,
    repository,
    ...stores,
    attempt,
    publishedReadOnly: true,
    readSourceManifest: readOnly,
    assertDurableStart: readOnly,
    assertCompletion: readOnly,
  });
  const value = await host.readReceipt(actor, binding.batchId, task.task_id);
  if (!value || value.providerOutcome !== "SETTLED" || value.sourceBindings.length !== 1)
    throw Error("UNIVERSAL_RESULT_UNAVAILABLE");
  const resultPin = value.sourceBindings[0];
  if (
    resultPin.alias !== "S0" ||
    resultPin.mime !== "image/png" ||
    resultPin.status !== "READY" ||
    resultPin.inputId !== pin.id ||
    resultPin.sourceId !== pin.source_id ||
    resultPin.representationId !== pin.representation_id ||
    resultPin.revision !== pin.material_revision ||
    resultPin.originalSha256 !== pin.payload_sha256 ||
    resultPin.submittedSha256 !== pin.payload_sha256 ||
    resultPin.pdfSource
  )
    throw Error("UNIVERSAL_SOURCE_BINDING_INVALID");
  const requestSHA = await hash(
    Buffer.from(
      JSON.stringify({
        version: UNIVERSAL_IMPORT_VERSION,
        actorId: actor,
        accountId: actor,
        tripId: trip,
        batchId: binding.batchId,
        bindings: value.sourceBindings,
      }),
    ),
  );
  const marker = Buffer.from(JSON.stringify(sealedUniversalDispatchMarker(value)));
  if (
    requestSHA !== attempt.request_sha256 ||
    (await hash(marker)) !== attempt.request_material_sha256
  )
    throw Error("UNIVERSAL_TASK_CHANGED");
  // Exact expected length is derived from the sealed marker and independently checked by custody.
  const stored = await stores.custody.read({
    accountId: actor,
    reference: attempt.request_material_reference!,
    sha256: attempt.request_material_sha256!,
    byteCount: marker.length,
  });
  if (
    !Buffer.from(stored).equals(marker) ||
    (await hash(stored)) !== attempt.request_material_sha256
  )
    throw Error("UNIVERSAL_RECEIPT_INTEGRITY");
  return value;
}

export function createRetainedPngReader(
  target: RetainedPngTarget,
  db: ContinuationDatabase,
  stores: Stores,
  readOriginal: (
    target: RetainedPngTarget,
    assertCurrent: () => Promise<void>,
  ) => Promise<Uint8Array>,
): RetainedPngReader {
  return {
    target,
    async read({ binding, withRetainedMetadata, recheck }) {
      const context = await captureAccountRequestContext(
        target.tripId,
        async () => target.accountId,
      );
      let expected: string | undefined;
      const repo = createIntelligenceContinuationRepository(db, {
        getAccountId: async () => target.accountId,
        now: () => new Date().toISOString(),
        sha256: hash,
        async validateAdmission(task) {
          if (expected !== undefined && JSON.stringify(task) !== expected)
            throw Error("UNIVERSAL_PUBLICATION_CHANGED");
        },
        validateAttemptAdmission: readOnly,
        eligibleWait: readOnly,
        verifyRecovery: readOnly,
      });
      const before = await repo.snapshot(context, target.taskId);
      const { task, attempts } = before;
      const attempt = attempts[0];
      if (
        task.account_id !== target.accountId ||
        task.trip_id !== target.tripId ||
        task.import_id !== target.batchId ||
        task.run_id !== binding.runId ||
        task.manifest_sha256 !== binding.submissionSha256 ||
        task.expected_run_generation !== binding.generation ||
        task.work_disposition !== "PUBLISHED" ||
        attempts.length !== 1 ||
        task.current_attempt_id !== attempt.attempt_id ||
        task.publication_fence !== attempt.task_publication_fence ||
        !task.publication_id ||
        !task.publication_sha256 ||
        task.publication_sha256 !== attempt.publication_sha256 ||
        attempt.execution_observation !== "TERMINAL" ||
        !["SUCCEEDED", "PARTIAL"].includes(attempt.execution_outcome ?? "") ||
        attempt.result_install_disposition !== "INSTALLED"
      )
        throw Error("UNIVERSAL_RESULT_UNAVAILABLE");
      expected = JSON.stringify(task);
      const bytes = await withRetainedMetadata(task, async (snapshot) => {
        await readRetainedPngReceipt(
          snapshot,
          binding,
          task,
          attempt,
          context,
          repo,
          stores,
        );
        const current = async () => {
          await recheck();
          await repo.authorizeResultDisclosure(context, attempt);
        };
        await current();
        const bytes = await readOriginal(target, current);
        if (
          bytes.byteLength !== target.byteCount ||
          (await hash(bytes)) !== target.sha256
        )
          throw Error("UNIVERSAL_SOURCE_IMAGE_UNQUALIFIED");
        return bytes;
      });
      const after = await repo.snapshot(context, target.taskId);
      if (JSON.stringify(after) !== JSON.stringify(before))
        throw Error("UNIVERSAL_PUBLICATION_CHANGED");
      await repo.authorizeResultDisclosure(context, attempt);
      return bytes;
    },
  };
}
