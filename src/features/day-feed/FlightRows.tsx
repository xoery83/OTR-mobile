import { useState } from "react";
import { StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { AppIcon } from "@/components/AppIcon";
import { t } from "@/ui/locale";
import { useThemedStyles, useUiTheme } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { experienceVisualTokens as tokens, timeRailWidth } from "./visualTokens";
import {
  endpoint,
  durationMinutes,
  flightNumber,
  type FlightPresentation,
} from "./presentation";
const originRole = "ORIGIN" as const;
const destinationRole = "DESTINATION" as const;
export function durationLabel(minutes: number | null) {
  return minutes === null
    ? null
    : t("flight.duration", { hours: Math.floor(minutes / 60), minutes: minutes % 60 });
}
function airport(
  f: FlightPresentation,
  role: typeof originRole | typeof destinationRole,
) {
  const facts = f.supplemental.endpoints[role];
  return (
    facts.code ??
    facts.name ??
    endpoint(f, role)?.authored_label ??
    t("flight.unknownAirport")
  );
}
export function FlightRows({
  fixture: f,
  immersive = false,
  showDate = true,
  withinMarker,
  focused = false,
}: {
  fixture: FlightPresentation;
  immersive?: boolean;
  showDate?: boolean;
  withinMarker?: React.ReactNode;
  focused?: boolean;
}) {
  const s = useThemedStyles(styles),
    colors = useUiTheme();
  const { fontScale } = useWindowDimensions();
  const [availableWidth, setAvailableWidth] = useState(0);
  const [rowsFit, setRowsFit] = useState(true);
  const rail = { width: timeRailWidth(fontScale) };
  const largeText = fontScale > 1.5;
  const dep = endpoint(f, originRole),
    arr = endpoint(f, destinationRole);
  const origin = f.supplemental.endpoints.ORIGIN,
    destination = f.supplemental.endpoints.DESTINATION;
  const term = (value: string | null) =>
    value ? t("flight.terminal", { terminal: value }) : null;
  if (focused && largeText && !immersive) {
    const route = t("flight.itinerary", {
      origin: airport(f, originRole),
      destination: airport(f, destinationRole),
    });
    const times = t("flight.itinerary", {
      origin: dep?.local_time?.slice(0, 5) ?? "",
      destination: arr?.local_time?.slice(0, 5) ?? "",
    });
    return (
      <View
        testID="flight-responsive-focus"
        style={s.rows}
        onLayout={({ nativeEvent }) => {
          const width = nativeEvent.layout.width;
          if (Math.abs(width - availableWidth) > 1) {
            setAvailableWidth(width);
            setRowsFit(true);
          }
        }}
      >
        {availableWidth > 0 && rowsFit ? (
          <>
            <Text
              testID="flight-large-identity"
              style={s.airport}
              onTextLayout={({ nativeEvent }) => {
                if (nativeEvent.lines.length > 1) setRowsFit(false);
              }}
            >
              {route}
            </Text>
            <Text
              testID="flight-large-times"
              style={s.focusTimes}
              accessibilityLabel={`${airport(f, originRole)} ${dep?.local_time?.slice(0, 5)} · ${airport(f, destinationRole)} ${arr?.local_time?.slice(0, 5)}`}
              onTextLayout={({ nativeEvent }) => {
                if (nativeEvent.lines.length > 1) setRowsFit(false);
              }}
            >
              {times}
            </Text>
            {withinMarker}
            <Text style={s.meta}>
              {[flightNumber(f), durationLabel(durationMinutes(f))]
                .filter(Boolean)
                .join(" · ")}
            </Text>
            <Text
              style={s.meta}
              numberOfLines={1}
              ellipsizeMode="tail"
              accessibilityLabel={`${origin.name} · ${destination.name}`}
            >
              {origin.name} · {destination.name}
            </Text>
            {origin.terminal || destination.terminal ? (
              <View style={s.expenseRow}>
                {origin.terminal ? (
                  <Text style={s.meta}>
                    {origin.code} · {term(origin.terminal)}
                  </Text>
                ) : null}
                {destination.terminal ? (
                  <Text style={s.meta}>
                    {destination.code} · {term(destination.terminal)}
                  </Text>
                ) : null}
              </View>
            ) : null}
          </>
        ) : (
          <View testID="flight-large-stacked" style={s.rows}>
            <Text style={s.airport}>{airport(f, originRole)}</Text>
            <Text style={s.focusTimes}>{dep?.local_time?.slice(0, 5)}</Text>
            {withinMarker}
            <Text style={s.meta} numberOfLines={1} ellipsizeMode="tail">
              {origin.name}
            </Text>
            {origin.terminal ? <Text style={s.meta}>{term(origin.terminal)}</Text> : null}
            <Text style={s.airport}>{airport(f, destinationRole)}</Text>
            <Text style={s.focusTimes}>{arr?.local_time?.slice(0, 5)}</Text>
            <Text style={s.meta} numberOfLines={1} ellipsizeMode="tail">
              {destination.name}
            </Text>
            {destination.terminal ? (
              <Text style={s.meta}>{term(destination.terminal)}</Text>
            ) : null}
            <Text style={s.meta}>
              {[flightNumber(f), durationLabel(durationMinutes(f))]
                .filter(Boolean)
                .join(" · ")}
            </Text>
          </View>
        )}
      </View>
    );
  }
  if (immersive)
    return (
      <View testID="flight-immersive-segment" style={s.immersiveSegment}>
        <View style={s.row}>
          <Text style={[s.airport, s.left]}>{airport(f, originRole)}</Text>
          <Text style={s.centerMeta}>{flightNumber(f)}</Text>
          <Text style={[s.airport, s.right]}>{airport(f, destinationRole)}</Text>
        </View>
        <View style={s.row}>
          <Text style={[s.meta, s.left]}>{origin.name}</Text>
          <View style={s.line}>
            <AppIcon name="airplane" size={14} color={colors.textSecondary} />
          </View>
          <Text style={[s.meta, s.right]}>{destination.name}</Text>
        </View>
        <View style={s.row}>
          <Text style={[s.body, s.left]}>{dep?.local_time?.slice(0, 5)}</Text>
          <Text style={s.centerMeta}>{durationLabel(durationMinutes(f))}</Text>
          <Text style={[s.body, s.right]}>{arr?.local_time?.slice(0, 5)}</Text>
        </View>
        {showDate && (
          <View style={s.row}>
            <Text style={[s.meta, s.left]}>{dep?.local_date}</Text>
            <View style={s.middle} />
            <Text style={[s.meta, s.right]}>{arr?.local_date}</Text>
          </View>
        )}
        {(origin.terminal || destination.terminal) && (
          <View style={s.row}>
            <Text style={[s.meta, s.left]}>{term(origin.terminal)}</Text>
            <View style={s.middle} />
            <Text style={[s.meta, s.right]}>{term(destination.terminal)}</Text>
          </View>
        )}
      </View>
    );
  return (
    <View testID="flight-browse-geometry" style={s.rows}>
      <View style={s.row} testID="flight-row-1">
        <View style={[s.departure, rail]}>
          <Text
            style={s.body}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.75}
          >
            {dep?.local_time?.slice(0, 5)}
          </Text>
          {withinMarker}
        </View>
        <Text testID="flight-origin" style={[s.airport, s.left]}>
          {airport(f, originRole)}
        </Text>
        {!largeText ? <Text style={s.centerMeta}>{flightNumber(f)}</Text> : null}
        <Text testID="flight-destination" style={[s.airport, s.right]}>
          {airport(f, destinationRole)}
        </Text>
      </View>
      <View style={s.row} testID="flight-row-2">
        <View style={[s.rail, rail]} />
        <Text
          testID="flight-origin-name"
          style={[s.meta, s.left]}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          {origin.name}
        </Text>
        {!largeText ? (
          <View style={s.line}>
            <AppIcon name="airplane" size={14} color={colors.textSecondary} />
          </View>
        ) : null}
        <Text
          testID="flight-destination-name"
          style={[s.meta, s.right]}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          {destination.name}
        </Text>
      </View>
      <View style={s.baseline} testID="flight-row-3">
        <Text
          testID="arrival-time"
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.75}
          style={[s.arrival, rail]}
        >
          {arr?.local_time?.slice(0, 5)}
        </Text>
        <Text testID="departure-terminal" style={[s.meta, s.left]}>
          {!largeText && term(origin.terminal)}
        </Text>
        {!largeText ? (
          <Text testID="duration" style={s.centerMeta}>
            {durationLabel(durationMinutes(f))}
          </Text>
        ) : null}
        <Text testID="arrival-terminal" style={[s.meta, s.right]}>
          {!largeText && term(destination.terminal)}
        </Text>
      </View>
      {largeText ? (
        <View style={{ marginLeft: rail.width + 12, gap: 4 }}>
          <Text style={s.meta}>
            {[flightNumber(f), durationLabel(durationMinutes(f))]
              .filter(Boolean)
              .join(" · ")}
          </Text>
          {origin.terminal ? (
            <Text style={s.meta}>
              {origin.code} · {term(origin.terminal)}
            </Text>
          ) : null}
          {destination.terminal ? (
            <Text style={s.meta}>
              {destination.code} · {term(destination.terminal)}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
const styles = (c: UiColors) =>
  StyleSheet.create({
    body: { ...tokens.typography.title, color: c.textPrimary },
    meta: { ...tokens.typography.secondary, color: c.textSecondary },
    airport: { ...tokens.typography.title, color: c.textPrimary },
    focusTimes: {
      ...tokens.typography.title,
      color: c.textPrimary,
      fontVariant: ["tabular-nums"],
    },
    rows: { gap: 4 },
    row: { flexDirection: "row", alignItems: "center", gap: 4 },
    baseline: { flexDirection: "row", alignItems: "baseline", gap: 4 },
    rail: { width: 48, marginRight: 8 },
    departure: {
      width: 48,
      marginRight: 8,
      ...tokens.typography.title,
      color: c.textPrimary,
      fontVariant: ["tabular-nums"],
    },
    arrival: {
      width: 48,
      marginRight: 8,
      textAlign: "right",
      ...tokens.typography.secondary,
      color: c.textSecondary,
      fontVariant: ["tabular-nums"],
    },
    left: { flex: 1, minWidth: 0, textAlign: "left" },
    right: { flex: 1, minWidth: 0, textAlign: "right" },
    middle: { width: 76 },
    centerMeta: {
      width: 76,
      textAlign: "center",
      ...tokens.typography.secondary,
      color: c.textSecondary,
    },
    line: {
      width: 76,
      flexDirection: "row",
      justifyContent: "center",
      alignItems: "center",
      borderBottomColor: c.separator,
      borderBottomWidth: StyleSheet.hairlineWidth,
      paddingBottom: 2,
    },
    expenseRow: {
      flexDirection: "row",
      alignItems: "baseline",
      flexWrap: "wrap",
      gap: 4,
    },
    immersiveSegment: { gap: 4 },
  });
