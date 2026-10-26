import { useState } from "react";
import { ScrollView, StyleSheet } from "react-native";
import { Stack, useLocalSearchParams, router } from "expo-router";
import { NavigationContentFrame } from "@/components/navigationChrome";
import { RentalContent } from "@/features/day-feed/RentalRow";
import { t } from "@/ui/locale";
import { UiText } from "@/ui/controls";
import { useUiLocale } from "@/ui/useUiLocale";
import { useThemedStyles } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { visual } from "@/ui/visual";
import { rentalFidelityFixture, rentalFidelityRead } from "./rentalFidelityFixture";
import { FixtureActionSheet, type FixtureAction } from "./FixtureActionSheet";
export function RentalFidelityDetail() {
  useUiLocale();
  const params = useLocalSearchParams<{
    scenario?: string;
    clock?: string;
    role?: string;
    item?: string;
  }>();
  const styles = useThemedStyles(createStyles),
    [action, setAction] = useState<FixtureAction | null>(null);
  const preview = (title: string, text?: string) => setAction({ title, text });
  const role = params.role === "RETURN" ? "RETURN" : "PICKUP";
  const fixture = rentalFidelityFixture(
    params.scenario ?? "full",
    params.clock ?? "today",
    preview,
    () => {},
    () => {},
    role,
    params.item,
  );
  const rental = fixture.rentals.find((r) => r.id === params.item) ?? fixture.rental;
  const facts = rentalFidelityRead(rental, preview, {
    rentals: fixture.rentals,
    open: (target) =>
      router.push({
        pathname: "/rental-fidelity-detail",
        params: { ...params, item: target.id, role: "PICKUP" },
      }),
  });
  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          headerTransparent: true,
          headerBackVisible: true,
          headerBackButtonDisplayMode: "minimal",
          title: "",
          headerTitle: "",
          headerShadowVisible: false,
        }}
      />
      {facts.onEdit ? (
        <Stack.Toolbar placement="right">
          <Stack.Toolbar.Button
            icon="square.and.pencil"
            accessibilityLabel={t("p4.edit")}
            onPress={() => preview(t("p4.edit"), t("fidelity.previewOnly"))}
          />
        </Stack.Toolbar>
      ) : null}
      <NavigationContentFrame>
        <ScrollView style={styles.root} contentContainerStyle={styles.content}>
          {role === "RETURN" && !facts.return ? (
            <UiText>{t("dayFeed.unavailable")}</UiText>
          ) : (
            <RentalContent
              nativeNavigation
              title={rental.name}
              pickup={role === "PICKUP"}
              back={role === "RETURN"}
              facts={facts}
              note={rental.note ?? undefined}
              depth="I"
              context={
                params.clock === "past"
                  ? "PAST"
                  : params.clock === "future"
                    ? "FUTURE"
                    : "TODAY"
              }
              onDepth={() => {}}
            />
          )}
        </ScrollView>
      </NavigationContentFrame>
      <FixtureActionSheet value={action} onClose={() => setAction(null)} />
    </>
  );
}
const createStyles = (c: UiColors) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.background },
    content: {
      paddingHorizontal: visual.space.feedGutter,
      paddingBottom: visual.space.section,
    },
  });
