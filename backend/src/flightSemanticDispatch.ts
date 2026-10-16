import { z } from "zod";
import {
  buildDeepSeekFlightAssemblyBody,
  prepareDeepSeekFlightAssembly,
  parseDeepSeekFlightAssemblyResponse,
  type FlightAssemblyJobIdentity,
  type FlightProviderResult,
  type FlightSecretResolver,
  type FlightLiveTransport,
} from "./deepSeekFlight";
import {
  flightAssemblyModelBindingSchema,
  flightAssemblyModelProfile,
  type FlightAssemblyModelBinding,
} from "./modelTaskProfile";
import { flightVersionedReservationCommand } from "./flightDevDispatch";
import { flightModelWitness } from "./flightHostProtocol";
import {
  commandDigest,
  persistenceDigest,
  type createClosedPersistenceGateway,
} from "./externalIntegrationPersistence";
import { remoteFlightPinsSchema } from "../../src/domain/intelligence/interpretation";
import {
  attemptSchema,
  executionReportSchema,
  type Attempt,
} from "../../src/domain/intelligence/persistence";
import {
  flightAssemblyProposalSchema,
  type FlightAssemblyRequest,
} from "../../src/domain/trip/flightSemanticAssembly";
import { technicalOutputWitnessSchema } from "../../src/domain/intelligence/modelTask";
import type { createFlightPrivateCustody } from "./flightPrivateCustody";
import type { createIntelligenceContinuationRepository } from "../../src/data/repositories/intelligenceContinuationRepository";
import {
  assertAccountRequestGeneration,
  type AccountRequestContext,
} from "../../src/data/auth/accountRequestContext";

export type FlightSemanticMaterial = {
  version: "FLIGHT_ASSEMBLY_MATERIAL_V1";
  identity: FlightAssemblyJobIdentity;
  request: FlightAssemblyRequest;
  image: { base64: string; mediaType: "image/jpeg" | "image/png"; sha256: string } | null;
};
export function flightSemanticMaterialBytes(material: FlightSemanticMaterial) {
  if (material.version !== "FLIGHT_ASSEMBLY_MATERIAL_V1")
    throw new Error("POLICY_BLOCKED");
  const bytes = Buffer.from(JSON.stringify(material));
  if (bytes.length > 4194304) throw new Error("POLICY_BLOCKED");
  return bytes;
}
function prepareMaterial(m: FlightSemanticMaterial) {
  flightSemanticMaterialBytes(m);
  const image = m.image
    ? { ...m.image, bytes: Buffer.from(m.image.base64, "base64") }
    : undefined;
  if (image && image.bytes.toString("base64") !== m.image!.base64)
    throw new Error("EVIDENCE_INVALID");
  return { image, prepared: buildDeepSeekFlightAssemblyBody(m.request, image) };
}
type Stores = Awaited<ReturnType<typeof createFlightPrivateCustody>>;
type Repo = ReturnType<typeof createIntelligenceContinuationRepository>;
type Loaded = {
  material: FlightSemanticMaterial;
  modelBinding: FlightAssemblyModelBinding;
  pins: z.infer<typeof remoteFlightPinsSchema>;
  scope: {
    integration_version: number;
    grant_revision: number;
    trip_id: string;
    import_id: string;
    currency: string;
  };
  imageTokenCeiling: number | null;
  host: unknown;
  signal: AbortSignal;
  deadline: number;
};
const callSchema = z.object({
  call_id: z.uuid(),
  account_id: z.uuid(),
  attempt_id: z.uuid(),
  request_sha256: z.string(),
  publication_fence: z.number().int().positive(),
  row_revision: z.number().int().positive(),
  dispatch_state: z.enum(["RESERVED", "MAY_HAVE_STARTED", "UNKNOWN", "TERMINAL"]),
  execution_certainty: z.string(),
});

// Same CP15 reservation and private custody; no secondary job journal or host issuer.
export function createFlightSemanticExecutor(deps: {
  gateway: ReturnType<typeof createClosedPersistenceGateway>;
  repo: Pick<Repo, "readAttempt" | "authorizeResultDisclosure" | "admitExecution">;
  stores: Pick<Stores, "custody" | "retained" | "readRaw" | "retainRaw">;
  load(a: Attempt): Promise<Loaded>;
  authorizeMaterial(
    context: AccountRequestContext,
    a: Attempt,
    identity: FlightAssemblyJobIdentity,
  ): Promise<void>;
  readCall(a: Attempt): Promise<unknown>;
  resolver: FlightSecretResolver;
  send: FlightLiveTransport["send"];
  appendMeter(
    a: Attempt,
    result: FlightProviderResult,
    report: z.infer<typeof executionReportSchema>,
  ): Promise<void>;
  hash(bytes: Uint8Array): Promise<string>;
  id(): string;
  now(): string;
  monotonic(): number;
}) {
  async function load(context: AccountRequestContext, id: string) {
    const a = attemptSchema.parse(await deps.repo.readAttempt(context, id));
    const raw = await deps.load(a);
    const l = {
      ...raw,
      material: structuredClone(raw.material),
      modelBinding: structuredClone(raw.modelBinding),
      pins: structuredClone(raw.pins),
      scope: structuredClone(raw.scope),
      host: structuredClone(raw.host),
    };
    const { image, prepared } = prepareMaterial(l.material);
    if (
      image
        ? !Number.isSafeInteger(l.imageTokenCeiling) ||
          l.imageTokenCeiling! <= 0 ||
          l.imageTokenCeiling! > 1000000
        : l.imageTokenCeiling !== null
    )
      throw new Error("VISION_BUDGET_BOUND_REQUIRED");
    const b = flightAssemblyModelBindingSchema.parse(l.modelBinding);
    const p = remoteFlightPinsSchema.parse(l.pins);
    const profile = b.profile;
    if (
      a.account_id !== context.accountId ||
      l.scope.trip_id !== context.tripId ||
      a.account_id !== l.material.identity.accountId ||
      a.shadow ||
      a.provider_id !== "DeepSeek" ||
      a.model_id !== "deepseek-flash" ||
      a.model_version !== "DeepSeek-V4.1-Flash" ||
      a.descriptor_snapshot.version !== 1 ||
      a.descriptor_snapshot.provider_class !== "COMMERCIAL_REMOTE" ||
      !a.descriptor_snapshot.network_required ||
      !a.descriptor_snapshot.capabilities.includes("INTERPRET") ||
      !a.descriptor_snapshot.modalities.includes(image ? "IMAGE" : "TEXT") ||
      b.request.task_id !== a.task_id ||
      b.request.input.reference !== a.request_material_reference ||
      b.request.input.sha256 !== a.request_material_sha256 ||
      b.request.input.byte_count !== flightSemanticMaterialBytes(l.material).length ||
      b.request.policy_sha256 !== a.policy_admission.policy_sha256 ||
      !a.policy_admission.allowed ||
      profile.modality !== (image ? "IMAGE" : "TEXT") ||
      p.call_id !== a.usage_correlation_id ||
      p.attempt_id !== a.attempt_id ||
      p.request_sha256 !== a.request_sha256 ||
      p.policy_sha256 !== b.request.policy_sha256 ||
      p.output_schema_sha256 !== profile.output_schema_sha256 ||
      p.prompt_sha256 !== profile.prompt_sha256 ||
      p.envelope_sha256 !== profile.envelope_sha256 ||
      p.minimizer_sha256 !== profile.minimizer_sha256 ||
      p.privacy_sha256 !== profile.privacy_sha256 ||
      a.provider_config_id !== p.provider_config_id ||
      a.adapter_version !== p.adapter_version
    )
      throw new Error("POLICY_BLOCKED");
    const materialBytes = flightSemanticMaterialBytes(l.material);
    if (
      !a.request_material_reference ||
      (await deps.hash(materialBytes)) !== a.request_material_sha256 ||
      !(await deps.stores.custody.verify({
        accountId: a.account_id,
        reference: a.request_material_reference,
        sha256: a.request_material_sha256!,
        byteCount: materialBytes.length,
      }))
    )
      throw new Error("POLICY_BLOCKED");
    await deps.authorizeMaterial(context, a, l.material.identity);
    assertAccountRequestGeneration(context);
    const executionPins = {
      adapter_version: p.adapter_version,
      prompt_sha256: p.prompt_sha256,
      envelope_version: String(profile.envelope_version),
      envelope_sha256: p.envelope_sha256,
      output_schema_sha256: p.output_schema_sha256,
      minimizer_version: String(profile.minimizer_version),
      minimizer_sha256: p.minimizer_sha256,
      privacy_profile: String(profile.privacy_profile),
      privacy_sha256: p.privacy_sha256,
      policy_sha256: p.policy_sha256,
      price_sha256: p.price_sha256,
      provider_config_sha256: p.provider_config_sha256,
    };
    const command = flightVersionedReservationCommand(
      a,
      {
        binding: {
          input_sha256: l.material.identity.originalSha256,
          descriptor: { remote: p },
        },
        envelope_sha256: persistenceDigest({
          identity: l.material.identity,
          requestSha256: prepared.sha256,
        }),
        input_ceiling: prepared.textTokenUpperBound + (l.imageTokenCeiling ?? 0),
        output_ceiling: prepared.outputLimit,
      },
      l.scope,
      b,
      executionPins,
    );
    return { a, l, image, prepared, command };
  }
  async function call(a: Attempt, expected?: Record<string, unknown>) {
    const raw = await deps.readCall(a);
    const r = callSchema.parse(raw);
    if (expected) {
      const mutable = new Set([
        "row_revision",
        "dispatch_state",
        "execution_certainty",
        "dispatch_marked_at",
        "terminal_observed_at",
        "safe_reason",
        "admitted_at",
        "admission_sha256",
      ]);
      for (const [key, value] of Object.entries(expected))
        if (
          !mutable.has(key) &&
          persistenceDigest((raw as Record<string, unknown>)[key]) !==
            persistenceDigest(value)
        )
          throw new Error("POLICY_BLOCKED");
    }
    if (
      r.account_id !== a.account_id ||
      r.attempt_id !== a.attempt_id ||
      r.call_id !== a.usage_correlation_id ||
      r.request_sha256 !== a.request_sha256 ||
      r.publication_fence !== a.task_publication_fence
    )
      throw new Error("POLICY_BLOCKED");
    return r;
  }
  async function save(
    a: Attempt,
    result: FlightProviderResult,
    identity: FlightAssemblyJobIdentity,
    bodySha256: string,
    commandSha256: string,
  ) {
    const interpretation = result.status === "SUCCEEDED" ? result.output : null;
    let technicalOutput = null;
    if (result.status === "SUCCEEDED") {
      const proposal = z
        .object({ proposal: flightAssemblyProposalSchema })
        .parse(result.output).proposal;
      const bytes = Buffer.from(JSON.stringify(proposal));
      const sha256 = await deps.hash(bytes);
      const pin = await deps.stores.custody.put({
        accountId: a.account_id,
        reservationId: deps.id(),
        sha256,
        byteCount: bytes.length,
        bytes,
      });
      technicalOutput = technicalOutputWitnessSchema.parse({
        version: 1,
        task_id: a.task_id,
        attempt_id: a.attempt_id,
        request_id: a.request_id,
        request_sha256: a.request_sha256,
        schema_sha256: flightAssemblyModelProfile("TEXT").output_schema_sha256,
        output: { reference: pin.reference, sha256, byte_count: bytes.length },
      });
    }
    const report = executionReportSchema.parse({
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
            ? "PARTIAL"
            : "FAILED",
      response_material_reference: null,
      response_material_sha256: null,
      response_sha256: interpretation === null ? null : persistenceDigest(interpretation),
      metering_disposition: "COMPLETION_PENDING",
      recovery_sha256: null,
      reported_usage_summary: {
        version: 1,
        input_tokens: result.usage.input_tokens,
        output_tokens: result.usage.output_tokens,
        total_tokens: result.usage.total_tokens,
        cached_input_tokens: result.usage.cached_input_tokens,
        reasoning_tokens: result.usage.reasoning_tokens,
        usage_quality: result.usage.usage_quality,
        image_units: null,
        audio_units: null,
        call_count: null,
        bytes: null,
        wall_ms: null,
        cpu_ms: null,
        gpu_ms: null,
        accelerator_ms: null,
      },
    });
    const bytes = Buffer.from(
      JSON.stringify({
        version: 1,
        attempt_id: a.attempt_id,
        descriptor: a.descriptor_snapshot,
        identity,
        bodySha256,
        commandSha256,
        result,
        interpretation,
        technical_output: technicalOutput,
        report,
      }),
    );
    const pin = await deps.stores.custody.put({
      accountId: a.account_id,
      reservationId: deps.id(),
      sha256: await deps.hash(bytes),
      byteCount: bytes.length,
      bytes,
    });
    await deps.stores.retained.put(a, {
      reference: pin.reference,
      sha256: await deps.hash(bytes),
      byteCount: bytes.length,
    });
    const persisted = {
      ...report,
      response_material_reference: pin.reference,
      response_material_sha256: await deps.hash(bytes),
    };
    try {
      await deps.appendMeter(a, result, persisted);
      return { ...persisted, metering_disposition: "COMPLETE" as const };
    } catch {
      return persisted;
    }
  }
  async function recover(context: AccountRequestContext, id: string) {
    const { a, l, prepared, command } = await load(context, id);
    const pin = await deps.stores.retained.read(a);
    if (pin) {
      const bytes = await deps.stores.custody.read({ accountId: a.account_id, ...pin });
      if ((await deps.hash(bytes)) !== pin.sha256) throw new Error("CUSTODY_INTEGRITY");
      const stored = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
      if (
        stored.attempt_id !== a.attempt_id ||
        persistenceDigest(stored.descriptor) !==
          persistenceDigest(a.descriptor_snapshot) ||
        persistenceDigest(stored.identity) !== persistenceDigest(l.material.identity) ||
        stored.bodySha256 !== prepared.sha256 ||
        stored.commandSha256 !== command.request_sha256
      )
        throw new Error("CUSTODY_INTEGRITY");
      await deps.repo.authorizeResultDisclosure(context, a);
      assertAccountRequestGeneration(context);
      return {
        ...stored,
        report: executionReportSchema.parse({
          ...stored.report,
          response_material_reference: pin.reference,
          response_material_sha256: pin.sha256,
        }),
      };
    }
    const r = await call(a, command.row);
    if (r.dispatch_state === "RESERVED") throw new Error("OUTBOUND_RECOVERY_REQUIRED");
    const raw = await deps.stores.readRaw(a.account_id, r.call_id);
    if (
      persistenceDigest(raw.binding) !==
      persistenceDigest({
        version: 1,
        identity: l.material.identity,
        bodySha256: prepared.sha256,
        commandSha256: command.request_sha256,
        requestSha256: a.request_sha256,
        status: (raw.binding as { status?: unknown }).status,
      })
    )
      throw new Error("CUSTODY_INTEGRITY");
    const bytes = await deps.stores.custody.read({ accountId: a.account_id, ...raw.pin });
    if ((await deps.hash(bytes)) !== raw.pin.sha256) throw new Error("CUSTODY_INTEGRITY");
    const result = parseDeepSeekFlightAssemblyResponse(
      l.material.request,
      bytes,
      z
        .number()
        .int()
        .min(100)
        .max(599)
        .parse((raw.binding as { status: unknown }).status),
      null,
      flightModelWitness,
    );
    await save(a, result, l.material.identity, prepared.sha256, command.request_sha256);
    return recover(context, id);
  }
  async function prepareAdapter(
    context: AccountRequestContext,
    e: Awaited<ReturnType<typeof load>>,
  ) {
    const { a, l, prepared } = e;
    return prepareDeepSeekFlightAssembly({
      environment: "DEV",
      identity: l.material.identity,
      request: l.material.request,
      image: e.image,
      host: l.host,
      resolver: deps.resolver,
      send: deps.send,
      modelWitness: flightModelWitness,
      monotonic: deps.monotonic,
      deadline: Math.min(l.deadline, deps.monotonic() + 30000),
      signal: l.signal,
      assertCurrent: async () => {
        await deps.repo.authorizeResultDisclosure(context, a);
        await deps.authorizeMaterial(context, a, l.material.identity);
        assertAccountRequestGeneration(context);
      },
      assertDispatched: async () => {
        const r = await call(a, e.command.row);
        if (
          r.dispatch_state !== "MAY_HAVE_STARTED" ||
          r.execution_certainty !== "RUNNING" ||
          r.row_revision < 2
        )
          throw new Error("POLICY_BLOCKED");
      },
      retainResponse: async (record) => {
        const pin = await deps.stores.custody.put({
          accountId: a.account_id,
          reservationId: record.callId,
          sha256: await deps.hash(record.bytes),
          byteCount: record.bytes.length,
          bytes: record.bytes,
        });
        await deps.stores.retainRaw(
          a.account_id,
          record.callId,
          {
            reference: pin.reference,
            sha256: await deps.hash(record.bytes),
            byteCount: record.bytes.length,
          },
          {
            version: 1,
            identity: l.material.identity,
            bodySha256: prepared.sha256,
            commandSha256: e.command.request_sha256,
            requestSha256: a.request_sha256,
            status: record.status,
          },
        );
      },
    });
  }
  return {
    recover,
    async readTechnicalOutput(context: AccountRequestContext, id: string) {
      const stored = await recover(context, id);
      if (!stored.technical_output) return null;
      const { a, l } = await load(context, id);
      const witness = technicalOutputWitnessSchema.parse(stored.technical_output);
      if (
        stored.report.execution_observation !== "TERMINAL" ||
        witness.task_id !== a.task_id ||
        witness.attempt_id !== a.attempt_id ||
        witness.request_id !== a.request_id ||
        witness.request_sha256 !== a.request_sha256 ||
        witness.schema_sha256 !== l.modelBinding.request.schema.sha256
      )
        throw new Error("CUSTODY_INTEGRITY");
      const bytes = await deps.stores.custody.read({
        accountId: a.account_id,
        reference: witness.output.reference,
        sha256: witness.output.sha256,
        byteCount: witness.output.byte_count,
      });
      if (
        bytes.length !== witness.output.byte_count ||
        (await deps.hash(bytes)) !== witness.output.sha256
      )
        throw new Error("CUSTODY_INTEGRITY");
      const output = flightAssemblyProposalSchema.parse(
        JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)),
      );
      await deps.repo.authorizeResultDisclosure(context, a);
      assertAccountRequestGeneration(context);
      return { witness, output, request: l.modelBinding.request };
    },
    async prepareUsage(context: AccountRequestContext, id: string) {
      const e = await load(context, id);
      await prepareAdapter(context, e);
      await deps.gateway.invoke("flight_activation_reserve_call", e.command);
      if ((await call(e.a, e.command.row)).dispatch_state !== "RESERVED")
        throw new Error("OUTBOUND_RECOVERY_REQUIRED");
      return "START_DURABLE" as const;
    },
    async execute(context: AccountRequestContext, id: string) {
      const e = await load(context, id),
        { a, l, prepared } = e;
      if ((await call(a, e.command.row)).dispatch_state !== "RESERVED")
        return (await recover(context, id)).report;
      const adapter = await prepareAdapter(context, e);
      let marked!: Promise<unknown>;
      await deps.repo.admitExecution(context, a, () => {
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
      const r = callSchema.parse(await marked);
      if (
        r.call_id !== a.usage_correlation_id ||
        r.account_id !== a.account_id ||
        r.attempt_id !== a.attempt_id ||
        r.request_sha256 !== a.request_sha256 ||
        r.publication_fence !== a.task_publication_fence
      )
        throw new Error("POLICY_BLOCKED");
      const result = await adapter.execute({
        ...l.material.identity,
        callId: r.call_id,
        requestSha256: prepared.sha256,
        dispatchState: r.dispatch_state,
        executionCertainty: r.execution_certainty,
        rowRevision: r.row_revision,
      });
      return save(
        a,
        result,
        l.material.identity,
        prepared.sha256,
        e.command.request_sha256,
      );
    },
  };
}
