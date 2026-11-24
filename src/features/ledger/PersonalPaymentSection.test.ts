import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { PersonalPaymentSection } from "./PersonalPaymentSection";
import type { LedgerCurrencyChoice } from "./ledgerCurrencySheet";

const state = vi.hoisted(() => ({
  hosted: true,
  open: vi.fn<(choice: LedgerCurrencyChoice) => boolean>(),
  localChanges: [] as unknown[],
  cleanup: undefined as (() => void) | undefined,
}));

vi.mock("react", async original => ({
  ...(await original<typeof import("react")>()),
  useCallback: (callback: unknown) => callback,
  useEffect: () => {},
  useLayoutEffect: (effect: () => () => void) => { state.cleanup = effect(); },
  useRef: (value: unknown) => ({ current: value }),
  useState: (value: unknown) => [value, (next: unknown) => state.localChanges.push(next)],
}));
vi.mock("react-native", () => ({
  Alert: {},
  Modal: "modal",
  Pressable: "pressable",
  StyleSheet: { create: (style: unknown) => style },
  Text: "text",
  View: "view",
}));
vi.mock("@/components/SheetHeader", () => ({ SheetHeader: "header" }));
vi.mock("@/ui/theme", () => ({ useThemedStyles: () => ({}) }));
vi.mock("@/ui/useUiLocale", () => ({ useUiLocale: () => "en" }));
vi.mock("@/ui/locale", () => ({ t: (key: string) => key }));
vi.mock("@/ui/forms", () => ({ UiTextInput: "input" }));
vi.mock("@/ui/domainLabels", () => ({}));
vi.mock("@/data/repositories/defaultLedgerPersonalPaymentRepository", () => ({
  getDefaultLedgerPersonalPaymentRepository: vi.fn(),
}));
vi.mock("@/data/operations/kickLedgerSync", () => ({}));
vi.mock("@/data/operations/personalPaymentPresentation", () => ({}));
vi.mock("./CurrencyPicker", () => ({ CurrencyPicker: "currency-picker" }));
vi.mock("./MoneyText", () => ({ MoneyText: "money" }));
vi.mock("./format", () => ({}));
vi.mock("./ledgerCurrencySheet", () => ({
  get hostedLedgerCurrencySheetEnabled() { return state.hosted; },
  useLedgerCurrencySheet: () => state.open,
}));

type Row = ReactElement<{ accessibilityLabel?: string; children?: ReactNode; onPress?(): void }>;

function rows(content: ReactNode): Row[] {
  if (!isValidElement(content)) return [];
  const row = content as Row;
  return [row, ...Children.toArray(row.props.children).flatMap(rows)];
}

function currencyRow(hostCurrencyPicker: boolean, actorMemberId = "payer") {
  return rows(PersonalPaymentSection({
    actorMemberId,
    from: { id: "payer", name: "Payer" },
    to: { id: "recipient", name: "Recipient" },
    journeyId: "journey",
    settlementCurrency: "NZD",
    hostCurrencyPicker,
  })).find(row => row.props.accessibilityLabel === "payment.currency");
}

beforeEach(() => {
  state.hosted = true;
  state.open.mockReset().mockReturnValue(true);
  state.localChanges = [];
});

it("stages the authorized formal row and rejects a late currency after owner removal", () => {
  expect(currencyRow(true, "unrelated")).toBeUndefined();
  currencyRow(true)?.props.onPress?.();
  const [choice] = state.open.mock.lastCall ?? [];
  expect(choice).toMatchObject({ kind: "currency", selected: "NZD" });
  expect(state.localChanges).toEqual([]);
  if (choice?.kind !== "currency") throw new Error("Currency row was not staged");
  expect(choice.isCurrent?.()).toBe(true);
  state.cleanup?.();
  expect(choice.isCurrent?.()).toBe(false);
  choice.choose("USD");
  expect(state.localChanges).toEqual([]);
});

it("keeps other surfaces and the disabled flag on their local modal", () => {
  currencyRow(false)?.props.onPress?.();
  state.hosted = false;
  currencyRow(true)?.props.onPress?.();
  expect(state.open).not.toHaveBeenCalled();
  expect(state.localChanges).toEqual([true, true]);
});
