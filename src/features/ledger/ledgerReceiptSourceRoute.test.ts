import { afterEach, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import LedgerReceiptSourceRoute from "../../../app/ledger-receipt-source/index";
import { advanceAccountGeneration, getAccountGeneration } from "@/data/auth/accountGeneration";
import type { ReceiptScanSource } from "./ReceiptScanSourceFields";
import { openLedgerReceiptSource, readLedgerReceiptSource, releaseLedgerReceiptSource } from "./ledgerReceiptSourceSheet";

const state = vi.hoisted(() => ({
  invocation: undefined as string | undefined,
  requestCloseWithAction: vi.fn<(action: () => void) => void>(),
}));
vi.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ invocation: state.invocation }),
  useNavigation: () => ({ isFocused: () => true }),
}));
vi.mock("react", async original => ({
  ...await original<typeof import("react")>(),
  useEffect: () => {},
  useSyncExternalStore: (_subscribe: unknown, read: () => unknown) => read(),
}));
vi.mock("react-native", () => ({ View: "view" }));
vi.mock("@/components/SheetRoutePanel", () => ({ SheetRoutePanel: "panel" }));
vi.mock("@/components/SheetHost", () => ({
  useSheetMotion: () => ({ isExitPending: () => false, requestCloseWithAction: state.requestCloseWithAction }),
}));
vi.mock("@/ui/locale", () => ({ t: (key: string) => key }));
vi.mock("@/ui/useUiLocale", () => ({ useUiLocale: () => "en" }));
vi.mock("@/ui/visual", () => ({ visual: { space: { page: 16 } } }));
vi.mock("./ReceiptScanSourceFields", () => ({ ReceiptScanSourceFields: "sources" }));

afterEach(() => {
  releaseLedgerReceiptSource(state.invocation);
  state.requestCloseWithAction.mockReset();
});

function open(isCurrent = () => true) {
  const source = { count: 0, slots: 3, isCurrent, choose: vi.fn(), onClose: vi.fn() };
  state.invocation = openLedgerReceiptSource(source, getAccountGeneration());
  expect(state.invocation).toBeDefined();
  const panel = LedgerReceiptSourceRoute() as ReactElement<{
    children: ReactElement<{ children: ReactElement<{ onChoose(kind: ReceiptScanSource): void }> }>;
  }>;
  return { source, select: panel.props.children.props.children.props.onChoose };
}

it("starts the system source only after the shared host reports a completed close", () => {
  const { source, select } = open();
  expect(openLedgerReceiptSource(source, getAccountGeneration())).toBeUndefined();
  select("photo");
  expect(source.choose).not.toHaveBeenCalled();
  const [afterClose] = state.requestCloseWithAction.mock.calls[0]!;
  afterClose();
  afterClose();
  expect(source.choose).toHaveBeenCalledExactlyOnceWith("photo");
  expect(source.onClose).toHaveBeenCalledExactlyOnceWith(state.invocation);
  expect(readLedgerReceiptSource(state.invocation)).toBeUndefined();
});

it("suppresses a staged source if the owner or account retires before the close finishes", () => {
  let current = true;
  const { source, select } = open(() => current);
  select("file");
  const [afterClose] = state.requestCloseWithAction.mock.calls[0]!;
  current = false;
  afterClose();
  expect(source.choose).not.toHaveBeenCalled();
  current = true;
  advanceAccountGeneration();
  afterClose();
  expect(source.choose).not.toHaveBeenCalled();
  expect(source.onClose).toHaveBeenCalledExactlyOnceWith(state.invocation);
});
