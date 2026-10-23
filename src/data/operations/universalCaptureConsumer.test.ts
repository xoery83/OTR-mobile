import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import type { CaptureJobReadModel } from "@/domain/capture/captureSubmission";
import type {
  UniversalImportResult,
  UniversalExecutionContext,
} from "../api/universalImportContracts";
import { ApiClientError } from "../api/client";
import { createUniversalCaptureConsumer } from "./universalCaptureConsumer";

vi.mock("expo/fetch", () => ({ fetch: vi.fn() }));
vi.mock("../auth/sessionAccessToken", () => ({ sessionAccessToken: vi.fn() }));
function fixture() {
  const accountId = randomUUID(),
    tripId = randomUUID(),
    batchId = randomUUID(),
    inputId = randomUUID();
  // Explicit local unit fixtures; they are not Source proof or runtime receipts.
  const model = {
    batch: { accountId, batchId, context: { tripPrior: { id: tripId } } },
    allInputsAccepted: true,
    inputs: [{ id: inputId, state: "ACCEPTED", contentSha256: "a".repeat(64) }],
  } as unknown as CaptureJobReadModel;
  const result = {
    accountId,
    tripId,
    batchId,
    sourceBindings: [{ inputId, originalSha256: "a".repeat(64) }],
  } as UniversalImportResult;
  const binding: UniversalExecutionContext = {
    version: "otr.backend.universal-context/1" as const,
    accountId,
    actorId: accountId,
    tripId,
    batchId,
    taskId: randomUUID(),
  };
  const transport = {
    context: vi.fn(async () => binding),
    result: vi.fn(async () => result),
    execute: vi.fn(async () => result),
  };
  let active = true;
  const consumer = createUniversalCaptureConsumer({
    getAccountId: async () => accountId,
    isCurrent: () => active,
    transport,
  });
  return {
    accountId,
    model,
    result,
    transport,
    consumer,
    close: () => {
      active = false;
    },
  };
}
const absent = () => new ApiClientError("not found", "http", 404, "TASK_NOT_FOUND");
it("reads existing results before any dispatch, preserving all Batch originals", async () => {
  const f = fixture();
  expect(await f.consumer.start(f.model)).toBe(f.result);
  expect(f.transport.execute).not.toHaveBeenCalled();
});
it("only an exact missing result permits initial explicit dispatch", async () => {
  const f = fixture();
  f.transport.result.mockRejectedValueOnce(absent());
  expect(await f.consumer.start(f.model)).toBe(f.result);
  expect(f.transport.execute).toHaveBeenCalledTimes(1);
});
it("cold/reopen recovery is read-only even when the result does not exist", async () => {
  const f = fixture();
  f.transport.result.mockRejectedValueOnce(absent());
  expect(await f.consumer.recover(f.model)).toBeNull();
  expect(f.transport.execute).not.toHaveBeenCalled();
});
it("an uncertain dispatch cannot be re-enabled by another missing-result response", async () => {
  const f = fixture();
  f.transport.result.mockRejectedValue(absent());
  f.transport.execute.mockRejectedValueOnce(new TypeError("network interrupted"));
  await expect(f.consumer.start(f.model)).rejects.toThrow();
  expect(await f.consumer.start(f.model)).toBeNull();
  expect(f.transport.execute).toHaveBeenCalledTimes(1);
});
it("closed or forbidden lookup never falls through to paid dispatch", async () => {
  const f = fixture();
  f.transport.result.mockRejectedValueOnce(
    new ApiClientError("closed", "http", 503, "UNIVERSAL_IMPORT_CLOSED"),
  );
  await expect(f.consumer.start(f.model)).rejects.toThrow();
  expect(f.transport.execute).not.toHaveBeenCalled();
});
it("withholds results that omit typed text or refer to changed original bytes", async () => {
  const f = fixture();
  f.result.sourceBindings[0].originalSha256 = "b".repeat(64);
  await expect(f.consumer.recover(f.model)).rejects.toThrow("ORIGINALS_MISMATCH");
  f.result.sourceBindings[0].originalSha256 = "a".repeat(64);
  f.model.inputs = [...f.model.inputs, { ...f.model.inputs[0], id: randomUUID() }];
  await expect(f.consumer.recover(f.model)).rejects.toThrow("ORIGINALS_MISMATCH");
});
it("a closed screen cannot expose an asynchronous context result", async () => {
  const f = fixture();
  f.transport.context.mockImplementationOnce(async () => {
    f.close();
    return {
      version: "otr.backend.universal-context/1",
      actorId: f.accountId,
      accountId: f.accountId,
      tripId: f.model.batch.context.tripPrior!.id,
      batchId: f.model.batch.batchId,
      taskId: randomUUID(),
    };
  });
  await expect(f.consumer.start(f.model)).rejects.toThrow("STALE");
  expect(f.transport.result).not.toHaveBeenCalled();
  expect(f.transport.execute).not.toHaveBeenCalled();
});
