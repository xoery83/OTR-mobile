import { useLocalSearchParams, useNavigation } from "expo-router";
import { usePreventRemove, useRoute } from "expo-router/react-navigation";
import { useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { SheetRoutePanel } from "@/components/SheetRoutePanel";
import { useSheetMotion } from "@/components/SheetHost";
import { TripMembersExitContext, tripMembersInvocations } from "@/features/day-feed/hostedTripMembers";
import { AddTravelerForm, type AddTravelerSurfaceProps } from "@/features/people/AddTravelerSheet";
import { t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";

export default function TripMembersAddRoute() {
  useUiLocale();
  const { invocation } = useLocalSearchParams<{ invocation?: string }>();
  const navigation = useNavigation();
  const route = useRoute();
  const popAdd = useCallback(() => {
    const state = navigation.getState();
    if (state?.routes[state.index]?.key !== route.key) return;
    navigation.dispatch({ type: "GO_BACK", target: state.key, source: route.key });
  }, [navigation, route.key]);
  const read = () => tripMembersInvocations.read(invocation);
  const entry = useSyncExternalStore(tripMembersInvocations.subscribe, read);
  const { exitPending, isExitPending, requestClose } = useSheetMotion();
  const exit = useContext(TripMembersExitContext);
  const guard = useRef<((close: () => void) => void) | null>(null);
  const dispatched = useRef(false);
  const [approved, setApproved] = useState<"back" | "close">();
  const registerDismissHandler = useCallback((handler: (close: () => void) => void) => {
    guard.current = handler;
    const unregister = exit?.register(() => handler(() => setApproved("close")));
    return () => {
      if (guard.current === handler) guard.current = null;
      unregister?.();
    };
  }, [exit]);
  usePreventRemove(Boolean(entry && !approved), ({ data: { action } }) => {
    const state = navigation.getState();
    if (action.type !== "GO_BACK" && action.type !== "POP") return;
    if (action.target ? action.target !== state?.key : !navigation.isFocused()) return;
    guard.current?.(() => setApproved("back"));
  });
  useEffect(() => {
    if (!approved || dispatched.current) return;
    dispatched.current = true;
    if (approved === "back") popAdd();
    else {
      exit?.allowClose();
      requestClose();
    }
  }, [approved, exit, popAdd, requestClose]);
  useEffect(() => {
    if (approved !== "close" || !dispatched.current || exitPending || isExitPending()) return;
    dispatched.current = false;
    setApproved(undefined);
  }, [approved, exitPending, isExitPending]);

  if (!entry) return <SheetRoutePanel title={t("people.addTraveler")} onBack={popAdd}>{null}</SheetRoutePanel>;
  return <AddTravelerForm
    HostedSurface={HostedAddTravelerSurface}
    submissionEnabled={!!entry.onAddTraveler && entry.members?.state === "AVAILABLE"}
    registerDismissHandler={registerDismissHandler}
    onClose={() => setApproved("back")}
    onSave={async input => {
      const latest = read();
      if (!latest?.onAddTraveler || latest.members?.state !== "AVAILABLE")
        throw Error("TRIP_MEMBERS_SCOPE_UNAVAILABLE");
      await latest.onAddTraveler(input);
    }}
  />;
}

function HostedAddTravelerSurface({ title, close, closeDisabled, action, children }: AddTravelerSurfaceProps) {
  return (
    <SheetRoutePanel title={title} onBack={close} leadingDisabled={closeDisabled} action={action}>
      {children}
    </SheetRoutePanel>
  );
}
