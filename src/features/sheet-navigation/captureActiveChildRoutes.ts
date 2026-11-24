type OriginNavigation = {
  getState(): { key: string; index: number; routes: readonly { key: string }[] } | undefined;
  getParent(): OriginNavigation | undefined;
};

export function captureActiveChildRoutes(navigation: OriginNavigation, rootKey: string) {
  const activeRoutes: (() => boolean)[] = [];
  for (let navigator: OriginNavigation | undefined = navigation; navigator; navigator = navigator.getParent()) {
    const current = navigator;
    const state = current.getState();
    const routeKey = state?.routes[state.index]?.key;
    if (!state || !routeKey) return undefined;
    if (state.key === rootKey) return () => activeRoutes.every(isActive => isActive());
    activeRoutes.push(() => {
      const latest = current.getState();
      return latest?.key === state.key && latest.routes[latest.index]?.key === routeKey;
    });
  }
  return undefined;
}
