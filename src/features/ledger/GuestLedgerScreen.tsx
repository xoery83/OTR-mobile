import { useCallback, useState } from "react";
import { Stack, useFocusEffect } from "expo-router";
import { ScrollView, StyleSheet, View } from "react-native";
import { GlobalMenu } from "@/components/GlobalMenu";
import { NavigationContentFrame, navigationContentFrameOptions } from "@/components/navigationChrome";
import { getAccountGeneration } from "@/data/auth/accountGeneration";
import { openGuestLocalWorkspace } from "@/data/auth/guestLocalWorkspace";
import { useTripView } from "@/features/day-feed/TripViewContext";
import { UiSection, UiText } from "@/ui/controls";
import { t } from "@/ui/locale";
import { useThemedStyles } from "@/ui/theme";
import { useUiLocale } from "@/ui/useUiLocale";
import { visual } from "@/ui/visual";
import type { UiColors } from "@/ui/palette";
import { MoneyText } from "./MoneyText";

type GuestLedger = Awaited<ReturnType<Awaited<ReturnType<typeof openGuestLocalWorkspace>>["readLedger"]>>;

export function GuestLedgerScreen({ scopedJourneyId }: { scopedJourneyId?: string }) {
  useUiLocale();
  const styles = useThemedStyles(createStyles);
  const { workingTrip } = useTripView();
  const tripId = scopedJourneyId ?? workingTrip?.tripId;
  const [result, setResult] = useState<{ tripId: string; ledger: GuestLedger | null }>();
  useFocusEffect(useCallback(() => {
    if (!tripId) return;
    const generation = getAccountGeneration();
    let active = true;
    void openGuestLocalWorkspace()
      .then((workspace) => workspace.readLedger(tripId))
      .then((ledger) => {
        if (active && generation === getAccountGeneration()) setResult({ tripId, ledger });
      })
      .catch(() => {
        if (active && generation === getAccountGeneration()) setResult({ tripId, ledger: null });
      });
    return () => { active = false; };
  }, [tripId]));
  const current = result?.tripId === tripId ? result : undefined;
  const ledger = current?.ledger;
  return (
    <>
      <Stack.Screen options={{
        ...navigationContentFrameOptions,
        headerShown: true,
        title: t("navigation.ledger"),
        headerLeft: () => <GlobalMenu journeyId={tripId} module="LEDGER" guestLedger />,
      }} />
      <NavigationContentFrame>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
          {ledger ? (
            <>
              <UiSection title={t("ledger.recentExpenses")}>
                <UiText style={styles.meta}>{ledger.currency}</UiText>
                {ledger.expenses.length ? ledger.expenses.map((expense) => (
                  <View key={expense.id} style={styles.row}>
                    <UiText style={styles.name}>{expense.title}</UiText>
                    <MoneyText minor={expense.originalMinor} currency={expense.originalCurrency} scale={expense.originalScale} />
                  </View>
                )) : <UiText style={styles.meta}>{t("ledger.noExpenses")}</UiText>}
              </UiSection>
              <UiSection title={t("people.title")}>
                {ledger.people.map((person) => (
                  <UiText key={person.personId} style={styles.name}>
                    {person.displayName.trim() || (person.isCurrentActor ? t("common.you") : person.displayName)}
                  </UiText>
                ))}
              </UiSection>
            </>
          ) : (
            <UiText style={styles.meta}>
              {t(!tripId ? "ledger.noJourneys" : current ? "ledger.cacheUnavailable" : "common.loading")}
            </UiText>
          )}
        </ScrollView>
      </NavigationContentFrame>
    </>
  );
}

const createStyles = (colors: UiColors) => StyleSheet.create({
  content: { padding: visual.space.page, gap: visual.space.section },
  row: { gap: visual.space.heading },
  name: { ...visual.type.row, color: colors.textPrimary },
  meta: { ...visual.type.meta, color: colors.textSecondary },
});
