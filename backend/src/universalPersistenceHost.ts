import { universalPgTransaction } from "./universalPg";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import type { Task, Attempt } from "../../src/domain/intelligence/persistence";
import type { CorePgConnection } from "./tripCoreV2PgStorage";
import type { createFlightPrivateCustody } from "./flightPrivateCustody";
import {
  commandDigest,
  persistenceDigest,
  type createClosedPersistenceGateway,
} from "./externalIntegrationPersistence";
import {
  bindUniversalModelTask,
  registeredUniversalModelProfile,
} from "./universalModelProfile";
import { createUniversalTaskReceiptChecks } from "./universalTaskReceipt";
import type {
  UniversalProviderCustody,
  UniversalPriceSchedule,
} from "./universalDeepSeekProvider";
import { UNIVERSAL_IMPORT_SCHEMA_ID } from "./universalImport";

const scopeSchema = z.object({
  actor_id: z.uuid(),
  trip_id: z.uuid(),
  batch_id: z.uuid(),
  task_id: z.uuid(),
  attempt_id: z.uuid(),
  call_id: z.uuid(),
  integration_id: z.string(),
  provider_config_id: z.uuid(),
  price_schedule_id: z.uuid(),
  request_sha256: z.string(),
  provider_request_sha256: z.string(),
  input_sha256: z.string(),
  model_binding: z.unknown(),
  input_ceiling: z.number().int().positive(),
  output_ceiling: z.number().int().positive(),
  max_cost_nanos: z.union([z.string(), z.number()]).transform(String),
  starts_at: z.string(),
  expires_at: z.string(),
  priceUnits: z
    .array(
      z.object({
        unit: z.enum(["input_tokens", "cached_input_tokens", "output_tokens"]),
        quantity: z.union([z.number(), z.string()]),
        price: z.string(),
        definition: z.object({
          relationship: z.literal("DISJOINT"),
          billable: z.literal(true),
        }),
      }),
    )
    .length(3),
});
type Scope = z.infer<typeof scopeSchema>;
const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

function rate(price: string, quantity: string | number) {
  if (
    !/^\d+(?:\.\d{1,18})?$/.test(price) ||
    !/^\d+$/.test(String(quantity)) ||
    BigInt(quantity) <= 0n
  )
    throw Error("UNIVERSAL_PRICE_UNAVAILABLE");
  const [whole, part = ""] = price.split(".");
  const numerator =
    (BigInt(whole) * 10n ** 18n + BigInt(part.padEnd(18, "0"))) * 10n ** 15n;
  const denominator = 10n ** 18n * BigInt(quantity);
  if (numerator % denominator !== 0n)
    throw Error("UNIVERSAL_PRICE_PRECISION_UNAVAILABLE");
  return String(numerator / denominator);
}
function schedule(scope: Scope): UniversalPriceSchedule {
  if (new Set(scope.priceUnits.map((u) => u.unit)).size !== 3)
    throw Error("UNIVERSAL_PRICE_UNAVAILABLE");
  const value = (unit: Scope["priceUnits"][number]["unit"]) => {
    const u = scope.priceUnits.find((u) => u.unit === unit)!;
    return rate(u.price, u.quantity);
  };
  return {
    currency: "USD",
    inputNanosPerMillion: value("input_tokens"),
    cachedInputNanosPerMillion: value("cached_input_tokens"),
    outputNanosPerMillion: value("output_tokens"),
  };
}

// This is an adapter to the existing protected persistence gateway and private
// custody, not an alternative Task store or issuer. Construction reads no key.
export function createUniversalPersistenceHost(deps: {
  connection: CorePgConnection;
  gateway: ReturnType<typeof createClosedPersistenceGateway>;
  stores: Pick<
    Awaited<ReturnType<typeof createFlightPrivateCustody>>,
    "custody" | "retainRaw"
  >;
  attempt: Attempt;
  requestMaterialByteCount: number;
  currentTask(): Promise<Task>;
  environment(key: string): string | undefined;
}) {
  const a = structuredClone(deps.attempt);
  const checks = createUniversalTaskReceiptChecks(deps.connection);
  let admittedScope: Scope | null = null,
    secretValue: string | null = null;
  async function currentScope() {
    if (deps.environment("OTR_DEV_UNIVERSAL_REMOTE_TRANSPORT") !== "enabled")
      throw Error("UNIVERSAL_PROVIDER_CLOSED");
    const task = await deps.currentTask();
    const rows = await universalPgTransaction(deps.connection, (lease) =>
      lease.query(
        "SELECT public.universal_import_read_scope($1::uuid,$2::uuid,$3::uuid,$4::uuid) AS scope",
        [a.account_id, a.task_id, a.attempt_id, a.usage_correlation_id],
      ),
    );
    const scope = scopeSchema.parse(rows.rows[0]?.scope);
    const binding = bindUniversalModelTask({
      contract_version: "otr-model-task-v1",
      task_id: task.task_id,
      logical_request_id: task.logical_request_id,
      logical_idempotency_key: task.logical_idempotency_key,
      consumer_id: task.consumer_id,
      consumer_version: task.consumer_version,
      input: {
        reference: a.request_material_reference!,
        sha256: a.request_material_sha256!,
        byte_count: deps.requestMaterialByteCount,
      },
      schema: {
        id: UNIVERSAL_IMPORT_SCHEMA_ID,
        version: 1,
        dialect: "OTR_TYPED_V1",
        sha256: registeredUniversalModelProfile.output_schema_sha256,
      },
      policy_snapshot: task.policy_snapshot,
      policy_sha256: task.policy_sha256,
    });
    if (
      task.account_id !== a.account_id ||
      task.task_id !== a.task_id ||
      task.cancellation_disposition !== "NONE" ||
      task.publication_fence !== a.task_publication_fence ||
      scope.actor_id !== a.account_id ||
      scope.trip_id !== task.trip_id ||
      scope.batch_id !== task.import_id ||
      scope.task_id !== a.task_id ||
      scope.attempt_id !== a.attempt_id ||
      scope.call_id !== a.usage_correlation_id ||
      scope.integration_id !== a.integration_id ||
      scope.provider_config_id !== a.provider_config_id ||
      scope.request_sha256 !== a.request_sha256 ||
      scope.input_sha256 !== task.input_sha256 ||
      persistenceDigest(scope.model_binding) !== persistenceDigest(binding) ||
      Date.now() >= Date.parse(scope.expires_at) ||
      Date.now() < Date.parse(scope.starts_at)
    )
      throw Error("UNIVERSAL_PROVIDER_SCOPE_CHANGED");
    if (admittedScope && persistenceDigest(scope) !== persistenceDigest(admittedScope))
      throw Error("UNIVERSAL_PROVIDER_SCOPE_CHANGED");
    return { scope, task, binding };
  }
  return {
    async assertCurrent() {
      await currentScope();
    },
    async assertDurableStart(attempt: Readonly<Attempt>, task: Readonly<Task>) {
      if (attempt.attempt_id !== a.attempt_id || task.task_id !== a.task_id)
        throw Error("UNIVERSAL_TASK_BINDING_INVALID");
      const { scope, binding } = await currentScope();
      const nullable = Object.fromEntries(
        "billing_subject_id shadow_of_call_id evaluation_reference invocation_id dispatch_marked_at terminal_observed_at safe_reason"
          .split(" ")
          .map((k) => [k, null]),
      );
      const row = {
        ...nullable,
        call_id: a.usage_correlation_id,
        integration_id: a.integration_id,
        environment: "DEV",
        provider_config_id: a.provider_config_id,
        provider_id: a.provider_id,
        model_id: a.model_id,
        model_version: a.model_version,
        adapter_version: a.adapter_version,
        config_version: Number(a.config_version),
        configuration_sha256: a.configuration_sha256,
        account_id: a.account_id,
        user_id: a.account_id,
        trip_id: task.trip_id,
        import_id: task.import_id,
        task_id: a.task_id,
        attempt_id: a.attempt_id,
        fallback_chain_id: a.fallback_chain_id,
        attempt_sequence: 1,
        request_id: a.request_id,
        idempotency_key: a.idempotency_key,
        request_sha256: a.request_sha256,
        input_sha256: task.input_sha256,
        schema_sha256: registeredUniversalModelProfile.output_schema_sha256,
        capability: "EXTRACT",
        task_class: "UNIVERSAL_IMPORT_V1",
        call_kind: "OUTBOUND_MODEL",
        shadow: false,
        price_schedule_id: scope.price_schedule_id,
        admitted_at: a.created_at,
        admission_sha256: a.request_sha256,
        publication_fence: a.task_publication_fence,
        row_revision: 1,
        dispatch_state: "RESERVED",
        execution_certainty: "NOT_STARTED",
      };
      const none = Object.fromEntries(
        "started_at ended_at latency_ms outcome response_sha256 publication_sha256 input_tokens output_tokens total_tokens cached_input_tokens reasoning_tokens image_units audio_units call_count bytes wall_ms cpu_ms gpu_ms accelerator_ms cost_nanos cost_calculation_version supersedes_observation_id"
          .split(" ")
          .map((k) => [k, null]),
      );
      const start = {
        ...none,
        observation_id: a.usage_correlation_id,
        call_id: a.usage_correlation_id,
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
        price_schedule_id: scope.price_schedule_id,
        currency: "USD",
        cost_quality: "UNKNOWN",
        observation_sha256: persistenceDigest({
          domain: "otr-universal-start-v1",
          call: a.usage_correlation_id,
          request: a.request_sha256,
        }),
      };
      const body = {
        version: 1,
        environment: "DEV",
        request_id: a.request_id,
        account_id: a.account_id,
        integration_id: a.integration_id,
        row,
        start,
        model_task_binding: binding,
      };
      const reserved = z
        .object({
          row_revision: z.number().int().positive(),
          publication_fence: z.number().int().positive(),
          dispatch_state: z.literal("RESERVED"),
        })
        .parse(
          await deps.gateway.invoke("universal_activation_reserve_call", {
            ...body,
            request_sha256: commandDigest(body),
          }),
        );
      const dispatch = {
        version: 1,
        environment: "DEV",
        request_id: randomUUID(),
        account_id: a.account_id,
        integration_id: a.integration_id,
        call_id: a.usage_correlation_id,
        expected_revision: reserved.row_revision,
        publication_fence: reserved.publication_fence,
      };
      await deps.gateway.invoke("external_integration_mark_dispatch", {
        ...dispatch,
        request_sha256: commandDigest(dispatch),
      });
      await checks.assertDurableStart(attempt, task);
      admittedScope = scope;
    },
    assertCompletion: checks.assertCompletion,
    async priceSchedule() {
      const { scope } = await currentScope();
      admittedScope = scope;
      return schedule(scope);
    },
    custody: {
      async acquire(input) {
        const { scope, task } = await currentScope();
        if (
          input.accountId !== a.account_id ||
          input.actorId !== a.account_id ||
          input.taskId !== a.task_id ||
          input.tripId !== task.trip_id ||
          input.batchId !== task.import_id ||
          input.requestSha256 !== scope.provider_request_sha256
        )
          return null;
        await checks.assertDurableStart(a, task);
        const secret = deps.environment("OTR_DEV_DEEPSEEK_API_KEY");
        if (!secret) return null;
        secretValue = secret;
        return {
          secret,
          async assertCurrent() {
            await currentScope();
            if (deps.environment("OTR_DEV_DEEPSEEK_API_KEY") !== secretValue)
              throw Error("UNIVERSAL_CREDENTIAL_CHANGED");
          },
        };
      },
      async retainResponse(input) {
        const { scope } = await currentScope();
        if (
          input.accountId !== a.account_id ||
          input.taskId !== a.task_id ||
          input.requestSha256 !== scope.provider_request_sha256 ||
          sha(input.bytes) !== input.responseSha256
        )
          throw Error("UNIVERSAL_RAW_BINDING_INVALID");
        await deps.stores.custody.put({
          accountId: a.account_id,
          reservationId: a.usage_correlation_id!,
          sha256: input.responseSha256,
          byteCount: input.bytes.length,
          bytes: input.bytes,
        });
        await deps.stores.retainRaw(
          a.account_id,
          a.usage_correlation_id!,
          {
            reference: a.usage_correlation_id!,
            sha256: input.responseSha256,
            byteCount: input.bytes.length,
          },
          {
            version: 1,
            taskId: a.task_id,
            requestSha256: input.requestSha256,
            httpStatus: input.httpStatus,
          },
        );
        await currentScope();
      },
      async settle(input) {
        const { scope } = await currentScope();
        if (
          input.accountId !== a.account_id ||
          input.taskId !== a.task_id ||
          input.requestSha256 !== scope.provider_request_sha256 ||
          !input.costNanos ||
          BigInt(input.costNanos) > BigInt(scope.max_cost_nanos) ||
          input.usage.usage_quality !== "ACTUAL_REPORTED" ||
          input.usage.input_tokens === null ||
          input.usage.output_tokens === null ||
          input.usage.input_tokens > scope.input_ceiling ||
          input.usage.output_tokens > scope.output_ceiling
        )
          throw Error("UNIVERSAL_USAGE_BOUND_UNRESOLVED");
        const none = Object.fromEntries(
          "started_at ended_at latency_ms outcome publication_sha256 image_units audio_units call_count bytes wall_ms cpu_ms gpu_ms accelerator_ms supersedes_observation_id"
            .split(" ")
            .map((k) => [k, null]),
        );
        const now = new Date().toISOString();
        const row = {
          ...none,
          observation_id: randomUUID(),
          call_id: a.usage_correlation_id,
          observation_key: "universal-completion",
          observation_version: 1,
          observation_kind: "COMPLETION",
          measurement_mode: "CUMULATIVE",
          observed_at: now,
          received_at: now,
          status: "SUCCEEDED",
          response_sha256: input.responseSha256,
          input_tokens: input.usage.input_tokens,
          output_tokens: input.usage.output_tokens,
          total_tokens: input.usage.total_tokens,
          cached_input_tokens: input.usage.cached_input_tokens,
          reasoning_tokens: input.usage.reasoning_tokens,
          other_units: {},
          provider_extension: input.usage.provider_extension,
          usage_quality: input.usage.usage_quality,
          unit_quality: {},
          price_schedule_id: scope.price_schedule_id,
          cost_nanos: input.costNanos,
          currency: "USD",
          cost_quality: "ESTIMATED",
          cost_calculation_version: "SUM_THEN_CEIL_NANOS_V1",
          provider_request_id: null,
        };
        const usage = {
          version: 1,
          environment: "DEV",
          request_id: randomUUID(),
          integration_id: a.integration_id,
          call_id: a.usage_correlation_id,
          row: {
            ...row,
            observation_sha256: persistenceDigest({
              domain: "otr-universal-usage-v1",
              row,
            }),
          },
        };
        await deps.gateway.invoke("external_integration_usage_append", {
          ...usage,
          request_sha256: commandDigest(usage),
        });
        const observe = {
          version: 1,
          environment: "DEV",
          request_id: randomUUID(),
          integration_id: a.integration_id,
          call_id: a.usage_correlation_id,
          expected_revision: 2,
          publication_fence: a.task_publication_fence,
          dispatch_state: "TERMINAL",
          execution_certainty: "TERMINAL",
          safe_reason: null,
          recovery_sha256: null,
        };
        await deps.gateway.invoke("external_integration_observe_call", {
          ...observe,
          request_sha256: commandDigest(observe),
        });
      },
    } satisfies UniversalProviderCustody,
  };
}
