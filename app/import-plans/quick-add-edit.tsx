import { Redirect, router, useLocalSearchParams, useNavigation } from "expo-router";
import { usePreventRemove, useRoute } from "expo-router/react-navigation";
import { useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useWindowDimensions } from "react-native";
import { SheetNavigationHeader, useSheetContentSize } from "@/components/SheetNavigationHeader";
import { SheetRoutePanel } from "@/components/SheetRoutePanel";
import { SheetBackSwipeEdge } from "@/components/SheetScrollView";
import { useSheetMotion } from "@/components/SheetHost";
import { useSheetRouteLayout } from "@/components/sheetRouteContext";
import { getAccountGeneration, subscribeAccountGeneration } from "@/data/auth/accountGeneration";
import { hostedImportEnabled } from "@/features/capture/hostedImport";
import { HostedManualEditorContext, HostedManualEditorIntent, type ManualEditorHeaderProps } from "@/features/day-feed/ManualEditorHeader";
import { isManualItineraryFamily, ManualItineraryContent } from "@/features/day-feed/ManualItineraryContent";
import { FlightAirportHandoffContext, OpenFlightAirportContext } from "@/features/day-feed/hostedFlightAirport";
import { hostedManualItineraryEnabled, ManualItineraryExitContext, readManualItinerary, subscribeManualItinerary } from "@/features/day-feed/hostedManualItinerary";
import { t } from "@/ui/locale";

export default function QuickAddItineraryEditorRoute() {
  if (!hostedImportEnabled || !hostedManualItineraryEnabled) return <Redirect href="/import-plans" />;
  return <HostedQuickAddEditor />;
}

type Exit = { kind: "back" | "close"; afterClose?: () => void } | { kind: "saved"; id: string };

function HostedQuickAddEditor() {
  const { invocation, family } = useLocalSearchParams<{ invocation?: string; family?: string }>();
  useSyncExternalStore(subscribeAccountGeneration, getAccountGeneration);
  const entry = useSyncExternalStore(subscribeManualItinerary, () => readManualItinerary(invocation));
  const navigation = useNavigation();
  const route = useRoute();
  const exit = useContext(ManualItineraryExitContext);
  const airport = useContext(FlightAirportHandoffContext);
  const { isExitPending, exitPending, requestCloseWithAction } = useSheetMotion();
  const dismiss = useRef<(() => void) | null>(null);
  const intent = useRef<"back" | "close">("back");
  const dispatched = useRef(false);
  const savedId = useRef<string | null>(null);
  const [approved, setApproved] = useState<Exit>();
  const familyAllowed = entry && family && isManualItineraryFamily(family, entry.localOnly) ? family : null;

  const canEdit = useCallback(() =>
    !savedId.current && !isExitPending() && Boolean(readManualItinerary(invocation)),
  [invocation, isExitPending]);
  const goBack = useCallback((afterClose?: () => void) => {
    const state = navigation.getState();
    if (state?.routes[state.index]?.key !== route.key) return;
    navigation.dispatch({ type: "GO_BACK", target: state.key, source: route.key });
    afterClose?.();
  }, [navigation, route.key]);
  const registerDismissHandler = useCallback((handler: () => void) => {
    dismiss.current = handler;
    const unregister = exit?.registerClose(() => {
      if (savedId.current) setApproved({ kind: "saved", id: savedId.current });
      else {
        intent.current = "close";
        handler();
      }
    });
    return () => {
      if (dismiss.current === handler) dismiss.current = null;
      unregister?.();
    };
  }, [exit]);
  const back = () => {
    if (savedId.current) setApproved({ kind: "saved", id: savedId.current });
    else {
      intent.current = "back";
      dismiss.current?.();
    }
  };
  usePreventRemove(Boolean(familyAllowed && !approved), ({ data: { action } }) => {
    if (action.type !== "GO_BACK" && action.type !== "POP") return;
    const state = navigation.getState();
    if (action.target ? action.target !== state?.key : !navigation.isFocused()) return;
    back();
  });

  useEffect(() => {
    if (!approved || dispatched.current) return;
    dispatched.current = true;
    if (approved.kind === "back") {
      goBack(approved.afterClose);
      return;
    }
    exit?.allowClose();
    requestCloseWithAction(() => {
      if (approved.kind === "saved") {
        savedId.current = null;
        readManualItinerary(invocation)?.onSaved(approved.id);
      } else approved.afterClose?.();
    });
  }, [approved, exit, goBack, invocation, requestCloseWithAction]);
  useEffect(() => {
    if (!approved || approved.kind === "back" || !dispatched.current || exitPending || isExitPending()) return;
    dispatched.current = false;
    setApproved(undefined);
  }, [approved, exitPending, isExitPending]);

  if (!entry || !familyAllowed)
    return <SheetRoutePanel title={t("formEntry.title")} onBack={goBack}>{null}</SheetRoutePanel>;
  return (
    <HostedManualEditorIntent.Provider value={canEdit}>
      <HostedManualEditorContext.Provider value={props => (
        <HostedHeader {...props} onLeft={back} rightDisabled={props.rightDisabled || Boolean(savedId.current)} />
      )}>
        <OpenFlightAirportContext.Provider value={read => {
          if (!airport || !navigation.isFocused() || isExitPending() || !readManualItinerary(invocation)) return false;
          const selection = airport.stage(read);
          if (!selection) return false;
          router.push({ pathname: "/import-plans/quick-add-airport", params: { invocation, selection } });
          return true;
        }}>
          <ManualItineraryContent
            {...entry}
            hostedFamily={familyAllowed}
            registerDismissHandler={registerDismissHandler}
            onClose={afterClose => setApproved({ kind: intent.current, afterClose })}
            onSaved={id => {
              savedId.current = id;
              setApproved({ kind: "saved", id });
            }}
          />
        </OpenFlightAirportContext.Provider>
      </HostedManualEditorContext.Provider>
    </HostedManualEditorIntent.Provider>
  );
}

function HostedHeader({ title, onLeft, leftDisabled, onRight, rightLabel, rightDisabled }: ManualEditorHeaderProps) {
  const { reportContentHeight, reportHeaderHeight } = useSheetRouteLayout();
  const measure = useSheetContentSize(reportContentHeight, reportHeaderHeight);
  const { height } = useWindowDimensions();
  useEffect(() => { measure(0, height); }, [height, measure]);
  return (
    <>
      <SheetNavigationHeader
        title={title}
        level="child"
        onLeadingAction={onLeft}
        leadingDisabled={leftDisabled}
        action={onRight && rightLabel ? { label: rightLabel, onPress: onRight, disabled: rightDisabled } : undefined}
      />
      {leftDisabled ? null : <SheetBackSwipeEdge onBack={onLeft} />}
    </>
  );
}
