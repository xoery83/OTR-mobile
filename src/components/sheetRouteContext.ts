import { createContext, useContext } from "react";

export const SheetRouteContext = createContext<{
  reportContentHeight(height: number): void;
  reportHeaderHeight(height: number): void;
} | null>(null);

export function useSheetRouteLayout() {
  const layout = useContext(SheetRouteContext);
  if (!layout) throw new Error("SHEET_ROUTE_LAYOUT_UNAVAILABLE");
  return layout;
}
