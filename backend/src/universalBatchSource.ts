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
export const universalRunBindingSchema = z.strictObject({
  actorId: uuid,
  tripId: uuid,
  batchId: uuid,
  submissionSha256: digest,
  runId: uuid,
  taskId: uuid,
  generation: z.number().int().positive().safe(),
  createdAt: z.iso.datetime({ offset: true }),
  inputs: universalBatchInputsSchema.shape.inputs,
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
// Backend command identities are proposals, not Source proof. Owning SQL validates
// current permission/pins and persists Run/Task binding; GET never prepares it.
export function createUniversalBatchSource(deps: {
  connection: CorePgConnection;
  enabled?: boolean;
  authorize(actor: string, trip: string): Promise<void>;
}) {
  async function current(actor: string, trip: string) {
    uuid.parse(actor);
    uuid.parse(trip);
    if (deps.enabled !== true) throw Error("UNIVERSAL_CONTINUOUS_CLOSED");
    await deps.authorize(actor, trip);
  }
  async function lookup(actor: string, trip: string, batch: string) {
    uuid.parse(batch);
    await current(actor, trip);
    const raw = await universalPgTransaction(
      deps.connection,
      async (lease) =>
        (
          await lease.query(
            "SELECT public.trip_source_find_sustained_universal_binding($1::uuid,$2::uuid,$3::uuid) AS binding",
            [actor, trip, batch],
          )
        ).rows[0]?.binding,
    );
    await current(actor, trip);
    if (raw === null) return null;
    const b = universalRunBindingSchema.parse(raw);
    if (b.actorId !== actor || b.tripId !== trip || b.batchId !== batch)
      throw Error("UNIVERSAL_BINDING_SCOPE");
    return b;
  }
  return {
    lookup,
    async prepare(actor: string, trip: string, raw: unknown) {
      await current(actor, trip);
      const q = universalBatchInputsSchema.parse(raw),
        prior = await lookup(actor, trip, q.batchId);
      const same = (b: UniversalRunBinding) => {
        const order = (v: typeof q.inputs) =>
          [...v].sort((a, b) => a.id.localeCompare(b.id));
        if (
          b.submissionSha256 !== q.submissionSha256 ||
          canonicalEventJson(order(b.inputs) as Json) !==
            canonicalEventJson(order(q.inputs) as Json)
        )
          throw Error("OPERATION_KEY_REUSED");
        return b;
      };
      if (prior) return same(prior);
      const runId = universalBatchIdentity(actor, trip, q.batchId, "run"),
        taskId = universalBatchIdentity(actor, trip, q.batchId, "task");
      await universalPgTransaction(deps.connection, async (lease) =>
        lease.query(
          "SELECT public.trip_source_begin_sustained_universal_inputs($1::uuid,$2::uuid,$3) AS run",
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
