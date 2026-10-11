import { useState } from "react";
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import type { DayEvent } from "@/domain/trip/dayReadModel";
import { AppIcon } from "@/components/AppIcon";
import { UiButton } from "@/ui/controls";
import { t } from "@/ui/locale";
import { useThemedStyles, useUiTheme } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { visual } from "@/ui/visual";
import { experienceVisualTokens as tokens, timeRailWidth } from "./visualTokens";
import { eventClock, eventLocation, type Depth } from "./presentation";

// Accepted P1 native row structure; only admitted Event facts enter this surface.
export function P1Row({
  event,
  depth,
  onDepth,
  withinMarker,
}: {
  event: DayEvent;
  depth: Depth;
  onDepth: (depth: Depth) => void;
  withinMarker?: React.ReactNode;
}) {
  const styles = useThemedStyles(createStyles),
    colors = useUiTheme();
  const { fontScale } = useWindowDimensions();
  const [wrappedTitle, setWrappedTitle] = useState(false);
  const focused = depth === "F",
    immersive = depth === "I";
  const secondaryActions = fontScale > 1.5 || wrappedTitle;
  const clock = eventClock(event),
    location = eventLocation(event);
  return (
    <View
      style={
        immersive ? styles.immersive : [styles.row, focused && { borderBottomWidth: 0 }]
      }
      accessibilityLabel={event.title}
    >
      {focused ? (
        <View
          pointerEvents="none"
          style={styles.focusOutline}
          testID="focus-selected-region"
        />
      ) : null}
      {!immersive && (clock || withinMarker) ? (
        <View style={[styles.rail, { width: timeRailWidth(fontScale) }]}>
          {clock ? (
            <Text style={styles.clock} numberOfLines={1}>
              {clock}
            </Text>
          ) : null}
          {withinMarker}
        </View>
      ) : null}
      <View style={styles.content}>
        {immersive ? (
          <UiButton
            label={t("common.close")}
            variant="text"
            onPress={() => onDepth("F")}
          />
        ) : null}
        <View style={styles.eventHeader}>
          <Pressable
            style={styles.bodyTap}
            accessibilityRole={immersive ? "text" : "button"}
            disabled={immersive}
            accessibilityLabel={event.title}
            accessibilityHint={
              immersive ? undefined : t(focused ? "p1r.collapseHint" : "p1r.focusHint")
            }
            onPress={() => onDepth(focused ? "B" : "F")}
          >
            <View
              style={[styles.header, secondaryActions && { flexDirection: "column" }]}
            >
              <View style={styles.headingCopy}>
                <Text
                  onTextLayout={({ nativeEvent }) => {
                    if (focused && nativeEvent.lines.length > 1) setWrappedTitle(true);
                  }}
                  style={[
                    immersive ? styles.immersiveTitle : styles.title,
                    focused && !secondaryActions && { paddingRight: 40 },
                  ]}
                  numberOfLines={immersive || focused || fontScale > 1.5 ? undefined : 2}
                >
                  {event.title}
                </Text>
                {location ? (
                  <Text style={styles.meta} numberOfLines={immersive ? undefined : 1}>
                    {location}
                  </Text>
                ) : null}
              </View>
            </View>
          </Pressable>
          {focused ? (
            <View
              style={[
                styles.focusActions,
                secondaryActions && {
                  position: "relative",
                  top: 0,
                  right: 0,
                  justifyContent: "flex-end",
                },
              ]}
            >
              <Pressable
                style={styles.iconAction}
                accessibilityRole="button"
                accessibilityLabel={t("p1r.richerDetails")}
                onPress={() => onDepth("I")}
              >
                <AppIcon
                  name="arrow.up.left.and.arrow.down.right"
                  size={18}
                  color={colors.textSecondary}
                />
              </Pressable>
            </View>
          ) : null}
        </View>
        {focused || immersive ? (
          <Text style={styles.meta}>{t(`dayFeed.status.${event.status}`)}</Text>
        ) : null}
        {immersive
          ? event.boundaries.map((b) => (
              <View key={b.role} style={styles.section}>
                <Text style={styles.sectionTitle}>{t(`dayFeed.role.${b.role}`)}</Text>
                <Text style={styles.meta}>
                  {[b.local_date, b.local_time, b.zone_id].filter(Boolean).join(" · ") ||
                    t("dayFeed.unresolved")}
                </Text>
                {b.authored_label ? (
                  <Text style={styles.bodyCopy}>{b.authored_label}</Text>
                ) : null}
              </View>
            ))
          : null}
      </View>
    </View>
  );
}
const createStyles = (colors: UiColors) =>
  StyleSheet.create({
    focusOutline: {
      position: "absolute",
      top: 3,
      bottom: 3,
      left: -6,
      right: -6,
      borderWidth: 1,
      borderColor: colors.separator,
      borderRadius: visual.radius.control,
    },
    iconAction: {
      minHeight: 44,
      minWidth: 44,
      alignSelf: "flex-start",
      alignItems: "center",
      justifyContent: "center",
    },
    row: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: visual.space.card,
      paddingVertical: visual.space.row,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.separator,
    },
    rail: { width: visual.space.page * 3, flexShrink: 0 },
    clock: {
      ...visual.type.rowAmount,
      color: colors.textPrimary,
    },
    content: { flex: 1, minWidth: 0, gap: visual.space.heading, position: "relative" },
    bodyTap: { minHeight: 44 },
    header: { flexDirection: "row", alignItems: "flex-start", gap: visual.space.card },
    headingCopy: { flex: 1, gap: visual.space.heading, minWidth: 0 },
    title: {
      ...tokens.typography.title,
      color: colors.textPrimary,
    },
    meta: { ...tokens.typography.secondary, color: colors.textSecondary },
    bodyCopy: {
      ...visual.type.row,
      fontWeight: "400",
      color: colors.textPrimary,
      flexShrink: 1,
      minWidth: 0,
    },
    eventHeader: { position: "relative" },
    focusActions: { position: "absolute", top: -10, right: -4, flexDirection: "row" },
    sectionTitle: { ...visual.type.section, color: colors.textPrimary },
    section: { gap: visual.space.card },
    immersive: { backgroundColor: colors.background, padding: tokens.gutters.content },
    immersiveTitle: { ...visual.type.metric, color: colors.textPrimary },
  });
