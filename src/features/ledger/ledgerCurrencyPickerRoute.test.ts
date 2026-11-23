import { beforeEach, expect, it, vi } from "vitest";
import LedgerCurrencyPickerRoute from "../../../app/ledger-currency-picker";
import type { LedgerCurrencyChoice } from "./ledgerCurrencySheet";

const state = vi.hoisted(() => ({
  choice: undefined as LedgerCurrencyChoice | undefined,
  exit: undefined as (() => void) | undefined,
  exitPending: false,
}));

vi.mock("react", async original => ({
  ...(await original<typeof import("react")>()),
  useEffect: () => {},
  useState: (initial: () => Date) => [initial(), () => {}],
  useSyncExternalStore: (_subscribe: unknown, read: () => unknown) => read(),
}));
vi.mock("expo-router", () => ({ useLocalSearchParams: () => ({ invocation: "selection" }) }));
vi.mock("react-native", () => ({
  Keyboard: { dismiss: () => {} },
  StyleSheet: { create: (value: unknown) => value },
  View: "view",
}));
vi.mock("@/components/SheetHost", () => ({
  useSheetMotion: () => ({
    isExitPending: () => state.exitPending,
    exitPending: state.exitPending,
    requestCloseWithAction: (continuation: () => void) => { state.exit = continuation; },
  }),
}));
vi.mock("@/components/SheetRoutePanel", () => ({ SheetRoutePanel: "panel" }));
vi.mock("@/features/ledger/CurrencyPicker", () => ({ CurrencyPicker: "currency-picker" }));
vi.mock("@/features/ledger/ledgerCurrencySheet", () => ({
  readLedgerCurrencySheet: (id: string) => id === "selection" ? state.choice : undefined,
  releaseLedgerCurrencySheet: (id: string) => { if (id === "selection") state.choice = undefined; },
}));
vi.mock("@/ui/forms", () => ({ UiDatePicker: "date-picker" }));
vi.mock("@/ui/useUiLocale", () => ({ useUiLocale: () => "en" }));

beforeEach(() => {
  state.choice = undefined;
  state.exit = undefined;
  state.exitPending = false;
});

it("applies the date once through its own completed exit", () => {
  const choose = vi.fn();
  const initial = new Date(2026, 10, 24, 12);
  state.choice = { kind: "date", titleKey: "ui.referenceDate2", initial, choose };
  const route = LedgerCurrencyPickerRoute();
  route.props.action.onPress();
  expect(choose).not.toHaveBeenCalled();
  expect(state.exit).toBeDefined();
  state.exit?.();
  state.exit?.();
  expect(choose).toHaveBeenCalledExactlyOnceWith(initial);
});

it("does not use a currency selection after cancellation or when the owner has changed", () => {
  const choose = vi.fn();
  state.choice = { kind: "currency", titleKey: "ui.fromCurrency", selected: "NZD", suggestions: [], choose };
  const route = LedgerCurrencyPickerRoute();
  route.props.children.props.onSelect("USD");
  expect(state.exit).toBeDefined();
  const interrupted = state.exit;
  state.choice = undefined;
  interrupted?.();
  expect(choose).not.toHaveBeenCalled();
});
