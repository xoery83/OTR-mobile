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
import { createPendingClaimSubmissionController } from "@/features/people/pendingClaimSubmissionController";
import { PendingClaimSubmissionScreen } from "@/features/people/PendingClaimSubmissionScreen";
import { UiSection, UiText } from "@/ui/controls";
import { t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { useThemedStyles } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { visual } from "@/ui/visual";

type Controller = ReturnType<typeof createPendingClaimSubmissionController>;
// Only an actual incoming invitation is accepted; the controller re-reads its authorized facts.
export default function PendingClaimRoute() {
  useUiLocale();
  const params = useLocalSearchParams<{ tripId?: string; inviteId?: string }>();
  const generation = useSyncExternalStore(
    subscribeAccountGeneration,
    getAccountGeneration,
    getAccountGeneration,
  );
  const tripId =
    typeof params.tripId === "string" && coreUuid.safeParse(params.tripId).success
      ? params.tripId
      : null;
  const inviteId =
    typeof params.inviteId === "string" && coreUuid.safeParse(params.inviteId).success
      ? params.inviteId
      : null;
  const key = JSON.stringify([tripId, inviteId, generation]);
  const [entry, setEntry] = useState<{ key: string; controller: Controller } | null>(
    null,
  );
  const [failure, setFailure] = useState<string | null>(null);
  const styles = useThemedStyles(createStyles);
  useEffect(() => {
    if (!tripId || !inviteId) return;
    let alive = true;
    let controller: Controller | undefined;
    void (async () => {
      try {
        const context = await captureAccountRequestContext(tripId, requireAdoptedUserId);
        if (!alive || context.generation !== generation) return;
        const p = await readNativeDirectedInvitePorts();
        const ports = {
          account: p.account,
          invitations: p.reader,
          reader: p.resolutionReader,
          attempts: p.attempts,
        };
        await assertAccountRequestContext(context, requireAdoptedUserId);
        if (!alive || getAccountGeneration() !== generation) return;
        controller = createPendingClaimSubmissionController(context, inviteId, ports);
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
  }, [tripId, inviteId, generation, key]);
  return (
    <View style={styles.screen}>
      <Stack.Screen
        options={{ headerShown: true, title: t("people.pendingClaim.title") }}
      />
      {entry?.key === key ? (
        <PendingClaimSubmissionScreen controller={entry.controller} />
      ) : (
        <UiSection title={t("people.pendingClaim.title")}>
          <UiText>
            {t(
              !tripId || !inviteId || failure === key
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
