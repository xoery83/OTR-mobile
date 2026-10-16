import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { AppState, Pressable, StyleSheet, View } from "react-native";
import { AppIcon } from "@/components/AppIcon";
import {
  getAccountGeneration,
  subscribeAccountGeneration,
} from "@/data/auth/accountGeneration";
import {
  readTripTodaysJourney,
  type createTripTodaysJourneyReader,
} from "@/data/repositories/tripTodaysJourneyRepository";
import { UiButton, UiText as Text } from "@/ui/controls";
import { formatUiDate, t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { useThemedStyles, useUiTheme } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { visual } from "@/ui/visual";
import type { CoreDayRow } from "@/domain/trip/tripCoreV2Day";

type Reader = ReturnType<typeof createTripTodaysJourneyReader>;
export type TodaysJourneyRead = NonNullable<Awaited<ReturnType<Reader["read"]>>>;
export type LocalTodaysJourneyRead = NonNullable<
  Awaited<ReturnType<Reader["readLocal"]>>
>;
type AnyTodayRead = TodaysJourneyRead | LocalTodaysJourneyRead;
function localRead(value: AnyTodayRead): value is LocalTodaysJourneyRead {
  return "kind" in value.source && value.source.kind === "LOCAL_MANUAL_COMMITTED";
}
type Item = NonNullable<Awaited<ReturnType<Reader["resolveItem"]>>>;
export type TodaysJourneyCopy = {
  title: string;
  openToday: string;
  upcoming: string;
  plans: string;
  free: string;
  later: string;
  tonight: string;
  multipleStays: string;
  loading: string;
  unavailable: string;
};
export type TodaysJourneyWidgetProps = {
  tripId: string;
  zone: string | null;
  // Only the owning, identity-guarded DEV Reference perspective supplies this.
  now?: string;
  copy: TodaysJourneyCopy;
  refreshKey?: number;
  onOpenLocalItem?: (
    item: NonNullable<Awaited<ReturnType<Reader["resolveLocalItem"]>>>,
  ) => Promise<void> | void;
  onOpenDayChooser?: () => Promise<void> | void;
  onOpenLocalToday?: (read: LocalTodaysJourneyRead) => Promise<void> | void;
  onOpenToday: (read: TodaysJourneyRead) => Promise<void> | void;
  onOpenItem: (item: Item) => Promise<void> | void;
};
const formatDay = (date: string) =>
  formatUiDate(new Date(`${date}T12:00:00Z`), {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
const formatTime = (instant: string, zone: string) =>
  formatUiDate(new Date(instant), {
    hour: "numeric",
    minute: "2-digit",
    timeZone: zone,
  });
export function TodaysJourneyWidget({
  tripId,
  zone,
  now,
  copy,
  onOpenToday,
  onOpenLocalToday,
  onOpenLocalItem,
  onOpenDayChooser,
  refreshKey = 0,
  onOpenItem,
}: TodaysJourneyWidgetProps) {
  useUiLocale();
  const styles = useThemedStyles(createStyles);
  const generation = useSyncExternalStore(
    subscribeAccountGeneration,
    getAccountGeneration,
  );
  const readKey = `${tripId}/${zone}/${now ?? ""}/${refreshKey}`;
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [read, setRead] = useState<AnyTodayRead | null>(null);
  const [status, setStatus] = useState<"LOADING" | "READY" | "UNAVAILABLE">("LOADING");
  const request = useRef(0);
  const clock = useCallback(
    () => ({ now: now ?? new Date().toISOString(), zone }),
    [now, zone],
  );
  const load = useCallback(async () => {
    const ticket = ++request.current;
    try {
      const reader = await readTripTodaysJourney();
      const value =
        (await reader.readLocal(tripId, clock())) ?? (await reader.read(tripId, clock()));
      if (ticket !== request.current || generation !== getAccountGeneration()) return;
      setLoadedKey(readKey);
      setRead(value);
      setStatus(value ? "READY" : "UNAVAILABLE");
    } catch {
      if (ticket === request.current && generation === getAccountGeneration()) {
        setRead(null);
        setStatus("UNAVAILABLE");
      }
    }
  }, [tripId, clock, generation, readKey]);
  const cancelPending = useCallback(() => {
    request.current++;
  }, []);
  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => {
      if (active) void load();
    });
    const interval = setInterval(() => {
      void load();
    }, 60000);
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void load();
    });
    return () => {
      active = false;
      cancelPending();
      clearInterval(interval);
      sub.remove();
    };
  }, [load, cancelPending]);
  const visible =
    loadedKey === readKey &&
    read?.scope.tripId === tripId &&
    read.scope.generation === generation &&
    read.today.zone === zone
      ? read
      : null;
  const open = async (itemId?: string) => {
    if (!visible || generation !== getAccountGeneration()) return;
    const ticket = request.current;
    try {
      const reader = await readTripTodaysJourney();
      if (itemId) {
        if (localRead(visible)) {
          const item = await reader.resolveLocalItem(tripId, itemId, visible);
          if (!item || !onOpenLocalItem) throw new Error("TODAY_ITEM_UNAVAILABLE");
          if (ticket === request.current && generation === getAccountGeneration())
            await onOpenLocalItem(item);
        } else {
          const item = await reader.resolveItem(tripId, itemId, visible, clock());
          if (!item) throw new Error("TODAY_ITEM_UNAVAILABLE");
          if (ticket === request.current && generation === getAccountGeneration())
            await onOpenItem(item);
        }
      } else {
        const current = localRead(visible)
          ? await reader.readLocal(tripId, clock())
          : await reader.read(tripId, clock());
        if (
          !current ||
          current.scope.accountId !== visible.scope.accountId ||
          JSON.stringify(current.source) !== JSON.stringify(visible.source)
        )
          throw new Error("TODAY_HEADER_UNAVAILABLE");
        if (ticket === request.current && generation === getAccountGeneration()) {
          if (localRead(current)) await onOpenLocalToday?.(current);
          else await onOpenToday(current);
        }
      }
    } catch {
      if (ticket === request.current && generation === getAccountGeneration()) {
        setRead(null);
        setStatus("UNAVAILABLE");
      }
    }
  };
  return (
    <View style={styles.widget}>
      <Text accessibilityRole="header" style={styles.heading}>
        {copy.title}
      </Text>
      {visible ? (
        <>
          <Text style={styles.meta}>{formatDay(visible.today.date)}</Text>
          <Text style={visible.today.primary ? styles.label : styles.freeDay}>
            {visible.today.primaryKind === "UPCOMING"
              ? copy.upcoming
              : visible.today.primaryKind === "PLANS"
                ? copy.plans
                : copy.free}
          </Text>
          {visible.today.primary ? (
            <TodayRow
              item={visible.today.primary}
              zone={visible.today.zone}
              pending={
                localRead(visible) && visible.today.primary.certificateGeneration === 0
              }
              onOpen={open}
            />
          ) : null}
          {visible.today.later.length ? (
            <>
              <Text style={styles.label}>{copy.later}</Text>
              {visible.today.later.map((item) => (
                <TodayRow
                  key={item.itemRef}
                  item={item}
                  zone={visible.today.zone}
                  pending={localRead(visible) && item.certificateGeneration === 0}
                  onOpen={open}
                />
              ))}
            </>
          ) : null}
          {visible.today.tonight ? (
            <>
              <Text style={styles.label}>{copy.tonight}</Text>
              {
                <TodayRow
                  item={visible.today.tonight}
                  zone={visible.today.zone}
                  pending={
                    localRead(visible) &&
                    visible.today.tonight.certificateGeneration === 0
                  }
                  onOpen={open}
                />
              }
            </>
          ) : null}
          {visible.today.multipleStays ? (
            <Text style={styles.meta}>{copy.multipleStays}</Text>
          ) : null}
        </>
      ) : (
        <Text style={styles.meta}>
          {status === "LOADING" ? copy.loading : copy.unavailable}
        </Text>
      )}
      <View style={styles.actions}>
        <UiButton
          label={copy.openToday}
          onPress={() => void open()}
          disabled={!visible || (localRead(visible) && !onOpenLocalToday)}
        />
        {!visible && onOpenDayChooser ? (
          <UiButton
            label={t("tripHome.preparation.day")}
            variant="secondary"
            onPress={() => void onOpenDayChooser()}
          />
        ) : null}
      </View>
    </View>
  );
}
function TodayRow({
  item,
  zone,
  onOpen,
  pending = false,
}: {
  pending?: boolean;
  item: CoreDayRow;
  zone: string;
  onOpen: (id: string) => Promise<void>;
}) {
  const styles = useThemedStyles(createStyles);
  const colors = useUiTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={item.title}
      style={styles.row}
      onPress={() => void onOpen(item.itemRef)}
    >
      <View style={styles.rowCopy}>
        <Text style={styles.item} numberOfLines={2}>
          {item.title}
        </Text>
        {pending ? <Text style={styles.meta}>{t("tripCreate.itemPending")}</Text> : null}
        {item.displayTime?.instant && item.displayTime.comparable ? (
          <Text style={styles.meta}>{formatTime(item.displayTime.instant, zone)}</Text>
        ) : null}
      </View>
      <AppIcon name="chevron.right" size={16} color={colors.textSecondary} />
    </Pressable>
  );
}
const createStyles = (colors: UiColors) =>
  StyleSheet.create({
    widget: { flex: 1, gap: visual.space.card },
    heading: { ...visual.type.section, color: colors.textPrimary },
    label: { ...visual.type.action, color: colors.textSecondary },
    item: { ...visual.type.row, color: colors.textPrimary, flexShrink: 1 },
    meta: { ...visual.type.meta, color: colors.textSecondary },
    freeDay: {
      ...visual.type.row,
      color: colors.textPrimary,
      textAlign: "center",
      paddingVertical: visual.space.section * 2,
    },
    actions: { marginTop: "auto", paddingTop: visual.space.card },
    rowCopy: { flex: 1, gap: 4 },
    row: {
      minHeight: 52,
      flexDirection: "row",
      alignItems: "center",
      gap: visual.space.card,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.separator,
      paddingVertical: visual.space.heading,
    },
  });
