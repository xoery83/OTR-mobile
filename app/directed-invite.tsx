import { useEffect, useState, useSyncExternalStore } from "react";
import { Stack, useLocalSearchParams } from "expo-router";
import { View, StyleSheet } from "react-native";
import { requireAdoptedUserId, readNativeDirectedInvitePorts } from "@/data/auth/authRepository";
import {
  captureAccountRequestContext,
  assertAccountRequestContext,
} from "@/data/auth/accountRequestContext";
import {
  getAccountGeneration,
  subscribeAccountGeneration,
} from "@/data/auth/accountGeneration";
import { coreUuid } from "@/domain/trip/tripCoreV2";
import { createDirectedInviteController } from "@/features/people/directedInviteControllers";
import { DirectedInviteScreen } from "@/features/people/DirectedInviteScreens";
import { UiSection, UiText } from "@/ui/controls";
import { t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { useThemedStyles } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { visual } from "@/ui/visual";

type Controller = ReturnType<typeof createDirectedInviteController>;
// The authorized recipient Reader, not the route or roster label, qualifies each invitation.
export default function DirectedInviteRoute() {
  useUiLocale();
  const params = useLocalSearchParams<{ tripId?: string; personId?: string }>();
  const generation = useSyncExternalStore(
    subscribeAccountGeneration,
    getAccountGeneration,
    getAccountGeneration,
  );
  const tripId =
    typeof params.tripId === "string" && coreUuid.safeParse(params.tripId).success
      ? params.tripId
      : null;
  const personId =
    typeof params.personId === "string" && coreUuid.safeParse(params.personId).success
      ? params.personId
      : null;
  const key = JSON.stringify([tripId, personId, generation]);
  const [entry, setEntry] = useState<{ key: string; controller: Controller } | null>(
    null,
  );
  const [failure, setFailure] = useState<string | null>(null);
  const styles = useThemedStyles(createStyles);
  useEffect(() => {
    if (!tripId || !personId) return;
    let alive = true;
    let controller: Controller | undefined;
    void (async () => {
      try {
        const context = await captureAccountRequestContext(tripId, requireAdoptedUserId);
        if (!alive || context.generation !== generation) return;
        const p = await readNativeDirectedInvitePorts();
        const ports = p;
        await assertAccountRequestContext(context, requireAdoptedUserId);
        if (!alive || getAccountGeneration() !== generation) return;
        controller = createDirectedInviteController(context, personId, ports);
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
  }, [tripId, personId, generation, key]);
  return (
    <View style={styles.screen}>
      <Stack.Screen
        options={{ headerShown: true, title: t("people.directedInvite.title") }}
      />
      {entry?.key === key ? (
        <DirectedInviteScreen
          controller={entry.controller}
          copy={{
            title: t("people.directedInvite.title"),
            unnamed: t("people.directedInvite.unnamed"),
            send: t("people.directedInvite.send"),
            check: t("people.directedInvite.check"),
            busy: t("people.directedInvite.busy"),
            unknown: t("people.directedInvite.unknown"),
            pending: t("people.directedInvite.pending"),
            unavailable: t("people.directedInvite.unavailable"),
            empty: t("people.directedInvite.empty"),
            loading: t("people.directedInvite.loading"),
            reload: t("people.directedInvite.reload"),
          }}
        />
      ) : (
        <UiSection title={t("people.directedInvite.title")}>
          <UiText>
            {t(
              !tripId || !personId || failure === key
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
