import { Redirect, useLocalSearchParams, useNavigation } from "expo-router";
import { useRoute } from "expo-router/react-navigation";
import { useCallback, useRef, useSyncExternalStore } from "react";
import { SheetRoutePanel } from "@/components/SheetRoutePanel";
import { useSheetMotion } from "@/components/SheetHost";
import { getAccountGeneration, subscribeAccountGeneration } from "@/data/auth/accountGeneration";
import { hostedImportEnabled } from "@/features/capture/hostedImport";
import { activeImportSheetPage, ownsImportSheetOrigin, popImportSheetPage } from "@/features/capture/importSheetNavigation";
import { UpdatesInboxScreen } from "@/features/updates/UpdatesInboxScreen";
import { UiText } from "@/ui/controls";
import { t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";

type ActivityParams = {
  activityId?: string;
  activityJobId?: string;
  activityTripId?: string;
  originGeneration?: string;
  originKey?: string;
};

export default function ImportStatusRoute() {
  const params = useLocalSearchParams<ActivityParams>();
  if (!hostedImportEnabled) return <Redirect href={{ pathname: "/import-updates", params }} />;
  return <HostedImportStatus params={params} />;
}

function HostedImportStatus({ params }: { params: ActivityParams }) {
  useUiLocale();
  const generation = useSyncExternalStore(subscribeAccountGeneration, getAccountGeneration);
  const navigation = useNavigation();
  const { key } = useRoute();
  const { isExitPending } = useSheetMotion();
  const owned = ownsImportSheetOrigin(navigation, key, params.originKey);
  const ready = owned && Boolean(params.activityId && params.activityJobId) &&
    params.originGeneration === String(generation);
  const refresh = useRef<(() => void) | null>(null);
  const bindRefresh = useCallback((action: (() => void) | null) => {
    refresh.current = action;
  }, []);
  const activePage = () => !isExitPending() && generation === getAccountGeneration() &&
    ownsImportSheetOrigin(navigation, key, params.originKey) ? activeImportSheetPage(navigation, key) : undefined;
  const back = () => {
    if (!isExitPending()) popImportSheetPage(navigation, key, params.originKey);
  };

  return (
    <SheetRoutePanel
      title={t("updates.title")}
      onBack={owned ? back : undefined}
      action={ready ? {
        // ui-foundation-exception: string -- native SF Symbol identifier for Refresh
        icon: "arrow.clockwise",
        label: t("updates.refresh"),
        onPress: () => { if (activePage()) refresh.current?.(); },
      } : undefined}
      ownsScroll
    >
      {ready ? (
        <UpdatesInboxScreen bindRefresh={bindRefresh} onOpenImport={(jobId, originGeneration, destination) => {
          const state = activePage();
          if (!state || originGeneration !== generation) return;
          if (destination !== "REVIEW" && jobId === params.activityJobId) {
            back();
            return;
          }
          navigation.dispatch({
            type: "PUSH", target: state.key, source: key,
            payload: {
              name: destination === "REVIEW" ? "review" : "composer",
              params: { jobId, originGeneration: String(generation), originKey: key },
            },
          });
        }} />
      ) : <UiText accessibilityRole="alert">{t("capture.review.batchUnavailable")}</UiText>}
    </SheetRoutePanel>
  );
}
