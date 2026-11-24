import { Redirect, useLocalSearchParams, useNavigation } from "expo-router";
import { useRoute } from "expo-router/react-navigation";
import { useCallback, useSyncExternalStore } from "react";
import { useSheetMotion } from "@/components/SheetHost";
import { SheetRoutePanel } from "@/components/SheetRoutePanel";
import { getAccountGeneration, subscribeAccountGeneration } from "@/data/auth/accountGeneration";
import { ownsImportSheetOrigin, popImportSheetPage } from "@/features/capture/importSheetNavigation";
import { UiText } from "@/ui/controls";
import { t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import CaptureRoute from "../(tabs)/capture";
import { hostedImportEnabled } from "@/features/capture/hostedImport";

export default function NestedImportComposer() {
  const params = useLocalSearchParams<{ jobId?: string; originGeneration?: string; originKey?: string }>();
  if (!hostedImportEnabled) return <Redirect href="/import-plans" />;
  if (params.jobId) return <RelatedImportComposer {...params} />;
  return <CaptureRoute overlay hosted hostedChild />;
}

function RelatedImportComposer({ originGeneration, originKey }: { originGeneration?: string; originKey?: string }) {
  useUiLocale();
  const generation = useSyncExternalStore(subscribeAccountGeneration, getAccountGeneration);
  const navigation = useNavigation();
  const { key } = useRoute();
  const { isExitPending } = useSheetMotion();
  const owned = ownsImportSheetOrigin(navigation, key, originKey);
  const canUseHostedSource = useCallback(() => originGeneration === String(getAccountGeneration()) &&
    !isExitPending() && ownsImportSheetOrigin(navigation, key, originKey),
  [isExitPending, key, navigation, originGeneration, originKey]);
  const back = () => {
    if (!isExitPending()) popImportSheetPage(navigation, key, originKey);
  };
  if (!owned || originGeneration !== String(generation)) return (
    <SheetRoutePanel title={t("capture.review.batch")} onBack={owned ? back : undefined}>
      <UiText accessibilityRole="alert">{t("capture.review.batchUnavailable")}</UiText>
    </SheetRoutePanel>
  );
  return <CaptureRoute overlay hosted hostedChild onHostedClose={back} canUseHostedSource={canUseHostedSource} />;
}
