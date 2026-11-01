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
  getDefaultLocalCaptureInboxRepository: async () => ({}),
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
