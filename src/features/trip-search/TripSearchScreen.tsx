import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { AppState, FlatList, StyleSheet, View } from "react-native";
import { router, Stack, useLocalSearchParams } from "expo-router";
import {
  getAccountGeneration,
  subscribeAccountGeneration,
} from "@/data/auth/accountGeneration";
import { assertAccountRequestGeneration } from "@/data/auth/accountRequestContext";
import {
  readTripSearchRepository,
  type SearchPage,
  type createTripSearchRepository,
} from "@/data/repositories/tripSearchRepository";
import {
  searchGroups,
  searchPreset,
  searchDate,
  type SearchCategory,
  type SearchInput,
  type SearchResult,
} from "@/domain/trip/tripSearch";
import { createLatestRequest } from "@/features/ledger/latestRequest";
import { DayFeed } from "@/features/day-feed/DayFeed";
import { createCoreExperienceRenderer } from "@/features/day-feed/coreExperienceRenderer";
import { useTripView } from "@/features/day-feed/TripViewContext";
import { UiButton, UiText as Text } from "@/ui/controls";
import { UiChoiceChip, UiTextInput } from "@/ui/forms";
import { formatUiDate, formatUiNumber, t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { useThemedStyles } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { visual } from "@/ui/visual";

type Reader = ReturnType<typeof createTripSearchRepository>;
type Detail = Extract<
  NonNullable<Awaited<ReturnType<Reader["resolve"]>>>,
  { kind: "ITEM" }
>;
const categoryKey = {
  ALL: "comprehensiveSearch.categoryAll",
  TRIPS: "comprehensiveSearch.categoryTrips",
  ITINERARY: "comprehensiveSearch.categoryItinerary",
} as const;
const displayDate = (date: string) =>
  searchDate(date)
    ? formatUiDate(new Date(`${date}T12:00:00Z`), {
        year: "numeric",
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      })
    : null;
const parameter = (value: string | string[] | undefined) =>
  typeof value === "string" ? value : undefined;
export function TripSearchScreen() {
  const generation = useSyncExternalStore(
    subscribeAccountGeneration,
    getAccountGeneration,
  );
  const params = useLocalSearchParams<{ entry?: string; tripId?: string }>();
  return (
    <SearchContent
      key={JSON.stringify([generation, params.entry, params.tripId])}
      entry={parameter(params.entry)}
      currentTripId={parameter(params.tripId) ?? null}
    />
  );
}
function SearchContent({
  entry,
  currentTripId,
}: {
  entry?: string;
  currentTripId: string | null;
}) {
  useUiLocale();
  const styles = useThemedStyles(createStyles);
  const [input, setInput] = useState<SearchInput>(() =>
    searchPreset(entry, currentTripId),
  );
  const [page, setPage] = useState<SearchPage | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [busy, setBusy] = useState(false),
    [unavailable, setUnavailable] = useState(false);
  const reader = useRef<Reader | null>(null),
    pageRef = useRef(page),
    detailRef = useRef(detail);
  const [request] = useState(createLatestRequest),
    [opener] = useState(createLatestRequest);
  useLayoutEffect(() => {
    pageRef.current = page;
    detailRef.current = detail;
  }, [page, detail]);
  const { resumeView } = useTripView();
  const load = useCallback(
    async (more = false) => {
      const id = request.begin(),
        previous = more ? pageRef.current : null;
      setBusy(true);
      opener.cancel();
      setUnavailable(false);
      if (!more) {
        setPage(null);
        setDetail(null);
      }
      try {
        const repository = reader.current ?? (await readTripSearchRepository());
        reader.current = repository;
        if (previous && !(await repository.validate(previous.proofs, previous)))
          throw new Error("SEARCH_STALE");
        const next = await repository.page(input, previous?.cursor ?? null);
        if (!request.isCurrent(id)) return;
        const proofs = [
          ...new Map(
            [...(previous?.proofs ?? []), ...next.proofs].map((p) => [p.tripId, p]),
          ).values(),
        ];
        if (!(await repository.validate(proofs, next)) || !request.isCurrent(id))
          throw new Error("SEARCH_STALE");
        setPage({
          ...next,
          proofs,
          results: [
            ...new Map(
              [...(previous?.results ?? []), ...next.results].map((r) => [
                `${r.category}/${r.tripId}/${r.id}`,
                r,
              ]),
            ).values(),
          ],
        });
      } catch {
        if (request.isCurrent(id)) {
          setPage(null);
          setDetail(null);
          setUnavailable(true);
        }
      } finally {
        if (request.isCurrent(id)) setBusy(false);
      }
    },
    [input, request, opener],
  );
  useEffect(() => {
    request.cancel();
    const timer = setTimeout(() => {
      void load();
    }, 200);
    return () => {
      clearTimeout(timer);
      request.cancel();
      opener.cancel();
    };
  }, [load, request, opener]);
  useEffect(() => {
    let active = true;
    let checking = false;
    const check = async () => {
      if (!active || checking) return;
      checking = true;
      const current = pageRef.current,
        opened = detailRef.current;
      try {
        if (
          current &&
          reader.current &&
          !(await reader.current.validate(current.proofs, current))
        ) {
          if (!active || current !== pageRef.current) return;
          request.cancel();
          setPage(null);
          setDetail(null);
          void load();
        } else if (
          opened &&
          reader.current &&
          !(await reader.current.validate([opened.proof])) &&
          active
        )
          setDetail(null);
      } catch {
        if (active) {
          request.cancel();
          setPage(null);
          setDetail(null);
          setUnavailable(true);
        }
      } finally {
        checking = false;
      }
    };
    const interval = setInterval(() => {
      void check();
    }, 2000);
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void check();
    });
    return () => {
      active = false;
      clearInterval(interval);
      subscription.remove();
    };
  }, [load, request, opener]);
  const open = async (result: SearchResult) => {
    const current = pageRef.current,
      proof = current?.proofs.find((p) => p.tripId === result.tripId),
      id = opener.begin();
    if (
      !proof ||
      !reader.current ||
      current?.key !== JSON.stringify([input.query, input.tripId, input.category])
    )
      return;
    try {
      const resolved = await reader.current.resolve(
        result,
        proof,
        resumeView ?? undefined,
      );
      if (!opener.isCurrent(id) || current !== pageRef.current) return;
      assertAccountRequestGeneration(proof.scope);
      if (!resolved) {
        setUnavailable(true);
        return;
      }
      if (resolved.kind === "TRIP")
        router.push({
          pathname: "/trip",
          params: { tripId: resolved.tripId, view: "home" },
        });
      else setDetail(resolved);
    } catch {
      if (opener.isCurrent(id)) {
        setDetail(null);
        setPage(null);
        setUnavailable(true);
      }
    }
  };
  const visiblePage =
    page?.key === JSON.stringify([input.query, input.tripId, input.category])
      ? page
      : null;
  const groups = searchGroups(visiblePage?.results ?? [], input.category);
  const rows = groups.flatMap((group) => group.rows);
  const count = (category: Exclude<SearchCategory, "ALL">) =>
    (visiblePage?.results ?? []).filter((r) => r.category === category).length;
  const categories: SearchCategory[] = input.tripId
    ? ["ALL", ...(input.category === "TRIPS" ? ["TRIPS" as const] : []), "ITINERARY"]
    : ["ALL", "TRIPS", "ITINERARY"];
  return (
    <View style={styles.root}>
      <Stack.Screen
        options={{ title: t("comprehensiveSearch.title"), headerShown: true }}
      />
      <View style={styles.controls}>
        <UiTextInput
          accessibilityLabel={t("comprehensiveSearch.query")}
          placeholder={t("comprehensiveSearch.query")}
          value={input.query}
          onChangeText={(query) => setInput((v) => ({ ...v, query }))}
          autoCorrect={false}
        />
        <View style={styles.wrap}>
          {currentTripId ? (
            <UiChoiceChip
              compact
              label={t("comprehensiveSearch.scopeCurrent")}
              selected={input.tripId !== null}
              onPress={() => setInput((v) => ({ ...v, tripId: currentTripId }))}
            />
          ) : null}
          <UiChoiceChip
            compact
            label={t("comprehensiveSearch.scopeAll")}
            selected={input.tripId === null}
            onPress={() => setInput((v) => ({ ...v, tripId: null }))}
          />
        </View>
        <View style={styles.wrap}>
          {categories.map((category) => (
            <UiChoiceChip
              compact
              key={category}
              label={
                category === "ALL" ||
                (input.category !== "ALL" && input.category !== category)
                  ? t(categoryKey[category])
                  : t("comprehensiveSearch.categoryCount", {
                      category: t(categoryKey[category]),
                      count: `${formatUiNumber(count(category))}${visiblePage?.cursor ? "+" : ""}`,
                    })
              }
              selected={input.category === category}
              onPress={() => setInput((v) => ({ ...v, category }))}
            />
          ))}
        </View>
        <Text style={styles.note}>{t("comprehensiveSearch.coverage")}</Text>
        {visiblePage?.cursor ? (
          <Text style={styles.note}>{t("comprehensiveSearch.partialCoverage")}</Text>
        ) : null}
        <UiButton
          label={t("comprehensiveSearch.refresh")}
          variant="text"
          disabled={busy}
          onPress={() => {
            void load();
          }}
        />
        {unavailable ? (
          <Text accessibilityLiveRegion="polite" style={styles.note}>
            {t("comprehensiveSearch.unavailable")}
          </Text>
        ) : null}
      </View>
      <FlatList
        data={rows}
        keyExtractor={(r) => `${r.category}/${r.tripId}/${r.id}`}
        initialNumToRender={12}
        maxToRenderPerBatch={12}
        windowSize={5}
        contentContainerStyle={styles.results}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Text style={styles.meta}>{t(categoryKey[item.category])}</Text>
            <UiButton
              label={item.title}
              variant="text"
              onPress={() => {
                void open(item);
              }}
            />
            <Text style={styles.meta}>{item.tripName}</Text>
            {item.date ? <Text style={styles.meta}>{displayDate(item.date)}</Text> : null}
          </View>
        )}
        ListEmptyComponent={
          <Text style={styles.note}>
            {t(
              !input.query.trim()
                ? "comprehensiveSearch.emptyQuery"
                : busy
                  ? "common.loading"
                  : "comprehensiveSearch.noMatches",
            )}
          </Text>
        }
        ListHeaderComponent={
          input.category === "ALL" ? (
            <View style={styles.wrap}>
              {groups.map((g) => (
                <UiButton
                  key={g.category}
                  label={t("comprehensiveSearch.seeAllCategory", {
                    category: t(categoryKey[g.category]),
                  })}
                  variant="text"
                  onPress={() => setInput((v) => ({ ...v, category: g.category }))}
                />
              ))}
            </View>
          ) : null
        }
        ListFooterComponent={
          visiblePage?.cursor ? (
            <UiButton
              label={t("comprehensiveSearch.loadMore")}
              disabled={busy}
              onPress={() => {
                void load(true);
              }}
            />
          ) : null
        }
      />
      {detail && visiblePage ? (
        <DayFeed
          projection={detail.projection}
          date={detail.date}
          zone={detail.zone}
          services={detail.services}
          renderer={createCoreExperienceRenderer(detail.projection)}
          directItem={{
            itemId: detail.itemId,
            onClose: () => {
              opener.cancel();
              setDetail(null);
            },
          }}
        />
      ) : null}
    </View>
  );
}
const createStyles = (colors: UiColors) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.background },
    controls: { padding: visual.space.card, gap: visual.space.heading },
    wrap: { flexDirection: "row", flexWrap: "wrap", gap: visual.space.heading },
    results: { padding: visual.space.card, gap: visual.space.card, flexGrow: 1 },
    row: {
      backgroundColor: colors.surface,
      borderRadius: visual.radius.card,
      padding: visual.space.card,
      gap: visual.space.heading,
    },
    meta: { color: colors.textSecondary, ...visual.type.meta },
    note: { color: colors.textSecondary, ...visual.type.meta },
  });
