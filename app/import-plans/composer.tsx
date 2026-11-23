import { Redirect, router, useLocalSearchParams } from "expo-router";
import { useSyncExternalStore } from "react";
import { SheetRoutePanel } from "@/components/SheetRoutePanel";
import { getAccountGeneration, subscribeAccountGeneration } from "@/data/auth/accountGeneration";
import { UiText } from "@/ui/controls";
import { t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import CaptureRoute from "../(tabs)/capture";
import { hostedImportEnabled } from "@/features/capture/hostedImport";

export default function NestedImportComposer() {
  useUiLocale();
  const { jobId, originGeneration } = useLocalSearchParams<{ jobId?: string; originGeneration?: string }>();
  const generation = useSyncExternalStore(subscribeAccountGeneration, getAccountGeneration);
  if (!hostedImportEnabled) return <Redirect href="/import-plans" />;
  if (jobId && originGeneration !== String(generation)) return (
    <SheetRoutePanel title={t("capture.review.batch")} onBack={() => router.back()}>
      <UiText accessibilityRole="alert">{t("capture.review.batchUnavailable")}</UiText>
    </SheetRoutePanel>
  );
  return <CaptureRoute overlay hosted hostedChild />;
}
