import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import {
  AppState,
  Modal,
  StyleSheet,
  View,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
  type GestureResponderEvent,
} from "react-native";
import { UiButton, UiText } from "@/ui/controls";
import { SheetHeader } from "@/components/SheetHeader";
import { t, formatUiDate } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { useThemedStyles } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { visual } from "@/ui/visual";
import type { DayListHandle } from "@/features/day-feed/WindowedDayList";
import { p1FidelityPack, p1FidelityFixture } from "./p1FidelityFixture";
import { itemsForLocalDate } from "@/domain/trip/dayReadModel";
import { composeDayStream } from "@/features/day-feed/composition";
import {
  movePrecision,
  moveClockTick,
  moveTickRate,
  moveInsertionTarget,
  moveFollowAnchor,
  type PlacementRow,
  type MoveStep,
} from "./p1MoveCursor";
import {
  moveProposal,
  durationMinutes,
  samePlacement,
  type MoveItem,
  type MoveProposal,
} from "./p1MovePilotModel";
export type MovePoint = { x: number; y: number };
export type FixtureMovePreview = {
  date: string;
  time: string | null;
  endDate: string | null;
  endTime: string | null;
  instant: string | null;
  endInstant: string | null;
  zone: string | null;
};
type Region = { date: string; key: string; node: View; top: number; bottom: number };
type Drag = {
  item: MoveItem & { id: string; title: string };
  point: MovePoint;
  start: MovePoint;
  neutralY: number;
  minutes: number;
  step: MoveStep;
  date: string;
  ntc: boolean;
  moved: boolean;
  progress: number;
  direction: number;
  duration: number | null;
  proposal: MoveProposal;
  lastFollow: number;
  targetY: number;
  targetVisible: boolean;
  targetKey: string;
};
export function useP1FixtureMove(
  list: RefObject<DayListHandle | null>,
  resetKey: string,
  topInset: number,
) {
  useUiLocale();
  const styles = useThemedStyles(makeStyles),
    { width, height } = useWindowDimensions();
  const regions = useRef(new Map<View, Region>()),
    placementRows = useRef<PlacementRow[]>([]),
    placementRange = useRef({ start: "", end: "" }),
    drag = useRef<Drag | null>(null),
    confirmationRef = useRef<Drag | null>(null),
    durations = useRef(new Map<string, number | null>());
  const [active, setActive] = useState<Drag | null>(null),
    [confirmation, setConfirmation] = useState<Drag | null>(null),
    [previews, setPreviews] = useState<Record<string, FixtureMovePreview>>({});
  const register = useCallback((node: View, date: string, key: string) => {
    regions.current.set(node, { node, date, key, top: 0, bottom: 0 });
  }, []);
  useEffect(() => {
    const fixture = p1FidelityFixture("future", {}, undefined, undefined, {
      previews,
      handlers: { start() {}, change() {}, end() {} },
    });
    placementRange.current = fixture.dateRange;
    placementRows.current = fixture.dates.flatMap((date) => [
      { key: `day:${date}`, date, itemId: "", minute: null },
      ...composeDayStream(
        itemsForLocalDate(fixture.projection, date, fixture.zone),
        fixture.instant,
        { occurrenceFocus: true },
      ).rows.map((row) => {
        const role = row.item.roles.includes("START") ? "START" : "END";
        const clock =
          row.position === "TNS"
            ? null
            : row.item.event.boundaries.find((b) => b.role === role)?.local_time;
        return {
          key: row.key,
          date,
          itemId: row.item.event.id,
          minute: clock
            ? Number(clock.slice(0, 2)) * 60 + Number(clock.slice(3, 5))
            : null,
        };
      }),
    ]);
  }, [previews]);
  const unregister = useCallback((node: View) => {
    regions.current.delete(node);
  }, []);
  const measure = useCallback(() => {
    for (const region of regions.current.values())
      region.node.measureInWindow((_x, y, _w, h) => {
        if (regions.current.get(region.node) === region) {
          region.top = y;
          region.bottom = y + h;
        }
      });
  }, []);
  const update = useCallback(
    (point: MovePoint) => {
      const d = drag.current;
      if (!d || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
      d.point = point;
      d.moved ||= Math.hypot(point.x - d.start.x, point.y - d.start.y) > 6;
      const step = movePrecision(point.x, width, d.step);
      if (step !== d.step) {
        d.step = step;
        d.progress = 0;
      }
      d.proposal = moveProposal(d.item, d.date, d.minutes, d.ntc, d.duration, true);
      const target = moveInsertionTarget(
        placementRows.current,
        d.date,
        d.minutes,
        d.item.id,
        d.ntc,
      );
      const region = [...regions.current.values()].find(
        (r) => r.key === target.key && r.bottom > r.top,
      );
      d.targetKey = target.key;
      d.targetVisible = !!region;
      d.targetY = region
        ? target.edge === "BEFORE"
          ? region.top
          : region.bottom
        : Math.max(topInset + 84, Math.min(height - 150, point.y + 36));
      setActive({ ...d });
    },
    [width, topInset, height],
  );
  const start = useCallback(
    (id: string, point: MovePoint) => {
      const source = p1FidelityPack.items.find(
        (item) => item.id === id && item.availability === "AVAILABLE",
      );
      if (!source) return;
      const item = { ...source, ...previews[id] } as Drag["item"];
      const minutes = item.time
        ? Number(item.time.slice(0, 2)) * 60 + Number(item.time.slice(3))
        : 720;
      const duration = durations.current.has(id)
        ? durations.current.get(id)!
        : durationMinutes(item);
      const d: Drag = {
        item,
        point,
        start: point,
        neutralY: point.y,
        minutes,
        step: movePrecision(point.x, width),
        date: item.date,
        ntc: !item.time,
        moved: false,
        progress: 0,
        direction: 0,
        duration,
        proposal: moveProposal(item, item.date, minutes, !item.time, duration, true),
        lastFollow: 0,
        targetY: Math.max(topInset + 84, Math.min(height - 150, point.y + 36)),
        targetVisible: false,
        targetKey: `day:${item.date}`,
      };
      confirmationRef.current = null;
      setConfirmation(null);
      drag.current = d;
      measure();
      setActive({ ...d });
      console.info(JSON.stringify({ event: "p1_fixture_move_arm", itemId: id }));
    },
    [previews, topInset, height, width, measure],
  );
  const end = useCallback(() => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    setActive(null);
    console.info(
      JSON.stringify({
        event: "p1_fixture_move_end",
        changed: d.moved,
        status: d.proposal.status,
      }),
    );
    if (d.moved && !samePlacement(d.item, d.proposal)) {
      const pending = { ...d };
      confirmationRef.current = pending;
      setConfirmation(pending);
    }
  }, []);
  const cancel = useCallback(() => {
    if (!drag.current) return;
    drag.current = null;
    setActive(null);
    console.info(JSON.stringify({ event: "p1_fixture_move_cancel" }));
  }, []);
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") cancel();
    });
    return () => subscription.remove();
  }, [cancel]);
  // After pickup the stable host takes the responder, surviving source-row recycling.
  const touchHandlers = {
    onMoveShouldSetResponderCapture: () => drag.current !== null,
    onResponderTerminationRequest: () => false,
    onResponderMove: (event: GestureResponderEvent) => {
      if (event.nativeEvent.touches.length !== 1) return cancel();
      update({ x: event.nativeEvent.pageX, y: event.nativeEvent.pageY });
    },
    onResponderRelease: end,
    onResponderTerminate: cancel,
    onTouchStart: (event: GestureResponderEvent) => {
      if (drag.current && event.nativeEvent.touches.length !== 1) cancel();
    },
    onTouchMove: (event: GestureResponderEvent) => {
      if (!drag.current) return;
      if (event.nativeEvent.touches.length !== 1) return cancel();
      update({ x: event.nativeEvent.pageX, y: event.nativeEvent.pageY });
    },
    onTouchEnd: (event: GestureResponderEvent) => {
      if (event.nativeEvent.touches.length === 0) end();
    },
    onTouchCancel: cancel,
  };
  const moving = active !== null;
  useEffect(() => {
    if (!moving) return;
    let last = Date.now();
    const timer = setInterval(() => {
      const d = drag.current;
      if (!d) return;
      measure();
      const now = Date.now(),
        seconds = Math.min(0.15, (now - last) / 1000);
      last = now;
      if (d.moved) {
        const rate = moveTickRate(d.point.y - d.neutralY, d.step),
          direction = Math.sign(rate);
        if (direction !== d.direction || !direction) {
          d.progress = 0;
          d.direction = direction;
        }
        d.progress += rate * seconds;
        const ticks = Math.trunc(d.progress);
        if (ticks) {
          d.progress -= ticks;
          const next = moveClockTick(
            d.date,
            d.minutes,
            d.step,
            ticks,
            placementRange.current.start,
            placementRange.current.end,
          );
          if (next.date !== d.date || next.minute !== d.minutes) {
            d.date = next.date;
            d.minutes = next.minute;
            d.ntc = false;
          }
        }
      }
      update(d.point);
      if (d.moved && now - d.lastFollow > 120) {
        const desired = Math.max(topInset + 84, Math.min(height - 150, d.point.y + 36));
        if (!d.targetVisible) {
          if (now - d.lastFollow > 500) {
            list.current?.restoreAnchor({ key: d.targetKey, date: d.date, within: 0 });
            d.lastFollow = now;
          }
        } else if (Math.abs(d.targetY - desired) > 12) {
          const anchor = list.current?.saveAnchor();
          if (anchor)
            list.current?.restoreAnchor(
              moveFollowAnchor(
                anchor,
                Math.max(-28, Math.min(28, (d.targetY - desired) * 0.22)),
                placementRows.current,
                (key) => {
                  const region = [...regions.current.values()].find((r) => r.key === key);
                  return region ? region.bottom - region.top : undefined;
                },
              ),
            );
          d.lastFollow = now;
        }
      }
    }, 60);
    return () => clearInterval(timer);
  }, [moving, measure, update, list, height, topInset]);
  useEffect(
    () => () => {
      drag.current = null;
      confirmationRef.current = null;
    },
    [],
  );
  const [renderedKey, setRenderedKey] = useState(resetKey);
  if (renderedKey !== resetKey) {
    setRenderedKey(resetKey);
    setActive(null);
    setConfirmation(null);
    setPreviews({});
  }
  useLayoutEffect(() => {
    drag.current = null;
    confirmationRef.current = null;
    durations.current.clear();
  }, [resetKey]);
  const dismissConfirmation = () => {
    if (confirmationRef.current !== confirmation) return;
    confirmationRef.current = null;
    setConfirmation(null);
  };
  const apply = () => {
    const d = confirmationRef.current,
      p = d?.proposal;
    if (!d || d !== confirmation || p?.status !== "READY" || !p.date) return;
    confirmationRef.current = null;
    durations.current.set(d.item.id, p.durationMinutes ?? null);
    setPreviews((old) => ({
      ...old,
      [d.item.id]: {
        date: p.date!,
        time: p.time ?? null,
        endDate: p.endDate ?? null,
        endTime: p.endTime ?? null,
        instant: p.instant ?? null,
        endInstant: p.endInstant ?? null,
        zone: p.zone ?? null,
      },
    }));
    setConfirmation(null);
  };
  const label = (p: MoveProposal) =>
    [p.date, p.time ?? t("fidelity.moveNtc"), p.endTime].filter(Boolean).join(" · ");
  return {
    active: moving,
    touchHandlers,
    previews,
    handlers: {
      start,
      change: update,
      end,
      cancel,
    },
    register,
    unregister,
    wrapRow: (key: string, date: string, content: ReactNode) => (
      <P1MeasuredMoveRegion
        regionKey={key}
        date={date}
        register={register}
        unregister={unregister}
      >
        {content}
      </P1MeasuredMoveRegion>
    ),
    overlay: active
      ? (() => {
          const y = active.targetY,
            top = Math.max(topInset, y - 48),
            bottom = Math.min(height, y + 24);
          const visible = active.targetVisible && y > topInset + 42 && y < height - 95;
          return (
            <View pointerEvents="none" style={StyleSheet.absoluteFill}>
              <View
                style={[
                  styles.shade,
                  {
                    top: topInset,
                    height: visible ? Math.max(0, top - topInset) : height - topInset,
                  },
                ]}
              />
              {visible ? (
                <>
                  <View style={[styles.shade, { top: bottom, bottom: 0 }]} />
                  <View testID="p1-move-insertion" style={[styles.insertion, { top: y }]}>
                    <View style={styles.insertLabel}>
                      <UiText style={styles.date}>
                        {formatUiDate(new Date(`${active.date}T12:00:00Z`), {
                          weekday: "short",
                          month: "short",
                          day: "numeric",
                          timeZone: "UTC",
                        })}
                      </UiText>
                      <UiText style={styles.clock}>
                        {active.ntc ? t("fidelity.moveNtc") : active.proposal.time}
                      </UiText>
                    </View>
                    <View style={styles.insertDot} />
                  </View>
                </>
              ) : null}
              <View
                style={[
                  styles.ghost,
                  {
                    left: Math.max(
                      visual.space.feedGutter,
                      Math.min(
                        width - 240 - visual.space.feedGutter,
                        active.point.x - 120,
                      ),
                    ),
                    top: Math.max(
                      topInset + 8,
                      Math.min(height - 180, active.point.y - 90),
                    ),
                  },
                ]}
              >
                <UiText numberOfLines={2} style={styles.title}>
                  {active.item.title}
                </UiText>
                {!visible ? (
                  <UiText style={styles.meta}>{label(active.proposal)}</UiText>
                ) : null}
                <UiText style={styles.hint}>
                  {t("fidelity.moveStep", { minutes: active.step })}
                </UiText>
              </View>
            </View>
          );
        })()
      : null,
    confirmation: (
      <Modal
        transparent
        visible={!!confirmation}
        animationType="slide"
        presentationStyle="overFullScreen"
        onRequestClose={dismissConfirmation}
      >
        <View style={styles.backdrop}>
          <View style={styles.confirm}>
            <SheetHeader
              category="picker"
              title={t("fidelity.moveTitle")}
              onLeft={dismissConfirmation}
              rightLabel={t("fidelity.moveConfirm")}
              rightDisabled={confirmation?.proposal.status !== "READY"}
              onRight={apply}
            />
            <UiText style={styles.title}>{confirmation?.item.title}</UiText>
            <UiText style={styles.meta}>
              {confirmation
                ? [
                    confirmation.item.date,
                    confirmation.item.time ?? t("fidelity.moveNtc"),
                  ].join(" · ")
                : ""}
            </UiText>
            <UiText style={styles.title}>
              {confirmation ? label(confirmation.proposal) : ""}
            </UiText>
            {confirmation?.proposal.status !== "READY" ? (
              <UiText style={styles.meta}>{t("fidelity.moveUnqualified")}</UiText>
            ) : null}
            <UiButton
              label={t("fidelity.moveDateOnly")}
              variant="secondary"
              onPress={() => {
                const old = confirmationRef.current;
                if (!old || old !== confirmation) return;
                const next = {
                  ...old,
                  ntc: true,
                  proposal: moveProposal(
                    old.item,
                    old.date,
                    old.minutes,
                    true,
                    old.duration,
                    true,
                  ),
                };
                confirmationRef.current = next;
                setConfirmation(next);
              }}
            />
            <UiText style={styles.meta}>{t("fidelity.previewOnly")}</UiText>
          </View>
        </View>
      </Modal>
    ),
  };
}
export function P1MeasuredMoveRegion({
  date,
  regionKey,
  register,
  unregister,
  style,
  children,
}: {
  date: string;
  regionKey: string;
  register(node: View, date: string, key: string): void;
  unregister(node: View): void;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const node = useRef<View | null>(null);
  const ref = useCallback(
    (next: View | null) => {
      if (node.current) unregister(node.current);
      node.current = next;
      if (next) register(next, date, regionKey);
    },
    [date, regionKey, register, unregister],
  );
  return (
    <View ref={ref} style={style} collapsable={false}>
      {children}
    </View>
  );
}
const makeStyles = (c: UiColors) =>
  StyleSheet.create({
    shade: { position: "absolute", left: 0, right: 0, backgroundColor: c.overlay },
    insertion: {
      position: "absolute",
      left: visual.space.feedGutter,
      right: visual.space.feedGutter,
      height: 2,
      backgroundColor: c.accent,
    },
    insertLabel: {
      position: "absolute",
      left: 0,
      bottom: 9,
      flexDirection: "row",
      flexWrap: "wrap",
      maxWidth: "100%",
      alignItems: "baseline",
      gap: 8,
      paddingHorizontal: 10,
      paddingVertical: 5,
      backgroundColor: c.surface,
      borderRadius: visual.radius.control,
    },
    date: { ...visual.type.meta, color: c.accent },
    clock: { ...visual.type.row, color: c.accent, fontVariant: ["tabular-nums"] },
    insertDot: {
      position: "absolute",
      left: 0,
      top: -2,
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: c.accent,
    },
    hint: { ...visual.type.feedTag, color: c.textSecondary, marginTop: 5 },
    ghost: {
      position: "absolute",
      width: 240,
      padding: 12,
      backgroundColor: c.surface,
      borderColor: c.accent,
      borderWidth: 1,
      borderRadius: visual.radius.card,
    },
    title: { ...visual.type.row, color: c.textPrimary },
    meta: { ...visual.type.meta, color: c.textSecondary },
    backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: c.overlay },
    confirm: {
      backgroundColor: c.background,
      borderTopLeftRadius: visual.radius.sheet,
      borderTopRightRadius: visual.radius.sheet,
      paddingBottom: 40,
      paddingHorizontal: visual.space.page,
      gap: visual.space.card,
    },
  });
