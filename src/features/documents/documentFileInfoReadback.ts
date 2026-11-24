import { createContext } from "react";

export const DocumentFileInfoRootKey = createContext<string | undefined>(undefined);

const qualified = new Map<string, string>();
const listeners = new Set<() => void>();

export function readQualifiedFileInfo(routeKey: string | undefined, scope: string) {
  return routeKey !== undefined && qualified.get(routeKey) === scope;
}

export function subscribeQualifiedFileInfo(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function publishQualifiedFileInfo(routeKey: string, scope: string) {
  qualified.set(routeKey, scope);
  listeners.forEach(notify => notify());
  return () => {
    if (qualified.get(routeKey) !== scope) return;
    qualified.delete(routeKey);
    listeners.forEach(notify => notify());
  };
}
