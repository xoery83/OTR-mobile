import { expect, it, vi } from "vitest";
import { reopenDefaultCaptureJob } from "./defaultCaptureSubmission";

const state = vi.hoisted(() => ({
  reopen: vi.fn(),
  schedule: vi.fn(),
  scheduleLocal: vi.fn(),
  run: vi.fn(),
  events: vi.fn(),
  start: vi.fn(),
  forbiddenGetter: vi.fn(() => {
    throw new Error("React Native namespace getter was evaluated");
  }),
}));
vi.mock("react-native", () => ({
  AppState: { currentState: "active", addEventListener: () => ({ remove() {} }) },
  get Platform() {
    return state.forbiddenGetter();
  },
}));
vi.mock("expo-crypto", () => ({ randomUUID: vi.fn() }));
vi.mock("@/native/capturePicker", () => ({ pickCaptureMaterial: vi.fn() }));
vi.mock("@/native/captureUriReader", () => ({ openCaptureUriReader: vi.fn() }));
vi.mock("@/data/auth/authRepository", () => ({
  requireActiveUserId: async () => "A",
}));
vi.mock("@/data/db/database", () => ({ openDatabase: async () => undefined }));
vi.mock("@/data/repositories/defaultLocalCaptureInboxRepository", () => ({
  captureStorageDependencies: {},
}));
vi.mock("@/data/repositories/captureSubmissionRepository", () => ({
  createCaptureSubmissionRepository: () => ({ reopen: state.reopen }),
}));
vi.mock("@/data/repositories/captureProcessingRepository", () => ({
  createCaptureProcessingRepository: () => ({
    schedule: state.schedule,
    scheduleLocal: state.scheduleLocal,
    run: state.run,
    events: state.events,
    localEvents: async () => [],
    localResults: async () => [],
    nextWake: async () => null,
  }),
}));
vi.mock("@/data/sync/captureProcessingForeground", () => ({
  createCaptureProcessingForeground: () => ({
    start: state.start,
    refresh: vi.fn(),
    stop: vi.fn(),
  }),
}));
vi.mock("./captureProcessingDevConfig", () => ({
  captureProcessingDevConfig: { accountId: "A", batchId: "batch", jobId: "job" },
}));

it("reopens after a completed DEV run without evaluating unrelated React Native getters", async () => {
  vi.stubGlobal("__DEV__", true);
  state.reopen.mockResolvedValue({
    batch: { accountId: "A", batchId: "batch", jobId: "job" },
    processing: { capability: "NOT_INSTALLED" },
  });
  state.run.mockResolvedValue({ processedCount: 2 });
  state.events.mockResolvedValue([
    { inputId: "one", sequence: 1, state: "INPUT_VALIDATED" },
  ]);
  const job = await reopenDefaultCaptureJob("job");
  expect(state.schedule).toHaveBeenCalledTimes(1);
  expect(state.start).toHaveBeenCalledTimes(1);
  expect(job.processing.capability).toBe("LOCAL_VALIDATION");
  expect(job.processingEvents).toHaveLength(1);
  expect(state.forbiddenGetter).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});
