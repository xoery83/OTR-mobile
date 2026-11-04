import { universalPdfSourceProvenanceSchema } from "../../src/data/api/universalImportContracts";
import { PDF_V2_OPTIONS_SHA } from "./sourcePdfV2Contracts";
import { createHash } from "node:crypto";
import { z } from "zod";
import { canonicalEventJson, type Json } from "../../src/domain/trip/eventIntentJson";
import { universalPgTransaction } from "./universalPg";
import type { CorePgConnection } from "./tripCoreV2PgStorage";
const uuid = z.uuid().refine((v) => v === v.toLowerCase()),
  digest = z.string().regex(/^[a-f0-9]{64}$/);
export const universalBatchInputsSchema = z
  .strictObject({
    batchId: uuid,
    submissionSha256: digest,
    inputs: z
      .array(
        z.strictObject({
          id: uuid,
          source_id: uuid,
          material_revision: z.number().int().positive().safe(),
          representation_id: uuid,
          payload_sha256: digest,
          byte_count: z.number().int().positive().max(4194304),
          observed_source_row_revision: z.number().int().positive().safe(),
          historical_selection: z.literal(false),
        }),
      )
      .min(1)
      .max(64),
  })
  .superRefine((v, c) => {
    for (const key of ["id", "representation_id"] as const)
      if (new Set(v.inputs.map((i) => i[key])).size !== v.inputs.length)
        c.addIssue({ code: "custom", message: "DUPLICATE_SOURCE_PIN" });
  });
export const universalRunBindingSchema = z
  .strictObject({
    actorId: uuid,
    tripId: uuid,
    batchId: uuid,
    submissionSha256: digest,
    runId: uuid,
    taskId: uuid,
    generation: z.number().int().positive().safe(),
    createdAt: z.iso.datetime({ offset: true }),
    // Owning readback only. Capture submissions cannot declare derivative proof.
    inputs: z
      .array(
        universalBatchInputsSchema.shape.inputs.element
          .extend({
            pdfSource: universalPdfSourceProvenanceSchema.optional(),
          })
          .superRefine((input, c) => {
            if (
              input.pdfSource &&
              (input.pdfSource.original.representationId === input.representation_id ||
                input.pdfSource.transformOptionsSha256 !== PDF_V2_OPTIONS_SHA ||
                input.byte_count > 262144)
            )
              c.addIssue({ code: "custom", message: "INVALID_PDF_RUN_INPUT" });
          }),
      )
      .min(1)
      .max(64),
  })
  .superRefine((binding, c) => {
    for (const key of ["id", "representation_id"] as const)
      if (new Set(binding.inputs.map((i) => i[key])).size !== binding.inputs.length)
        c.addIssue({ code: "custom", message: "DUPLICATE_SOURCE_PIN" });
  });
export type UniversalRunBinding = z.infer<typeof universalRunBindingSchema>;
export function universalBatchIdentity(
  actor: string,
  trip: string,
  batch: string,
  purpose: string,
) {
  [actor, trip, batch].forEach((v) => uuid.parse(v));
  const bytes = createHash("sha256")
    .update(
      JSON.stringify(["otr.universal.batch-identity/1", actor, trip, batch, purpose]),
    )
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6] & 15) | 128;
  bytes[8] = (bytes[8] & 63) | 128;
  const h = bytes.toString("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
// Explicit selection metadata is not Source proof or paid admission.
export function universalProviderBatchContext(actor: string, trip: string, raw: unknown) {
  const request = universalBatchInputsSchema.parse(raw);
  return {
    actorId: actor,
    tripId: trip,
    ...request,
    inputs: [...request.inputs].sort((a, b) => a.id.localeCompare(b.id)),
    runId: universalBatchIdentity(actor, trip, request.batchId, "run"),
    taskId: universalBatchIdentity(actor, trip, request.batchId, "task"),
  };
}
export function universalProviderOwningContext(raw: UniversalRunBinding) {
  const binding = universalRunBindingSchema.parse(raw);
  const context = universalProviderBatchContext(binding.actorId, binding.tripId, {
    batchId: binding.batchId,
    submissionSha256: binding.submissionSha256,
    inputs: binding.inputs.map(({ pdfSource, ...pin }) =>
      pdfSource
        ? {
            ...pin,
            representation_id: pdfSource.original.representationId,
            payload_sha256: pdfSource.original.sha256,
            byte_count: pdfSource.original.byteCount,
          }
        : pin,
    ),
  });
  if (context.runId !== binding.runId || context.taskId !== binding.taskId)
    throw Error("UNIVERSAL_BINDING_SCOPE");
  return { ...context, owningBinding: binding };
}
export type UniversalProviderBatchContext = ReturnType<
  typeof universalProviderBatchContext
> & {
  owningBinding?: UniversalRunBinding;
};
// Backend command identities are proposals, not Source proof. Owning SQL validates
// current permission/pins and persists Run/Task binding; GET never prepares it.
export function createUniversalBatchSource(deps: {
  connection: CorePgConnection;
  enabled?: boolean;
  // Trusted server configuration only; HTTP input cannot choose Source authority.
  finiteBatch?: ReturnType<typeof universalProviderBatchContext>;
  authorize(actor: string, trip: string): Promise<void>;
}) {
  const finite = deps.finiteBatch
    ? universalProviderBatchContext(deps.finiteBatch.actorId, deps.finiteBatch.tripId, {
        batchId: deps.finiteBatch.batchId,
        submissionSha256: deps.finiteBatch.submissionSha256,
        inputs: deps.finiteBatch.inputs,
      })
    : undefined;
  if (
    finite &&
    (finite.runId !== deps.finiteBatch!.runId ||
      finite.taskId !== deps.finiteBatch!.taskId)
  )
    throw Error("UNIVERSAL_BINDING_SCOPE");
  function finiteMatch(context: ReturnType<typeof universalProviderBatchContext>) {
    if (
      finite &&
      canonicalEventJson(context as Json) !== canonicalEventJson(finite as Json)
    )
      throw Error("UNIVERSAL_BINDING_SCOPE");
  }
  async function current(actor: string, trip: string) {
    uuid.parse(actor);
    uuid.parse(trip);
    if (deps.enabled !== true) throw Error("UNIVERSAL_CONTINUOUS_CLOSED");
    if (finite && (actor !== finite.actorId || trip !== finite.tripId))
      throw Error("UNIVERSAL_BINDING_SCOPE");
    await deps.authorize(actor, trip);
  }
  async function lookup(actor: string, trip: string, batch: string) {
    uuid.parse(batch);
    await current(actor, trip);
    if (finite && batch !== finite.batchId) throw Error("UNIVERSAL_BINDING_SCOPE");
    const raw = await universalPgTransaction(
      deps.connection,
      async (lease) =>
        (
          await lease.query(
            finite
              ? "SELECT public.trip_source_find_finite_universal_binding($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6,$7::jsonb) AS binding"
              : "SELECT public.trip_source_find_sustained_universal_binding($1::uuid,$2::uuid,$3::uuid) AS binding",
            finite
              ? [
                  actor,
                  trip,
                  batch,
                  finite.taskId,
                  finite.runId,
                  finite.submissionSha256,
                  canonicalEventJson(finite.inputs as Json),
                ]
              : [actor, trip, batch],
          )
        ).rows[0]?.binding,
    );
    await current(actor, trip);
    if (raw === null) return null;
    const b = universalRunBindingSchema.parse(raw);
    if (b.actorId !== actor || b.tripId !== trip || b.batchId !== batch)
      throw Error("UNIVERSAL_BINDING_SCOPE");
    if (finite) {
      const { owningBinding: _, ...original } = universalProviderOwningContext(b);
      finiteMatch(original);
    }
    return b;
  }
  return {
    lookup,
    async prepare(actor: string, trip: string, raw: unknown) {
      await current(actor, trip);
      const q = universalBatchInputsSchema.parse(raw);
      finiteMatch(universalProviderBatchContext(actor, trip, q));
      const prior = await lookup(actor, trip, q.batchId);
      const same = (b: UniversalRunBinding) => {
        const order = (v: typeof q.inputs) =>
          [...v].sort((a, b) => a.id.localeCompare(b.id));
        if (
          b.submissionSha256 !== q.submissionSha256 ||
          canonicalEventJson(
            order(
              b.inputs.map(({ pdfSource, ...input }) =>
                pdfSource
                  ? {
                      ...input,
                      representation_id: pdfSource.original.representationId,
                      payload_sha256: pdfSource.original.sha256,
                      byte_count: pdfSource.original.byteCount,
                    }
                  : input,
              ),
            ) as Json,
          ) !== canonicalEventJson(order(q.inputs) as Json)
        )
          throw Error("OPERATION_KEY_REUSED");
        return b;
      };
      if (prior) return same(prior);
      const runId = universalBatchIdentity(actor, trip, q.batchId, "run"),
        taskId = universalBatchIdentity(actor, trip, q.batchId, "task");
      await universalPgTransaction(deps.connection, async (lease) =>
        lease.query(
          finite
            ? "SELECT public.trip_source_begin_finite_universal_inputs($1::uuid,$2::uuid,$3) AS run"
            : "SELECT public.trip_source_begin_sustained_universal_inputs($1::uuid,$2::uuid,$3) AS run",
          [actor, trip, canonicalEventJson({ ...q, runId, taskId } as Json)],
        ),
      );
      await current(actor, trip);
      const found = await lookup(actor, trip, q.batchId);
      if (!found || found.runId !== runId || found.taskId !== taskId)
        throw Error("OWNING_RUN_READBACK_UNAVAILABLE");
      return same(found);
    },
  };
}
