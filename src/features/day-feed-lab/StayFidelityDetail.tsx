import { useState } from "react";
import { ScrollView, StyleSheet } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { NavigationContentFrame } from "@/components/navigationChrome";
import { StayReadView, type StayRole } from "@/features/day-feed/StayReadView";
import { t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { useThemedStyles } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { visual } from "@/ui/visual";
import { stayFidelityFixture } from "./stayFidelityFixture";
import { FixtureActionSheet, type FixtureAction } from "./FixtureActionSheet";
export function StayFidelityDetail() {
  useUiLocale();
  const params = useLocalSearchParams<{
    item?: string;
    scenario?: string;
    clock?: string;
    role?: string;
    date?: string;
  }>();
  const s = useThemedStyles(styles),
    [action, setAction] = useState<FixtureAction | null>(null);
  const role: StayRole =
    params.role === "CHECKOUT" ? "CHECKOUT" : params.role === "BASE" ? "BASE" : "CHECKIN";
  const fixture = stayFidelityFixture(
    params.scenario ?? "syn-stay-full",
    params.clock ?? "today",
    (title, text, choices) => setAction({ title, text, choices }),
    () => {},
    () => {},
    role,
  );
  const selectedStay = fixture.stays.find((s) => s.id === params.item) ?? fixture.stay;
  const context =
    params.clock === "past" ? "PAST" : params.clock === "future" ? "FUTURE" : "TODAY";
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
      {selectedStay.onEdit ? (
        <Stack.Toolbar placement="right">
          <Stack.Toolbar.Button
            icon="square.and.pencil"
            accessibilityLabel={t("tripCreate.editStay")}
            onPress={selectedStay.onEdit}
          />
        </Stack.Toolbar>
      ) : null}
      <NavigationContentFrame>
        <ScrollView style={s.root} contentContainerStyle={s.content}>
          <StayReadView stay={selectedStay} role={role} context={context} />
        </ScrollView>
      </NavigationContentFrame>
      <FixtureActionSheet value={action} onClose={() => setAction(null)} />
    </>
  );
}
const styles = (c: UiColors) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.background },
    content: { paddingHorizontal: visual.space.feedGutter, paddingBottom: 34 },
  });
