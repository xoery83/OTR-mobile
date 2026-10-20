import { z } from "zod";
import {
  executionReportSchema,
  type Attempt,
  type ExecutionReport,
  type ContinuationExecutor,
  type ContinuationRouter,
  type RouterRequest,
} from "@/domain/intelligence/persistence";
import {
  verifyOutboundAdmission,
  outboundDigest,
  routeOutbound,
  readOutboundSnapshots,
  createOutboundAdmission,
  continuationRouteReason,
  type OutboundAdmission,
  type OutboundHash,
  type OutboundReason,
} from "@/domain/intelligence/outboundRouting";
import {
  assertAccountRequestContext,
  type AccountRequestContext,
} from "../auth/accountRequestContext";
import type { createIntelligenceContinuationRepository } from "../repositories/intelligenceContinuationRepository";
import type { createIntelligenceContinuationRuntime } from "../sync/intelligenceContinuationWakeWorker";
export type OutboundServer83 = {
  reserve(admission: Readonly<OutboundAdmission>): Promise<void>;
  assertStart(admission: Readonly<OutboundAdmission>): Promise<void>;
  freshEligibility(admission: Readonly<OutboundAdmission>): Promise<void>;
  observeDispatchClosed(admission: Readonly<OutboundAdmission>): Promise<void>;
};
const units = z
  .record(
    z.string().regex(/^[A-Za-z0-9._:-]{1,128}$/),
    z.number().int().nonnegative().safe(),
  )
  .refine((v) => Object.keys(v).length <= 16);
export const syntheticObservationSchema = z.strictObject({
  evidence: z.literal("CLOSED_SYNTHETIC_EXECUTION_ACCEPTANCE"),
  disposition: z.enum([
    "DEFINITELY_NOT_DISPATCHED",
    "MAY_HAVE_STARTED",
    "SUCCESS",
    "SAFE_FAILURE",
    "TIMEOUT",
    "RESPONSE_LOST",
    "CANCELED_TERMINAL",
  ]),
  report: executionReportSchema,
  measurement_mode: z.enum(["NONE", "CUMULATIVE", "DELTA"]),
  other_units: units,
  // Synthetic costs are acceptance observations, never production usage or customer cost.
  synthetic_cost: z.strictObject({
    nanos: z
      .string()
      .regex(/^[0-9]{1,60}$/)
      .nullable(),
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .nullable(),
    quality: z.enum(["UNKNOWN", "ESTIMATED", "ACTUAL_REPORTED"]),
  }),
});
export type SyntheticObservation = z.infer<typeof syntheticObservationSchema>;
type Repo = ReturnType<typeof createIntelligenceContinuationRepository>;
type Runtime = ReturnType<typeof createIntelligenceContinuationRuntime>;
// No default construction, production factory, provider implementation or meter ledger.
export function createClosedOutboundHarness(deps: {
  mode: "TEST_ONLY";
  repo: Repo;
  runtime: Runtime;
  server: OutboundServer83;
  hash: OutboundHash;
  getAccountId(): Promise<string>;
  loadAdmission(attempt: Readonly<Attempt>): Promise<OutboundAdmission>;
  synthetic: {
    proveUndispatched(admission: Readonly<OutboundAdmission>): Promise<boolean>;
    begin(admission: Readonly<OutboundAdmission>): Promise<void>;
    retain(
      admission: Readonly<OutboundAdmission>,
      observation: SyntheticObservation,
    ): Promise<void>;
    read(admission: Readonly<OutboundAdmission>): Promise<SyntheticObservation | null>;
    appendMeter(
      admission: Readonly<OutboundAdmission>,
      observation: SyntheticObservation,
    ): Promise<void>;
  };
  adapter: {
    kind: "INJECTED_DETERMINISTIC_FAKE";
    execute(admission: Readonly<OutboundAdmission>): Promise<SyntheticObservation>;
  };
}) {
  if (deps.mode !== "TEST_ONLY" || deps.adapter.kind !== "INJECTED_DETERMINISTIC_FAKE")
    throw new Error("OUTBOUND_HARNESS_CLOSED");
  const admission = async (a: Attempt) => {
    const e = await verifyOutboundAdmission(a, await deps.loadAdmission(a), deps.hash);
    if (e.pins.snapshot.environment !== "TEST")
      throw new Error("OUTBOUND_TEST_ENVIRONMENT_REQUIRED");
    return e;
  };
  async function local(
    context: AccountRequestContext,
    a: Attempt,
    e: Readonly<OutboundAdmission>,
  ) {
    await assertAccountRequestContext(context, deps.getAccountId);
    const snap = await deps.repo.snapshot(context, a.task_id),
      t = snap.task;
    if (
      t.publication_fence !== a.task_publication_fence ||
      t.cancellation_disposition !== "NONE" ||
      ["CANCELED", "STALE", "UNKNOWN", "FAILED"].includes(t.work_disposition) ||
      (!a.shadow && t.current_attempt_id !== a.attempt_id) ||
      t.input_sha256 !== e.input_sha256 ||
      t.schema_sha256 !== e.schema_sha256 ||
      t.trip_id !== e.trip_id ||
      t.import_id !== e.import_id ||
      t.policy_sha256 !== e.pins.policy_sha256
    )
      throw new Error("OUTBOUND_LOCAL_FENCE");
  }
  function verifiedObservation(a: Attempt, raw: SyntheticObservation) {
    const parsed = syntheticObservationSchema.safeParse(structuredClone(raw));
    if (!parsed.success) throw new Error("OUTBOUND_OBSERVATION_INVALID");
    const o = parsed.data,
      r = o.report;
    for (const k of [
      "account_id",
      "task_id",
      "attempt_id",
      "request_id",
      "request_sha256",
      "usage_correlation_id",
    ] as const)
      if (r[k] !== a[k]) throw new Error("OUTBOUND_RESULT_IDENTITY");
    const terminal = [
      "SUCCESS",
      "SAFE_FAILURE",
      "DEFINITELY_NOT_DISPATCHED",
      "CANCELED_TERMINAL",
    ].includes(o.disposition);
    if (
      terminal !== (r.execution_observation === "TERMINAL") ||
      (o.disposition === "SUCCESS" &&
        !["SUCCEEDED", "PARTIAL"].includes(r.execution_outcome ?? "")) ||
      (["SAFE_FAILURE", "DEFINITELY_NOT_DISPATCHED"].includes(o.disposition) &&
        r.execution_outcome !== "FAILED") ||
      (o.disposition === "CANCELED_TERMINAL" && r.execution_outcome !== "CANCELED") ||
      (o.synthetic_cost.nanos === null) !== (o.synthetic_cost.quality === "UNKNOWN")
    )
      throw new Error("OUTBOUND_OBSERVATION_INVALID");
    return o;
  }
  async function metered(
    e: Readonly<OutboundAdmission>,
    o: SyntheticObservation,
  ): Promise<ExecutionReport> {
    let metering: ExecutionReport["metering_disposition"] = "COMPLETION_PENDING";
    try {
      await deps.synthetic.appendMeter(e, o);
      metering = "COMPLETE";
    } catch {
      /* Retained result and usage remain recoverable; never execute to fix metering. */
    }
    return { ...o.report, metering_disposition: metering };
  }
  return {
    executor(context: AccountRequestContext): ContinuationExecutor {
      return {
        async proveUndispatched(a) {
          return deps.synthetic.proveUndispatched(await admission(a));
        },
        async prepareUsage(a) {
          const e = await admission(a);
          if (e.pins.snapshot.environment !== "TEST")
            throw new Error("OUTBOUND_TEST_ENVIRONMENT_REQUIRED");
          await local(context, a, e);
          await deps.server.reserve(e);
          await deps.server.assertStart(e);
          await assertAccountRequestContext(context, deps.getAccountId);
          return "START_DURABLE";
        },
        async execute(a) {
          const e = await admission(a);
          await local(context, a, e);
          await deps.server.assertStart(e);
          await deps.server.freshEligibility(e);
          await deps.server.observeDispatchClosed(e);
          // Catch disable/kill/config changes during the deliberately rejected real dispatch.
          await deps.server.freshEligibility(e);
          await local(context, a, e);
          await deps.server.freshEligibility(e);
          await deps.synthetic.begin(e); // Test-only durable synthetic responsibility before fake I/O.
          // All async synthetic/server prerequisites precede the final local CAS.
          await deps.server.assertStart(e);
          await deps.server.freshEligibility(e);
          await admission(a); // Fresh retained identity, not just the earlier envelope.
          let execution!: Promise<SyntheticObservation>;
          let raw: SyntheticObservation;
          try {
            await deps.repo.admitSyntheticExecution(context, a, () => {
              execution = deps.adapter.execute(e);
            });
            raw = await execution;
          } catch {
            // Outside all Account gates and transactions.
            throw new Error("OUTBOUND_RECOVERY_REQUIRED");
          }
          const o = verifiedObservation(a, raw);
          await deps.synthetic.retain(e, o); // Must precede meter and local publication.
          return metered(e, o);
        },
      };
    },
    async recoverStart(context: AccountRequestContext, id: string) {
      const a = await deps.repo.readAttempt(context, id),
        e = await admission(a);
      if (a.execution_observation !== "NOT_STARTED" || a.response_sha256)
        throw new Error("OUTBOUND_RECOVERY_REQUIRED");
      await deps.server.assertStart(e);
      if (!(await deps.synthetic.proveUndispatched(e)))
        throw new Error("OUTBOUND_RECOVERY_REQUIRED");
      await local(context, a, e);
      return deps.repo.observeAttempt(context, id, a.row_revision, {
        execution_observation: a.execution_observation,
        execution_outcome: a.execution_outcome,
        metering_disposition: "START_DURABLE",
        response_material_reference: a.response_material_reference,
        response_material_sha256: a.response_material_sha256,
        response_sha256: a.response_sha256,
        reported_usage_summary: a.reported_usage_summary,
      });
    },
    async recover(context: AccountRequestContext, id: string) {
      const a = await deps.repo.readAttempt(context, id),
        e = await admission(a);
      await deps.server.assertStart(e);
      const retained = await deps.synthetic.read(e);
      if (!retained) return { reason: "RECOVERY_REQUIRED" as OutboundReason };
      const o = verifiedObservation(a, retained);
      const report = await metered(e, o);
      return deps.runtime.attach(context, {
        ...report,
        recovery_sha256: await outboundDigest(deps.hash, o),
      });
    },
    async install(
      context: AccountRequestContext,
      id: string,
      publicationId: string,
      publicationSha256: string,
      install: Parameters<Repo["installResult"]>[5],
    ) {
      const a = await deps.repo.readAttempt(context, id),
        e = await admission(a);
      const retained = await deps.synthetic.read(e);
      if (
        !retained ||
        verifiedObservation(a, retained).report.response_sha256 !== a.response_sha256
      )
        throw new Error("OUTBOUND_RESULT_CUSTODY");
      await deps.server.assertStart(e);
      // C2 revalidates local Account/Trip/material/Run/Candidate/Event and installation replay atomically.
      return deps.repo.installResult(
        context,
        id,
        a.row_revision,
        publicationId,
        publicationSha256,
        install,
      );
    },
  };
}

// Decision/admission adapter only; C2 wake still cannot invoke the executor.
export function createOutboundContinuationRouter(deps: {
  environment: "TEST" | "DEV" | "PRODUCTION";
  hash: OutboundHash;
  complexity(request: RouterRequest): number;
  snapshots(request: RouterRequest): Promise<unknown>;
  seed(request: RouterRequest): Promise<Attempt>;
  predecessor(request: RouterRequest): Promise<Attempt | null>;
  retainAdmission(admission: OutboundAdmission): Promise<void>;
}): ContinuationRouter {
  return async (request) => {
    const route = await routeOutbound(
      { ...request, environment: deps.environment, complexity: deps.complexity(request) },
      readOutboundSnapshots(await deps.snapshots(request)),
      deps.hash,
    );
    if (route.status !== "ELIGIBLE") return continuationRouteReason(route);
    const admission = await createOutboundAdmission({
      request,
      pins: route.pins,
      seed: await deps.seed(request),
      predecessor: await deps.predecessor(request),
      shadowOf: null,
      hash: deps.hash,
    });
    await deps.retainAdmission(admission); // Existing request-material custody seam, outside the local apply gate.
    return { status: "ELIGIBLE", attempt: admission.attempt };
  };
}
