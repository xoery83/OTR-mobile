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
import { UiText } from "@/ui/controls";
import { SheetHeader } from "@/components/SheetHeader";
import { t, formatUiDate } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { useThemedStyles } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { visual } from "@/ui/visual";
import type { DayListHandle } from "@/features/day-feed/WindowedDayList";
import {
  movePrecision,
  moveFingerLineY,
  moveEdgeVelocity,
  movePlacementAtY,
  moveDayAtY,
  moveDayHeightTime,
  moveCardPosition,
  type PlacementRow,
  type MoveStep,
} from "./p1MoveCursor";
import type { MoveItem, MoveProposal } from "./p1MoveTypes";
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
type Region = {
  date: string;
  key: string;
  minute?: number;
  node: View;
  top: number;
  bottom: number;
};
type Drag = {
  item: MoveItem & { id: string; title: string };
  point: MovePoint;
  start: MovePoint;
  geometryReady: boolean;
  verticalMoved: boolean;
  lastPlacementY: number;
  edgeScrolling: boolean;
  minutes: number;
  step: MoveStep;
  date: string;
  ntc: boolean;
  moved: boolean;
  duration: number | null;
  proposal: MoveProposal;
};
type MoveConfirmation = Pick<
  Drag,
  "item" | "proposal" | "ntc" | "date" | "minutes" | "duration"
>;
export type P1MovePorts = {
  item(id: string): (MoveItem & { id: string; title: string }) | undefined;
  rows(previews: Record<string, FixtureMovePreview>): PlacementRow[];
  propose(
    item: MoveItem,
    date: string,
    minutes: number,
    ntc: boolean,
    duration: number | null,
  ): MoveProposal;
  duration(item: MoveItem): number | null;
  same(item: MoveItem, proposal: MoveProposal): boolean;
  onDismiss?(): void;
  commit?(item: MoveItem & { id: string }, proposal: MoveProposal): Promise<void>;
};
export function useP1Move(
  list: RefObject<DayListHandle | null>,
  resetKey: string,
  topInset: number,
  bottomInset: number,
  ports: P1MovePorts,
  onFinish?: () => void,
) {
  useUiLocale();
  const styles = useThemedStyles(makeStyles),
    { width, height, fontScale = 1 } = useWindowDimensions();
  const portsRef = useRef(ports);
  const commitBusy = useRef(false);
  const [saving, setSaving] = useState(false),
    [saveError, setSaveError] = useState(false);
  useLayoutEffect(() => {
    portsRef.current = ports;
  }, [ports]);
  const finishCallback = useRef(onFinish);
  useLayoutEffect(() => {
    finishCallback.current = onFinish;
  }, [onFinish]);
  const [labelHeight, setLabelHeight] = useState(32);
  const [cardHeight, setCardHeight] = useState(84);
  const labelBand = Math.max(
    64,
    Math.ceil(42 * Math.max(1, fontScale) + 22),
    labelHeight + 32,
  );
  const regions = useRef(new Map<View, Region>()),
    placementRows = useRef<PlacementRow[]>([]),
    drag = useRef<Drag | null>(null),
    drawn = useRef(""),
    confirmationRef = useRef<MoveConfirmation | null>(null),
    durations = useRef(new Map<string, number | null>());
  const [active, setActive] = useState<Drag | null>(null),
    [confirmation, setConfirmation] = useState<MoveConfirmation | null>(null),
    [previews, setPreviews] = useState<Record<string, FixtureMovePreview>>({});
  const register = useCallback(
    (node: View, date: string, key: string, minute?: number) => {
      regions.current.set(node, { node, date, key, minute, top: 0, bottom: 0 });
    },
    [],
  );
  useEffect(() => {
    placementRows.current = ports.rows(previews);
  }, [ports, previews]);
  const unregister = useCallback((node: View) => {
    regions.current.delete(node);
  }, []);
  const measure = useCallback(() => {
    const session = drag.current;
    const ownRow =
      session &&
      placementRows.current.find(
        (row) => row.itemId === session.item.id && row.date === session.item.date,
      );
    for (const region of regions.current.values())
      region.node.measureInWindow((_x, y, _w, h) => {
        if (regions.current.get(region.node) === region) {
          region.top = y;
          region.bottom = y + h;
          if (
            session &&
            drag.current === session &&
            !session.geometryReady &&
            region.key === ownRow?.key &&
            h > 0
          )
            session.geometryReady = true;
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
      d.step = step;
      d.verticalMoved ||= Math.abs(point.y - d.start.y) > 6;
      if (
        (Math.abs(point.y - d.lastPlacementY) > 0.5 || d.edgeScrolling) &&
        d.verticalMoved &&
        d.geometryReady
      ) {
        d.lastPlacementY = point.y;
        const lineY = moveFingerLineY(point.y, topInset, height, labelBand, bottomInset);
        const boxes = [...regions.current.values()].filter(
          (r) => r.minute === undefined && r.bottom > r.top,
        );
        const date = moveDayAtY(boxes, lineY);
        if (date) {
          const clocks = [...regions.current.values()].filter(
            (r) => r.date === date && r.minute !== undefined && r.bottom > r.top,
          );
          const anchors = clocks.map((r) => ({
            y: (r.top + r.bottom) / 2,
            minute: r.minute!,
          }));
          if (anchors.length) {
            const header = boxes.find((r) => r.key === `day:${date}`);
            if (header && header.bottom < Math.min(...anchors.map((a) => a.y)))
              anchors.push({ y: header.bottom, minute: 0 });
            const nextHeader = boxes
              .filter((r) => r.key.startsWith("day:") && r.date > date)
              .sort((a, b) => a.top - b.top)[0];
            if (nextHeader && nextHeader.top > Math.max(...anchors.map((a) => a.y)))
              anchors.push({ y: nextHeader.top, minute: 1439 });
          }
          let placed;
          if (clocks.length)
            placed = movePlacementAtY(date, anchors, lineY, d.step, d.minutes);
          else {
            const dayBoxes = boxes.filter((box) => box.date === date);
            const start =
              boxes.find((box) => box.key === `day:${date}`)?.top ??
              Math.min(...dayBoxes.map((box) => box.top));
            const next = boxes
              .filter((box) => box.key.startsWith("day:") && box.date > date)
              .sort((a, b) => a.top - b.top)[0];
            const end = next?.top ?? Math.max(...dayBoxes.map((box) => box.bottom));
            placed = moveDayHeightTime(date, start, end, lineY, d.step);
          }
          d.date = placed.date;
          d.minutes = placed.minute;
          d.ntc = false;
        }
      }
      d.proposal = portsRef.current.propose(d.item, d.date, d.minutes, d.ntc, d.duration);
      const signature = JSON.stringify([
        point.x,
        point.y,
        d.date,
        d.minutes,
        d.step,
        d.ntc,
        d.proposal.status,
      ]);
      if (signature !== drawn.current) {
        drawn.current = signature;
        setActive({ ...d });
      }
    },
    [width, topInset, height, labelBand, bottomInset],
  );
  const start = useCallback(
    (id: string, point: MovePoint) => {
      if (commitBusy.current) return;
      const source = portsRef.current.item(id);
      if (!source) {
        if (typeof __DEV__ !== "undefined" && __DEV__)
          console.info(JSON.stringify({ event: "p1_move_source_unavailable" }));
        return;
      }
      const item = { ...source, ...previews[id] } as Drag["item"];
      const minutes = item.time
        ? Number(item.time.slice(0, 2)) * 60 + Number(item.time.slice(3))
        : 720;
      const duration = durations.current.has(id)
        ? durations.current.get(id)!
        : portsRef.current.duration(item);
      const d: Drag = {
        item,
        point,
        start: point,
        geometryReady: false,
        lastPlacementY: point.y,
        verticalMoved: false,
        edgeScrolling: false,
        minutes,
        step: movePrecision(point.x, width),
        date: item.date,
        ntc: !item.time,
        moved: false,
        duration,
        proposal: portsRef.current.propose(
          item,
          item.date,
          minutes,
          !item.time,
          duration,
        ),
      };
      confirmationRef.current = null;
      setConfirmation(null);
      drag.current = d;
      drawn.current = "";
      measure();
      setActive({ ...d });
      console.info(JSON.stringify({ event: "p1_move_arm", itemId: id }));
    },
    [previews, width, measure],
  );
  const end = useCallback(() => {
    finishCallback.current?.();
    const d = drag.current;
    if (!d) {
      setActive(null);
      return;
    }
    drag.current = null;
    setActive(null);
    console.info(
      JSON.stringify({
        event: "p1_move_end",
        changed: d.moved,
        status: d.proposal.status,
      }),
    );
    if (d.moved && !portsRef.current.same(d.item, d.proposal)) {
      const pending = { ...d };
      confirmationRef.current = pending;
      setConfirmation(pending);
    }
  }, []);
  const cancel = useCallback(() => {
    finishCallback.current?.();
    const wasDragging = drag.current !== null;
    drag.current = null;
    setActive(null);
    if (!wasDragging) return;
    console.info(JSON.stringify({ event: "p1_move_cancel" }));
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
    const timer = setInterval(() => {
      const d = drag.current;
      if (!d) return;
      measure();
      update(d.point);
    }, 60);
    return () => clearInterval(timer);
  }, [moving, measure, update]);
  useEffect(() => {
    if (!moving) return;
    let frame: number | null = null,
      last = 0,
      velocity = 0;
    const follow = (now: number) => {
      const d = drag.current;
      if (!d) return;
      const seconds = last ? Math.min(0.032, (now - last) / 1000) : 0;
      last = now;
      const targetVelocity =
        d.verticalMoved && d.geometryReady
          ? moveEdgeVelocity(d.point.y, topInset + 8, height - bottomInset - 8, height)
          : 0;
      d.edgeScrolling = targetVelocity !== 0;
      if (!targetVelocity) velocity = 0;
      else velocity += (targetVelocity - velocity) * (1 - Math.exp(-12 * seconds));
      if (seconds && Math.abs(velocity) > 1) list.current?.scrollBy?.(velocity * seconds);
      frame = requestAnimationFrame(follow);
    };
    frame = requestAnimationFrame(follow);
    return () => {
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [moving, list, topInset, height, bottomInset]);
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
    if (commitBusy.current || confirmationRef.current !== confirmation) return;
    confirmationRef.current = null;
    setConfirmation(null);
    portsRef.current.onDismiss?.();
  };
  const apply = async () => {
    const d = confirmationRef.current,
      p = d?.proposal;
    if (
      commitBusy.current ||
      !d ||
      d !== confirmation ||
      p?.status !== "READY" ||
      !p.date
    )
      return;
    if (portsRef.current.commit) {
      commitBusy.current = true;
      setSaving(true);
      setSaveError(false);
      try {
        await portsRef.current.commit(d.item, p);
        if (confirmationRef.current === d) {
          confirmationRef.current = null;
          setConfirmation(null);
        }
      } catch {
        if (confirmationRef.current === d) setSaveError(true);
      } finally {
        commitBusy.current = false;
        setSaving(false);
      }
      return;
    }
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
    // Explicit DEV layout preview, separate from real touch validation.
    showConfirmationPreview(id: string) {
      const source = portsRef.current.item(id);
      if (!source) return;
      cancel();
      const item = { ...source, ...previews[id] } as Drag["item"];
      const duration = portsRef.current.duration(item);
      const minutes = item.time
        ? Number(item.time.slice(0, 2)) * 60 + Number(item.time.slice(3)) + 30
        : 720;
      const proposal = portsRef.current.propose(
        item,
        item.date,
        minutes,
        false,
        duration,
      );
      const pending = { item, date: item.date, minutes, ntc: false, duration, proposal };
      confirmationRef.current = pending;
      setConfirmation(pending);
    },
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
    wrapClock: (key: string, date: string, minute: number, content: ReactNode) => (
      <P1MeasuredMoveRegion
        regionKey={key}
        date={date}
        minute={minute}
        register={register}
        unregister={unregister}
      >
        {content}
      </P1MeasuredMoveRegion>
    ),
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
          const y = moveFingerLineY(
              active.point.y,
              topInset,
              height,
              labelBand,
              bottomInset,
            ),
            top = Math.max(topInset, y - labelBand + 16),
            bottom = Math.min(height, y + 24);
          const visible = true;
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
                    <View
                      style={styles.insertLabel}
                      onLayout={({ nativeEvent }) =>
                        setLabelHeight(Math.ceil(nativeEvent.layout.height))
                      }
                    >
                      <UiText style={styles.date}>
                        {formatUiDate(new Date(`${active.date}T12:00:00Z`), {
                          weekday: "short",
                          month: "short",
                          day: "numeric",
                          timeZone: "UTC",
                        })}
                        {"  "}
                        <UiText style={styles.clock}>
                          {active.ntc ? t("fidelity.moveNtc") : active.proposal.time}
                        </UiText>
                      </UiText>
                    </View>
                    <View style={styles.insertDot} />
                  </View>
                </>
              ) : null}
              <View
                onLayout={({ nativeEvent }) =>
                  setCardHeight(Math.ceil(nativeEvent.layout.height))
                }
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
                    top: moveCardPosition(
                      y,
                      topInset,
                      height,
                      labelHeight,
                      cardHeight,
                      bottomInset,
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
              rightDisabled={saving || confirmation?.proposal.status !== "READY"}
              onRight={() => void apply()}
            />
            <UiText style={styles.title}>{confirmation?.item.title}</UiText>
            <View style={styles.placements}>
              {[
                { label: t("fidelity.moveFrom"), value: confirmation?.item },
                { label: t("fidelity.moveTo"), value: confirmation?.proposal },
              ].map(({ label, value }) => (
                <View key={label} style={styles.placement}>
                  <UiText style={styles.meta}>{label}</UiText>
                  <UiText style={styles.title}>
                    {value?.date
                      ? formatUiDate(new Date(`${value.date}T12:00:00Z`), {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                          timeZone: "UTC",
                        })
                      : ""}
                  </UiText>
                  <UiText style={styles.meta}>
                    {t("fidelity.moveStartTime", {
                      time: value?.time ?? t("fidelity.moveNoTime"),
                    })}
                  </UiText>
                  <UiText style={styles.meta}>
                    {t("fidelity.moveEndTime", {
                      time: value?.endTime
                        ? `${value.endDate && value.endDate !== value.date ? formatUiDate(new Date(`${value.endDate}T12:00:00Z`), { month: "short", day: "numeric", timeZone: "UTC" }) + " · " : ""}${value.endTime}`
                        : t("fidelity.moveNoTime"),
                    })}
                  </UiText>
                </View>
              ))}
            </View>
            {confirmation?.proposal.status !== "READY" ? (
              <UiText style={styles.meta}>
                {t(
                  confirmation?.item.zone
                    ? "fidelity.moveUnqualified"
                    : "fidelity.moveMissingZone",
                )}
              </UiText>
            ) : null}
            {saveError ? (
              <UiText accessibilityRole="alert" style={styles.meta}>
                {t("tripCreate.saveFailed")}
              </UiText>
            ) : null}
            <UiText style={styles.meta}>
              {t(
                ports.commit ? "fidelity.moveLocalNotice" : "fidelity.movePreviewNotice",
              )}
            </UiText>
          </View>
        </View>
      </Modal>
    ),
  };
}
export function P1MeasuredMoveRegion({
  date,
  regionKey,
  minute,
  register,
  unregister,
  style,
  children,
}: {
  date: string;
  regionKey: string;
  minute?: number;
  register(node: View, date: string, key: string, minute?: number): void;
  unregister(node: View): void;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const node = useRef<View | null>(null);
  const ref = useCallback(
    (next: View | null) => {
      if (node.current) unregister(node.current);
      node.current = next;
      if (next) register(next, date, regionKey, minute);
    },
    [date, regionKey, minute, register, unregister],
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
      zIndex: 2,
      backgroundColor: c.accent,
    },
    insertLabel: {
      position: "absolute",
      left: 0,
      bottom: 9,
      minWidth: 180,
      maxWidth: "100%",
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
    placements: { flexDirection: "row", gap: visual.space.card },
    placement: {
      flex: 1,
      minWidth: 0,
      backgroundColor: c.surface,
      borderRadius: visual.radius.control,
      padding: visual.space.card,
      gap: 6,
    },
    confirm: {
      backgroundColor: c.background,
      borderTopLeftRadius: visual.radius.sheet,
      borderTopRightRadius: visual.radius.sheet,
      paddingBottom: 40,
      paddingHorizontal: visual.space.page,
      gap: visual.space.card,
    },
  });
