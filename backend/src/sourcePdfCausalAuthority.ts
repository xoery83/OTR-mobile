import { sourcePdfPrepareCommandSchema } from "../../src/domain/trip/sourcePdfPreparation";
import {
  enterSourcePdfContinuousScope,
  type PdfSourceScopeIdentity,
} from "./sourcePdfContinuousScope";
import { sourcePdfV2UploadCommandSchema } from "../../src/domain/trip/sourcePdfV2Upload";
import { z } from "zod";
import {
  PDF_UPLOAD_QPDF_V4,
  sourcePdfV2UploadBindingSchema,
  sourcePdfV2UploadAckSchema,
  sourcePdfV2UploadGetSchema,
  type SourcePdfV2UploadBinding,
} from "../../src/domain/trip/sourcePdfV2Upload";
import { Buffer } from "node:buffer";
import type { CorePgConnection, CorePgLease } from "./tripCoreV2PgStorage";
import type {
  PdfPreparationAuthority,
  PdfReservedContext,
  PdfIngressIdentity,
} from "./sourcePdfBackendPreparation";
import type { SourcePdfStorageProducerFor } from "./sourcePdfStorageProducer";
import {
  PDF_UPLOAD_CAUSAL_V3,
  sourcePdfCausalBindingSchema,
  sourcePdfCausalAckSchema,
  sourcePdfCausalGetSchema,
} from "../../src/domain/trip/sourcePdfUploadCausal";
import { canonicalCoreJson, type Json } from "../../src/domain/trip/tripCoreV2Json";
import { importDigest } from "../../src/domain/trip/flightImportReview";
import { pdfHash } from "./sourcePdfProfile";

type Journal = {
  id: string;
  operation_id: string;
  phase: string;
  last_transition: string;
  owner_run: string;
  owner_fence: number;
  pdf_binding: Json;
  pdf_dispatch_id: string | null;
  pdf_dispatched_at?: string | null;
  pdf_beta_ack: { evidenceSha256: string } | null;
  pdf_beta_get: Json | null;
  terminal_observed_at?: string | null;
  staged_resource?: {
    id: string;
    node_id: string;
    resource_key: string;
    payload_sha256: string;
    byte_count: number;
    pdf_actor_account_id: string | null;
    pdf_causal_profile_id: string | null;
    pdf_sealed_at: string | null;
    pdf_stage_evidence_sha256: string | null;
    release_authorized_at: string | null;
    cleaned_at: string | null;
  };
  pdf_causal_read_permit: {
    readId: string;
    ackEvidenceSha256: string;
    ownerRun: string;
    ownerFence: number;
  } | null;
};
type CausalBinding = z.infer<typeof sourcePdfCausalBindingSchema>;
type Binding = CausalBinding | SourcePdfV2UploadBinding;
type Observation<B extends Binding> =
  | Awaited<ReturnType<SourcePdfStorageProducerFor<B>["upload"]>>
  | Awaited<ReturnType<SourcePdfStorageProducerFor<B>["read"]>>;
// Internal composition only. This owning auth-lifetime port is not caller JSON.
export type PdfCausalOwner = {
  ownerRun: string;
  producerId: string;
  providerInstanceSha256: string;
  accountGeneration(actorId: string): Promise<number>;
} & (
  | { authScopeKind?: undefined }
  | { authScopeKind: "SOURCE_REQUEST_LIFETIME_V1"; assertRequestCurrent(): void }
);
export function createSourcePdfCausalAuthority(
  connection: CorePgConnection,
  owner: PdfCausalOwner,
) {
  if (owner.authScopeKind) throw Error("SOURCE_CAPABILITY_CLOSED");
  const authority = createAuthority(connection, owner, {
    version: 3,
    issuer: PDF_UPLOAD_CAUSAL_V3.issuer,
    binding: sourcePdfCausalBindingSchema,
    ack: sourcePdfCausalAckSchema,
    get: sourcePdfCausalGetSchema,
    rpcPrefix: "trip_source_pdf_causal",
    digestPrefix: "otr-source-pdf-beta",
    digestSuffix: "v3",
  });
  const context = (c: PdfReservedContext) => ({
    ...c,
    binding: sourcePdfCausalBindingSchema.parse(c.binding),
  });
  return {
    ...authority,
    claim: (c: PdfReservedContext) => authority.claim(context(c)),
    finish: (c: PdfReservedContext, raw: string) => authority.finish(context(c), raw),
  };
}
export function createSourcePdfV2CausalAuthority(
  connection: CorePgConnection,
  owner: PdfCausalOwner,
  options: { continuousSourceScope?: true } = {},
) {
  if (owner.authScopeKind && !options.continuousSourceScope)
    throw Error("SOURCE_CAPABILITY_CLOSED");
  return createAuthority(connection, owner, {
    version: 4,
    issuer: PDF_UPLOAD_QPDF_V4.issuer,
    binding: sourcePdfV2UploadBindingSchema,
    ack: sourcePdfV2UploadAckSchema,
    get: sourcePdfV2UploadGetSchema,
    rpcPrefix: "trip_source_pdf_upload_v4",
    digestPrefix: "otr-source-pdf-qpdf-poppler",
    digestSuffix: "v4",
    continuousSourceScope: options.continuousSourceScope,
  });
}
function createAuthority<
  B extends Binding,
  A extends { evidenceSha256: string },
  G extends {
    evidenceSha256: string;
    read: { readId: string; ackEvidenceSha256: string };
  },
>(
  connection: CorePgConnection,
  owner: PdfCausalOwner,
  policy: {
    version: 3 | 4;
    issuer: string;
    binding: z.ZodType<B>;
    ack: z.ZodType<A>;
    get: z.ZodType<G>;
    rpcPrefix: "trip_source_pdf_causal" | "trip_source_pdf_upload_v4";
    digestPrefix: "otr-source-pdf-beta" | "otr-source-pdf-qpdf-poppler";
    digestSuffix: "v3" | "v4";
    continuousSourceScope?: true;
  },
) {
  const assertRequestCurrent = () => {
    if (owner.authScopeKind) owner.assertRequestCurrent();
  };
  async function transaction<T>(work: (lease: CorePgLease) => Promise<T>) {
    return connection.withLease(async (lease) => {
      let began = false;
      const scopedLease: CorePgLease = owner.authScopeKind
        ? {
            retire: () => lease.retire(),
            async query(sql, parameters) {
              assertRequestCurrent();
              const result = await lease.query(sql, parameters);
              assertRequestCurrent();
              return result;
            },
          }
        : lease;
      try {
        assertRequestCurrent();
        const before = (
          await lease.query(
            "SELECT session_user AS principal,current_user AS role,pg_current_xact_id()::text AS xid",
          )
        ).rows[0];
        if (
          before?.principal !== "otr_trip_source_command_gateway" ||
          before.role !== before.principal
        )
          throw new Error("PDF_PRINCIPAL_DENIED");
        await lease.query("BEGIN");
        const xid = (await lease.query("SELECT pg_current_xact_id()::text AS xid"))
          .rows[0]?.xid;
        if (!xid || xid === before.xid) {
          // BEGIN inside a caller transaction is only a warning. Never accept a savepoint/outer transaction.
          lease.retire();
          throw new Error("PDF_TOP_LEVEL_TRANSACTION_REQUIRED");
        }
        began = true;
        await lease.query("SET LOCAL statement_timeout='5000ms'");
        await lease.query("SET LOCAL lock_timeout='1000ms'");
        assertRequestCurrent();
        const result = await work(scopedLease);
        assertRequestCurrent();
        await lease.query("COMMIT");
        began = false;
        assertRequestCurrent();
        return result;
      } catch (error) {
        if (began) await lease.query("ROLLBACK").catch(() => lease.retire());
        throw error;
      }
    });
  }
  const rpc = async <T>(
    name: string,
    types: string[],
    values: readonly unknown[],
    scope?: PdfSourceScopeIdentity,
  ) => {
    const actor =
      scope?.actorAccountId ?? (typeof values[0] === "string" ? values[0] : "");
    const fence = owner.authScopeKind ? await owner.accountGeneration(actor) : undefined;
    const result = await transaction(async (lease) => {
      if (policy.continuousSourceScope) {
        if (scope) await enterSourcePdfContinuousScope(lease, scope);
        else if (name !== `${policy.rpcPrefix}_inventory`)
          throw Error("PDF_SCOPE_IDENTITY_REQUIRED");
      }
      return (
        await lease.query(
          `SELECT public.${name}(${types.map((t, i) => `$${i + 1}::${t}`).join(",")}) AS result`,
          values,
        )
      ).rows[0]?.result as T;
    });
    if (owner.authScopeKind && (await owner.accountGeneration(actor)) !== fence)
      throw Error("PDF_SCOPE_FORBIDDEN");
    return result;
  };
  const execute = (
    c: PdfReservedContext<B>,
    action: string,
    proof: Json | null = null,
  ) => {
    if (c.ownerRun !== owner.ownerRun) throw new Error("PDF_SCOPE_FORBIDDEN");
    return rpc<Journal>(
      `${policy.rpcPrefix}_execute`,
      ["uuid", "uuid", "bigint", "text", "jsonb"],
      [
        c.binding.attemptId,
        c.ownerRun,
        c.ownerFence,
        action,
        proof === null ? null : canonicalCoreJson(proof),
      ],
      c.binding,
    );
  };
  function context(
    j: Journal,
    generation: number,
    allowPriorOwner = false,
  ): PdfReservedContext<B> {
    const binding = policy.binding.parse(j.pdf_binding);
    if (
      binding.producerId !== owner.producerId ||
      binding.providerInstanceSha256 !== owner.providerInstanceSha256 ||
      (!allowPriorOwner && j.owner_run !== owner.ownerRun)
    )
      throw new Error("PDF_SCOPE_FORBIDDEN");
    return {
      binding,
      accountGeneration: generation,
      dispatchId: j.pdf_dispatch_id,
      ownerRun: j.owner_run,
      ownerFence: j.owner_fence,
    };
  }
  async function inventory(
    actorId: string,
    identity: Pick<PdfIngressIdentity, "tripId" | "sourceId">,
  ) {
    return rpc<Journal[]>(
      `${policy.rpcPrefix}_inventory`,
      ["uuid", "uuid", "uuid"],
      [actorId, identity.tripId, identity.sourceId],
    );
  }
  async function current(c: PdfReservedContext<B>) {
    const generation = await owner.accountGeneration(c.binding.actorAccountId);
    if (generation !== c.accountGeneration) throw new Error("PDF_SCOPE_FORBIDDEN");
    const j = (await inventory(c.binding.actorAccountId, c.binding)).find(
      (j) => j.id === c.binding.attemptId,
    );
    if (
      !j ||
      j.phase === "TERMINAL" ||
      j.owner_run !== c.ownerRun ||
      j.owner_fence !== c.ownerFence ||
      canonicalCoreJson(context(j, generation).binding as unknown as Json) !==
        canonicalCoreJson(c.binding as unknown as Json)
    )
      throw new Error("SOURCE_EXECUTION_FENCE_CONFLICT");
    return j;
  }
  async function proof(c: PdfReservedContext<B>, action: "ACK" | "GET", detail: object) {
    const body = {
      uploadVersion: policy.version,
      issuer: policy.issuer,
      binding: c.binding,
      ownerRun: c.ownerRun,
      ownerFence: c.ownerFence,
      dispatchId: c.dispatchId,
      observedAt: new Date().toISOString().replace(/(\.\d{3})Z$/, "$1000Z"),
      ...detail,
    };
    return {
      ...body,
      evidenceSha256: await importDigest(
        `${policy.digestPrefix}-${action.toLowerCase()}-${policy.digestSuffix}`,
        body as unknown as Json,
        async (bytes) => pdfHash(bytes),
      ),
    };
  }
  const authority: PdfPreparationAuthority<B> &
    Required<
      Pick<
        PdfPreparationAuthority<B>,
        "recordStage" | "prepareRead" | "canResumeSealedStage"
      >
    > = {
    async resolveReserved(actorId, identity) {
      const generation = await owner.accountGeneration(actorId);
      if (generation !== identity.accountGeneration)
        throw new Error("PDF_SCOPE_FORBIDDEN");
      const found = (await inventory(actorId, identity)).filter(
        (j) => j.operation_id === identity.operationId,
      );
      if (found.length !== 1) throw new Error("PDF_UPLOAD_PLAN_CONFLICT");
      const c = context(found[0], generation);
      if (
        c.binding.actorAccountId !== actorId ||
        c.binding.representationId !== identity.representationId
      )
        throw new Error("PDF_SCOPE_FORBIDDEN");
      return c;
    },
    async assertCurrent(c) {
      await current(c);
      if (
        policy.continuousSourceScope &&
        !(await transaction((lease) => enterSourcePdfContinuousScope(lease, c.binding)))
      )
        throw Error("UNIVERSAL_PDF_SOURCE_CLOSED");
      if (
        owner.authScopeKind &&
        (await owner.accountGeneration(c.binding.actorAccountId)) !== c.accountGeneration
      )
        throw Error("PDF_SCOPE_FORBIDDEN");
    },
    async canResumeSealedStage(c: PdfReservedContext<B>) {
      if (policy.version !== 4) return false;
      const j = await current(c);
      const s = j.staged_resource;
      return (
        c.ownerRun === owner.ownerRun &&
        c.ownerFence > 1 &&
        j.phase === "STARTING" &&
        j.last_transition === "CLAIM" &&
        j.pdf_dispatch_id === null &&
        j.pdf_dispatched_at === null &&
        j.pdf_beta_ack === null &&
        j.pdf_beta_get === null &&
        j.pdf_causal_read_permit === null &&
        j.terminal_observed_at === null &&
        s?.id === c.binding.resourceId &&
        s.node_id === c.binding.nodeId &&
        s.resource_key === c.binding.resourceKey &&
        s.payload_sha256 === c.binding.sha256 &&
        s.byte_count === c.binding.byteCount &&
        s.pdf_actor_account_id === c.binding.actorAccountId &&
        s.pdf_causal_profile_id === "PDF_PRIVATE_UPLOAD_QPDF_POPPLER_V4" &&
        typeof s.pdf_sealed_at === "string" &&
        s.pdf_sealed_at.length > 0 &&
        Number.isFinite(Date.parse(s.pdf_sealed_at)) &&
        s.pdf_stage_evidence_sha256 ===
          pdfHash(canonicalCoreJson(c.binding as unknown as Json)) &&
        s.release_authorized_at === null &&
        s.cleaned_at === null
      );
    },
    async recordStage(c, sealed) {
      const j = await current(c);
      if (
        sealed.resourceId !== c.binding.resourceId ||
        sealed.resourceKey !== c.binding.resourceKey ||
        sealed.sha256 !== c.binding.sha256 ||
        sealed.byteCount !== c.binding.byteCount ||
        sealed.bindingSha256 !== pdfHash(canonicalCoreJson(c.binding as unknown as Json))
      )
        throw new Error("PDF_STAGE_PROOF_CONFLICT");
      const stageProof = {
        sha256: sealed.sha256,
        byteCount: sealed.byteCount,
        evidenceSha256: sealed.bindingSha256,
      };
      if (policy.version === 4 && c.ownerFence > 1) {
        if (j.phase !== "STARTING" || !["TAKEOVER", "CLAIM"].includes(j.last_transition))
          throw new Error("PDF_UNDISPATCHED_STAGE_CONFLICT");
        await rpc<Journal>(
          "trip_source_pdf_upload_v4_restage",
          ["uuid", "uuid", "bigint", "jsonb"],
          [c.binding.attemptId, c.ownerRun, c.ownerFence, canonicalCoreJson(stageProof)],
          c.binding,
        );
      } else await execute(c, "STAGE", stageProof);
    },
    async consumeDispatch(c) {
      const j = await current(c);
      if (j.phase !== "STARTING" || j.pdf_dispatch_id !== null) return null;
      if (policy.version === 4 && j.owner_fence > 1) {
        if (j.last_transition !== "CLAIM") return null;
        const recovered = await rpc<Journal>(
          "trip_source_pdf_upload_v4_recover_dispatch",
          ["uuid", "uuid", "bigint"],
          [c.binding.attemptId, c.ownerRun, c.ownerFence],
          c.binding,
        );
        if (!recovered.pdf_dispatch_id) throw new Error("DISPATCH_ID_REQUIRED");
        return { dispatchId: recovered.pdf_dispatch_id };
      }
      if (j.owner_fence !== 1) return null;
      const dispatched = await execute(c, "DISPATCH");
      if (!dispatched.pdf_dispatch_id) throw new Error("DISPATCH_ID_REQUIRED");
      // Only this live successful DISPATCH call gets a grant. Restart/replay can never confirm for writing.
      await execute({ ...c, dispatchId: dispatched.pdf_dispatch_id }, "CONFIRM");
      return { dispatchId: dispatched.pdf_dispatch_id };
    },
    async prepareRead(c) {
      const prior = await current(c);
      if (prior.pdf_beta_get) {
        const retained = policy.get.parse(prior.pdf_beta_get);
        return {
          readId: retained.read.readId,
          ackEvidenceSha256: retained.read.ackEvidenceSha256,
          retainedEvidenceSha256: retained.evidenceSha256,
        };
      }
      const j = await execute(c, "READ"),
        permit = j.pdf_causal_read_permit;
      if (
        !permit ||
        permit.ownerRun !== c.ownerRun ||
        permit.ownerFence !== c.ownerFence ||
        permit.ackEvidenceSha256 !== j.pdf_beta_ack?.evidenceSha256
      )
        throw new Error("PDF_CAUSAL_ACK_REQUIRED");
      return { readId: permit.readId, ackEvidenceSha256: permit.ackEvidenceSha256 };
    },
    async recordObservation(c, observation: Observation<B>) {
      const binding = policy.binding.parse(c.binding);
      if (
        binding.producerId !== owner.producerId ||
        binding.providerInstanceSha256 !== owner.providerInstanceSha256 ||
        observation.request.configurationSha256 !== owner.providerInstanceSha256
      )
        throw new Error("PDF_PROVIDER_BINDING_CONFLICT");
      if (
        canonicalCoreJson(observation.request.binding as unknown as Json) !==
          canonicalCoreJson(c.binding as unknown as Json) ||
        observation.request.dispatchId !== c.dispatchId
      )
        throw new Error("PDF_SCOPE_FORBIDDEN");
      if (observation.kind === "COMPLETE_ACK") {
        const p = policy.ack.parse(
          await proof(c, "ACK", {
            response: {
              status: observation.status,
              transportComplete: true,
              upsert: false,
              body: observation.responseBody,
              bodySha256: observation.responseSha256,
              bodyByteCount: Buffer.byteLength(observation.responseBody),
            },
          }),
        );
        await execute(c, "ACK", p as unknown as Json);
        return p.evidenceSha256;
      }
      if (observation.kind === "MATCH") {
        const j = await current(c);
        const request = observation.request;
        if (
          !("readId" in request) ||
          !("ackEvidenceSha256" in request) ||
          !("cacheBypassed" in request) ||
          request.cacheBypassed !== true ||
          request.readId !== j.pdf_causal_read_permit?.readId ||
          request.ackEvidenceSha256 !== j.pdf_beta_ack?.evidenceSha256
        )
          throw new Error("PDF_CAUSAL_GET_INVALID");
        const p = policy.get.parse(
          await proof(c, "GET", {
            read: {
              readId: request.readId,
              ackEvidenceSha256: request.ackEvidenceSha256,
              sha256: observation.sha256,
              byteCount: observation.byteCount,
              mimeType: observation.mimeType,
              cacheBypassed: true,
            },
          }),
        );
        await execute(c, "GET", p as unknown as Json);
        return p.evidenceSha256;
      }
      await execute(c, "UNKNOWN");
      return "UNKNOWN";
    },
  };
  return {
    ...authority,
    async status(actorId: string, identity: PdfIngressIdentity) {
      if (policy.version !== 4 || !policy.continuousSourceScope)
        throw Error("SOURCE_CAPABILITY_CLOSED");
      if ((await owner.accountGeneration(actorId)) !== identity.accountGeneration)
        throw Error("PDF_SCOPE_FORBIDDEN");
      const matches = (await inventory(actorId, identity)).filter(
        (j) => j.operation_id === identity.operationId,
      );
      if ((await owner.accountGeneration(actorId)) !== identity.accountGeneration)
        throw Error("PDF_SCOPE_FORBIDDEN");
      // Cleaned terminal attempts are absent too; this never proves no prior receipt.
      if (!matches.length) return "NO_ACTIVE_ATTEMPT" as const;
      if (matches.length !== 1) throw Error("PDF_UPLOAD_PLAN_CONFLICT");
      const j = matches[0],
        b = policy.binding.parse(j.pdf_binding);
      if (
        b.actorAccountId !== actorId ||
        b.tripId !== identity.tripId ||
        b.sourceId !== identity.sourceId ||
        b.representationId !== identity.representationId ||
        b.operationId !== identity.operationId
      )
        throw Error("PDF_SCOPE_FORBIDDEN");
      if (
        j.owner_run !== owner.ownerRun ||
        b.producerId !== owner.producerId ||
        b.providerInstanceSha256 !== owner.providerInstanceSha256
      )
        return "RECOVERY_REQUIRED" as const;
      if (j.pdf_beta_get) {
        policy.get.parse(j.pdf_beta_get);
        return "READ_OBSERVED" as const;
      }
      if (j.pdf_beta_ack) {
        policy.ack.parse(j.pdf_beta_ack);
        return "ACK_OBSERVED" as const;
      }
      if (j.phase === "UNKNOWN") return "UNKNOWN" as const;
      if (j.phase === "RUNNING" && j.pdf_dispatch_id) return "DISPATCH_RECORDED" as const;
      if (j.phase !== "STARTING" || j.pdf_dispatch_id)
        return "RECOVERY_REQUIRED" as const;
      return j.staged_resource?.pdf_sealed_at
        ? ("STAGED" as const)
        : ("RESERVED" as const);
    },
    async prepare(actorId: string, raw: string, generation: number) {
      if (policy.version !== 4 || !policy.continuousSourceScope)
        throw Error("SOURCE_CAPABILITY_CLOSED");
      const q = sourcePdfPrepareCommandSchema.parse(JSON.parse(raw));
      if (
        q.actor_account_id !== actorId ||
        (await owner.accountGeneration(actorId)) !== generation
      )
        throw Error("PDF_SCOPE_FORBIDDEN");
      return rpc<Json>(
        "trip_source_prepare_representation",
        ["uuid", "text"],
        [actorId, raw],
        {
          actorAccountId: actorId,
          tripId: q.trip_id,
          sourceId: q.source_id,
        },
      );
    },
    // Caller supplies an already-approved owning Source command, not a second command grammar.
    async admit(
      actorId: string,
      raw: string,
      generation: number,
      resource: {
        attemptId: string;
        resourceId: string;
        nodeId: string;
        resourceKey: string;
        runToken: string;
      },
    ) {
      if ((await owner.accountGeneration(actorId)) !== generation)
        throw new Error("PDF_SCOPE_FORBIDDEN");
      let scope: PdfSourceScopeIdentity | undefined;
      if (policy.continuousSourceScope) {
        const q = sourcePdfV2UploadCommandSchema.parse(JSON.parse(raw));
        if (q.actor_account_id !== actorId) throw Error("PDF_SCOPE_FORBIDDEN");
        scope = { actorAccountId: actorId, tripId: q.trip_id, sourceId: q.source_id };
      }
      const reply = await rpc<{ journal?: Journal; receipt?: Json }>(
        `${policy.rpcPrefix}_begin`,
        ["uuid", "text", "uuid", "uuid", "uuid", "text", "uuid", "uuid"],
        [
          actorId,
          raw,
          resource.attemptId,
          resource.resourceId,
          resource.nodeId,
          resource.resourceKey,
          resource.runToken,
          owner.ownerRun,
        ],
        scope,
      );
      // A prior reservation can be inspected for claim; current() still fences IO.
      return reply.receipt
        ? { receipt: reply.receipt }
        : { context: context(reply.journal!, generation, true) };
    },
    async finish(c: PdfReservedContext<B>, raw: string) {
      if (
        c.ownerRun !== owner.ownerRun ||
        (await owner.accountGeneration(c.binding.actorAccountId)) !== c.accountGeneration
      )
        throw new Error("PDF_SCOPE_FORBIDDEN");
      return rpc<Json>(
        `${policy.rpcPrefix}_finish`,
        ["uuid", "text", "uuid", "uuid", "bigint"],
        [c.binding.actorAccountId, raw, c.binding.attemptId, c.ownerRun, c.ownerFence],
        c.binding,
      );
    },
    async claim(c: PdfReservedContext<B>) {
      if (
        (await owner.accountGeneration(c.binding.actorAccountId)) !== c.accountGeneration
      )
        throw new Error("PDF_SCOPE_FORBIDDEN");
      const old = (await inventory(c.binding.actorAccountId, c.binding)).find(
        (j) => j.id === c.binding.attemptId,
      );
      if (
        !old ||
        old.owner_run !== c.ownerRun ||
        old.owner_fence !== c.ownerFence ||
        canonicalCoreJson(old.pdf_binding) !==
          canonicalCoreJson(c.binding as unknown as Json)
      )
        throw new Error("SOURCE_EXECUTION_FENCE_CONFLICT");
      const j = await rpc<Journal>(
        policy.version === 4 && old.pdf_dispatch_id === null
          ? "trip_source_pdf_upload_v4_recover_claim"
          : `${policy.rpcPrefix}_claim`,
        ["uuid", "bigint", "uuid"],
        [c.binding.attemptId, c.ownerFence, owner.ownerRun],
        c.binding,
      );
      return context(j, await owner.accountGeneration(c.binding.actorAccountId));
    },
  };
}
