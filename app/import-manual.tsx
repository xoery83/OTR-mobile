import { useSyncExternalStore } from "react";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { ScrollView, StyleSheet, View } from "react-native";
import {
  getAccountGeneration,
  subscribeAccountGeneration,
} from "@/data/auth/accountGeneration";
import { useImportManualTripChoices } from "@/features/capture/useImportManualTripChoices";
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
  const { choices, target, failed, current, setTarget } = useImportManualTripChoices(params, generation);
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
