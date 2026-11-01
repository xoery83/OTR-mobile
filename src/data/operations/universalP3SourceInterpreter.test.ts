import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { universalP1SourceFixture } from "../../../backend/src/__fixtures__/universalP1Source";
import { fixture as sqliteFixture } from "../repositories/__fixtures__/captureBatchAssessment";
import {
  getAccountGeneration,
  advanceAccountGeneration,
} from "../auth/accountGeneration";
import { ApiClientError } from "../api/client";
import {
  universalResultSchema,
  type UniversalExecutionContext,
} from "../api/universalImportContracts";
import { createUniversalImportTransport } from "../api/universalImportTransport";
import { createUniversalP3SourceInterpreter } from "./universalP3SourceInterpreter";
import type { UniversalP3FormContext } from "./universalP3FormInterpretation";
import type { CaptureSelection } from "@/features/capture/captureStaging";
import type { CaptureJobReadModel } from "@/domain/capture/captureSubmission";

vi.mock("expo/fetch", () => ({ fetch: vi.fn() }));
vi.mock("../auth/sessionAccessToken", () => ({ sessionAccessToken: vi.fn() }));
const absent = () =>
  new ApiClientError("local fixture absent", "http", 404, "TASK_NOT_FOUND");

async function fixture() {
  const sql = sqliteFixture(),
    accountId = await sql.getAccount(),
    tripId = randomUUID();
  const source = await universalP1SourceFixture(accountId, tripId, "2026-11-03", "P3");
  const result = universalResultSchema.parse({
    ...source.input.result,
    providerOutcome: "LOCAL_FIXTURE",
  });
  const context: UniversalP3FormContext = {
    accountId,
    tripId,
    formId: randomUUID(),
    formType: "P3",
    itemId: randomUUID(),
    generation: getAccountGeneration(),
    revision: 0,
    itemRevision: null,
    mode: "CREATE",
  };
  const material: readonly CaptureSelection[] = [
    {
      source: "files",
      temporaryUri: "file:///local-fixture-booking.txt",
      name: "fixture.txt",
      typeHint: "text/plain",
    },
  ];
  const controller = new AbortController();
  let current: UniversalP3FormContext | null = structuredClone(context);
  let task: UniversalExecutionContext | null = null;
  let model: CaptureJobReadModel | null = null;
  const prepareSources = vi.fn(async (_context: unknown, job: CaptureJobReadModel) => {
    // Explicit local owning Source/Task fixture; no actual Provider, scope or remote publication.
    model = job;
    result.batchId = job.batch.batchId;
    result.sourceBindings[0].inputId = job.inputs[0].id;
    task = {
      version: "otr.backend.universal-context/1",
      actorId: accountId,
      accountId,
      tripId,
      batchId: job.batch.batchId,
      taskId: result.taskId,
    };
  });
  const transport = {
    context: vi.fn(async () => {
      if (!task) throw absent();
      return task;
    }),
    result: vi.fn(async () => result),
    execute: vi.fn(async () => result),
  };
  const submission = {
    repository: sql.submissions,
    newId: vi.fn(randomUUID),
    now: () => "2026-11-02T00:00:00.000Z",
    open: vi.fn(async (_selection: CaptureSelection) => ({
      bytes: new TextEncoder().encode(
        source.input.snapshot.representations[0].text_content!,
      ),
    })),
  };
  const deps = {
    requireNormalAccount: vi.fn(sql.getAccount),
    submission,
    prepareSources,
    createTransport: vi.fn(
      (_options: { signal: AbortSignal; assertCurrent(): void }) => transport,
    ),
  };
  const interpret = createUniversalP3SourceInterpreter(deps);
  return {
    sql,
    source,
    result,
    context,
    material,
    controller,
    prepareSources,
    transport,
    submission,
    deps,
    interpret,
    get model() {
      return model;
    },
    get task() {
      return task;
    },
    setTask(value: UniversalExecutionContext | null) {
      task = value;
    },
    changeCurrent(value: UniversalP3FormContext | null) {
      current = value;
    },
    getCurrentContext: () => current,
    run: () => interpret(context, controller.signal, material, () => current),
  };
}

it("runs raw selection → real durable Capture session → existing consumer → typed suggestions; later reads keep exact IDs", async () => {
  const f = await fixture();
  const output = await f.run();
  expect(output.providerOutcome).toBe("LOCAL_FIXTURE");
  expect(output.candidates[0].fields).toMatchObject({
    title: "海滨住宿",
    startDate: "2026-11-03",
    endDate: "2026-11-05",
  });
  expect(f.model!.allInputsAccepted).toBe(true);
  expect(f.model!.batch.context.tripPrior!.id).toBe(f.context.tripId);
  expect(f.submission.open).toHaveBeenCalledTimes(1);
  expect(f.prepareSources).toHaveBeenCalledTimes(1);
  expect(f.transport.execute).not.toHaveBeenCalled();
  const ids = f.submission.newId.mock.calls.length;
  const before = f.sql.sql.prepare("SELECT total_changes() AS count").get();
  const repeated = await f.run();
  expect(repeated).toEqual(output);
  expect(f.sql.sql.prepare("SELECT total_changes() AS count").get()).toEqual(before);
  expect(f.submission.newId).toHaveBeenCalledTimes(ids);
  expect(f.submission.open).toHaveBeenCalledTimes(1);
  expect(f.prepareSources).toHaveBeenCalledTimes(1);
});

it("coalesces duplicate invocation around one frozen session and Source intent", async () => {
  const f = await fixture();
  const [a, b] = await Promise.all([f.run(), f.run()]);
  expect(a).toEqual(b);
  expect(f.prepareSources).toHaveBeenCalledTimes(1);
  expect(f.submission.open).toHaveBeenCalledTimes(1);
});

it("rejects an old three-argument caller before any raw intake", async () => {
  const f = await fixture();
  // @ts-expect-error The formal Native callback now requires its live Context reader.
  await expect(f.interpret(f.context, f.controller.signal, f.material)).rejects.toThrow(
    "CURRENT_CONTEXT_REQUIRED",
  );
  expect(f.submission.newId).not.toHaveBeenCalled();
});

it("never recreates a previously observed successful Task after a later context 404", async () => {
  const f = await fixture();
  await f.run();
  f.setTask(null);
  await expect(f.run()).rejects.toThrow("local fixture absent");
  expect(f.prepareSources).toHaveBeenCalledTimes(1);
  expect(f.transport.execute).not.toHaveBeenCalled();
});

it("retains UNKNOWN without another prepare/dispatch or new IDs, and refuses implicit new material intent", async () => {
  const f = await fixture();
  await f.run();
  f.result.status = "EXECUTION_OUTCOME_UNKNOWN";
  f.result.providerOutcome = "UNKNOWN";
  f.result.candidates = [];
  const ids = f.submission.newId.mock.calls.length,
    before = f.sql.sql.prepare("SELECT total_changes() AS count").get();
  expect(await f.run()).toMatchObject({
    status: "EXECUTION_OUTCOME_UNKNOWN",
    candidates: [],
  });
  await expect(
    f.interpret(
      f.context,
      new AbortController().signal,
      [{ ...f.material[0] }],
      f.getCurrentContext,
    ),
  ).rejects.toThrow("FROZEN_REQUEST_MISMATCH");
  expect(f.submission.newId).toHaveBeenCalledTimes(ids);
  expect(f.prepareSources).toHaveBeenCalledTimes(1);
  expect(f.transport.execute).not.toHaveBeenCalled();
  expect(f.sql.sql.prepare("SELECT total_changes() AS count").get()).toEqual(before);
});

it("isolates frozen UNKNOWN to its owning Form factory", async () => {
  const a = await fixture(),
    b = await fixture();
  await a.run();
  a.result.status = "EXECUTION_OUTCOME_UNKNOWN";
  a.result.providerOutcome = "UNKNOWN";
  a.result.candidates = [];
  await a.run();
  expect((await b.run()).candidates[0].fields.title).toBe("海滨住宿");
});

it.each([403, 503])(
  "does not prepare a Source after ambiguous/unavailable context %i",
  async (status) => {
    const f = await fixture();
    f.transport.context.mockRejectedValue(
      new ApiClientError(
        "local closed fixture",
        "http",
        status,
        "UNIVERSAL_IMPORT_CLOSED",
      ),
    );
    await expect(f.run()).rejects.toThrow("local closed fixture");
    expect(f.prepareSources).not.toHaveBeenCalled();
    expect(f.transport.execute).not.toHaveBeenCalled();
    expect((await f.sql.submissions.list()).length).toBe(1);
  },
);

it("has no default Source/Provider capability when prepare dependency is absent", async () => {
  const f = await fixture();
  const interpret = createUniversalP3SourceInterpreter({
    ...f.deps,
    prepareSources: undefined,
  });
  await expect(
    interpret(f.context, f.controller.signal, f.material, f.getCurrentContext),
  ).rejects.toThrow("local fixture absent");
  expect(f.prepareSources).not.toHaveBeenCalled();
  expect(f.transport.execute).not.toHaveBeenCalled();
});

it("does not start again after ambiguous preparation; retained Capture stays recoverable", async () => {
  const f = await fixture();
  f.prepareSources.mockRejectedValue(new Error("local lost preparation ACK"));
  await expect(f.run()).rejects.toThrow("lost preparation ACK");
  const ids = f.submission.newId.mock.calls.length;
  await expect(f.run()).rejects.toThrow("local fixture absent");
  expect(f.prepareSources).toHaveBeenCalledTimes(1);
  expect(f.submission.newId).toHaveBeenCalledTimes(ids);
  expect((await f.sql.submissions.list()).length).toBe(1);
});

it("never prepares if an UNKNOWN Task appears between the initial missing-context read and Start", async () => {
  const f = await fixture();
  let calls = 0;
  f.transport.context.mockImplementation(async () => {
    if (++calls === 1) throw absent();
    const job = (await f.sql.submissions.list())[0];
    f.result.batchId = job.batch.batchId;
    f.result.sourceBindings[0].inputId = job.inputs[0].id;
    f.result.status = "EXECUTION_OUTCOME_UNKNOWN";
    f.result.providerOutcome = "UNKNOWN";
    f.result.candidates = [];
    return {
      version: "otr.backend.universal-context/1",
      actorId: f.context.accountId,
      accountId: f.context.accountId,
      tripId: f.context.tripId,
      batchId: job.batch.batchId,
      taskId: f.result.taskId,
    };
  });
  await expect(f.run()).rejects.toThrow("EXISTING_TASK_READ_ONLY");
  expect(f.prepareSources).not.toHaveBeenCalled();
  expect(f.transport.execute).not.toHaveBeenCalled();
});

it("blocks stale Form, cancelled request and foreign Account before intake", async () => {
  const stale = await fixture();
  stale.changeCurrent({ ...stale.context, revision: 1 });
  await expect(stale.run()).rejects.toThrow("STALE");
  expect(stale.submission.newId).not.toHaveBeenCalled();
  const cancelled = await fixture();
  cancelled.controller.abort();
  await expect(cancelled.run()).rejects.toThrow("CANCELLED");
  expect(cancelled.submission.open).not.toHaveBeenCalled();
  const foreign = await fixture();
  foreign.deps.requireNormalAccount.mockResolvedValue(randomUUID());
  await expect(foreign.run()).rejects.toThrow("ACCOUNT_CONTEXT_MISMATCH");
  expect(foreign.submission.newId).not.toHaveBeenCalled();
});

it("keeps Form generation distinct from the independently captured Account generation", async () => {
  const f = await fixture();
  f.context.generation = getAccountGeneration() + 500;
  f.changeCurrent(structuredClone(f.context));
  const result = await f.run();
  expect(result.context.generation).toBe(f.context.generation);
  expect(result.candidates[0].fields.title).toBe("海滨住宿");
  expect(f.prepareSources.mock.calls[0][0]).toMatchObject({
    generation: getAccountGeneration(),
  });
});

it("rejects a real Account generation transition even when the Form context remains unchanged", async () => {
  const generation = await fixture();
  await generation.run();
  const ids = generation.submission.newId.mock.calls.length;
  advanceAccountGeneration();
  await expect(generation.run()).rejects.toThrow("Account changed");
  expect(generation.submission.newId).toHaveBeenCalledTimes(ids);
  expect(generation.prepareSources).toHaveBeenCalledTimes(1);
});

it("keeps locally accepted Capture after UI changes during byte intake and blocks Source dispatch", async () => {
  const f = await fixture(),
    original = f.submission.open.getMockImplementation()!;
  f.submission.open.mockImplementation(async (selection) => {
    const bytes = await original(selection);
    f.changeCurrent({ ...f.context, revision: 1 });
    return bytes;
  });
  await expect(f.run()).rejects.toThrow("STALE");
  const retained = await f.sql.submissions.list();
  expect(retained).toHaveLength(1);
  expect(retained[0].allInputsAccepted).toBe(true);
  expect(f.transport.context).not.toHaveBeenCalled();
  expect(f.prepareSources).not.toHaveBeenCalled();
});

it("discards late results after cancellation without changing accepted Capture or making replacement IDs", async () => {
  const f = await fixture();
  f.transport.result.mockImplementationOnce(async () => {
    f.controller.abort();
    return f.result;
  });
  await expect(f.run()).rejects.toThrow("STALE");
  const ids = f.submission.newId.mock.calls.length;
  expect((await f.sql.submissions.list())[0].allInputsAccepted).toBe(true);
  expect(
    (
      await f.interpret(
        f.context,
        new AbortController().signal,
        f.material,
        f.getCurrentContext,
      )
    ).candidates[0].fields.title,
  ).toBe("海滨住宿");
  expect(f.submission.open).toHaveBeenCalledTimes(1);
  expect(f.prepareSources).toHaveBeenCalledTimes(1);
  await expect(
    f.interpret(
      { ...f.context, revision: 1 },
      new AbortController().signal,
      f.material,
      f.getCurrentContext,
    ),
  ).rejects.toThrow("FROZEN_REQUEST_MISMATCH");
  expect(f.submission.newId).toHaveBeenCalledTimes(ids);
});

it("uses actual HTTP transport with only intercepted local GETs for the raw chain", async () => {
  const f = await fixture();
  const fetcher = vi.fn(async (url: string | URL | Request, _init?: RequestInit) => {
    if (!f.task)
      return new Response(
        JSON.stringify({
          error: { code: "TASK_NOT_FOUND", message: "local fixture absent" },
        }),
        { status: 404 },
      );
    return new Response(
      JSON.stringify(String(url).includes(`/${f.task.taskId}?`) ? f.result : f.task),
      { status: 200 },
    );
  });
  const interpret = createUniversalP3SourceInterpreter({
    ...f.deps,
    createTransport: (options) =>
      createUniversalImportTransport(f.deps.requireNormalAccount, {
        ...options,
        baseUrl: "https://fixture.invalid",
        fetchImplementation: fetcher as typeof fetch,
        tokenProvider: async () => ({
          userId: f.context.accountId,
          token: "LOCAL_FIXTURE_ONLY",
        }),
      }),
  });
  expect(
    (await interpret(f.context, f.controller.signal, f.material, f.getCurrentContext))
      .providerOutcome,
  ).toBe("LOCAL_FIXTURE");
  expect(f.prepareSources).toHaveBeenCalledTimes(1);
  for (const [, init] of fetcher.mock.calls) expect(init?.method).toBe("GET");
});
