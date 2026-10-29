import { ImmersiveActions } from "./ImmersiveActions";
import { PendingSyncDot } from "./PendingSyncDot";
import { useRef, type ReactNode } from "react";
import { Pressable, StyleSheet, View, useWindowDimensions } from "react-native";
import { type DayEvent } from "@/domain/trip/dayReadModel";
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

// A display-only shape for the existing local Reader; it cannot enter Day composition.
export type P1RowDisplay = Pick<
  DayEvent,
  | "id"
  | "semantic_revision"
  | "title"
  | "status"
  | "authored_label"
  | "accepted_address"
  | "authored_address"
  | "accepted_address_line1"
  | "authored_address_line1"
> & {
  clocks: {
    start?: {
      role: "START";
      local_date: string | null;
      local_time: string | null;
      qualified: boolean;
    };
    end?: {
      role: "END";
      local_date: string | null;
      local_time: string | null;
      qualified: boolean;
    };
    primary: string | null;
    secondary: string | null;
    dayOffset: number;
  };
};

export type P1MoveInteraction = {
  canMove(id: string): boolean;
  start(id: string, point: { x: number; y: number }): void;
  wrapRow(key: string, date: string, content: ReactNode): ReactNode;
  wrapClock(key: string, date: string, minute: number, content: ReactNode): ReactNode;
};
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
  event: sourceEvent,
  display,
  depth,
  onDepth,
  withinMarker,
  children,
  facts: suppliedFacts,
  actions,
  context = "UNKNOWN",
  occurrence = "START",
  instant,
  insertionToday,
  onInsert,
  hideDivider = false,
  showHeader = true,
  moveGesture,
  wrapMoveClock,
}: {
  event?: DayEvent;
  display?: P1RowDisplay;
  depth: Depth;
  onDepth(depth: Depth): void;
  withinMarker?: ReactNode;
  children?: ReactNode;
  facts?: P1ReadFacts;
  actions?: P1ReadActions;
  context?: "FUTURE" | "TODAY" | "PAST" | "UNKNOWN";
  occurrence?: "START" | "END";
  instant?: string;
  insertionToday?: string | null;
  onInsert?(side: "BEFORE" | "AFTER"): void;
  hideDivider?: boolean;
  showHeader?: boolean;
  wrapMoveClock?: (role: "PRIMARY" | "SECONDARY", content: ReactNode) => ReactNode;
  moveGesture?: {
    start(point: { x: number; y: number }): void;
  };
}) {
  useUiLocale();
  const longPress = useRef(false);
  const { fontScale } = useWindowDimensions();
  const styles = useThemedStyles(createStyles),
    colors = useUiTheme();
  const event = sourceEvent ?? display;
  if (!event) return null;
  const facts = sourceEvent
      ? currentP1Facts(sourceEvent, suppliedFacts)
      : suppliedFacts?.itemId === event.id &&
          suppliedFacts.semanticRevision === event.semantic_revision
        ? suppliedFacts
        : undefined,
    activeActions = suppliedFacts && !facts ? undefined : actions;
  const clocks = sourceEvent ? p1ReadClocks(sourceEvent, occurrence) : display!.clocks,
    location = event.authored_label || (sourceEvent ? eventLocation(sourceEvent) : null),
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
  const renderClock = (role: "PRIMARY" | "SECONDARY", content: ReactNode) =>
    wrapMoveClock?.(role, content) ?? content;
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
    onInsert &&
    p1InsertionEligible(event, occurrence, context, instant, insertionToday);
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
          if (insert) onInsert?.(side);
        }}
      >
        <AppIcon name="plus" size={12} color={colors.textSecondary} />
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
              {facts?.pending ? <PendingSyncDot /> : null}
            </Text>
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
          {facts?.note?.trim() ? (
            <View style={styles.card}>
              <Text style={styles.section}>{t("fidelity.note")}</Text>
              <Text style={styles.noteFull}>{facts.note}</Text>
            </View>
          ) : null}
          {(["photos", "attachments", "expenses"] as const).map((kind) =>
            count[kind] !== null && count[kind]! > 0 ? (
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
          <ImmersiveActions actions={activeActions} />
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
          onPressIn={() => {
            longPress.current = false;
          }}
          delayLongPress={450}
          onLongPress={
            moveGesture
              ? (event) => {
                  longPress.current = true;
                  if (typeof __DEV__ !== "undefined" && __DEV__)
                    console.info(JSON.stringify({ event: "p1_native_pickup" }));
                  moveGesture.start({
                    x: event.nativeEvent.pageX,
                    y: event.nativeEvent.pageY,
                  });
                }
              : undefined
          }
          onPress={() => {
            if (!longPress.current) onDepth(focused ? "B" : "F");
          }}
        >
          <View style={[styles.rail, { width: 54 * Math.max(1, fontScale) }]}>
            {occurrence === "END" ? (
              <Text style={styles.endRole}>
                {t(clocks.primary ? "fidelity.endAt" : "fidelity.end")}
              </Text>
            ) : null}
            {clocks.primary
              ? renderClock("PRIMARY", <Text style={styles.clock}>{clocks.primary}</Text>)
              : null}
            {clocks.secondary
              ? renderClock(
                  "SECONDARY",
                  <Text style={styles.endClock}>
                    {clocks.secondary}
                    {clocks.dayOffset ? (
                      <Text style={styles.offset}>⁺{clocks.dayOffset}</Text>
                    ) : null}
                  </Text>,
                )
              : null}
            {withinMarker}
          </View>
          <View style={styles.content}>
            <Text
              style={styles.title}
              numberOfLines={focused || fontScale > 1.5 ? undefined : 2}
            >
              {event.title}
              {facts?.pending ? <PendingSyncDot /> : null}
            </Text>
            {location ? (
              <Text
                style={styles.meta}
                numberOfLines={focused || fontScale > 1.5 ? undefined : 1}
              >
                {location}
              </Text>
            ) : null}
            {focused ? (
              <>
                {event.status !== "planned" ? (
                  <Text style={styles.meta}>{t(`dayFeed.status.${event.status}`)}</Text>
                ) : null}
                {tags}
                {context !== "PAST" && facts?.note?.trim() ? (
                  <Text style={styles.note}>{p1NoteExcerpt(facts.note)}</Text>
                ) : null}
                {children}
              </>
            ) : null}
          </View>
        </Pressable>
        {focused ? (
          <View style={styles.focusBody}>
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
    clock: { ...visual.type.feedClock, color: c.textSecondary },
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
    section: { ...visual.type.eyebrow, letterSpacing: 0, color: c.textSecondary },
    body: { fontSize: 15, lineHeight: 22.5, color: c.textPrimary },
    placeActions: { flexDirection: "row", flexWrap: "wrap", gap: 9 },
    noteFull: {
      ...visual.type.feedTitle,
      fontWeight: "400",
      lineHeight: 22.5,
      color: c.textPrimary,
    },
  });
