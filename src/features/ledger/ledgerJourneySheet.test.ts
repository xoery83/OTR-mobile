import { expect, it, vi } from "vitest";
import { advanceAccountGeneration } from "@/data/auth/accountGeneration";
import { isLedgerJourneyOrigin, readLedgerJourneySheet, releaseLedgerJourneySheet, stageLedgerJourneySheet } from "./ledgerJourneySheet";

it("accepts only the original active Ledger scope and releases its selection lease", () => {
  let current = true;
  const entry = {
    selected: "trip-a", initialQuery: "local",
    sections: () => [],
    originKey: "ledger",
    ledgerRouteKey: "ledger",
    originFocused: () => true,
    isCurrent: () => current,
    choose: vi.fn(async () => true),
  };
  const id = stageLedgerJourneySheet(entry);
  expect(stageLedgerJourneySheet(entry)).toBeUndefined();
  expect(readLedgerJourneySheet(id)).toBe(entry);
  current = false;
  expect(readLedgerJourneySheet(id)).toBeUndefined();
  current = true;
  advanceAccountGeneration();
  expect(readLedgerJourneySheet(id)).toBeUndefined();
  const next = stageLedgerJourneySheet(entry);
  releaseLedgerJourneySheet(id);
  expect(readLedgerJourneySheet(next)).toBe(entry);
  releaseLedgerJourneySheet(next);
  expect(readLedgerJourneySheet(next)).toBeUndefined();
  expect(entry.choose).not.toHaveBeenCalled();
});

it("requires the active Ledger route within the original tab stack", () => {
  const ledger = { key: "ledger", state: { index: 0, routes: [{ key: "ledger-home" }, { key: "ledger-detail" }] } };
  const tabs = { key: "tabs", state: { index: 1, routes: [{ key: "trip-home" }, ledger] } };
  expect(isLedgerJourneyOrigin(tabs, "ledger-home")).toBe(true);
  expect(isLedgerJourneyOrigin(tabs, "ledger-detail")).toBe(false);
  tabs.state.index = 0;
  expect(isLedgerJourneyOrigin(tabs, "ledger-home")).toBe(false);
  expect(isLedgerJourneyOrigin({ key: "scoped-ledger" }, "scoped-ledger")).toBe(true);
});
