import { useCallback, useMemo, useRef } from "react";
import { SheetRouteLayout } from "@/components/SheetRouteLayout";
import { TripMembersExitContext } from "@/features/day-feed/hostedTripMembers";

export const unstable_settings = { initialRouteName: "index" };

export default function TripMembersSheetLayout() {
  const handler = useRef<(() => void) | null>(null);
  const allowed = useRef(false);
  const exit = useMemo(() => ({
    register(close: () => void) {
      handler.current = close;
      return () => { if (handler.current === close) handler.current = null; };
    },
    allowClose() { allowed.current = true; },
  }), []);
  const interceptClose = useCallback(() => {
    if (allowed.current) {
      allowed.current = false;
      return false;
    }
    if (!handler.current) return false;
    handler.current();
    return true;
  }, []);
  return (
    <TripMembersExitContext.Provider value={exit}>
      <SheetRouteLayout immersive interceptClose={interceptClose} />
    </TripMembersExitContext.Provider>
  );
}
