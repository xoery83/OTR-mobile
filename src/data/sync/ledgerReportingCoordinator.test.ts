import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiClientError } from "@/data/api/client";

const { refreshPersonal, refreshReview } = vi.hoisted(() => ({
  refreshPersonal: vi.fn(async () => false),
  refreshReview: vi.fn(async () => undefined),
}));
const accountScope = vi.hoisted(() => ({ generation: 0 }));

vi.mock("@/data/auth/accountGeneration", () => ({
  getAccountGeneration: () => accountScope.generation,
}));

const repository = {
  getCursor: vi.fn(),
  applyBootstrap: vi.fn(),
  applyChanges: vi.fn(),
  cacheMyLedger: vi.fn(),
};
const transport = { bootstrap: vi.fn(), pull: vi.fn(), myLedger: vi.fn() };

vi.mock("@/data/repositories/defaultLedgerReadRepository", () => ({
  getDefaultLedgerReadRepository: vi.fn(async () => repository),
}));
vi.mock("@/data/sync/ledgerReadTransport", () => ({
  createLedgerReadTransport: vi.fn(() => transport),
}));
vi.mock("./ledgerPersonalPaymentCoordinator", () => ({
  refreshLedgerPersonalPayments: refreshPersonal,
}));
vi.mock("./personalSettlementReviewCoordinator", () => ({
  refreshPersonalSettlementReview: refreshReview,
}));

// eslint-disable-next-line import/first
import {
  refreshJourneyLedger,
  refreshJourneyLedgerWithStatus,
  refreshMyLedger,
} from "./ledgerReportingCoordinator";

describe("Ledger pull recovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    accountScope.generation = 0;
  });

  it("marks a swallowed Personal Review failure as incomplete without changing the boolean read result", async () => {
    repository.getCursor.mockResolvedValue({ cursor: "c0" });
    transport.pull.mockResolvedValue({ changes: [], cursor: "c0", hasMore: false });
    refreshReview.mockRejectedValueOnce(new Error("temporary"));
    await expect(refreshJourneyLedgerWithStatus("journey")).resolves.toEqual({
      changed: false,
      incomplete: true,
      pullApiRequestCount: 2,
    });
    await expect(refreshJourneyLedger("journey")).resolves.toBe(false);
  });

  it("applies every page transactionally before advancing", async () => {
    repository.getCursor.mockResolvedValue({ cursor: "c0" });
    transport.pull
      .mockResolvedValueOnce({
        changes: [{ entityId: "one" }],
        cursor: "c1",
        hasMore: true,
        serverTime: "now",
      })
      .mockResolvedValueOnce({
        changes: [{ entityId: "two" }],
        cursor: "c2",
        hasMore: false,
        serverTime: "now",
      });
    await expect(refreshJourneyLedger("journey")).resolves.toBe(true);
    expect(transport.pull.mock.calls.map((call) => call[1])).toEqual(["c0", "c1"]);
    expect(repository.applyChanges).toHaveBeenCalledTimes(2);
  });

  it("uses controlled bootstrap after explicit invalid cursor", async () => {
    repository.getCursor.mockResolvedValue({ cursor: "corrupt" });
    transport.pull.mockRejectedValue(
      new ApiClientError("bad", "http", 400, "INVALID_CURSOR"),
    );
    transport.bootstrap.mockResolvedValue({ cursor: "fresh" });
    await refreshJourneyLedger("journey");
    expect(repository.applyBootstrap).toHaveBeenCalledWith({ cursor: "fresh" });
  });

  it("keeps historical Personal Payments available after shared Journey access is revoked", async () => {
    refreshPersonal.mockResolvedValueOnce(true);
    repository.getCursor.mockResolvedValue(null);
    transport.bootstrap.mockRejectedValue(
      new ApiClientError("removed", "http", 403, "TRIP_READ_FORBIDDEN"),
    );
    await expect(refreshJourneyLedger("journey")).resolves.toBe(true);
    expect(refreshPersonal).toHaveBeenCalledWith("journey", expect.any(Function));
    expect(repository.applyChanges).not.toHaveBeenCalled();
  });

  it("replays the same page after an interrupted transactional apply", async () => {
    repository.getCursor.mockResolvedValue({ cursor: "c0" });
    transport.pull.mockResolvedValue({
      changes: [{ entityId: "one" }],
      cursor: "c1",
      hasMore: false,
      serverTime: "now",
    });
    repository.applyChanges
      .mockRejectedValueOnce(new Error("interrupted"))
      .mockResolvedValueOnce(undefined);

    await expect(refreshJourneyLedger("journey")).rejects.toThrow("interrupted");
    await expect(refreshJourneyLedger("journey")).resolves.toBe(true);
    expect(transport.pull.mock.calls.map((call) => call[1])).toEqual(["c0", "c0"]);
  });

  it("coalesces concurrent pulls per Journey and reports an empty cursor page", async () => {
    let resolve!: (value: unknown) => void;
    repository.getCursor.mockResolvedValue({ cursor: "c0" });
    transport.pull.mockReturnValue(new Promise((done) => (resolve = done)));
    const first = refreshJourneyLedger("journey");
    const second = refreshJourneyLedger("journey");
    await vi.waitFor(() => expect(transport.pull).toHaveBeenCalledOnce());
    resolve({ changes: [], cursor: "c0", hasMore: false, serverTime: "now" });
    await expect(Promise.all([first, second])).resolves.toEqual([false, false]);
    expect(repository.applyChanges).toHaveBeenCalledOnce();
  });

  it("keeps concurrent Journey pulls isolated", async () => {
    repository.getCursor.mockImplementation(async (journeyId: string) => ({
      cursor: `${journeyId}-c0`,
    }));
    transport.pull.mockImplementation(async (journeyId: string) => ({
      changes: [],
      cursor: `${journeyId}-c1`,
      hasMore: false,
      serverTime: "now",
    }));
    await Promise.all([
      refreshJourneyLedger("journey-a"),
      refreshJourneyLedger("journey-b"),
    ]);
    expect(transport.pull.mock.calls).toEqual([
      ["journey-a", "journey-a-c0"],
      ["journey-b", "journey-b-c0"],
    ]);
    expect(repository.applyChanges.mock.calls.map((call) => call[0])).toEqual([
      "journey-a",
      "journey-b",
    ]);
  });

  it("does not coalesce the same Journey pull across account generations", async () => {
    repository.getCursor.mockResolvedValue({ cursor: "c0" });
    let finishFirst!: (value: unknown) => void;
    let finishSecond!: (value: unknown) => void;
    transport.pull
      .mockImplementationOnce(
        () =>
          new Promise((done) => {
            finishFirst = done;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise((done) => {
            finishSecond = done;
          }),
      );
    const first = refreshJourneyLedger("journey-a");
    await vi.waitFor(() => expect(transport.pull).toHaveBeenCalledTimes(1));
    accountScope.generation = 1;
    const second = refreshJourneyLedger("journey-a");
    await vi.waitFor(() => expect(transport.pull).toHaveBeenCalledTimes(2));
    finishFirst({ changes: [], cursor: "c0", hasMore: false });
    finishSecond({ changes: [], cursor: "c0", hasMore: false });
    await expect(Promise.all([first, second])).resolves.toEqual([false, false]);
  });

  it("bootstraps newly discovered authorized Journeys into the local directory", async () => {
    transport.myLedger.mockResolvedValue({
      journeys: [{ journeyId: "new" }, { journeyId: "second" }, { journeyId: "known" }],
    });
    repository.getCursor.mockImplementation(async (journeyId: string) =>
      journeyId === "known" ? { cursor: "saved" } : null,
    );
    transport.bootstrap.mockResolvedValue({ journey: { id: "new" } });
    let writes = 0;
    let maxWrites = 0;
    repository.applyBootstrap.mockImplementation(async () => {
      writes += 1;
      maxWrites = Math.max(maxWrites, writes);
      await new Promise((resolve) => setTimeout(resolve, 0));
      writes -= 1;
    });
    await refreshMyLedger("ALL", { from: null, to: null });
    expect(repository.cacheMyLedger).toHaveBeenCalledOnce();
    expect(transport.bootstrap).toHaveBeenCalledWith("new");
    expect(transport.bootstrap).toHaveBeenCalledWith("second");
    expect(transport.bootstrap).toHaveBeenCalledTimes(2);
    expect(repository.applyBootstrap).toHaveBeenCalledTimes(2);
    expect(maxWrites).toBe(1);
  });
});
