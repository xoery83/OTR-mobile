import { createHash } from "node:crypto";
import { z } from "zod";
import {
  inboundSubmitSchema,
  inboundStatusSchema,
  inboundDecisionSchema,
  type InboundScope,
  type InboundPackage,
  type InboundDecision,
} from "../../src/domain/intelligence/inboundImportPackage";
import {
  createClosedPersistenceGateway,
  verifiedCallContextSchema,
  persistenceDigest,
  commandDigest,
  type ProtectedCommand,
  type VerifiedCallContextV1,
  type PrivateMaterialCustody,
} from "./externalIntegrationPersistence";
import { canonicalEventJson, type Json } from "../../src/domain/trip/eventIntentJson";
import {
  interpretFlightBatch,
  FLIGHT_INTERPRETATION_SCHEMA,
  type FlightInterpretationBatch,
  type FlightCandidateSet,
} from "../../src/data/interpretation/flightInterpretation";
import {
  projectFlightClosure,
  type FlightClosureChoices,
} from "../../src/data/interpretation/flightClosureProjection";
import {
  flightReviewSchema,
  flightConfirmationIntentSchema,
  importDigest,
} from "../../src/domain/trip/flightImportReview";
import { flightDeferredReview } from "../../src/domain/trip/flightImportClosure";
import type { createFlightImportClosureOrchestrator } from "../../src/data/repositories/flightImportClosureOrchestrator";
import {
  captureAccountRequestContext,
  assertAccountRequestContext,
  withAccountApplyGate,
  type AccountRequestContext,
} from "../../src/data/auth/accountRequestContext";

type Closure = ReturnType<typeof createFlightImportClosureOrchestrator>;
type Contexts = Parameters<Closure["assess"]>[2];
type Assessment = Awaited<ReturnType<Closure["assess"]>>;
const json = (v: unknown) => canonicalEventJson(v as Json);
const hash = async (v: Uint8Array) => createHash("sha256").update(v).digest("hex");
const epoch = "2000-01-01T00:00:00Z";
const uuid = z.uuid();
const sha = z.string().regex(/^[0-9a-f]{64}$/);
const positive = z.number().int().positive().safe();
export function inboundRequestDigest(raw: Record<string, unknown>) {
  const { request_sha256: _, ...request } = raw;
  void _;
  return persistenceDigest({ domain: "otr-inbound-client-request-v1", request });
}
// Request-scoped opaque IDs, never occurrence identity or no-commit proof.
export function inboundId(...pins: unknown[]) {
  const d = persistenceDigest({ domain: "otr-inbound-identity-v1", pins });
  return `${d.slice(0, 8)}-${d.slice(8, 12)}-4${d.slice(13, 16)}-a${d.slice(17, 20)}-${d.slice(20, 32)}`;
}
const safeSchema = z.strictObject({
  version: z.literal(1),
  state: z.enum(["NEEDS_REVIEW", "DEFERRED"]),
  reservation_id: uuid,
  result_sha256: sha,
});
const packageRowSchema = z.object({
  reservation_id: uuid,
  package_id: uuid,
  account_id: uuid,
  client_identity_id: uuid,
  integration_id: z.string(),
  trip_id: uuid.nullable(),
  package_sha256: sha,
  row_revision: positive,
  publication_fence: positive,
  review_version: positive,
  result_version: positive.nullable(),
  result_sha256: sha.nullable(),
  safe_result: safeSchema.nullable(),
  package_material_reference: uuid.nullable(),
  state: z.string(),
  publication_refs: z.array(z.unknown()),
});
type PackageRow = z.infer<typeof packageRowSchema>;
const invocationSchema = z.object({
  invocation_id: uuid,
  reservation_id: uuid,
  call_id: uuid,
  state: z.string(),
  row_revision: positive,
  publication_fence: positive,
  request_sha256: sha,
  call: z.object({ config_version: positive, configuration_sha256: sha }).optional(),
  response_sha256: sha.nullable(),
  safe_response: z
    .object({
      version: z.literal(1),
      state: z.literal("COMPLETE"),
      reservation_id: uuid,
      result_sha256: sha,
    })
    .nullable(),
});
const decisionRowSchema = z.object({
  review_decision_id: uuid,
  reservation_id: uuid,
  review_key: uuid,
  decision_sha256: sha,
  review_version: positive,
  candidate_id: uuid,
  candidate_sha256: sha,
  base_revision: positive.nullable(),
  disposition: z.enum(["ACCEPT", "REJECT", "DEFER"]),
  confirmation_id: uuid.nullable(),
  slot_id: uuid.nullable(),
  operation_key: uuid.nullable(),
  intended_event_id: uuid.nullable(),
  input_identity_map: z.record(z.string(), uuid),
  confirmed_user_id: uuid,
  confirmed_at: z.string(),
  row_revision: positive,
  publication_fence: positive,
  state: z.enum(["RESERVED", "UNKNOWN", "PREPARED", "REJECTED", "DEFERRED"]),
  safe_result: z.record(z.string(), z.unknown()).nullable(),
  result_sha256: sha.nullable(),
});
type DecisionRow = z.infer<typeof decisionRowSchema>;
export type InboundProjection = {
  version: 1;
  reservation_id: string;
  package_id: string;
  review_version: number;
  state: "NEEDS_REVIEW" | "DEFERRED";
  unsupported_items: number;
  candidates: {
    candidate_id: string;
    candidate_sha256: string;
    run_id: string;
    run_generation: number;
    input_sha256: string;
    closure: string;
    action: string;
    event_id: string | null;
    base_revision: number | null;
  }[];
};
// Content only. Server83's digest/version selects the admitted projection. This
// injected seam uses accepted private custody; it is not a proposal authority/store.
export type InboundProjectionMaterial = {
  proposal: InboundProjection;
  set: FlightCandidateSet | null;
  choices: Record<string, FlightClosureChoices>;
  contexts: Contexts;
};
export function createClosedInboundAiClient(deps: {
  mode: "TEST_ONLY";
  verify(input: {
    action: "SUBMIT" | "STATUS" | "REVIEW";
    requestId: string;
    requestSha256: string;
    environment: "TEST";
  }): Promise<VerifiedCallContextV1 | null>;
  execute: Parameters<typeof createClosedPersistenceGateway>[0]["execute"];
  verifyCustody: NonNullable<
    Parameters<typeof createClosedPersistenceGateway>[0]["verifyCustody"]
  >;
  custody: PrivateMaterialCustody;
  // Trusted projections of existing authority, as in the accepted A2 read seam.
  // No production read gateway, credentials or default implementation is installed.
  readPackage(scope: InboundScope): Promise<unknown>;
  readInvocation(scope: InboundScope, requestId: string): Promise<unknown | null>;
  readDecision(scope: InboundScope, key: string): Promise<unknown | null>;
  readPublishedRun(
    context: AccountRequestContext,
    runId: string,
  ): Promise<{ generation: number; input_sha256: string }>;
  readIntegration(
    scope: InboundScope,
  ): Promise<{ config_version: number; config_sha256: string }>;
  projectionMaterial: {
    retain(
      scope: InboundScope,
      digest: string,
      body: InboundProjectionMaterial,
    ): Promise<void>;
    read(scope: InboundScope, digest: string): Promise<InboundProjectionMaterial | null>;
  };
  admit(
    scope: InboundScope,
    p: InboundPackage,
    runId: string,
  ): Promise<FlightInterpretationBatch | null>;
  publish(context: AccountRequestContext, set: FlightCandidateSet): Promise<void>;
  reviewContext(
    set: FlightCandidateSet,
  ): Promise<{ choices: Record<string, FlightClosureChoices>; contexts: Contexts }>;
  closure: Closure;
  // Existing CP13A exact preparation/queue/receipt recovery; never execute a command.
  readExactPreparation(
    context: AccountRequestContext,
    row: DecisionRow,
  ): Promise<{ intent: unknown; command: Json | null } | null>;
  getAccountId(): Promise<string>;
  now(): string;
}) {
  if (deps.mode !== "TEST_ONLY") throw new Error("INBOUND_RUNTIME_CLOSED");
  function parse<T>(schema: z.ZodType<T>, raw: unknown): T {
    try {
      if (new TextEncoder().encode(json(raw)).length > 4194304) throw new Error();
      const p = schema.parse(structuredClone(raw));
      if (
        inboundRequestDigest(p as Record<string, unknown>) !==
        (p as { request_sha256: string }).request_sha256
      )
        throw new Error();
      return p;
    } catch {
      throw new Error("INVALID_INBOUND_REQUEST");
    }
  }
  async function session(
    raw: {
      request_id: string;
      request_sha256: string;
      environment: "TEST";
      scope: InboundScope;
    },
    action: "SUBMIT" | "STATUS" | "REVIEW",
    c: AccountRequestContext,
  ) {
    const v = await deps.verify({
      action,
      requestId: raw.request_id,
      requestSha256: raw.request_sha256,
      environment: raw.environment,
    });
    if (!v) throw new Error("INBOUND_AUTH_REQUIRED");
    const a = verifiedCallContextSchema.parse(v),
      s = raw.scope;
    if (
      a.command_kind !== action ||
      a.request_id !== raw.request_id ||
      a.request_sha256 !== raw.request_sha256 ||
      a.verified_environment !== "TEST" ||
      a.revoked ||
      Date.parse(a.expires_at) <= Date.parse(deps.now()) ||
      Date.parse(a.verified_at) > Date.parse(deps.now()) ||
      a.verified_actor_id !== s.account_id ||
      a.verified_account_id !== s.account_id ||
      a.verified_client_identity !== s.client_identity_id ||
      !a.verified_external_subject ||
      a.gateway_identity !== "otr_external_integration_inbound_gateway" ||
      (action === "REVIEW"
        ? a.principal_kind !== "OTR_USER"
        : !["EXTERNAL_CLIENT", "OTR_USER"].includes(a.principal_kind))
    )
      throw new Error("INBOUND_AUTH_REQUIRED");
    await assertAccountRequestContext(c, deps.getAccountId);
    if (c.accountId !== s.account_id) throw new Error("INBOUND_SCOPE");
    return a;
  }
  async function invoke(
    raw: Parameters<typeof session>[0],
    action: Parameters<typeof session>[1],
    c: AccountRequestContext,
    kind: ProtectedCommand,
    fields: Record<string, unknown>,
  ) {
    const a = await session(raw, action, c);
    const body = {
      version: 1,
      environment: "TEST",
      request_id: inboundId(raw.request_id, kind),
      ...raw.scope,
      ...fields,
    };
    const command = { ...body, request_sha256: commandDigest(body) };
    const gateway = createClosedPersistenceGateway({
      gatewayIdentity: "otr_external_integration_inbound_gateway",
      now: deps.now,
      verifyCustody: deps.verifyCustody,
      execute: deps.execute,
      verify: async (r) => ({
        ...a,
        request_id: r.requestId,
        request_sha256: r.requestSha256,
        command_kind: r.command,
      }),
    });
    const result = await gateway.invoke(kind, command);
    await assertAccountRequestContext(c, deps.getAccountId);
    return result;
  }
  async function authorizedPackage(
    raw: Parameters<typeof session>[0],
    action: Parameters<typeof session>[1],
    c: AccountRequestContext,
  ) {
    const row = packageRowSchema.parse(await deps.readPackage(raw.scope));
    if (
      row.package_id !== raw.scope.package_id ||
      row.account_id !== raw.scope.account_id ||
      row.client_identity_id !== raw.scope.client_identity_id ||
      row.integration_id !== raw.scope.integration_id ||
      row.trip_id !== raw.scope.trip_id
    )
      throw new Error("INBOUND_SCOPE");
    const status = z
      .object({
        reservation_id: uuid,
        state: z.string(),
        result_sha256: sha.nullable(),
        result_version: positive.nullable(),
      })
      .parse(
        await invoke(raw, action, c, "inbound_ai_status", {
          reservation_id: row.reservation_id,
        }),
      );
    if (
      status.reservation_id !== row.reservation_id ||
      status.result_sha256 !== row.result_sha256 ||
      status.result_version !== row.result_version ||
      status.state !== row.state
    )
      throw new Error("INBOUND_STALE_PROJECTION");
    return row;
  }
  async function projection(row: PackageRow, scope: InboundScope) {
    if (!row.safe_result || !row.result_sha256)
      throw new Error("INBOUND_EXACT_RECOVERY_REQUIRED");
    const material = await deps.projectionMaterial.read(
      scope,
      row.safe_result.result_sha256,
    );
    if (
      !material ||
      persistenceDigest(material) !== row.safe_result.result_sha256 ||
      persistenceDigest({
        domain: "otr-cp14-reservation-result-v1",
        result: row.safe_result,
      }) !== row.result_sha256 ||
      material.proposal.package_id !== row.package_id ||
      material.proposal.reservation_id !== row.reservation_id ||
      material.proposal.review_version !== row.review_version ||
      material.proposal.state !== row.state
    )
      throw new Error("INBOUND_EXACT_RECOVERY_REQUIRED");
    return structuredClone(material);
  }
  async function disclose(
    raw: Parameters<typeof session>[0],
    c: AccountRequestContext,
    body: InboundProjectionMaterial,
    action: Parameters<typeof session>[1],
  ) {
    const row = await authorizedPackage(raw, action, c);
    if (row.safe_result?.result_sha256 !== persistenceDigest(body))
      throw new Error("INBOUND_STALE_PROJECTION");
    return withAccountApplyGate(async () => {
      await assertAccountRequestContext(c, deps.getAccountId);
      return {
        proposal: body.proposal,
        proposal_sha256: persistenceDigest(body),
        canonical_acceptance: false as const,
      };
    });
  }
  async function materials(batch: FlightInterpretationBatch, p: InboundPackage) {
    const refs = new Set(p.materials.map((m) => m.reference));
    for (const m of p.materials) {
      const r = batch.catalog.trip_source_representations.find(
        (r) => r.id === m.reference,
      );
      if (
        !r ||
        r.role !== "ORIGINAL" ||
        r.material_kind === "LOCATOR" ||
        r.payload_sha256 !== m.sha256 ||
        r.byte_count !== m.byte_count
      )
        throw new Error("INBOUND_MATERIAL_INVALID");
    }
    for (const m of batch.request.materials) {
      const seen = new Set<string>();
      function ancestry(id: string): boolean {
        if (seen.has(id)) return false;
        if (seen.size >= 64) throw new Error("INBOUND_MATERIAL_INVALID");
        seen.add(id);
        const r = batch.catalog.trip_source_representations.find(
          (r) => r.id === id && r.source_id === m.pin.source_id,
        );
        if (!r) throw new Error("INBOUND_MATERIAL_INVALID");
        return refs.has(r.id) || r.parent_ids.some(ancestry);
      }
      if (
        !ancestry(m.pin.representation_id) ||
        (await hash(new TextEncoder().encode(m.text))) !== m.pin.payload_sha256
      )
        throw new Error("INBOUND_MATERIAL_INVALID");
    }
    // Summaries never enter the material set or the deterministic interpreter.
    if (
      p.summaries.some((s) =>
        batch.request.materials.some((m) => m.pin.representation_id === s.reference),
      )
    )
      throw new Error("INBOUND_SUMMARY_IS_ADVISORY");
  }
  return {
    async submit(raw: unknown) {
      const r = parse(inboundSubmitSchema, raw),
        s = r.scope,
        p = r.package;
      const c = await captureAccountRequestContext(s.trip_id ?? "", deps.getAccountId);
      await session(r, "SUBMIT", c);
      if (
        p.account_id !== s.account_id ||
        p.client_identity_id !== s.client_identity_id ||
        p.package_id !== s.package_id ||
        (p.trip_intent.kind === "KNOWN" ? p.trip_intent.trip_id : null) !== s.trip_id
      )
        throw new Error("INBOUND_SCOPE");
      const digest = persistenceDigest(p),
        reservationId = inboundId(s.integration_id, s.account_id, p.idempotency_key),
        runId = inboundId(reservationId, "run");
      const row = {
        reservation_id: reservationId,
        integration_id: s.integration_id,
        client_identity_id: s.client_identity_id,
        account_id: s.account_id,
        user_id: s.account_id,
        grant_id: s.grant_id,
        admitted_grant_revision: s.grant_revision,
        package_id: p.package_id,
        package_version: 1,
        contract_version: p.contract_version,
        idempotency_key: p.idempotency_key,
        package_sha256: digest,
        package_bytes: new TextEncoder().encode(json(p)).length,
        trip_intent_kind: p.trip_intent.kind,
        trip_id: s.trip_id,
        package_material_reference: null,
        package_material_sha256: null,
        material_admission_sha256: null,
        import_id: null,
        task_id: null,
        publication_refs: [],
        review_version: 1,
        state: "RESERVED",
        recovery_disposition: "EXACT_RECOVERY_REQUIRED",
        row_revision: 1,
        publication_fence: 1,
        result_version: null,
        result_sha256: null,
        safe_result: null,
        safe_reason: null,
        created_at: epoch,
        updated_at: epoch,
        completed_at: null,
      };
      let pkg = packageRowSchema.parse(
        await invoke(r, "SUBMIT", c, "inbound_ai_reserve_package", { row }),
      );
      if (pkg.package_sha256 !== digest || pkg.reservation_id !== reservationId)
        throw new Error("INBOUND_PACKAGE_BINDING");
      const invokeId = inboundId(r.request_id, "invocation"),
        requestId = inboundId(r.request_id, "inbound_ai_reserve_invocation"),
        callId = inboundId(invokeId, "call");
      const old = await deps.readInvocation(s, requestId);
      const retainedInvocation = old ? invocationSchema.parse(old) : null;
      if (retainedInvocation) {
        const inv = retainedInvocation;
        if (
          inv.invocation_id !== invokeId ||
          inv.request_sha256 !== r.request_sha256 ||
          inv.reservation_id !== reservationId ||
          inv.call_id !== callId
        )
          throw new Error("INBOUND_CHANGED_REQUEST");
        if (inv.state === "COMPLETE") {
          const response = inv.safe_response;
          if (
            !response ||
            response.reservation_id !== reservationId ||
            persistenceDigest({ domain: "otr-cp14-safe-response-v1", response }) !==
              inv.response_sha256
          )
            throw new Error("INBOUND_EXACT_RECOVERY_REQUIRED");
          const body = await deps.projectionMaterial.read(s, response.result_sha256);
          if (
            !body ||
            persistenceDigest(body) !== response.result_sha256 ||
            body.proposal.reservation_id !== reservationId ||
            body.proposal.package_id !== p.package_id
          )
            throw new Error("INBOUND_EXACT_RECOVERY_REQUIRED");
          await authorizedPackage(r, "SUBMIT", c);
          return withAccountApplyGate(async () => {
            await assertAccountRequestContext(c, deps.getAccountId);
            return {
              proposal: body.proposal,
              proposal_sha256: response.result_sha256,
              canonical_acceptance: false as const,
            };
          });
        }
        if (inv.state === "UNKNOWN") throw new Error("INBOUND_EXACT_RECOVERY_REQUIRED");
      }
      if (pkg.safe_result && r.expected_review_version === 0)
        return disclose(r, c, await projection(pkg, s), "SUBMIT");
      if (pkg.safe_result && pkg.review_version !== r.expected_review_version)
        throw new Error("INBOUND_STALE_REVIEW");
      if (!pkg.package_material_reference) {
        const bytes = new TextEncoder().encode(json(p));
        const stored = await deps.custody.put({
          accountId: s.account_id,
          reservationId,
          sha256: digest,
          byteCount: bytes.length,
          bytes,
        });
        pkg = packageRowSchema.parse(
          await invoke(r, "SUBMIT", c, "inbound_ai_attach_material", {
            reservation_id: reservationId,
            expected_revision: pkg.row_revision,
            material_reference: stored.reference,
            material_sha256: digest,
            material_admission_sha256: persistenceDigest({
              reservationId,
              reference: stored.reference,
              digest,
            }),
          }),
        );
      }
      // Reconstruct an interrupted reservation with its original configuration pins.
      if (retainedInvocation && !retainedInvocation.call)
        throw new Error("INBOUND_EXACT_RECOVERY_REQUIRED");
      const config = retainedInvocation
        ? {
            config_version: retainedInvocation.call!.config_version,
            config_sha256: retainedInvocation.call!.configuration_sha256,
          }
        : await deps.readIntegration(s);
      const call = {
        call_id: callId,
        integration_id: s.integration_id,
        environment: "TEST",
        provider_config_id: null,
        provider_id: null,
        model_id: null,
        model_version: null,
        adapter_version: null,
        config_version: config.config_version,
        configuration_sha256: config.config_sha256,
        account_id: s.account_id,
        user_id: s.account_id,
        billing_subject_id: null,
        trip_id: s.trip_id,
        import_id: null,
        task_id: null,
        attempt_id: null,
        fallback_chain_id: null,
        shadow_of_call_id: null,
        evaluation_reference: null,
        attempt_sequence: null,
        invocation_id: invokeId,
        request_id: requestId,
        idempotency_key: invokeId,
        request_sha256: r.request_sha256,
        input_sha256: digest,
        schema_sha256: await importDigest(
          "otr-flight-interpretation-schema-v1",
          FLIGHT_INTERPRETATION_SCHEMA as Json,
          hash,
        ),
        capability: "SUBMIT",
        task_class: "INBOUND",
        call_kind: "INBOUND_TOOL",
        shadow: false,
        price_schedule_id: null,
        admitted_at: epoch,
        admission_sha256: digest,
        publication_fence: pkg.publication_fence,
        row_revision: 1,
        dispatch_state: "RESERVED",
        execution_certainty: "NOT_STARTED",
        dispatch_marked_at: null,
        terminal_observed_at: null,
        safe_reason: null,
      };
      const start = {
        observation_id: callId,
        call_id: callId,
        observation_key: "start",
        observation_version: 1,
        observation_kind: "START",
        measurement_mode: "NONE",
        observed_at: epoch,
        received_at: epoch,
        started_at: null,
        ended_at: null,
        latency_ms: null,
        status: "STARTED",
        outcome: null,
        response_sha256: null,
        publication_sha256: null,
        input_tokens: null,
        output_tokens: null,
        total_tokens: null,
        cached_input_tokens: null,
        reasoning_tokens: null,
        image_units: null,
        audio_units: null,
        call_count: null,
        bytes: null,
        wall_ms: null,
        cpu_ms: null,
        gpu_ms: null,
        accelerator_ms: null,
        other_units: {},
        provider_extension: {},
        usage_quality: "UNKNOWN",
        unit_quality: {},
        price_schedule_id: null,
        cost_nanos: null,
        currency: null,
        cost_quality: "UNKNOWN",
        cost_calculation_version: null,
        supersedes_observation_id: null,
        observation_sha256: persistenceDigest({ callId, digest }),
      };
      const inv = invocationSchema.parse(
        await invoke(r, "SUBMIT", c, "inbound_ai_reserve_invocation", {
          row: {
            invocation_id: invokeId,
            reservation_id: reservationId,
            integration_id: s.integration_id,
            client_identity_id: s.client_identity_id,
            account_id: s.account_id,
            user_id: s.account_id,
            grant_id: s.grant_id,
            admitted_grant_revision: s.grant_revision,
            action: "SUBMIT",
            request_id: requestId,
            request_sha256: r.request_sha256,
            call_id: callId,
            publication_fence: pkg.publication_fence,
            row_revision: 1,
            state: "RESERVED",
            response_version: null,
            response_sha256: null,
            safe_response: null,
            created_at: epoch,
            updated_at: epoch,
            completed_at: null,
          },
          call,
          start,
        }),
      );
      if (
        inv.invocation_id !== invokeId ||
        inv.call_id !== callId ||
        inv.request_sha256 !== r.request_sha256
      )
        throw new Error("INBOUND_INVOCATION_BINDING");
      let set: FlightCandidateSet | null = null,
        choices: Record<string, FlightClosureChoices> = {},
        contexts: Contexts = {},
        assessment: Assessment | null = null;
      if (pkg.safe_result) {
        const previous = await projection(pkg, s);
        set = previous.set;
      } else if (s.trip_id) {
        const batch = await deps.admit(s, p, runId);
        if (batch) {
          if (
            batch.request.binding.run_id !== runId ||
            batch.request.binding.account_id !== s.account_id ||
            batch.request.binding.trip_id !== s.trip_id
          )
            throw new Error("INBOUND_RUN_BINDING");
          await materials(batch, p);
          set = await interpretFlightBatch(batch, {
            sha256: hash,
            getAccountId: deps.getAccountId,
            now: deps.now,
          });
          await authorizedPackage(r, "SUBMIT", c);
          await deps.publish(c, set); // Existing immutable/idempotent C publication, stable Run IDs.
        }
      }
      if (set) {
        ({ choices, contexts } = await deps.reviewContext(set));
        const view = projectFlightClosure(set, choices);
        assessment = await deps.closure.assess(c, view, contexts);
      }
      const proposal: InboundProjection = {
        version: 1,
        reservation_id: reservationId,
        package_id: p.package_id,
        review_version: pkg.safe_result ? pkg.review_version + 1 : 1,
        state: set ? "NEEDS_REVIEW" : "DEFERRED",
        unsupported_items: p.items.filter((i) => i.family === "OTHER").length,
        candidates:
          assessment?.plans.map((plan) => ({
            candidate_id: plan.candidate.id,
            candidate_sha256: plan.candidate.proposal_sha256,
            run_id: set!.run_id,
            run_generation: set!.run_generation,
            input_sha256: set!.input_sha256,
            closure: plan.closure,
            action: plan.outcome,
            event_id: plan.target?.eventId ?? null,
            base_revision: plan.target?.semanticRevision ?? null,
          })) ?? [],
      };
      const body = { proposal, set, choices, contexts },
        resultDigest = persistenceDigest(body);
      if (new TextEncoder().encode(json(body)).length > 4194304)
        throw new Error("INBOUND_RESOURCE_LIMIT");
      await deps.projectionMaterial.retain(s, resultDigest, body);
      pkg = await authorizedPackage(r, "SUBMIT", c);
      const result = {
          version: 1,
          state: proposal.state,
          reservation_id: reservationId,
          result_sha256: resultDigest,
        },
        response = {
          version: 1,
          state: "COMPLETE",
          reservation_id: reservationId,
          result_sha256: resultDigest,
        };
      await invoke(r, "SUBMIT", c, "inbound_ai_complete_invocation", {
        invocation_id: invokeId,
        expected_revision: inv.row_revision,
        publication_fence: inv.publication_fence,
        state: "COMPLETE",
        response_version: 1,
        response_sha256: persistenceDigest({
          domain: "otr-cp14-safe-response-v1",
          response,
        }),
        safe_response: response,
        reservation_update: {
          expected_revision: pkg.row_revision,
          publication_fence: pkg.publication_fence,
          state: proposal.state,
          import_id: set?.batch_id ?? null,
          task_id: null,
          publication_refs:
            set?.candidates.map((candidate) => ({
              kind: "RUN",
              run_id: set!.run_id,
              generation: set!.run_generation,
              input_sha256: set!.input_sha256,
              candidate_id: candidate.id,
              candidate_sha256: candidate.proposal_sha256,
            })) ?? [],
          review_version: proposal.review_version,
          result_version: (pkg.result_version ?? 0) + 1,
          result_sha256: persistenceDigest({
            domain: "otr-cp14-reservation-result-v1",
            result,
          }),
          safe_result: result,
          safe_reason: set ? null : "MATERIAL_UNAVAILABLE",
        },
      });
      return disclose(r, c, body, "SUBMIT");
    },
    async status(raw: unknown) {
      const r = parse(inboundStatusSchema, raw),
        c = await captureAccountRequestContext(r.scope.trip_id ?? "", deps.getAccountId);
      await session(r, "STATUS", c);
      const pkg = await authorizedPackage(r, "STATUS", c);
      if (!pkg.safe_result)
        return {
          state: pkg.state,
          reservation_id: pkg.reservation_id,
          canonical_acceptance: false,
        };
      return disclose(r, c, await projection(pkg, r.scope), "STATUS");
    },
    async decide(raw: unknown) {
      const r: InboundDecision = parse(inboundDecisionSchema, raw),
        c = await captureAccountRequestContext(r.scope.trip_id ?? "", deps.getAccountId);
      const a = await session(r, "REVIEW", c);
      if (!r.scope.trip_id) throw new Error("INBOUND_TRIP_REQUIRED");
      const pkg = await authorizedPackage(r, "REVIEW", c);
      const old = await deps.readDecision(r.scope, r.review_key);
      const retained = old ? decisionRowSchema.parse(old) : null;
      const decisionDigest = persistenceDigest({
        domain: "otr-inbound-decision-v1",
        decision: r,
      });
      if (
        retained &&
        (retained.decision_sha256 !== decisionDigest ||
          retained.reservation_id !== pkg.reservation_id ||
          retained.review_decision_id !== inboundId(pkg.reservation_id, r.review_key) ||
          retained.confirmed_user_id !== a.verified_actor_id)
      )
        throw new Error("INBOUND_CHANGED_DECISION");
      async function decisionResult(row: DecisionRow, state = row.state) {
        await authorizedPackage(r, "REVIEW", c);
        return withAccountApplyGate(async () => {
          await assertAccountRequestContext(c, deps.getAccountId);
          return {
            state,
            confirmation_id: row.confirmation_id,
            slot_id: row.slot_id,
            operation_key: row.operation_key,
            intended_event_id: row.intended_event_id,
            input_identity_map: row.input_identity_map,
            canonical_acceptance: false as const,
          };
        });
      }
      async function preparationDigest(
        saved: DecisionRow,
        prepared: { intent: unknown },
      ) {
        const intent = flightConfirmationIntentSchema.parse(prepared.intent),
          slot = intent.slots[0];
        if (
          intent.id !== saved.confirmation_id ||
          intent.confirmation_key !== saved.review_key ||
          intent.slots.length !== 1 ||
          slot.slot_id !== saved.slot_id ||
          slot.domain_operation_key !== saved.operation_key ||
          slot.intended_target_id !== saved.intended_event_id ||
          slot.candidate_id !== r.candidate_id ||
          slot.base_revision !== r.base_revision ||
          json(intent.inputs.map((i) => i.id).sort()) !==
            json(Object.values(saved.input_identity_map).sort())
        )
          throw new Error("INBOUND_PREPARATION_BINDING");
        return await importDigest(
          "otr-source-confirmation-v1",
          [1, c.accountId, c.tripId, intent] as Json,
          hash,
        );
      }
      async function finish(saved: DecisionRow, preparationSha: string | null) {
        const accept = saved.disposition === "ACCEPT";
        const state = accept
          ? "PREPARED"
          : saved.disposition === "REJECT"
            ? "REJECTED"
            : "DEFERRED";
        const result = accept
          ? {
              version: 1,
              state,
              review_decision_id: saved.review_decision_id,
              confirmation_id: saved.confirmation_id,
              slot_id: saved.slot_id,
              operation_key: saved.operation_key,
              event_id: saved.intended_event_id,
            }
          : {
              version: 1,
              state,
              review_decision_id: saved.review_decision_id,
              safe_reason:
                saved.disposition === "REJECT" ? "USER_REJECTED" : "USER_DEFERRED",
            };
        await authorizedPackage(r, "REVIEW", c);
        await invoke(r, "REVIEW", c, "inbound_ai_observe_review", {
          review_decision_id: saved.review_decision_id,
          expected_revision: saved.row_revision,
          publication_fence: saved.publication_fence,
          state,
          preparation_sha256: preparationSha,
          result_sha256: persistenceDigest({
            domain: "otr-cp14-safe-review-result-v1",
            result,
          }),
          safe_result: result,
        });
        return decisionResult(saved, state);
      }
      // A sealed historical decision is recovery, not acceptance of a stale proposal.
      if (retained?.safe_result) {
        if (
          persistenceDigest({
            domain: "otr-cp14-safe-review-result-v1",
            result: retained.safe_result,
          }) !== retained.result_sha256
        )
          throw new Error("INBOUND_EXACT_RECOVERY_REQUIRED");
        return decisionResult(retained);
      }
      if (retained?.disposition === "ACCEPT") {
        const prepared = await deps.readExactPreparation(c, retained);
        // Recover an already persisted intent even if the proposal subsequently refreshed.
        // This records prior preparation, never accepts or rebases the old proposal.
        if (prepared)
          return finish(retained, await preparationDigest(retained, prepared));
      }
      const body = await projection(pkg, r.scope);
      if (
        r.review_version !== pkg.review_version ||
        r.proposal_sha256 !== persistenceDigest(body) ||
        !body.set
      )
        throw new Error("INBOUND_STALE_REVIEW");
      const item = body.proposal.candidates.find(
        (i) => i.candidate_id === r.candidate_id,
      );
      if (
        !item ||
        [
          "candidate_sha256",
          "run_id",
          "run_generation",
          "input_sha256",
          "event_id",
          "base_revision",
        ].some((k) => item[k as keyof typeof item] !== r[k as keyof InboundDecision])
      )
        throw new Error("INBOUND_STALE_REVIEW");
      const currentRun = await deps.readPublishedRun(c, r.run_id);
      if (
        currentRun.generation !== r.run_generation ||
        currentRun.input_sha256 !== r.input_sha256
      )
        throw new Error("INBOUND_STALE_REVIEW");
      const view = projectFlightClosure(body.set, body.choices);
      const settings = await deps.reviewContext(body.set);
      const assessed = await deps.closure.assess(
        c,
        view,
        settings.contexts,
        retained?.slot_id ?? undefined,
      );
      const plan = assessed.plans.find((p) => p.candidate.id === r.candidate_id);
      if (
        !plan ||
        // CP13B can retain the displayed Candidate while reporting stale owning
        // evidence. Freshness gates every new disposition; READY gates ACCEPT only.
        (!retained &&
          plan.reasons.some((reason) =>
            [
              "INPUT_STALE",
              "STALE_BASE_REVISION",
              "CANONICAL_EVENT_MIRROR_INTEGRITY",
            ].includes(reason),
          )) ||
        plan.candidate.proposal_sha256 !== r.candidate_sha256 ||
        (plan.target?.semanticRevision ?? null) !== r.base_revision ||
        (plan.target?.eventId ?? null) !== r.event_id ||
        (r.disposition === "ACCEPT" && plan.closure !== "READY")
      )
        throw new Error("INBOUND_STALE_REVIEW");
      const key = inboundId(pkg.reservation_id, r.review_key),
        accept = r.disposition === "ACCEPT";
      const generated = {
        confirmation_id: accept ? inboundId(key, "confirmation") : null,
        slot_id: accept ? inboundId(key, "slot") : null,
        operation_key: accept ? inboundId(key, "operation") : null,
        intended_event_id: accept ? (r.event_id ?? inboundId(key, "event")) : null,
        input_identity_map: accept
          ? Object.fromEntries(
              body.set.publication_request.inputs.map((i) => [
                i.id,
                inboundId(key, "input", i.id),
              ]),
            )
          : {},
      };
      const at = retained?.confirmed_at ?? a.verified_at;
      const selection = {
        candidateId: r.candidate_id,
        disposition: r.disposition,
        confirmationId: generated.confirmation_id!,
        confirmationKey: r.review_key,
        slotId: generated.slot_id!,
        inputIds: generated.input_identity_map,
        operationKey: generated.operation_key,
        intendedEventId: generated.intended_event_id,
        review: flightReviewSchema.parse({
          schema_key: "flight-v1",
          schema_version: 1,
          normalization_version: 1,
          match_policy: "import-flight-match-v1",
          selected_fields: accept ? [...plan.selected_components].sort() : [],
          edits: {},
          association_intents: accept
            ? view.inputs.map((i) => ({ input_id: i.id, purpose: "CONFIRMED_SUPPORT" }))
            : [],
          deferred_dimensions: flightDeferredReview(plan.candidate),
        }),
        reviewedCandidateHash: r.candidate_sha256,
        reviewedBaseRevision: r.base_revision,
      };
      const decisionMaterial = { decision: r, selection };
      const bytes = new TextEncoder().encode(json(decisionMaterial)),
        materialDigest = persistenceDigest(decisionMaterial);
      const stored = await deps.custody.put({
        accountId: r.scope.account_id,
        reservationId: pkg.reservation_id,
        sha256: materialDigest,
        byteCount: bytes.length,
        bytes,
      });
      const row = {
        review_decision_id: key,
        reservation_id: pkg.reservation_id,
        review_key: r.review_key,
        decision_sha256: decisionDigest,
        package_version: 1,
        package_sha256: pkg.package_sha256,
        review_version: r.review_version,
        candidate_id: r.candidate_id,
        candidate_sha256: r.candidate_sha256,
        base_revision: r.base_revision,
        disposition: r.disposition,
        review_material_reference: stored.reference,
        review_material_sha256: materialDigest,
        confirmed_user_id: a.verified_actor_id,
        confirmed_at: at,
        confirmation_source: "EXPLICIT_USER",
        confirmation_scope: "EXACT_REVIEW_DECISION",
        ...generated,
        preparation_sha256: null,
        state: "RESERVED",
        row_revision: 1,
        publication_fence: pkg.publication_fence,
        safe_result: null,
        result_sha256: null,
        created_at: at,
        updated_at: at,
      };
      const saved =
        retained ??
        decisionRowSchema.parse(
          await invoke(r, "REVIEW", c, "inbound_ai_reserve_review", { row }),
        );
      if (
        saved.review_decision_id !== key ||
        saved.decision_sha256 !== decisionDigest ||
        saved.confirmed_user_id !== a.verified_actor_id ||
        json(generated) !==
          json(
            Object.fromEntries(
              Object.keys(generated).map((k) => [k, saved[k as keyof DecisionRow]]),
            ),
          )
      )
        throw new Error("INBOUND_DECISION_BINDING");
      if (saved.safe_result) return decisionResult(saved);
      let preparationSha: string | null = null;
      if (accept) {
        await authorizedPackage(r, "REVIEW", c);
        let prepared = await deps.readExactPreparation(c, saved);
        if (!prepared && (retained || saved.state === "UNKNOWN"))
          return decisionResult(saved, "UNKNOWN");
        if (!prepared) {
          try {
            await authorizedPackage(r, "REVIEW", c);
            prepared = await deps.closure.prepare(c, view, settings.contexts, selection);
          } catch {
            return decisionResult(saved, "UNKNOWN");
          }
        }
        preparationSha = await preparationDigest(saved, prepared);
      }
      return finish(saved, preparationSha);
    },
  };
}
