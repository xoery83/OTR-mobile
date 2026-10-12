import { useRef, useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { DayProjection } from "@/domain/trip/dayReadModel";
import type { CoreFlightDayProjection } from "@/domain/trip/tripCoreV2DayFeed";
import { itemsForLocalDate } from "@/domain/trip/dayReadModel";
import type {
  DayFeedQuery,
  DayRowRenderer,
  DayRowRendererProps,
} from "./rendererContribution";
import { composeDayStream, type DayStreamPorts } from "./composition";
import type { FlightService } from "@/domain/trip/flightAdmission";
import { UiButton } from "@/ui/controls";
import { t } from "@/ui/locale";
import { useThemedStyles } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { visual } from "@/ui/visual";
import { P1Row } from "./P1Row";
import { FlightRows } from "./FlightRows";
import { NowMarker } from "./NowMarker";
import { useMinuteClock } from "./useMinuteClock";
import { flightPresentation, type Depth } from "./presentation";

function ContributedRow({
  renderer,
  fallback,
  ...props
}: DayRowRendererProps & { renderer: DayRowRenderer; fallback: React.ReactNode }) {
  return renderer(props) ?? fallback;
}

export function DayFeed({
  projection,
  date,
  zone,
  services,
  instant,
  emptyMessage,
  query: contributedQuery,
  renderer,
  ports,
}: {
  projection: DayProjection | CoreFlightDayProjection;
  date: string;
  zone: string;
  services: Record<string, FlightService[]>;
  instant?: string;
  emptyMessage?: string;
  query?: (date: string, zone: string) => DayFeedQuery;
  renderer?: DayRowRenderer;
  ports?: Omit<DayStreamPorts, "focus" | "immersive">;
}) {
  const styles = useThemedStyles(createStyles);
  const query = contributedQuery
    ? contributedQuery(date, zone)
    : projection.version === 2
      ? projection.query(date, zone)
      : itemsForLocalDate(projection, date, zone);
  const clock = useMinuteClock(zone);
  const [focus, setFocus] = useState<string | null>(null);
  const [immersive, setImmersive] = useState<string | null>(null);
  const stream = composeDayStream(query, instant ?? clock.instant, {
    ...ports,
    focus,
    immersive,
  });
  const { rows, now } = stream;
  const scroll = useRef<ScrollView>(null),
    offset = useRef(0),
    returnOffset = useRef(0);
  const depth = (id: string): Depth =>
    stream.immersive === id ? "I" : stream.focus === id ? "F" : "B";
  const change = (id: string, next: Depth) => {
    if (next === "I") {
      returnOffset.current = offset.current;
      setImmersive(id);
    } else {
      setImmersive(null);
      setFocus(next === "F" ? id : null);
    }
  };
  const close = () => {
    setImmersive(null);
    // Android does not deliver Modal.onDismiss.
    if (Platform.OS !== "ios")
      requestAnimationFrame(() =>
        scroll.current?.scrollTo({ y: returnOffset.current, animated: false }),
      );
  };
  const render = (
    event: DayProjection["events"][number],
    mode: Depth,
    withinMarker?: React.ReactNode,
  ) => {
    const row = rows.find((entry) => entry.item.event.id === event.id)!;
    const flight = flightPresentation(
      event,
      services[event.id] ?? [],
      projection.version === 2 ? projection.flightFacts[event.id] : undefined,
    );
    const fallback = !flight ? (
      <P1Row
        event={event}
        depth={mode}
        onDepth={(next) => (mode === "I" ? close() : change(event.id, next))}
        withinMarker={withinMarker}
      />
    ) : (
      <View style={styles.flight}>
        {mode === "F" ? <View pointerEvents="none" style={styles.outline} /> : null}
        <Pressable
          disabled={mode === "I"}
          accessibilityRole={mode === "I" ? "text" : "button"}
          accessibilityLabel={event.title}
          accessibilityHint={
            mode === "I"
              ? undefined
              : t(mode === "F" ? "p1r.immersiveHint" : "p1r.focusHint")
          }
          onPress={() => change(event.id, mode === "F" ? "I" : "F")}
        >
          <FlightRows
            fixture={flight}
            focused={mode === "F"}
            immersive={mode === "I"}
            withinMarker={withinMarker}
          />
        </Pressable>
        {mode === "F" ? (
          <UiButton
            label={t("feed.collapse")}
            variant="text"
            onPress={() => change(event.id, "B")}
          />
        ) : null}
        {mode === "I" ? (
          <UiButton label={t("common.close")} variant="text" onPress={close} />
        ) : null}
      </View>
    );
    return renderer ? (
      <ContributedRow
        renderer={renderer}
        fallback={fallback}
        row={row}
        container={stream.containers.find((entry) => entry.id === row.containerId)}
        depth={mode}
        onDepth={(next) => (mode === "I" ? close() : change(event.id, next))}
        withinMarker={withinMarker}
      />
    ) : (
      fallback
    );
  };
  const selected = rows.find((r) => r.item.event.id === stream.immersive)?.item.event;
  return (
    <>
      <ScrollView
        ref={scroll}
        style={styles.root}
        contentContainerStyle={styles.content}
        scrollEventThrottle={16}
        onScroll={(e) => {
          offset.current = e.nativeEvent.contentOffset.y;
        }}
      >
        {!rows.length ? (
          <Text style={styles.meta}>{emptyMessage ?? t("dayFeed.dayEmpty")}</Text>
        ) : null}
        {rows.map((row) => (
          <View key={row.key}>
            {row.nowBefore ? <NowMarker placement={now} /> : null}
            {render(
              row.item.event,
              depth(row.item.event.id) === "I" ? "F" : depth(row.item.event.id),
              row.nowWithin ? <NowMarker placement={now} within /> : undefined,
            )}
          </View>
        ))}
        {stream.nowAfter ? <NowMarker placement={now} /> : null}
        {query.unresolved.length ? (
          <Text style={styles.meta}>
            {t("dayFeed.unresolvedCount", { count: query.unresolved.length })}
          </Text>
        ) : null}
      </ScrollView>
      <Modal
        visible={!!selected}
        onRequestClose={close}
        onDismiss={() =>
          scroll.current?.scrollTo({ y: returnOffset.current, animated: false })
        }
        animationType="slide"
      >
        <ScrollView
          style={styles.root}
          contentContainerStyle={styles.content}
          contentInsetAdjustmentBehavior="automatic"
        >
          {selected ? render(selected, "I") : null}
        </ScrollView>
      </Modal>
    </>
  );
}
const createStyles = (c: UiColors) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.background },
    content: {
      paddingHorizontal: visual.space.page,
      paddingBottom: visual.space.section,
    },
    meta: {
      ...visual.type.meta,
      color: c.textSecondary,
      paddingVertical: visual.space.row,
    },
    flight: { paddingVertical: visual.space.heading, gap: 4 },
    outline: {
      position: "absolute",
      left: -6,
      right: -6,
      top: 3,
      bottom: 3,
      borderWidth: 1,
      borderColor: c.separator,
      borderRadius: visual.radius.control,
    },
  });
