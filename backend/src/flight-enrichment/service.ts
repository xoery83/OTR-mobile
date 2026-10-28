import { createHash } from "node:crypto";
import {
  VERSION,
  FEATURE,
  requestSchema,
  responseSchema,
  observationSchema,
  fieldNames,
  type FlightEnrichmentRequest,
  type FlightEnrichmentResponse,
  type UsageSummary,
  type ProviderObservation,
  type RawResult,
} from "./contracts";
import {
  DEFAULT_PLAN,
  ProviderStepFailure,
  type BudgetPlan,
  type FlightLookupProvider,
  type UsagePort,
  type EntitlementPort,
  type IdempotencyPort,
  type TrustedContext,
  type CachePort,
  type CacheWriteAuthorization,
  type UsageIdentity,
  type Step,
  type StepResult,
} from "./ports";
import { matchCache, buildCacheEntry } from "./cache";
import { projectFlightSuggestions } from "./projection";
import { decodeSearch, decodeExtraction } from "./provider";
function canonical(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return "[" + v.map(canonical).join(",") + "]";
  return (
    "{" +
    Object.entries(v as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => JSON.stringify(k) + ":" + canonical(v))
      .join(",") +
    "}"
  );
}
export const requestDigest = (request: FlightEnrichmentRequest) =>
  createHash("sha256").update(canonical(request)).digest("hex");
export async function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  promise.catch(() => {});
  signal.throwIfAborted();
  let listener: () => void = () => {};
  const aborted = new Promise<never>((_, reject) => {
    listener = () => reject(signal.reason);
    signal.addEventListener("abort", listener, { once: true });
  });
  try {
    return await Promise.race([promise, aborted]);
  } finally {
    signal.removeEventListener("abort", listener);
  }
}
function unknownObservation(
  providerId: string,
  modelId: string | null,
): ProviderObservation {
  return {
    providerId,
    modelId,
    providerRequestId: null,
    input_tokens: null,
    output_tokens: null,
    cached_input_tokens: null,
    total_tokens: null,
    usage_quality: "UNKNOWN",
    cost_nanos: null,
    cost_quality: "UNKNOWN",
    billing_status: "UNKNOWN",
    execution: "MAY_HAVE_STARTED",
  };
}
export function summarizeUsage(
  receiptId: string | null,
  providerId: string,
  modelId: string | null,
  steps: Partial<Record<Step, ProviderObservation>>,
  started: Step[],
  entitlement: UsageSummary["entitlement"],
  cacheHit: boolean,
  stepReceiptIds: string[],
): UsageSummary {
  const values = started.map(
      (k) =>
        steps[k] ?? unknownObservation(providerId, k === "EXTRACTION" ? modelId : null),
    ),
    llm = started.includes("EXTRACTION") ? steps.EXTRACTION : null;
  const dispatched = started.filter((k) => steps[k]?.execution !== "NOT_STARTED");
  const knownCostNanos = values
    .reduce((sum, v) => sum + BigInt(v.cost_nanos ?? "0"), 0n)
    .toString();
  const known = values.every(
    (v) => v.cost_nanos !== null && v.cost_quality !== "UNKNOWN",
  );
  return {
    receiptId,
    providerId,
    modelId,
    searchCalls: dispatched.includes("SEARCH") ? 1 : 0,
    llmCalls: dispatched.includes("EXTRACTION") ? 1 : 0,
    input_tokens: llm === null ? 0 : (llm?.input_tokens ?? null),
    output_tokens: llm === null ? 0 : (llm?.output_tokens ?? null),
    cached_input_tokens: llm === null ? 0 : (llm?.cached_input_tokens ?? null),
    total_tokens: llm === null ? 0 : (llm?.total_tokens ?? null),
    knownCostNanos,
    providerCostNanos: known ? knownCostNanos : null,
    costQuality: !values.length
      ? "NO_PROVIDER_CALL"
      : !known
        ? "UNKNOWN"
        : values.every((v) => v.cost_quality === "ACTUAL")
          ? "ACTUAL"
          : "ESTIMATED",
    billingStatus: !values.length
      ? "NOT_BILLED"
      : values.every((v) => v.billing_status === "RECONCILED")
        ? "RECONCILED"
        : values.every((v) => v.billing_status === "NOT_BILLED")
          ? "NOT_BILLED"
          : "UNRECONCILED",
    currency: "USD",
    entitlement,
    cacheHit,
    metering: "RECORDED",
    stepReceiptIds,
  };
}
export type ServiceDependencies = {
  provider: FlightLookupProvider;
  cache: CachePort;
  usage: UsagePort;
  idempotency: IdempotencyPort;
  entitlement?: EntitlementPort;
  authorizeCacheWrite?: CacheWriteAuthorization;
  plan?: BudgetPlan;
  now?: () => number;
  deadlineMs?: number;
  searchTimeoutMs?: number;
  extractionTimeoutMs?: number;
};
export function createFlightEnrichmentService(deps: ServiceDependencies) {
  const plan = deps.plan ?? DEFAULT_PLAN,
    now = deps.now ?? Date.now;
  if (
    BigInt(plan.searchEstimateNanos) + BigInt(plan.extractionEstimateNanos) >
      BigInt(plan.targetNanos) ||
    BigInt(plan.targetNanos) > 10000000n ||
    BigInt(plan.targetNanos) <= 0n ||
    BigInt(plan.searchEstimateNanos) < 0n ||
    BigInt(plan.extractionEstimateNanos) < 0n
  )
    throw Error("INVALID_BUDGET_PLAN");
  const durations = [
    deps.deadlineMs ?? 13000,
    deps.searchTimeoutMs ?? 5000,
    deps.extractionTimeoutMs ?? 8000,
  ];
  if (
    durations.some(
      (n, i) => !Number.isSafeInteger(n) || n <= 0 || n > [13000, 5000, 8000][i],
    )
  )
    throw Error("INVALID_TIMEOUT_BOUND");
  return {
    async enrich(
      raw: unknown,
      context: TrustedContext,
      callerSignal?: AbortSignal,
    ): Promise<FlightEnrichmentResponse> {
      const request = requestSchema.parse(raw),
        deadline = AbortSignal.timeout(durations[0]);
      await abortable(context.assertCurrent(), deadline);
      const scope = {
        accountId: context.accountId,
        actorId: context.actorId,
        key: request.idempotencyKey,
        digest: requestDigest(request),
      };
      const result = await abortable(
        deps.idempotency.execute(scope, async () => {
          const signal = AbortSignal.any([
            deadline,
            ...(callerSignal ? [callerSignal] : []),
          ]);
          const identity: UsageIdentity = {
            feature: FEATURE,
            accountId: context.accountId,
            actorId: context.actorId,
            tripId: context.tripId,
            requestId: request.requestId,
            idempotencyKey: request.idempotencyKey,
            requestDigest: scope.digest,
          };
          const started: Step[] = [],
            steps: Partial<Record<Step, ProviderObservation>> = {},
            stepReceiptIds: string[] = [];
          let receiptId: string | null = null,
            entitlement: UsageSummary["entitlement"] = "POLICY_UNFROZEN",
            admitted = false,
            meteringFailed = false;
          const response: FlightEnrichmentResponse = {
            version: VERSION,
            requestId: request.requestId,
            idempotencyKey: request.idempotencyKey,
            mode: request.mode,
            draft: request.draft,
            query: {
              flightNumber: request.flightNumber,
              departureLocalDate: request.departureLocalDate,
            },
            status: "UNAVAILABLE",
            advisory: true,
            requiresUserConfirmation: true,
            manualEntryAllowed: true,
            suggestions: [],
            references: [],
            unresolved: [...fieldNames],
            candidates: [],
            observedAt: new Date(now()).toISOString(),
            cache: {
              state: "MISS",
              freshUntil: null,
              writes: "CLOSED_LICENSE_UNCONFIRMED",
            },
            usage: summarizeUsage(
              null,
              deps.provider.providerId,
              deps.provider.modelId,
              steps,
              started,
              entitlement,
              false,
              stepReceiptIds,
            ),
            failureReason: null,
          };
          const recordStep: UsagePort["observeStep"] = async (event) => {
            try {
              await deps.usage.observeStep(event);
            } catch {
              meteringFailed = true;
              throw new ProviderStepFailure("METERING_UNAVAILABLE");
            }
          };
          const call = async (
            kind: Step,
            evidence?: RawResult["evidence"],
          ): Promise<StepResult> => {
            await abortable(context.assertCurrent(), signal);
            signal.throwIfAborted();
            const stage = AbortSignal.any([
              signal,
              AbortSignal.timeout(kind === "SEARCH" ? durations[1] : durations[2]),
            ]);
            const stepId = createHash("sha256")
              .update(`${context.accountId}:${context.actorId}:${scope.digest}:${kind}`)
              .digest("hex");
            started.push(kind);
            // Host owns durable dispatch/UNKNOWN custody. Late measurement settles cost only; never resumes extraction/projection.
            const operation = deps.provider
              .execute(
                {
                  kind,
                  stepId,
                  receiptId: receiptId!,
                  signal: stage,
                  maxResponseBytes: 131072,
                  maxRequestBytes: 24000,
                  request,
                  ...(evidence ? { evidence } : {}),
                },
                context,
              )
              .then(
                async (result) => {
                  const observation = observationSchema.parse(result.observation);
                  steps[kind] = observation;
                  stepReceiptIds.push(result.receiptId);
                  await recordStep({
                    ...identity,
                    usageReceiptId: receiptId!,
                    stepId,
                    kind,
                    stepReceiptId: result.receiptId,
                    observation,
                    late: stage.aborted,
                  });
                  if (result.body.byteLength > 131072)
                    throw new ProviderStepFailure("RESPONSE_BOUND", observation);
                  if (result.httpStatus !== 200)
                    throw new ProviderStepFailure("PROVIDER_UNAVAILABLE", observation);
                  return result;
                },
                async (error) => {
                  if (error instanceof ProviderStepFailure && error.observation) {
                    const observation = observationSchema.parse(error.observation);
                    steps[kind] = observation;
                    await recordStep({
                      ...identity,
                      usageReceiptId: receiptId!,
                      stepId,
                      kind,
                      stepReceiptId: stepId,
                      observation,
                      late: stage.aborted,
                    });
                  }
                  throw error;
                },
              );
            operation.catch(() => {});
            return abortable(operation, stage);
          };
          try {
            entitlement = deps.entitlement
              ? await abortable(deps.entitlement.check(identity, signal), signal)
              : "POLICY_UNFROZEN";
            if (entitlement === "DENIED")
              throw new ProviderStepFailure("ENTITLEMENT_DENIED");
            let hits: {
              entry: Awaited<ReturnType<CachePort["lookup"]>>[number];
              expiry: number;
            }[] = [];
            try {
              const entries = await abortable(
                deps.cache.lookup(
                  {
                    flightNumber: request.flightNumber,
                    departureLocalDate: request.departureLocalDate,
                    knownFields: request.knownFields,
                  },
                  signal,
                ),
                signal,
              );
              if (entries.length > 128) throw Error("CACHE_BOUND");
              hits = entries
                .filter(
                  (e) =>
                    e.providerId === deps.provider.providerId &&
                    e.modelId === deps.provider.modelId,
                )
                .map((entry) => ({
                  entry,
                  expiry: matchCache(entry, request, now()),
                }))
                .filter((v): v is typeof v & { expiry: number } => v.expiry !== null);
            } catch (error) {
              if (signal.aborted) throw error;
              response.cache.state = "ERROR";
            }
            const unique = hits.length === 1 ? hits[0] : null;
            if (hits.length > 1) response.cache.state = "AMBIGUOUS";
            const admission = await abortable(
              deps.usage.admit(
                identity,
                {
                  ...plan,
                  estimatedNanos: unique
                    ? "0"
                    : (
                        BigInt(plan.searchEstimateNanos) +
                        BigInt(plan.extractionEstimateNanos)
                      ).toString(),
                  cacheHit: !!unique,
                },
                signal,
              ),
              signal,
            );
            receiptId = admission.receiptId;
            if (!admission.allowed) throw new ProviderStepFailure("BUDGET_REJECTED");
            admitted = true;
            await abortable(context.assertCurrent(), signal);
            if (unique) {
              Object.assign(
                response,
                projectFlightSuggestions(request, unique.entry.result),
              );
              response.cache.state = "HIT";
              response.cache.freshUntil = new Date(unique.expiry).toISOString();
              response.observedAt = unique.entry.observedAt;
            } else {
              const search = await call("SEARCH");
              const evidence = decodeSearch(search.body, new Date(now()).toISOString());
              let result: RawResult = {
                proposal: { status: "NOT_FOUND", fields: {}, candidates: [] },
                evidence,
              };
              const useful = evidence.some((e) =>
                e.text.replace(/\s/g, "").toUpperCase().includes(request.flightNumber),
              );
              if (useful) {
                const extraction = await call("EXTRACTION", evidence);
                result = {
                  proposal: decodeExtraction(extraction.body),
                  evidence,
                };
              }
              await abortable(context.assertCurrent(), signal);
              signal.throwIfAborted();
              Object.assign(response, projectFlightSuggestions(request, result));
              if (
                deps.authorizeCacheWrite &&
                ["SUCCESS", "PARTIAL"].includes(response.status) &&
                !response.references.length
              ) {
                response.cache.writes = "NOT_ELIGIBLE";
                try {
                  const grant = await abortable(
                    deps.authorizeCacheWrite(request, result, signal),
                    signal,
                  );
                  if (grant) {
                    const entry = buildCacheEntry(
                      request,
                      result,
                      grant,
                      deps.provider.providerId,
                      deps.provider.modelId,
                      now(),
                    );
                    if (entry) {
                      await abortable(deps.cache.put(entry, signal), signal);
                      response.cache.writes = "WRITTEN";
                    }
                  }
                } catch (error) {
                  if (signal.aborted) throw error;
                  response.cache.writes = "ERROR";
                }
              }
            }
          } catch (error) {
            response.status = "UNAVAILABLE";
            response.suggestions = [];
            response.references = [];
            response.candidates = [];
            response.unresolved = [...fieldNames];
            response.failureReason =
              error instanceof ProviderStepFailure
                ? error.reason
                : signal.aborted
                  ? callerSignal?.aborted
                    ? "CANCELED"
                    : "TIMEOUT"
                  : error instanceof Error && error.name === "TimeoutError"
                    ? "TIMEOUT"
                    : "UNKNOWN";
          }
          response.usage = summarizeUsage(
            receiptId,
            deps.provider.providerId,
            deps.provider.modelId,
            steps,
            started,
            entitlement,
            response.cache.state === "HIT",
            [...stepReceiptIds],
          );
          if (meteringFailed || !receiptId) response.usage.metering = "PENDING";
          // One non-billable request summary; per-step observations are the sole Provider-cost source.
          if (receiptId) {
            try {
              await abortable(
                deps.usage.finish({
                  ...identity,
                  usage: structuredClone(response.usage),
                  status: response.status,
                  summaryOnly: true,
                }),
                AbortSignal.timeout(1000),
              );
            } catch {
              response.usage.metering = "PENDING";
              response.status = "UNAVAILABLE";
              response.failureReason = "METERING_UNAVAILABLE";
              response.suggestions = [];
              response.references = [];
            }
          } else response.usage.metering = "PENDING";
          if (meteringFailed) {
            response.usage.metering = "PENDING";
            response.status = "UNAVAILABLE";
            response.failureReason = "METERING_UNAVAILABLE";
            response.suggestions = [];
            response.references = [];
          }
          return responseSchema.parse(response);
        }),
        deadline,
      );
      await abortable(context.assertCurrent(), deadline);
      return structuredClone(result);
    },
  };
}
