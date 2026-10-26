import { Pressable, StyleSheet, View } from "react-native";
import { UiText } from "@/ui/controls";
import { t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { useThemedStyles } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { visual } from "@/ui/visual";
import type { FlightSegmentDraft } from "./manualFlightFormFields";
import { FlightFidelityGrid } from "./FlightFidelityGrid";
import {
  BookingCommonFooter,
  BookingDocumentLink,
  BookingGlyph,
  BookingInsert,
  BookingTags,
} from "./BookingReadUi";
import {
  readableDocuments,
  flightConnectionMinutes,
  type BookingContext,
  type BookingAssociations,
  type FlightJourneyRead,
  type FlightLegRead,
} from "./bookingReadPresentation";
export function FlightLegRow({
  leg,
  journey,
  focused,
  context,
  onFocus,
  onOpen,
  onInsert,
  hideDivider = false,
  associations,
  pending,
}: {
  leg: Omit<FlightLegRead, "flight"> & {
    flight: FlightLegRead["flight"] | { authored: FlightSegmentDraft };
  };
  journey?: FlightJourneyRead;
  focused: boolean;
  context: BookingContext;
  onFocus(): void;
  onOpen(): void;
  onInsert?(side: "BEFORE" | "AFTER"): void;
  hideDivider?: boolean;
  associations?: BookingAssociations;
  pending?: boolean;
}) {
  useUiLocale();
  const s = useThemedStyles(styles);
  const active = context === "FUTURE" || context === "TODAY";
  const flightLabel =
    "authored" in leg.flight
      ? leg.flight.authored.flightNumberLiteral
      : (leg.flight.numberLiteral ?? leg.id);
  const insert = (side: "BEFORE" | "AFTER") => (
    <BookingInsert
      side={side}
      onPress={() => {
        if (active && focused) onInsert?.(side);
      }}
    />
  );
  return (
    <View>
      {focused && active && onInsert ? insert("BEFORE") : null}
      <View style={[s.row, hideDivider && s.noDivider, focused && s.focus]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={flightLabel}
          onPress={onFocus}
        >
          <FlightFidelityGrid flight={leg.flight} focused={focused} pending={pending} />
        </Pressable>
        {focused ? (
          <>
            <View style={s.extra}>
              <View style={s.facts}>
                {leg.bookingRefs?.length ? (
                  <UiText style={s.meta}>
                    {t("bookingRead.reference")}{" "}
                    <UiText style={s.value}>{leg.bookingRefs.join(", ")}</UiText>
                  </UiText>
                ) : null}
                {active && leg.seats?.length ? (
                  <UiText style={s.meta}>
                    {t("bookingRead.seat")}{" "}
                    <UiText style={s.value}>{leg.seats.join(", ")}</UiText>
                  </UiText>
                ) : null}
              </View>
              {active ? (
                <BookingDocumentLink
                  documents={leg.documents ?? []}
                  onChoose={leg.onDocuments}
                />
              ) : null}
              {journey || associations ? (
                <BookingTags facts={journey ?? associations!} />
              ) : null}
            </View>
            <View style={s.icons}>
              <BookingGlyph kind="detail" onPress={onOpen} />
              {active && (context === "TODAY" ? leg.navigate : leg.map) ? (
                <BookingGlyph
                  kind={context === "TODAY" ? "navigate" : "map"}
                  onPress={(context === "TODAY" ? leg.navigate : leg.map)!}
                />
              ) : null}
            </View>
          </>
        ) : null}
      </View>
      {focused && active && onInsert ? insert("AFTER") : null}
    </View>
  );
}
export function FlightJourneyView({ journey }: { journey: FlightJourneyRead }) {
  useUiLocale();
  const s = useThemedStyles(styles),
    legs = journey.legs;
  const route = legs.length
    ? [
        legs[0].flight.supplemental.endpoints.ORIGIN.code,
        ...legs.map((leg) => leg.flight.supplemental.endpoints.DESTINATION.code),
      ]
        .filter(Boolean)
        .join(" → ")
    : null;
  return (
    <View>
      <View style={s.heading}>
        {route ? <UiText style={s.meta}>{route}</UiText> : null}
        <UiText accessibilityRole="header" style={s.title}>
          {t("bookingRead.flightJourney")}
        </UiText>
        <UiText style={s.meta}>
          {t(legs.length === 1 ? "bookingRead.legCountOne" : "bookingRead.legCount", {
            count: legs.length,
            connections: Math.max(0, legs.length - 1),
          })}
        </UiText>
      </View>
      <View style={s.legs}>
        {legs.map((leg, index) => (
          <View key={leg.id}>
            {index ? <View style={s.divider} /> : null}
            <FlightFidelityGrid flight={leg.flight} immersive />
            <View style={s.services}>
              {leg.flight.services.map((service, i) => (
                <UiText key={i} style={s.service}>
                  {t(
                    service.attribution === "MARKETING"
                      ? "bookingRead.marketing"
                      : "bookingRead.operating",
                    { number: service.service_literal },
                  )}
                </UiText>
              ))}
              {leg.seats?.length ? (
                <UiText style={s.meta}>
                  {t("bookingRead.seat")}{" "}
                  <UiText style={s.value}>{leg.seats.join(", ")}</UiText>
                </UiText>
              ) : null}
            </View>
            {legs[index + 1] && flightConnectionMinutes(leg, legs[index + 1]) !== null ? (
              <UiText style={s.connection}>
                {t("bookingRead.connection", {
                  minutes: flightConnectionMinutes(leg, legs[index + 1])!,
                })}
              </UiText>
            ) : null}
          </View>
        ))}
      </View>
      <BookingCommonFooter
        facts={{
          ...journey,
          documents: readableDocuments([
            journey.documents,
            ...legs.map((l) => l.documents),
          ]),
        }}
      />
    </View>
  );
}
const styles = (c: UiColors) =>
  StyleSheet.create({
    row: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.separator },
    noDivider: { borderBottomWidth: 0 },
    focus: {
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.separator,
      borderRadius: visual.radius.feedFocus,
      paddingHorizontal: 11,
      paddingBottom: 8,
    },
    extra: { marginLeft: 62, gap: 6 },
    facts: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
    meta: { fontSize: 12, lineHeight: 16.8, color: c.textSecondary },
    value: { color: c.textPrimary },
    icons: { flexDirection: "row", justifyContent: "flex-end", marginTop: 4 },
    heading: { paddingVertical: 20, gap: 8 },
    title: { ...visual.type.immersiveTitle, color: c.textPrimary },
    legs: {
      backgroundColor: c.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.separator,
      borderRadius: visual.radius.association,
      paddingHorizontal: 12,
      paddingVertical: 4,
      marginBottom: 11,
    },
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: c.separator,
      marginVertical: 11,
    },
    services: { marginLeft: 62, gap: 6, paddingBottom: 10 },
    service: { fontSize: 11, color: c.textSecondary },
    connection: {
      fontSize: 10,
      color: c.textSecondary,
      paddingVertical: 10,
      marginLeft: 62,
    },
  });
