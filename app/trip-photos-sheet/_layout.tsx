import { useCallback } from "react";
import { useLocalSearchParams } from "expo-router";
import { SheetRouteLayout } from "@/components/SheetRouteLayout";
import { readTripPhotosSheet } from "@/features/day-feed/hostedTripPhotos";

export const unstable_settings = { initialRouteName: "index" };

export default function TripPhotosSheetLayout() {
  const { invocation } = useLocalSearchParams<{ invocation?: string }>();
  const interceptClose = useCallback(
    () => readTripPhotosSheet(invocation)?.isBusy() ?? false,
    [invocation],
  );
  return <SheetRouteLayout immersive interceptClose={interceptClose} />;
}
