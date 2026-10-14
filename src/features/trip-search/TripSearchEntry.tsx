import { useSyncExternalStore } from "react";
import { router } from "expo-router";
import {
  getAccountGeneration,
  subscribeAccountGeneration,
} from "@/data/auth/accountGeneration";
import { useTripView } from "@/features/day-feed/TripViewContext";
import { UiButton } from "@/ui/controls";
import { t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";

export function TripSearchEntry({
  entry,
  tripId,
}: {
  entry: "MY_TRIPS" | "HOME" | "DAY";
  tripId?: string;
}) {
  useUiLocale();
  const generation = useSyncExternalStore(
    subscribeAccountGeneration,
    getAccountGeneration,
  );
  const { view, resumeView } = useTripView();
  const current = view ?? resumeView;
  const target =
    entry === "MY_TRIPS"
      ? undefined
      : entry === "HOME"
        ? tripId
        : current?.generation === generation
          ? current.tripId
          : undefined;
  if (entry !== "MY_TRIPS" && !target) return null;
  return (
    <UiButton
      label={t("comprehensiveSearch.title")}
      variant="text"
      onPress={() => {
        if (generation !== getAccountGeneration()) return;
        router.push({
          pathname: "/search",
          params: { entry, ...(target ? { tripId: target } : {}) },
        });
      }}
    />
  );
}
