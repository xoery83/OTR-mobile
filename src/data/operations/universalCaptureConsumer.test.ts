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
  resumeTask?: (context: unknown, binding: UniversalExecutionContext) => Promise<void>,
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
    resumeTask,
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

it("retains actual Task observation even when no Result exists; recovery never prepares or sends", async () => {
  const prepare = vi.fn(async () => {}),
    f = fixture(prepare, true);
  const binding = await f.transport.context();
  const activity = {
    state: "WAITING" as const,
    recordedAt: "2026-10-28T00:00:00Z",
    updatedAt: "2026-10-28T00:00:01Z",
    completedAt: null,
    rowRevision: 2,
    attemptCount: 0,
    waitReason: "WAITING_FOR_NETWORK" as const,
  };
  f.transport.context.mockResolvedValue({ ...binding, activity });
  f.transport.result.mockRejectedValue(absent());
  expect(await f.consumer.recover(f.model)).toBeNull();
  expect(f.consumer.activity).toEqual(activity);
  expect(prepare).not.toHaveBeenCalled();
  expect(f.transport.execute).not.toHaveBeenCalled();
  f.close();
  expect(f.consumer.activity).toBeNull();
});

it.each(["PENDING", "WAITING", "PROCESSING"] as const)(
  "keeps the running %s Task receipt marker pending without prepare or paid retry",
  async (state) => {
    const prepare = vi.fn(async () => {}),
      f = fixture(prepare, true),
      binding = await f.transport.context();
    Object.assign(f.result, {
      status: "EXECUTION_OUTCOME_UNKNOWN",
      providerOutcome: "UNKNOWN",
    });
    const activity = {
      state,
      recordedAt: "2026-10-28T00:00:00Z",
      updatedAt: "2026-10-28T00:00:01Z",
      completedAt: null,
      rowRevision: 2,
      attemptCount: 1,
      waitReason: null,
    };
    f.transport.context.mockResolvedValue({ ...binding, activity });
    expect(await f.consumer.recover(f.model)).toBeNull();
    expect(f.consumer.queued).toBe(true);
    expect(f.consumer.activity).toEqual(activity);
    expect(await f.consumer.start(f.model)).toBeNull();
    expect(prepare).not.toHaveBeenCalled();
    expect(f.transport.execute).not.toHaveBeenCalled();
    f.transport.context.mockResolvedValue({
      ...binding,
      activity: { ...activity, state: "UNKNOWN", rowRevision: 3 },
    });
    expect(await f.consumer.recover(f.model)).toBe(f.result);
    expect(f.consumer.queued).toBe(false);
    Object.assign(f.result, { status: "CANDIDATES_READY", providerOutcome: "SETTLED" });
    expect(await f.consumer.recover(f.model)).toBe(f.result);
    expect(prepare).not.toHaveBeenCalled();
    expect(f.transport.execute).not.toHaveBeenCalled();
  },
);

it("recovers the legitimate text result while a non-text file remains explicitly unprocessed", async () => {
  const f = fixture();
  f.model.inputs = [
    ...f.model.inputs,
    {
      id: randomUUID(),
      kind: "FILE",
      declaredContentType: "application/pdf",
      state: "ACCEPTED",
      contentSha256: "b".repeat(64),
    } as CaptureJobReadModel["inputs"][number],
  ];
  expect(await f.consumer.recover(f.model)).toBe(f.result);
  expect(f.transport.execute).not.toHaveBeenCalled();
});

it.each(["RESULTS_READY", "FAILED", "CANCELED", "STALE"] as const)(
  "keeps %s read-only even when its Result is missing",
  async (state) => {
    const prepare = vi.fn(async () => {}),
      f = fixture(prepare, true);
    const binding = await f.transport.context();
    f.transport.context.mockResolvedValue({
      ...binding,
      activity: {
        state,
        recordedAt: "2026-10-29T00:00:00Z",
        updatedAt: "2026-10-29T00:01:00Z",
        completedAt: null,
        rowRevision: 3,
        attemptCount: state === "RESULTS_READY" ? 1 : 0,
        waitReason: null,
      },
    });
    f.transport.result.mockRejectedValue(absent());
    expect(await f.consumer.start(f.model)).toBeNull();
    expect(f.consumer.queued).toBe(false);
    expect(f.consumer.canDispatch).toBe(false);
    expect(await f.consumer.recover(f.model)).toBeNull();
    expect(prepare).not.toHaveBeenCalled();
    expect(f.transport.execute).not.toHaveBeenCalled();
  },
);
it("matches a PDF original separately from its sealed text material and keeps recovery read-only", async () => {
  const f = fixture(undefined, true);
  Object.assign(f.model.inputs[0], {
    kind: "FILE",
    declaredContentType: "application/pdf",
    contentSha256: "c".repeat(64),
    contentByteCount: 1700,
  });
  Object.assign(f.result.sourceBindings[0], {
    representationId: randomUUID(),
    mime: "text/plain",
    pdfSource: {
      original: {
        representationId: randomUUID(),
        sha256: "c".repeat(64),
        byteCount: 1700,
      },
      sealSha256: "d".repeat(64),
      pageMapSha256: "e".repeat(64),
      transformOptionsSha256: "f".repeat(64),
    },
  });
  expect(await f.consumer.recover(f.model)).toBe(f.result);
  expect(f.transport.execute).not.toHaveBeenCalled();
});

it.each(["hash", "size", "kind", "media", "parent"])(
  "withholds PDF results on original %s mismatch without dispatch",
  async (failure) => {
    const f = fixture(undefined, true);
    Object.assign(f.model.inputs[0], {
      kind: "FILE",
      declaredContentType: "application/pdf",
      contentSha256: "c".repeat(64),
      contentByteCount: 1700,
    });
    const representationId = randomUUID();
    Object.assign(f.result.sourceBindings[0], {
      representationId,
      mime: "text/plain",
      pdfSource: {
        original: {
          representationId: failure === "parent" ? representationId : randomUUID(),
          sha256: failure === "hash" ? "d".repeat(64) : "c".repeat(64),
          byteCount: failure === "size" ? 1701 : 1700,
        },
        sealSha256: "d".repeat(64),
        pageMapSha256: "e".repeat(64),
        transformOptionsSha256: "f".repeat(64),
      },
    });
    if (failure === "kind") f.model.inputs[0].kind = "TEXT";
    if (failure === "media") f.model.inputs[0].declaredContentType = "image/png";
    await expect(f.consumer.recover(f.model)).rejects.toThrow("ORIGINALS_MISMATCH");
    expect(f.transport.execute).not.toHaveBeenCalled();
  },
);

it("explicit existing Task resume never repeats Source preparation or paid execute", async () => {
  const prepare = vi.fn(async () => {}),
    resume = vi.fn(async () => {});
  const f = fixture(prepare, true, resume);
  f.transport.result.mockRejectedValue(absent());
  expect(await f.consumer.recover(f.model)).toBeNull();
  expect(resume).not.toHaveBeenCalled();
  expect(await f.consumer.start(f.model)).toBeNull();
  expect(resume).toHaveBeenCalledOnce();
  expect(prepare).not.toHaveBeenCalled();
  expect(f.transport.execute).not.toHaveBeenCalled();
});

it("explicitly resumes the same retained running Task while passive marker recovery stays read-only", async () => {
  const resume = vi.fn(async () => {}),
    prepare = vi.fn(async () => {}),
    f = fixture(prepare, true, resume),
    binding = await f.transport.context();
  Object.assign(f.result, {
    status: "EXECUTION_OUTCOME_UNKNOWN",
    providerOutcome: "UNKNOWN",
  });
  f.transport.context.mockResolvedValue({
    ...binding,
    activity: {
      state: "PROCESSING",
      recordedAt: "2026-10-30T07:48:54Z",
      updatedAt: "2026-10-30T07:50:39Z",
      completedAt: null,
      rowRevision: 3,
      attemptCount: 1,
      waitReason: null,
    },
  });
  expect(await f.consumer.recover(f.model)).toBeNull();
  expect(resume).not.toHaveBeenCalled();
  expect(await f.consumer.start(f.model)).toBeNull();
  expect(resume).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ accountId: binding.accountId, tripId: binding.tripId }),
    expect.objectContaining({ taskId: binding.taskId, batchId: binding.batchId }),
  );
  expect(f.consumer.queued).toBe(true);
  expect(prepare).not.toHaveBeenCalled();
  expect(f.transport.execute).not.toHaveBeenCalled();
});

it("keeps a newly prepared processing marker pending without an extra resume", async () => {
  const resume = vi.fn(async () => {}),
    prepare = vi.fn(async () => {}),
    f = fixture(prepare, true, resume),
    binding = await f.transport.context();
  Object.assign(f.result, {
    status: "EXECUTION_OUTCOME_UNKNOWN",
    providerOutcome: "UNKNOWN",
  });
  f.transport.context
    .mockResolvedValue({
      ...binding,
      activity: {
        state: "PROCESSING",
        recordedAt: "2026-10-30T07:48:54Z",
        updatedAt: "2026-10-30T07:50:39Z",
        completedAt: null,
        rowRevision: 3,
        attemptCount: 1,
        waitReason: null,
      },
    })
    .mockRejectedValueOnce(absent());
  expect(await f.consumer.start(f.model)).toBeNull();
  expect(f.consumer.queued).toBe(true);
  expect(prepare).toHaveBeenCalledOnce();
  expect(resume).not.toHaveBeenCalled();
  expect(f.transport.execute).not.toHaveBeenCalled();
});
