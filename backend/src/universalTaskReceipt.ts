import { universalPgTransaction } from "./universalPg";
import { z } from "zod";
import type { Task, Attempt } from "../../src/domain/intelligence/persistence";
import type { CorePgConnection } from "./tripCoreV2PgStorage";
import {
  callCorrelationSchema,
  verifyCallCorrelation,
  persistenceDigest,
} from "./externalIntegrationPersistence";
import type { UniversalResult } from "./universalImport";
import {
  registeredUniversalModelProfile,
  bindUniversalModelTask,
} from "./universalModelProfile";

const receipt = z.object({
  call: callCorrelationSchema
    .extend({
      trip_id: z.uuid(),
      import_id: z.uuid(),
      dispatch_state: z.string(),
      execution_certainty: z.string(),
    })
    .strip(),
  admission: z.object({
    request_snapshot: z.unknown(),
    request_sha256: z.string(),
    profile_snapshot: z.unknown(),
    profile_sha256: z.string(),
  }),
  hasStart: z.boolean(),
  completion: z.record(z.string(), z.unknown()).nullable(),
});
// Concrete checks on the accepted persistence authority. Missing Universal SQL/profile
// returns CLOSED; it never treats a local DTO or a Flight reservation as admission.
export function createUniversalTaskReceiptChecks(connection: CorePgConnection) {
  async function read(a: Readonly<Attempt>, t: Readonly<Task>) {
    if (!a.usage_correlation_id) throw new Error("UNIVERSAL_TASK_RECEIPT_UNAVAILABLE");
    const raw = await universalPgTransaction(
      connection,
      async (lease) => {
        const result = await lease.query(
          "SELECT public.model_task_read_universal_receipt($1::uuid,$2::uuid,$3::uuid,$4::uuid) AS receipt",
          [a.account_id, a.task_id, a.attempt_id, a.usage_correlation_id],
        );
        return result.rows[0]?.receipt;
      },
      true,
    );
    const r = receipt.parse(raw);
    verifyCallCorrelation(
      a,
      callCorrelationSchema.parse(
        Object.fromEntries(
          Object.keys(callCorrelationSchema.shape).map((key) => [
            key,
            r.call[key as keyof typeof r.call],
          ]),
        ),
      ),
    );
    const binding = bindUniversalModelTask(
      r.admission.request_snapshot as Parameters<typeof bindUniversalModelTask>[0],
    );
    if (
      !r.hasStart ||
      r.call.trip_id !== t.trip_id ||
      r.call.import_id !== t.import_id ||
      r.call.publication_fence !== t.publication_fence ||
      r.call.input_sha256 !== t.input_sha256 ||
      r.call.schema_sha256 !== registeredUniversalModelProfile.output_schema_sha256 ||
      r.admission.request_sha256 !== binding.request_sha256 ||
      r.admission.profile_sha256 !== persistenceDigest(registeredUniversalModelProfile) ||
      persistenceDigest(r.admission.profile_snapshot) !== binding.profile_sha256 ||
      binding.request.task_id !== t.task_id ||
      binding.request.logical_request_id !== t.logical_request_id ||
      binding.request.logical_idempotency_key !== t.logical_idempotency_key ||
      binding.request.policy_sha256 !== t.policy_sha256 ||
      binding.request.input.reference !== a.request_material_reference ||
      binding.request.input.sha256 !== a.request_material_sha256
    )
      throw new Error("UNIVERSAL_TASK_RECEIPT_BINDING_INVALID");
    return r;
  }
  return {
    async assertDurableStart(a: Readonly<Attempt>, t: Readonly<Task>) {
      const r = await read(a, t);
      if (
        r.call.dispatch_state !== "MAY_HAVE_STARTED" ||
        r.call.execution_certainty !== "RUNNING" ||
        r.completion
      )
        throw new Error("UNIVERSAL_DURABLE_START_UNAVAILABLE");
    },
    async assertCompletion(
      result: Readonly<UniversalResult>,
      a: Readonly<Attempt>,
      t: Readonly<Task>,
    ) {
      const r = await read(a, t),
        c = r.completion;
      if (
        result.providerOutcome !== "SETTLED" ||
        !result.providerReceipt?.responseSha256 ||
        r.call.dispatch_state !== "TERMINAL" ||
        r.call.execution_certainty !== "TERMINAL" ||
        !c ||
        c.status !== "SUCCEEDED" ||
        (c.outcome !== null && c.outcome !== "SUCCEEDED") ||
        c.response_sha256 !== result.providerReceipt.responseSha256 ||
        String(c.cost_nanos) !== result.providerReceipt.costNanos
      )
        throw new Error("UNIVERSAL_COMPLETION_UNAVAILABLE");
    },
  };
}
