import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  AppState,
  FlatList,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type TextInput,
} from "react-native";
import { useNetworkState } from "expo-network";
import { AppIcon } from "@/components/AppIcon";
import {
  searchRecentRepository,
  type RecentSearch,
} from "@/data/repositories/searchRecentRepository";
import { searchRows, filterSearchRows } from "./searchPresentation";
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
import { UiChoiceChip, UiFormRow, UiTextInput } from "@/ui/forms";
import { formatUiDate, formatUiNumber, t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { useThemedStyles, useUiTheme } from "@/ui/theme";
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
  const [input, setInput] = useState<SearchInput>(() => ({
    ...searchPreset(entry, currentTripId),
    category: "ALL",
  }));
  const colors = useUiTheme();
  const network = useNetworkState();
  const offline = network.isConnected === false || network.isInternetReachable === false;
  const [recents, setRecents] = useState<RecentSearch[]>([]);
  const [recentError, setRecentError] = useState(false);
  const list = useRef<FlatList<SearchResult>>(null);
  const offset = useRef(0);
  const searchInput = useRef<TextInput>(null);
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
  const [historyRequest] = useState(createLatestRequest);
  useEffect(() => {
    const id = historyRequest.begin();
    void searchRecentRepository
      .list()
      .then((rows) => {
        if (historyRequest.isCurrent(id)) setRecents(rows);
      })
      .catch(() => {
        if (historyRequest.isCurrent(id)) setRecentError(true);
      });
    return () => historyRequest.cancel();
  }, [historyRequest]);
  const { resumeView } = useTripView();
  const load = useCallback(
    async (more = false) => {
      if (!input.query.trim()) {
        setPage(null);
        setBusy(false);
        return;
      }
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
        const queryInput = {
          query: input.query,
          tripId: input.tripId,
          category: "ALL" as const,
        };
        let next = await repository.page(queryInput, previous?.cursor ?? null);
        // Consume bounded provider pages together so every category counts the same revision.
        const batch = [...next.results],
          batchProofs = [...next.proofs];
        const cursors = new Set<string>();
        const inventory = next.inventory;
        for (let n = 1; next.cursor && n < 40; n++) {
          if (!request.isCurrent(id)) return;
          const cursorKey = JSON.stringify(next.cursor);
          if (cursors.has(cursorKey)) throw new Error("SEARCH_CURSOR_REPEAT");
          cursors.add(cursorKey);
          next = await repository.page(queryInput, next.cursor);
          if (
            next.inventory !== inventory ||
            next.proofs.some((proof) =>
              batchProofs.some(
                (prior) =>
                  prior.tripId === proof.tripId &&
                  prior.fingerprint !== proof.fingerprint,
              ),
            )
          )
            throw new Error("SEARCH_STALE");
          batch.push(...next.results);
          batchProofs.push(...next.proofs);
        }
        next = { ...next, results: batch, proofs: batchProofs };
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
    [input.query, input.tripId, request, opener, setDetail],
  );
  useEffect(() => {
    request.cancel();
    const timer = setTimeout(() => {
      void load();
    }, 250);
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
          active &&
          opened === detailRef.current
        )
          setDetail(null);
      } catch {
        if (active && current === pageRef.current && opened === detailRef.current) {
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
      current?.key !== JSON.stringify([input.query, input.tripId, "ALL"])
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
      Keyboard.dismiss();
      void remember();
      if (resolved.kind === "TRIP")
        router.push({
          pathname: "/search-trip",
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
    page?.key === JSON.stringify([input.query, input.tripId, "ALL"]) ? page : null;
  const allRows = searchRows(visiblePage?.results ?? []);
  const rows = filterSearchRows(allRows, input.category);
  const categories: SearchCategory[] = input.tripId
    ? ["ALL", "ITINERARY"]
    : ["ALL", "TRIPS", "ITINERARY"];
  const count = (category: SearchCategory) => filterSearchRows(allRows, category).length;
  const updateRecents = async (operation: () => Promise<RecentSearch[]>) => {
    const id = historyRequest.begin();
    try {
      const next = await operation();
      if (historyRequest.isCurrent(id)) {
        setRecents(next);
        setRecentError(false);
      }
    } catch {
      if (historyRequest.isCurrent(id)) setRecentError(true);
    }
  };
  const remember = () =>
    updateRecents(() =>
      searchRecentRepository.record({ query: input.query, tripId: input.tripId }),
    );
  const editQuery = (query: string) => {
    request.cancel();
    opener.cancel();
    setDetail(null);
    setUnavailable(false);
    offset.current = 0;
    list.current?.scrollToOffset({ offset: 0, animated: false });
    setInput((value) => ({ ...value, query }));
  };
  const changeCategory = (category: SearchCategory) => {
    opener.cancel();
    offset.current = 0;
    list.current?.scrollToOffset({ offset: 0, animated: false });
    setInput((value) => ({ ...value, category }));
  };
  const restoreOffset = () =>
    list.current?.scrollToOffset({ offset: offset.current, animated: false });
  const scopeName = visiblePage?.results.find(
    (row) => row.tripId === input.tripId,
  )?.tripName;
  return (
    <View style={styles.root}>
      <Stack.Screen
        options={{ title: t("comprehensiveSearch.title"), headerShown: true }}
      />
      <View style={styles.controls}>
        <View style={styles.searchField}>
          <AppIcon name="magnifyingglass" color={colors.textSecondary} />
          <UiTextInput
            ref={searchInput}
            variant="bare"
            style={styles.input}
            accessibilityLabel={t("comprehensiveSearch.query")}
            placeholder={t("comprehensiveSearch.query")}
            value={input.query}
            onChangeText={editQuery}
            autoCorrect={false}
            returnKeyType="done"
            clearButtonMode="while-editing"
            onSubmitEditing={() => {
              Keyboard.dismiss();
              if (visiblePage) void remember();
            }}
          />
        </View>
        {input.tripId ? (
          <Text style={styles.note}>
            {scopeName
              ? t("comprehensiveSearch.inTrip", { trip: scopeName })
              : t("comprehensiveSearch.scopeCurrent")}
          </Text>
        ) : null}
        {input.query.trim() ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chips}
            keyboardShouldPersistTaps="handled"
          >
            {categories.map((category) => (
              <View key={category} style={!count(category) ? styles.zero : undefined}>
                <UiChoiceChip
                  selected={input.category === category}
                  label={t("comprehensiveSearch.categoryCount", {
                    category: t(categoryKey[category]),
                    count: visiblePage
                      ? `${formatUiNumber(count(category))}${visiblePage.cursor ? "+" : ""}`
                      : "…",
                  })}
                  onPress={() => changeCategory(category)}
                />
              </View>
            ))}
          </ScrollView>
        ) : null}
        {offline ? (
          <Text accessibilityLiveRegion="polite" style={styles.note}>
            {t("comprehensiveSearch.offline")}
          </Text>
        ) : null}
        {unavailable ? (
          <Text accessibilityLiveRegion="polite" style={styles.note}>
            {t("comprehensiveSearch.unavailable")}
          </Text>
        ) : null}
      </View>
      {!input.query.trim() ? (
        <ScrollView style={styles.home} keyboardShouldPersistTaps="handled">
          <View style={styles.recentHeading}>
            <Text style={styles.section}>{t("comprehensiveSearch.recents")}</Text>
            {recents.length ? (
              <UiButton
                label={t("comprehensiveSearch.clearRecents")}
                variant="text"
                onPress={() => {
                  void updateRecents(() => searchRecentRepository.clear());
                }}
              />
            ) : null}
          </View>
          {recentError ? (
            <Text style={styles.note}>{t("comprehensiveSearch.recentUnavailable")}</Text>
          ) : null}
          {!recents.some((row) => row.tripId === input.tripId) ? (
            <Text style={styles.note}>{t("comprehensiveSearch.noRecents")}</Text>
          ) : null}
          {recents
            .filter((row) => row.tripId === input.tripId)
            .map((row) => (
              <View key={JSON.stringify(row)} style={styles.recentRow}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={row.query}
                  style={styles.recentQuery}
                  onPress={() => editQuery(row.query)}
                >
                  <AppIcon name="clock" color={colors.textSecondary} />
                  <Text style={styles.recentText} numberOfLines={2}>
                    {row.query}
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t("comprehensiveSearch.removeRecent", {
                    query: row.query,
                  })}
                  style={styles.iconTarget}
                  onPress={() => {
                    void updateRecents(() => searchRecentRepository.remove(row));
                  }}
                >
                  <AppIcon name="xmark" color={colors.textSecondary} size={16} />
                </Pressable>
              </View>
            ))}
          <Text style={styles.section}>{t("comprehensiveSearch.browse")}</Text>
          {categories
            .filter((category) => category !== "ALL")
            .map((category) => (
              <UiFormRow
                key={category}
                label={t(categoryKey[category])}
                value=""
                onPress={() => {
                  changeCategory(category);
                  searchInput.current?.focus();
                }}
              />
            ))}
        </ScrollView>
      ) : (
        <FlatList
          ref={list}
          data={rows}
          keyExtractor={(row) => `${row.category}/${row.tripId}/${row.id}`}
          initialNumToRender={12}
          maxToRenderPerBatch={12}
          windowSize={5}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          scrollEventThrottle={16}
          onScroll={(event) => {
            offset.current = event.nativeEvent.contentOffset.y;
          }}
          onContentSizeChange={restoreOffset}
          contentContainerStyle={styles.results}
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={[
                item.title,
                t(categoryKey[item.category]),
                !input.tripId ? item.tripName : null,
                item.date ? displayDate(item.date) : null,
              ]
                .filter(Boolean)
                .join(", ")}
              style={styles.row}
              onPress={() => {
                void open(item);
              }}
            >
              <View style={styles.typeIcon}>
                <AppIcon
                  name={item.category === "TRIPS" ? "suitcase" : "list.bullet"}
                  color={colors.textSecondary}
                />
              </View>
              <View style={styles.rowBody}>
                <Text style={styles.rowTitle} numberOfLines={2}>
                  {item.title}
                </Text>
                <Text style={styles.meta} numberOfLines={2}>
                  {[
                    t(categoryKey[item.category]),
                    item.date ? displayDate(item.date) : null,
                    !input.tripId && item.title !== item.tripName ? item.tripName : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </Text>
              </View>
              <AppIcon name="chevron.right" color={colors.textSecondary} size={16} />
            </Pressable>
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              {!busy && !unavailable ? (
                <AppIcon name="magnifyingglass" color={colors.textSecondary} size={32} />
              ) : null}
              <Text accessibilityLiveRegion="polite" style={styles.note}>
                {t(
                  unavailable
                    ? "comprehensiveSearch.unavailable"
                    : busy || !visiblePage
                      ? "common.loading"
                      : offline
                        ? "comprehensiveSearch.noLocalMatches"
                        : "comprehensiveSearch.noMatches",
                )}
              </Text>
              {!busy && !unavailable ? (
                <Text style={styles.note}>
                  {t(
                    offline
                      ? "comprehensiveSearch.offlineCoverage"
                      : "comprehensiveSearch.tryAnother",
                  )}
                </Text>
              ) : null}
            </View>
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
      )}
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
              requestAnimationFrame(restoreOffset);
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
    controls: {
      paddingHorizontal: visual.space.page,
      paddingVertical: visual.space.heading,
      gap: visual.space.heading,
    },
    searchField: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.controlTrack,
      borderRadius: visual.radius.control,
      paddingHorizontal: visual.space.card,
      minHeight: 44,
      gap: visual.space.heading,
    },
    input: { flex: 1, minWidth: 0 },
    chips: {
      flexDirection: "row",
      gap: visual.space.heading,
      paddingVertical: visual.space.heading,
    },
    zero: { opacity: 0.6 },
    home: { flex: 1, paddingHorizontal: visual.space.page },
    section: {
      ...visual.type.action,
      color: colors.textPrimary,
      marginVertical: visual.space.card,
    },
    recentHeading: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      flexWrap: "wrap",
    },
    recentRow: {
      flexDirection: "row",
      alignItems: "center",
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.separator,
    },
    recentQuery: {
      flex: 1,
      minHeight: 44,
      flexDirection: "row",
      alignItems: "center",
      gap: visual.space.card,
      paddingVertical: visual.space.card,
    },
    recentText: { flex: 1, ...visual.type.meta, color: colors.textPrimary },
    iconTarget: {
      minWidth: 44,
      minHeight: 44,
      alignItems: "center",
      justifyContent: "center",
    },
    results: {
      paddingHorizontal: visual.space.page,
      paddingBottom: visual.space.section,
      flexGrow: 1,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      minHeight: 68,
      backgroundColor: colors.surface,
      paddingVertical: visual.space.card,
      paddingHorizontal: visual.space.heading,
      gap: visual.space.card,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.separator,
    },
    typeIcon: { width: 36, alignItems: "center" },
    rowBody: { flex: 1, gap: 4 },
    rowTitle: { ...visual.type.tripRowTitle, color: colors.textPrimary },
    meta: { color: colors.textSecondary, ...visual.type.meta },
    note: { color: colors.textSecondary, ...visual.type.meta },
    empty: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      gap: visual.space.card,
      padding: visual.space.section,
    },
  });
