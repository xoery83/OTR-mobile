import { router, useNavigation } from "expo-router";
import { useRoute } from "expo-router/react-navigation";
import { useEffect, useRef, type ContextType, type ReactNode } from "react";
import { getAccountGeneration } from "@/data/auth/accountGeneration";
import { useSheetMotion } from "@/components/SheetHost";
import { OpenCalendarRangePickerContext } from "./calendarRangePickerHandoff";
import {
  OpenTripCreateNameContext, readTripCreateCalendar, readTripCreateName,
  releaseTripCreateCalendar, releaseTripCreateName, stageTripCreateCalendar, stageTripCreateName,
} from "./hostedTripCreatePickers";

export function TripCreatePickerFields({ generation, children }: { generation: number; children: ReactNode }) {
  const navigation = useNavigation();
  const { key: ownerKey } = useRoute();
  const { isExitPending } = useSheetMotion();
  const date = useRef<string | undefined>(undefined);
  const name = useRef<string | undefined>(undefined);
  const ownerExists = () => generation === getAccountGeneration() &&
    navigation.getState()?.routes.some(route => route.key === ownerKey);
  const canOpen = () => ownerExists() && navigation.isFocused() && !isExitPending() &&
    !readTripCreateCalendar(date.current) && !readTripCreateName(name.current);
  useEffect(() => () => {
    releaseTripCreateCalendar(date.current);
    releaseTripCreateName(name.current);
  }, []);
  const openDate: NonNullable<ContextType<typeof OpenCalendarRangePickerContext>> = read => {
    if (!canOpen()) return false;
    const selection = stageTripCreateCalendar(generation, () => ownerExists() ? read() : null);
    if (!selection) return false;
    date.current = selection;
    router.push({ pathname: "/trip-create/dates", params: { selection, ownerKey } });
    return true;
  };
  const openName: NonNullable<ContextType<typeof OpenTripCreateNameContext>> = read => {
    if (!canOpen()) return false;
    const selection = stageTripCreateName(generation, () => ownerExists() ? read() : null);
    if (!selection) return false;
    name.current = selection;
    router.push({ pathname: "/trip-create/name", params: { selection, ownerKey } });
    return true;
  };
  return (
    <OpenCalendarRangePickerContext.Provider value={openDate}>
      <OpenTripCreateNameContext.Provider value={openName}>
        {children}
      </OpenTripCreateNameContext.Provider>
    </OpenCalendarRangePickerContext.Provider>
  );
}

export function useTripCreatePickerBack(ownerKey: string | undefined) {
  const navigation = useNavigation();
  const { key } = useRoute();
  const { isExitPending } = useSheetMotion();
  const active = () => {
    const state = navigation.getState();
    if (!navigation.isFocused() || !state ||
        state.routes[state.index]?.key !== key ||
        state.routes[state.index - 1]?.key !== ownerKey) return undefined;
    return ownerKey ? state : undefined;
  };
  const back = () => {
    const state = active();
    if (!state || isExitPending()) return false;
    navigation.dispatch({ type: "GO_BACK", target: state.key, source: key });
    const result = navigation.getState();
    return result?.key === state.key && result.routes[result.index]?.key === ownerKey &&
      !result.routes.some(route => route.key === key);
  };
  return { boundToOwner: Boolean(active()), back };
}
