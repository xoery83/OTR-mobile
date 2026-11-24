import { beforeEach, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import LedgerReceiptReviewChoice from "../../../app/ledger-receipt-review/choice";
import type { ReceiptReviewChoice } from "./ledgerReceiptReviewSheet";

const state = vi.hoisted(() => ({
  navigation: { key: "ledger-sheet", index: 1, routes: [{ key: "review" }, { key: "choice" }] },
  choice: undefined as ReceiptReviewChoice | undefined,
  dispatch: vi.fn(),
  release: vi.fn(),
  choose: vi.fn(),
}));
vi.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ invocation: "scan", selection: "picker", editorKey: "review" }),
  useNavigation: () => ({ getState: () => state.navigation, isFocused: () => true, dispatch: state.dispatch }),
}));
vi.mock("expo-router/react-navigation", () => ({ useRoute: () => ({ key: "choice" }) }));
vi.mock("react", async original => ({
  ...await original<typeof import("react")>(),
  useEffect: () => {},
  useSyncExternalStore: (_subscribe: unknown, read: () => unknown) => read(),
}));
vi.mock("react-native", () => ({ Keyboard: { dismiss: vi.fn() }, StyleSheet: { create: (styles: unknown) => styles } }));
vi.mock("@/components/SheetRoutePanel", () => ({ SheetRoutePanel: "panel" }));
vi.mock("@/components/SheetHost", () => ({ useSheetMotion: () => ({ isExitPending: () => false }) }));
vi.mock("@/ui/forms", () => ({ UiChoiceChip: "chip" }));
vi.mock("@/ui/locale", () => ({ t: (key: string) => key }));
vi.mock("@/ui/useUiLocale", () => ({ useUiLocale: () => "en" }));
vi.mock("@/ui/visual", () => ({ visual: { space: { page: 16 } } }));
vi.mock("./CurrencyPicker", () => ({ CurrencyPicker: "currency" }));
vi.mock("./ReceiptScanSourceFields", () => ({ ReceiptScanSourceFields: "sources" }));
vi.mock("./ledgerReceiptReviewSheet", () => ({
  readLedgerReceiptReviewPicker: () => state.choice,
  releaseLedgerReceiptReviewPicker: (...args: unknown[]) => {
    state.release(...args);
    state.choice = undefined;
  },
  subscribeLedgerReceiptReview: () => () => {},
}));

function render() {
  const panel = LedgerReceiptReviewChoice() as ReactElement<{
    onBack(): void;
    children: ReactElement<{ onSelect(code: string): void }>;
  }>;
  return { select: panel.props.children.props.onSelect, back: panel.props.onBack };
}

function pop() {
  state.navigation = { key: "ledger-sheet", index: 0, routes: [{ key: "review" }] };
}

beforeEach(() => {
  state.navigation = { key: "ledger-sheet", index: 1, routes: [{ key: "review" }, { key: "choice" }] };
  state.choice = { kind: "currency", title: "Currency", selected: "NZD", suggestions: ["NZD"], isCurrent: () => true, choose: state.choose };
  state.dispatch.mockReset();
  state.choose.mockClear();
  state.release.mockClear();
});

it("applies once after the exact review returns, and permits retry after a refused pop", () => {
  const { select } = render();
  state.dispatch.mockImplementationOnce(() => {}).mockImplementationOnce(pop);
  select("USD");
  expect(state.choose).not.toHaveBeenCalled();
  expect(state.release).not.toHaveBeenCalled();
  select("USD");
  select("EUR");
  expect(state.dispatch).toHaveBeenCalledTimes(2);
  expect(state.dispatch).toHaveBeenCalledWith({ type: "GO_BACK", target: "ledger-sheet", source: "choice" });
  expect(state.choose).toHaveBeenCalledExactlyOnceWith("USD");
  expect(state.release).toHaveBeenCalledExactlyOnceWith("scan", "picker");
});

it("does not apply if the active scan changes during the pop", () => {
  const { select } = render();
  state.dispatch.mockImplementationOnce(() => { pop(); state.choice = undefined; });
  select("USD");
  expect(state.choose).not.toHaveBeenCalled();
});

it("does not apply on Back or accept a replacement route as the owner", () => {
  const { select, back } = render();
  state.dispatch.mockImplementationOnce(() => {
    state.navigation = { key: "ledger-sheet", index: 0, routes: [{ key: "another-review" }] };
  });
  select("USD");
  expect(state.choose).not.toHaveBeenCalled();
  state.navigation = { key: "ledger-sheet", index: 1, routes: [{ key: "review" }, { key: "choice" }] };
  state.dispatch.mockImplementationOnce(pop);
  back();
  expect(state.choose).not.toHaveBeenCalled();
});
