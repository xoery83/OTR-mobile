import { reportEnrichmentDiagnostic } from "./diagnostics";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import {
  commandDigest,
  persistenceDigest,
  type createClosedPersistenceGateway,
} from "../externalIntegrationPersistence";
import type { createFlightPrivateCustody } from "../flightPrivateCustody";
import { universalPriceScheduleFromUnits } from "../universalPersistenceHost";
import type { createFlightEnrichmentHostRun } from "./hostRun";
import { requestDigest } from "./service";
import { registeredFlightEnrichmentProfile as profile } from "./registeredProfile";
import { appendFlightEnrichmentUsage, enrichmentUsageReceiptSchema } from "./usageWriter";
import type { TrustedContext, UsagePort } from "./ports";

const sha = (bytes: Uint8Array | string) =>
  createHash("sha256").update(bytes).digest("hex");
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const scopeSchema = z.object({
  scope: z.object({
    scope_id: z.uuid(),
    revision: z.number().int().positive(),
    scope_sha256: digest,
  }),
  grant_revision: z.number().int().positive(),
  logical_request_id: z.uuid().nullable(),
  price_units: z.unknown(),
  search_nanos_per_request: z.string().regex(/^[0-9]+$/),
});
const callSchema = z.object({
  call_id: z.uuid(),
  account_id: z.uuid(),
  user_id: z.uuid(),
  trip_id: z.uuid(),
  task_id: z.uuid(),
  input_sha256: digest,
  price_schedule_id: z.uuid().nullable(),
  row_revision: z.number().int().positive(),
  publication_fence: z.number().int().positive(),
  dispatch_state: z.enum(["RESERVED", "MAY_HAVE_STARTED", "UNKNOWN", "TERMINAL"]),
});
const storedResponseSchema = z.strictObject({
  version: z.literal(1),
  requestSha256: digest,
  httpStatus: z.number().int().min(100).max(599),
  responseSha256: digest,
});
const observationBindingSchema = z.strictObject({
  version: z.literal(1),
  eventSha256: digest,
  receipt: enrichmentUsageReceiptSchema,
});
type Gateway = ReturnType<typeof createClosedPersistenceGateway>;
type PrivateStores = Awaited<ReturnType<typeof createFlightPrivateCustody>>;
type Stores = Pick<PrivateStores, "readRaw" | "retainRaw"> & {
  custody: Pick<PrivateStores["custody"], "put" | "read" | "verify">;
};

export function flightEnrichmentInputVerifier(
  custody: Pick<Stores["custody"], "verify">,
): NonNullable<
  Parameters<typeof createClosedPersistenceGateway>[0]["verifyEnrichmentInput"]
> {
  return async (context, material) =>
    context.verified_account_id === material.accountId &&
    material.reference === material.callId &&
    custody.verify({
      accountId: material.accountId,
      reference: material.reference,
      sha256: material.sha256,
      byteCount: material.byteCount,
    });
}

function observationKey(eventSha: string) {
  // Stable private receipt address, not an authorization or an idempotency/dispatch grant.
  return `${eventSha.slice(0, 8)}-${eventSha.slice(8, 12)}-5${eventSha.slice(13, 16)}-a${eventSha.slice(17, 20)}-${eventSha.slice(20, 32)}`;
}

// All activation and Auth remain in the owning gateway; this adapter cannot mint a grant or resolve an Import secret.
export function createPersistentFlightEnrichmentPorts(deps: {
  gateway(context: TrustedContext): Gateway;
  costGuardEnabled?: boolean;
  stores: Stores;
  resolveCredential(
    reference: typeof profile.credential_reference,
    context: TrustedContext,
  ): Promise<{ reference: string; value: string; assertCurrent(): Promise<void> }>;
  now(): string;
}) {
  async function invoke(
    context: TrustedContext,
    kind: Parameters<Gateway["invoke"]>[0],
    fields: Record<string, unknown>,
  ) {
    if (!context.tripId) throw Error("ENRICHMENT_TRIP_REQUIRED");
    const command = {
      ...fields,
      version: 1,
      environment: "DEV",
      integration_id: "otr-flight-enrichment-v1",
      request_id: randomUUID(),
      account_id: context.accountId,
      actor_id: context.actorId,
      trip_id: context.tripId,
    };
    return deps
      .gateway(context)
      .invoke(kind, { ...command, request_sha256: commandDigest(command) });
  }
  async function scope(context: TrustedContext, key: string | null, hash: string | null) {
    try {
      await context.assertCurrent();
    } catch (error) {
      reportEnrichmentDiagnostic("SCOPE_AUTH", error);
      throw error;
    }
    let result: unknown;
    try {
      result = await invoke(context, "flight_enrichment_runtime_scope", {
        idempotency_key: key,
        logical_sha256: hash,
      });
    } catch (error) {
      reportEnrichmentDiagnostic("SCOPE_GATEWAY", error);
      throw error;
    }
    try {
      return scopeSchema.parse(result);
    } catch (error) {
      reportEnrichmentDiagnostic("SCOPE_PARSE", error);
      throw error;
    }
  }
  async function raw(account: string, id: string) {
    try {
      return await deps.stores.readRaw(account, id);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }
  const reserve: Parameters<typeof createFlightEnrichmentHostRun>[0]["reserve"] = async (
    call,
    context,
    requestSha256,
  ) => {
    const request = call.step.request;
    const hash = requestDigest(request);
    const admittedScope = await scope(context, request.idempotencyKey, hash);
    const callId = randomUUID();
    const bytes = Buffer.from(call.body);
    if (sha(bytes) !== requestSha256) throw Error("ENRICHMENT_INPUT_INTEGRITY");
    await deps.stores.custody.put({
      accountId: context.accountId,
      reservationId: callId,
      bytes,
      sha256: requestSha256,
      byteCount: bytes.length,
    });
    const costGuardEnabled = deps.costGuardEnabled !== false;
    const prices = costGuardEnabled
      ? universalPriceScheduleFromUnits(admittedScope.price_units)
      : null;
    const reserved = z
      .object({ call: callSchema, hold_nanos: z.string().regex(/^[0-9]+$/) })
      .parse(
        await invoke(context, "flight_enrichment_reserve_step", {
          idempotency_key: request.idempotencyKey,
          logical_sha256: hash,
          kind: call.step.kind,
          step_id: call.step.stepId,
          call_id: callId,
          input_reference: callId,
          input_sha256: requestSha256,
          input_byte_count: bytes.length,
          provider_body: call.body,
          advisory_request: request,
          scope_id: admittedScope.scope.scope_id,
          scope_revision: admittedScope.scope.revision,
          scope_sha256: admittedScope.scope.scope_sha256,
          grant_revision: admittedScope.grant_revision,
        }),
      );
    const r = reserved.call;
    if (
      r.call_id !== callId ||
      r.account_id !== context.accountId ||
      r.user_id !== context.actorId ||
      r.trip_id !== context.tripId ||
      r.task_id !== admittedScope.logical_request_id ||
      r.input_sha256 !== requestSha256 ||
      r.dispatch_state !== "RESERVED" ||
      (r.price_schedule_id === null) !== (!costGuardEnabled && call.step.kind === "EXTRACTION")
    )
      throw Error("ENRICHMENT_ADMISSION_SCOPE");
    const secret = await deps.resolveCredential(profile.credential_reference, context);
    if (secret.reference !== profile.credential_reference)
      throw Error("ENRICHMENT_CREDENTIAL_SCOPE");
    await secret.assertCurrent();
    return {
      callId,
      receiptId: callId,
      accountId: context.accountId,
      actorId: context.actorId,
      tripId: context.tripId!,
      stepId: call.step.stepId,
      requestSha256,
      credential: secret.value,
      prices: {
        searchNanosPerRequest: admittedScope.search_nanos_per_request,
        inputNanosPerMillion: prices?.inputNanosPerMillion ?? null,
        cachedInputNanosPerMillion: prices?.cachedInputNanosPerMillion ?? null,
        outputNanosPerMillion: prices?.outputNanosPerMillion ?? null,
        acceptedReturnedModels: [...profile.accepted_returned_models],
      },
      async assertCurrent() {
        await secret.assertCurrent();
        const current = await scope(context, request.idempotencyKey, hash);
        if (
          current.scope.scope_sha256 !== admittedScope.scope.scope_sha256 ||
          current.grant_revision !== admittedScope.grant_revision ||
          current.logical_request_id !== admittedScope.logical_request_id
        )
          throw Error("ENRICHMENT_SCOPE_CHANGED");
      },
      async markDispatch() {
        const marked = callSchema.parse(
          await invoke(context, "flight_enrichment_mark_dispatch", {
            call_id: callId,
            expected_revision: r.row_revision,
            publication_fence: r.publication_fence,
          }),
        );
        if (
          marked.call_id !== callId ||
          marked.dispatch_state !== "MAY_HAVE_STARTED" ||
          marked.row_revision !== r.row_revision + 1
        )
          throw Error("ENRICHMENT_DISPATCH_ACK");
      },
      async retainResponse(response, httpStatus, responseSha256) {
        if (response.length > 131072 || sha(response) !== responseSha256)
          throw Error("ENRICHMENT_RESPONSE_INTEGRITY");
        const reference = randomUUID();
        await deps.stores.custody.put({
          accountId: context.accountId,
          reservationId: reference,
          sha256: responseSha256,
          byteCount: response.length,
          bytes: response,
        });
        await deps.stores.retainRaw(
          context.accountId,
          callId,
          { reference, sha256: responseSha256, byteCount: response.length },
          storedResponseSchema.parse({
            version: 1,
            requestSha256,
            httpStatus,
            responseSha256,
          }),
        );
      },
    };
  };
  function usage(context: TrustedContext): UsagePort {
    function identity(event: {
      accountId: string;
      actorId: string;
      tripId: string | null;
    }) {
      if (
        event.accountId !== context.accountId ||
        event.actorId !== context.actorId ||
        event.tripId !== context.tripId
      )
        throw Error("ENRICHMENT_METER_SCOPE");
    }
    return {
      async admit(event, plan, signal) {
        identity(event);
        signal.throwIfAborted();
        const current = await scope(context, event.idempotencyKey, event.requestDigest);
        if (
          !current.logical_request_id ||
          plan.cacheHit ||
          plan.maxSearchCalls !== 1 ||
          plan.maxLlmCalls !== 1 ||
          plan.currency !== "USD" ||
          BigInt(deps.costGuardEnabled === false ? plan.searchEstimateNanos : plan.estimatedNanos) >
            BigInt(profile.target_nanos)
        )
          throw Error("ENRICHMENT_METER_PLAN");
        return { allowed: true, receiptId: current.logical_request_id };
      },
      async observeStep(event) {
        identity(event);
        const result = await invoke(context, "flight_enrichment_step_receipt", {
          kind: event.kind,
          idempotency_key: event.idempotencyKey,
          logical_sha256: event.requestDigest,
        });
        if (result === null) {
          await appendFlightEnrichmentUsage(deps.gateway(context), event, null);
          return;
        }
        const stored = z
          .object({
            call: callSchema,
            hold: z.object({
              input_ceiling: z.number().int().nonnegative(),
              output_ceiling: z.number().int().nonnegative(),
              worst_cost_nanos: z.string().regex(/^[0-9]+$/),
            }),
          })
          .parse(result);
        const r = stored.call;
        if (
          r.account_id !== context.accountId ||
          r.user_id !== context.actorId ||
          r.trip_id !== context.tripId ||
          r.task_id !== event.usageReceiptId
        )
          throw Error("ENRICHMENT_METER_RECEIPT_SCOPE");
        const response = await raw(context.accountId, r.call_id);
        const responseBinding = response
          ? storedResponseSchema.parse(response.binding)
          : null;
        if (
          responseBinding &&
          (responseBinding.requestSha256 !== r.input_sha256 ||
            response!.pin.sha256 !== responseBinding.responseSha256)
        )
          throw Error("ENRICHMENT_RESPONSE_RECEIPT_SCOPE");
        const eventSha256 = persistenceDigest(event);
        const receiptId = observationKey(eventSha256);
        let retained = await raw(context.accountId, receiptId);
        if (!retained) {
          const receipt = enrichmentUsageReceiptSchema.parse({
            accountId: event.accountId,
            actorId: event.actorId,
            tripId: event.tripId,
            requestId: event.requestId,
            idempotencyKey: event.idempotencyKey,
            requestDigest: event.requestDigest,
            usageReceiptId: event.usageReceiptId,
            stepReceiptId: r.call_id,
            stepId: event.stepId,
            kind: event.kind,
            callId: r.call_id,
            priceScheduleId: r.price_schedule_id,
            rowRevision: r.row_revision,
            publicationFence: r.publication_fence,
            dispatchState: r.dispatch_state,
            observationId: randomUUID(),
            observedAt: deps.now(),
            responseSha256: responseBinding?.responseSha256 ?? null,
            httpStatus: responseBinding?.httpStatus ?? null,
            inputCeiling: stored.hold.input_ceiling,
            outputCeiling: stored.hold.output_ceiling,
            maxCostNanos: stored.hold.worst_cost_nanos,
          });
          const binding = observationBindingSchema.parse({
            version: 1,
            eventSha256,
            receipt,
          });
          const bytes = Buffer.from(JSON.stringify(binding));
          const reference = randomUUID();
          await deps.stores.custody.put({
            accountId: context.accountId,
            reservationId: reference,
            sha256: sha(bytes),
            byteCount: bytes.length,
            bytes,
          });
          try {
            await deps.stores.retainRaw(
              context.accountId,
              receiptId,
              { reference, sha256: sha(bytes), byteCount: bytes.length },
              binding,
            );
          } catch (error) {
            if (!(await raw(context.accountId, receiptId))) throw error;
          }
          retained = await raw(context.accountId, receiptId);
        }
        if (!retained) throw Error("ENRICHMENT_METER_CUSTODY_UNAVAILABLE");
        const binding = observationBindingSchema.parse(retained.binding);
        if (binding.eventSha256 !== eventSha256)
          throw Error("ENRICHMENT_METER_RECEIPT_SCOPE");
        await deps.stores.custody.read({ accountId: context.accountId, ...retained.pin });
        await appendFlightEnrichmentUsage(deps.gateway(context), event, binding.receipt);
      },
      async finish(event) {
        identity(event);
        if (!event.summaryOnly) throw Error("ENRICHMENT_SUMMARY_ONLY");
      },
    };
  }
  return {
    reserve,
    usage,
    async available(context: TrustedContext) {
      try {
        await scope(context, null, null);
        return true;
      } catch {
        return false;
      }
    },
  };
}
