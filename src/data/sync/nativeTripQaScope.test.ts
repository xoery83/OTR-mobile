import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { advanceAccountGeneration } from "../auth/accountGeneration";
import {
  filterNativeTripQaList,
  nativeTripQaCreateFormat,
  hasNativeTripQaScope,
  runNativeTripQaSync,
  getNativeTripQaQueueActivity,
  nativeTripAuthoredCloudTravelers,
} from "./nativeTripQaScope";

const a = "10000000-0000-4000-8000-000000000001";
const trip = "10000000-0000-4000-8000-000000000002";
const create = "10000000-0000-4000-8000-000000000003";
const edit = "10000000-0000-4000-8000-000000000004";
const state = vi.hoisted(() => ({
  account: "10000000-0000-4000-8000-000000000001",
  create: vi.fn(),
  edit: vi.fn(),
  createFactory: vi.fn(),
  editFactory: vi.fn(),
  normal: vi.fn(),
  normalFactory: vi.fn(),
  session: vi.fn(),
  activity: vi.fn(),
  database: {},
}));
vi.mock("../auth/authRepository", () => ({
  requireActiveUserId: async () => state.account,
  readLocalSession: state.session,
}));
vi.mock("./transportSelection", () => ({
  getSyncTransportMode: () => process.env.EXPO_PUBLIC_OTR_SYNC_TRANSPORT ?? "fake",
}));
vi.mock("./tripCreateCoordinator", () => ({
  createNativeTripCreateSyncRunner: state.createFactory,
}));
vi.mock("./tripMetadataCoordinator", () => ({
  createNativeTripMetadataSyncRunner: state.editFactory,
}));
vi.mock("./tripNormalCoordinator", () => ({
  createNativeNormalTripSyncRunner: state.normalFactory,
}));
vi.mock("../db/database", () => ({
  readInitializedDatabase: async () => state.database,
}));
vi.mock("./tripNormalQueueActivity", () => ({
  getNormalTripQueueActivity: state.activity,
}));
const fixture = () => ({
  version: 1,
  accountId: a,
  startsAt: "2026-10-23T03:00:00Z",
  expiresAt: "2026-10-23T03:15:00Z",
  creates: [{ tripId: trip, operationId: create }],
  edits: [{ tripId: trip, operationId: edit }],
});
beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-23T03:01:00Z"));
  state.account = a;
  state.normalFactory.mockReturnValue(state.normal);
  state.activity.mockResolvedValue({ actionableNow: 0, nextActionableAt: null });
  state.session.mockResolvedValue({
    accessToken: "synthetic",
    expiresAt: "2026-10-23T04:00:00Z",
  });
  state.create.mockResolvedValue({ processedCount: 1 });
  state.edit.mockResolvedValue({ processedCount: 1 });
  state.createFactory.mockReturnValue(state.create);
  state.editFactory.mockReturnValue(state.edit);
  vi.stubEnv("EXPO_PUBLIC_OTR_SYNC_TRANSPORT", "dev");
  vi.stubEnv("EXPO_PUBLIC_OTR_API_BASE_URL", "https://api-dev.xoery.art");
  vi.stubEnv("EXPO_PUBLIC_OTR_NATIVE_QA_SCOPE", JSON.stringify(fixture()));
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});
it("is closed by default and cannot construct a runner", async () => {
  vi.stubEnv("EXPO_PUBLIC_OTR_NATIVE_QA_SCOPE", "");
  expect(hasNativeTripQaScope()).toBe(false);
  expect(await runNativeTripQaSync()).toBeNull();
  expect(state.createFactory).not.toHaveBeenCalled();
});
it.each([
  "{",
  JSON.stringify({ ...fixture(), expiresAt: "2026-10-23T03:16:00Z" }),
  JSON.stringify({ ...fixture(), edits: fixture().creates }),
])("quarantines historical queues for invalid config %s", async (raw) => {
  vi.stubEnv("EXPO_PUBLIC_OTR_NATIVE_QA_SCOPE", raw);
  expect(hasNativeTripQaScope()).toBe(true);
  expect(await runNativeTripQaSync()).toBeNull();
  expect(state.createFactory).not.toHaveBeenCalled();
});
it.each(["2026-10-23T02:59:59Z", "2026-10-23T03:15:00Z"])(
  "does not dispatch outside its exact finite window %s",
  async (time) => {
    vi.setSystemTime(new Date(time));
    expect(await runNativeTripQaSync()).toBeNull();
    expect(hasNativeTripQaScope()).toBe(true);
    expect(state.createFactory).not.toHaveBeenCalled();
  },
);
it.each(["fake", "other"])("rejects transport %s", async (mode) => {
  vi.stubEnv("EXPO_PUBLIC_OTR_SYNC_TRANSPORT", mode);
  expect(await runNativeTripQaSync()).toBeNull();
  expect(state.createFactory).not.toHaveBeenCalled();
});
it("rejects another API host and another Account", async () => {
  vi.stubEnv("EXPO_PUBLIC_OTR_API_BASE_URL", "https://production.example.invalid");
  expect(await runNativeTripQaSync()).toBeNull();
  vi.stubEnv("EXPO_PUBLIC_OTR_API_BASE_URL", "https://api-dev.xoery.art");
  state.account = "10000000-0000-4000-8000-000000000009";
  expect(await runNativeTripQaSync()).toBeNull();
  expect(state.createFactory).not.toHaveBeenCalled();
});
it("passes only exact approved targets to the existing coordinators, Create first", async () => {
  const result = await runNativeTripQaSync();
  expect(result).toMatchObject({ accountId: a, journeyIds: [trip] });
  expect(state.createFactory).toHaveBeenCalledWith(
    { accountId: a, tripId: trip, operationId: create },
    expect.any(Function),
    null,
  );
  expect(state.editFactory).toHaveBeenCalledWith(
    expect.any(Function),
    { accountId: a, tripId: trip, operationId: edit },
    null,
  );
  expect(state.createFactory.mock.invocationCallOrder[0]).toBeLessThan(
    state.editFactory.mock.invocationCallOrder[0],
  );
});
it("stops after expiry across an awaited Create, without entering Edit", async () => {
  state.create.mockImplementationOnce(async () => {
    vi.setSystemTime(new Date("2026-10-23T03:15:00Z"));
  });
  expect(await runNativeTripQaSync()).toBeNull();
  expect(state.editFactory).not.toHaveBeenCalled();
  expect(state.createFactory.mock.calls[0][1]()).toBe(false);
});
it("retains the actual previous claim timestamp when a reconciled operation is explicitly resumed", async () => {
  const config = fixture();
  const lastAttemptAt = "2026-10-23T02:50:00Z";
  vi.stubEnv(
    "EXPO_PUBLIC_OTR_NATIVE_QA_SCOPE",
    JSON.stringify({
      ...config,
      creates: [{ ...config.creates[0], lastAttemptAt }],
    }),
  );
  await runNativeTripQaSync();
  expect(state.createFactory).toHaveBeenCalledWith(
    { accountId: a, tripId: trip, operationId: create },
    expect.any(Function),
    lastAttemptAt,
  );
});
it("rejects an Account ABA while Create is pending", async () => {
  state.create.mockImplementationOnce(async () => {
    advanceAccountGeneration();
    advanceAccountGeneration();
  });
  await expect(runNativeTripQaSync()).rejects.toThrow("Account changed");
  expect(state.editFactory).not.toHaveBeenCalled();
});

it("filters only the configured Account view without deleting/relabeling historical values", () => {
  const rows = [
    { id: trip, localStatus: "PENDING" },
    { id: "historical", localStatus: "PENDING" },
  ];
  vi.setSystemTime(new Date("2026-10-23T04:00:00Z"));
  expect(filterNativeTripQaList(a, rows)).toEqual([rows[0]]);
  expect(filterNativeTripQaList("another-account", rows)).toBe(rows);
  expect(rows[1]).toEqual({ id: "historical", localStatus: "PENDING" });
  vi.stubEnv("EXPO_PUBLIC_OTR_NATIVE_QA_SCOPE", "");
  expect(filterNativeTripQaList(a, rows)).toBe(rows);
});

it("opts in only new local creates for the configured Account, without opening dispatch", async () => {
  vi.setSystemTime(new Date("2026-10-23T04:00:00Z"));
  expect(nativeTripQaCreateFormat(a)).toBe(2);
  expect(nativeTripQaCreateFormat("another-account")).toBeUndefined();
  expect(nativeTripQaCreateFormat(null)).toBeUndefined();
  expect(await runNativeTripQaSync()).toBeNull();
  expect(state.createFactory).not.toHaveBeenCalled();
  vi.stubEnv("EXPO_PUBLIC_OTR_NATIVE_QA_SCOPE", "");
  expect(nativeTripQaCreateFormat(a)).toBeUndefined();
});

it("keeps new owning V2 local creates visible after expiry while historical pending stays quarantined", async () => {
  vi.setSystemTime(new Date("2026-10-24T04:00:00Z"));
  const rows = [
    { id: trip },
    {
      id: "historical",
      syncFormatVersion: 2 as const,
      createdAt: "2026-10-22T00:00:00Z",
    },
    { id: "new-local", syncFormatVersion: 2 as const, createdAt: "2026-10-24T00:00:00Z" },
    { id: "legacy", createdAt: "2026-10-24T00:00:00Z" },
    { id: "invalid-date", syncFormatVersion: 2 as const, createdAt: "invalid" },
  ];
  expect(filterNativeTripQaList(a, rows).map((v) => v.id)).toEqual([trip, "new-local"]);
  expect(filterNativeTripQaList("other", rows)).toBe(rows);
  expect(await runNativeTripQaSync()).toBeNull();
  expect(state.createFactory).not.toHaveBeenCalled();
  expect(state.editFactory).not.toHaveBeenCalled();
});

it("keeps view isolation stable across later finite operation windows", async () => {
  const scope = JSON.parse(process.env.EXPO_PUBLIC_OTR_NATIVE_QA_SCOPE!);
  scope.viewIsolationStartedAt = "2026-10-23T05:45:23.954Z";
  scope.startsAt = "2026-10-24T04:00:00Z";
  scope.expiresAt = "2026-10-24T04:15:00Z";
  scope.creates = [];
  scope.edits = [];
  vi.stubEnv("EXPO_PUBLIC_OTR_NATIVE_QA_SCOPE", JSON.stringify(scope));
  const rows = [
    {
      id: "old-success",
      syncFormatVersion: 2 as const,
      createdAt: "2026-10-23T05:45:23.954Z",
    },
    {
      id: "new-success",
      syncFormatVersion: 2 as const,
      createdAt: "2026-10-23T18:34:01.964Z",
    },
    {
      id: "historical",
      syncFormatVersion: 2 as const,
      createdAt: "2026-10-22T00:00:00Z",
    },
  ];
  expect(filterNativeTripQaList(a, rows).map((v) => v.id)).toEqual([
    "old-success",
    "new-success",
  ]);
  vi.setSystemTime(new Date("2026-10-25T00:00:00Z"));
  expect(await runNativeTripQaSync()).toBeNull();
  expect(state.createFactory).not.toHaveBeenCalled();
});
it("reuses the existing scoped lifecycle for an explicit bounded normal profile only", async () => {
  const config = {
    ...fixture(),
    expiresAt: "2026-10-24T03:00:00Z",
    normal: { newTripsFrom: "2026-10-23T03:00:00Z" },
    creates: [],
    edits: [],
  };
  vi.stubEnv("EXPO_PUBLIC_OTR_NATIVE_QA_SCOPE", JSON.stringify(config));
  await runNativeTripQaSync();
  expect(state.normalFactory).toHaveBeenCalledWith(
    { accountId: a, newTripsFrom: config.normal.newTripsFrom },
    expect.any(Function),
  );
  expect(state.normal).toHaveBeenCalledWith("AUTHENTICATED_ONLINE");
  expect(state.createFactory).not.toHaveBeenCalled();
  expect(state.editFactory).not.toHaveBeenCalled();
});
it.each(["overlong", "mixed"])(
  "keeps invalid %s normal profile closed without falling through to history",
  async (kind) => {
    vi.stubEnv(
      "EXPO_PUBLIC_OTR_NATIVE_QA_SCOPE",
      JSON.stringify({
        ...fixture(),
        expiresAt: kind === "overlong" ? "2026-10-24T03:00:01Z" : "2026-10-24T03:00:00Z",
        normal: { newTripsFrom: "2026-10-23T03:00:00Z" },
        creates: kind === "mixed" ? fixture().creates : [],
        edits: [],
      }),
    );
    expect(hasNativeTripQaScope()).toBe(true);
    expect(await runNativeTripQaSync()).toBeNull();
    expect(state.normalFactory).not.toHaveBeenCalled();
  },
);

it("keeps finite targets unscheduled while normal retries use the owning selector", async () => {
  expect(await getNativeTripQaQueueActivity()).toEqual({
    actionableNow: 0,
    nextActionableAt: null,
  });
  expect(state.activity).not.toHaveBeenCalled();
  const scope = {
    ...fixture(),
    normal: { newTripsFrom: fixture().startsAt },
    creates: [],
    edits: [],
  };
  vi.stubEnv("EXPO_PUBLIC_OTR_NATIVE_QA_SCOPE", JSON.stringify(scope));
  state.activity.mockResolvedValue({ actionableNow: 1, nextActionableAt: null });
  expect(await getNativeTripQaQueueActivity()).toEqual({
    actionableNow: 1,
    nextActionableAt: null,
  });
  expect(state.activity).toHaveBeenCalledWith(state.database, {
    accountId: a,
    newTripsFrom: scope.normal.newTripsFrom,
  });
});
it("does not schedule normal work with an expired offline token", async () => {
  vi.stubEnv(
    "EXPO_PUBLIC_OTR_NATIVE_QA_SCOPE",
    JSON.stringify({
      ...fixture(),
      normal: { newTripsFrom: fixture().startsAt },
      creates: [],
      edits: [],
    }),
  );
  state.session.mockResolvedValue({
    accessToken: "synthetic",
    expiresAt: "2026-10-23T03:00:00Z",
  });
  expect(await getNativeTripQaQueueActivity()).toEqual({
    actionableNow: 0,
    nextActionableAt: null,
  });
  expect(state.activity).not.toHaveBeenCalled();
});
it("rejects Account changes across the normal activity read", async () => {
  vi.stubEnv(
    "EXPO_PUBLIC_OTR_NATIVE_QA_SCOPE",
    JSON.stringify({
      ...fixture(),
      normal: { newTripsFrom: fixture().startsAt },
      creates: [],
      edits: [],
    }),
  );
  state.activity.mockImplementationOnce(async () => {
    state.account = "20000000-0000-4000-8000-000000000001";
    return { actionableNow: 1, nextActionableAt: null };
  });
  await expect(getNativeTripQaQueueActivity()).rejects.toThrow("Account changed");
});

it("sustained adoption has no Trip targets or expiring dispatch window", async () => {
  const scope = {
    version: 2,
    accountId: a,
    normal: { newTripsFrom: "2026-10-23T03:00:00Z" },
  };
  vi.stubEnv("EXPO_PUBLIC_OTR_NATIVE_QA_SCOPE", JSON.stringify(scope));
  vi.setSystemTime(new Date("2027-10-24T00:00:00Z"));
  state.session.mockResolvedValue({
    accessToken: "synthetic",
    expiresAt: "2027-10-24T01:00:00Z",
  });
  state.normal.mockResolvedValue({ tripIds: [trip] });
  expect(nativeTripAuthoredCloudTravelers(a)).toBe(true);
  expect(nativeTripAuthoredCloudTravelers("other")).toBe(false);
  expect(await runNativeTripQaSync()).toMatchObject({ accountId: a, journeyIds: [trip] });
  expect(state.normal).toHaveBeenCalledWith("AUTHENTICATED_ONLINE");
  expect(state.createFactory).not.toHaveBeenCalled();
  expect(state.editFactory).not.toHaveBeenCalled();
});
it.each(["expiresAt", "creates", "actorAccountId"])(
  "rejects mixed sustained field %s without draining history",
  async (field) => {
    vi.stubEnv(
      "EXPO_PUBLIC_OTR_NATIVE_QA_SCOPE",
      JSON.stringify({
        version: 2,
        accountId: a,
        normal: { newTripsFrom: fixture().startsAt },
        [field]: field === "creates" ? [] : fixture().expiresAt,
      }),
    );
    expect(hasNativeTripQaScope()).toBe(true);
    expect(nativeTripAuthoredCloudTravelers(a)).toBe(false);
    expect(await runNativeTripQaSync()).toBeNull();
    expect(state.normal).not.toHaveBeenCalled();
  },
);
