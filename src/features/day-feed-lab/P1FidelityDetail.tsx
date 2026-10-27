import { useState } from "react";
import { Modal, ScrollView, StyleSheet, View } from "react-native";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { NavigationContentFrame } from "@/components/navigationChrome";
import { SheetHeader } from "@/components/SheetHeader";
import { P1PlanEditor } from "@/features/day-feed/P1PlanEditor";
import { composeDayStream } from "@/features/day-feed/composition";
import { itemsForLocalDate } from "@/domain/trip/dayReadModel";
import { UiText } from "@/ui/controls";
import { t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { useThemedStyles, useUiTheme } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { visual } from "@/ui/visual";
import { p1FidelityFixture, p1FidelityPack } from "./p1FidelityFixture";
import { p1MoveDetailPreview } from "./p1MoveDetailPreview";
import { p1FixtureFormFields } from "./p1FixtureFormFields";
export function P1FidelityDetail() {
  useUiLocale();
  const {
    item,
    clock,
    placement: rawPlacement,
  } = useLocalSearchParams<{ item?: string; clock?: string; placement?: string }>();
  const placement = p1MoveDetailPreview(item, rawPlacement);
  const mode = clock === "future" || clock === "past" ? clock : "today";
  const [sheet, setSheet] = useState<"EDIT" | "ACTION" | null>(null);
  const colors = useUiTheme(),
    styles = useThemedStyles(createStyles);
  const preview = () => setSheet("ACTION");
  const fixture = p1FidelityFixture(
    mode,
    {
      map: preview,
      navigate: preview,
      participants: preview,
      photos: preview,
      attachments: preview,
      expenses: preview,
      addPhoto: preview,
      addAttachment: preview,
      addExpense: preview,
      linkExpense: preview,
    },
    undefined,
    undefined,
    placement && item
      ? {
          previews: { [item]: placement },
          handlers: { start() {}, change() {}, end() {} },
        }
      : undefined,
  );
  const source = p1FidelityPack.items.find(
    (entry) => entry.id === item && entry.availability !== "UNAVAILABLE",
  );
  const stream = source
    ? composeDayStream(
        itemsForLocalDate(
          fixture.projection,
          placement?.date ?? source.date,
          fixture.zone,
        ),
        fixture.instant,
      )
    : null;
  const row = stream?.rows.find((entry) => entry.item.event.id === item);
  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: "",
          headerTitle: "",
          headerBackVisible: true,
          headerBackButtonDisplayMode: "minimal",
          headerTransparent: true,
          headerTintColor: colors.accent,
          headerStyle: { backgroundColor: colors.surface },
          headerShadowVisible: false,
        }}
      />
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          icon="square.and.pencil"
          accessibilityLabel={t("tripCreate.editPlan")}
          disabled={!source || source.availability !== "AVAILABLE"}
          onPress={() => setSheet("EDIT")}
        />
      </Stack.Toolbar>
      <NavigationContentFrame>
        <ScrollView style={styles.root} contentContainerStyle={styles.content}>
          {row ? (
            fixture.renderer?.({
              row,
              depth: "I",
              onDepth: () => router.back(),
              container: undefined,
              context: stream?.context,
            })
          ) : (
            <UiText style={styles.meta}>{t("dayFeed.unavailable")}</UiText>
          )}
        </ScrollView>
      </NavigationContentFrame>
      <Modal
        visible={!!sheet}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setSheet(null)}
      >
        <View style={styles.root}>
          {sheet === "EDIT" && source ? (
            <P1PlanEditor
              key={source.id}
              embedded
              tripId={fixture.id}
              itemId={source.id}
              previewFields={{
                ...p1FixtureFormFields(source.id),
                ...(placement
                  ? {
                      startDate: placement.date,
                      startTime: placement.time,
                      endDate: placement.endDate,
                      endTime: placement.endTime,
                    }
                  : {}),
              }}
              previewParticipationKnown={"participation" in source}
              onClose={() => setSheet(null)}
              onSaved={() => {}}
            />
          ) : (
            <>
              <SheetHeader
                category="action"
                title={t("dayLab.title")}
                onLeft={() => setSheet(null)}
              />
              <UiText style={styles.meta}>{t("fidelity.previewOnly")}</UiText>
            </>
          )}
        </View>
      </Modal>
    </>
  );
}
const createStyles = (colors: UiColors) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.background },
    content: { paddingBottom: visual.space.section },
    meta: {
      ...visual.type.meta,
      color: colors.textSecondary,
      padding: visual.space.page,
    },
  });
