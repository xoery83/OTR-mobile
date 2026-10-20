import { useSyncExternalStore } from "react";
import { getUiLocale, subscribeUiLocale } from "./locale";
export function useUiLocale() {
  return useSyncExternalStore(subscribeUiLocale, getUiLocale, getUiLocale);
}
