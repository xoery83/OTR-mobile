import {
  readUniversalPngSourceMaterial,
  type UniversalBinaryReader,
} from "./universalPngSourceMaterial";
import { hasCurrentPdfV2ProofAccess } from "./sourcePdfV2CoreProof";
import { createHash } from "node:crypto";
import { readUniversalPdfSourceMaterial } from "./universalPdfSourceMaterial";
import { PDF_V2_OPTIONS_SHA, sourcePdfV2SealSchema } from "./sourcePdfV2Contracts";
import type { Json } from "../../src/domain/trip/tripCoreV2Json";
import { z } from "zod";
import { lockCorePgActor, type CorePgLease } from "./tripCoreV2PgStorage";
import { universalRunBindingSchema } from "./universalBatchSource";
import {
  createUniversalSourceReader,
  type UniversalSourceTask,
} from "./universalSourceRead";

// Core already holds this Source scope. Reuse its RLS/locks, never wait on a second Source transaction.
export function createCoreUniversalSourceRead(
  lease: CorePgLease,
  actor: string,
  trip: string,
  readBinary?: UniversalBinaryReader,
) {
  z.uuid().parse(actor);
  z.uuid().parse(trip);
  async function scoped<T>(work: () => Promise<T>) {
    const identity = (
      await lease.query(
        "SELECT session_user AS principal,current_user AS role,current_setting('otr.core.actor',true) AS actor,current_setting('otr.core.trip',true) AS trip",
      )
    ).rows[0];
    if (
      identity?.principal !== "otr_trip_core_v2_gateway" ||
      !["otr_trip_core_v2_gateway", "otr_trip_core_v2_writer"].includes(
        String(identity.role),
      ) ||
      identity.actor !== actor ||
      identity.trip !== trip
    )
      throw Error("CORE_SCOPE_MISMATCH");
    if (identity.role !== "otr_trip_core_v2_writer")
      await lease.query("SET LOCAL ROLE otr_trip_core_v2_writer");
    try {
      return await work();
    } finally {
      if (identity.role === "otr_trip_core_v2_gateway")
        await lease.query("SET LOCAL ROLE otr_trip_core_v2_gateway");
    }
  }
  let lockedBinding: z.infer<typeof universalRunBindingSchema> | undefined;
  async function binding(batch: string) {
    z.uuid().parse(batch);
    // This adapter belongs to one owning lease that retains every Source lock.
    if (lockedBinding) {
      if (lockedBinding.batchId !== batch) throw Error("CORE_SCOPE_MISMATCH");
      if (
        lockedBinding.inputs.some((p) => p.pdfSource) &&
        !(await hasCurrentPdfV2ProofAccess(lease, actor, trip, true))
      )
        throw Error("CONTRACT_UNSUPPORTED");
      return structuredClone(lockedBinding);
    }
    const find = async () =>
      (
        await lease.query(
          "SELECT to_jsonb(r) AS run FROM public.trip_source_runs r WHERE actor_account_id=$1::uuid AND trip_id=$2::uuid AND capture_batch_id=$3::uuid",
          [actor, trip, batch],
        )
      ).rows;
    const before = await find();
    if (before.length !== 1) throw Error("UNIVERSAL_SOURCE_RUN_UNAVAILABLE");
    const ids = z
      .array(z.uuid())
      .min(1)
      .max(64)
      .parse((before[0].run as Record<string, unknown>).scope_source_ids);
    if (new Set(ids).size !== ids.length) throw Error("UNIVERSAL_BINDING_SCOPE");
    await lease.query("SET LOCAL ROLE otr_trip_core_v2_gateway");
    try {
      const row = (
        await lease.query(
          "WITH ordered AS MATERIALIZED (SELECT value AS source_id FROM jsonb_array_elements_text($3::jsonb) ORDER BY value), locked AS MATERIALIZED (SELECT public.trip_core_lock_source_scope($1::uuid,$2::uuid,source_id::uuid) AS allowed FROM ordered) SELECT count(*)::int AS source_count,bool_and(allowed IS TRUE) AS allowed FROM locked",
          [actor, trip, JSON.stringify([...ids].sort())],
        )
      ).rows[0];
      if (row?.source_count !== ids.length || row.allowed !== true)
        throw Error("SOURCE_ACCESS_DENIED");
    } finally {
      await lease.query("SET LOCAL ROLE otr_trip_core_v2_writer");
    }
    const rows = (
      await lease.query(
        "WITH actual AS MATERIALIZED (SELECT r.id,to_jsonb(r) AS run FROM public.trip_source_runs r WHERE actor_account_id=$1::uuid AND trip_id=$2::uuid AND capture_batch_id=$3::uuid), pins AS MATERIALIZED (SELECT i.id,to_jsonb(i)-'run_id'-'confirmation_id' AS pin,public.trip_import_input_valid(i,$1::uuid,$2::uuid,true) AS valid,rep.role AS representation_role FROM public.trip_source_inputs i JOIN public.trip_source_representations rep ON rep.id=i.representation_id AND rep.source_id=i.source_id WHERE run_id=(SELECT id FROM actual) ORDER BY id LIMIT 65) SELECT actual.run,coalesce((SELECT jsonb_agg(jsonb_build_object('pin',pin,'valid',valid,'representationRole',representation_role) ORDER BY id) FROM pins),'[]'::jsonb) AS pins,CASE WHEN (SELECT count(*) FROM pins) BETWEEN 1 AND 64 THEN public.trip_import_run_input_hash((SELECT jsonb_agg(pin ORDER BY id) FROM pins)) END AS checked_hash FROM actual",
        [actor, trip, batch],
      )
    ).rows;
    if (rows.length !== 1) throw Error("UNIVERSAL_SOURCE_RUN_UNAVAILABLE");
    const r = rows[0].run as Record<string, unknown>;
    if (
      r.actor_account_id !== actor ||
      r.trip_id !== trip ||
      r.capture_batch_id !== batch ||
      r.extractor_key !== "otr-universal-interpretation-v1" ||
      !["PENDING", "READY"].includes(String(r.state)) ||
      r.retention_state !== "RETAINED" ||
      r.superseded_by !== null ||
      JSON.stringify(r.scope_source_ids) !== JSON.stringify(ids)
    )
      throw Error("UNIVERSAL_SOURCE_RUN_UNAVAILABLE");
    const pins = rows[0].pins as {
      pin: Record<string, unknown>;
      valid: boolean;
      representationRole: string;
    }[];
    if (
      !pins.length ||
      pins.length > 64 ||
      pins.some(
        (p) =>
          p.valid !== true ||
          !["ORIGINAL", "DERIVED"].includes(p.representationRole) ||
          !ids.includes(String((p.pin as Record<string, unknown>).source_id)),
      )
    )
      throw Error("INPUT_STALE");
    if (rows[0].checked_hash !== r.input_sha256) throw Error("INPUT_STALE");
    const inputs = [];
    for (const p of pins) {
      if (p.representationRole === "ORIGINAL") {
        inputs.push(p.pin);
        continue;
      }
      // Existing Source locks remain held; no second gateway or Candidate-supplied proof.
      const sealed = (
        await lease.query(
          "SELECT to_jsonb(s) AS source,seal.body AS pdf_body FROM public.trip_sources s JOIN public.trip_source_pdf_seals seal ON seal.source_id=s.id AND seal.account_id=$1::uuid AND seal.trip_id=$2::uuid AND seal.source_revision=$4 AND seal.derived_representation_id=$5::uuid WHERE s.id=$3::uuid AND s.trip_id=$2::uuid AND s.acquired_by=$1::uuid AND s.lifecycle='ACTIVE' AND s.retention_state='RETAINED' LIMIT 2",
          [
            actor,
            trip,
            p.pin.source_id,
            p.pin.material_revision,
            p.pin.representation_id,
          ],
        )
      ).rows;
      if (sealed.length !== 1) throw Error("UNIVERSAL_PDF_MATERIAL_UNAVAILABLE");
      const source = sealed[0].source as Record<string, Json>;
      if (
        !source ||
        source.id !== p.pin.source_id ||
        source.trip_id !== trip ||
        source.acquired_by !== actor ||
        source.lifecycle !== "ACTIVE" ||
        source.retention_state !== "RETAINED"
      )
        throw Error("UNIVERSAL_PDF_MATERIAL_UNAVAILABLE");
      const body = sourcePdfV2SealSchema.parse(sealed[0].pdf_body);
      const original = {
        representationId: body.request.originalRepresentationId,
        sha256: body.originalSha256,
        byteCount: body.originalByteCount,
      };
      const material = await readUniversalPdfSourceMaterial(
        lease,
        {
          actorAccountId: actor,
          tripId: trip,
          sourceId: String(p.pin.source_id),
          sourceRevision: Number(p.pin.material_revision),
          inputCatalogSha256: String(r.input_sha256),
          source,
          inputs: [p.pin as Json],
          candidates: [],
        },
        original,
        async (bytes) => createHash("sha256").update(bytes).digest("hex"),
      );
      if (
        material.derived.representationId !== p.pin.representation_id ||
        material.derived.sha256 !== p.pin.payload_sha256 ||
        material.derived.byteCount !== p.pin.byte_count
      )
        throw Error("UNIVERSAL_SOURCE_BINDING_INVALID");
      inputs.push({
        ...p.pin,
        pdfSource: {
          original,
          sealSha256: material.sealSha256,
          pageMapSha256: material.pageMapSha256,
          transformOptionsSha256: PDF_V2_OPTIONS_SHA,
        },
      });
    }
    lockedBinding = universalRunBindingSchema.parse({
      actorId: actor,
      tripId: trip,
      batchId: batch,
      submissionSha256: r.capture_submission_sha256,
      runId: r.id,
      taskId: r.interpretation_task_id,
      generation: r.generation,
      createdAt: new Date(String(r.created_at)).toISOString(),
      inputs,
    });
    return structuredClone(lockedBinding);
  }
  async function readSnapshot(task: Readonly<UniversalSourceTask>) {
    return scoped(async () => {
      const b = await binding(task.import_id!);
      if (
        task.account_id !== actor ||
        task.trip_id !== trip ||
        task.run_id !== b.runId ||
        task.task_id !== b.taskId ||
        task.manifest_sha256 !== b.submissionSha256
      )
        throw Error("UNIVERSAL_SOURCE_BINDING_INVALID");
      const rows = (
        await lease.query(
          "SELECT id,source_id,role,material_kind,encoding,mime_type,text_content,remote_state FROM public.trip_source_representations WHERE id=ANY(SELECT (p->>'representation_id')::uuid FROM jsonb_array_elements($1::jsonb) p)",
          [JSON.stringify(b.inputs)],
        )
      ).rows;
      if (rows.length !== b.inputs.length)
        throw Error("UNIVERSAL_SOURCE_BINDING_INVALID");
      const representations = [];
      for (const p of b.inputs) {
        const matches = rows.filter(
          (r) => r.id === p.representation_id && r.source_id === p.source_id,
        );
        if (matches.length !== 1) throw Error("UNIVERSAL_SOURCE_BINDING_INVALID");
        const rep = matches[0];
        if (
          rep.role === "ORIGINAL" &&
          rep.material_kind === "BINARY" &&
          rep.mime_type === "image/png" &&
          rep.remote_state === "VERIFIED" &&
          !p.pdfSource
        ) {
          await readUniversalPngSourceMaterial(
            lease,
            {
              actorAccountId: actor,
              tripId: trip,
              sourceId: p.source_id,
              sourceRevision: p.material_revision,
            },
            p,
            async (bytes) => createHash("sha256").update(bytes).digest("hex"),
            readBinary,
          );
          representations.push({
            inputId: p.id,
            sourceId: p.source_id,
            representationId: p.representation_id,
            revision: p.material_revision,
            sha256: p.payload_sha256,
            byteCount: p.byte_count,
            mime: "image/png",
            text: null,
          });
          continue;
        }
        // Only verified PDF provenance may qualify DERIVED text on this held lease.
        if (
          (p.pdfSource ? rep?.role !== "DERIVED" : rep?.role !== "ORIGINAL") ||
          rep?.material_kind !== "TEXT" ||
          rep.encoding !== "UTF-8" ||
          rep.remote_state !== "NOT_APPLICABLE" ||
          typeof rep.text_content !== "string"
        )
          throw Error("UNIVERSAL_MATERIAL_UNSUPPORTED");
        representations.push({
          inputId: p.id,
          sourceId: p.source_id,
          representationId: p.representation_id,
          revision: p.material_revision,
          sha256: p.payload_sha256,
          byteCount: p.byte_count,
          mime: "text/plain",
          text: rep.text_content,
          ...(p.pdfSource ? { pdfSource: p.pdfSource } : {}),
        });
      }
      return {
        accountId: actor,
        tripId: trip,
        batchId: b.batchId,
        taskId: b.taskId,
        runId: b.runId,
        submissionSha256: b.submissionSha256,
        representations,
      };
    });
  }
  let actorLocked = false;
  return {
    async assertCurrent() {
      return scoped(async () => {
        if (actorLocked) return;
        await lease.query("SET LOCAL ROLE otr_trip_core_v2_gateway");
        try {
          const current = await lockCorePgActor(lease, actor, trip);
          if (current.active !== true) throw Error("SOURCE_ACCESS_DENIED");
          actorLocked = true;
        } finally {
          await lease.query("SET LOCAL ROLE otr_trip_core_v2_writer");
        }
      });
    },
    async lookup(a: string, t: string, batch: string) {
      if (a !== actor || t !== trip) throw Error("SOURCE_ACCESS_DENIED");
      return scoped(() => binding(batch));
    },
    readManifest: createUniversalSourceReader({
      connection: {
        withLease: async () => {
          throw Error("SECOND_SOURCE_CONNECTION_FORBIDDEN");
        },
      },
      readSnapshot,
      readBinary: async (scope) => {
        if (!readBinary) throw Error("UNIVERSAL_MATERIAL_UNSUPPORTED");
        return readBinary(scope);
      },
    }),
  };
}
