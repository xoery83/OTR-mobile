import { Buffer } from "node:buffer";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createServer } from "node:http";
import { afterEach, expect, it, vi } from "vitest";
import { importDigest } from "../../src/domain/trip/flightImportReview";
import { canonicalCoreJson } from "../../src/domain/trip/tripCoreV2Json";
import {
  sourcePdfCausalAckSchema,
  sourcePdfCausalGetSchema,
} from "../../src/domain/trip/sourcePdfUploadCausal";
import {
  PDF_UPLOAD_QPDF_V4,
  sourcePdfV2UploadAckSchema,
  sourcePdfV2UploadGetSchema,
  type SourcePdfV2UploadBinding,
} from "../../src/domain/trip/sourcePdfV2Upload";
import { createSourcePdfV2CausalAuthority } from "./sourcePdfCausalAuthority";
import { createSourcePdfV2BackendPreparation } from "./sourcePdfBackendPreparation";
import { createSourcePdfV2PrivateStage } from "./sourcePdfPrivateStage";
import { createSourcePdfV2StorageProducer } from "./sourcePdfStorageProducer";
import { runSourcePdfV2LinuxWorker } from "./sourcePdfV2LinuxWorker";
import type { DevBackendGateway } from "./app";
vi.mock("./sourcePdfV2LinuxWorker", () => ({
  SOURCE_PDF_V2_LINUX_IMAGE:
    "sha256:d27ddd7b09410b0a3b220b2768c0f6b2b25c32da528a42041bc50ea19eefc1b7",
  runSourcePdfV2LinuxWorker: vi.fn(),
}));
const digest = (data: Uint8Array | string) =>
  createHash("sha256").update(data).digest("hex");
const cleanup: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((f) => f()));
  vi.resetAllMocks();
});
async function fixture() {
  const bytes = Buffer.alloc(70000, 37),
    tripId = randomUUID(),
    sourceId = randomUUID(),
    representationId = randomUUID();
  let posts = 0,
    gets = 0;
  const server = createServer(async (req, res) => {
    if (req.method === "POST") {
      posts++;
      const parts: Buffer[] = [];
      for await (const part of req) parts.push(Buffer.from(part));
      expect(Buffer.concat(parts)).toEqual(bytes);
      expect(req.headers["x-upsert"]).toBe("false");
      res.setHeader("content-type", "application/json");
      res.end(
        JSON.stringify({ Id: randomUUID(), Key: req.url!.slice("/object/".length) }),
      );
    } else {
      gets++;
      expect(req.headers["cache-control"]).toContain("no-cache");
      res.setHeader("content-type", "application/pdf");
      res.setHeader("content-length", bytes.length);
      res.end(bytes);
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  cleanup.push(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("test listener unavailable");
  const config = {
    instanceId: "synthetic",
    origin: `http://127.0.0.1:${address.port}`,
    credentialRef: "synthetic",
    serviceToken: "synthetic-only",
    timeoutMs: 1000,
    localFixture: true as const,
  };
  const provider = createSourcePdfV2StorageProducer(config),
    root = await mkdtemp(join(tmpdir(), "otr-source-v4-preparation-"));
  cleanup.push(() => rm(root, { recursive: true, force: true }));
  const stage = createSourcePdfV2PrivateStage(root);
  const binding: SourcePdfV2UploadBinding = {
    uploadVersion: 4,
    operationId: randomUUID(),
    operationKey: "v4-op",
    operationSha256: "a".repeat(64),
    actorAccountId: randomUUID(),
    tripId,
    sourceId,
    representationId,
    materialRevision: 1,
    sourceRowRevision: 1,
    representationRowRevision: 1,
    parentOperationId: randomUUID(),
    attemptId: randomUUID(),
    attemptGeneration: 1,
    executionPrincipal: "otr_trip_source_command_gateway",
    resourceId: randomUUID(),
    nodeId: randomUUID(),
    resourceKey: "b".repeat(64),
    runToken: randomUUID(),
    provider: "supabase_storage",
    bucket: "trip-source-material",
    objectKey: `v1/${tripId}/${sourceId}/${representationId}/payload`,
    sha256: digest(bytes),
    byteCount: bytes.length,
    mimeType: "application/pdf",
    profileId: PDF_UPLOAD_QPDF_V4.profileId,
    profileSha256: PDF_UPLOAD_QPDF_V4.profileSha256,
    producerId: randomUUID(),
    providerInstanceSha256: provider.configurationSha256,
  };
  vi.mocked(runSourcePdfV2LinuxWorker).mockResolvedValue({
    engine: "qpdf-poppler",
    version: 1,
    originalSha256: binding.sha256,
    originalByteCount: bytes.length,
    text: "NZ5069",
    pages: [{ pageIndex: 0, start: 0, end: 6 }],
    toleratedUnreferencedZeroOffsetObjects: [],
  });
  const owner = {
    ownerRun: randomUUID(),
    producerId: binding.producerId,
    providerInstanceSha256: provider.configurationSha256,
    accountGeneration: async () => 1,
  };
  let journal = {
    id: binding.attemptId,
    operation_id: binding.operationId,
    phase: "STARTING",
    last_transition: "CLAIM",
    owner_run: owner.ownerRun,
    owner_fence: 1,
    pdf_binding: binding,
    pdf_dispatch_id: null as string | null,
    pdf_dispatched_at: null as string | null,
    pdf_beta_ack: null as null | { evidenceSha256: string },
    pdf_beta_get: null as unknown,
    terminal_observed_at: null as string | null,
    staged_resource: {
      id: binding.resourceId,
      node_id: binding.nodeId,
      resource_key: binding.resourceKey,
      payload_sha256: binding.sha256,
      byte_count: binding.byteCount,
      pdf_actor_account_id: binding.actorAccountId,
      pdf_causal_profile_id: "PDF_PRIVATE_UPLOAD_QPDF_POPPLER_V4",
      pdf_sealed_at: null as string | null,
      pdf_stage_evidence_sha256: null as string | null,
      release_authorized_at: null as string | null,
      cleaned_at: null as string | null,
    },
    pdf_causal_read_permit: null as null | {
      readId: string;
      ackEvidenceSha256: string;
      ownerRun: string;
      ownerFence: number;
    },
  };
  let staged = false,
    consumed = false,
    xid = 1;
  const events: string[] = [],
    readId = randomUUID(),
    calls: string[] = [],
    observations: unknown[] = [];
  // Test-only SQL/journal double, NOT a real SQL permit or Source authority receipt.
  const authority = createSourcePdfV2CausalAuthority(
    {
      withLease: async (work) =>
        work({
          retire: vi.fn(),
          async query(sql, args = []) {
            if (sql.startsWith("SELECT session_user"))
              return {
                rows: [
                  {
                    principal: "otr_trip_source_command_gateway",
                    role: "otr_trip_source_command_gateway",
                    xid: String(xid),
                  },
                ],
              };
            if (sql === "BEGIN") {
              xid++;
              return { rows: [] };
            }
            if (sql.startsWith("SELECT pg_current_xact_id"))
              return { rows: [{ xid: String(xid) }] };
            if (sql.includes("trip_source_pdf_upload_v4_begin"))
              return { rows: [{ result: { journal: structuredClone(journal) } }] };
            if (sql.includes("trip_source_pdf_upload_v4_recover_claim")) {
              expect(args).toEqual([binding.attemptId, 1, owner.ownerRun]);
              journal.owner_run = owner.ownerRun;
              journal.owner_fence = 2;
              journal.phase = "STARTING";
              journal.last_transition = "TAKEOVER";
              return { rows: [{ result: structuredClone(journal) }] };
            }
            if (sql.includes("trip_source_pdf_upload_v4_restage")) {
              expect(args.slice(0, 3)).toEqual([binding.attemptId, owner.ownerRun, 2]);
              const proof = JSON.parse(String(args[3]));
              expect(proof.byteCount).toBe(bytes.length);
              staged = true;
              journal.last_transition = "CLAIM";
              journal.staged_resource.pdf_sealed_at = "2026-10-18T00:00:00Z";
              journal.staged_resource.pdf_stage_evidence_sha256 = digest(
                canonicalCoreJson(binding),
              );
              events.push("STAGE");
              return { rows: [{ result: structuredClone(journal) }] };
            }
            if (sql.includes("trip_source_pdf_upload_v4_recover_dispatch")) {
              expect(args).toEqual([binding.attemptId, owner.ownerRun, 2]);
              if (!staged || consumed) throw new Error("PDF_DUPLICATE_DISPATCH");
              consumed = true;
              journal.pdf_dispatch_id = randomUUID();
              journal.phase = "RUNNING";
              journal.last_transition = "RUNNING";
              events.push("DISPATCH");
              return { rows: [{ result: structuredClone(journal) }] };
            }
            if (sql.includes("trip_source_pdf_upload_v4_claim")) {
              expect(args).toEqual([binding.attemptId, 1, owner.ownerRun]);
              journal.owner_run = owner.ownerRun;
              journal.owner_fence = 2;
              return { rows: [{ result: structuredClone(journal) }] };
            }
            if (sql.includes("trip_source_pdf_upload_v4_inventory")) {
              calls.push("INVENTORY");
              return { rows: [{ result: [structuredClone(journal)] }] };
            }
            if (sql.includes("trip_source_pdf_upload_v4_execute")) {
              expect(args.slice(0, 3)).toEqual([
                binding.attemptId,
                owner.ownerRun,
                journal.owner_fence,
              ]);
              const action = String(args[3]),
                proof = args[4] ? JSON.parse(String(args[4])) : null;
              calls.push(action);
              if (action === "STAGE") {
                expect(proof.byteCount).toBe(bytes.length);
                events.push("STAGE");
                staged = true;
                journal.staged_resource.pdf_sealed_at = "2026-10-18T00:00:00Z";
                journal.staged_resource.pdf_stage_evidence_sha256 = digest(
                  canonicalCoreJson(binding),
                );
              }
              if (action === "DISPATCH") {
                if (!staged || consumed) throw new Error("PDF_DUPLICATE_DISPATCH");
                consumed = true;
                events.push("DISPATCH");
                journal.pdf_dispatch_id = randomUUID();
              }
              if (action === "CONFIRM") {
                expect(journal.pdf_dispatch_id).not.toBeNull();
                events.push("CONFIRM");
                journal.phase = "RUNNING";
              }
              if (action === "ACK") {
                observations.push(proof);
                events.push("ACK");
                journal.pdf_beta_ack = proof;
              }
              if (action === "READ") {
                if (!journal.pdf_beta_ack) throw new Error("PDF_CAUSAL_ACK_REQUIRED");
                events.push("READ");
                journal.pdf_causal_read_permit = {
                  readId,
                  ackEvidenceSha256: journal.pdf_beta_ack.evidenceSha256,
                  ownerRun: owner.ownerRun,
                  ownerFence: 1,
                };
              }
              if (action === "GET") {
                observations.push(proof);
                events.push("GET");
                journal.pdf_beta_get = proof;
              }
              return { rows: [{ result: structuredClone(journal) }] };
            }
            if (["COMMIT", "ROLLBACK"].includes(sql) || sql.startsWith("SET LOCAL"))
              return { rows: [] };
            throw new Error("Unexpected test SQL: " + sql);
          },
        }),
    },
    owner,
  );
  const gateway = {
    validateAccessToken: async () => ({ id: binding.actorAccountId }),
    canReadTrip: async () => true,
  } as unknown as DevBackendGateway;
  const adapter = () =>
    createSourcePdfV2BackendPreparation(gateway, authority, stage, provider);
  const identity = {
    tripId,
    sourceId,
    representationId,
    operationId: binding.operationId,
    accountGeneration: 1,
  };
  const request = () =>
    new Request("http://local/unregistered", {
      method: "POST",
      headers: {
        Authorization: "Bearer synthetic-session",
        "content-type": "application/pdf",
        "content-length": String(bytes.length),
      },
      body: bytes,
    });
  return {
    binding,
    authority,
    provider,
    stage,
    gateway,
    adapter,
    identity,
    request,
    events,
    counts: () => ({ posts, gets }),
    drift: () => {
      provider.configurationSha256 = "f".repeat(64);
    },
    observations,
    calls,
    owner,
    setReservedOwnerRun: (run: ReturnType<typeof randomUUID>) => {
      journal.owner_run = run;
    },
    setReservedDispatch: (dispatchId: ReturnType<typeof randomUUID> | null) => {
      journal.pdf_dispatch_id = dispatchId;
    },
    setReservedProvider: (hash: string) => {
      journal.pdf_binding = { ...binding, providerInstanceSha256: hash };
    },
    setStageReleased: () => {
      journal.staged_resource.release_authorized_at = "2026-10-18T00:00:01Z";
    },
    setStageEvidence: (evidence: string) => {
      journal.staged_resource.pdf_stage_evidence_sha256 = evidence;
    },
    setStageSealedAt: (value: string | null) => {
      journal.staged_resource.pdf_sealed_at = value;
    },
    removePhysicalStage: () => rm(join(root, binding.resourceId), { force: true }),
  };
}
it("reads a prior-owner reservation for claim but fences its IO until current-owner claim", async () => {
  const f = await fixture();
  const priorRun = randomUUID();
  f.setReservedOwnerRun(priorRun);
  f.setReservedDispatch(randomUUID());
  const reserved = await f.authority.admit(
    f.binding.actorAccountId,
    "synthetic approved command",
    1,
    {
      attemptId: f.binding.attemptId,
      resourceId: f.binding.resourceId,
      nodeId: f.binding.nodeId,
      resourceKey: f.binding.resourceKey,
      runToken: f.binding.runToken,
    },
  );
  const prior = reserved.context!;
  expect(prior.ownerRun).toBe(priorRun);
  expect(prior.ownerFence).toBe(1);
  await expect(f.authority.assertCurrent(prior)).rejects.toThrow("PDF_SCOPE_FORBIDDEN");
  await expect(f.authority.recordStage(prior, {} as never)).rejects.toThrow(
    "PDF_SCOPE_FORBIDDEN",
  );
  const request = {
    binding: f.binding,
    configurationSha256: f.provider.configurationSha256,
    dispatchId: prior.dispatchId,
  };
  const body = JSON.stringify({ Id: randomUUID(), Key: f.binding.objectKey });
  const callsBefore = [...f.calls];
  await expect(
    f.authority.recordObservation(prior, {
      kind: "COMPLETE_ACK",
      request,
      status: 200,
      responseBody: body,
      responseSha256: digest(body),
    } as never),
  ).rejects.toThrow("PDF_SCOPE_FORBIDDEN");
  await expect(
    f.authority.recordObservation(prior, {
      kind: "UNKNOWN",
      request,
      reason: "INCOMPLETE_RESPONSE",
    } as never),
  ).rejects.toThrow("PDF_SCOPE_FORBIDDEN");
  await expect(f.authority.finish(prior, "synthetic receipt")).rejects.toThrow(
    "PDF_SCOPE_FORBIDDEN",
  );
  expect(f.calls).toEqual(callsBefore);
  expect(f.counts()).toEqual({ posts: 0, gets: 0 });
  await expect(f.authority.claim({ ...prior, ownerRun: randomUUID() })).rejects.toThrow(
    "SOURCE_EXECUTION_FENCE_CONFLICT",
  );

  const claimed = await f.authority.claim(prior);
  expect(claimed.ownerRun).toBe(f.owner.ownerRun);
  expect(claimed.ownerFence).toBe(2);
  await f.authority.assertCurrent(claimed);
  await expect(f.authority.assertCurrent(prior)).rejects.toThrow(
    "SOURCE_EXECUTION_FENCE_CONFLICT",
  );
  f.setReservedProvider("f".repeat(64));
  await expect(
    f.authority.admit(f.binding.actorAccountId, "synthetic approved command", 1, {
      attemptId: f.binding.attemptId,
      resourceId: f.binding.resourceId,
      nodeId: f.binding.nodeId,
      resourceKey: f.binding.resourceKey,
      runToken: f.binding.runToken,
    }),
  ).rejects.toThrow("PDF_SCOPE_FORBIDDEN");
  f.setReservedProvider(f.binding.providerInstanceSha256);
  f.owner.accountGeneration = async () => 2;
  await expect(
    f.authority.admit(f.binding.actorAccountId, "synthetic approved command", 1, {
      attemptId: f.binding.attemptId,
      resourceId: f.binding.resourceId,
      nodeId: f.binding.nodeId,
      resourceKey: f.binding.resourceKey,
      runToken: f.binding.runToken,
    }),
  ).rejects.toThrow("PDF_SCOPE_FORBIDDEN");
});
it("routes an undispatched V4 restart through recovery claim, fresh Stage, and one grant", async () => {
  const f = await fixture();
  f.setReservedOwnerRun(randomUUID());
  f.setReservedDispatch(null);
  const reserved = await f.authority.admit(
    f.binding.actorAccountId,
    "synthetic approved command",
    1,
    {
      attemptId: f.binding.attemptId,
      resourceId: f.binding.resourceId,
      nodeId: f.binding.nodeId,
      resourceKey: f.binding.resourceKey,
      runToken: f.binding.runToken,
    },
  );
  const current = await f.authority.claim(reserved.context!);
  expect(current).toMatchObject({ ownerFence: 2, dispatchId: null });
  expect(await f.authority.canResumeSealedStage(current)).toBe(false);
  await f.adapter().ingress(f.request(), f.identity);
  expect(await f.authority.canResumeSealedStage(current)).toBe(true);
  expect((await f.adapter().upload(f.request(), f.identity)).kind).toBe("COMPLETE_ACK");
  expect(f.events.slice(0, 3)).toEqual(["STAGE", "DISPATCH", "ACK"]);
  expect(f.counts()).toEqual({ posts: 1, gets: 0 });
  await expect(f.adapter().upload(f.request(), f.identity)).rejects.toThrow(
    "PDF_DUPLICATE_DISPATCH",
  );
  expect(f.counts()).toEqual({ posts: 1, gets: 0 });
});
it("resumes only the same owner's sealed, unreleased fence and still requires physical Stage before PUT", async () => {
  const f = await fixture();
  f.setReservedOwnerRun(randomUUID());
  const reserved = await f.authority.admit(
    f.binding.actorAccountId,
    "synthetic approved command",
    1,
    {
      attemptId: f.binding.attemptId,
      resourceId: f.binding.resourceId,
      nodeId: f.binding.nodeId,
      resourceKey: f.binding.resourceKey,
      runToken: f.binding.runToken,
    },
  );
  const current = await f.authority.claim(reserved.context!);
  await f.adapter().ingress(f.request(), f.identity);
  expect(await f.authority.canResumeSealedStage(current)).toBe(true);
  await expect(f.authority.canResumeSealedStage(reserved.context!)).rejects.toThrow();
  await expect(
    f.authority.canResumeSealedStage({ ...current, ownerFence: 1 }),
  ).rejects.toThrow();
  f.setStageEvidence("0".repeat(64));
  expect(await f.authority.canResumeSealedStage(current)).toBe(false);
  f.setStageEvidence(digest(canonicalCoreJson(f.binding)));
  f.setStageSealedAt(null);
  expect(await f.authority.canResumeSealedStage(current)).toBe(false);
  f.setStageSealedAt("not-a-timestamp");
  expect(await f.authority.canResumeSealedStage(current)).toBe(false);
  f.setStageSealedAt("2026-10-18T00:00:00Z");
  f.setStageReleased();
  expect(await f.authority.canResumeSealedStage(current)).toBe(false);
  expect(f.counts()).toEqual({ posts: 0, gets: 0 });
});
it("a missing physical Stage cannot dispatch even when the durable sealed journal is resumable", async () => {
  const f = await fixture();
  f.setReservedOwnerRun(randomUUID());
  const reserved = await f.authority.admit(
    f.binding.actorAccountId,
    "synthetic approved command",
    1,
    {
      attemptId: f.binding.attemptId,
      resourceId: f.binding.resourceId,
      nodeId: f.binding.nodeId,
      resourceKey: f.binding.resourceKey,
      runToken: f.binding.runToken,
    },
  );
  const current = await f.authority.claim(reserved.context!);
  await f.adapter().ingress(f.request(), f.identity);
  expect(await f.authority.canResumeSealedStage(current)).toBe(true);
  await f.removePhysicalStage();
  await expect(f.adapter().upload(f.request(), f.identity)).rejects.toThrow();
  expect(f.counts()).toEqual({ posts: 0, gets: 0 });
  expect(f.events).toEqual(["STAGE"]);
});
it("cancellation during physical Stage reopen stops before the durable dispatch grant", async () => {
  const f = await fixture();
  await f.adapter().ingress(f.request(), f.identity);
  const controller = new AbortController();
  const reopen = f.stage.reopen.bind(f.stage);
  vi.spyOn(f.stage, "reopen").mockImplementation(async (binding) => {
    const bytes = await reopen(binding);
    controller.abort();
    return bytes;
  });
  await expect(
    f.adapter().upload(f.request(), f.identity, controller.signal),
  ).rejects.toThrow();
  expect(f.counts()).toEqual({ posts: 0, gets: 0 });
  expect(f.events).toEqual(["STAGE"]);
});
it("connects normal V4 preparation→private stage→consumed grant→POST ACK→causal fresh GET using existing owning ports", async () => {
  const f = await fixture(),
    adapter = f.adapter();
  await adapter.ingress(f.request(), f.identity);
  expect((await adapter.upload(f.request(), f.identity)).kind).toBe("COMPLETE_ACK");
  expect((await adapter.observeRetained(f.request(), f.identity)).kind).toBe("MATCH");
  expect(f.events).toEqual(["STAGE", "DISPATCH", "CONFIRM", "ACK", "READ", "GET"]);
  expect(f.counts()).toEqual({ posts: 1, gets: 1 });
  expect(f.observations).toHaveLength(2);
  const ack = sourcePdfV2UploadAckSchema.parse(f.observations[0]);
  const get = sourcePdfV2UploadGetSchema.parse(f.observations[1]);
  expect(sourcePdfCausalAckSchema.safeParse(ack).success).toBe(false);
  expect(sourcePdfCausalGetSchema.safeParse(get).success).toBe(false);
  for (const [kind, evidence] of [
    ["ack", ack],
    ["get", get],
  ] as const) {
    const { evidenceSha256, ...body } = evidence;
    expect(evidenceSha256).toBe(
      await importDigest(`otr-source-pdf-qpdf-poppler-${kind}-v4`, body, async (bytes) =>
        digest(bytes),
      ),
    );
  }
  expect(get.read.ackEvidenceSha256).toBe(ack.evidenceSha256);
  expect(f.calls).toContain("STAGE");
  expect(f.calls).toContain("CONFIRM");
  // Restart does not recreate the durable one-shot write grant.
  await expect(f.adapter().upload(f.request(), f.identity)).rejects.toThrow(
    "PDF_DUPLICATE_DISPATCH",
  );
  expect((await f.adapter().observeRetained(f.request(), f.identity)).kind).toBe(
    "PERSISTED_GET",
  );
  expect(f.counts()).toEqual({ posts: 1, gets: 1 });
});
it("requires causal stage/read ports and exact provider configuration before V4 IO", async () => {
  const f = await fixture();
  expect(() =>
    createSourcePdfV2BackendPreparation(
      f.gateway,
      { ...f.authority, recordStage: undefined } as never,
      f.stage,
      f.provider,
    ),
  ).toThrow("PDF_CAUSAL_STAGE_PORT_REQUIRED");
  expect(() =>
    createSourcePdfV2BackendPreparation(
      f.gateway,
      { ...f.authority, prepareRead: undefined } as never,
      f.stage,
      f.provider,
    ),
  ).toThrow("PDF_CAUSAL_READ_PORT_REQUIRED");
  f.drift();
  await expect(f.adapter().ingress(f.request(), f.identity)).rejects.toThrow(
    "PDF_PROVIDER_BINDING_CONFLICT",
  );
  expect(f.counts()).toEqual({ posts: 0, gets: 0 });
});
