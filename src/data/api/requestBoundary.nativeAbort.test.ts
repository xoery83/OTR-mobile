import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createRequestBoundary, RequestBoundaryError } from "./requestBoundary";
import { createApiClient, readLastApiFailure } from "./client";
import { z } from "zod";
class ReasonlessSignal extends EventTarget {
  aborted = false;
  get reason() {
    return undefined;
  }
}
class ReasonlessController {
  signal = new ReasonlessSignal();
  abort(_reason?: unknown) {
    if (this.signal.aborted) return;
    this.signal.aborted = true;
    this.signal.dispatchEvent(new Event("abort"));
  }
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-24T05:10:00Z"));
  vi.stubGlobal("AbortController", ReasonlessController);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
it("retains timeout when native AbortSignal ignores reason", async () => {
  const boundary = createRequestBoundary(15);
  const promise = boundary.run(() => new Promise<void>(() => {}));
  const assertion = expect(promise).rejects.toMatchObject({ code: "REQUEST_TIMEOUT" });
  await vi.advanceTimersByTimeAsync(15);
  await assertion;
  expect(boundary.signal.reason).toBeUndefined();
  expect(() => boundary.assertCurrent()).toThrow(RequestBoundaryError);
  boundary.close();
});
it("reports real timeout instead of network OTHER when Native fetch rejects undefined", async () => {
  const client = createApiClient({
    baseUrl: "https://api.example.com",
    timeoutMs: 15,
    maxResponseBytes: 256,
    fetchImplementation: (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(undefined));
      }),
  });
  const assertion = expect(
    client.get(
      "/v2/trips/10000000-0000-4000-8000-000000000001/core/operations/10000000-0000-4000-8000-000000000002",
      z.unknown(),
    ),
  ).rejects.toMatchObject({ kind: "timeout", code: "REQUEST_TIMEOUT" });
  await vi.advanceTimersByTimeAsync(15);
  await assertion;
  expect(readLastApiFailure()).toMatchObject({
    kind: "timeout",
    code: "REQUEST_TIMEOUT",
    stage: "FETCH",
  });
});
it("preserves parent cancellation before timeout and closes already-aborted parents", async () => {
  const parent = new ReasonlessController();
  const boundary = createRequestBoundary(30, parent.signal as AbortSignal);
  const promise = boundary.run(() => new Promise<void>(() => {}));
  const assertion = expect(promise).rejects.toMatchObject({ code: "REQUEST_CANCELED" });
  parent.abort("PRIVATE_REASON");
  await assertion;
  await vi.advanceTimersByTimeAsync(30);
  expect(() => boundary.assertCurrent()).toThrow("REQUEST_CANCELED");
  boundary.close();
  const initial = createRequestBoundary(30, parent.signal as AbortSignal);
  expect(() => initial.assertCurrent()).toThrow("REQUEST_CANCELED");
  initial.close();
});
it("late abort-ignoring result cannot regain admission", async () => {
  const boundary = createRequestBoundary(15);
  let release!: (value: string) => void;
  let admitted = false;
  const promise = boundary
    .run(
      () =>
        new Promise<string>((resolve) => {
          release = resolve;
        }),
    )
    .then(() => {
      admitted = true;
    });
  const assertion = expect(promise).rejects.toMatchObject({ code: "REQUEST_TIMEOUT" });
  await vi.advanceTimersByTimeAsync(15);
  await assertion;
  release("late");
  await Promise.resolve();
  expect(admitted).toBe(false);
  boundary.close();
});
