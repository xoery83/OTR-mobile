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
function fixture(
  prepareSources?: Parameters<typeof createUniversalCaptureConsumer>[0]["prepareSources"],
  continuous = false,
) {
  const accountId = randomUUID(),
    tripId = randomUUID(),
    batchId = randomUUID(),
    inputId = randomUUID();
  // Explicit local unit fixtures; they are not Source proof or runtime receipts.
  const model = {
    batch: {
      accountId,
      batchId,
      jobId: randomUUID(),
      context: { tripPrior: { id: tripId } },
    },
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
    prepareSources,
    continuous,
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

const missingContext = () =>
  new ApiClientError("closed", "http", 503, "UNIVERSAL_CONTEXT_UNAVAILABLE");
it("first explicit Start prepares real Sources only on exact missing context and then obtains Task from Backend", async () => {
  const prepare = vi.fn(async () => {}),
    f = fixture(prepare);
  f.transport.context.mockRejectedValueOnce(missingContext());
  expect(await f.consumer.start(f.model)).toBe(f.result);
  expect(prepare).toHaveBeenCalledOnce();
  expect(prepare.mock.calls[0]).toEqual([
    expect.objectContaining({
      accountId: f.accountId,
      tripId: f.model.batch.context.tripPrior!.id,
    }),
    f.model,
  ]);
  expect(f.transport.context).toHaveBeenCalledTimes(2);
  expect(f.transport.execute).not.toHaveBeenCalled();
});
it("missing context recovery remains read-only", async () => {
  const prepare = vi.fn(async () => {}),
    f = fixture(prepare);
  f.transport.context.mockRejectedValueOnce(missingContext());
  await expect(f.consumer.recover(f.model)).rejects.toThrow();
  expect(prepare).not.toHaveBeenCalled();
  expect(f.transport.execute).not.toHaveBeenCalled();
});
it.each([
  new ApiClientError("denied", "http", 403, "FORBIDDEN"),
  new ApiClientError("auth", "http", 401, "AUTH_REQUIRED"),
  new ApiClientError("provider", "http", 503, "PROVIDER_UNAVAILABLE"),
  new ApiClientError("arbitrary", "http", 503, "SOURCE_IO_UNAVAILABLE"),
  new ApiClientError("network", "network"),
])(
  "context failure without a precise prerequisite signal never prepares Sources",
  async (error) => {
    const prepare = vi.fn(async () => {}),
      f = fixture(prepare);
    f.transport.context.mockRejectedValueOnce(error);
    await expect(f.consumer.start(f.model)).rejects.toThrow();
    expect(prepare).not.toHaveBeenCalled();
    expect(f.transport.execute).not.toHaveBeenCalled();
  },
);
it("Source authority failure blocks Task/Provider and does not invent context", async () => {
  const prepare = vi.fn(async () => {
      throw Error("SOURCE_CAPABILITY_CLOSED");
    }),
    f = fixture(prepare);
  f.transport.context.mockRejectedValueOnce(missingContext());
  await expect(f.consumer.start(f.model)).rejects.toThrow("SOURCE_CAPABILITY_CLOSED");
  expect(f.transport.context).toHaveBeenCalledOnce();
  expect(f.transport.execute).not.toHaveBeenCalled();
});
it("registered Sources without an owning Run/Task remain unavailable, never fake a Task", async () => {
  const prepare = vi.fn(async () => {}),
    f = fixture(prepare);
  f.transport.context.mockRejectedValue(missingContext());
  await expect(f.consumer.start(f.model)).rejects.toMatchObject({
    code: "OWNING_TASK_READER_UNAVAILABLE",
  });
  expect(prepare).toHaveBeenCalledOnce();
  expect(f.transport.result).not.toHaveBeenCalled();
  expect(f.transport.execute).not.toHaveBeenCalled();
});
it("a paid UNKNOWN or closed view cannot fall back into Source writes", async () => {
  const prepare = vi.fn(async () => {}),
    f = fixture(prepare);
  f.transport.result.mockRejectedValueOnce(absent());
  f.transport.execute.mockRejectedValueOnce(Error("UNKNOWN"));
  await expect(f.consumer.start(f.model)).rejects.toThrow();
  f.transport.context.mockRejectedValueOnce(missingContext());
  await expect(f.consumer.start(f.model)).rejects.toThrow();
  expect(prepare).not.toHaveBeenCalled();
  const g = fixture(async () => {
    g.close();
  });
  g.transport.context.mockRejectedValueOnce(missingContext());
  await expect(g.consumer.start(g.model)).rejects.toThrow("STALE");
  expect(g.transport.context).toHaveBeenCalledOnce();
  expect(g.transport.execute).not.toHaveBeenCalled();
});

it("explicit normal Batch preparation queues once and GET-only recovery never executes Provider", async () => {
  const prepare = vi.fn(async () => {}),
    f = fixture(prepare, true);
  f.transport.context.mockRejectedValueOnce(absent());
  f.transport.result.mockRejectedValueOnce(absent());
  expect(await f.consumer.start(f.model)).toBeNull();
  expect(f.consumer.queued).toBe(true);
  expect(prepare).toHaveBeenCalledOnce();
  expect(f.transport.execute).not.toHaveBeenCalled();
  expect(await f.consumer.recover(f.model)).toBe(f.result);
  expect(f.consumer.queued).toBe(false);
  expect(prepare).toHaveBeenCalledOnce();
});
it("only a new explicit Start can wake a retained Task after a Backend restart", async () => {
  const prepare = vi.fn(async () => {}),
    f = fixture(prepare, true);
  f.transport.result.mockRejectedValue(absent());
  expect(await f.consumer.recover(f.model)).toBeNull();
  expect(prepare).not.toHaveBeenCalled();
  expect(await f.consumer.start(f.model)).toBeNull();
  expect(prepare).toHaveBeenCalledOnce();
  expect(f.transport.execute).not.toHaveBeenCalled();
});

it("only explicit continuous Start wakes the same UNKNOWN Task for owning recovery without paid execute", async () => {
  const prepare = vi.fn(async () => {}),
    f = fixture(prepare, true);
  Object.assign(f.result, {
    status: "EXECUTION_OUTCOME_UNKNOWN",
    providerOutcome: "UNKNOWN",
  });
  expect(await f.consumer.recover(f.model)).toBe(f.result);
  expect(prepare).not.toHaveBeenCalled();
  expect(await f.consumer.start(f.model)).toBeNull();
  expect(prepare).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      accountId: f.accountId,
      tripId: f.model.batch.context.tripPrior!.id,
    }),
    f.model,
  );
  expect(f.consumer.queued).toBe(true);
  expect(f.transport.execute).not.toHaveBeenCalled();
  Object.assign(f.result, { status: "CANDIDATES_READY", providerOutcome: "SETTLED" });
  expect(await f.consumer.recover(f.model)).toBe(f.result);
  expect(f.consumer.queued).toBe(false);
  expect(prepare).toHaveBeenCalledOnce();
});
it("refuses a changed Task after UNKNOWN recovery prepare and never uses paid execute", async () => {
  const prepare = vi.fn(async () => {}),
    f = fixture(prepare, true),
    binding = await f.transport.context();
  Object.assign(f.result, {
    status: "EXECUTION_OUTCOME_UNKNOWN",
    providerOutcome: "UNKNOWN",
  });
  f.transport.context
    .mockResolvedValueOnce(binding)
    .mockResolvedValueOnce({ ...binding, taskId: randomUUID() });
  await expect(f.consumer.start(f.model)).rejects.toThrow("UNIVERSAL_CAPTURE_STALE");
  expect(prepare).toHaveBeenCalledOnce();
  expect(f.transport.execute).not.toHaveBeenCalled();
});
it("keeps finite UNKNOWN and continuous GET recovery read-only", async () => {
  const prepare = vi.fn(async () => {}),
    f = fixture(prepare, false);
  Object.assign(f.result, {
    status: "EXECUTION_OUTCOME_UNKNOWN",
    providerOutcome: "UNKNOWN",
  });
  expect(await f.consumer.start(f.model)).toBe(f.result);
  expect(prepare).not.toHaveBeenCalled();
  expect(f.transport.execute).not.toHaveBeenCalled();
});
