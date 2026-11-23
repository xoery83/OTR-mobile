import { Redirect, router, useLocalSearchParams, useNavigation } from "expo-router";
import { useEffect, useSyncExternalStore } from "react";
import { SheetRoutePanel } from "@/components/SheetRoutePanel";
import { useSheetMotion } from "@/components/SheetHost";
import {
  getAccountGeneration,
  subscribeAccountGeneration,
} from "@/data/auth/accountGeneration";
import { hostedImportEnabled } from "@/features/capture/hostedImport";
import {
  hostedManualItineraryEnabled,
  readManualItinerary,
  releaseManualItinerary,
} from "@/features/day-feed/hostedManualItinerary";
import {
  isManualItineraryFamily,
  ManualItineraryChoices,
} from "@/features/day-feed/ManualItineraryContent";
import { t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";

export default function QuickAddItineraryRoute() {
  if (!hostedImportEnabled || !hostedManualItineraryEnabled)
    return <Redirect href="/import-plans" />;
  return <HostedQuickAddItinerary />;
}

function HostedQuickAddItinerary() {
  useUiLocale();
  useSyncExternalStore(subscribeAccountGeneration, getAccountGeneration);
  const { invocation } = useLocalSearchParams<{ invocation?: string }>();
  const entry = readManualItinerary(invocation);
  const { isExitPending } = useSheetMotion();
  const navigation = useNavigation();
  useEffect(
    () => () => {
      queueMicrotask(() => releaseManualItinerary(invocation));
    },
    [invocation],
  );
  const current = () => navigation.isFocused() && !isExitPending();
  return (
    <SheetRoutePanel
      title={t("formEntry.title")}
      onBack={() => {
        if (current()) router.back();
      }}
    >
      {entry ? (
        <ManualItineraryChoices
          localOnly={entry.localOnly}
          onChoose={(family) => {
            const latest = readManualItinerary(invocation);
            if (
              !current() ||
              !latest ||
              !isManualItineraryFamily(family, latest.localOnly)
            )
              return;
            router.navigate({
              pathname: "/import-plans/quick-add-edit",
              params: { invocation, family },
            });
          }}
        />
      ) : null}
    </SheetRoutePanel>
  );
}
