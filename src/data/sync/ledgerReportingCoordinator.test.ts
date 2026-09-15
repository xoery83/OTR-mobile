import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiClientError } from "@/data/api/client";

const repository = {
  getCursor: vi.fn(),
  applyBootstrap: vi.fn(),
  applyChanges: vi.fn(),
};
const transport = { bootstrap: vi.fn(), pull: vi.fn() };

vi.mock("@/data/repositories/defaultLedgerReadRepository", () => ({
  getDefaultLedgerReadRepository: vi.fn(async () => repository),
}));
vi.mock("@/data/sync/ledgerReadTransport", () => ({
  createLedgerReadTransport: vi.fn(() => transport),
}));

// eslint-disable-next-line import/first
import { refreshJourneyLedger } from "./ledgerReportingCoordinator";

describe("Ledger pull recovery", () => {
  beforeEach(() => vi.clearAllMocks());

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
});
