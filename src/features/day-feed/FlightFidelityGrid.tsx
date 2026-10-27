import type { FlightSegmentDraft } from "./manualFlightFormFields";
import type { ReactNode } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import { AppIcon } from "@/components/AppIcon";
import { UiText } from "@/ui/controls";
import { formatUiDate, formatUiNumber, t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { useThemedStyles, useUiTheme } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { visual } from "@/ui/visual";
import {
  durationMinutes,
  endpoint,
  flightNumber,
  type FlightPresentation,
} from "./presentation";

// Geometry only. Airport identity, endpoint time and flight literals come from the owning read.
export function FlightFidelityGrid({
  flight,
  numberLiteral,
  focused = false,
  immersive = false,
  withinMarker,
  pending = false,
}: {
  flight: FlightPresentation | { authored: FlightSegmentDraft };
  numberLiteral?: string | null;
  focused?: boolean;
  immersive?: boolean;
  withinMarker?: ReactNode;
  pending?: boolean;
}) {
  useUiLocale();
  const styles = useThemedStyles(createStyles),
    colors = useUiTheme();
  const { fontScale } = useWindowDimensions();
  const stacked = fontScale > 1.5;
  const authored = "authored" in flight ? flight.authored : null;
  const departure =
    "authored" in flight
      ? {
          local_time: flight.authored.departureTime || null,
          local_date: flight.authored.departureDate || null,
          zone_id: flight.authored.departureZone || null,
        }
      : endpoint(flight, "ORIGIN");
  const arrival =
    "authored" in flight
      ? {
          local_time: flight.authored.arrivalTime || null,
          local_date: flight.authored.arrivalDate || null,
          zone_id: flight.authored.arrivalZone || null,
        }
      : endpoint(flight, "DESTINATION");
  const origin =
    "authored" in flight
      ? {
          code: flight.authored.originCode || null,
          name: flight.authored.originName || null,
          terminal: flight.authored.originTerminal || null,
        }
      : flight.supplemental.endpoints.ORIGIN;
  const destination =
    "authored" in flight
      ? {
          code: flight.authored.destinationCode || null,
          name: flight.authored.destinationName || null,
          terminal: flight.authored.destinationTerminal || null,
        }
      : flight.supplemental.endpoints.DESTINATION;
  const number =
    "authored" in flight
      ? authored?.flightNumberLiteral
      : (flightNumber(flight) ?? numberLiteral);
  const dayOffset =
    departure?.local_date && arrival?.local_date
      ? Math.round(
          (Date.parse(arrival.local_date + "T12:00:00Z") -
            Date.parse(departure.local_date + "T12:00:00Z")) /
            86400000,
        )
      : 0;
  const duration = "authored" in flight ? null : durationMinutes(flight);
  const middleWidth =
    (focused || immersive ? (pending ? 68 : 52) : 68) * (stacked ? fontScale : 1);
  const gap = focused || immersive ? 8 : 12;
  const hasAirport = !!(
    origin.code ||
    origin.name ||
    destination.code ||
    destination.name
  );
  const date = (value: string | null | undefined) =>
    value
      ? formatUiDate(new Date(`${value}T12:00:00Z`), {
          dateStyle: "medium",
          timeZone: "UTC",
        })
      : null;
  const terminal = (value: string | null) =>
    value ? t("flight.terminal", { terminal: value }) : null;
  const pendingMarker = pending ? (
    <UiText
      accessibilityLabel={t("tripCreate.itemPending")}
      style={{ color: colors.warning, fontSize: 8 }}
    >
      {" "}
      ●
    </UiText>
  ) : null;
  const names = (facts: typeof origin, arrival = false) => (
    <>
      {facts.code ? (
        <UiText style={[styles.code, arrival && styles.arrival]}>{facts.code}</UiText>
      ) : null}
      {facts.name ? (
        <UiText style={[styles.name, arrival && styles.arrival]}>{facts.name}</UiText>
      ) : null}
    </>
  );
  return (
    <View testID="flight-fidelity-grid" style={styles.root}>
      <View style={[styles.grid, { gap }, stacked && styles.stacked]}>
        <View
          style={{ width: 54 * Math.max(1, fontScale), flexShrink: 0, paddingTop: 2 }}
        >
          {!hasAirport && !departure?.local_time ? (
            <View style={styles.sparsePlane}>
              <AppIcon name="airplane" size={18} color={colors.accent} />
            </View>
          ) : null}
          {departure?.local_time ? (
            <UiText style={styles.start}>{departure.local_time.slice(0, 5)}</UiText>
          ) : null}
          {arrival?.local_time ? (
            <UiText style={styles.end}>
              {arrival.local_time.slice(0, 5)}
              {Number.isSafeInteger(dayOffset) && dayOffset !== 0 ? (
                <UiText
                  testID="flight-arrival-day-offset"
                  style={{ color: colors.accent, fontWeight: "700" }}
                >
                  {dayOffset > 0 ? "⁺" : "⁻"}
                  {formatUiNumber(Math.abs(dayOffset))}
                </UiText>
              ) : null}
            </UiText>
          ) : null}
          {withinMarker}
        </View>
        {hasAirport ? (
          <View style={styles.route}>
            <View style={[styles.grid, { gap }, stacked && styles.stacked]}>
              <View style={styles.airport}>{names(origin)}</View>
              <View style={[styles.middle, { width: middleWidth }]}>
                {number ? (
                  <UiText style={styles.number}>
                    {number}
                    {pendingMarker}
                  </UiText>
                ) : null}
                <View style={styles.planeLine}>
                  <View style={styles.line} />
                  <AppIcon name="airplane" size={18} color={colors.accent} />
                  <View style={styles.line} />
                </View>
                {duration !== null ? (
                  <UiText style={styles.duration}>
                    {t(duration % 60 === 0 ? "bookingRead.hours" : "flight.duration", {
                      hours: Math.floor(duration / 60),
                      minutes: duration % 60,
                    })}
                  </UiText>
                ) : null}
              </View>
              <View style={styles.airport}>{names(destination, true)}</View>
            </View>
            {origin.terminal || destination.terminal ? (
              <View
                testID="flight-terminal-grid"
                style={[styles.grid, { gap }, stacked && styles.stacked]}
              >
                <UiText style={[styles.name, styles.airport]}>
                  {terminal(origin.terminal)}
                </UiText>
                {!stacked ? <View style={{ width: middleWidth }} /> : null}
                <UiText style={[styles.name, styles.airport, styles.arrival]}>
                  {terminal(destination.terminal)}
                </UiText>
              </View>
            ) : null}
            {immersive ? (
              <View style={[styles.grid, { gap }, stacked && styles.stacked]}>
                <View style={styles.airport}>
                  {immersive && departure?.local_date ? (
                    <UiText style={styles.context}>{date(departure.local_date)}</UiText>
                  ) : null}
                  {immersive && departure?.zone_id ? (
                    <UiText style={styles.context}>{departure.zone_id}</UiText>
                  ) : null}
                </View>
                {!stacked ? <View style={{ width: middleWidth }} /> : null}
                <View style={styles.airport}>
                  {arrival?.local_date ? (
                    <UiText style={[styles.context, styles.arrival]}>
                      {date(arrival.local_date)}
                    </UiText>
                  ) : null}
                  {immersive && arrival?.zone_id ? (
                    <UiText style={[styles.context, styles.arrival]}>
                      {arrival.zone_id}
                    </UiText>
                  ) : null}
                </View>
              </View>
            ) : null}
          </View>
        ) : (
          <View style={styles.airport}>
            {number ? (
              <UiText style={styles.code}>
                {number}
                {pendingMarker}
              </UiText>
            ) : null}
            {departure?.local_date ? (
              <UiText style={styles.name}>{date(departure.local_date)}</UiText>
            ) : null}
            {immersive && departure?.zone_id ? (
              <UiText style={styles.context}>{departure.zone_id}</UiText>
            ) : null}
            {arrival?.local_date && immersive ? (
              <UiText style={[styles.context, styles.arrival]}>
                {date(arrival.local_date)}
              </UiText>
            ) : null}
            {immersive && arrival?.zone_id ? (
              <UiText style={[styles.context, styles.arrival]}>{arrival.zone_id}</UiText>
            ) : null}
          </View>
        )}
      </View>
    </View>
  );
}
const createStyles = (c: UiColors) =>
  StyleSheet.create({
    root: { paddingVertical: 13 },
    grid: { flexDirection: "row", alignItems: "flex-start" },
    stacked: { flexDirection: "column" },
    route: { flex: 1, minWidth: 0, gap: 4 },
    arrival: { textAlign: "right" },
    airport: { flex: 1, minWidth: 0, gap: 3 },
    middle: { alignItems: "center", gap: 4, flexShrink: 0 },
    planeLine: { flexDirection: "row", alignItems: "center", gap: 3, width: "100%" },
    line: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: c.separator },
    sparsePlane: { alignItems: "center", minHeight: 22 },
    start: { ...visual.type.feedClock, color: c.textSecondary },
    end: { ...visual.type.feedEndClock, color: c.textSecondary, marginTop: 3 },
    code: { ...visual.type.feedTitle, color: c.textPrimary },
    name: { ...visual.type.feedNote, lineHeight: 16.8, color: c.textSecondary },
    number: { ...visual.type.feedTag, color: c.textPrimary, textAlign: "center" },
    duration: {
      ...visual.type.feedEndClock,
      color: c.textSecondary,
      textAlign: "center",
    },
    context: {
      ...visual.type.feedEndClock,
      fontSize: 10,
      lineHeight: 14,
      color: c.textSecondary,
    },
  });
