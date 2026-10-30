import {
  readUniversalPngSourceMaterial,
  type UniversalBinaryReader,
} from "./universalPngSourceMaterial";
import { readUniversalPdfSourceMaterial } from "./universalPdfSourceMaterial";
import { PDF_V2_OPTIONS_SHA } from "./sourcePdfV2Contracts";
import { isReviewedP1Gate } from "./tripNormalP1Policy";
import { universalResultSchema } from "../../src/data/api/universalImportContracts";
import { z } from "zod";
import {
  universalItemSourceReviewSchema,
  type UniversalItemSourceReview,
} from "../../src/domain/trip/universalP1SourceReview";
import { canonicalCoreJson, type Json } from "../../src/domain/trip/tripCoreV2Json";
import { captureAccountRequestContext } from "../../src/data/auth/accountRequestContext";
import {
  importLifecycleSnapshotSchema,
  type ImportLifecycleRequest,
} from "../../src/data/operations/importLifecycleProposal";
import { tripImportCatalogSchemas } from "../../src/data/api/tripImportCatalogContracts";
import {
  flightInputSchema,
  type ImportHash,
} from "../../src/domain/trip/flightImportReview";
import {
  readCorePgGraph,
  lockCorePgActor,
  type CorePgLease,
} from "./tripCoreV2PgStorage";
import { readOwningLegacySourceCatalog } from "./tripCoreV2SourcePgStorage";
import {
  qualifyUniversalP1Selection,
  projectUniversalP1Selection,
  universalP1Identity,
} from "./universalP1Source";
import type { UniversalResult } from "./universalImport";
import type { CoreSourceCatalogV2, CoreSourceScopeV2 } from "./tripCoreV2Source";
export type PublishedUniversalP1Reader = (
  scope: {
    actorAccountId: string;
    tripId: string;
    batchId: string;
    taskId: string;
  },
  lease: CorePgLease,
) => Promise<{
  result: UniversalResult;
  resultSha256: string;
  runId: string;
  // Interface gap: must come from an owning lifecycle qualifier, never the Interpreter.
  owningLifecycleRelationships?: ImportLifecycleRequest["relationships"];
  readBinary?: UniversalBinaryReader;
} | null>;
const header = z.object({
  schemaId: z.enum([
    "otr.core.universal-p1-source/1",
    "otr.core.universal-p1-source/2",
    "otr.core.universal-p3-source/1",
    "otr.core.universal-p4-source/1",
    "otr.core.universal-p5-source/1",
    "otr.core.universal-p6-source/1",
  ]),
  sourceReview: universalItemSourceReviewSchema.optional(),
  reviewedBy: z.uuid().optional(),
  accountId: z.uuid(),
  tripId: z.uuid(),
  sourceId: z.uuid(),
  sourceRevision: z.number().int().positive(),
  taskId: z.uuid(),
  batchId: z.uuid(),
  runId: z.uuid(),
  candidateId: z.uuid(),
  token: z.string().min(1).max(128),
  resultSha256: z.string().regex(/^[a-f0-9]{64}$/),
});
const json = (v: unknown) => canonicalCoreJson(v as Json);
type Scope = CoreSourceScopeV2 & { sourceId: string };
export type UniversalP1QualificationContext = {
  actor: Awaited<ReturnType<typeof lockCorePgActor>>;
  graph: Awaited<ReturnType<typeof readCorePgGraph>>;
};
function assertQualificationContext(
  scope: Scope,
  current: UniversalP1QualificationContext,
) {
  if (
    current.actor.accountId !== scope.actorAccountId ||
    current.actor.tripId !== scope.tripId ||
    current.actor.active !== true
  )
    throw Error("CORE_SCOPE_MISMATCH");
}
const lockedCatalogs = new WeakMap<
  CorePgLease,
  Map<
    string,
    { catalog: CoreSourceCatalogV2; actor?: Awaited<ReturnType<typeof lockCorePgActor>> }
  >
>();
export const isUniversalP1Body = (raw: unknown) => header.safeParse(raw).success;
export async function assertUniversalP1Capability(
  lease: CorePgLease,
  scope: Pick<Scope, "actorAccountId" | "tripId">,
  family: "P1" | "P2" | "P3" | "P4" | "P5" | "P6" = "P1",
) {
  // A requested family narrows capability negotiation; owning SQL still authorizes it.
  await lease.query("SELECT set_config('otr.universal.requested_family',$1,true)", [
    family,
  ]);
  const c = (
    await lease.query(
      "SELECT runtime_enabled,enabled_commands,enabled_families,enabled_admission_modes FROM public.trip_sustained_import_p1_capabilities($1::uuid,$2::uuid)",
      [scope.actorAccountId, scope.tripId],
    )
  ).rows[0];
  if (!isReviewedP1Gate(c, family)) throw Error("CORE_CAPABILITY_CLOSED");
}
export { hasAcceptedUniversalSourceReceipt } from "./universalAcceptedSourceReceipt";
export async function setUniversalP1WriteContext(
  lease: CorePgLease,
  target: string,
  operation: string,
  slot: string,
  family: "P1" | "P2" | "P3" | "P4" | "P5" | "P6" = "P1",
) {
  z.enum(["P1", "P2", "P3", "P4", "P5", "P6"]).parse(family);
  const command = family === "P2" ? "CREATE_SPARSE_FLIGHT" : "CREATE_ITEM";
  await lease.query(
    `SELECT set_config('otr.core.command','${command}',true),set_config('otr.core.family','${family}',true),set_config('otr.core.admission','REVIEWED_SOURCE',true),set_config('otr.core.target_item',$1,true),set_config('otr.core.operation',$2,true),set_config('otr.core.source_intent',$3,true)`,
    [z.uuid().parse(target), z.uuid().parse(operation), z.uuid().parse(slot)],
  );
}
export async function readP1SourceSnapshot(
  lease: CorePgLease,
  catalog: CoreSourceCatalogV2,
  hash: ImportHash,
  bindings: UniversalResult["sourceBindings"] = [],
  readBinary?: UniversalBinaryReader,
) {
  const inputs = catalog.inputs
      .map((i) => flightInputSchema.parse(i))
      .filter((i) => i.source_id === catalog.sourceId),
    representations = [],
    materials = [];
  if (!inputs.length) throw Error("OWNING_MATERIAL_QUALIFICATION_REQUIRED");
  const snapshot = (
    await lease.query(
      "SELECT coalesce((SELECT jsonb_agg(public.trip_import_observation(to_jsonb(r)) ORDER BY r.id) FROM public.trip_source_representations r WHERE r.source_id=$1::uuid AND r.id=ANY(SELECT (p->>'representation_id')::uuid FROM jsonb_array_elements($2::jsonb) p)),'[]'::jsonb) AS representations,coalesce((SELECT jsonb_agg(public.trip_import_observation(to_jsonb(a)) ORDER BY a.id) FROM (SELECT * FROM public.trip_source_associations WHERE source_id=$1::uuid ORDER BY id LIMIT 65) a),'[]'::jsonb) AS associations,public.trip_import_observation($3::jsonb) AS source",
      [catalog.sourceId, json(inputs), json(catalog.source)],
    )
  ).rows[0];
  const sourceReps = snapshot.representations as Record<string, unknown>[];
  if (sourceReps.length !== inputs.length) throw Error("SOURCE_INTEGRITY_FAILURE");
  for (const pin of inputs) {
    const matches = sourceReps.filter(
      (r) => r.id === pin.representation_id && r.source_id === pin.source_id,
    );
    if (matches.length !== 1) throw Error("SOURCE_INTEGRITY_FAILURE");
    const raw = matches[0];
    const r = tripImportCatalogSchemas.trip_source_representations.parse(raw);
    if (
      r.material_kind === "BINARY" &&
      r.role === "ORIGINAL" &&
      r.mime_type === "image/png"
    ) {
      const published = bindings.filter(
        (b) =>
          b.inputId === pin.id &&
          b.sourceId === pin.source_id &&
          b.representationId === pin.representation_id &&
          b.revision === pin.material_revision &&
          b.originalSha256 === pin.payload_sha256 &&
          b.submittedSha256 === pin.payload_sha256 &&
          b.mime === "image/png" &&
          !b.pdfSource &&
          b.status === "READY",
      );
      if (
        published.length !== 1 ||
        r.retention_state !== "RETAINED" ||
        r.remote_state !== "VERIFIED" ||
        r.payload_sha256 !== pin.payload_sha256 ||
        r.byte_count !== pin.byte_count ||
        r.text_content !== null
      )
        throw Error("SOURCE_INTEGRITY_FAILURE");
      materials.push(
        await readUniversalPngSourceMaterial(lease, catalog, pin, hash, readBinary),
      );
      representations.push(r);
      continue;
    }
    if (
      r.material_kind !== "TEXT" ||
      r.retention_state !== "RETAINED" ||
      typeof r.text_content !== "string" ||
      r.payload_sha256 !== pin.payload_sha256 ||
      r.byte_count !== pin.byte_count ||
      Buffer.byteLength(r.text_content) !== pin.byte_count ||
      (await hash(Buffer.from(r.text_content))) !== pin.payload_sha256
    )
      throw Error("SOURCE_INTEGRITY_FAILURE");
    const publishedBindings = bindings.filter(
      (b) =>
        b.inputId === pin.id &&
        b.sourceId === pin.source_id &&
        b.representationId === pin.representation_id &&
        b.revision === pin.material_revision &&
        b.originalSha256 === pin.payload_sha256,
    );
    const provenance =
      publishedBindings.length === 1 ? publishedBindings[0].pdfSource : undefined;
    if (r.role !== "ORIGINAL" || publishedBindings.some((b) => b.pdfSource)) {
      if (
        r.role !== "DERIVED" ||
        !provenance ||
        provenance.transformOptionsSha256 !== PDF_V2_OPTIONS_SHA
      )
        throw Error("OWNING_MATERIAL_QUALIFICATION_REQUIRED");
      // Existing proof reader retains current-row, global gate, custody and sealed-page checks.
      const material = await readUniversalPdfSourceMaterial(
        lease,
        catalog,
        provenance.original,
        hash,
      );
      if (
        material.derived.representationId !== r.id ||
        material.derived.sha256 !== pin.payload_sha256 ||
        material.derived.byteCount !== pin.byte_count ||
        material.derived.text !== r.text_content ||
        material.sealSha256 !== provenance.sealSha256 ||
        material.pageMapSha256 !== provenance.pageMapSha256
      )
        throw Error("SOURCE_INTEGRITY_FAILURE");
    }
    representations.push(r);
    materials.push({ pin, text: r.text_content, media_type: "text/plain", form: "TEXT" });
  }
  const associations = snapshot.associations as unknown[];
  if (associations.length > 64) throw Error("IMPORT_LIFECYCLE_LIMIT");
  const source = snapshot.source;
  return importLifecycleSnapshotSchema.parse({
    sources: [source],
    representations,
    materials,
    associations,
  });
}
async function project(
  lease: CorePgLease,
  scope: Scope,
  published: NonNullable<Awaited<ReturnType<PublishedUniversalP1Reader>>>,
  token: string,
  hash: ImportHash,
  qualify: boolean,
  sourceReview?: UniversalItemSourceReview,
  current?: UniversalP1QualificationContext,
) {
  const key = json([
    scope.actorAccountId,
    scope.tripId,
    scope.sourceId,
    published.runId,
    published.result.taskId,
    published.result.batchId,
    published.resultSha256,
  ]);
  let cache = lockedCatalogs.get(lease);
  if (!cache) {
    cache = new Map();
    lockedCatalogs.set(lease, cache);
  }
  let stored = cache.get(key);
  if (!stored) {
    const fresh = await readOwningLegacySourceCatalog(
      lease,
      scope,
      published.runId,
      undefined,
      {
        runId: published.runId,
        taskId: published.result.taskId,
        batchId: published.result.batchId,
        resultSha256: published.resultSha256,
      },
    );
    // The owning lease retains Source/Run/Input locks. Never cache seals, bytes, Graph or results.
    stored = { catalog: structuredClone(fresh) };
    cache.set(key, stored);
  }
  const catalog = structuredClone(stored.catalog);
  const input = {
    context: await captureAccountRequestContext(
      scope.tripId,
      async () => scope.actorAccountId,
    ),
    catalog,
    snapshot: await readP1SourceSnapshot(
      lease,
      catalog,
      hash,
      published.result.sourceBindings,
      published.readBinary,
    ),
    ...published,
    selection: {
      action: `CONFIRM_NEW_${universalResultSchema.parse(published.result).candidates.find((c) => c.token === token)?.kind}`,
      token,
      resultSha256: published.resultSha256,
      ...(sourceReview ? { sourceReview } : {}),
    },
  };
  const deps = { hash, getAccountId: async () => scope.actorAccountId };
  let checked;
  if (qualify) {
    if (current) assertQualificationContext(scope, current);
    if (!current && !stored.actor) {
      await lease.query("SET LOCAL ROLE otr_trip_core_v2_gateway");
      try {
        stored.actor = structuredClone(
          await lockCorePgActor(lease, scope.actorAccountId, scope.tripId),
        );
      } finally {
        await lease.query("SET LOCAL ROLE otr_trip_core_v2_writer");
      }
    }
    checked = await qualifyUniversalP1Selection(
      {
        ...input,
        actor: current?.actor ?? structuredClone(stored.actor!),
        graph: current?.graph ?? (await readCorePgGraph(lease, scope.tripId)),
      },
      deps,
    );
  } else checked = await projectUniversalP1Selection(input, deps);

  return { catalog, checked };
}
export async function readUniversalP1Catalog(
  lease: CorePgLease,
  scope: Scope,
  ids: readonly string[],
  hash: ImportHash,
  read: PublishedUniversalP1Reader,
  qualify = false,
  current?: UniversalP1QualificationContext,
) {
  if (qualify && current) assertQualificationContext(scope, current);
  if (ids.length !== 1) throw Error("CONTRACT_UNSUPPORTED");
  const row = (
    await lease.query(
      "SELECT * FROM public.trip_source_core_v2_candidates WHERE candidate_id=$1::uuid AND account_id=$2::uuid AND trip_id=$3::uuid AND source_id=$4::uuid",
      [ids[0], scope.actorAccountId, scope.tripId, scope.sourceId],
    )
  ).rows[0];
  if (!row) throw Error("INVALID_PROVENANCE");
  const h = header.parse(row.candidate_json);
  if (
    (h.schemaId === "otr.core.universal-p1-source/2" ||
      h.schemaId === "otr.core.universal-p3-source/1" ||
      h.schemaId === "otr.core.universal-p4-source/1" ||
      h.schemaId === "otr.core.universal-p5-source/1" ||
      h.schemaId === "otr.core.universal-p6-source/1" ||
      h.sourceReview) &&
    (!h.sourceReview || h.reviewedBy !== scope.actorAccountId)
  )
    throw Error("INVALID_PROVENANCE");
  if (
    h.accountId !== scope.actorAccountId ||
    h.tripId !== scope.tripId ||
    h.sourceId !== scope.sourceId
  )
    throw Error("IMPORT_SCOPE_MISMATCH");
  const published = await read(
    {
      actorAccountId: scope.actorAccountId,
      tripId: scope.tripId,
      batchId: h.batchId,
      taskId: h.taskId,
    },
    lease,
  );
  if (
    !published ||
    published.resultSha256 !== h.resultSha256 ||
    published.runId !== h.runId ||
    published.result.taskId !== h.taskId ||
    published.result.batchId !== h.batchId
  )
    throw Error("UNIVERSAL_SELECTION_STALE");
  const { catalog, checked } = await project(
    lease,
    scope,
    published,
    h.token,
    hash,
    qualify,
    h.sourceReview,
    current,
  );
  if (
    h.candidateId !== row.candidate_id ||
    h.sourceRevision !== catalog.sourceRevision ||
    Number(row.source_revision) !== catalog.sourceRevision ||
    row.run_id !== h.runId ||
    row.input_catalog_sha256 !== catalog.inputCatalogSha256 ||
    row.candidate_sha256 !== checked.candidateSha256 ||
    json(row.candidate_json) !== json(checked.body)
  )
    throw Error("INVALID_PROVENANCE");
  catalog.candidates = [
    {
      candidateId: h.candidateId,
      runId: h.runId,
      kind: (checked.body.plan.slots[0].payload as { family: string }).family,
      candidateSha256: checked.candidateSha256,
      snapshot: checked.body,
      identityFacts: null,
      identityEvidenceRefs: null,
    },
  ];
  return catalog;
}
export async function publishUniversalP1Candidate(
  lease: CorePgLease,
  scope: Scope,
  input: {
    batchId: string;
    taskId: string;
    token: string;
    requestSha256: string;
    family?: "P1" | "P3" | "P4" | "P5" | "P6";
    sourceReview?: UniversalItemSourceReview;
  },
  read: PublishedUniversalP1Reader,
  hash: ImportHash,
) {
  const family = input.family ?? "P1";
  if (
    family !== "P1" &&
    input.sourceReview?.version !==
      `otr.universal.${family.toLowerCase()}-source-review/1`
  )
    throw Error("OWNING_REVIEW_REQUIRED");
  await assertUniversalP1Capability(lease, scope, family);
  const published = await read(
    {
      actorAccountId: scope.actorAccountId,
      tripId: scope.tripId,
      batchId: z.uuid().parse(input.batchId),
      taskId: z.uuid().parse(input.taskId),
    },
    lease,
  );
  if (
    !published ||
    published.result.requestSha256 !== input.requestSha256 ||
    published.result.batchId !== input.batchId ||
    published.result.taskId !== input.taskId ||
    universalResultSchema
      .parse(published.result)
      .candidates.filter((c) => c.token === input.token && c.kind === family).length !== 1
  )
    throw Error("UNIVERSAL_SELECTION_UNAVAILABLE");
  const candidateId = universalP1Identity(input.taskId, input.token, "candidate"),
    prior = (
      await lease.query(
        "SELECT candidate_id FROM public.trip_source_core_v2_candidates WHERE candidate_id=$1::uuid AND account_id=$2::uuid AND trip_id=$3::uuid AND source_id=$4::uuid",
        [candidateId, scope.actorAccountId, scope.tripId, scope.sourceId],
      )
    ).rows[0];
  if (prior) {
    const c = (await readUniversalP1Catalog(lease, scope, [candidateId], hash, read))
      .candidates[0];
    if (
      json((c.snapshot as { sourceReview?: unknown }).sourceReview ?? null) !==
      json(input.sourceReview ?? null)
    )
      throw Error("SOURCE_REVIEW_REPLAY_CONFLICT");
    return {
      captureVersion: 2 as const,
      status: "CANDIDATE_SEALED" as const,
      proposedPlan: (
        c.snapshot as {
          plan: import("../../src/domain/trip/tripCoreV2SourceContract").CoreSourcePrepareV2;
        }
      ).plan,
      candidateSha256: c.candidateSha256,
      grantsAdmission: false as const,
    };
  }
  const { checked } = await project(
      lease,
      scope,
      published,
      input.token,
      hash,
      true,
      input.sourceReview,
    ),
    slot = checked.body.plan.slots[0];
  await setUniversalP1WriteContext(
    lease,
    slot.target.id,
    slot.operationId,
    slot.slotId,
    family,
  );
  await lease.query(
    "INSERT INTO public.trip_source_core_v2_candidates(candidate_id,account_id,trip_id,source_id,source_revision,run_id,input_catalog_sha256,candidate_sha256,candidate_json,sealed_at) VALUES($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5,$6::uuid,$7,$8,$9::jsonb,clock_timestamp())",
    [
      candidateId,
      scope.actorAccountId,
      scope.tripId,
      scope.sourceId,
      checked.body.sourceRevision,
      checked.body.runId,
      checked.body.inputCatalogSha256,
      checked.candidateSha256,
      json(checked.body),
    ],
  );
  return {
    captureVersion: 2 as const,
    status: "CANDIDATE_SEALED" as const,
    proposedPlan: checked.body.plan,
    candidateSha256: checked.candidateSha256,
    grantsAdmission: false as const,
  };
}
