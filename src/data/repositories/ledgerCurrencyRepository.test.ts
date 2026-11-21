import { captureAccountScope } from "../auth/accountRequestContext";
import { advanceAccountGeneration } from "../auth/accountGeneration";
import { createLedgerCurrencyCommands } from "./ledgerCurrencyRepository";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { RateQuote } from "@/domain/ledger/types";
import { cachedRateLookup } from "./ledgerRateLookup";
const session = vi.hoisted(() => ({
  account: "20000000-0000-4000-8000-000000000001",
  api: vi.fn(),
  post: vi.fn(),
  refresh: vi.fn(),
  revalidate: vi.fn(),
}));
vi.mock("../auth/authRepository", () => ({
  requireActiveUserId: async () => session.account,
}));
vi.mock("../api/authenticatedClient", () => ({
  createAuthenticatedApiClient: (...args: unknown[]) => session.api(...args),
}));
vi.mock("../sync/ledgerReportingCoordinator", () => ({
  refreshJourneyLedgerWithStatus: (...args: unknown[]) => session.refresh(...args),
  revalidateJourneyLedger: (...args: unknown[]) => session.revalidate(...args),
}));

const input = {
  quoteCurrency: "ISK",
  baseCurrency: "CNY",
  requestedDate: "2026-09-15",
};

const quote: RateQuote = {
  id: "40000000-0000-4000-8000-000000000001",
  journeyId: "10000000-0000-4000-8000-000000000001",
  quoteCurrency: "ISK",
  baseCurrency: "CNY",
  decimalRate: "0.0578",
  effectiveDate: "2026-09-14",
  economicDate: "2026-09-15",
  referenceDate: "2026-09-14",
  policyVersion: "ECB_DAILY_V1",
  observedAt: "2026-09-15T10:00:00.000Z",
  provider: "ECB",
  providerReference:
    "https://api.frankfurter.dev/v2/providers/ecb/rate/ISK/CNY?date=2026-09-15",
  sourceReference:
    "https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html",
  expiresAt: "2026-10-15T10:00:00.000Z",
};

describe("cached Journey rate lookup", () => {
  it("shows resolver-stamped nearest-date evidence and rejects expired cache", () => {
    expect(
      cachedRateLookup(input, [quote], Date.parse("2026-09-16T00:00:00Z")),
    ).toMatchObject({
      decimalRate: "0.0578",
      requestedDate: "2026-09-15",
      referenceDate: "2026-09-14",
      resolution: "NEAREST_AVAILABLE",
    });
    expect(cachedRateLookup(input, [quote], Date.parse(quote.expiresAt))).toBeNull();
  });
});

const preview = {
  currentCurrency: "NZD",
  currentScale: 2,
  proposedCurrency: "AUD",
  proposedScale: 2,
  settingsRevision: 4,
  previewDigest: "a".repeat(64),
  affectedExpenses: 0,
  sameCurrencyCount: 0,
  referenceCandidateCount: 0,
  missingEconomicDateCount: 0,
  missingHistoricalQuoteCount: 0,
  manualAgreedCount: 0,
  actualPayerCostCount: 0,
  otherPolicyCount: 0,
  conflictCount: 0,
  expectedUnresolvedCount: 0,
  openSettlementCount: 0,
  finalizedSettlementCount: 0,
  totalsAvailable: true,
  requiresAbandonPreview: false,
};
const trip = "10000000-0000-4000-8000-000000000009";
const active = () => Promise.resolve(session.account);
const switchAccount = () => {
  session.account = "20000000-0000-4000-8000-000000000002";
  advanceAccountGeneration();
};
beforeEach(() => {
  session.account = "20000000-0000-4000-8000-000000000001";
  for (const mock of [session.api, session.post, session.refresh, session.revalidate])
    mock.mockReset();
  session.api.mockReturnValue({ post: session.post });
  session.post.mockResolvedValue(preview);
  session.refresh.mockResolvedValue(undefined);
  session.revalidate.mockResolvedValue(undefined);
});
it("pins the explicit Trip and same Account scope without changing commit identity or preview facts", async () => {
  const scope = await captureAccountScope(active),
    commands = createLedgerCurrencyCommands();
  await commands.preview(trip, "AUD", scope);
  expect(session.api).toHaveBeenCalledWith({}, undefined, scope);
  expect(session.post.mock.calls[0][0]).toBe(
    `/v2/trips/${trip}/ledger/journey-currency/preview`,
  );
  await commands.commit(trip, preview, "original-operation", scope);
  expect(session.post.mock.calls[1]).toEqual([
    `/v2/trips/${trip}/ledger/journey-currency/commit`,
    {
      proposedCurrency: "AUD",
      baseSettingsRevision: 4,
      previewDigest: preview.previewDigest,
    },
    expect.anything(),
    { "Idempotency-Key": "original-operation" },
  ]);
  expect(session.refresh).toHaveBeenCalledWith(trip, { ...scope, tripId: trip });
  expect(session.revalidate).toHaveBeenCalledExactlyOnceWith(trip);
});
it("rejects an old Account scope before constructing a client or dispatching", async () => {
  const scope = await captureAccountScope(active);
  switchAccount();
  await expect(
    createLedgerCurrencyCommands().commit(trip, preview, "original-operation", scope),
  ).rejects.toThrow("Account changed");
  expect(session.api).not.toHaveBeenCalled();
  expect(session.post).not.toHaveBeenCalled();
});
it("does not dispatch when Account changes while the client factory is pending", async () => {
  let finish!: (value: unknown) => void;
  session.api.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const scope = await captureAccountScope(active),
    request = createLedgerCurrencyCommands().preview(trip, "AUD", scope);
  for (let i = 0; i < 10; i++) await Promise.resolve();
  switchAccount();
  finish({ post: session.post });
  await expect(request).rejects.toThrow("Account changed");
  expect(session.post).not.toHaveBeenCalled();
});
it.each(["preview", "commit"])(
  "discards an old Account %s response before readback",
  async (kind) => {
    let finish!: (value: unknown) => void;
    session.post.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const scope = await captureAccountScope(active),
      commands = createLedgerCurrencyCommands();
    const request =
      kind === "preview"
        ? commands.preview(trip, "AUD", scope)
        : commands.commit(trip, preview, "original-operation", scope);
    for (let i = 0; i < 15; i++) await Promise.resolve();
    switchAccount();
    finish(preview);
    await expect(request).rejects.toThrow("Account changed");
    expect(session.refresh).not.toHaveBeenCalled();
    expect(session.revalidate).not.toHaveBeenCalled();
  },
);
it("stops post-commit cache readback at the Account boundary", async () => {
  let finish!: () => void, started!: () => void;
  const ready = new Promise<void>((resolve) => {
    started = resolve;
  });
  session.refresh.mockImplementationOnce(() => {
    started();
    return new Promise<void>((resolve) => {
      finish = resolve;
    });
  });
  const scope = await captureAccountScope(active),
    request = createLedgerCurrencyCommands().commit(
      trip,
      preview,
      "original-operation",
      scope,
    );
  await ready;
  expect(session.refresh).toHaveBeenCalledWith(trip, { ...scope, tripId: trip });
  switchAccount();
  finish();
  await expect(request).rejects.toThrow("Account changed");
  expect(session.revalidate).not.toHaveBeenCalled();
});

it("does not report commit success after an Account switch during final readback", async () => {
  let finish!: () => void, started!: () => void;
  const ready = new Promise<void>((resolve) => {
    started = resolve;
  });
  session.revalidate.mockImplementationOnce(() => {
    started();
    return new Promise<void>((resolve) => {
      finish = resolve;
    });
  });
  const scope = await captureAccountScope(active),
    request = createLedgerCurrencyCommands().commit(
      trip,
      preview,
      "original-operation",
      scope,
    );
  await ready;
  switchAccount();
  finish();
  await expect(request).rejects.toThrow("Account changed");
});
