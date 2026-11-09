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
  retainedStart = false,
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
  const startRetained = vi.fn(async () => ({ status: "QUEUED" as const, context: binding }));
  let active = true;
  const consumer = createUniversalCaptureConsumer({
    getAccountId: async () => accountId,
    isCurrent: () => active,
    transport,
    prepareSources,
    resumeTask,
    continuous,
    ...(retainedStart ? { startRetained } : {}),
  });
  return {
    accountId,
    model,
    result,
    transport,
    consumer,
    startRetained,
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
it.each(["UNIVERSAL_CONTEXT_UNAVAILABLE", "UNIVERSAL_IMPORT_CLOSED"])(
  "continuous context 503 %s never prepares Sources and retries the same retained Task read-only",
  async (code) => {
    const prepare = vi.fn(async () => {}),
      resume = vi.fn(async () => {}),
      f = fixture(prepare, true, resume),
      binding = await f.transport.context(),
      failure = new ApiClientError("unavailable", "http", 503, code);
    f.transport.context.mockClear();
    Object.assign(f.result, {
      taskId: binding.taskId,
      status: "EXECUTION_OUTCOME_UNKNOWN",
      providerOutcome: "UNKNOWN",
    });
    // A cold read and explicit Start both retain uncertainty; neither proves absence.
    for (const action of ["recover", "start"] as const) {
      f.transport.context.mockRejectedValueOnce(failure);
      await expect(f.consumer[action](f.model)).rejects.toBe(failure);
      expect(prepare).not.toHaveBeenCalled();
      expect(resume).not.toHaveBeenCalled();
      expect(f.transport.result).not.toHaveBeenCalled();
      expect(f.transport.execute).not.toHaveBeenCalled();
    }
    expect(await f.consumer.recover(f.model)).toBe(f.result);
    expect(f.transport.result).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ accountId: f.accountId, tripId: binding.tripId }),
      binding,
    );
    expect(f.transport.context.mock.calls).toEqual(
      Array.from({ length: 3 }, () => [
        expect.objectContaining({ accountId: f.accountId, tripId: binding.tripId }),
        binding.batchId,
      ]),
    );
    expect(prepare).not.toHaveBeenCalled();
    expect(resume).not.toHaveBeenCalled();
    expect(f.transport.execute).not.toHaveBeenCalled();
  },
);
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
it("uses a scoped QUEUED receipt for the result read and keeps read-only recovery", async () => {
  const prepare = vi.fn(), resume = vi.fn(),
    f = fixture(prepare, true, resume);
  const binding = await f.transport.context();
  f.transport.context.mockClear().mockRejectedValueOnce(absent());
  prepare.mockResolvedValue({ status: "QUEUED", context: binding });
  Object.assign(f.result, {
    status: "EXECUTION_OUTCOME_UNKNOWN",
    providerOutcome: "UNKNOWN",
  });

  expect(await f.consumer.start(f.model)).toBeNull();
  expect(f.consumer.queued).toBe(true);
  expect(f.consumer.activity).toBeNull();
  expect(f.transport.context).toHaveBeenCalledOnce();
  expect(f.transport.result).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ accountId: binding.accountId, tripId: binding.tripId }),
    binding,
  );
  expect(resume).not.toHaveBeenCalled();

  Object.assign(f.result, { status: "CANDIDATES_READY", providerOutcome: "COMPLETED" });
  expect(await f.consumer.recover(f.model)).toBe(f.result);
  expect(f.consumer.queued).toBe(false);
  expect(prepare).toHaveBeenCalledOnce();
  expect(f.transport.execute).not.toHaveBeenCalled();
});

it.each(["accountId", "actorId", "tripId", "batchId", "taskId"] as const)(
  "falls back to owning reads when a QUEUED receipt has an invalid %s",
  async (field) => {
    const prepare = vi.fn(), resume = vi.fn(),
      f = fixture(prepare, true, resume);
    const binding = await f.transport.context();
    f.transport.context.mockClear().mockRejectedValueOnce(absent());
    prepare.mockResolvedValue({
      status: "QUEUED",
      context: { ...binding, [field]: field === "taskId" ? "invalid-task" : randomUUID() },
    });
    expect(await f.consumer.start(f.model)).toBe(f.result);
    expect(f.transport.context).toHaveBeenCalledTimes(2);
    expect(f.transport.result).toHaveBeenCalledExactlyOnceWith(expect.anything(), binding);
    expect(f.consumer.canDispatch).toBe(false);
    expect(resume).not.toHaveBeenCalled();
    expect(f.transport.execute).not.toHaveBeenCalled();
  },
);

it("uses the owning context after EXISTING and rejects a different Task", async () => {
  const prepare = vi.fn(), resume = vi.fn(),
    f = fixture(prepare, true, resume);
  const binding = await f.transport.context();
  prepare.mockResolvedValue({ status: "EXISTING", context: binding });
  f.transport.context.mockClear().mockRejectedValueOnce(absent())
    .mockResolvedValueOnce({ ...binding, taskId: randomUUID() });
  await expect(f.consumer.start(f.model)).rejects.toThrow("UNIVERSAL_CAPTURE_STALE");
  expect(f.transport.context).toHaveBeenCalledTimes(2);
  expect(f.transport.result).not.toHaveBeenCalled();
  expect(resume).not.toHaveBeenCalled();
  expect(await f.consumer.recover(f.model)).toBe(f.result);
  expect(prepare).toHaveBeenCalledOnce();
  expect(f.transport.execute).not.toHaveBeenCalled();
});

it("reconciles a lost prepare receipt using only owning reads and never prepares again in that view", async () => {
  const prepare = vi.fn(async () => null), resume = vi.fn(),
    f = fixture(prepare, true, resume);
  f.transport.context.mockRejectedValueOnce(absent()).mockRejectedValueOnce(absent());
  await expect(f.consumer.start(f.model)).rejects.toThrow("OWNING_TASK_READER_UNAVAILABLE");
  f.transport.context.mockRejectedValueOnce(absent());
  await expect(f.consumer.start(f.model)).rejects.toThrow();
  expect(await f.consumer.recover(f.model)).toBe(f.result);
  expect(prepare).toHaveBeenCalledOnce();
  expect(resume).not.toHaveBeenCalled();
  expect(f.transport.execute).not.toHaveBeenCalled();
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

it("uses persisted Capture assignment for the same Account-level Batch without rewriting intake", async () => {
  const x = fixture();
  const tripId = x.result.tripId;
  x.model.batch.context.tripPrior = null;
  Object.assign(x.model, { assignedTripId: tripId });
  await expect(x.consumer.recover(x.model)).resolves.toEqual(x.result);
  expect(x.model.batch.context.tripPrior).toBeNull();
});


it("retained attribution alone cannot prepare or dispatch a new interpretation", async () => {
  const prepare = vi.fn(), f = fixture(prepare, true);
  f.model.batch.context.tripPrior = null;
  f.model.assignedTripId = f.result.tripId;
  await expect(f.consumer.start(f.model)).rejects.toThrow("UNIVERSAL_CAPTURE_NOT_QUALIFIED");
  expect(f.transport.context).not.toHaveBeenCalled();
  expect(f.transport.execute).not.toHaveBeenCalled();
  expect(prepare).not.toHaveBeenCalled();
});

function continuationFixture() {
  const f = fixture();
  f.model.inputs = [{ ...f.model.inputs[0], contentByteCount: 66 }];
  const input = f.model.inputs[0];
  const response = {
    version: "otr.backend.universal-material-ready/1" as const,
    state: "MATERIAL_READY_NO_TASK" as const,
    accountId: f.accountId,
    actorId: f.accountId,
    prepare: {
      batchId: f.model.batch.batchId,
      tripId: f.model.batch.context.tripPrior!.id,
      submissionSha256: "b".repeat(64),
      inputs: [
        {
          id: input.id,
          source_id: randomUUID(),
          representation_id: randomUUID(),
          payload_sha256: input.contentSha256!,
          byte_count: 66,
          material_revision: 1,
          observed_source_row_revision: 2,
          historical_selection: false as const,
        },
      ],
    },
  };
  const materialReady = vi.fn(async () => response);
  const prepare = vi.fn(async () => ({
    status: "QUEUED" as const,
    context: await f.transport.context(),
  }));
  const verifyLocalSubmission = vi.fn(async () => "b".repeat(64));
  const resumeTask = vi.fn(async () => {});
  const prepareSources = vi.fn(async () => {});
  const consumer = createUniversalCaptureConsumer({
    getAccountId: async () => f.accountId,
    isCurrent: () => true,
    transport: f.transport,
    continuous: true,
    resumeTask,
    prepareSources,
    materialContinuation: {
      transport: { materialReady, prepare },
      verifyLocalSubmission,
    },
  });
  return { ...f, consumer, response, materialReady, prepare, verifyLocalSubmission, resumeTask, prepareSources };
}

it("keeps passive Check on Context and explicitly prepares only the exact existing batch", async () => {
  const f = continuationFixture();
  f.transport.context.mockRejectedValueOnce(absent());
  await expect(f.consumer.recover(f.model)).rejects.toMatchObject({ code: "TASK_NOT_FOUND" });
  expect(f.materialReady).not.toHaveBeenCalled();
  expect(f.prepare).not.toHaveBeenCalled();
  f.transport.context.mockRejectedValueOnce(contextUnavailable());
  f.transport.result.mockRejectedValueOnce(absent());
  expect(await f.consumer.start(f.model)).toBeNull();
  expect(f.verifyLocalSubmission).toHaveBeenCalledOnce();
  expect(f.prepare).toHaveBeenCalledExactlyOnceWith(expect.anything(), f.response.prepare);
  expect(f.prepareSources).not.toHaveBeenCalled();
  expect(f.resumeTask).not.toHaveBeenCalled();
  expect(f.transport.execute).not.toHaveBeenCalled();
});

const contextUnavailable = () =>
  new ApiClientError("unavailable", "http", 503, "UNIVERSAL_CONTEXT_UNAVAILABLE");

it.each(["actor", "batch", "input", "digest", "bytes", "submission", "consent", "unavailable"] as const)(
  "refuses a material continuation with %s mismatch or failure without falling back to Source",
  async (reason) => {
    const f = continuationFixture();
    f.transport.context.mockRejectedValueOnce(contextUnavailable());
    if (reason === "actor") f.response.actorId = randomUUID();
    if (reason === "batch") f.response.prepare.batchId = randomUUID();
    if (reason === "input") f.response.prepare.inputs[0].id = randomUUID();
    if (reason === "digest") f.response.prepare.inputs[0].payload_sha256 = "c".repeat(64);
    if (reason === "bytes") f.response.prepare.inputs[0].byte_count = 65;
    if (reason === "submission") f.verifyLocalSubmission.mockResolvedValueOnce("c".repeat(64));
    if (reason === "consent")
      f.verifyLocalSubmission.mockRejectedValueOnce(Error("UNIVERSAL_PHOTO_REVIEW_REQUIRED"));
    if (reason === "unavailable")
      f.materialReady.mockRejectedValueOnce(new ApiClientError("unavailable", "http", 503));
    await expect(f.consumer.start(f.model)).rejects.toThrow();
    f.transport.context.mockRejectedValueOnce(absent());
    await expect(f.consumer.start(f.model)).rejects.toMatchObject({ code: "TASK_NOT_FOUND" });
    expect(f.prepare).not.toHaveBeenCalled();
    expect(f.prepareSources).not.toHaveBeenCalled();
    expect(f.resumeTask).not.toHaveBeenCalled();
  },
);

it("uses only passive recovery after an unconfirmed material Prepare in the current view", async () => {
  const f = continuationFixture();
  f.transport.context.mockRejectedValueOnce(contextUnavailable());
  f.prepare.mockRejectedValueOnce(new TypeError("lost ACK"));
  await expect(f.consumer.start(f.model)).rejects.toThrow("lost ACK");
  f.transport.context.mockRejectedValueOnce(absent());
  await expect(f.consumer.start(f.model)).rejects.toMatchObject({ code: "TASK_NOT_FOUND" });
  f.transport.result.mockRejectedValueOnce(absent());
  expect(await f.consumer.start(f.model)).toBeNull();
  expect(f.materialReady).toHaveBeenCalledOnce();
  expect(f.prepare).toHaveBeenCalledOnce();
  expect(f.prepareSources).not.toHaveBeenCalled();
  expect(f.resumeTask).not.toHaveBeenCalled();
});

it("preserves ordinary existing Task and first Start 404, and ignores generic 503", async () => {
  const f = continuationFixture();
  f.transport.result.mockRejectedValueOnce(absent());
  expect(await f.consumer.start(f.model)).toBeNull();
  expect(f.resumeTask).toHaveBeenCalledOnce();
  expect(f.materialReady).not.toHaveBeenCalled();

  const first = continuationFixture();
  first.transport.context.mockRejectedValueOnce(absent());
  expect(await first.consumer.start(first.model)).toBe(first.result);
  expect(first.prepareSources).toHaveBeenCalledOnce();
  expect(first.materialReady).not.toHaveBeenCalled();

  const closed = continuationFixture();
  closed.transport.context.mockRejectedValueOnce(
    new ApiClientError("closed", "http", 503, "UNIVERSAL_IMPORT_CLOSED"),
  );
  await expect(closed.consumer.start(closed.model)).rejects.toMatchObject({ status: 503 });
  expect(closed.materialReady).not.toHaveBeenCalled();
  expect(closed.prepareSources).not.toHaveBeenCalled();
});


it("starts through owning Prepare before reading progress and keeps reopen passive", async () => {
  const f = fixture(undefined, true, undefined, true);
  f.transport.result.mockRejectedValue(absent());
  expect(await f.consumer.start(f.model)).toBeNull();
  expect(f.startRetained).toHaveBeenCalledOnce();
  expect(f.transport.context).not.toHaveBeenCalled();
  expect(f.transport.execute).not.toHaveBeenCalled();
  expect(await f.consumer.recover(f.model)).toBeNull();
  expect(f.transport.context).toHaveBeenCalledOnce();
  expect(f.startRetained).toHaveBeenCalledOnce();
});
