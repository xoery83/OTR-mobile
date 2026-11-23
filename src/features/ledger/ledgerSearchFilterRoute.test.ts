import { beforeEach, expect, it, vi } from "vitest";
import LedgerSearchFiltersRoute from "../../../app/ledger-search-filters";
import LedgerSearchChoiceRoute from "../../../app/ledger-search-filters/choice";
import { getAccountGeneration } from "@/data/auth/accountGeneration";
import type { ReportingFilters } from "@/domain/ledger/reporting";
import {
  openLedgerSearchChoice, openLedgerSearchFilters, readLedgerSearchFilters, releaseLedgerSearchFilters,
} from "./ledgerSearchFilterInvocation";

const state = vi.hoisted(() => ({
  invocation: undefined as string | undefined,
  selection: undefined as string | undefined,
  route: "filter-root",
  focused: true,
  attempt: 0,
  finish: undefined as (() => void) | undefined,
  nav: { key: "filter-stack", index: 0, routes: [{ key: "filter-root" }] },
  dispatch: vi.fn(),
}));

vi.mock("react", async original => ({
  ...(await original<typeof import("react")>()),
  useEffect: () => {},
  useSyncExternalStore: (_subscribe: unknown, read: () => unknown) => read(),
  useRef: (current: unknown) => ({ current }),
}));
vi.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ invocation: state.invocation, selection: state.selection, editorKey: "filter-root" }),
  useNavigation: () => ({ getState: () => state.nav, isFocused: () => state.focused, dispatch: state.dispatch }),
  router: { push: () => {} },
}));
vi.mock("expo-router/react-navigation", () => ({ useRoute: () => ({ key: state.route }) }));
vi.mock("@/components/SheetHost", () => ({
  useSheetMotion: () => ({
    isExitPending: () => false,
    getExitAttempt: () => state.attempt,
    requestClose: () => { state.attempt++; },
    requestCloseWithAction: (finish: () => void) => { state.attempt++; state.finish = finish; },
  }),
}));
vi.mock("@/components/SheetRoutePanel", () => ({ SheetRoutePanel: "sheet" }));
vi.mock("@/features/ledger/LedgerSearchScreen", () => ({
  LedgerSearchFilterForm: "ledger-filter-form",
  LedgerSearchChoiceForm: "ledger-filter-choice-form",
}));
vi.mock("react-native", () => ({
  Keyboard: { dismiss: () => {} },
  StyleSheet: { create: (value: unknown) => value },
  View: "view",
}));
vi.mock("@/ui/useUiLocale", () => ({ useUiLocale: () => "en" }));

function open(prepareApply: (filters: ReportingFilters) => Promise<(() => void) | undefined>) {
  state.invocation = openLedgerSearchFilters({
    generation: getAccountGeneration(),
    isCurrent: () => true,
    fields: {
      initial: {},
      lockedPayer: false,
      scope: "GROUP",
      options: { categories: [], currencies: [], members: [] },
      prepareApply,
    },
  });
  expect(state.invocation).toBeDefined();
  return LedgerSearchFiltersRoute().props as {
    onApply(filters: ReportingFilters): Promise<boolean>;
    onCancel(): void;
  };
}

beforeEach(() => {
  releaseLedgerSearchFilters(state.invocation);
  state.invocation = undefined;
  state.selection = undefined;
  state.route = "filter-root";
  state.nav = { key: "filter-stack", index: 0, routes: [{ key: "filter-root" }] };
  state.focused = true;
  state.attempt = 0;
  state.finish = undefined;
  state.dispatch.mockReset();
});

it("prepares the proposed result and publishes only once when that exit succeeds", async () => {
  const publish = vi.fn();
  const form = open(async () => publish);
  expect(await form.onApply({ currency: "NZD" })).toBe(true);
  expect(publish).not.toHaveBeenCalled();
  expect(state.finish).toBeDefined();
  state.finish?.();
  state.finish?.();
  expect(publish).toHaveBeenCalledOnce();
  expect(readLedgerSearchFilters(state.invocation)).toBeUndefined();
});

it("does not publish a prepared result when a separate Cancel attempt has started", async () => {
  let finishRead: ((commit: () => void) => void) | undefined;
  const form = open(() => new Promise(resolve => { finishRead = resolve; }));
  const publish = vi.fn();
  const submitting = form.onApply({ currency: "NZD" });
  form.onCancel();
  finishRead?.(publish);
  expect(await submitting).toBe(false);
  expect(state.finish).toBeUndefined();
  expect(publish).not.toHaveBeenCalled();
});

it("keeps a child filter draft local until the original editor is reached", () => {
  open(async () => undefined);
  state.route = "choice";
  state.nav.index = 1;
  state.nav.routes.push({ key: "choice" });
  state.selection = openLedgerSearchChoice(state.invocation, {
    kind: "options", title: "Currency", values: [], onChoose: vi.fn(),
  });
  const commit = vi.fn();
  const child = LedgerSearchChoiceRoute().props as { complete(apply: () => void): void };
  child.complete(commit);
  expect(commit).not.toHaveBeenCalled();
  state.dispatch.mockImplementation(() => {
    state.nav = { ...state.nav, index: 0, routes: state.nav.routes.slice(0, 1) };
  });
  child.complete(commit);
  child.complete(commit);
  expect(commit).toHaveBeenCalledOnce();
});
