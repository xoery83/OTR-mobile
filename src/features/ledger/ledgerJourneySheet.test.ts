import { expect, it, vi } from "vitest";
import { advanceAccountGeneration } from "@/data/auth/accountGeneration";
import { captureLedgerJourneyOrigin, readLedgerJourneySheet, releaseLedgerJourneySheet, stageLedgerJourneySheet } from "./ledgerJourneySheet";

it("accepts only the original active Ledger scope and releases its selection lease", () => {
  let current = true;
  const entry = {
    selected: "trip-a", initialQuery: "local",
    sections: () => [],
    originKey: "ledger",
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

it("checks the original active navigator chain while the root Sheet has focus", () => {
  const rootState = { key: "root", index: 0, routes: [{ key: "tabs" }, { key: "sheet" }] };
  const tabsState = { key: "tabs-state", index: 1, routes: [{ key: "trip-home" }, { key: "ledger" }] };
  const ledgerState = { key: "ledger-state", index: 0, routes: [{ key: "ledger-home" }, { key: "ledger-detail" }] };
  const root = { getState: () => rootState, getParent: () => undefined };
  const tabs = { getState: () => tabsState, getParent: () => root };
  const ledger = { getState: () => ledgerState, getParent: () => tabs };
  const isCurrent = captureLedgerJourneyOrigin(ledger, "root");

  rootState.index = 1;
  expect(isCurrent?.()).toBe(true);
  ledgerState.index = 1;
  expect(isCurrent?.()).toBe(false);
  ledgerState.index = 0;
  tabsState.index = 0;
  expect(isCurrent?.()).toBe(false);
  expect(captureLedgerJourneyOrigin(ledger, "other-root")).toBeUndefined();
});
