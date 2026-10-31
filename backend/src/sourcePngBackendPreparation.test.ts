// Synthetic broker + real durable stage/Storage IO; not a Hosted/decoder/Save PASS.
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { afterEach, expect, it, vi } from "vitest";
import {
  pdfPreparationFixture,
  pdfProtocolHash,
} from "../../src/data/operations/__fixtures__/pdfOriginalPreparation";
import { createPendingPngCommandProposals } from "../../src/domain/trip/sourcePngPreparationCommands";
import { PNG_DEV_X64_EXECUTION_PROFILE_SHA256 } from "../../src/domain/trip/sourcePngPreparation";
import { createSourcePngPrivateStage } from "./sourcePngPrivateStage";
import {
  createSourcePngStorageProducer,
  SOURCE_PNG_SANDBOX_IMAGE,
} from "./sourcePngStorageProducer";
import {
  createSourcePngBackendPreparation,
  type SourcePngBackendPreparationDependencies,
} from "./sourcePngBackendPreparation";
const clean: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const fn of clean.splice(0)) await fn();
});
const hash = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
async function fixture() {
  const bytes = await readFile(
    new URL("../../output/photo/universal-photo-activity-qa.png", import.meta.url),
  );
  const f = await pdfPreparationFixture([]),
    acquisition = structuredClone(f.input.acquisition);
  Object.assign(acquisition.payload.original, {
    mime_type: "image/png",
    payload_sha256: hash(bytes),
    byte_count: bytes.length,
  });
  const proposals = await createPendingPngCommandProposals(
    { actorId: f.context.accountId, tripId: f.context.tripId },
    acquisition,
    f.input.acquisitionReceipt,
    pdfProtocolHash,
  );
  const controller = new AbortController(),
    scope = {
      actorId: f.context.accountId,
      tripId: f.context.tripId,
      signal: controller.signal,
    };
  const states = new Map<string, any>();
  let upload: any,
    stored: Buffer | undefined,
    posts = 0,
    gets = 0;
  let loseBegin: string | undefined,
    loseFinalize = false,
    wrongBinding = false,
    postUnknown = false,
    wrongGet = false,
    stale = false;
  const server = createServer(async (request, response) => {
    response.setHeader("content-type", "image/png");
    if (request.method === "POST") {
      posts++;
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      stored = Buffer.concat(chunks);
      expect(request.headers["x-upsert"]).toBe("false");
      response.setHeader("content-type", "application/json");
      if (postUnknown) {
        response.statusCode = 500;
        response.end("uncertain");
      } else
        response.end(
          JSON.stringify({
            Id: randomUUID(),
            Key: "trip-source-material/" + request.url!.slice(1),
          }),
        );
    } else {
      gets++;
      if (!stored) {
        response.statusCode = 404;
        response.end();
      } else response.end(wrongGet ? Buffer.alloc(stored.length) : stored);
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  clean.push(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const root = await mkdtemp(join(tmpdir(), "otr-png-compose-"));
  clean.push(() => rm(root, { recursive: true, force: true }));
  const address = server.address();
  if (!address || typeof address === "string") throw Error("TEST_ADDRESS");
  function reply(q: any, s: any, freshAttempt = false) {
    const operation = s.final
      ? {
          ...f.input.acquisitionReceipt,
          command: q.command,
          operation_id: q.operation_id,
          operation_key: q.operation_key,
          operation_sha256: q.operation_sha256,
          source_id: q.source_id,
          representation_id: q.payload.representation_id,
          result_remote_state:
            q.command === "VERIFY_REPRESENTATION" ? "VERIFIED" : "PENDING",
          result_representation_row_revision:
            q.command === "VERIFY_REPRESENTATION" ? 2 : 1,
          result_verified_at:
            q.command === "VERIFY_REPRESENTATION"
              ? f.input.acquisitionReceipt.completed_at
              : null,
        }
      : {
          contract_version: 1,
          operation_id: q.operation_id,
          operation_key: q.operation_key,
          operation_sha256: q.operation_sha256,
          phase: s.phase,
          attempt_generation: s.attempt?.generation ?? 0,
        };
    return structuredClone({
      operation,
      freshAttempt,
      journal: q.command === "UPLOAD_ORIGINAL" ? (s.journal ?? null) : null,
      binding: q.command === "UPLOAD_ORIGINAL" ? (s.binding ?? null) : null,
      uploadBinding:
        q.command === "VERIFY_REPRESENTATION" ? (upload?.binding ?? null) : null,
      uploadJournal:
        q.command === "VERIFY_REPRESENTATION" ? (upload?.journal ?? null) : null,
      attempt: s.attempt ?? null,
    });
  }
  const broker = vi.fn(
    async (_scope: any, q: any, action: string, expected: any, detail: any) => {
      let s = states.get(q.operation_id);
      if (!s && action === "REGISTER") {
        s = { phase: "ADMITTED", final: q.command === "PREPARE_REPRESENTATION" };
        states.set(q.operation_id, s);
      }
      if (!s)
        return {
          operation: null,
          journal: null,
          freshAttempt: false,
          binding: null,
          uploadBinding: null,
          uploadJournal: null,
          attempt: null,
        };
      let fresh = false;
      if (action === "BEGIN" && !s.attempt) {
        s.phase = "IO_ACTIVE";
        s.attempt = { id: expected.attemptId, generation: 1 };
        fresh = true;
        if (q.command === "UPLOAD_ORIGINAL") {
          const b = {
            operationId: q.operation_id,
            operationKey: q.operation_key,
            operationSha256: q.operation_sha256,
            actorAccountId: scope.actorId,
            tripId: scope.tripId,
            sourceId: q.source_id,
            representationId: q.payload.representation_id,
            materialRevision: 1,
            sourceRowRevision: 1,
            representationRowRevision: 1,
            parentOperationId: q.payload.parent_operation_id,
            attemptId: expected.attemptId,
            attemptGeneration: 1,
            executionPrincipal: "otr_trip_source_command_gateway",
            resourceId: expected.resourceId,
            nodeId: expected.nodeId,
            resourceKey: expected.resourceKey,
            runToken: expected.runToken,
            provider: "supabase_storage",
            bucket: "trip-source-material",
            objectKey: `v1/${scope.tripId}/${q.source_id}/${q.payload.representation_id}/payload`,
            sha256: hash(bytes),
            byteCount: bytes.length,
            mimeType: "image/png",
            profileId: "PNG_STATIC_RGB8_RGBA8_V1",
            profileSha256: PNG_DEV_X64_EXECUTION_PROFILE_SHA256,
          };
          if (wrongBinding) {
            b.sourceId = randomUUID();
            b.objectKey = `v1/${scope.tripId}/${b.sourceId}/${b.representationId}/payload`;
          }
          s.binding = b;
          s.journal = {
            id: b.attemptId,
            operation_id: b.operationId,
            canonical_generation: 1,
            trip_id: b.tripId,
            source_id: b.sourceId,
            representation_id: b.representationId,
            operation_key: b.operationKey,
            operation_sha256: b.operationSha256,
            material_revision: 1,
            staged_resource_id: b.resourceId,
            execution_principal: b.executionPrincipal,
            profile_id: b.profileId,
            profile_sha256: b.profileSha256,
            run_token: b.runToken,
            owner_run: expected.ownerRun,
            owner_fence: 1,
            phase: "STARTING",
            termination_outstanding: true,
            terminal_result: null,
            terminal_evidence_sha256: null,
          };
          upload = s;
        }
        if (loseBegin === q.command) {
          loseBegin = undefined;
          throw Error("COMMIT_UNKNOWN");
        }
      }
      if (action === "EXEC_ADVANCE") s.journal.phase = detail.nextPhase;
      if (action === "EXEC_TERMINAL")
        Object.assign(s.journal, {
          phase: "TERMINAL",
          terminal_result: detail.result,
          terminal_evidence_sha256: detail.evidenceSha256,
          termination_outstanding: false,
        });
      if (action === "UNKNOWN" && !s.final) s.phase = "IO_UNKNOWN";
      if (action === "FINALIZE") {
        expect(expected.attemptId).toBe(s.attempt.id);
        s.final = true;
        if (loseFinalize) {
          loseFinalize = false;
          throw Error("FINALIZE_COMMIT_UNKNOWN");
        }
      }
      return reply(q, s, fresh);
    },
  );
  const assertCurrent = vi.fn(async () => {
    if (stale) throw Error("STALE_SCOPE");
  });
  const worker = vi.fn<SourcePngBackendPreparationDependencies["worker"]>(
    async (b, input, owner) => {
      await owner.assertCurrent(b);
      await owner.attach(b, "a".repeat(64));
      await owner.running(b);
      await owner.terminal(b, {
        containerId: "a".repeat(64),
        observedAt: "2026-10-31T00:00:00.000001Z",
        evidenceSha256: "b".repeat(64),
        result: "PARSE_PASS",
      });
      return {
        imageId: SOURCE_PNG_SANDBOX_IMAGE,
        terminated: true,
        result: {
          protocol_version: 1,
          profile_version: 1,
          profile_sha256: PNG_DEV_X64_EXECUTION_PROFILE_SHA256,
          input_token: "a".repeat(32),
          input_sha256: hash(input),
          byte_count: input.length,
          actual_mime: "image/png",
          format: "PNG",
          status: "PARSE_PASS",
          facts: {
            width: 1000,
            height: 600,
            pixels: 600000,
            frames: 1,
            channels: 4,
            bit_depth: 8,
            interlace: 0,
            decoded_byte_count: 2400000,
          },
        },
      };
    },
  );
  const port = createSourcePngBackendPreparation({
    broker: broker as any,
    stage: createSourcePngPrivateStage(root),
    nodeId: randomUUID(),
    worker,
    assertCurrent,
    providerForRequest: (_scope, runSandbox) =>
      createSourcePngStorageProducer(
        {
          origin: `http://127.0.0.1:${address.port}`,
          localFixture: true,
          instanceId: "synthetic",
          credentialRef: "synthetic",
          serviceToken: "synthetic",
          timeoutMs: 2000,
        },
        runSandbox,
        { accountId: scope.actorId, tripId: scope.tripId },
        {
          signal: scope.signal,
          assertCurrent,
          assertRequestCurrent: () => scope.signal.throwIfAborted(),
        },
      ),
  });
  return {
    port,
    proposals,
    scope,
    bytes,
    broker,
    worker,
    states,
    controller,
    counts: () => ({ posts, gets }),
    loseBegin: (kind: string) => {
      loseBegin = kind;
    },
    loseFinalize: () => {
      loseFinalize = true;
    },
    wrongBinding: () => {
      wrongBinding = true;
    },
    postUnknown: () => {
      postUnknown = true;
    },
    wrongGet: () => {
      wrongGet = true;
    },
    stale: () => {
      stale = true;
    },
  };
}
it("composes fresh upload and independent verify with one worker/POST and no custody copy", async () => {
  const f = await fixture();
  expect(await f.port.lookup(f.scope, f.proposals.upload)).toBeNull();
  await f.port.execute(f.scope, f.proposals.prepare);
  expect(await f.port.execute(f.scope, f.proposals.upload, f.bytes)).toMatchObject({
    outcome: "APPLIED",
    result_remote_state: "PENDING",
  });
  expect(await f.port.execute(f.scope, f.proposals.verify)).toMatchObject({
    outcome: "APPLIED",
    result_remote_state: "VERIFIED",
  });
  expect(f.counts()).toEqual({ posts: 1, gets: 2 });
  expect(f.worker).toHaveBeenCalledTimes(1);
  await f.port.execute(f.scope, f.proposals.upload, f.bytes);
  await f.port.reconcile(f.scope, f.proposals.verify);
  expect(f.counts()).toEqual({ posts: 1, gets: 2 });
});
it("a lost BEGIN response never registers a replacement or starts IO on retry", async () => {
  const f = await fixture();
  f.loseBegin("UPLOAD_ORIGINAL");
  await expect(f.port.execute(f.scope, f.proposals.upload, f.bytes)).rejects.toThrow(
    "COMMIT_UNKNOWN",
  );
  expect(await f.port.execute(f.scope, f.proposals.upload, f.bytes)).toMatchObject({
    phase: "IO_ACTIVE",
  });
  expect(f.counts()).toEqual({ posts: 0, gets: 0 });
  expect(f.worker).not.toHaveBeenCalled();
  expect(f.broker.mock.calls.filter(([, , a]) => a === "BEGIN")).toHaveLength(1);
});
it("VERIFY resumes its retained actual attempt after BEGIN commit UNKNOWN without another decode", async () => {
  const f = await fixture();
  await f.port.execute(f.scope, f.proposals.upload, f.bytes);
  f.loseBegin("VERIFY_REPRESENTATION");
  await expect(f.port.execute(f.scope, f.proposals.verify)).rejects.toThrow(
    "COMMIT_UNKNOWN",
  );
  const before = f.states.get(f.proposals.verify.operation_id).attempt.id;
  expect(await f.port.reconcile(f.scope, f.proposals.verify)).toMatchObject({
    outcome: "APPLIED",
  });
  expect(f.states.get(f.proposals.verify.operation_id).attempt.id).toBe(before);
  expect(f.worker).toHaveBeenCalledTimes(1);
  expect(f.counts()).toEqual({ posts: 1, gets: 2 });
});
it("uncertain POST is independently read back without a second POST", async () => {
  const f = await fixture();
  f.postUnknown();
  expect(await f.port.execute(f.scope, f.proposals.upload, f.bytes)).toMatchObject({
    outcome: "APPLIED",
  });
  expect(f.counts()).toEqual({ posts: 1, gets: 1 });
  expect(f.broker.mock.calls.some(([, , a]) => a === "UNKNOWN")).toBe(true);
});
it("lost finalize response recovers the same receipt with no physical replay", async () => {
  const f = await fixture();
  f.loseFinalize();
  await expect(f.port.execute(f.scope, f.proposals.upload, f.bytes)).rejects.toThrow(
    "FINALIZE_COMMIT_UNKNOWN",
  );
  expect(await f.port.reconcile(f.scope, f.proposals.upload)).toMatchObject({
    outcome: "APPLIED",
  });
  expect(f.worker).toHaveBeenCalledTimes(1);
  expect(f.counts()).toEqual({ posts: 1, gets: 1 });
});
it("cross-Source private bindings fail before stage/worker/POST", async () => {
  const f = await fixture();
  f.wrongBinding();
  await expect(f.port.execute(f.scope, f.proposals.upload, f.bytes)).rejects.toThrow(
    "PNG_SOURCE_BINDING_MISMATCH",
  );
  expect(f.worker).not.toHaveBeenCalled();
  expect(f.counts().posts).toBe(0);
});
it("a mismatching independent GET never finalizes", async () => {
  const f = await fixture();
  f.wrongGet();
  await expect(f.port.execute(f.scope, f.proposals.upload, f.bytes)).rejects.toThrow(
    "PDF_CUSTODY_ORIGINAL_UNCONFIRMED",
  );
  expect(f.broker.mock.calls.some(([, , a]) => a === "FINALIZE")).toBe(false);
});
it("cancelled or stale request scopes never acquire a permit", async () => {
  const f = await fixture();
  f.controller.abort();
  await expect(f.port.execute(f.scope, f.proposals.upload, f.bytes)).rejects.toThrow();
  expect(f.broker).not.toHaveBeenCalled();
  const g = await fixture();
  g.stale();
  await expect(g.port.execute(g.scope, g.proposals.upload, g.bytes)).rejects.toThrow(
    "STALE_SCOPE",
  );
  expect(g.broker).not.toHaveBeenCalled();
});

it("a formally quiescent upload passes the retained attempt CAS to BEGIN without changing operation identity", async () => {
  const f = await fixture(),
    prior = { id: randomUUID(), generation: 1 };
  f.states.set(f.proposals.upload.operation_id, {
    phase: "IO_QUIESCENT",
    attempt: prior,
  });
  const original = f.broker.getMockImplementation()!;
  f.broker.mockImplementation(async (scope, q, action, expected, detail) => {
    if (action === "BEGIN") throw Error("RETRY_OWNER_ACK_UNCONFIRMED");
    return original(scope, q, action, expected, detail);
  });
  await expect(f.port.execute(f.scope, f.proposals.upload, f.bytes)).rejects.toThrow(
    "RETRY_OWNER_ACK_UNCONFIRMED",
  );
  const begin = f.broker.mock.calls.find(([, , action]) => action === "BEGIN")!;
  expect(begin[1]).toEqual(f.proposals.upload);
  expect(begin[3]).toMatchObject({
    previousAttemptId: prior.id,
    previousAttemptGeneration: 1,
  });
  expect(begin[3].attemptId).not.toBe(prior.id);
  expect(f.worker).not.toHaveBeenCalled();
  expect(f.counts()).toEqual({ posts: 0, gets: 0 });
});

it("a lost retry BEGIN reply keeps the new actual attempt and never reissues IO", async () => {
  const f = await fixture(),
    prior = { id: randomUUID(), generation: 1 };
  f.states.set(f.proposals.upload.operation_id, {
    phase: "IO_QUIESCENT",
    attempt: prior,
  });
  const original = f.broker.getMockImplementation()!;
  let accepted: string | undefined;
  f.broker.mockImplementation(async (scope, q, action, expected, detail) => {
    if (action === "BEGIN") {
      accepted = expected.attemptId;
      f.states.set(q.operation_id, {
        phase: "IO_ACTIVE",
        attempt: { id: accepted, generation: 2 },
      });
      throw Error("COMMIT_UNKNOWN");
    }
    return original(scope, q, action, expected, detail);
  });
  await expect(f.port.execute(f.scope, f.proposals.upload, f.bytes)).rejects.toThrow(
    "COMMIT_UNKNOWN",
  );
  expect(await f.port.execute(f.scope, f.proposals.upload, f.bytes)).toMatchObject({
    phase: "IO_ACTIVE",
    attempt_generation: 2,
  });
  expect(f.states.get(f.proposals.upload.operation_id).attempt.id).toBe(accepted);
  expect(f.broker.mock.calls.filter(([, , action]) => action === "BEGIN")).toHaveLength(
    1,
  );
  expect(f.worker).not.toHaveBeenCalled();
  expect(f.counts()).toEqual({ posts: 0, gets: 0 });
});
