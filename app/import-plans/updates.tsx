import { Redirect, router, useLocalSearchParams } from "expo-router";
import { useIsFocused } from "expo-router/react-navigation";
import { useCallback, useRef, useSyncExternalStore } from "react";
import { SheetRoutePanel } from "@/components/SheetRoutePanel";
import { useSheetMotion } from "@/components/SheetHost";
import { getAccountGeneration, subscribeAccountGeneration } from "@/data/auth/accountGeneration";
import { hostedImportEnabled } from "@/features/capture/hostedImport";
import { UpdatesInboxScreen } from "@/features/updates/UpdatesInboxScreen";
import { UiText } from "@/ui/controls";
import { t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";

type ActivityParams = {
  activityId?: string;
  activityJobId?: string;
  activityTripId?: string;
  originGeneration?: string;
};

export default function ImportStatusRoute() {
  const params = useLocalSearchParams<ActivityParams>();
  if (!hostedImportEnabled) return <Redirect href={{ pathname: "/import-updates", params }} />;
  return <HostedImportStatus params={params} />;
}

function HostedImportStatus({ params }: { params: ActivityParams }) {
  useUiLocale();
  const generation = useSyncExternalStore(subscribeAccountGeneration, getAccountGeneration);
  const focused = useIsFocused();
  const { isExitPending } = useSheetMotion();
  const ready = Boolean(params.activityId && params.activityJobId) && params.originGeneration === String(generation);
  const refresh = useRef<(() => void) | null>(null);
  const bindRefresh = useCallback((action: (() => void) | null) => {
    refresh.current = action;
  }, []);
  const canNavigate = () => focused && !isExitPending() && generation === getAccountGeneration();

  return (
    <SheetRoutePanel
      title={t("updates.title")}
      onBack={() => { if (canNavigate()) router.back(); }}
      action={ready ? {
        // ui-foundation-exception: string -- native SF Symbol identifier for Refresh
        icon: "arrow.clockwise",
        label: t("updates.refresh"),
        onPress: () => { if (canNavigate()) refresh.current?.(); },
      } : undefined}
      ownsScroll
    >
      {ready ? (
        <UpdatesInboxScreen bindRefresh={bindRefresh} onOpenImport={(jobId, originGeneration, destination) => {
          if (!canNavigate() || originGeneration !== generation) return;
          if (destination !== "REVIEW" && jobId === params.activityJobId) {
            router.back();
            return;
          }
          router.push({
            pathname: destination === "REVIEW" ? "/import-plans/review" : "/import-plans/composer",
            params: { jobId, originGeneration: String(generation) },
          });
        }} />
      ) : <UiText accessibilityRole="alert">{t("capture.review.batchUnavailable")}</UiText>}
    </SheetRoutePanel>
  );
}
