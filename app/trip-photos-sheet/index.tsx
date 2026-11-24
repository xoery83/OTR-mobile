import { useEffect, useSyncExternalStore } from "react";
import { useLocalSearchParams } from "expo-router";
import { SheetRoutePanel } from "@/components/SheetRoutePanel";
import {
  readTripPhotosSheet, releaseTripPhotosSheet, subscribeTripPhotosSheet,
} from "@/features/day-feed/hostedTripPhotos";
import { t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";

export default function TripPhotosSheetRoute() {
  useUiLocale();
  const { invocation } = useLocalSearchParams<{ invocation?: string }>();
  const read = () => readTripPhotosSheet(invocation);
  const gallery = useSyncExternalStore(subscribeTripPhotosSheet, read, read);
  useEffect(() => () => releaseTripPhotosSheet(invocation), [invocation]);
  return (
    <SheetRoutePanel title={t("tripPhotos.title")} leadingDisabled={gallery?.isBusy()}>
      {gallery?.content}
    </SheetRoutePanel>
  );
}
