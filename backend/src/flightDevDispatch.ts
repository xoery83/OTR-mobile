import { z } from "zod";
import { canonicalEventJson, type Json } from "../../src/domain/trip/eventIntentJson";
import {
  commandDigest,
  persistenceDigest,
  type createClosedPersistenceGateway,
  type PrivateMaterialCustody,
} from "./externalIntegrationPersistence";
import {
  prepareDeepSeekFlight,
  type FlightSecretResolver,
  type FlightFixtureTransport,
  type FlightProviderResult,
} from "./deepSeekFlight";
import {
  minimizeFlightRemoteText,
  flightRemoteExecutionPins,
  rebindFlightRemoteOutput,
  type FlightRemoteEnvelope,
} from "../../src/domain/intelligence/remoteFlightText";
import {
  interpretationRequestSchema,
  type InterpretationRequest,
} from "../../src/domain/intelligence/interpretation";
import {
  attemptSchema,
  executionReportSchema,
  type Attempt,
  type ContinuationExecutor,
  type ExecutionReport,
} from "../../src/domain/intelligence/persistence";
import {
  assertAccountRequestGeneration,
  type AccountRequestContext,
} from "../../src/data/auth/accountRequestContext";
import type { createIntelligenceContinuationRepository } from "../../src/data/repositories/intelligenceContinuationRepository";
import type { ImportHash } from "../../src/domain/trip/flightImportReview";

export function flightRemoteRequestMaterial(
  request: InterpretationRequest,
  envelope: FlightRemoteEnvelope,
) {
  const bytes = new TextEncoder().encode(
    canonicalEventJson({ version: 1, request, envelope } as unknown as Json),
  );
  if (bytes.length > 4194304) throw new Error("POLICY_BLOCKED");
  return bytes;
}
export async function retainFlightRemoteRequest(
  custody: PrivateMaterialCustody,
  request: InterpretationRequest,
  envelope: FlightRemoteEnvelope,
  reference: string,
  hash: ImportHash,
) {
  if (
    persistenceDigest(await minimizeFlightRemoteText(request, hash)) !==
    persistenceDigest(envelope)
  )
    throw new Error("POLICY_BLOCKED");
  const bytes = flightRemoteRequestMaterial(request, envelope),
    sha256 = await hash(bytes);
  const pin = await custody.put({
    accountId: request.binding.account_id,
    reservationId: reference,
    sha256,
    byteCount: bytes.length,
    bytes,
  });
  return { request_material_reference: pin.reference, request_material_sha256: sha256 };
}

export function flightReservationCommand(
  a: Attempt,
  e: FlightRemoteEnvelope,
  scope: {
    integration_version: number;
    grant_revision: number;
    trip_id: string;
    import_id: string;
    currency: string;
  },
) {
  if (
    a.descriptor_snapshot.version !== 2 ||
    e.binding.descriptor.boundary_version !== "otr-flight-remote-v2"
  )
    throw new Error("POLICY_BLOCKED");
  const p = e.binding.descriptor.remote;
  const row = {
    call_id: p.call_id,
    integration_id: a.integration_id,
    environment: "DEV",
    provider_config_id: p.provider_config_id,
    provider_id: "DeepSeek",
    model_id: "deepseek-flash",
    model_version: "DeepSeek-V4.1-Flash",
    adapter_version: p.adapter_version,
    config_version: scope.integration_version,
    configuration_sha256: a.configuration_sha256,
    account_id: a.account_id,
    user_id: a.account_id,
    billing_subject_id: null,
    trip_id: scope.trip_id,
    import_id: scope.import_id,
    task_id: a.task_id,
    attempt_id: a.attempt_id,
    fallback_chain_id: a.fallback_chain_id,
    shadow_of_call_id: null,
    evaluation_reference: null,
    attempt_sequence: a.attempt_sequence,
    invocation_id: null,
    request_id: a.request_id,
    idempotency_key: a.idempotency_key,
    request_sha256: a.request_sha256,
    input_sha256: e.binding.input_sha256,
    schema_sha256: p.output_schema_sha256,
    capability: a.descriptor_snapshot.capabilities[0],
    task_class: "FLIGHT_IMPORT_V1",
    call_kind: "OUTBOUND_MODEL",
    shadow: false,
    price_schedule_id: p.price_schedule_id,
    admitted_at: a.created_at,
    admission_sha256: a.request_sha256,
    publication_fence: a.task_publication_fence,
    row_revision: 1,
    dispatch_state: "RESERVED",
    execution_certainty: "NOT_STARTED",
    dispatch_marked_at: null,
    terminal_observed_at: null,
    safe_reason: null,
  };
  const nullable = Object.fromEntries(
    "started_at ended_at latency_ms outcome response_sha256 publication_sha256 input_tokens output_tokens total_tokens cached_input_tokens reasoning_tokens image_units audio_units call_count bytes wall_ms cpu_ms gpu_ms accelerator_ms cost_nanos cost_calculation_version supersedes_observation_id"
      .split(" ")
      .map((k) => [k, null]),
  );
  const start = {
    ...nullable,
    observation_id: p.call_id,
    call_id: p.call_id,
    observation_key: "start",
    observation_version: 1,
    observation_kind: "START",
    measurement_mode: "NONE",
    observed_at: a.created_at,
    received_at: a.created_at,
    status: "STARTED",
    other_units: {},
    provider_extension: {},
    usage_quality: "UNKNOWN",
    unit_quality: {},
    price_schedule_id: p.price_schedule_id,
    currency: scope.currency,
    cost_quality: "UNKNOWN",
    observation_sha256: persistenceDigest({
      domain: "otr-cp15-flight-start-v1",
      call_id: p.call_id,
      request_sha256: a.request_sha256,
      envelope_sha256: e.envelope_sha256,
    }),
  };
  const c = {
    version: 1,
    environment: "DEV",
    request_id: a.request_id,
    account_id: a.account_id,
    integration_id: a.integration_id,
    row,
    start,
    scope_id: p.scope_id,
    scope_revision: p.scope_revision,
    scope_sha256: p.scope_sha256,
    grant_revision: scope.grant_revision,
    input_ceiling: e.input_ceiling,
    output_ceiling: e.output_ceiling,
    execution_pins: flightRemoteExecutionPins(e.binding.descriptor),
    execution_pins_sha256: persistenceDigest(
      flightRemoteExecutionPins(e.binding.descriptor),
    ),
  };
  return { ...c, request_sha256: commandDigest(c) };
}
const ackSchema = z.object({
  call_id: z.uuid(),
  request_sha256: z.string(),
  dispatch_state: z.literal("MAY_HAVE_STARTED"),
  execution_certainty: z.literal("RUNNING"),
  row_revision: z.number().int().positive(),
  account_id: z.uuid(),
  attempt_id: z.uuid(),
  publication_fence: z.number().int().positive(),
});
type Repo = ReturnType<typeof createIntelligenceContinuationRepository>;
// An injected executor on the existing C2 worker seam, never a scheduler or live factory.
export function createFlightDevExecutor(deps: {
  gateway: ReturnType<typeof createClosedPersistenceGateway>;
  repo: Pick<
    Repo,
    "admitExecution" | "readAttempt" | "installResult" | "authorizeResultDisclosure"
  >;
  custody: PrivateMaterialCustody;
  hash: ImportHash;
  id(): string;
  now(): string;
  monotonic(): number;
  resolver: FlightSecretResolver;
  transport: FlightFixtureTransport;
  load(a: Readonly<Attempt>): Promise<{
    request: InterpretationRequest;
    envelope: FlightRemoteEnvelope;
    command: ReturnType<typeof flightReservationCommand>;
    host: unknown;
    signal: AbortSignal;
    deadline: number;
  }>;
  retained: {
    put(
      a: Readonly<Attempt>,
      pin: { reference: string; sha256: string; byteCount: number },
    ): Promise<void>;
    read(
      a: Readonly<Attempt>,
    ): Promise<{ reference: string; sha256: string; byteCount: number } | null>;
  };
  readStart(a: Readonly<Attempt>): Promise<{
    call_id: string;
    request_sha256: string;
    admission_sha256: string;
    start_sha256: string;
    dispatch_state: string;
    start_durable: boolean;
  }>;
  // Owning workflow validates current material/Trip and uses interpretRemoteFlightBatch;
  // returns observations/publication input only, never Event authority.
  interpret(
    request: InterpretationRequest,
    response: Awaited<ReturnType<typeof rebindFlightRemoteOutput>>,
  ): Promise<unknown>;
  appendMeter(
    a: Readonly<Attempt>,
    result: FlightProviderResult,
    report: ExecutionReport,
  ): Promise<void>;
}) {
  async function load(a: Readonly<Attempt>) {
    a = attemptSchema.parse(a);
    const loaded = await deps.load(a);
    const e = {
      ...loaded,
      request: interpretationRequestSchema.parse(structuredClone(loaded.request)),
      envelope: structuredClone(loaded.envelope),
      command: structuredClone(loaded.command),
      host: structuredClone(loaded.host),
    };
    if (
      a.descriptor_snapshot.version !== 2 ||
      a.shadow ||
      e.request.binding.descriptor.boundary_version !== "otr-flight-remote-v2" ||
      e.request.binding.account_id !== a.account_id ||
      e.request.binding.request_id !== a.request_id ||
      a.usage_correlation_id !== e.request.binding.descriptor.remote.call_id ||
      a.attempt_id !== e.request.binding.descriptor.remote.attempt_id ||
      a.request_sha256 !== e.request.binding.descriptor.remote.request_sha256 ||
      persistenceDigest(a.descriptor_snapshot.remote_run) !==
        persistenceDigest(e.request.binding.descriptor) ||
      persistenceDigest(await minimizeFlightRemoteText(e.request, deps.hash)) !==
        persistenceDigest(e.envelope) ||
      commandDigest(e.command) !== e.command.request_sha256 ||
      e.command.row.attempt_id !== a.attempt_id ||
      e.command.row.request_sha256 !== a.request_sha256 ||
      e.command.row.account_id !== a.account_id ||
      e.command.input_ceiling !== e.envelope.input_ceiling ||
      e.command.output_ceiling !== e.envelope.output_ceiling ||
      persistenceDigest(e.command.execution_pins) !==
        persistenceDigest(flightRemoteExecutionPins(e.request.binding.descriptor)) ||
      e.command.execution_pins_sha256 !== persistenceDigest(e.command.execution_pins) ||
      a.policy_admission.policy_sha256 !==
        e.request.binding.descriptor.remote.policy_sha256
    )
      throw new Error("POLICY_BLOCKED");
    const material = flightRemoteRequestMaterial(e.request, e.envelope);
    if (
      !a.request_material_reference ||
      !a.request_material_sha256 ||
      (await deps.hash(material)) !== a.request_material_sha256 ||
      !(await deps.custody.verify({
        accountId: a.account_id,
        reference: a.request_material_reference,
        sha256: a.request_material_sha256,
        byteCount: material.length,
      }))
    )
      throw new Error("POLICY_BLOCKED");
    return e;
  }
  async function start(a: Readonly<Attempt>, e: Awaited<ReturnType<typeof load>>) {
    const h = await deps.readStart(a);
    if (
      !h.start_durable ||
      h.call_id !== a.usage_correlation_id ||
      h.request_sha256 !== a.request_sha256 ||
      h.admission_sha256 !== e.command.request_sha256 ||
      h.start_sha256 !== e.command.start.observation_sha256
    )
      throw new Error("POLICY_BLOCKED");
    return h;
  }
  async function retain(
    a: Readonly<Attempt>,
    result: FlightProviderResult,
    interpretation: unknown | null,
  ): Promise<ExecutionReport> {
    const base = {
      account_id: a.account_id,
      task_id: a.task_id,
      attempt_id: a.attempt_id,
      request_id: a.request_id,
      request_sha256: a.request_sha256,
      usage_correlation_id: a.usage_correlation_id,
      execution_observation: result.status === "UNKNOWN" ? "UNKNOWN" : "TERMINAL",
      execution_outcome:
        result.status === "UNKNOWN"
          ? null
          : result.status === "SUCCEEDED"
            ? interpretation &&
              typeof interpretation === "object" &&
              "status" in interpretation &&
              interpretation.status === "PARTIAL"
              ? "PARTIAL"
              : "SUCCEEDED"
            : "FAILED",
      response_material_reference: null,
      response_material_sha256: null,
      response_sha256: interpretation === null ? null : persistenceDigest(interpretation),
      metering_disposition: "COMPLETION_PENDING",
      reported_usage_summary: {
        version: 1,
        ...result.usage,
        image_units: null,
        audio_units: null,
        call_count: null,
        bytes: null,
        wall_ms: null,
        cpu_ms: null,
        gpu_ms: null,
        accelerator_ms: null,
      },
      recovery_sha256: null,
    };
    const { provider_extension: _, ...summary } = base.reported_usage_summary;
    base.reported_usage_summary = summary as typeof base.reported_usage_summary;
    const reference = deps.id();
    const bytes = new TextEncoder().encode(
      JSON.stringify({
        version: 1,
        attempt_id: a.attempt_id,
        descriptor: a.descriptor_snapshot,
        result,
        interpretation,
        report: base,
      }),
    );
    const digest = await deps.hash(bytes);
    const pin = await deps.custody.put({
      accountId: a.account_id,
      reservationId: reference,
      sha256: digest,
      byteCount: bytes.length,
      bytes,
    });
    await deps.retained.put(a, {
      reference: pin.reference,
      sha256: digest,
      byteCount: bytes.length,
    });
    const report = executionReportSchema.parse({
      ...base,
      response_material_reference: pin.reference,
      response_material_sha256: digest,
    });
    try {
      await deps.appendMeter(a, result, report);
      return { ...report, metering_disposition: "COMPLETE" };
    } catch {
      return report;
    }
  }
  return {
    executor(context: AccountRequestContext): ContinuationExecutor {
      return {
        async proveUndispatched(a) {
          a = attemptSchema.parse(structuredClone(a));
          const e = await load(a);
          return (await start(a, e)).dispatch_state === "RESERVED";
        },
        async prepareUsage(a) {
          a = attemptSchema.parse(structuredClone(a));
          const e = await load(a);
          const adapter = await prepareDeepSeekFlight(
            deps,
            e.envelope,
            e.host,
            e.signal,
            e.deadline,
          );
          await adapter.assertReady();
          await deps.gateway.invoke("flight_activation_reserve_call", e.command);
          await start(a, e);
          return "START_DURABLE";
        },
        async execute(a) {
          a = attemptSchema.parse(structuredClone(a));
          const e = await load(a);
          const h = await start(a, e);
          if (h.dispatch_state !== "RESERVED")
            throw new Error("OUTBOUND_RECOVERY_REQUIRED");
          const adapter = await prepareDeepSeekFlight(
            deps,
            e.envelope,
            e.host,
            e.signal,
            e.deadline,
          );
          await adapter.assertReady();
          let marked!: Promise<unknown>;
          await deps.repo.admitExecution(context, a, () => {
            if (e.signal.aborted || deps.monotonic() >= e.deadline)
              throw new Error("CANCELED");
            const c = {
              version: 1,
              environment: "DEV",
              request_id: deps.id(),
              account_id: a.account_id,
              integration_id: a.integration_id,
              call_id: a.usage_correlation_id,
              expected_revision: 1,
              publication_fence: a.task_publication_fence,
            };
            marked = deps.gateway.invoke("external_integration_mark_dispatch", {
              ...c,
              request_sha256: commandDigest(c),
            });
          });
          let result: FlightProviderResult;
          try {
            const ack = ackSchema.parse(await marked);
            await adapter.assertReady();
            assertAccountRequestGeneration(context);
            if (
              ack.account_id !== a.account_id ||
              ack.attempt_id !== a.attempt_id ||
              ack.publication_fence !== a.task_publication_fence
            )
              throw new Error("POLICY_BLOCKED");
            result = await adapter.execute(ack);
          } catch {
            result = {
              status: "UNKNOWN",
              error: "UNKNOWN",
              provider_request_id: null,
              latency_ms: null,
              usage: {
                input_tokens: null,
                output_tokens: null,
                total_tokens: null,
                cached_input_tokens: null,
                reasoning_tokens: null,
                provider_extension: {},
                usage_quality: "UNKNOWN",
              },
            };
          }
          let interpretation: unknown | null = null;
          if (result.status === "SUCCEEDED")
            try {
              const rebound = await rebindFlightRemoteOutput(
                result.output,
                e.envelope,
                e.request,
                deps.hash,
              );
              interpretation = await deps.interpret(e.request, rebound);
            } catch {
              result = {
                status: "FAILED",
                error: "SEMANTIC_INVALID",
                provider_request_id: result.provider_request_id,
                usage: result.usage,
                latency_ms: result.latency_ms,
              };
            }
          return retain(a, result, interpretation);
        },
      };
    },
    async recover(context: AccountRequestContext, id: string) {
      const a = await deps.repo.readAttempt(context, id);
      const pin = await deps.retained.read(a);
      if (
        !pin ||
        (a.response_material_reference !== null &&
          a.response_material_reference !== pin.reference) ||
        (a.response_material_sha256 !== null && a.response_material_sha256 !== pin.sha256)
      )
        throw new Error("OUTBOUND_RECOVERY_REQUIRED");
      const bytes = await deps.custody.read({ accountId: a.account_id, ...pin });
      if ((await deps.hash(bytes)) !== pin.sha256) throw new Error("POLICY_BLOCKED");
      const stored = JSON.parse(new TextDecoder().decode(bytes));
      if (
        stored.attempt_id !== a.attempt_id ||
        persistenceDigest(stored.descriptor) !== persistenceDigest(a.descriptor_snapshot)
      )
        throw new Error("POLICY_BLOCKED");
      const disclosed = {
        ...stored,
        report: executionReportSchema.parse({
          ...stored.report,
          response_material_reference: pin.reference,
          response_material_sha256: pin.sha256,
        }),
      };
      if (
        disclosed.report.account_id !== a.account_id ||
        disclosed.report.task_id !== a.task_id ||
        disclosed.report.attempt_id !== a.attempt_id ||
        disclosed.report.request_id !== a.request_id ||
        disclosed.report.request_sha256 !== a.request_sha256 ||
        disclosed.report.usage_correlation_id !== a.usage_correlation_id ||
        (a.response_sha256 !== null &&
          disclosed.report.response_sha256 !== a.response_sha256)
      )
        throw new Error("POLICY_BLOCKED");
      await deps.repo.authorizeResultDisclosure(context, a);
      assertAccountRequestGeneration(context); // No await between this fence and evidence return.
      return disclosed;
    },
    async install(
      context: AccountRequestContext,
      id: string,
      publicationId: string,
      publicationSha256: string,
      install: Parameters<Repo["installResult"]>[5],
    ) {
      const a = await deps.repo.readAttempt(context, id);
      const stored = await this.recover(context, id);
      if (persistenceDigest(stored.interpretation) !== a.response_sha256)
        throw new Error("POLICY_BLOCKED");
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
