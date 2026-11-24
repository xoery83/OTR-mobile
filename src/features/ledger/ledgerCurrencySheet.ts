import { router, useNavigation } from "expo-router";
import { useCallback, useLayoutEffect, useRef, type ReactNode } from "react";
import { getAccountGeneration, subscribeAccountGeneration } from "@/data/auth/accountGeneration";

import type { MessageKey } from "@/ui/locale";
import type { ExpenseSharingInputs } from "./ExpenseSharingSheet";

export const hostedLedgerCurrencySheetEnabled: boolean = true;
export const hostedExpenseFieldsEnabled: boolean = true;

export type LedgerCurrencyChoice = {
  titleKey: MessageKey;
  isCurrent?(): boolean;
} & (
  | { kind: "currency"; selected: string; suggestions: string[]; choose(code: string): void }
  | {
    kind: "display";
    selected: string | null;
    readOptions(): readonly string[];
    subscribeOptions(listener: () => void): () => void;
    choose(code: string): void;
  }
  | { kind: "confirm-date"; expenseId: string; journeyId: string; isBusy(): boolean; setBusy(busy: boolean): void }
  | {
    kind: "fx-details";
    read(): ReactNode;
    subscribe(listener: () => void): () => void;
    isBusy(): boolean;
    bindExitPending(read: (() => boolean) | undefined): void;
    onOpen(): void;
    onClose(): void;
  }
  | { kind: "date"; initial: Date; maximumDate?: Date; choose(date: Date): void }
  | ({ kind: "sharing" } & ExpenseSharingInputs)
  | { kind: "category"; selected: string; choose(category: string): void }
);

let sequence = 0;
let active: { id: string; current(): boolean; originFocused(): boolean; choice: LedgerCurrencyChoice } | undefined;

subscribeAccountGeneration(() => { active = undefined; });

export function readLedgerCurrencySheet(id: string | undefined) {
  return active && active.id === id && active.current() && active.choice.isCurrent?.() !== false
    ? active.choice : undefined;
}

export function interceptLedgerCurrencySheetClose(id: string | undefined) {
  const choice = readLedgerCurrencySheet(id);
  return (choice?.kind === "fx-details" || choice?.kind === "confirm-date") && choice.isBusy();
}

export function releaseLedgerCurrencySheet(id: string | undefined, notifyOwner = false) {
  if (!active || active.id !== id) return;
  const entry = active;
  active = undefined;
  if (notifyOwner && entry.current() && entry.choice.kind === "fx-details") entry.choice.onClose();
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

export function useLedgerCurrencySheet(
  journeyId: string | undefined,
  sourceKey?: string,
  enabled = true,
  featureEnabled = hostedLedgerCurrencySheetEnabled,
) {
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
    if (!enabled || !featureEnabled) return false;
    if (choice.kind !== "fx-details" && choice.isCurrent?.() === false) return true;
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
    if (choice.kind === "fx-details") {
      choice.onOpen();
      if (readLedgerCurrencySheet(id) !== choice) {
        releaseLedgerCurrencySheet(id, true);
        return true;
      }
    }
    router.push({ pathname: "/ledger-currency-picker", params: { invocation: id } });
    return true;
  }, [enabled, featureEnabled, generation, journeyId, navigation, sourceKey]);
}
