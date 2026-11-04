import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createP3SourceScanPort, getP3SourceScanAvailability } from "./p3FormScan";
import {
  createDefaultUniversalP3SourceInterpreter,
  supportsUniversalP3FormMaterial,
} from "@/data/operations/defaultUniversalP3SourceInterpreter";
import type {
  UniversalP3FormContext,
  UniversalP3FormInterpretation,
} from "@/data/operations/universalP3FormInterpretation";
vi.mock("@/data/operations/defaultUniversalP3SourceInterpreter", () => ({
  supportsUniversalP3FormMaterial: vi.fn(),
  createDefaultUniversalP3SourceInterpreter: vi.fn(async () => {
    throw Error("OWNING_TASK_PREPARATION_UNAVAILABLE");
  }),
}));
beforeEach(() => vi.stubEnv("EXPO_PUBLIC_OTR_UNIVERSAL_CONTINUOUS_ENABLED", "true"));
afterEach(() => vi.unstubAllEnvs());
it.each([undefined, "false"])(
  "leaves the default port unavailable without the existing continuous Source flag (%s)",
  (value) => {
    vi.stubEnv("EXPO_PUBLIC_OTR_UNIVERSAL_CONTINUOUS_ENABLED", value);
    const calls = vi.mocked(createDefaultUniversalP3SourceInterpreter).mock.calls.length;
    expect(createP3SourceScanPort()).toBeUndefined();
    expect(vi.mocked(createDefaultUniversalP3SourceInterpreter).mock.calls).toHaveLength(
      calls,
    );
  },
);
const context: UniversalP3FormContext = {
  accountId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  tripId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  itemId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  formId: "form",
  formType: "P3",
  generation: 1,
  revision: 2,
  itemRevision: null,
  mode: "CREATE",
};
const result = { context } as UniversalP3FormInterpretation;
it("candidate exposes a lazy default port and retains a closed runtime initialization", async () => {
  const port = createP3SourceScanPort()!;
  expect(port).toBeTypeOf("function");
  expect(createDefaultUniversalP3SourceInterpreter).not.toHaveBeenCalled();
  for (let i = 0; i < 2; i++)
    await expect(
      port(context, new AbortController().signal, [], () => context),
    ).rejects.toThrow("OWNING_TASK_PREPARATION_UNAVAILABLE");
  expect(createDefaultUniversalP3SourceInterpreter).toHaveBeenCalledOnce();
});
it("lazily retains one factory and forwards each invocation's own signal and live getter", async () => {
  const interpret = vi.fn(async () => result),
    factory = vi.fn(async () => interpret);
  const port = createP3SourceScanPort(factory)!;
  expect(factory).not.toHaveBeenCalled();
  const a = new AbortController(),
    b = new AbortController(),
    live = () => context;
  await Promise.all([
    port(context, a.signal, [], live),
    port(context, b.signal, [], live),
  ]);
  expect(factory).toHaveBeenCalledOnce();
  expect(interpret.mock.calls[0]).toEqual([context, a.signal, [], live]);
  expect(interpret.mock.calls[1]).toEqual([context, b.signal, [], live]);
});
it("retains failed initialization rather than silently making another intake session", async () => {
  const factory = vi.fn(async () => {
    throw Error("UNKNOWN_INIT");
  });
  const port = createP3SourceScanPort(factory)!;
  for (let i = 0; i < 2; i++)
    await expect(
      port(context, new AbortController().signal, [], () => context),
    ).rejects.toThrow("UNKNOWN_INIT");
  expect(factory).toHaveBeenCalledOnce();
});
it.each(["cancel", "edit"] as const)(
  "%s while async factory opens blocks intake",
  async (change) => {
    let finish!: () => void;
    const wait = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const interpret = vi.fn(async () => result),
      factory = vi.fn(async () => {
        await wait;
        return interpret;
      });
    const port = createP3SourceScanPort(factory)!,
      controller = new AbortController();
    let live: UniversalP3FormContext | null = context;
    const pending = port(context, controller.signal, [], () => live);
    await vi.waitFor(() => expect(factory).toHaveBeenCalledOnce());
    if (change === "cancel") controller.abort();
    else live = { ...context, revision: 3 };
    finish();
    await expect(pending).rejects.toThrow(
      change === "cancel" ? "FORM_SCAN_CANCELLED" : "FORM_SCAN_STALE",
    );
    expect(interpret).not.toHaveBeenCalled();
  },
);
it("already invalid context cannot open any factory", async () => {
  const factory = vi.fn(async () => vi.fn(async () => result));
  await expect(
    createP3SourceScanPort(factory)!(
      context,
      new AbortController().signal,
      [],
      () => null,
    ),
  ).rejects.toThrow("FORM_SCAN_STALE");
  expect(factory).not.toHaveBeenCalled();
});

it("preflight is software-only and Files without material is not a MIME promise", () => {
  vi.stubEnv("EXPO_PUBLIC_OTR_API_BASE_URL", "https://fixture.invalid");
  const factory = vi.mocked(createDefaultUniversalP3SourceInterpreter);
  factory.mockClear();
  const predicate = vi.mocked(supportsUniversalP3FormMaterial);
  predicate.mockClear();
  expect(getP3SourceScanAvailability("files")).toEqual({ available: true });
  for (const source of ["camera", "photos"] as const)
    expect(getP3SourceScanAvailability(source)).toEqual({
      available: false,
      reason: "UNSUPPORTED_SOURCE",
    });
  expect(predicate).not.toHaveBeenCalled();
  expect(factory).not.toHaveBeenCalled();
});
it.each([undefined, "false"])(
  "preflight continuous=%s fails before factory",
  (enabled) => {
    vi.stubEnv("EXPO_PUBLIC_OTR_API_BASE_URL", "https://fixture.invalid");
    vi.stubEnv("EXPO_PUBLIC_OTR_UNIVERSAL_CONTINUOUS_ENABLED", enabled);
    expect(getP3SourceScanAvailability("files")).toEqual({
      available: false,
      reason: "UNAVAILABLE",
    });
  },
);
it("preflight missing Backend origin is unavailable", () => {
  vi.stubEnv("EXPO_PUBLIC_OTR_API_BASE_URL", undefined);
  expect(getP3SourceScanAvailability("files")).toEqual({
    available: false,
    reason: "UNAVAILABLE",
  });
});
it("selection preflight delegates exact material and existing PDF flag to runtime predicate", () => {
  vi.stubEnv("EXPO_PUBLIC_OTR_API_BASE_URL", "https://fixture.invalid");
  const material = [] as const;
  const predicate = vi.mocked(supportsUniversalP3FormMaterial);
  predicate.mockReturnValue(false);
  vi.stubEnv("EXPO_PUBLIC_OTR_UNIVERSAL_PDF_ENABLED", "false");
  expect(getP3SourceScanAvailability("files", material)).toEqual({
    available: false,
    reason: "UNSUPPORTED_SELECTION",
  });
  expect(predicate).toHaveBeenLastCalledWith(material, false);
  predicate.mockReturnValue(true);
  vi.stubEnv("EXPO_PUBLIC_OTR_UNIVERSAL_PDF_ENABLED", "true");
  expect(getP3SourceScanAvailability("files", material)).toEqual({ available: true });
  expect(predicate).toHaveBeenLastCalledWith(material, true);
});
