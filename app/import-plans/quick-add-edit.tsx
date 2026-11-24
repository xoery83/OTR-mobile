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
import { hostedManualItineraryEnabled, ManualItineraryExitContext, readManualItinerary, releaseManualItinerary, subscribeManualItinerary, type DetailEditorPresentation } from "@/features/day-feed/hostedManualItinerary";
import { OpenParticipantPickerContext, ParticipantPickerHandoffContext } from "@/features/day-feed/participantPickerHandoff";
import { CalendarRangePickerHandoffContext, OpenCalendarRangePickerContext } from "@/features/day-feed/calendarRangePickerHandoff";
import { ItineraryClockHandoffContext, OpenItineraryClockContext } from "@/features/day-feed/itineraryClockPicker";
import { HostedPlaceSearchHandoffContext, OpenHostedPlaceSearchContext, type PlaceSearchSheetProps } from "@/features/place-search/hostedPlaceSearch";
import { FormScanSourceHandoffContext, OpenFormScanSourceContext, type FormScanSourceEntry } from "@/features/day-feed/formScanSourceHandoff";
import { OpenTransportTypeContext, TransportTypeHandoffContext, type TransportTypeEntry } from "@/features/day-feed/transportTypePickerHandoff";
import { t } from "@/ui/locale";

export default function QuickAddItineraryEditorRoute() {
  if (!hostedImportEnabled || !hostedManualItineraryEnabled) return <Redirect href="/import-plans" />;
  return <HostedQuickAddEditor />;
}

type Exit = { kind: "back" | "close"; afterClose?: () => void } | { kind: "saved"; id: string };

function HostedQuickAddEditor() {
  const { invocation, family, chooserKey, detail } = useLocalSearchParams<{
    invocation?: string; family?: string; chooserKey?: string; detail?: string;
  }>();
  useSyncExternalStore(subscribeAccountGeneration, getAccountGeneration);
  const entry = useSyncExternalStore(subscribeManualItinerary, () => readManualItinerary(invocation));
  const standalone = detail === "1";
  const navigation = useNavigation();
  const route = useRoute();
  const exit = useContext(ManualItineraryExitContext);
  const airport = useContext(FlightAirportHandoffContext);
  const participants = useContext(ParticipantPickerHandoffContext);
  const calendar = useContext(CalendarRangePickerHandoffContext);
  const clock = useContext(ItineraryClockHandoffContext);
  const place = useContext(HostedPlaceSearchHandoffContext);
  const scanSource = useContext(FormScanSourceHandoffContext);
  const transportType = useContext(TransportTypeHandoffContext);
  const { isExitPending, exitPending, requestClose, requestCloseWithAction } = useSheetMotion();
  const dismiss = useRef<(() => void) | null>(null);
  const intent = useRef<"back" | "close">("back");
  const dispatched = useRef(false);
  const savedId = useRef<string | null>(null);
  const [approved, setApproved] = useState<Exit>();
  const editorFocusEpoch = useRef(0);
  useEffect(() => navigation.addListener("blur", () => { editorFocusEpoch.current++; }), [navigation]);
  const activePicker = useRef<(() => unknown) | undefined>(undefined);
  const hasChooser = useCallback(() => {
    const routes = navigation.getState()?.routes;
    const index = routes?.findIndex(candidate => candidate.key === route.key) ?? -1;
    return index > 0 && Boolean(chooserKey && routes?.[index - 1]?.key === chooserKey);
  }, [chooserKey, navigation, route.key]);
  const belongsToOwner = useCallback(() => {
    const origin = entry?.detailEdit;
    if (!origin) return !standalone && hasChooser() && (entry?.entryPoint !== "day-insertion" ||
      (!!entry.dayInsertionOriginKey && exit?.hasOrigin?.(entry.dayInsertionOriginKey) === true));
    return standalone && !chooserKey && origin.family === family && exit?.hasOrigin?.(origin.originKey) === true;
  }, [chooserKey, entry, exit, family, hasChooser, standalone]);
  const familyAllowed = entry && belongsToOwner() && family && isManualItineraryFamily(family, entry.localOnly) ? family : null;

  const canEdit = useCallback(() =>
    !savedId.current && !isExitPending() && !!entry && readManualItinerary(invocation) === entry && belongsToOwner(),
  [belongsToOwner, entry, invocation, isExitPending]);
  const canOpenPicker = useCallback(() => navigation.isFocused() && canEdit() && !activePicker.current?.(), [canEdit, navigation]);
  const openPlaceSearch = useCallback((read: () => PlaceSearchSheetProps | null) => {
    if (!place || !canOpenPicker()) return undefined;
    const selection = place.stage(() => readManualItinerary(invocation) ? read() : null);
    if (!selection) return undefined;
    activePicker.current = () => place.read(selection);
    router.push({ pathname: "/import-plans/quick-add-place",
      params: { invocation, selection, editorKey: route.key } });
    return () => place.release(selection);
  }, [canOpenPicker, invocation, place, route.key]);
  const openScanSource = useCallback((read: () => FormScanSourceEntry | null) => {
    if (!scanSource || !canOpenPicker()) return;
    const owner = readManualItinerary(invocation);
    const ownsEditor = () => owner && readManualItinerary(invocation) === owner && canEdit();
    const selection = scanSource.stage(() => {
      const entry = ownsEditor() ? read() : null;
      if (!entry) return null;
      return { ...entry, acquire(source) {
        const epoch = editorFocusEpoch.current;
        const isCurrent = () => {
          const state = navigation.getState();
          return Boolean(ownsEditor() && editorFocusEpoch.current === epoch &&
            navigation.isFocused() && state?.routes[state.index]?.key === route.key);
        };
        if (isCurrent()) entry.choose(source, isCurrent);
      } };
    });
    if (!selection) return;
    activePicker.current = () => scanSource.read(selection);
    router.push({ pathname: "/import-plans/quick-add-scan-source",
      params: { invocation, selection, editorKey: route.key } });
  }, [canEdit, canOpenPicker, invocation, navigation, route.key, scanSource]);
  const openTransportType = useCallback((choice: TransportTypeEntry) => {
    if (!transportType || !canOpenPicker()) return;
    const owner = readManualItinerary(invocation);
    const selection = transportType.stage(() =>
      owner && readManualItinerary(invocation) === owner && canEdit() && choice.isCurrent() ? choice : null);
    if (!selection) return;
    activePicker.current = () => transportType.read(selection);
    router.push({ pathname: "/import-plans/quick-add-transport-type",
      params: { invocation, selection, editorKey: route.key } });
  }, [canEdit, canOpenPicker, invocation, route.key, transportType]);
  const goBack = useCallback((afterClose?: () => void, unavailable = false) => {
    const state = navigation.getState();
    if (!navigation.isFocused() || isExitPending() || state?.routes[state.index]?.key !== route.key) return false;
    if (unavailable && state.index === 0) {
      requestClose();
      return true;
    }
    const previous = state.routes[state.index - 1];
    if (!previous || (!unavailable && previous.key !== chooserKey)) return false;
    navigation.dispatch({ type: "GO_BACK", target: state.key, source: route.key });
    const next = navigation.getState();
    if (next?.key !== state.key || next.routes[next.index]?.key !== previous.key ||
        next.routes.some(candidate => candidate.key === route.key)) return false;
    if (readManualItinerary(invocation) === entry) afterClose?.();
    return true;
  }, [chooserKey, entry, invocation, isExitPending, navigation, requestClose, route.key]);
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
  useEffect(() => {
    if (!standalone) return;
    return () => {
      queueMicrotask(() => {
        if (navigation.getState()?.routes.some(candidate => candidate.key === route.key)) return;
        releaseManualItinerary(invocation);
      });
    };
  }, [invocation, navigation, route.key, standalone]);
  const back = () => {
    if (savedId.current) setApproved({ kind: "saved", id: savedId.current });
    else {
      intent.current = standalone ? "close" : "back";
      dismiss.current?.();
    }
  };
  usePreventRemove(Boolean(familyAllowed && !approved), ({ data: { action } }) => {
    if (action.type !== "GO_BACK" && action.type !== "POP") return;
    const state = navigation.getState();
    if (standalone) {
      if (!navigation.isFocused()) return;
    } else if (action.target ? action.target !== state?.key : !navigation.isFocused()) return;
    back();
  });

  useEffect(() => {
    if (!approved || dispatched.current) return;
    dispatched.current = true;
    if (approved.kind === "back") {
      if (!goBack(approved.afterClose)) {
        queueMicrotask(() => {
          dispatched.current = false;
          setApproved(current => current === approved ? undefined : current);
        });
      }
      return;
    }
    const detailOwner = standalone ? readManualItinerary(invocation) : undefined;
    if (standalone && (!detailOwner || detailOwner !== entry || !belongsToOwner())) return;
    exit?.allowClose();
    requestCloseWithAction(() => {
      if (standalone) {
        if (!detailOwner?.detailEdit || readManualItinerary(invocation) !== detailOwner) return;
        releaseManualItinerary(invocation);
        if (approved.kind === "saved") {
          savedId.current = null;
          if (approved.id === detailOwner.detailEdit.itemId && detailOwner.detailEdit.originFocused())
            detailOwner.onSaved(approved.id);
        } else if (approved.kind === "close") {
          approved.afterClose?.();
        }
      } else if (approved.kind === "saved") {
        savedId.current = null;
        readManualItinerary(invocation)?.onSaved(approved.id);
      } else approved.afterClose?.();
    });
  }, [approved, belongsToOwner, entry, exit, goBack, invocation, requestCloseWithAction, standalone]);
  useEffect(() => {
    if (!approved || approved.kind === "back" || !dispatched.current || exitPending || isExitPending()) return;
    dispatched.current = false;
    setApproved(undefined);
  }, [approved, exitPending, isExitPending]);

  if (!entry || !familyAllowed)
    return <SheetRoutePanel title={t("formEntry.title")} onBack={standalone ? undefined : () => goBack(undefined, true)}>{null}</SheetRoutePanel>;
  const DetailEditor = entry.detailEdit?.render;
  const presentation: DetailEditorPresentation = {
    embedded: true,
    registerDismissHandler,
    onClose: afterClose => setApproved({ kind: intent.current, afterClose }),
    onSaved: id => {
      savedId.current = id;
      setApproved({ kind: "saved", id });
    },
  };
  return (
    <HostedManualEditorIntent.Provider value={canEdit}>
      <HostedManualEditorContext.Provider value={props => (
        <HostedHeader
          {...props}
          onLeft={back}
          root={standalone}
          leftDisabled={props.leftDisabled && !savedId.current}
          rightDisabled={props.rightDisabled || Boolean(savedId.current)}
        />
      )}>
        <OpenFlightAirportContext.Provider value={read => {
          if (!airport || !canOpenPicker()) return false;
          const owner = readManualItinerary(invocation);
          const selection = airport.stage(() =>
            owner && readManualItinerary(invocation) === owner && canEdit() ? read() : null);
          if (!selection) return false;
          activePicker.current = () => airport.read(selection);
          router.push({ pathname: "/import-plans/quick-add-airport", params: { invocation, selection, editorKey: route.key } });
          return true;
        }}>
          <OpenParticipantPickerContext.Provider value={read => {
            if (!participants || !canOpenPicker()) return;
            const selection = participants.stage(() => readManualItinerary(invocation) ? read() : null);
            if (!selection) return;
            activePicker.current = () => participants.read(selection);
            router.push({
              pathname: "/import-plans/quick-add-participants",
              params: { invocation, selection, editorKey: route.key },
            });
          }}>
            <OpenCalendarRangePickerContext.Provider value={read => {
              if (!calendar || !canOpenPicker()) return false;
              const selection = calendar.stage(() => readManualItinerary(invocation) ? read() : null);
              if (!selection) return false;
              activePicker.current = () => calendar.read(selection);
              router.push({ pathname: "/import-plans/quick-add-calendar-range",
                params: { invocation, selection, editorKey: route.key } });
              return true;
            }}>
              <OpenItineraryClockContext.Provider value={read => {
                if (!clock || !canOpenPicker()) return false;
                const selection = clock.stage(() => readManualItinerary(invocation) ? read() : null);
                if (!selection) return false;
                activePicker.current = () => clock.read(selection);
                router.push({ pathname: "/import-plans/quick-add-clock",
                  params: { invocation, selection, editorKey: route.key } });
                return true;
              }}>
                <OpenHostedPlaceSearchContext.Provider value={openPlaceSearch}>
                  <OpenFormScanSourceContext.Provider value={openScanSource}>
                    <OpenTransportTypeContext.Provider value={openTransportType}>
                      {DetailEditor
                        ? <DetailEditor {...presentation} />
                        : <ManualItineraryContent {...entry} {...presentation} hostedFamily={familyAllowed} />}
                    </OpenTransportTypeContext.Provider>
                  </OpenFormScanSourceContext.Provider>
                </OpenHostedPlaceSearchContext.Provider>
              </OpenItineraryClockContext.Provider>
            </OpenCalendarRangePickerContext.Provider>
          </OpenParticipantPickerContext.Provider>
        </OpenFlightAirportContext.Provider>
      </HostedManualEditorContext.Provider>
    </HostedManualEditorIntent.Provider>
  );
}

function HostedHeader({ title, onLeft, leftDisabled, onRight, rightLabel, rightDisabled, root }: ManualEditorHeaderProps & { root: boolean }) {
  const { reportContentHeight, reportHeaderHeight } = useSheetRouteLayout();
  const measure = useSheetContentSize(reportContentHeight, reportHeaderHeight);
  const { height } = useWindowDimensions();
  useEffect(() => { measure(0, height); }, [height, measure]);
  return (
    <>
      <SheetNavigationHeader
        title={title}
        level={root ? "root" : "child"}
        onLeadingAction={onLeft}
        leadingDisabled={leftDisabled}
        action={onRight && rightLabel ? { label: rightLabel, onPress: onRight, disabled: rightDisabled } : undefined}
      />
      {root || leftDisabled ? null : <SheetBackSwipeEdge onBack={onLeft} />}
    </>
  );
}
