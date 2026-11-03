import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { CaptureSelection } from "@/features/capture/captureStaging";
import type { UniversalP3FormContext } from "./universalP3FormInterpretation";
import type { createUniversalP3SourceInterpreter } from "./universalP3SourceInterpreter";
import type { CaptureJobReadModel } from "@/domain/capture/captureSubmission";
import type { AccountRequestContext } from "../auth/accountRequestContext";
import type { UniversalBatchPrepare } from "../api/universalImportContracts";
import { createDefaultUniversalP3SourceInterpreter } from "./defaultUniversalP3SourceInterpreter";

const f = vi.hoisted(() => ({
  adopted: vi.fn(),
  dependencies: vi.fn(),
  raw: vi.fn(),
  invoke: vi.fn(),
  transport: vi.fn(),
  prepare: vi.fn(),
}));
vi.mock("../auth/authRepository", () => ({ requireAdoptedUserId: f.adopted }));
vi.mock("./defaultCaptureSubmission", () => ({
  getDefaultCaptureSubmissionDependencies: f.dependencies,
}));
vi.mock("./universalP3SourceInterpreter", () => ({
  createUniversalP3SourceInterpreter: f.raw,
}));
vi.mock("../api/universalImportTransport", () => ({
  createUniversalImportTransport: f.transport,
}));
vi.mock("./defaultUniversalOriginalSource", () => ({
  prepareDefaultUniversalCaptureSources: f.prepare,
}));

const context = {
  accountId: "owner",
  tripId: "trip",
  formId: "one-form",
} as UniversalP3FormContext;
const accountContext = {
  accountId: "owner",
  tripId: "trip",
  generation: 9,
} satisfies AccountRequestContext;
const job = { batch: { jobId: "existing-capture-job" } } as CaptureJobReadModel;
const txt: readonly CaptureSelection[] = [
  {
    source: "files",
    temporaryUri: "file:///fixture.txt",
    name: "fixture.txt",
    typeHint: "text/plain",
  },
];
const pdf: readonly CaptureSelection[] = [
  {
    source: "files",
    temporaryUri: "file:///fixture.pdf",
    name: "fixture.pdf",
    typeHint: "application/pdf",
  },
];
const rawDependencies = () =>
  f.raw.mock.calls[0][0] as Parameters<typeof createUniversalP3SourceInterpreter>[0];
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("EXPO_PUBLIC_OTR_API_BASE_URL", "https://fixture.invalid");
  vi.stubEnv("EXPO_PUBLIC_OTR_UNIVERSAL_CONTINUOUS_ENABLED", "true");
  vi.stubEnv("EXPO_PUBLIC_OTR_UNIVERSAL_PDF_ENABLED", "false");
  vi.stubEnv("EXPO_PUBLIC_OTR_UNIVERSAL_PNG_ENABLED", "true");
  f.dependencies.mockResolvedValue({
    repository: {},
    open: vi.fn(),
    newId: vi.fn(),
    now: vi.fn(),
  });
  f.raw.mockReturnValue(f.invoke);
  f.invoke.mockResolvedValue({ localFixture: true });
});
afterEach(() => vi.unstubAllEnvs());

it("uses the shared submission dependencies and adopted reader without mounting or reading a Session", async () => {
  const interpreter = await createDefaultUniversalP3SourceInterpreter();
  expect(rawDependencies().submission).toBe(await f.dependencies.mock.results[0].value);
  expect(rawDependencies().requireNormalAccount).toBe(f.adopted);
  expect(f.transport).not.toHaveBeenCalled();
  expect(f.prepare).not.toHaveBeenCalled();
  expect(f.adopted).not.toHaveBeenCalled();
  const controller = new AbortController(),
    live = () => context;
  await interpreter(context, controller.signal, txt, live);
  expect(f.invoke).toHaveBeenCalledExactlyOnceWith(context, controller.signal, txt, live);
});

it.each(["false", undefined])(
  "continuous=%s rejects before database/dependency IO or intake",
  async (enabled) => {
    vi.stubEnv("EXPO_PUBLIC_OTR_UNIVERSAL_CONTINUOUS_ENABLED", enabled);
    await expect(createDefaultUniversalP3SourceInterpreter()).rejects.toThrow(
      "OWNING_TASK_PREPARATION_UNAVAILABLE",
    );
    expect(f.dependencies).not.toHaveBeenCalled();
    expect(f.raw).not.toHaveBeenCalled();
    expect(f.invoke).not.toHaveBeenCalled();
    expect(f.prepare).not.toHaveBeenCalled();
  },
);

it("missing Backend origin fails before dependency IO", async () => {
  vi.stubEnv("EXPO_PUBLIC_OTR_API_BASE_URL", undefined);
  await expect(createDefaultUniversalP3SourceInterpreter()).rejects.toThrow(
    "UNIVERSAL_BACKEND_UNAVAILABLE",
  );
  expect(f.dependencies).not.toHaveBeenCalled();
});

it("PNG/photo selections reject before intake or Source preparation even when the existing PNG flag is true", async () => {
  const interpreter = await createDefaultUniversalP3SourceInterpreter();
  for (const source of ["files", "photos", "camera"] as const) {
    expect(() =>
      interpreter(
        context,
        new AbortController().signal,
        [
          {
            source,
            temporaryUri: "file:///fixture.png",
            name: "fixture.png",
            typeHint: "image/png",
          },
        ],
        () => context,
      ),
    ).toThrow("UNIVERSAL_FORM_INPUT_UNSUPPORTED");
  }
  expect(f.invoke).not.toHaveBeenCalled();
  expect(f.prepare).not.toHaveBeenCalled();
  expect(f.transport).not.toHaveBeenCalled();
});

it("single PDF follows only the existing PDF flag; mixed batches are not claimed supported", async () => {
  const disabled = await createDefaultUniversalP3SourceInterpreter();
  expect(() =>
    disabled(context, new AbortController().signal, pdf, () => context),
  ).toThrow("INPUT_UNSUPPORTED");
  vi.stubEnv("EXPO_PUBLIC_OTR_UNIVERSAL_PDF_ENABLED", "true");
  const enabled = await createDefaultUniversalP3SourceInterpreter();
  await enabled(context, new AbortController().signal, pdf, () => context);
  expect(f.invoke).toHaveBeenCalledTimes(1);
  expect(() =>
    enabled(context, new AbortController().signal, [...pdf, ...txt], () => context),
  ).toThrow("INPUT_UNSUPPORTED");
  expect(f.invoke).toHaveBeenCalledTimes(1);
});

it("retry uses the current signal/check/Task transport rather than the first aborted invocation", async () => {
  vi.stubEnv("EXPO_PUBLIC_OTR_UNIVERSAL_PDF_ENABLED", "true");
  await createDefaultUniversalP3SourceInterpreter();
  const deps = rawDependencies();
  const first = { prepare: vi.fn() },
    second = { prepare: vi.fn() };
  f.transport.mockReturnValueOnce(first).mockReturnValueOnce(second);
  const a = new AbortController(),
    b = new AbortController();
  const checkA = vi.fn(() => {
    if (a.signal.aborted) throw Error("old aborted signal");
  });
  const checkB = vi.fn(() => {
    if (b.signal.aborted) throw Error("new aborted signal");
  });
  const input = { batchId: "same-batch" } as UniversalBatchPrepare;
  f.prepare.mockImplementation(async (_context, _model, options) =>
    options.prepareTask(input),
  );
  deps.createTransport({ signal: a.signal, assertCurrent: checkA });
  await deps.prepareSources!(accountContext, job);
  a.abort();
  deps.createTransport({ signal: b.signal, assertCurrent: checkB });
  await deps.prepareSources!(accountContext, job);
  expect(first.prepare).toHaveBeenCalledExactlyOnceWith(accountContext, input);
  expect(second.prepare).toHaveBeenCalledExactlyOnceWith(accountContext, input);
  expect(f.transport.mock.calls[1][1]).toMatchObject({
    signal: b.signal,
    assertCurrent: checkB,
  });
  expect(f.prepare.mock.calls[1][2]).toMatchObject({
    getAccountId: f.adopted,
    assertCurrent: checkB,
    pendingPdfProfile: "OTR_PDF_CAPTURE_ORIGINAL_V1",
  });
  expect(f.prepare.mock.calls[1][2]).not.toHaveProperty("pendingPngProfile");
  expect(f.prepare.mock.calls[1][2]).not.toHaveProperty("preparePngOriginal");
});

it("each Form factory retains its own invocation transport", async () => {
  await createDefaultUniversalP3SourceInterpreter();
  const a = rawDependencies();
  await createDefaultUniversalP3SourceInterpreter();
  const b = f.raw.mock.calls[1][0] as typeof a;
  const ta = { prepare: vi.fn() },
    tb = { prepare: vi.fn() };
  f.transport.mockReturnValueOnce(ta).mockReturnValueOnce(tb);
  a.createTransport({ signal: new AbortController().signal, assertCurrent: vi.fn() });
  b.createTransport({ signal: new AbortController().signal, assertCurrent: vi.fn() });
  const input = {} as UniversalBatchPrepare;
  f.prepare.mockImplementation(async (_context, _model, options) =>
    options.prepareTask(input),
  );
  await a.prepareSources!(accountContext, job);
  expect(ta.prepare).toHaveBeenCalledOnce();
  expect(tb.prepare).not.toHaveBeenCalled();
});
