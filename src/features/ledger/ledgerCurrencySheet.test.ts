import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { advanceAccountGeneration } from "@/data/auth/accountGeneration";

const state = vi.hoisted(() => ({
  push: vi.fn(),
  focused: true,
  refs: [] as { current: unknown }[],
  cleanup: undefined as (() => void) | undefined,
}));
vi.mock("expo-router", () => ({ router: { push: state.push }, useNavigation: () => ({ isFocused: () => state.focused }) }));
vi.mock("react", async original => ({
  ...(await original<typeof import("react")>()),
  useCallback: (callback: unknown) => callback,
  useRef: (current: unknown) => {
    const ref = { current };
    state.refs.push(ref);
    return ref;
  },
  useLayoutEffect: (effect: () => () => void) => { state.cleanup = effect(); },
}));

beforeEach(() => {
  vi.stubEnv("EXPO_PUBLIC_OTR_SHEET_LEDGER_CURRENCY_QA", "true");
  state.focused = true;
  state.push.mockClear();
});
afterEach(() => {
  state.cleanup?.();
  vi.unstubAllEnvs();
});

it("uses a single scoped selection and drops it on permission, account or owner change", async () => {
  const { useLedgerCurrencySheet, readLedgerCurrencySheet } = await import("./ledgerCurrencySheet");
  const open = useLedgerCurrencySheet("trip", "expense");
  let allowed = true;
  const choice = {
    kind: "currency" as const,
    titleKey: "ui.fromCurrency" as const,
    selected: "NZD",
    suggestions: ["NZD", "USD"],
    isCurrent: () => allowed,
    choose: vi.fn(),
  };
  const embedded = useLedgerCurrencySheet("trip", "embedded", false);
  expect(embedded(choice)).toBe(false);
  expect(state.push).not.toHaveBeenCalled();
  allowed = false;
  expect(open(choice)).toBe(true);
  expect(state.push).not.toHaveBeenCalled();
  allowed = true;
  expect(open(choice)).toBe(true);
  expect(open(choice)).toBe(true);
  expect(state.push).toHaveBeenCalledOnce();
  const { invocation } = state.push.mock.calls[0][0].params;
  expect(readLedgerCurrencySheet(invocation)).toBe(choice);
  allowed = false;
  expect(readLedgerCurrencySheet(invocation)).toBeUndefined();
  allowed = true;
  advanceAccountGeneration();
  expect(readLedgerCurrencySheet(invocation)).toBeUndefined();
  state.cleanup?.();
  open(choice);
  expect(state.push).toHaveBeenCalledOnce();
});

it("only applies when a completed exit actually returns to the originating lookup", async () => {
  const { completeLedgerCurrencySheet, readLedgerCurrencySheet, useLedgerCurrencySheet } = await import("./ledgerCurrencySheet");
  const choose = vi.fn();
  const choice = {
    kind: "currency" as const, titleKey: "ui.fromCurrency" as const,
    selected: "NZD", suggestions: ["USD"], choose,
  };
  const open = useLedgerCurrencySheet("trip", "exchange-rate-lookup");
  state.focused = false;
  expect(open(choice)).toBe(true);
  expect(state.push).not.toHaveBeenCalled();
  state.focused = true;
  open(choice);
  const first = state.push.mock.lastCall?.[0].params.invocation;
  state.focused = false;
  completeLedgerCurrencySheet(first, choice, () => choose("USD"));
  expect(choose).not.toHaveBeenCalled();
  expect(readLedgerCurrencySheet(first)).toBeUndefined();
  state.focused = true;
  open(choice);
  const reopened = state.push.mock.lastCall?.[0].params.invocation;
  completeLedgerCurrencySheet(reopened, choice, () => choose("USD"));
  expect(choose).toHaveBeenCalledExactlyOnceWith("USD");
});

it("does not apply a result to a replacement expense draft for the same Trip", async () => {
  const { completeLedgerCurrencySheet, useLedgerCurrencySheet } = await import("./ledgerCurrencySheet");
  const choose = vi.fn();
  const loaded = {};
  let currentDraft = loaded;
  const choice = {
    kind: "category" as const, titleKey: "ui.category" as const,
    selected: "other", choose, isCurrent: () => currentDraft === loaded,
  };
  const open = useLedgerCurrencySheet("trip", "expense-route", true, true);
  open(choice);
  const invocation = state.push.mock.lastCall?.[0].params.invocation;
  currentDraft = {};
  completeLedgerCurrencySheet(invocation, choice, () => choose("food"));
  expect(choose).not.toHaveBeenCalled();
});

it("consumes a field tap while the expense source is preparing, then allows the next tap", async () => {
  const { useLedgerCurrencySheet } = await import("./ledgerCurrencySheet");
  const open = useLedgerCurrencySheet("trip", "expense-route", true, true);
  let preparing = true;
  let finishPreparation!: () => void;
  const preparation = new Promise<void>(resolve => { finishPreparation = resolve; })
    .then(() => { preparing = false; });
  const choice = {
    kind: "category" as const, titleKey: "ui.category" as const, selected: "other",
    choose: vi.fn(), isCurrent: () => !preparing,
  };
  expect(open(choice)).toBe(true);
  expect(state.push).not.toHaveBeenCalled();
  finishPreparation();
  await preparation;
  expect(open(choice)).toBe(true);
  expect(state.push).toHaveBeenCalledOnce();
});
