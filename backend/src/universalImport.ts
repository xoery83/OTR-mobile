import { universalPdfSourceProvenanceSchema } from "../../src/data/api/universalImportContracts";
import { PDF_V2_OPTIONS_SHA } from "./sourcePdfV2Contracts";
import { createHash } from "node:crypto";
import { z } from "zod";
import {
  prepare,
  type Source,
} from "../frozen-workbench/scripts/import-workbench/llm-first";
import { inspectCompactEvidence } from "../frozen-workbench/scripts/import-workbench/real-llm-evidence";
import { projectImportQuality } from "../frozen-workbench/scripts/import-workbench/import-quality";
import {
  COMPACT_PROMPT_VERSION,
  compactSchema,
} from "../frozen-workbench/scripts/import-workbench/real-llm-compact";
import { universalInstruction, universalAdvisoryInstruction } from "./universalPrompt";
import {
  advisorySources,
  envelopeSchema,
  validateUniversalAdvisory,
} from "./universalAdvisory";
import { projectUniversalMinimumFacts } from "./universalReadiness";
import { buildUniversalDeepSeekRequest } from "./universalProviderRequest";

export const UNIVERSAL_IMPORT_VERSION = "otr.backend.universal-interpretation/1" as const;
export const UNIVERSAL_IMPORT_SCHEMA_ID = "UNIVERSAL_IMPORT_V1" as const;
const sha = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex");
const uuid = z.string().uuid();
export const universalRequestSchema = z.strictObject({
  version: z.literal(UNIVERSAL_IMPORT_VERSION),
  tripId: uuid,
  taskId: uuid,
});
export type UniversalRequest = z.infer<typeof universalRequestSchema>;

// An owning Host reader supplies these bindings. They are never accepted from HTTP or the model.
export type BoundRepresentation = {
  accountId: string;
  tripId: string;
  batchId: string;
  inputId: string;
  sourceId: string;
  representationId: string;
  revision: number;
  originalSha256: string;
  pdfSource?: z.infer<typeof universalPdfSourceProvenanceSchema>;
  mime: string;
  bytes: Buffer;
  prepared?: Source["prepared"];
};
export type UniversalManifest = {
  accountId: string;
  tripId: string;
  batchId: string;
  representations: BoundRepresentation[];
};
export type UniversalProvider = {
  mode: "LOCAL_FIXTURE" | "HOSTED";
  interpret(input: {
    taskId: string;
    actorId: string;
    accountId: string;
    tripId: string;
    batchId: string;
    promptVersion: typeof COMPACT_PROMPT_VERSION;
    instruction: typeof universalInstruction;
    advisoryInstruction: typeof universalAdvisoryInstruction;
    sources: {
      index: number;
      sourceId: string;
      mime: string;
      modality: "TEXT" | "IMAGE";
      sha256: string;
      bytes: Buffer;
    }[];
  }): Promise<{
    output: unknown;
    providerReceipt: {
      outcome: "LOCAL_FIXTURE" | "SETTLED" | "UNKNOWN";
      requestId: string | null;
      requestSha256?: string;
      responseSha256?: string;
      usage?: unknown;
      costNanos?: string | null;
    };
  }>;
};
export type UniversalResult = {
  version: typeof UNIVERSAL_IMPORT_VERSION;
  actorId: string;
  accountId: string;
  tripId: string;
  batchId: string;
  taskId: string;
  requestSha256: string;
  status: "CANDIDATES_READY" | "ABSTAIN" | "EXECUTION_OUTCOME_UNKNOWN";
  promptVersion: typeof COMPACT_PROMPT_VERSION;
  providerOutcome: "NOT_RUN" | "LOCAL_FIXTURE" | "SETTLED" | "UNKNOWN";
  providerReceipt: {
    requestId: string | null;
    requestSha256: string | null;
    responseSha256?: string | null;
    usage: unknown;
    costNanos: string | null;
  } | null;
  sourceBindings: {
    alias: string;
    inputId: string;
    sourceId: string;
    representationId: string;
    revision: number;
    mime: string;
    originalSha256: string;
    pdfSource?: z.infer<typeof universalPdfSourceProvenanceSchema>;
    submittedSha256: string | null;
    status: string;
  }[];
  candidates: unknown[];
  bookingObservations: unknown[];
  ticketObservations: unknown[];
  quality: ReturnType<typeof projectImportQuality> | null;
  minimumFacts: ReturnType<typeof projectUniversalMinimumFacts>[];
  sourceObservations: unknown[];
  advisoryStatus: "ABSENT" | "VALID" | "PARTIAL" | "INVALID";
  advisoryIssues: string[];
  outputCoverage: "PARTIAL_COVERAGE";
  coverageGaps: { field: string; reason: string }[];
  unresolved: { sourceId: string; reason: string }[];
  formalReview: "NOT_RUN";
  admission: "NOT_RUN";
  canonicalWrites: false;
};
export type UniversalPort = {
  // Disclosure of an already-bootstrapped owning Task only; never creates one.
  readContext?(
    actorId: string,
    batchId: string,
    tripId: string,
  ): Promise<UniversalExecutionContext | null>;
  execute(
    actorId: string,
    batchId: string,
    request: UniversalRequest,
  ): Promise<UniversalResult>;
  read(actorId: string, batchId: string, taskId: string): Promise<UniversalResult | null>;
};
export type UniversalExecutionContext = {
  activity?: import("../../src/data/api/universalImportContracts").UniversalTaskActivity;
  version: "otr.backend.universal-context/1";
  actorId: string;
  accountId: string;
  tripId: string;
  batchId: string;
  taskId: string;
};
export type UniversalHost = {
  // Reader must enforce Actor/Account/Trip/Batch and return actual retained Source material.
  readManifest(
    actorId: string,
    tripId: string,
    batchId: string,
  ): Promise<UniversalManifest | null>;
  // Durable task receipt storage is owned by the existing Task layer, not this adapter.
  // Must atomically claim the task key before any Provider call. Existing Task custody implements this in deployment.
  claimDispatch(
    marker: UniversalResult,
  ): Promise<{ claimed: boolean; receipt: UniversalResult }>;
  writeReceipt(result: UniversalResult): Promise<void>;
  readReceipt(
    actorId: string,
    batchId: string,
    taskId: string,
  ): Promise<UniversalResult | null>;
};
const COVERAGE_GAPS = [
  {
    field: "P3-P6.image_advisory",
    reason: "INDEPENDENT_OCR_RECEIPT_UNAVAILABLE",
  },
  {
    field: "P5.dynamic_provider_label_value",
    reason: "FINITE_OPTIONAL_PATHS_ONLY; SOURCE-LABELLED_DYNAMIC_KEYS_NOT_SUPPORTED",
  },
  {
    field: "P5.dynamic_boarding_or_meeting_labels",
    reason: "FINITE_ROLE_LABELS_ONLY; PROVIDER-SPECIFIC_KEYS_NOT_SUPPORTED",
  },
  {
    field: "P4.actual_vehicle_identity",
    reason: "SOURCE_OBSERVATION_ONLY; VEHICLE_PROOF_UNAVAILABLE",
  },
  {
    field: "P2.passenger_identity",
    reason: "SOURCE_OBSERVATION_ONLY; TRIP_PERSON_QUALIFIER_UNAVAILABLE",
  },
] as const;

function pinManifest(
  actorId: string,
  tripId: string,
  batchId: string,
  manifest: UniversalManifest | null,
) {
  if (
    !manifest ||
    manifest.tripId !== tripId ||
    manifest.batchId !== batchId ||
    !manifest.accountId
  )
    throw new Error("OWNING_READER_UNAVAILABLE_OR_FORBIDDEN");
  const sources = manifest.representations;
  if (
    !sources.length ||
    sources.length > 64 ||
    new Set(sources.map((s) => s.representationId)).size !== sources.length ||
    sources.some(
      (s) =>
        s.accountId !== manifest.accountId ||
        s.tripId !== tripId ||
        s.batchId !== batchId ||
        !s.inputId ||
        !s.sourceId ||
        !s.representationId ||
        !Number.isInteger(s.revision) ||
        s.revision < 1 ||
        !/^[a-f0-9]{64}$/.test(s.originalSha256) ||
        sha(s.bytes) !== s.originalSha256 ||
        (s.pdfSource !== undefined &&
          (!universalPdfSourceProvenanceSchema.safeParse(s.pdfSource).success ||
            s.mime !== "text/plain" ||
            s.pdfSource.original.representationId === s.representationId ||
            s.pdfSource.transformOptionsSha256 !== PDF_V2_OPTIONS_SHA)),
    )
  )
    throw new Error("SOURCE_BINDING_INVALID");
  const prepared = sources
    .map((s, index) =>
      prepare(
        {
          id: `S${index}`,
          name: s.representationId,
          mime: s.mime,
          bytes: s.bytes,
          prepared: s.prepared,
          ...(s.mime === "text/plain"
            ? { preparedText: new TextDecoder().decode(s.bytes) }
            : {}),
        },
        "B_PREPARED",
        {
          mimes: ["text/plain", "text/html", "image/png", "image/jpeg"],
          modalities: ["TEXT", "IMAGE"],
        },
      ),
    )
    .map((entry) =>
      entry.status === "READY" && entry.bytes.length === 0
        ? {
            status: "UNSUPPORTED" as const,
            reason: "PREPARED_SOURCE_EMPTY",
            sourceId: entry.sourceId,
            originalSha256: entry.originalSha256,
            originalBytes: entry.originalBytes,
          }
        : entry,
    );
  const bindings = sources.map((s, index) => ({
    alias: `S${index}`,
    inputId: s.inputId,
    sourceId: s.sourceId,
    representationId: s.representationId,
    revision: s.revision,
    mime: s.mime,
    originalSha256: s.originalSha256,
    ...(s.pdfSource ? { pdfSource: structuredClone(s.pdfSource) } : {}),
    submittedSha256:
      prepared[index].status === "READY" ? prepared[index].submittedSha256 : null,
    status: prepared[index].status,
  }));
  const requestSha256 = sha(
    JSON.stringify({
      version: UNIVERSAL_IMPORT_VERSION,
      actorId,
      accountId: manifest.accountId,
      tripId,
      batchId,
      bindings,
    }),
  );
  return { manifest, prepared, bindings, requestSha256 };
}

// Owning Task producers use this exact plan to pin immutable request custody before dispatch.
export function prepareUniversalDispatch(
  actorId: string,
  batchId: string,
  request: UniversalRequest,
  inputManifest: UniversalManifest | null,
) {
  const pinned = pinManifest(actorId, request.tripId, batchId, inputManifest);
  const { manifest, prepared, bindings, requestSha256 } = pinned;
  const ready = prepared.filter(
    (p): p is Extract<typeof p, { status: "READY" }> => p.status === "READY",
  );
  if (ready.length)
    buildUniversalDeepSeekRequest({
      taskId: request.taskId,
      actorId,
      accountId: manifest.accountId,
      tripId: request.tripId,
      batchId,
      promptVersion: COMPACT_PROMPT_VERSION,
      instruction: universalInstruction,
      advisoryInstruction: universalAdvisoryInstruction,
      sources: ready.map((p, index) => ({
        index,
        sourceId: p.sourceId,
        mime: p.mime,
        modality: p.modality as "TEXT" | "IMAGE",
        sha256: p.submittedSha256,
        bytes: p.bytes,
      })),
    });
  const base = {
    version: UNIVERSAL_IMPORT_VERSION,
    actorId,
    accountId: manifest.accountId,
    tripId: request.tripId,
    batchId,
    taskId: request.taskId,
    requestSha256,
    promptVersion: COMPACT_PROMPT_VERSION as typeof COMPACT_PROMPT_VERSION,
    sourceBindings: bindings,
    formalReview: "NOT_RUN" as const,
    admission: "NOT_RUN" as const,
    canonicalWrites: false as const,
  };
  const dispatchMarker: UniversalResult = {
    ...base,
    status: "EXECUTION_OUTCOME_UNKNOWN",
    providerOutcome: "UNKNOWN",
    providerReceipt: null,
    candidates: [],
    bookingObservations: [],
    ticketObservations: [],
    quality: null,
    minimumFacts: [],
    sourceObservations: [],
    advisoryStatus: "ABSENT",
    advisoryIssues: [],
    outputCoverage: "PARTIAL_COVERAGE",
    coverageGaps: [...COVERAGE_GAPS],
    unresolved: [],
  };
  return {
    manifest,
    prepared,
    bindings,
    requestSha256,
    ready,
    base,
    dispatchMarker,
  };
}

export function projectUniversalResponse(
  dispatch: ReturnType<typeof prepareUniversalDispatch>,
  response: Awaited<ReturnType<UniversalProvider["interpret"]>>,
): UniversalResult {
  const { prepared, ready, bindings, base } = dispatch;
  const envelope = envelopeSchema.safeParse(response.output);
  const interpretation = envelope.success
    ? envelope.data.interpretation
    : response.output;
  const inspection = inspectCompactEvidence(
    interpretation,
    ready,
    prepared,
    [],
    base.taskId,
  );
  const wire = compactSchema.safeParse(interpretation);
  const sourceIssues = wire.success
    ? wire.data.issues.map(([index, reason]) => ({
        sourceId: ready[index]?.sourceId ?? "UNKNOWN",
        reason,
      }))
    : [];
  const quality = projectImportQuality(interpretation, inspection, ready);
  const minimumFacts = (inspection.proposals?.objects ?? []).map(
    projectUniversalMinimumFacts,
  );
  const factsByToken = new Map(minimumFacts.map((f) => [f.token, f]));
  const advisory = validateUniversalAdvisory(
    envelope.success ? envelope.data.advisory : undefined,
    advisorySources(bindings, ready),
    inspection.proposals,
  );
  const p4Partial = (inspection.proposals?.objects ?? [])
    .filter(
      (o) =>
        o.kind === "P4" &&
        quality.decisions.some(
          (d) =>
            d.token === o.token &&
            d.tier === "ABSTAIN" &&
            d.reasons.includes("CORE_FIELD_EVIDENCE_MISSING"),
        ) &&
        factsByToken.get(o.token)?.minimumFacts === "EVIDENCED_CANDIDATE_FACTS",
    )
    .map((o) => ({
      type: "P4_WORKBENCH_TIER_MISMATCH",
      token: o.token,
      fields: o.fields,
      authority: "SOURCE_OBSERVATION_ONLY",
    }));
  const permitted = new Set([...quality.acceptedTokens, ...quality.reviewableTokens]);
  const selectedCandidates = (inspection.proposals?.objects ?? []).filter((o) =>
    permitted.has(o.token),
  );
  const bookingObservations = (inspection.proposals?.bookings ?? []).filter(
    (b) => b.objectTokens.length && b.objectTokens.every((t) => permitted.has(t)),
  );
  const ticketObservations = (inspection.proposals?.tickets ?? [])
    .filter(
      (t) =>
        t.objectTokens.length && t.objectTokens.every((token) => permitted.has(token)),
    )
    .map((t) => ({ ...t, authority: "NONE" }));
  const keptBookings = new Set(bookingObservations.map((b) => b.token));
  const keptTickets = new Set(ticketObservations.map((t) => t.token));
  const candidates = selectedCandidates.map((o) => ({
    ...o,
    readiness: factsByToken.get(o.token),
    presentationTier:
      factsByToken.get(o.token)?.minimumFacts === "INCOMPLETE"
        ? "INCOMPLETE"
        : (quality.decisions.find((d) => d.token === o.token)?.tier ?? "ABSTAIN"),
    bookingTokens: o.bookingTokens.filter((token) => keptBookings.has(token)),
    ticketTokens: o.ticketTokens.filter((token) => keptTickets.has(token)),
  }));
  const withheldObservations = [
    ...(inspection.proposals?.bookings ?? [])
      .filter((b) => !keptBookings.has(b.token))
      .map((b) => ({
        sourceId: b.supplier.sourceId,
        reason: `BOOKING_OBSERVATION_WITHHELD_BY_QUALITY:${b.token}`,
      })),
    ...(inspection.proposals?.tickets ?? [])
      .filter((t) => !keptTickets.has(t.token))
      .map((t) => ({
        sourceId: t.label.sourceId,
        reason: `TICKET_OBSERVATION_WITHHELD_BY_QUALITY:${t.token}`,
      })),
  ];
  const result: UniversalResult = {
    ...base,
    status: candidates.length ? "CANDIDATES_READY" : "ABSTAIN",
    providerOutcome: response.providerReceipt.outcome,
    providerReceipt: {
      requestId: response.providerReceipt.requestId,
      requestSha256: response.providerReceipt.requestSha256 ?? null,
      responseSha256: response.providerReceipt.responseSha256 ?? null,
      usage: response.providerReceipt.usage ?? null,
      costNanos: response.providerReceipt.costNanos ?? null,
    },
    candidates,
    bookingObservations,
    ticketObservations,
    quality,
    minimumFacts,
    sourceObservations: [...advisory.observations, ...p4Partial],
    advisoryStatus: advisory.status,
    advisoryIssues: advisory.issues,
    outputCoverage: "PARTIAL_COVERAGE",
    coverageGaps: [...COVERAGE_GAPS],
    unresolved: [
      ...sourceIssues,
      ...withheldObservations,
      ...inspection.unresolved,
      ...(inspection.proposals?.unresolved ?? []),
      ...prepared
        .filter((p) => p.status !== "READY")
        .map((p) => ({ sourceId: p.sourceId, reason: p.reason })),
    ],
  };
  return result;
}

export function createUniversalPort(
  host: UniversalHost,
  provider: UniversalProvider,
): UniversalPort {
  return {
    async execute(actorId, batchId, request) {
      const { manifest, prepared, bindings, requestSha256, ready, base, dispatchMarker } =
        prepareUniversalDispatch(
          actorId,
          batchId,
          request,
          await host.readManifest(actorId, request.tripId, batchId),
        );
      const assertCurrent = async () => {
        const current = pinManifest(
          actorId,
          request.tripId,
          batchId,
          await host.readManifest(actorId, request.tripId, batchId),
        );
        if (current.requestSha256 !== requestSha256)
          throw new Error("SOURCE_BINDING_CHANGED");
      };
      const claim = await host.claimDispatch(dispatchMarker);
      if (!claim.claimed) {
        if (
          claim.receipt.actorId !== actorId ||
          claim.receipt.accountId !== manifest.accountId ||
          claim.receipt.tripId !== request.tripId ||
          claim.receipt.batchId !== batchId ||
          claim.receipt.requestSha256 !== requestSha256
        )
          throw new Error("TASK_BINDING_CONFLICT");
        await assertCurrent();
        return claim.receipt;
      }
      await assertCurrent();
      if (!ready.length) {
        const result: UniversalResult = {
          ...base,
          status: "ABSTAIN",
          providerOutcome: "NOT_RUN",
          providerReceipt: null,
          candidates: [],
          bookingObservations: [],
          ticketObservations: [],
          quality: null,
          minimumFacts: [],
          sourceObservations: [],
          advisoryStatus: "ABSENT",
          advisoryIssues: [],
          outputCoverage: "PARTIAL_COVERAGE",
          coverageGaps: [...COVERAGE_GAPS],
          unresolved: prepared.map((p) => ({
            sourceId: p.sourceId,
            reason: p.status === "READY" ? "UNKNOWN" : p.reason,
          })),
        };
        await assertCurrent();
        await host.writeReceipt(result);
        await assertCurrent();
        return result;
      }
      const response = await provider.interpret({
        taskId: request.taskId,
        actorId,
        accountId: manifest.accountId,
        tripId: request.tripId,
        batchId,
        promptVersion: COMPACT_PROMPT_VERSION,
        instruction: universalInstruction,
        advisoryInstruction: universalAdvisoryInstruction,
        sources: ready.map((p, index) => ({
          index,
          sourceId: p.sourceId,
          mime: p.mime,
          modality: p.modality as "TEXT" | "IMAGE",
          sha256: p.submittedSha256,
          bytes: p.bytes,
        })),
      });
      await assertCurrent();
      if (
        (provider.mode === "LOCAL_FIXTURE" &&
          response.providerReceipt.outcome !== "LOCAL_FIXTURE") ||
        (provider.mode === "HOSTED" &&
          response.providerReceipt.outcome === "LOCAL_FIXTURE")
      )
        throw new Error("PROVIDER_RECEIPT_MODE_MISMATCH");
      if (response.providerReceipt.outcome === "UNKNOWN") {
        const result: UniversalResult = {
          ...base,
          status: "EXECUTION_OUTCOME_UNKNOWN",
          providerOutcome: "UNKNOWN",
          providerReceipt: {
            requestId: response.providerReceipt.requestId,
            requestSha256: response.providerReceipt.requestSha256 ?? null,
            responseSha256: response.providerReceipt.responseSha256 ?? null,
            usage: response.providerReceipt.usage ?? null,
            costNanos: response.providerReceipt.costNanos ?? null,
          },
          candidates: [],
          bookingObservations: [],
          ticketObservations: [],
          quality: null,
          minimumFacts: [],
          sourceObservations: [],
          advisoryStatus: "ABSENT",
          advisoryIssues: [],
          outputCoverage: "PARTIAL_COVERAGE",
          coverageGaps: [...COVERAGE_GAPS],
          unresolved: [],
        };
        await assertCurrent();
        await host.writeReceipt(result);
        await assertCurrent();
        return result;
      }
      const result = projectUniversalResponse(
        {
          manifest,
          prepared,
          bindings,
          requestSha256,
          ready,
          base,
          dispatchMarker,
        },
        response,
      );
      await assertCurrent();
      await host.writeReceipt(result);
      await assertCurrent();
      return result;
    },
    async read(actorId, batchId, taskId) {
      const result = await host.readReceipt(actorId, batchId, taskId);
      if (
        result?.actorId !== actorId ||
        result.batchId !== batchId ||
        result.taskId !== taskId
      )
        return null;
      try {
        const current = pinManifest(
          actorId,
          result.tripId,
          batchId,
          await host.readManifest(actorId, result.tripId, batchId),
        );
        return current.manifest.accountId === result.accountId &&
          current.requestSha256 === result.requestSha256
          ? result
          : null;
      } catch {
        return null;
      }
    },
  };
}

export async function universalBoundary(
  request: Request,
  actorId: string,
  canReadTrip: (actorId: string, tripId: string) => Promise<boolean>,
  port?: UniversalPort,
) {
  if (!port)
    return Response.json({ error: { code: "UNIVERSAL_IMPORT_CLOSED" } }, { status: 503 });
  const url = new URL(request.url);
  const match = /^\/v2\/import-batches\/([^/]+)\/interpretations(?:\/([^/]+))?$/.exec(
    url.pathname,
  );
  if (
    !match ||
    !uuid.safeParse(match[1]).success ||
    (match[2] && !uuid.safeParse(match[2]).success)
  )
    return Response.json({ error: { code: "INVALID_IMPORT_ID" } }, { status: 400 });
  const batchId = match[1];
  if (request.method === "GET" && !match[2]) {
    const tripId = url.searchParams.get("tripId");
    if (!tripId || !uuid.safeParse(tripId).success)
      return Response.json({ error: { code: "INVALID_TRIP_ID" } }, { status: 400 });
    if (!(await canReadTrip(actorId, tripId)))
      return Response.json({ error: { code: "TRIP_READ_FORBIDDEN" } }, { status: 403 });
    if (!port.readContext)
      return Response.json(
        { error: { code: "UNIVERSAL_CONTEXT_UNAVAILABLE" } },
        { status: 503 },
      );
    try {
      const binding = await port.readContext(actorId, batchId, tripId);
      if (
        !binding ||
        binding.version !== "otr.backend.universal-context/1" ||
        binding.actorId !== actorId ||
        binding.accountId !== actorId ||
        binding.tripId !== tripId ||
        binding.batchId !== batchId ||
        !uuid.safeParse(binding.taskId).success
      )
        return Response.json(
          { error: { code: "TASK_NOT_FOUND" } },
          { status: 404, headers: { "Cache-Control": "no-store" } },
        );
      return Response.json(binding, {
        headers: { "Cache-Control": "no-store" },
      });
    } catch (error) {
      if (error instanceof Error && error.message === "UNIVERSAL_BATCH_NOT_PREPARED")
        return Response.json(
          { error: { code: "TASK_NOT_FOUND" } },
          { status: 404, headers: { "Cache-Control": "no-store" } },
        );
      return Response.json(
        { error: { code: "UNIVERSAL_CONTEXT_UNAVAILABLE" } },
        { status: 503 },
      );
    }
  }
  if (request.method === "POST" && !match[2]) {
    const body = await request.text();
    if (Buffer.byteLength(body) > 2048)
      return Response.json({ error: { code: "REQUEST_TOO_LARGE" } }, { status: 413 });
    let parsed: ReturnType<typeof universalRequestSchema.safeParse>;
    try {
      parsed = universalRequestSchema.safeParse(JSON.parse(body));
    } catch {
      return Response.json({ error: { code: "INVALID_REQUEST" } }, { status: 400 });
    }
    if (!parsed.success || request.headers.get("Idempotency-Key") !== parsed.data.taskId)
      return Response.json({ error: { code: "INVALID_REQUEST" } }, { status: 400 });
    if (!(await canReadTrip(actorId, parsed.data.tripId)))
      return Response.json({ error: { code: "TRIP_READ_FORBIDDEN" } }, { status: 403 });
    try {
      return Response.json(await port.execute(actorId, batchId, parsed.data), {
        status: 200,
        headers: { "Cache-Control": "no-store" },
      });
    } catch {
      return Response.json(
        { error: { code: "UNIVERSAL_IMPORT_UNAVAILABLE" } },
        { status: 503 },
      );
    }
  }
  if (request.method === "GET" && match[2]) {
    const tripId = url.searchParams.get("tripId");
    if (!tripId || !uuid.safeParse(tripId).success)
      return Response.json({ error: { code: "INVALID_TRIP_ID" } }, { status: 400 });
    if (!(await canReadTrip(actorId, tripId)))
      return Response.json({ error: { code: "TRIP_READ_FORBIDDEN" } }, { status: 403 });
    const result = await port.read(actorId, batchId, match[2]);
    return result?.tripId === tripId
      ? Response.json(result, { headers: { "Cache-Control": "no-store" } })
      : Response.json({ error: { code: "TASK_NOT_FOUND" } }, { status: 404 });
  }
  return Response.json({ error: { code: "METHOD_NOT_ALLOWED" } }, { status: 405 });
}
