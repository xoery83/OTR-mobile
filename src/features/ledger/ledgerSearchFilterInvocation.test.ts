import { expect, it, vi } from "vitest";
import {
  advanceAccountGeneration,
  getAccountGeneration,
} from "@/data/auth/accountGeneration";
import {
  captureLedgerSearchOrigin,
  openLedgerSearchChoice,
  openLedgerSearchFilters,
  readLedgerSearchChoice,
  readLedgerSearchFilters,
  releaseLedgerSearchChoice,
  releaseLedgerSearchFilters,
} from "./ledgerSearchFilterInvocation";

it("binds drafts to the originating query context and drops stale account invocations", () => {
  const isCurrent = vi.fn(() => true);
  const prepareApply = vi.fn(async () => undefined);
  const invocation = {
    generation: getAccountGeneration(),
    isCurrent,
    fields: {
      initial: { currency: "NZD" },
      lockedPayer: true,
      scope: "GROUP" as const,
      options: { categories: [], currencies: ["NZD"], members: [] },
      prepareApply,
    },
  };

  const earlier = openLedgerSearchFilters(invocation);
  expect(earlier).toBeDefined();
  expect(openLedgerSearchFilters(invocation)).toBeUndefined();
  releaseLedgerSearchFilters(earlier);
  const current = openLedgerSearchFilters(invocation);

  expect(readLedgerSearchFilters(current)).toBe(invocation.fields);
  expect(readLedgerSearchFilters(earlier)).toBeUndefined();
  const pick = { kind: "options" as const, title: "Currency", selected: "NZD", values: [], onChoose: vi.fn() };
  const choiceId = openLedgerSearchChoice(current, pick);
  expect(readLedgerSearchChoice(current, choiceId)).toBe(pick);
  releaseLedgerSearchChoice(earlier, choiceId);
  expect(readLedgerSearchChoice(current, choiceId)).toBe(pick);

  isCurrent.mockReturnValue(false);
  expect(readLedgerSearchChoice(current, choiceId)).toBeUndefined();
  expect(readLedgerSearchFilters(current)).toBeUndefined();
  isCurrent.mockReturnValue(true);
  advanceAccountGeneration();
  expect(readLedgerSearchFilters(current)).toBeUndefined();
  expect(prepareApply).not.toHaveBeenCalled();
});

it("admits only the originally presenting search and its exact covering Sheet", () => {
  const search = { key: "search-a", name: "ledger-search" };
  const sheet = { key: "filters-a", name: "ledger-search-filters" };
  const otherSearch = { ...search, key: "search-b" };
  const otherSheet = { ...sheet, key: "filters-b" };
  const root = (routes: { key: string; name: string }[], key = "root") => ({ key, index: routes.length - 1, routes });
  const readRoot = vi.fn(() => root([search]));
  const focused = vi.fn(() => true);
  const origin = captureLedgerSearchOrigin(readRoot, focused)!;
  focused.mockReturnValue(false);
  readRoot.mockReturnValue(root([search, sheet]));
  expect(origin.isCurrent()).toBe(true);
  expect(origin.returnedToOrigin()).toBe(false);
  readRoot.mockReturnValue(root([search, otherSheet]));
  expect(origin.isCurrent()).toBe(false);
  readRoot.mockReturnValue(root([otherSearch, sheet]));
  expect(origin.isCurrent()).toBe(false);
  focused.mockReturnValue(true);
  readRoot.mockReturnValue(root([search], "other-root"));
  expect(origin.returnedToOrigin()).toBe(false);
  readRoot.mockReturnValue(root([search]));
  expect(origin.returnedToOrigin()).toBe(true);
});
