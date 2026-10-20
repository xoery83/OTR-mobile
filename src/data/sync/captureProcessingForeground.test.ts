import { randomUUID } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { captureAccountRequestContext } from "../auth/accountRequestContext";
import { fixture, sha256 } from "../repositories/__fixtures__/captureBatchAssessment";
import { createCaptureProcessingRepository } from "../repositories/captureProcessingRepository";
import { createCaptureProcessingForeground } from "./captureProcessingForeground";

afterEach(() => vi.useRealTimers());

it("wakes a persisted retry at its deadline, pauses in background, and stops on Account change", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-08T00:00:00.000Z"));
  const f = fixture(true);
  const request = await f.submit();
  const context = await captureAccountRequestContext("", f.getAccount);
  const repo = createCaptureProcessingRepository(f.db, f.getAccount, {
    newId: randomUUID,
    sha256,
    now: () => new Date(Date.now()).toISOString(),
  });
  await repo.schedule(context, request.jobId);
  const [first] = await repo.listPending(context);
  await repo.claim(context, first);
  await repo.settle(context, first, new Error("transient"), "2026-10-08T00:00:05.000Z");
  let appState!: (active: boolean) => void;
  let accountChanged!: () => void;
  const changed = vi.fn();
  const controller = createCaptureProcessingForeground({
    isActive: () => true,
    now: Date.now,
    subscribeAppState: (listener) => {
      appState = listener;
      return () => undefined;
    },
    subscribeAccountChange: (listener) => {
      accountChanged = listener;
      return () => undefined;
    },
    run: () => repo.run(context),
    nextWake: () => repo.nextWake(context),
    changed,
  });
  controller.start();
  await vi.advanceTimersByTimeAsync(0);
  appState(false);
  await vi.advanceTimersByTimeAsync(5000);
  expect(changed).not.toHaveBeenCalled();
  appState(true);
  await vi.advanceTimersByTimeAsync(0);
  expect(changed).toHaveBeenCalledTimes(1);
  expect((await repo.events(context, request.jobId)).at(-1)?.state).toBe(
    "INPUT_VALIDATED",
  );
  accountChanged();
  expect(await repo.nextWake(context)).toBeNull();
  controller.stop();
});

it("recovers a cold unexpired claim only after its persisted lease deadline", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-08T00:00:00.000Z"));
  const f = fixture(true);
  const request = await f.submit();
  const context = await captureAccountRequestContext("", f.getAccount);
  const repo = createCaptureProcessingRepository(f.db, f.getAccount, {
    newId: randomUUID,
    sha256,
    now: () => new Date(Date.now()).toISOString(),
  });
  await repo.schedule(context, request.jobId);
  const [first] = await repo.listPending(context);
  await repo.claim(context, first);
  f.reopen();
  const changed = vi.fn();
  const controller = createCaptureProcessingForeground({
    isActive: () => true,
    now: Date.now,
    subscribeAppState: () => () => undefined,
    subscribeAccountChange: () => () => undefined,
    run: () => repo.run(context),
    nextWake: () => repo.nextWake(context),
    changed,
  });
  controller.start();
  await vi.advanceTimersByTimeAsync(299999);
  expect(changed).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1001);
  expect(changed).toHaveBeenCalledTimes(1);
  expect((await repo.events(context, request.jobId)).at(-1)?.state).toBe(
    "INPUT_VALIDATED",
  );
  controller.stop();
});
