import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { advanceAccountGeneration } from "../auth/accountGeneration";
import {
  filterNativeTripQaList,
  nativeTripQaCreateFormat,
  hasNativeTripQaScope,
  runNativeTripQaSync,
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
}));
vi.mock("../auth/authRepository", () => ({
  requireActiveUserId: async () => state.account,
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
  vi.stubEnv("EXPO_PUBLIC_OTR_NATIVE_QA_SCOPE", JSON.stringify({
    ...config,
    creates: [{ ...config.creates[0], lastAttemptAt }],
  }));
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
