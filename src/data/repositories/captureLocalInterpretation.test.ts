import { captureCustodyBindingSchema } from "../../domain/capture/captureCustody";
import { captureRemoteFixture } from "../../domain/capture/__fixtures__/captureRemoteProcessing";
import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { captureAccountRequestContext } from "../auth/accountRequestContext";
import { captureLocalInterpretationMigration } from "../db/migrations/captureLocalInterpretation";
import { fixture, now, sha256 } from "./__fixtures__/captureBatchAssessment";
import { createCaptureProcessingRepository } from "./captureProcessingRepository";
import { createSyncEngine } from "../sync/syncEngine";
import { createSyncOperationRepository } from "../sync/syncOperationRepository";
import type { SubmissionRequest } from "@/domain/capture/captureSubmission";

const native = vi.hoisted(() => ({
  extract: vi.fn(),
  capability: vi.fn(),
  enrich: vi.fn(),
  assembly: vi.fn(),
}));
vi.mock("@/native/captureLocalExtraction", () => ({
  extractCaptureLocal: native.extract,
  readCaptureLocalModelCapability: native.capability,
  enrichCaptureFlightLocal: native.enrich,
  proposeCaptureFlightAssemblyLocal: native.assembly,
}));
const pdf = new TextEncoder().encode(
  "%PDF-Flight: NZ123 route: AKL -> WLG date: 2026-10-16",
);
const jpeg = new Uint8Array([
  255,
  216,
  255,
  ...new TextEncoder().encode("Flight: QF1 route: SYD -> MEL"),
]);

it("upgrades a populated C3 Batch and durably records two Account-only local results once", async () => {
  const f = fixture(true, 66);
  const base = f.request(2);
  const request: SubmissionRequest = {
    ...base,
    inputs: base.inputs.map((input, index) => ({
      ...input,
      kind: index ? "IMAGE" : "FILE",
      declaredContentType: index ? "image/jpeg" : "application/pdf",
    })),
  };
  await f.submissions.submit(
    request,
    new Map([
      [request.inputs[0].id, async () => ({ bytes: pdf })],
      [request.inputs[1].id, async () => ({ bytes: jpeg })],
    ]),
  );
  const context = await captureAccountRequestContext("", f.getAccount);
  const repo = createCaptureProcessingRepository(f.db, f.getAccount, {
    sha256,
    now,
    newId: randomUUID,
  });
  await repo.schedule(context, request.jobId);
  // Complete C3 first, then install C4 over the populated local store.
  expect((await repo.run(context)).processedCount).toBe(2);
  const before = f.sql
    .prepare("SELECT * FROM capture_submission_inputs ORDER BY ordinal")
    .all();
  f.sql.exec(captureLocalInterpretationMigration.sql);
  expect(await repo.scheduleLocal(context, request.jobId)).toHaveLength(2);
  native.capability.mockResolvedValue({
    status: "UNAVAILABLE",
    reason: "MODEL_NOT_READY",
  });
  native.extract.mockImplementation(async (bytes: Uint8Array, mediaType: string) => {
    const text =
      mediaType === "application/pdf"
        ? "Flight: NZ123 route: AKL -> WLG date: 2026-10-16"
        : "Flight: QF1 route: SYD -> MEL";
    return {
      engine: mediaType === "application/pdf" ? "apple-pdfkit" : "apple-vision",
      text,
      ...(mediaType === "application/pdf"
        ? {
            pages: [
              { pageIndex: 0, start: 0, end: new TextEncoder().encode(text).length },
            ],
          }
        : {
            observations: [
              {
                text,
                confidence: 0.98,
                boundingBox: { x: 0, y: 0, width: 0.8, height: 0.2 },
              },
            ],
          }),
      originalSha256: await sha256(bytes),
      originalByteCount: bytes.length,
    };
  });
  const genericPush = vi.fn();
  await createSyncEngine(
    {
      listPending: () => repo.listPending(context),
      recoverInterrupted: () => repo.recoverInterrupted(context),
      claimOperation: (operation) => repo.claim(context, operation),
      settleOperation: (operation, error, next) =>
        repo.settle(context, operation, error, next),
      markProcessing: vi.fn(),
      markCompleted: vi.fn(),
      markRetryable: vi.fn(),
    },
    { push: genericPush },
    undefined,
    () => true,
  ).run("AUTHENTICATED_ONLINE");
  expect(genericPush).not.toHaveBeenCalled();
  expect((await repo.run(context)).processedCount).toBe(2);
  expect(
    f.sql.prepare("SELECT * FROM capture_submission_inputs ORDER BY ordinal").all(),
  ).toEqual(before);
  const results = await repo.localResults(context, request.jobId);
  expect(results).toHaveLength(2);
  expect(results.map((result) => result.engine)).toEqual([
    "apple-pdfkit",
    "apple-vision",
  ]);
  expect(
    results.every(
      (result) =>
        result.sourceAuthority === "NONE" &&
        !result.reviewAvailable &&
        result.modelExecution === "NOT_RUN",
    ),
  ).toBe(true);
  expect(
    results[0].fields.some(
      (field) => field.path === "service" && field.evidence[0].pages[0] === 0,
    ),
  ).toBe(true);
  expect(
    results[1].fields.some(
      (field) => field.path === "service" && field.evidence[0].boxes.length === 1,
    ),
  ).toBe(true);
  expect(
    (await repo.localEvents(context, request.jobId)).filter(
      (event) => event.state === "LOCAL_RESULT_RECORDED",
    ),
  ).toHaveLength(2);
  expect((await repo.run(context)).processedCount).toBe(0);
  expect(await repo.scheduleLocal(context, request.jobId)).toHaveLength(2);
  expect((await repo.run(context)).processedCount).toBe(0);
  expect(native.extract).toHaveBeenCalledTimes(2);
  f.reopen();
  expect(await repo.localResults(context, request.jobId)).toEqual(results);
  const job = await f.submissions.reopen(request.jobId, context),
    i = job.inputs[0];
  const binding = captureCustodyBindingSchema.parse({
    version: 1 as const,
    accountId: context.accountId,
    batchId: job.batch.batchId,
    jobId: request.jobId,
    inputId: i.id,
    inputRevision: i.revision,
    captureId: i.captureId,
    captureRevision: i.captureRevision,
    payloadId: i.payloadId,
    sha256: i.contentSha256!,
    byteCount: i.contentByteCount!,
    mediaType: "application/pdf" as const,
  });
  const remoteFixture = captureRemoteFixture(binding, {
    text: results[0].text,
    textSha256: results[0].textSha256,
  });
  const remote = {
    run: vi.fn(async () => {
      throw new Error("remote unavailable");
    }),
    read: vi.fn(async () => remoteFixture.output),
  };
  const remoteRepo = createCaptureProcessingRepository(
    f.db,
    f.getAccount,
    { sha256, now, newId: randomUUID },
    remote,
  );
  await expect(remoteRepo.requestRemote(context, remoteFixture.input)).rejects.toThrow(
    "remote unavailable",
  );
  expect(await remoteRepo.localResults(context, request.jobId)).toEqual(results);
  expect(
    await remoteRepo.readRemote(context, binding, remoteFixture.input.task.task_id),
  ).toEqual(remoteFixture.output);
  await expect(
    remoteRepo.readRemote(
      context,
      { ...binding, sha256: "b".repeat(64) },
      remoteFixture.input.task.task_id,
    ),
  ).rejects.toThrow("CAPTURE_REMOTE_SCOPE");
  expect(remote.read).toHaveBeenCalledTimes(1);
  const defaultClosed = createCaptureProcessingRepository(f.db, f.getAccount, {
    sha256,
    now,
    newId: randomUUID,
  });
  await expect(
    defaultClosed.readRemote(context, binding, remoteFixture.input.task.task_id),
  ).rejects.toThrow("CAPTURE_REMOTE_CLOSED");
  expect(() =>
    f.sql.prepare("DELETE FROM capture_local_interpretation_results").run(),
  ).toThrow("CAPTURE_LOCAL_RESULT_RETAINED");
});

it("accepts file-picker JPEG bytes and explicitly retries only a failed local result", async () => {
  const f = fixture(true, 67);
  const base = f.request();
  const request: SubmissionRequest = {
    ...base,
    inputs: [{ ...base.inputs[0], kind: "FILE", declaredContentType: "image/jpeg" }],
  };
  await f.submissions.submit(
    request,
    new Map([[request.inputs[0].id, async () => ({ bytes: jpeg })]]),
  );
  const context = await captureAccountRequestContext("", f.getAccount);
  const repo = createCaptureProcessingRepository(f.db, f.getAccount, {
    sha256,
    now,
    newId: randomUUID,
  });
  await repo.schedule(context, request.jobId);
  await repo.run(context);
  await repo.scheduleLocal(context, request.jobId);
  await expect(
    repo.retryLocal(context, request.jobId, request.inputs[0].id),
  ).rejects.toThrow("CAPTURE_LOCAL_RETRY_NOT_FAILED");
  native.capability.mockResolvedValue({ status: "UNAVAILABLE" });
  native.extract.mockResolvedValue({
    engine: "apple-vision",
    text: "Flight: QF1",
    observations: [
      {
        text: "different",
        confidence: 1,
        boundingBox: { x: 0, y: 0, width: 1, height: 1 },
      },
    ],
    originalSha256: await sha256(jpeg),
    originalByteCount: jpeg.length,
  });
  await repo.run(context);
  expect(await repo.localResults(context, request.jobId)).toEqual([]);
  expect((await repo.localEvents(context, request.jobId)).at(-1)?.state).toBe("FAILED");
  expect(native.extract).toHaveBeenLastCalledWith(jpeg, "image/jpeg");
  await expect(repo.retryLocal(context, request.jobId, randomUUID())).rejects.toThrow(
    "CAPTURE_LOCAL_RETRY_SCOPE",
  );
  expect(await repo.retryLocal(context, request.jobId, request.inputs[0].id)).toBe(
    `capture-local:${request.inputs[0].id}`,
  );
  native.extract.mockResolvedValue({
    engine: "apple-vision",
    text: "Flight: QF1",
    observations: [
      {
        text: "Flight: QF1",
        confidence: 1,
        boundingBox: { x: 0, y: 0, width: 1, height: 1 },
      },
    ],
    originalSha256: await sha256(jpeg),
    originalByteCount: jpeg.length,
  });
  expect((await repo.run(context)).processedCount).toBe(1);
  expect(
    (await repo.localResults(context, request.jobId)).map((result) => result.engine),
  ).toEqual(["apple-vision"]);
  expect(
    (await repo.localEvents(context, request.jobId)).map((event) => event.state),
  ).toEqual([
    "PENDING",
    "PROCESSING",
    "FAILED",
    "RETRYABLE",
    "PROCESSING",
    "LOCAL_RESULT_RECORDED",
  ]);
  await expect(
    repo.retryLocal(context, request.jobId, request.inputs[0].id),
  ).rejects.toThrow("CAPTURE_LOCAL_RETRY_NOT_FAILED");
});

it("retains deterministic partial evidence when optional local-model hints fail validation", async () => {
  const f = fixture(true, 67);
  const base = f.request();
  const request: SubmissionRequest = {
    ...base,
    inputs: [{ ...base.inputs[0], kind: "FILE", declaredContentType: "application/pdf" }],
  };
  const bytes = new TextEncoder().encode("%PDF-Flight: NZ123");
  await f.submissions.submit(
    request,
    new Map([[request.inputs[0].id, async () => ({ bytes })]]),
  );
  const context = await captureAccountRequestContext("", f.getAccount);
  const repo = createCaptureProcessingRepository(f.db, f.getAccount, {
    sha256,
    now,
    newId: randomUUID,
  });
  await repo.schedule(context, request.jobId);
  await repo.run(context);
  await repo.scheduleLocal(context, request.jobId);
  native.capability.mockResolvedValue({
    status: "AVAILABLE",
    reason: "SYSTEM_MODEL_AVAILABLE",
  });
  const text = "Flight: NZ123";
  native.extract.mockResolvedValue({
    engine: "apple-pdfkit",
    text,
    pages: [{ pageIndex: 0, start: 0, end: new TextEncoder().encode(text).length }],
    originalSha256: await sha256(bytes),
    originalByteCount: bytes.length,
  });
  native.enrich.mockResolvedValue({
    status: "SUCCEEDED",
    reason: "MODEL_RETURNED",
    observations: [{ literal: "NZ123", start: 0, end: 5 }],
  });
  expect((await repo.run(context)).processedCount).toBe(1);
  const [result] = await repo.localResults(context, request.jobId);
  expect(native.enrich).not.toHaveBeenCalled();
  expect(result.fields.some((field) => field.path === "service")).toBe(true);
  expect(result.modelExecution).toBe("NOT_RUN");
  expect(result.supplementalServiceObservations).toEqual([]);
  expect((await repo.localEvents(context, request.jobId)).at(-1)?.state).toBe(
    "LOCAL_RESULT_RECORDED",
  );
});

it("generic interrupted recovery cannot seize a live C4 local claim", async () => {
  const f = fixture(true, 67);
  const base = f.request();
  const request: SubmissionRequest = {
    ...base,
    inputs: [{ ...base.inputs[0], kind: "FILE", declaredContentType: "application/pdf" }],
  };
  const bytes = new TextEncoder().encode("%PDF-Flight: NZ123");
  await f.submissions.submit(
    request,
    new Map([[request.inputs[0].id, async () => ({ bytes })]]),
  );
  const context = await captureAccountRequestContext("", f.getAccount);
  const repo = createCaptureProcessingRepository(f.db, f.getAccount, {
    sha256,
    now,
    newId: randomUUID,
  });
  await repo.schedule(context, request.jobId);
  await repo.run(context);
  await repo.scheduleLocal(context, request.jobId);
  const [pending] = await repo.listPending(context);
  expect(await repo.claim(context, pending)).toBe(true);
  await createSyncOperationRepository(f.db, f.getAccount, now).recoverInterrupted();
  expect(
    f.sql.prepare("SELECT status FROM sync_operations WHERE id=?").get(pending.id),
  ).toMatchObject({ status: "PROCESSING" });
});

it("runs accepted TEXT through the same local queue and retains typed items and deferred evidence on reopen", async () => {
  const f = fixture(true, 67);
  const base = f.request();
  const request: SubmissionRequest = {
    ...base,
    inputs: [{ ...base.inputs[0], kind: "TEXT", declaredContentType: "text/plain" }],
  };
  const text = "Flight: NZ 5069 route: AKL -> WLG passenger: Example\nFlight: QF1";
  const bytes = new TextEncoder().encode(text);
  await f.submissions.submit(
    request,
    new Map([[request.inputs[0].id, async () => ({ bytes })]]),
  );
  const context = await captureAccountRequestContext("", f.getAccount);
  const repo = createCaptureProcessingRepository(f.db, f.getAccount, {
    sha256,
    now,
    newId: randomUUID,
  });
  await repo.schedule(context, request.jobId);
  await repo.run(context);
  await repo.scheduleLocal(context, request.jobId);
  native.extract.mockResolvedValue({
    engine: "utf8-text",
    text,
    originalSha256: await sha256(bytes),
    originalByteCount: bytes.length,
  });
  native.capability.mockResolvedValue({ status: "AVAILABLE" });
  native.assembly.mockResolvedValue({
    status: "FAILED",
    reason: "LOCAL_MODEL_TIMEOUT",
    observations: [],
  });
  expect((await repo.run(context)).processedCount).toBe(1);
  expect(native.extract).toHaveBeenLastCalledWith(bytes, "text/plain");
  const [result] = await repo.localResults(context, request.jobId);
  expect(result.modelExecution).toBe("NOT_RUN");
  expect(result.assemblyDiagnostics?.execution).toMatchObject({
    status: "FAILED",
    reason: "LOCAL_MODEL_TIMEOUT",
  });
  expect(result.flightInterpretation.status).toBe("PARTIAL");
  expect(result.flightInterpretation.items).toHaveLength(2);
  expect(result.flightInterpretation.items[0].deferred[0]).toMatchObject({
    dimension: "passengers",
    reason: "UNSUPPORTED_DIMENSION",
  });
  const references = result.flightInterpretation.items.flatMap((item) => [
    ...item.fields.flatMap((field) => field.fragment_ids),
    ...item.deferred.map((field) => field.fragment_id),
  ]);
  expect(
    references.every((id) =>
      result.flightInterpretation.fragments.some(
        (fragment) => fragment.id === id && fragment.locator.input_id === result.inputId,
      ),
    ),
  ).toBe(true);
  expect(result.sourceAuthority).toBe("NONE");
  expect(result.reviewAvailable).toBe(false);
  const stored = f.sql
    .prepare("SELECT result_json FROM capture_local_interpretation_results")
    .get() as { result_json: string };
  expect(JSON.parse(stored.result_json)).not.toHaveProperty("flightInterpretation");
  f.reopen();
  expect(await repo.localResults(context, request.jobId)).toEqual([result]);
  expect((await repo.run(context)).processedCount).toBe(0);
  expect(result.flightInterpretation).toMatchObject({
    accountId: context.accountId,
    generation: context.generation,
    textSha256: await sha256(bytes),
    projectionKind: "CURRENT_PARSER_READ",
  });
  const badHashRepo = createCaptureProcessingRepository(f.db, f.getAccount, {
    sha256: async () => "0".repeat(64),
    now,
    newId: randomUUID,
  });
  await expect(badHashRepo.localResults(context, request.jobId)).rejects.toThrow();
  await f.switchTo(randomUUID());
  await expect(repo.localResults(context, request.jobId)).rejects.toThrow();
  await f.switchTo(context.accountId);
  await expect(repo.localResults(context, request.jobId)).rejects.toThrow();
  const fresh = await captureAccountRequestContext("", f.getAccount);
  const [rebound] = await repo.localResults(fresh, request.jobId);
  expect(rebound.flightInterpretation.generation).toBe(fresh.generation);
  expect(rebound.flightInterpretation.items).toEqual(result.flightInterpretation.items);
});
