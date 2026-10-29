import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ApiClientError } from "../api/client";
import { advanceAccountGeneration } from "../auth/accountGeneration";
import {
  filterNativeTripQaList,
  nativeTripQaCreateFormat,
  nativeTripQaFormalManualFlightScope,
  hasNativeTripQaScope,
  runNativeTripQaSync,
  getNativeTripQaQueueActivity,
  nativeTripAuthoredCloudTravelers,
  readNativeTripQaDiagnostic,
  isGeneralAccountCloudSyncEnabled,
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
  enroll: vi.fn(),
  confirm: vi.fn(),
  principalKind: "ACCOUNT",
  session: vi.fn(),
  token: vi.fn(),
  activity: vi.fn(),
  database: { getAllAsync: vi.fn() },
}));
vi.mock("./ledgerOperationalSync", () => ({
  isLedgerOperationalSyncPaused: () => false,
}));
vi.mock("../auth/authRepository", () => ({
  requireActiveUserId: async () => state.account,
  readCommittedLocalPrincipal: async () => ({
    kind: state.principalKind,
    accountId: state.account,
  }),
  readLocalSession: state.session,
}));
vi.mock("../auth/sessionAccessToken", () => ({
  sessionAccessToken: state.token,
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
vi.mock("../repositories/tripRepository", () => ({
  readLocalTripRepository: async () => ({ enrollUnsentStructuredTrips: state.enroll }),
}));
vi.mock("./tripNormalCoordinator", () => ({
  createNativeNormalTripSyncRunner: state.normalFactory,
}));
vi.mock("../repositories/tripPersonCloudCreateRepository", () => ({
  createTripPersonCloudCreateRepository: () => ({ confirmLocalShared: state.confirm }),
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
  state.principalKind = "ACCOUNT";
  state.database.getAllAsync.mockResolvedValue([]);
  state.normalFactory.mockReturnValue(state.normal);
  state.enroll.mockResolvedValue(0);
  state.activity.mockResolvedValue({
    actionableNow: 0,
    nextActionableAt: null,
  });
  state.token.mockResolvedValue({ token: "synthetic", userId: a });
  state.session.mockResolvedValue({
    accessToken: "synthetic",
    identity: { userId: a },
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
it("reports only gate and own fresh-Trip metadata without payload, token refresh or dispatch", async () => {
  vi.stubEnv(
    "EXPO_PUBLIC_OTR_NATIVE_QA_SCOPE",
    JSON.stringify({
      version: 2,
      accountId: a,
      normal: { newTripsFrom: "2026-10-23T03:00:00Z" },
    }),
  );
  state.database.getAllAsync.mockResolvedValue([
    {
      trip_id: trip,
      id: create,
      created_at: "2026-10-23T03:01:00Z",
      payload_json: JSON.stringify({
        formatVersion: 2,
        name: "PRIVATE_PAYLOAD_SENTINEL",
      }),
      status: "RETRYABLE",
      attempt_count: 1,
      failure_category: "NETWORK",
      last_error_code: "NATIVE_SECRET_SENTINEL / token",
    },
  ]);
  const result = await readNativeTripQaDiagnostic();
  expect(result.gate).toMatchObject({
    parsed: true,
    version: 2,
    accountMatches: true,
    enabled: true,
    sessionState: "AUTHENTICATED_ONLINE",
    paused: false,
  });
  expect(result.creates).toEqual([
    {
      tripId: trip,
      operationId: create,
      createdAt: "2026-10-23T03:01:00Z",
      formatVersion: 2,
      status: "RETRYABLE",
      attempts: 1,
      failureCategory: "NETWORK",
      errorCode: null,
    },
  ]);
  expect(JSON.stringify(result)).not.toMatch(
    /PRIVATE_PAYLOAD_SENTINEL|NATIVE_SECRET_SENTINEL/,
  );
  expect(state.database.getAllAsync.mock.calls[0]).toEqual([
    expect.stringMatching(/^SELECT /),
    a,
    "2026-10-23T03:00:00Z",
  ]);
  expect(state.token).not.toHaveBeenCalled();
  expect(state.normalFactory).not.toHaveBeenCalled();
});
it("bounds diagnostic command reads to the current adopted Account without payloads", async () => {
  vi.stubEnv(
    "EXPO_PUBLIC_OTR_NATIVE_QA_SCOPE",
    JSON.stringify({
      version: 2,
      accountId: a,
      normal: { newTripsFrom: "2026-10-23T03:00:00Z" },
    }),
  );
  state.database.getAllAsync.mockResolvedValueOnce([]).mockResolvedValueOnce([
    {
      id: create,
      entity_id: trip,
      operation_type: "CORE_V2_COMMAND",
      status: "RETRYABLE",
      attempt_count: 2,
      last_error_code: "UNTRUSTED / token",
      failure_category: "NETWORK",
      next_attempt_at: "2026-10-23T03:02:00Z",
      payload_json: "PRIVATE_PAYLOAD_SENTINEL",
    },
  ]);
  const result = await readNativeTripQaDiagnostic();
  expect(result.operations).toEqual([
    {
      operationId: create,
      itemId: trip,
      type: "CORE_V2_COMMAND",
      selection: { valid: false },
      status: "RETRYABLE",
      attempts: 2,
      errorCode: null,
      failureCategory: "NETWORK",
      nextAttemptAt: "2026-10-23T03:02:00Z",
    },
  ]);
  expect(state.database.getAllAsync.mock.calls[1]).toEqual([
    expect.stringMatching(/trip.account_id=\? .*LIMIT 12$/),
    a,
    "2026-10-23T03:00:00Z",
  ]);
  expect(JSON.stringify(result)).not.toMatch(/PRIVATE_PAYLOAD_SENTINEL|UNTRUSTED/);
  expect(state.normalFactory).not.toHaveBeenCalled();
});
it("does not inspect queues for an invalid scope or another active Account", async () => {
  vi.stubEnv("EXPO_PUBLIC_OTR_NATIVE_QA_SCOPE", "{}");
  expect((await readNativeTripQaDiagnostic()).gate.parsed).toBe(false);
  vi.stubEnv(
    "EXPO_PUBLIC_OTR_NATIVE_QA_SCOPE",
    JSON.stringify({
      version: 2,
      accountId: a,
      normal: { newTripsFrom: "2026-10-23T03:00:00Z" },
    }),
  );
  state.session.mockResolvedValue({
    accessToken: "SYNTHETIC",
    expiresAt: "2026-10-24T03:00:00Z",
    identity: { userId: trip },
  });
  expect((await readNativeTripQaDiagnostic()).gate.accountMatches).toBe(false);
  expect(state.database.getAllAsync).not.toHaveBeenCalled();
});
it("discards a diagnostic queue read after an Account generation change", async () => {
  vi.stubEnv(
    "EXPO_PUBLIC_OTR_NATIVE_QA_SCOPE",
    JSON.stringify({
      version: 2,
      accountId: a,
      normal: { newTripsFrom: "2026-10-23T03:00:00Z" },
    }),
  );
  state.database.getAllAsync.mockImplementationOnce(async () => {
    advanceAccountGeneration();
    return [];
  });
  await expect(readNativeTripQaDiagnostic()).rejects.toThrow("Account changed");
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
it("can retain existing local Trip views without admitting their historical queues", async () => {
  const cutoff = "2026-10-23T03:00:00Z";
  vi.stubEnv(
    "EXPO_PUBLIC_OTR_NATIVE_QA_SCOPE",
    JSON.stringify({
      version: 2,
      accountId: a,
      normal: { newTripsFrom: cutoff },
      preserveLocalTripViews: true,
    }),
  );
  const retained = [{ id: trip, createdAt: "2026-10-01T00:00:00Z" }];
  expect(filterNativeTripQaList(a, retained)).toEqual(retained);
  await runNativeTripQaSync();
  expect(state.normalFactory).toHaveBeenCalledWith(
    { accountId: a, newTripsFrom: cutoff },
    expect.any(Function),
    false,
  );
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
    {
      id: "new-local",
      syncFormatVersion: 2 as const,
      createdAt: "2026-10-24T00:00:00Z",
    },
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
    false,
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
  state.activity.mockResolvedValue({
    actionableNow: 1,
    nextActionableAt: null,
  });
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
    identity: { userId: a },
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
    identity: { userId: a },
    expiresAt: "2027-10-24T01:00:00Z",
  });
  state.normal.mockResolvedValue({ tripIds: [trip] });
  expect(nativeTripAuthoredCloudTravelers(a)).toBe(true);
  expect(nativeTripAuthoredCloudTravelers("other")).toBe(false);
  expect(await runNativeTripQaSync()).toMatchObject({
    accountId: a,
    journeyIds: [trip],
  });
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

const sustainedScope = () =>
  vi.stubEnv(
    "EXPO_PUBLIC_OTR_NATIVE_QA_SCOPE",
    JSON.stringify({
      version: 2,
      accountId: a,
      normal: { newTripsFrom: fixture().startsAt },
    }),
  );
it("refreshes expired session with the existing provider before normal dispatch and scheduling", async () => {
  sustainedScope();
  let session = {
    accessToken: "expired",
    identity: { userId: a },
    expiresAt: "2026-10-23T03:00:00Z",
  };
  state.session.mockImplementation(async () => session);
  state.token.mockImplementation(async (request) => {
    expect(request).toEqual({ expectedUserId: a });
    session = {
      ...session,
      accessToken: "refreshed",
      expiresAt: "2026-10-23T04:00:00Z",
    };
    return { token: "refreshed", userId: a };
  });
  state.normal.mockResolvedValue({ tripIds: [trip] });
  expect(await runNativeTripQaSync()).toMatchObject({ journeyIds: [trip] });
  expect(state.normal).toHaveBeenCalledWith("AUTHENTICATED_ONLINE");
  state.activity.mockResolvedValue({
    actionableNow: 1,
    nextActionableAt: null,
  });
  expect(await getNativeTripQaQueueActivity()).toEqual({
    actionableNow: 1,
    nextActionableAt: null,
  });
  expect(state.token).toHaveBeenCalledTimes(2);
});
it("refresh network failure pauses normal work without mutation or a signed-out state", async () => {
  sustainedScope();
  const cached = {
    accessToken: "expired",
    identity: { userId: a },
    expiresAt: "2026-10-23T03:00:00Z",
  };
  state.session.mockResolvedValue(cached);
  state.token.mockRejectedValue(
    new ApiClientError(
      "network unavailable",
      "network",
      undefined,
      "AUTH_REFRESH_UNAVAILABLE",
    ),
  );
  expect(await runNativeTripQaSync()).toBeNull();
  expect(await getNativeTripQaQueueActivity()).toEqual({
    actionableNow: 0,
    nextActionableAt: null,
  });
  expect(state.normalFactory).not.toHaveBeenCalled();
  expect(state.activity).not.toHaveBeenCalled();
  expect(await state.session()).toBe(cached);
});
it("fences Account switch or same-Account generation replacement during refresh", async () => {
  for (const switchIdentity of [false, true]) {
    sustainedScope();
    state.account = a;
    state.token.mockImplementationOnce(async () => {
      if (switchIdentity) state.account = "20000000-0000-4000-8000-000000000001";
      advanceAccountGeneration();
      return { token: "other", userId: state.account };
    });
    await expect(runNativeTripQaSync()).rejects.toThrow();
    expect(state.normalFactory).not.toHaveBeenCalled();
  }
});

it("preserves explicit auth-required rejection instead of treating invalid sessions as ordinary expiry", async () => {
  sustainedScope();
  const rejected = new ApiClientError(
    "invalid refresh session",
    "http",
    401,
    "AUTH_REQUIRED",
  );
  state.token.mockRejectedValue(rejected);
  await expect(runNativeTripQaSync()).rejects.toBe(rejected);
  expect(state.normalFactory).not.toHaveBeenCalled();
});

it("formal Manual P2 requires explicit flag and matching sustained normal scope; no Source/finite/Account fallback", () => {
  sustainedScope();
  vi.stubEnv("EXPO_PUBLIC_OTR_MANUAL_P2_FORMAL_ENABLED", "false");
  expect(nativeTripQaFormalManualFlightScope(a)).toBeNull();
  vi.stubEnv("EXPO_PUBLIC_OTR_MANUAL_P2_FORMAL_ENABLED", "true");
  expect(nativeTripQaFormalManualFlightScope(a)).toMatchObject({
    accountId: a,
  });
  expect(nativeTripQaFormalManualFlightScope(trip)).toBeNull();
  vi.stubEnv("EXPO_PUBLIC_OTR_NATIVE_QA_SCOPE", JSON.stringify(fixture()));
  expect(nativeTripQaFormalManualFlightScope(a)).toBeNull();
  sustainedScope();
  vi.stubEnv("EXPO_PUBLIC_OTR_SYNC_TRANSPORT", "fake");
  expect(nativeTripQaFormalManualFlightScope(a)).toBeNull();
});

it("formal P2 uses max of existing normal cutoff and its frozen cohort without changing P1 scope", () => {
  sustainedScope();
  vi.stubEnv("EXPO_PUBLIC_OTR_MANUAL_P2_FORMAL_ENABLED", "true");
  const original = process.env.EXPO_PUBLIC_OTR_NATIVE_QA_SCOPE;
  expect(nativeTripQaFormalManualFlightScope(a)?.newTripsFrom).toBe(
    "2026-10-28T02:16:48.000Z",
  );
  expect(process.env.EXPO_PUBLIC_OTR_NATIVE_QA_SCOPE).toBe(original);
  vi.stubEnv(
    "EXPO_PUBLIC_OTR_NATIVE_QA_SCOPE",
    JSON.stringify({
      version: 2,
      accountId: a,
      normal: { newTripsFrom: "2026-11-01T00:00:00Z" },
    }),
  );
  expect(nativeTripQaFormalManualFlightScope(a)?.newTripsFrom).toBe(
    "2026-11-01T00:00:00.000Z",
  );
});

const b = "20000000-0000-4000-8000-000000000001";
const c = "30000000-0000-4000-8000-000000000001";
const ownerRollout = () => ({
  version: 2,
  accountId: a,
  normal: { newTripsFrom: "2026-10-23T03:00:00Z" },
  preserveLocalTripViews: true,
  additionalAccounts: [
    {
      accountId: b,
      recoverUnsentLegacyTrips: true,
      normal: { newTripsFrom: "2026-10-22T03:00:00Z" },
    },
    {
      accountId: c,
      recoverUnsentLegacyTrips: true,
      normal: { newTripsFrom: "2026-10-21T03:00:00Z" },
    },
  ],
});
it.each([b, c])(
  "selects only the active approved Account and its own cutoff %s",
  async (accountId) => {
    vi.stubEnv("EXPO_PUBLIC_OTR_NATIVE_QA_SCOPE", JSON.stringify(ownerRollout()));
    vi.stubEnv("EXPO_PUBLIC_OTR_MANUAL_P2_FORMAL_ENABLED", "true");
    state.account = accountId;
    state.session.mockResolvedValue({
      accessToken: "synthetic",
      identity: { userId: accountId },
      expiresAt: "2026-10-24T03:00:00Z",
    });
    const expected = ownerRollout().additionalAccounts.find(
      (v) => v.accountId === accountId,
    )!;
    expect(nativeTripQaCreateFormat(accountId)).toBe(2);
    expect(nativeTripAuthoredCloudTravelers(accountId)).toBe(true);
    expect(nativeTripQaFormalManualFlightScope(accountId)?.accountId).toBe(accountId);
    await runNativeTripQaSync();
    expect(state.enroll).toHaveBeenCalledWith(accountId, expected.normal.newTripsFrom);
    expect(state.normalFactory).toHaveBeenCalledWith(
      { accountId, newTripsFrom: expected.normal.newTripsFrom },
      expect.any(Function),
      false,
    );
    await getNativeTripQaQueueActivity();
    expect(state.activity).toHaveBeenCalledWith(state.database, {
      accountId,
      newTripsFrom: expected.normal.newTripsFrom,
    });
    expect((await readNativeTripQaDiagnostic()).gate.accountMatches).toBe(true);
  },
);
it("rejects duplicate rollout Account identities without dispatch", async () => {
  const scope = ownerRollout();
  scope.additionalAccounts[1].accountId = b;
  vi.stubEnv("EXPO_PUBLIC_OTR_NATIVE_QA_SCOPE", JSON.stringify(scope));
  expect(nativeTripQaCreateFormat(a)).toBeUndefined();
  expect(await runNativeTripQaSync()).toBeNull();
  expect(state.normalFactory).not.toHaveBeenCalled();
});
it("does not enable an unlisted Account or reuse another Account scope", async () => {
  vi.stubEnv("EXPO_PUBLIC_OTR_NATIVE_QA_SCOPE", JSON.stringify(ownerRollout()));
  state.account = trip;
  expect(nativeTripQaCreateFormat(trip)).toBeUndefined();
  expect(nativeTripAuthoredCloudTravelers(trip)).toBe(false);
  expect(nativeTripQaFormalManualFlightScope(trip)).toBeNull();
  expect(await runNativeTripQaSync()).toBeNull();
  expect(state.normalFactory).not.toHaveBeenCalled();
});

it("does not enroll retained legacy Trips without the explicit per-Account opt-in", async () => {
  const scope = ownerRollout();
  scope.additionalAccounts = scope.additionalAccounts.map(
    ({ recoverUnsentLegacyTrips: _flag, ...v }) => ({
      ...v,
      recoverUnsentLegacyTrips: false,
    }),
  );
  vi.stubEnv("EXPO_PUBLIC_OTR_NATIVE_QA_SCOPE", JSON.stringify(scope));
  state.account = b;
  state.session.mockResolvedValue({
    accessToken: "synthetic",
    identity: { userId: b },
    expiresAt: "2026-10-24T03:00:00Z",
  });
  await runNativeTripQaSync();
  expect(state.enroll).not.toHaveBeenCalled();
  expect(state.normalFactory).toHaveBeenCalledWith(
    { accountId: b, newTripsFrom: scope.additionalAccounts[0].normal.newTripsFrom },
    expect.any(Function),
    false,
  );
});

it("passes only an explicit Data Health manual retry to the existing normal runner", async () => {
  const scope = ownerRollout();
  vi.stubEnv("EXPO_PUBLIC_OTR_NATIVE_QA_SCOPE", JSON.stringify(scope));
  await runNativeTripQaSync({ manualRetry: true });
  expect(state.normalFactory).toHaveBeenCalledWith(
    { accountId: a, newTripsFrom: scope.normal.newTripsFrom },
    expect.any(Function),
    true,
  );
});

it("only an explicit manual retry consumes this Account's exact legacy traveler confirmation", async () => {
  const additional = "10000000-0000-4000-8000-000000000009";
  const confirmation = {
    tripId: trip,
    localOperationId: create,
    operationId: edit,
    confirmedDisplayNameSha256: "a".repeat(64),
  };
  vi.stubEnv(
    "EXPO_PUBLIC_OTR_NATIVE_QA_SCOPE",
    JSON.stringify({
      version: 2,
      accountId: a,
      normal: { newTripsFrom: "2026-10-23T03:00:00Z" },
      additionalAccounts: [
        {
          accountId: additional,
          normal: { newTripsFrom: "2026-10-23T03:00:00Z" },
          confirmedLocalTravelers: [confirmation],
        },
      ],
    }),
  );
  state.account = additional;
  state.session.mockResolvedValue({
    accessToken: "synthetic",
    expiresAt: "2026-10-24T03:00:00Z",
    identity: { userId: additional },
  });
  state.token.mockResolvedValue({ token: "synthetic", userId: additional });
  await runNativeTripQaSync();
  expect(state.confirm).not.toHaveBeenCalled();
  state.principalKind = "GUEST";
  await expect(runNativeTripQaSync({ manualRetry: true })).rejects.toThrow(
    "PERSON_ACCOUNT_PRINCIPAL_REQUIRED",
  );
  expect(state.confirm).not.toHaveBeenCalled();
  state.principalKind = "ACCOUNT";
  await runNativeTripQaSync({ manualRetry: true });
  expect(state.confirm).toHaveBeenCalledExactlyOnceWith({
    ...confirmation,
    dataOwnership: "CLOUD_SHARED_AUTHORED",
  });
  state.confirm.mockClear();
  state.account = a;
  state.session.mockResolvedValue({
    accessToken: "synthetic",
    expiresAt: "2026-10-24T03:00:00Z",
    identity: { userId: a },
  });
  state.token.mockResolvedValue({ token: "synthetic", userId: a });
  await runNativeTripQaSync({ manualRetry: true });
  expect(state.confirm).not.toHaveBeenCalled();
});

it.each([a, trip, edit])(
  "normal Account %s needs no QA record for Manual sync",
  async (accountId) => {
    vi.stubEnv("EXPO_PUBLIC_OTR_NATIVE_QA_SCOPE", "");
    vi.stubEnv("EXPO_PUBLIC_OTR_NORMAL_CLOUD_SYNC_ENABLED", "true");
    state.account = accountId;
    state.session.mockResolvedValue({
      accessToken: "synthetic",
      expiresAt: "2026-10-24T03:00:00Z",
      identity: { userId: accountId },
    });
    state.token.mockResolvedValue({ token: "synthetic", userId: accountId });
    expect(hasNativeTripQaScope()).toBe(false);
    expect(isGeneralAccountCloudSyncEnabled()).toBe(true);
    expect(nativeTripQaCreateFormat(accountId)).toBe(2);
    expect(nativeTripAuthoredCloudTravelers(accountId)).toBe(true);
    expect(nativeTripQaCreateFormat(null)).toBeUndefined();
    expect(nativeTripAuthoredCloudTravelers(null)).toBe(false);
    await runNativeTripQaSync();
    expect(state.normalFactory).toHaveBeenCalledWith(
      { accountId, newTripsFrom: "1970-01-01T00:00:00.000Z", manualOnly: true },
      expect.any(Function),
      false,
    );
    expect(state.enroll).not.toHaveBeenCalled();
    expect(state.confirm).not.toHaveBeenCalled();
  },
);
it("general DEV scope remains closed for Guest, unavailable Auth, Production or malformed QA config", async () => {
  vi.stubEnv("EXPO_PUBLIC_OTR_NATIVE_QA_SCOPE", "");
  vi.stubEnv("EXPO_PUBLIC_OTR_NORMAL_CLOUD_SYNC_ENABLED", "true");
  state.principalKind = "GUEST";
  expect(await runNativeTripQaSync()).toBeNull();
  expect(state.normalFactory).not.toHaveBeenCalled();
  expect(state.token).not.toHaveBeenCalled();
  state.principalKind = "ACCOUNT";
  vi.stubEnv("EXPO_PUBLIC_OTR_API_BASE_URL", "https://production.invalid");
  expect(isGeneralAccountCloudSyncEnabled()).toBe(false);
  expect(await runNativeTripQaSync()).toBeNull();
  vi.stubEnv("EXPO_PUBLIC_OTR_API_BASE_URL", "https://api-dev.xoery.art");
  vi.stubEnv("EXPO_PUBLIC_OTR_NATIVE_QA_SCOPE", "{}");
  expect(isGeneralAccountCloudSyncEnabled()).toBe(false);
  expect(await runNativeTripQaSync()).toBeNull();
});
