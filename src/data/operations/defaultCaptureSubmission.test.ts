import { beforeEach, expect, it, vi } from "vitest";
import {
  advanceAccountGeneration,
  getAccountGeneration,
} from "@/data/auth/accountGeneration";
import {
  assertAccountRequestContext,
  type AccountRequestContext,
} from "@/data/auth/accountRequestContext";
import {
  listDefaultCaptureJobs,
  reopenDefaultCaptureJob,
  createDefaultCaptureSubmissionSession,
  getDefaultCaptureSubmissionDependencies,
} from "./defaultCaptureSubmission";

const state = vi.hoisted(() => ({
  account: "A",
  open: vi.fn(),
  list: vi.fn(),
  reopen: vi.fn(),
  handoff: vi.fn(),
  session: vi.fn(),
  uri: vi.fn(),
}));
vi.mock("expo-crypto", () => ({ randomUUID: vi.fn() }));
vi.mock("react-native", () => ({
  AppState: { currentState: "active", addEventListener: () => ({ remove() {} }) },
}));
vi.mock("@/native/capturePicker", () => ({ pickCaptureMaterial: vi.fn() }));
vi.mock("@/native/captureUriReader", () => ({ openCaptureUriReader: state.uri }));
vi.mock("./captureSubmission", () => ({
  createCaptureSubmissionSession: state.session,
  createCaptureRecoveryAction: vi.fn(),
}));
vi.mock("@/data/auth/authRepository", () => ({
  requireActiveUserId: async () => state.account,
}));
vi.mock("@/data/db/database", () => ({ openDatabase: state.open }));
vi.mock("@/data/repositories/defaultLocalCaptureInboxRepository", () => ({
  captureStorageDependencies: {},
  getDefaultLocalCaptureInboxRepository: async () => ({ getForSourceHandoff: state.handoff }),
}));
vi.mock("@/data/repositories/captureSubmissionRepository", () => ({
  createCaptureSubmissionRepository: () => ({ list: state.list, reopen: state.reopen }),
}));
vi.mock("@/data/repositories/captureProcessingRepository", () => ({
  createCaptureProcessingRepository: () => ({
    events: async () => [],
    localEvents: async () => [],
    localResults: async () => [],
  }),
}));
beforeEach(() => {
  vi.resetAllMocks();
  state.account = "A";
});

it("shared dependency extraction preserves URI reading and original session context/lineage arguments", async () => {
  const context = { accountId: "A", tripId: "trip", generation: getAccountGeneration() };
  const lineage = { "original-input": 7 };
  const reader = { read: vi.fn(), close: vi.fn() };
  state.uri.mockResolvedValue(reader);
  const deps = await getDefaultCaptureSubmissionDependencies();
  expect(
    await deps.open({
      source: "files",
      temporaryUri: "file:///fixture.txt",
      name: "fixture.txt",
      typeHint: "text/plain",
    }),
  ).toEqual({ reader });
  expect(state.uri).toHaveBeenCalledExactlyOnceWith("file:///fixture.txt");
  await createDefaultCaptureSubmissionSession(context, lineage);
  expect(state.session.mock.calls[0][0]).toMatchObject({
    context,
    lineageRevisions: lineage,
  });
  expect(state.session.mock.calls[0][0].context).toBe(context);
  expect(state.session.mock.calls[0][0].lineageRevisions).toBe(lineage);
});
it.each(["list", "reopen"] as const)(
  "%s binds invocation before DB initialization and rejects A→B→A without refreshing generation",
  async (action) => {
    let release!: () => void;
    state.open.mockImplementationOnce(
      () =>
        new Promise<void>((done) => {
          release = done;
        }),
    );
    const repoAction = action === "list" ? state.list : state.reopen;
    repoAction.mockImplementation(
      async (_argument: unknown, context: AccountRequestContext) => {
        await assertAccountRequestContext(context, async () => state.account);
        return action === "list"
          ? []
          : {
              batch: { jobId: "same-job", context: { tripPrior: null } },
              allInputsAccepted: false,
              processing: { capability: "NOT_INSTALLED" },
            };
      },
    );
    const generation = getAccountGeneration();
    const pending =
      action === "list"
        ? listDefaultCaptureJobs({ limit: 1 })
        : reopenDefaultCaptureJob("same-job");
    const denied = expect(pending).rejects.toThrow("Account changed");
    await vi.waitFor(() => expect(release).toBeTypeOf("function"));
    state.account = "B";
    advanceAccountGeneration();
    state.account = "A";
    advanceAccountGeneration();
    release();
    await denied;
    expect(repoAction.mock.calls[0][1]).toEqual({
      accountId: "A",
      generation,
      tripId: "",
    });
    state.open.mockResolvedValueOnce(undefined);
    await (action === "list"
      ? listDefaultCaptureJobs({ limit: 1 })
      : reopenDefaultCaptureJob("same-job"));
    expect(repoAction.mock.lastCall![1].generation).toBe(getAccountGeneration());
    expect(repoAction.mock.lastCall![0]).toEqual(
      action === "list" ? { limit: 1 } : "same-job",
    );
  },
);


it.each([true, false])("projects only verified retained assignment while leaving frozen intake unchanged: %s", async (matching) => {
  const job = {
    batch: { jobId: "retained-job", accountId: "A", context: { tripPrior: null } },
    inputs: [{ id: "input", captureId: "capture", payloadId: "payload", contentSha256: "a".repeat(64), contentByteCount: 3, state: "ACCEPTED" }],
    allInputsAccepted: true,
    processing: { capability: "NOT_INSTALLED" },
  };
  state.open.mockResolvedValue(undefined);
  state.list.mockResolvedValue([job]);
  state.handoff.mockResolvedValue({ capture: { accountId: "A", id: "capture", payloadId: "payload", sha256: (matching ? "a" : "b").repeat(64), byteCount: 3, tripId: "retained-trip" } });
  const [read] = await listDefaultCaptureJobs({ limit: 1 });
  expect(read.assignedTripId).toBe(matching ? "retained-trip" : null);
  expect(read.batch).toEqual(job.batch);
  expect(read.batch.context.tripPrior).toBeNull();
  expect(state.handoff).toHaveBeenCalledExactlyOnceWith("capture");
});

it("bounds retained original reads across jobs to one and preserves list order", async () => {
  await import("./captureJobAssignment");
  await import("../repositories/defaultLocalCaptureInboxRepository");
  const jobs = ["first", "second"].map((id) => ({
    batch: { jobId: id, accountId: "A", context: { tripPrior: null } },
    inputs: [{ id, captureId: id, payloadId: id, contentSha256: "a".repeat(64), contentByteCount: 3, state: "ACCEPTED" }],
    allInputsAccepted: true,
    processing: { capability: "NOT_INSTALLED" },
  }));
  state.open.mockResolvedValue(undefined);
  state.list.mockResolvedValue(jobs);
  let inFlight = 0, maximum = 0;
  state.handoff.mockImplementation(async (id: string) => {
    maximum = Math.max(maximum, ++inFlight);
    await new Promise((resolve) => setTimeout(resolve, 20));
    inFlight--;
    return { capture: { accountId: "A", id, payloadId: id, sha256: "a".repeat(64), byteCount: 3, tripId: "retained-trip" } };
  });
  const results = await listDefaultCaptureJobs({ limit: 2 });
  expect(maximum).toBe(1);
  expect(results.map((job) => job.batch.jobId)).toEqual(["first", "second"]);
  expect(results.map((job) => job.assignedTripId)).toEqual(["retained-trip", "retained-trip"]);
  expect(state.handoff.mock.calls.map(([id]) => id)).toEqual(["first", "second"]);
});
