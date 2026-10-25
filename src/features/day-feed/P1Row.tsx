import type { ReactNode } from "react";
import { Pressable, StyleSheet, View, useWindowDimensions } from "react-native";
import { acceptedBoundaryAnchor, type DayEvent } from "@/domain/trip/dayReadModel";
import { AppIcon } from "@/components/AppIcon";
import { SheetHeader } from "@/components/SheetHeader";
import { UiButton, UiText as Text } from "@/ui/controls";
import { formatUiDate, formatUiNumber, t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { useThemedStyles, useUiTheme } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { visual } from "@/ui/visual";
import { eventLocation, type Depth } from "./presentation";
import {
  currentP1Facts,
  distinctP1Count,
  p1NoteExcerpt,
  p1ReadClocks,
  p1InsertionEligible,
  type P1ReadFacts,
  type P1ReadActions,
} from "./p1ReadPresentation";

export function ReadFactTag({ label, onPress }: { label: string; onPress?: () => void }) {
  const styles = useThemedStyles(createStyles);
  const tag = <Text style={styles.tag}>{label}</Text>;
  return onPress ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      style={styles.tagTarget}
      onPress={onPress}
    >
      {tag}
    </Pressable>
  ) : (
    tag
  );
}
export function P1Row({
  event,
  depth,
  onDepth,
  withinMarker,
  children,
  facts: suppliedFacts,
  actions,
  context = "UNKNOWN",
  occurrence = "START",
  instant,
  onInsert,
  hideDivider = false,
  showHeader = true,
}: {
  event: DayEvent;
  depth: Depth;
  onDepth(depth: Depth): void;
  withinMarker?: ReactNode;
  children?: ReactNode;
  facts?: P1ReadFacts;
  actions?: P1ReadActions;
  context?: "FUTURE" | "TODAY" | "PAST" | "UNKNOWN";
  occurrence?: "START" | "END";
  instant?: string;
  onInsert?(side: "BEFORE" | "AFTER"): void;
  hideDivider?: boolean;
  showHeader?: boolean;
}) {
  useUiLocale();
  const { fontScale } = useWindowDimensions();
  const styles = useThemedStyles(createStyles),
    colors = useUiTheme();
  const facts = currentP1Facts(event, suppliedFacts),
    activeActions = suppliedFacts && !facts ? undefined : actions;
  const clocks = p1ReadClocks(event, occurrence),
    location = event.authored_label || eventLocation(event),
    address =
      event.accepted_address ||
      event.authored_address ||
      event.accepted_address_line1 ||
      event.authored_address_line1;
  const primaryLabel =
    clocks.primary && occurrence === "END"
      ? t("fidelity.endAtTime", { time: clocks.primary })
      : clocks.primary;
  const secondaryLabel =
    clocks.secondary && clocks.dayOffset
      ? t("fidelity.clockOffset", { time: clocks.secondary, days: clocks.dayOffset })
      : clocks.secondary;
  const rowLabel = primaryLabel
    ? secondaryLabel
      ? t("fidelity.rowTimes", {
          title: event.title,
          start: primaryLabel,
          end: secondaryLabel,
        })
      : t("fidelity.rowTime", { title: event.title, time: primaryLabel })
    : event.title;
  const focused = depth === "F",
    immersive = depth === "I";
  const count = {
    photos: distinctP1Count(facts?.photoIds),
    attachments: distinctP1Count(facts?.documentIds),
    expenses: distinctP1Count(facts?.expenseIds),
  };
  const participation = facts?.participation;
  const people = participation
    ? t(
        participation.mode === "WHOLE_GROUP"
          ? "tripCreate.planEveryone"
          : participation.mode === "SELF"
            ? "tripCreate.planOnlyMe"
            : "fidelity.people",
        {
          count:
            participation.mode === "SELECTED_MEMBERS"
              ? new Set(participation.personIds).size
              : 0,
        },
      )
    : null;
  const map =
    context === "FUTURE" && address
      ? activeActions?.map
      : context === "TODAY" && facts?.navigationQualified
        ? activeActions?.navigate
        : undefined;
  const insert =
    focused &&
    instant &&
    onInsert &&
    p1InsertionEligible(event, occurrence, context, instant, !!facts?.pending);
  const countLabel = (kind: "photos" | "attachments" | "expenses") =>
    t(count[kind] === 1 ? `fidelity.${kind}.one` : `fidelity.${kind}`, {
      count: formatUiNumber(count[kind] ?? 0),
    });
  const tags = (
    <View style={styles.tags}>
      {people ? (
        <ReadFactTag
          label={people}
          onPress={immersive ? activeActions?.participants : undefined}
        />
      ) : null}
      {(context === "TODAY" || context === "PAST" || immersive) && !!count.expenses ? (
        <ReadFactTag
          label={t(count.expenses === 1 ? "fidelity.expenses.one" : "fidelity.expenses", {
            count: formatUiNumber(count.expenses),
          })}
        />
      ) : null}
      {(context === "TODAY" || context === "PAST" || immersive) && !!count.photos ? (
        <ReadFactTag
          label={t(count.photos === 1 ? "fidelity.photos.one" : "fidelity.photos", {
            count: formatUiNumber(count.photos),
          })}
        />
      ) : null}
    </View>
  );
  const icon = (
    name: Parameters<typeof AppIcon>[0]["name"],
    label: string,
    onPress: () => void,
  ) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={styles.iconTarget}
    >
      <AppIcon name={name} size={18} color={colors.accent} />
    </Pressable>
  );
  const insertControl = (side: "BEFORE" | "AFTER") => (
    <View style={styles.insertSlot}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t(
          side === "BEFORE" ? "fidelity.addAbove" : "fidelity.addBelow",
        )}
        style={styles.insertTarget}
        onPress={() => {
          if (
            instant &&
            p1InsertionEligible(event, occurrence, context, instant, !!facts?.pending)
          )
            onInsert?.(side);
        }}
      >
        <AppIcon name="plus" size={15} color={colors.textSecondary} />
      </Pressable>
    </View>
  );
  if (immersive)
    return (
      <View style={styles.immersive}>
        {showHeader ? (
          <SheetHeader
            title=""
            leftLabel={t("common.back")}
            onLeft={() => onDepth("F")}
          />
        ) : null}
        <View style={styles.immersiveBody}>
          <View style={styles.immersiveHeading}>
            <Text style={styles.kicker}>{t("fidelity.activity")}</Text>
            <Text accessibilityRole="header" style={styles.immersiveTitle}>
              {event.title}
            </Text>
            {facts?.pending ? (
              <Text style={styles.meta}>{t("tripCreate.itemPending")}</Text>
            ) : null}
            {event.status !== "planned" ? (
              <Text style={styles.meta}>{t(`dayFeed.status.${event.status}`)}</Text>
            ) : null}
          </View>
          <View style={[styles.card, styles.timeFacts]}>
            {[clocks.start, clocks.end]
              .filter((b) => b?.local_date || b?.local_time)
              .map((b) => (
                <View key={b!.role} style={styles.timeFact}>
                  <Text style={styles.meta}>
                    {t(b!.role === "END" ? "fidelity.end" : "fidelity.start")}
                  </Text>
                  {b!.local_date ? (
                    <Text style={styles.meta}>
                      {formatUiDate(new Date(b!.local_date + "T12:00:00Z"), {
                        // ui-foundation-exception: string -- Intl date formatting option; not display copy.
                        dateStyle: "medium",
                        // ui-foundation-exception: string -- Intl calendar-date zone; not authored timezone or display copy.
                        timeZone: "UTC",
                      })}
                    </Text>
                  ) : null}
                  {b!.local_time ? (
                    <Text style={styles.largeClock}>{b!.local_time.slice(0, 5)}</Text>
                  ) : null}
                  {b!.local_time && !acceptedBoundaryAnchor(b!) ? (
                    <Text style={styles.meta}>{t("tripHome.today.timezoneUnknown")}</Text>
                  ) : null}
                </View>
              ))}
          </View>
          {location || address ? (
            <View style={styles.card}>
              <Text style={styles.section}>{t("fidelity.place")}</Text>
              {location ? <Text style={styles.body}>{location}</Text> : null}
              {address && address !== location ? (
                <Text style={styles.meta}>{address}</Text>
              ) : null}
              <View style={styles.placeActions}>
                {address && activeActions?.map ? (
                  <UiButton
                    label={t("fidelity.map")}
                    variant="text"
                    onPress={activeActions.map}
                  />
                ) : null}
                {facts?.navigationQualified && activeActions?.navigate ? (
                  <UiButton
                    label={t("fidelity.navigate")}
                    variant="text"
                    onPress={activeActions.navigate}
                  />
                ) : null}
              </View>
            </View>
          ) : null}
          {people ? (
            <View style={styles.card}>
              <Text style={styles.section}>{t("tripCreate.planParticipants")}</Text>
              <ReadFactTag label={people} onPress={activeActions?.participants} />
            </View>
          ) : null}
          {facts?.note ? (
            <View style={styles.card}>
              <Text style={styles.section}>{t("fidelity.note")}</Text>
              <Text style={styles.noteFull}>{facts.note}</Text>
            </View>
          ) : null}
          {(["photos", "attachments", "expenses"] as const).map((kind) =>
            count[kind] !== null ? (
              <View key={kind} style={styles.card}>
                <View style={styles.cardHead}>
                  <Text style={styles.section}>{t(`fidelity.${kind}Title`)}</Text>
                  {count[kind]! > 0 && activeActions?.[kind] ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={countLabel(kind)}
                      style={styles.countTarget}
                      onPress={activeActions[kind]}
                    >
                      <Text style={styles.body}>{count[kind]}</Text>
                    </Pressable>
                  ) : (
                    <Text style={styles.body}>{count[kind]}</Text>
                  )}
                </View>
              </View>
            ) : null,
          )}
          <View style={styles.actions}>
            {(["addPhoto", "addAttachment", "addExpense", "linkExpense"] as const).map(
              (kind) =>
                activeActions?.[kind] ? (
                  <View key={kind} style={styles.actionCell}>
                    <UiButton
                      label={t(`fidelity.${kind}`)}
                      variant="secondary"
                      size="tile"
                      icon={
                        <View style={styles.actionIcon}>
                          <AppIcon
                            name={kind === "linkExpense" ? "arrow.up.right" : "plus"}
                            size={18}
                            color={colors.accent}
                          />
                        </View>
                      }
                      onPress={activeActions[kind]!}
                    />
                  </View>
                ) : null,
            )}
          </View>
          {children}
        </View>
      </View>
    );
  return (
    <View>
      {insert ? insertControl("BEFORE") : null}
      <View
        testID={focused ? "focus-selected-region" : undefined}
        style={[
          styles.row,
          !focused && hideDivider && styles.noDivider,
          focused && styles.focus,
        ]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={rowLabel}
          accessibilityHint={t(focused ? "p1r.collapseHint" : "p1r.focusHint")}
          style={[styles.main, focused && styles.focusMain]}
          onPress={() => onDepth(focused ? "B" : "F")}
        >
          <View style={[styles.rail, { width: 54 * Math.max(1, fontScale) }]}>
            {occurrence === "END" ? (
              <Text style={styles.endRole}>
                {t(clocks.primary ? "fidelity.endAt" : "fidelity.end")}
              </Text>
            ) : null}
            {clocks.primary ? <Text style={styles.clock}>{clocks.primary}</Text> : null}
            {clocks.secondary ? (
              <Text style={styles.endClock}>
                {clocks.secondary}
                {clocks.dayOffset ? (
                  <Text style={styles.offset}>⁺{clocks.dayOffset}</Text>
                ) : null}
              </Text>
            ) : null}
            {withinMarker}
          </View>
          <View style={styles.content}>
            <Text
              style={styles.title}
              numberOfLines={focused || fontScale > 1.5 ? undefined : 2}
            >
              {event.title}
            </Text>
            {location ? (
              <Text
                style={styles.meta}
                numberOfLines={focused || fontScale > 1.5 ? undefined : 1}
              >
                {location}
              </Text>
            ) : null}
            {facts?.pending ? (
              <Text style={styles.meta}>{t("tripCreate.itemPending")}</Text>
            ) : null}
          </View>
        </Pressable>
        {focused ? (
          <View style={styles.focusBody}>
            {event.status !== "planned" ? (
              <Text style={styles.meta}>{t(`dayFeed.status.${event.status}`)}</Text>
            ) : null}
            {tags}
            {context !== "PAST" && facts?.note ? (
              <Text style={styles.note}>{p1NoteExcerpt(facts.note)}</Text>
            ) : null}
            {children}
            <View style={styles.focusActions}>
              {icon("arrow.up.left.and.arrow.down.right", t("p1r.richerDetails"), () =>
                onDepth("I"),
              )}
              {map
                ? icon(
                    context === "TODAY" ? "location" : "map",
                    t(context === "TODAY" ? "fidelity.navigate" : "fidelity.map"),
                    map,
                  )
                : null}
            </View>
          </View>
        ) : null}
      </View>
      {insert ? insertControl("AFTER") : null}
    </View>
  );
}
const createStyles = (c: UiColors) =>
  StyleSheet.create({
    row: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.separator },
    noDivider: { borderBottomWidth: 0 },
    focus: {
      borderWidth: 1,
      borderColor: c.separator,
      borderRadius: visual.radius.feedFocus,
      backgroundColor: c.surface,
      overflow: "hidden",
    },
    main: {
      flexDirection: "row",
      gap: 12,
      paddingVertical: 13,
      paddingHorizontal: 2,
      minHeight: 69,
    },
    focusMain: { paddingHorizontal: 11, paddingBottom: 0 },
    rail: { width: 54, flexShrink: 0, paddingTop: 2 },
    clock: { ...visual.type.feedClock, color: c.textPrimary },
    endClock: { ...visual.type.feedEndClock, color: c.textSecondary, marginTop: 3 },
    endRole: { ...visual.type.feedTag, color: c.accent },
    offset: { ...visual.type.feedEndClock, color: c.accent, fontWeight: "700" },
    content: { flex: 1, minWidth: 0, gap: 4 },
    title: { ...visual.type.feedTitle, color: c.textPrimary },
    meta: { ...visual.type.feedNote, color: c.textSecondary },
    focusBody: { paddingHorizontal: 11 },
    tags: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 },
    tag: {
      ...visual.type.feedTag,
      color: c.accent,
      backgroundColor: c.selected,
      paddingVertical: 4,
      paddingHorizontal: 9,
      borderRadius: visual.radius.pill,
      overflow: "hidden",
      alignSelf: "flex-start",
    },
    tagTarget: { minHeight: 44, justifyContent: "center", alignSelf: "flex-start" },
    note: {
      ...visual.type.feedNote,
      fontStyle: "italic",
      color: c.textSecondary,
      marginTop: 10,
    },
    focusActions: {
      flexDirection: "row",
      justifyContent: "flex-end",
      gap: 4,
      paddingTop: 2,
      paddingBottom: 8,
    },
    iconTarget: { width: 44, height: 44, justifyContent: "center", alignItems: "center" },
    insertSlot: { height: 18, alignItems: "center", justifyContent: "center" },
    insertTarget: {
      position: "absolute",
      width: 44,
      height: 44,
      alignItems: "center",
      justifyContent: "center",
    },
    immersive: { backgroundColor: c.background },
    immersiveBody: { paddingHorizontal: 18, paddingBottom: 54 },
    immersiveHeading: { paddingVertical: 28, gap: 12 },
    kicker: { ...visual.type.feedNote, fontWeight: "700", color: c.accent },
    immersiveTitle: { ...visual.type.immersiveTitle, color: c.textPrimary },
    card: {
      backgroundColor: c.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.separator,
      borderRadius: visual.radius.association,
      paddingVertical: 17,
      paddingHorizontal: 18,
      marginBottom: 11,
      gap: 10,
    },
    timeFacts: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
    timeFact: { flex: 1, minWidth: 120, gap: 6 },
    largeClock: { ...visual.type.metric, fontSize: 23, color: c.textPrimary },
    cardHead: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      gap: 10,
    },
    countTarget: {
      minHeight: 44,
      minWidth: 44,
      alignItems: "flex-end",
      justifyContent: "center",
    },
    actionIcon: {
      width: 28,
      height: 28,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: c.selected,
      borderRadius: 9,
    },
    section: { ...visual.type.meta, fontWeight: "700", color: c.textSecondary },
    body: { ...visual.type.row, color: c.textPrimary },
    placeActions: { flexDirection: "row", flexWrap: "wrap", gap: 9 },
    noteFull: {
      ...visual.type.feedTitle,
      fontWeight: "400",
      lineHeight: 22.5,
      color: c.textPrimary,
    },
    actions: { flexDirection: "row", flexWrap: "wrap", gap: 9, marginVertical: 17 },
    actionCell: { flexBasis: "47%", flexGrow: 1 },
  });
