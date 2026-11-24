import { beforeEach, expect, it, vi } from "vitest";
import TripMetadataCurrencyPickerRoute from "../../../app/trip-metadata-sheet/currency-picker";
import type { LedgerCurrencyChoice } from "@/features/ledger/ledgerCurrencySheet";

const state = vi.hoisted(() => ({
  navigation: { key: "stack", index: 1, routes: [{ key: "currency" }, { key: "picker" }] },
  dispatch: vi.fn(),
  choice: undefined as LedgerCurrencyChoice | undefined,
  owner: undefined as { working: boolean } | undefined,
  exitPending: false,
}));

vi.mock("react", async original => ({
  ...(await original<typeof import("react")>()),
  useEffect: () => {},
  useState: (initial: () => Date) => [initial(), () => {}],
  useSyncExternalStore: (_subscribe: unknown, read: () => unknown) => read(),
}));
vi.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ invocation: "editor", currency: "invocation", selection: "choice", editorKey: "currency" }),
  useNavigation: () => ({ getState: () => state.navigation, isFocused: () => true, dispatch: state.dispatch }),
}));
vi.mock("expo-router/react-navigation", () => ({ useRoute: () => ({ key: "picker" }) }));
vi.mock("react-native", () => ({
  Keyboard: { dismiss: () => {} },
  StyleSheet: { create: (value: unknown) => value },
  View: "view",
}));
vi.mock("@/components/SheetHost", () => ({
  useSheetMotion: () => ({ exitPending: state.exitPending, isExitPending: () => state.exitPending }),
}));
vi.mock("@/components/SheetRoutePanel", () => ({ SheetRoutePanel: "panel" }));
vi.mock("@/features/ledger/CurrencyPicker", () => ({ CurrencyPicker: "picker" }));
vi.mock("./tripMetadataSheet", () => ({
  readTripMetadataCurrency: () => state.owner,
  subscribeTripMetadataSheet: () => () => {},
  metadataCurrencyPicker: {
    read: () => state.choice,
    release: () => { state.choice = undefined; },
  },
}));
vi.mock("@/ui/forms", () => ({ UiDatePicker: "date-picker" }));
vi.mock("@/ui/useUiLocale", () => ({ useUiLocale: () => "en" }));

function acceptPop() {
  state.navigation = { ...state.navigation, index: 0, routes: state.navigation.routes.slice(0, 1) };
}

beforeEach(() => {
  state.navigation = { key: "stack", index: 1, routes: [{ key: "currency" }, { key: "picker" }] };
  state.owner = { working: false };
  state.choice = undefined;
  state.exitPending = false;
  state.dispatch.mockReset();
});

it("consumes a reference date only after returning to the exact currency route", () => {
  const choose = vi.fn();
  const initial = new Date(2026, 10, 24, 12);
  state.choice = { kind: "date", titleKey: "ui.referenceDate2", initial, choose };
  const done = TripMetadataCurrencyPickerRoute().props.action.onPress;
  done();
  expect(choose).not.toHaveBeenCalled();
  state.dispatch.mockImplementation(acceptPop);
  done();
  done();
  expect(state.dispatch).toHaveBeenLastCalledWith({ type: "GO_BACK", target: "stack", source: "picker" });
  expect(choose).toHaveBeenCalledExactlyOnceWith(initial);
});

it("drops a currency result when the editor invocation changes during return", () => {
  const choose = vi.fn();
  state.choice = { kind: "currency", titleKey: "ui.fromCurrency", selected: "NZD", suggestions: [], choose };
  state.dispatch.mockImplementation(() => {
    acceptPop();
    state.owner = { working: false };
  });
  TripMetadataCurrencyPickerRoute().props.children.props.onSelect("USD");
  expect(choose).not.toHaveBeenCalled();
});
