import { expect, it, vi } from "vitest";
import { createP3SourceScanPort } from "./p3FormScan";
import type {
  UniversalP3FormContext,
  UniversalP3FormInterpretation,
} from "@/data/operations/universalP3FormInterpretation";
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
it("default is absent, with no factory, dependency, Auth or network initialization", () => {
  expect(createP3SourceScanPort()).toBeUndefined();
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
