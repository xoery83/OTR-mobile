import { expect, it, vi } from "vitest";
import { advanceAccountGeneration } from "@/data/auth/accountGeneration";

const state = vi.hoisted(() => ({
  push: vi.fn(),
  refs: [] as { current: unknown }[],
  cleanup: undefined as (() => void) | undefined,
}));
vi.mock("expo-router", () => ({ router: { push: state.push } }));
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

it("uses a single scoped selection and drops it on permission, account or owner change", async () => {
  vi.stubEnv("EXPO_PUBLIC_OTR_SHEET_LEDGER_CURRENCY_QA", "true");
  try {
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
  } finally {
    vi.unstubAllEnvs();
  }
});
