import { router, useNavigation } from "expo-router";
import { useCallback, useLayoutEffect, useRef } from "react";
import { getAccountGeneration, subscribeAccountGeneration } from "@/data/auth/accountGeneration";

import type { MessageKey } from "@/ui/locale";

export const hostedLedgerCurrencySheetEnabled = process.env.EXPO_PUBLIC_OTR_SHEET_LEDGER_CURRENCY_QA === "true";

export type LedgerCurrencyChoice = {
  titleKey: MessageKey;
  isCurrent?(): boolean;
} & (
  | { kind: "currency"; selected: string; suggestions: string[]; choose(code: string): void }
  | { kind: "display"; selected: string | null; options: readonly string[]; choose(code: string): void }
  | { kind: "date"; initial: Date; maximumDate?: Date; choose(date: Date): void }
);

let sequence = 0;
let active: { id: string; current(): boolean; originFocused(): boolean; choice: LedgerCurrencyChoice } | undefined;

subscribeAccountGeneration(() => { active = undefined; });

export function readLedgerCurrencySheet(id: string | undefined) {
  return active && active.id === id && active.current() && active.choice.isCurrent?.() !== false
    ? active.choice : undefined;
}

export function releaseLedgerCurrencySheet(id: string | undefined) {
  if (!active || active.id !== id) return;
  active = undefined;
}

export function completeLedgerCurrencySheet(
  id: string | undefined,
  expected: LedgerCurrencyChoice,
  apply: () => void,
) {
  const returnedToOrigin = readLedgerCurrencySheet(id) === expected && active?.originFocused();
  releaseLedgerCurrencySheet(id);
  if (returnedToOrigin) apply();
}

export function useLedgerCurrencySheet(journeyId: string | undefined, sourceKey?: string, enabled = true) {
  const navigation = useNavigation();
  const owner = useRef<{ journeyId?: string; sourceKey?: string; generation: number } | null>(null);
  const invocation = useRef<string | undefined>(undefined);
  const generation = getAccountGeneration();
  useLayoutEffect(() => {
    const token = { journeyId, sourceKey, generation };
    owner.current = token;
    return () => {
      owner.current = null;
      releaseLedgerCurrencySheet(invocation.current);
    };
  }, [enabled, generation, journeyId, sourceKey]);

  return useCallback((choice: LedgerCurrencyChoice) => {
    if (!enabled || !hostedLedgerCurrencySheetEnabled) return false;
    const token = owner.current;
    if (!journeyId) return false;
    if (token?.journeyId !== journeyId || token.sourceKey !== sourceKey ||
      token.generation !== generation || generation !== getAccountGeneration()) return true;
    if (!navigation.isFocused() || active?.current()) return true;
    const id = String(++sequence);
    active = {
      id, choice, originFocused: () => navigation.isFocused(),
      current: () => owner.current === token && generation === getAccountGeneration(),
    };
    invocation.current = id;
    router.push({ pathname: "/ledger-currency-picker", params: { invocation: id } });
    return true;
  }, [enabled, generation, journeyId, navigation, sourceKey]);
}
