import { useState } from "react";
import { Modal, ScrollView, StyleSheet, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { NavigationContentFrame } from "@/components/navigationChrome";
import { SheetHeader } from "@/components/SheetHeader";
import { UiText } from "@/ui/controls";
import { t } from "@/ui/locale";
import { useThemedStyles } from "@/ui/theme";
import { useUiLocale } from "@/ui/useUiLocale";
import type { UiColors } from "@/ui/palette";
import { visual } from "@/ui/visual";
import { FlightJourneyView } from "@/features/day-feed/FlightJourneyView";
import { FlightSegmentFields } from "@/features/day-feed/FlightSegmentFields";
import {
  emptyFlightSegment,
  type FlightSegmentDraft,
} from "@/features/day-feed/manualFlightFormFields";
import { endpoint } from "@/features/day-feed/presentation";
import { flightFidelityFixture } from "./flightFidelityFixture";
import { FixtureActionSheet, type FixtureAction } from "./FixtureActionSheet";
export function FlightFidelityDetail() {
  useUiLocale();
  const params = useLocalSearchParams<{
    scenario?: string;
    clock?: string;
    leg?: string;
  }>();
  const s = useThemedStyles(styles),
    [action, setAction] = useState<FixtureAction | null>(null),
    [edit, setEdit] = useState(false);
  const fixture = flightFidelityFixture(
    params.scenario ?? "syn-p2-full",
    params.clock ?? "today",
    (title, text, choices) => setAction({ title, text, choices }),
    () => {},
    () => {},
  );
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
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          icon="square.and.pencil"
          accessibilityLabel={t("tripCreate.editPlan")}
          onPress={() => setEdit(true)}
        />
      </Stack.Toolbar>
      <NavigationContentFrame>
        <ScrollView style={s.root} contentContainerStyle={s.content}>
          <FlightJourneyView journey={fixture.journey} />
        </ScrollView>
      </NavigationContentFrame>
      <FixtureActionSheet value={action} onClose={() => setAction(null)} />
      <Modal visible={edit} animationType="slide" onRequestClose={() => setEdit(false)}>
        {edit ? (
          <FlightPreviewForm
            key={fixture.journey.id}
            onClose={() => setEdit(false)}
            segments={fixture.journey.legs.map((leg) => {
              const a = endpoint(leg.flight, "ORIGIN"),
                b = endpoint(leg.flight, "DESTINATION"),
                origin = leg.flight.supplemental.endpoints.ORIGIN,
                destination = leg.flight.supplemental.endpoints.DESTINATION;
              return {
                ...emptyFlightSegment(leg.id),
                flightNumberLiteral: leg.flight.numberLiteral ?? "",
                departureDate: a?.local_date ?? "",
                departureTime: a?.local_time?.slice(0, 5) ?? "",
                departureZone: a?.zone_id ?? "",
                originCode: origin.code ?? "",
                originName: origin.name ?? "",
                originTerminal: origin.terminal ?? "",
                destinationCode: destination.code ?? "",
                destinationName: destination.name ?? "",
                destinationTerminal: destination.terminal ?? "",
                arrivalDate: b?.local_date ?? "",
                arrivalTime: b?.local_time?.slice(0, 5) ?? "",
                arrivalZone: b?.zone_id ?? "",
              };
            })}
          />
        ) : null}
      </Modal>
    </>
  );
}
function FlightPreviewForm({
  segments: initial,
  onClose,
}: {
  segments: FlightSegmentDraft[];
  onClose(): void;
}) {
  const [segments, setSegments] = useState(initial),
    s = useThemedStyles(styles);
  return (
    <View style={s.root}>
      <SheetHeader
        title={t("bookingRead.previewFields")}
        category="form"
        leftLabel={t("common.cancel")}
        onLeft={onClose}
        rightLabel={t("ui.save")}
        onRight={() => {}}
        rightDisabled
      />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.content}>
        <UiText>{t("fidelity.previewOnly")}</UiText>
        {segments.map((segment, i) => (
          <View key={segment.key} style={s.card}>
            <FlightSegmentFields
              value={segment}
              full
              disabled={false}
              participantOptions={[]}
              onPickerChange={() => {}}
              onChange={(changes) =>
                setSegments((current) =>
                  current.map((s, j) => (j === i ? { ...s, ...changes } : s)),
                )
              }
            />
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
const styles = (c: UiColors) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.background },
    content: { paddingHorizontal: visual.space.feedGutter, paddingBottom: 34 },
    card: { paddingVertical: 16 },
  });
