import { useEffect, useState, useSyncExternalStore } from "react";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { ScrollView, StyleSheet, View } from "react-native";
import {
  getAccountGeneration,
  subscribeAccountGeneration,
} from "@/data/auth/accountGeneration";
import { captureAccountRequestContext } from "@/data/auth/accountRequestContext";
import { requireActiveUserId } from "@/data/auth/authRepository";
import { listCaptureTripPriors } from "@/data/operations/captureTripPrior";
import { ManualItineraryContent } from "@/features/day-feed/ManualItineraryContent";
import { SheetHeader } from "@/components/SheetHeader";
import { UiButton, UiText } from "@/ui/controls";
import { t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { useThemedStyles } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { visual } from "@/ui/visual";

// Manual forms remain independent of Batch admission, documents and AI receipts.
export default function ImportManualRoute() {
  useUiLocale();
  const params = useLocalSearchParams<{ tripId?: string; originGeneration?: string }>();
  const generation = useSyncExternalStore(
    subscribeAccountGeneration,
    getAccountGeneration,
  );
  return (
    <ImportManualContent
      key={`${generation}:${params.originGeneration ?? ""}:${params.tripId ?? ""}`}
      params={params}
      generation={generation}
    />
  );
}
function ImportManualContent({
  params,
  generation,
}: {
  params: { tripId?: string; originGeneration?: string };
  generation: number;
}) {
  const styles = useThemedStyles(createStyles);
  const [choices, setChoices] = useState<{ id: string; name: string }[] | null>(null);
  const [target, setTarget] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const current = params.originGeneration === String(generation);
  useEffect(() => {
    let active = true;
    if (!current) return;
    void captureAccountRequestContext("", requireActiveUserId)
      .then((context) => listCaptureTripPriors(context))
      .then((trips) => {
        if (!active || generation !== getAccountGeneration()) return;
        setChoices(trips);
        if (params.tripId) {
          if (trips.some((trip) => trip.id === params.tripId)) setTarget(params.tripId);
          else setFailed(true);
        }
      })
      .catch(() => {
        if (active && generation === getAccountGeneration()) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [current, generation, params.tripId]);
  return (
    <View style={styles.body}>
      <Stack.Screen
        options={{ headerShown: false, presentation: "modal", gestureEnabled: false }}
      />
      {current && target && !failed ? (
        <ManualItineraryContent
          key={`${generation}:${target}`}
          tripId={target}
          generation={generation}
          initialDate={null}
          onClose={() => router.back()}
          onSaved={() => {
            if (generation === getAccountGeneration()) router.back();
          }}
        />
      ) : (
        <>
          <SheetHeader
            category="picker"
            title={t("capture.results.addManually")}
            leftLabel={t("common.cancel")}
            onLeft={() => router.back()}
          />
          <ScrollView
            style={styles.body}
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
          >
            <UiText>
              {t(
                !current || failed
                  ? "capture.results.manualUnavailable"
                  : choices
                    ? "documents.chooseTrip"
                    : "common.loading",
              )}
            </UiText>
            {current && !failed
              ? choices?.map((trip) => (
                  <UiButton
                    key={trip.id}
                    label={trip.name}
                    variant="text"
                    onPress={() => {
                      if (generation === getAccountGeneration()) setTarget(trip.id);
                    }}
                  />
                ))
              : null}
          </ScrollView>
        </>
      )}
    </View>
  );
}
const createStyles = (c: UiColors) =>
  StyleSheet.create({
    body: { flex: 1, backgroundColor: c.background },
    content: { padding: visual.space.page, gap: visual.space.heading },
  });
