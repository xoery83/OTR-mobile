import { useEffect, useState, useSyncExternalStore } from "react";
import { Stack, useLocalSearchParams } from "expo-router";
import { View, StyleSheet } from "react-native";
import { requireAdoptedUserId } from "@/data/auth/authRepository";
import {
  captureAccountRequestContext,
  assertAccountRequestContext,
} from "@/data/auth/accountRequestContext";
import {
  getAccountGeneration,
  subscribeAccountGeneration,
} from "@/data/auth/accountGeneration";
import { coreUuid } from "@/domain/trip/tripCoreV2";
import { createClaimResolutionController } from "@/features/people/claimResolutionController";
import { createClaimResolutionNativePorts } from "@/features/people/claimResolutionNativePorts";
import { OrganizerClaimResolutionScreen } from "@/features/people/OrganizerClaimResolutionScreen";
import { UiSection, UiText } from "@/ui/controls";
import { t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { useThemedStyles } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { visual } from "@/ui/visual";

type Controller = ReturnType<typeof createClaimResolutionController>;
// Only a real requestId from an authorized People/Updates entry is meaningful; never synthesize one.
export default function ClaimResolutionRoute() {
  useUiLocale();
  const params = useLocalSearchParams<{ tripId?: string; requestId?: string }>();
  const generation = useSyncExternalStore(
    subscribeAccountGeneration,
    getAccountGeneration,
    getAccountGeneration,
  );
  const tripId =
    typeof params.tripId === "string" && coreUuid.safeParse(params.tripId).success
      ? params.tripId
      : null;
  const requestId =
    typeof params.requestId === "string" && coreUuid.safeParse(params.requestId).success
      ? params.requestId
      : null;
  const key = JSON.stringify([tripId, requestId, generation]);
  const [entry, setEntry] = useState<{ key: string; controller: Controller } | null>(
    null,
  );
  const [failure, setFailure] = useState<string | null>(null);
  const styles = useThemedStyles(createStyles);
  useEffect(() => {
    if (!tripId || !requestId) return;
    let alive = true;
    let controller: Controller | undefined;
    void (async () => {
      try {
        const context = await captureAccountRequestContext(tripId, requireAdoptedUserId);
        if (!alive || context.generation !== generation) return;
        const ports = await createClaimResolutionNativePorts(context);
        await assertAccountRequestContext(context, requireAdoptedUserId);
        if (!alive || getAccountGeneration() !== generation) return;
        controller = createClaimResolutionController(context, requestId, ports);
        setEntry({ key, controller });
        void controller.load();
      } catch {
        if (alive && getAccountGeneration() === generation) setFailure(key);
      }
    })();
    return () => {
      alive = false;
      controller?.dispose();
    };
  }, [tripId, requestId, generation, key]);
  return (
    <View style={styles.screen}>
      <Stack.Screen
        options={{ headerShown: true, title: t("people.claimResolution.title") }}
      />
      {entry?.key === key ? (
        <OrganizerClaimResolutionScreen controller={entry.controller} />
      ) : (
        <UiSection title={t("people.claimResolution.title")}>
          <UiText>
            {t(
              !tripId || !requestId || failure === key
                ? "people.claimResolution.unavailable"
                : "people.claimResolution.loading",
            )}
          </UiText>
        </UiSection>
      )}
    </View>
  );
}
const createStyles = (colors: UiColors) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background, padding: visual.space.page },
  });
