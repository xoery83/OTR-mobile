import { DayReadSkeleton } from "./DayReadSkeleton";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { AppState, Pressable, StyleSheet, View } from "react-native";
import { AppIcon } from "@/components/AppIcon";
import { UiButton, UiText as Text } from "@/ui/controls";
import { formatUiNumber } from "@/ui/locale";
import { useThemedStyles, useUiTheme } from "@/ui/theme";
import { useUiLocale } from "@/ui/useUiLocale";
import type { UiColors } from "@/ui/palette";
import { visual } from "@/ui/visual";
import {
  getAccountGeneration,
  subscribeAccountGeneration,
} from "@/data/auth/accountGeneration";
import {
  readTripJourneySnapshot,
  type createTripJourneySnapshotReader,
} from "@/data/repositories/tripJourneySnapshotRepository";

type Reader = ReturnType<typeof createTripJourneySnapshotReader>;
type Read = NonNullable<Awaited<ReturnType<Reader["read"]>>>;
type Item = NonNullable<Awaited<ReturnType<Reader["resolveItem"]>>>;
// Shared Home owns translated messages and navigation through its existing controller.
export type JourneySnapshotCopy = {
  title: string;
  days: string;
  places: string;
  activities: string;
  empty: string;
  loading: string;
  unavailable: string;
  review: string;
};
const icons = {
  P1: "mappin.and.ellipse",
  P2: "airplane",
  P3: "bed.double",
  P4: "car",
  P5: "tram",
  P6: "ticket",
} as const;
export function JourneySnapshotWidget({
  tripId,
  copy,
  onOpenItem,
  onReviewItinerary,
}: {
  tripId: string;
  copy: JourneySnapshotCopy;
  onOpenItem: (item: Item) => Promise<void> | void;
  onReviewItinerary?: (
    context: Pick<Read, "scope" | "epoch" | "candidateDays">,
  ) => Promise<void> | void;
}) {
  useUiLocale();
  const colors = useUiTheme();
  const styles = useThemedStyles(createStyles);
  const generation = useSyncExternalStore(
    subscribeAccountGeneration,
    getAccountGeneration,
  );
  const [read, setRead] = useState<Read | null>(null);
  const [state, setState] = useState<"LOADING" | "READY" | "UNAVAILABLE">("LOADING");
  const request = useRef(0);
  const load = useCallback(async () => {
    const ticket = ++request.current,
      captured = generation;
    await Promise.resolve();
    if (request.current !== ticket || captured !== getAccountGeneration()) return;
    setRead(null);
    setState("LOADING");
    try {
      const reader = await readTripJourneySnapshot();
      const result = await reader.read(tripId);
      if (request.current !== ticket || captured !== getAccountGeneration()) return;
      setRead(result);
      setState(result ? "READY" : "UNAVAILABLE");
    } catch {
      if (request.current === ticket && captured === getAccountGeneration()) {
        setRead(null);
        setState("UNAVAILABLE");
      }
    }
  }, [tripId, generation]);
  const cancelPending = useCallback(() => {
    request.current++;
  }, []);
  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => {
      if (active) void load();
    });
    const subscription = AppState.addEventListener("change", (value) => {
      if (value === "active") void load();
    });
    return () => {
      active = false;
      cancelPending();
      subscription.remove();
    };
  }, [load, cancelPending]);
  const visible =
    read?.scope.generation === generation && read.scope.tripId === tripId ? read : null;
  const open = async (itemId: string) => {
    if (!visible || generation !== getAccountGeneration()) return;
    const ticket = request.current;
    try {
      const reader = await readTripJourneySnapshot();
      const current = await reader.resolveItem(tripId, itemId, visible.epoch);
      if (generation !== getAccountGeneration() || request.current !== ticket) return;
      if (!current) {
        setRead(null);
        setState("UNAVAILABLE");
        return;
      }
      await onOpenItem(current);
    } catch {
      if (generation === getAccountGeneration() && request.current === ticket) {
        setRead(null);
        setState("UNAVAILABLE");
      }
    }
  };
  const review = async () => {
    if (!visible || !onReviewItinerary || generation !== getAccountGeneration()) return;
    const ticket = request.current;
    try {
      const reader = await readTripJourneySnapshot();
      const current = await reader.read(tripId);
      if (generation !== getAccountGeneration() || request.current !== ticket) return;
      if (!current || current.epoch !== visible.epoch) {
        setRead(null);
        setState("UNAVAILABLE");
        return;
      }
      await onReviewItinerary({
        scope: current.scope,
        epoch: current.epoch,
        candidateDays: current.candidateDays,
      });
    } catch {
      if (generation === getAccountGeneration() && request.current === ticket) {
        setRead(null);
        setState("UNAVAILABLE");
      }
    }
  };
  return (
    <View style={styles.widget}>
      <Text accessibilityRole="header" style={styles.heading}>
        {copy.title}
      </Text>
      {visible ? (
        <View style={styles.stats}>
          {(
            [
              [copy.days, visible.snapshot.days],
              [copy.places, visible.snapshot.places],
              [copy.activities, visible.snapshot.activities],
            ] as const
          )
            .filter(([, value]) => value !== null)
            .map(([label, value]) => (
              <View key={label} style={styles.stat}>
                <Text style={styles.metric}>{formatUiNumber(value!)}</Text>
                <Text style={styles.meta}>{label}</Text>
              </View>
            ))}
        </View>
      ) : null}
      <View style={styles.cloud}>
        {visible?.snapshot.tags.map((tag) => (
          <Pressable
            key={tag.itemId}
            accessibilityRole="button"
            accessibilityLabel={tag.title}
            onPress={() => void open(tag.itemId)}
            style={[styles.tag, tag.slot % 3 === 1 && styles.offset]}
          >
            <AppIcon
              name={icons[tag.family as keyof typeof icons]}
              color={colors.textSecondary}
              size={18}
            />
            <Text
              numberOfLines={2}
              ellipsizeMode="tail"
              style={[styles.tagText, tag.slot % 4 === 0 && styles.featured]}
            >
              {tag.title}
            </Text>
          </Pressable>
        ))}
        {!visible?.snapshot.tags.length ? (
          state === "LOADING" && !visible ? (
            <DayReadSkeleton compact />
          ) : (
            <Text style={styles.empty}>
              {state === "UNAVAILABLE" ? copy.unavailable : copy.empty}
            </Text>
          )
        ) : null}
      </View>
      {state === "UNAVAILABLE" && visible?.snapshot.tags.length ? (
        <Text accessibilityRole="alert" style={styles.meta}>
          {copy.unavailable}
        </Text>
      ) : null}
      <UiButton
        label={copy.review}
        variant="text"
        disabled={!visible || !onReviewItinerary || !visible.candidateDays.length}
        onPress={() => void review()}
      />
    </View>
  );
}
const createStyles = (c: UiColors) =>
  StyleSheet.create({
    widget: {
      gap: visual.space.section,
    },
    heading: { ...visual.type.section, color: c.textPrimary },
    stats: {
      flexDirection: "row",
      justifyContent: "space-around",
      flexWrap: "wrap",
      gap: visual.space.card,
    },
    stat: { alignItems: "center", gap: visual.space.heading },
    metric: { ...visual.type.metric, color: c.textPrimary },
    meta: { ...visual.type.meta, color: c.textSecondary },
    cloud: {
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "center",
      alignContent: "center",
      justifyContent: "center",
      gap: visual.space.heading,
    },
    tag: {
      minHeight: 44,
      maxWidth: "48%",
      flexDirection: "row",
      alignItems: "center",
      gap: visual.space.heading,
      paddingHorizontal: visual.space.card,
      paddingVertical: visual.space.heading,
      borderRadius: visual.radius.pill,
      backgroundColor: c.elevatedSurface,
    },
    offset: { marginTop: visual.space.card },
    tagText: { ...visual.type.meta, color: c.textPrimary, flexShrink: 1 },
    featured: { fontWeight: "600" },
    empty: {
      ...visual.type.row,
      color: c.textSecondary,
      textAlign: "center",
      paddingVertical: visual.space.section,
    },
  });
