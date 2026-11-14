import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import { useNetworkState } from "expo-network";
import PagerView from "react-native-pager-view";
import {
  Stack,
  router,
  useFocusEffect,
  useIsFocused,
  useLocalSearchParams,
} from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  getAccountGeneration,
  subscribeAccountGeneration,
} from "@/data/auth/accountGeneration";
import { readCommittedLocalSession } from "@/data/auth/authRepository";
import { captureAccountRequestContext } from "@/data/auth/accountRequestContext";
import {
  readCaptureTripPrior,
  listCaptureTripPriors,
} from "@/features/capture/captureTripPrior";
import { useTripView } from "@/features/day-feed/TripViewContext";
import { CaptureActivity } from "@/features/capture/CaptureActivity";
import { NavigationContextTitle } from "@/components/navigationChrome";
import { AppIcon } from "@/components/AppIcon";
import { GlobalMenu } from "@/components/GlobalMenu";
import { SheetHeader } from "@/components/SheetHeader";
import { UiButton, UiText } from "@/ui/controls";
import { UiChoiceChip, UiTextInput, UiDatePicker } from "@/ui/forms";
import { t, formatUiDate, formatUiNumber } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { useThemedStyles, useUiTheme } from "@/ui/theme";
import { visual } from "@/ui/visual";
import type { UiColors } from "@/ui/palette";
import {
  captureDocumentRow,
  documentFormat,
  documentFormatLabel,
  documentSourceLabel as sourceKey,
  filterDocumentRows,
  documentChromeAfterScroll,
  documentReadFailure,
  searchDocumentRows,
  mergeDocumentRows,
  filterDocumentSearch,
  type DocumentSearchFilters,
  type DocumentListEntry,
  type DocumentFormat,
} from "./documentListPresentation";

type Tab = "TRIP" | "PERSONAL_INBOX" | "ACTIVITY";
const tabs: Tab[] = ["TRIP", "PERSONAL_INBOX", "ACTIVITY"];
const tabKey = {
  TRIP: "importDocuments.trip",
  PERSONAL_INBOX: "importDocuments.inbox",
  ACTIVITY: "documents.activityTab",
} as const;
const filters: DocumentFormat[] = ["ALL", "PDF", "IMAGE", "TEXT", "OFFLINE", "PRIVATE"];
const filterKey = {
  ALL: "documents.all",
  PDF: "attachment.pdf",
  IMAGE: "importDocuments.format.IMAGE",
  TEXT: "importDocuments.format.TEXT",
  OFFLINE: "documents.offline",
  PRIVATE: "importDocuments.private",
} as const;
const icons = {
  PDF: "doc.richtext",
  IMAGE: "photo",
  TEXT: "text.alignleft",
  FILE: "doc",
} as const;

export default function DocumentsScreen({
  searchOnly = false,
}: { searchOnly?: boolean } = {}) {
  const generation = useSyncExternalStore(
    subscribeAccountGeneration,
    getAccountGeneration,
  );
  return (
    <DocumentsWorkspace
      key={generation}
      generation={generation}
      searchOnly={searchOnly}
    />
  );
}
function DocumentsWorkspace({
  generation,
  searchOnly,
}: {
  generation: number;
  searchOnly: boolean;
}) {
  useUiLocale();
  const styles = useThemedStyles(createStyles),
    colors = useUiTheme();
  const params = useLocalSearchParams<{
    tripId?: string;
    scope?: "TRIP" | "PERSONAL_INBOX";
  }>();
  const { workingTrip, switchTrip } = useTripView();
  const tripId =
    typeof params.tripId === "string" && params.tripId
      ? params.tripId
      : (workingTrip?.tripId ?? null);
  const focused = useIsFocused(),
    visible = useRef(focused);
  useLayoutEffect(() => {
    visible.current = focused;
  }, [focused]);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const [tab, setTab] = useState<Tab>(
    params.scope === "PERSONAL_INBOX"
      ? "PERSONAL_INBOX"
      : tripId
        ? "TRIP"
        : "PERSONAL_INBOX",
  );
  const pager = useRef<PagerView>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [tripName, setTripName] = useState<string | null>(null);
  const [choosing, setChoosing] = useState(false),
    [choices, setChoices] = useState<{ id: string; name: string }[]>([]);
  const [chooseError, setChooseError] = useState(false);
  const active = useCallback(
    () => visible.current && generation === getAccountGeneration(),
    [generation],
  );
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      void readCommittedLocalSession()
        .then(async (session) => {
          if (!alive || !active()) return;
          const id = session?.identity?.userId ?? null;
          setAccountId(id);
          setChecked(true);
          if (id && tripId) {
            const prior = await readCaptureTripPrior(tripId, {
              accountId: id,
              generation,
            });
            if (alive && active()) setTripName(prior?.name ?? null);
          }
        })
        .catch(() => {
          if (alive && active()) {
            setChecked(true);
            setTripName(null);
          }
        });
      return () => {
        alive = false;
      };
    }, [active, generation, tripId, setAccountId, setChecked, setTripName]),
  );
  const pickTrip = async () => {
    if (!accountId || !active()) return;
    setChoosing(true);
    setChooseError(false);
    setChoices([]);
    try {
      const rows = await listCaptureTripPriors({ accountId, generation });
      if (active()) setChoices(rows);
    } catch {
      if (active()) setChooseError(true);
    }
  };
  const openJob = (jobId: string) => {
    if (active())
      router.push({
        pathname: "/capture",
        params: { jobId, ...(tripId ? { tripId } : {}) },
      });
  };
  return (
    <SafeAreaView edges={collapsed && !searchOnly ? ["top"] : []} style={styles.body}>
      <Stack.Screen
        options={{
          headerShown: searchOnly || !collapsed,
          headerBackVisible: searchOnly,
          title: t(searchOnly ? "documents.searchTitle" : "tripHome.documents"),
          headerTitle: () => (
            <NavigationContextTitle
              title={t(searchOnly ? "documents.searchTitle" : "tripHome.documents")}
            />
          ),
        }}
      />
      {!searchOnly && !collapsed ? (
        <GlobalMenu module="TRIP" journeyId={tripId} nativeToolbar />
      ) : null}
      {!searchOnly && !collapsed && tab !== "ACTIVITY" ? (
        <Stack.Toolbar placement="right">
          <Stack.Toolbar.Button
            icon="magnifyingglass"
            tintColor={colors.accent}
            separateBackground
            accessibilityLabel={t("documents.searchTitle")}
            onPress={() => {
              if (active())
                router.push({
                  pathname: "/document-search",
                  params: {
                    ...(tripId ? { tripId } : {}),
                    scope: tab === "PERSONAL_INBOX" ? "PERSONAL_INBOX" : "TRIP",
                  },
                });
            }}
          />
        </Stack.Toolbar>
      ) : null}
      {!searchOnly && !collapsed ? (
        <View style={styles.tabs}>
          {tabs.map((name, index) => (
            <Pressable
              key={name}
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === name }}
              onPress={() => {
                setTab(name);
                setCollapsed(false);
                pager.current?.setPage(index);
              }}
              style={[styles.tab, tab === name && styles.selectedTab]}
            >
              <AppIcon
                name={
                  name === "TRIP"
                    ? "folder"
                    : name === "PERSONAL_INBOX"
                      ? "tray"
                      : "list.bullet"
                }
                color={tab === name ? colors.accent : colors.textSecondary}
                size={20}
              />
              <UiText style={[styles.tabText, tab === name && styles.selectedText]}>
                {t(tabKey[name])}
              </UiText>
            </Pressable>
          ))}
        </View>
      ) : null}
      {!checked ? (
        <UiText style={styles.message}>{t("common.loading")}</UiText>
      ) : !accountId ? (
        <View style={styles.content}>
          <UiText style={styles.title}>{t("documents.signIn")}</UiText>
          <UiButton
            label={t("navigation.signIn")}
            onPress={() => router.push("/account")}
          />
        </View>
      ) : searchOnly ? (
        <DocumentDirectory
          accountId={accountId}
          tripId={tripId}
          generation={generation}
          scope={tab === "PERSONAL_INBOX" ? "PERSONAL_INBOX" : "TRIP"}
          visible={focused}
          isCurrent={active}
          searchOnly
          onScrollOffset={() => {}}
        />
      ) : (
        <PagerView
          ref={pager}
          style={styles.body}
          initialPage={tabs.indexOf(tab)}
          onPageSelected={(event) => {
            setTab(tabs[event.nativeEvent.position]);
            setCollapsed(false);
          }}
        >
          {tabs.map((name) => (
            <View key={name} style={styles.body} collapsable={false}>
              {name === "ACTIVITY" ? (
                tab === name ? (
                  <CaptureActivity
                    expectedAccountId={accountId}
                    isCurrent={active}
                    onOpenJob={openJob}
                    onHide={() => router.back()}
                    onReturn={() => {
                      setTab("TRIP");
                      pager.current?.setPage(0);
                    }}
                  />
                ) : null
              ) : (
                <>
                  {name === "TRIP" && !collapsed ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={t("documents.chooseTrip")}
                      style={styles.context}
                      onPress={() => void pickTrip()}
                    >
                      <UiText style={styles.title}>
                        {tripName ?? t("documents.chooseTrip")}
                      </UiText>
                      <AppIcon
                        name="chevron.down"
                        color={colors.textSecondary}
                        size={14}
                      />
                    </Pressable>
                  ) : null}
                  {name === "TRIP" && !tripId ? (
                    <UiText style={styles.message}>{t("documents.chooseTrip")}</UiText>
                  ) : (
                    <DocumentDirectory
                      key={`${accountId}:${name}:${name === "TRIP" ? tripId : ""}`}
                      accountId={accountId}
                      tripId={name === "TRIP" ? tripId : null}
                      generation={generation}
                      scope={name}
                      visible={focused && tab === name}
                      isCurrent={() => active() && tab === name}
                      onScrollOffset={(offset, distance, dragging) => {
                        if (tab === name)
                          setCollapsed((value) =>
                            documentChromeAfterScroll(value, offset, distance, dragging),
                          );
                      }}
                    />
                  )}
                </>
              )}
            </View>
          ))}
        </PagerView>
      )}
      <Modal
        visible={choosing && focused && generation === getAccountGeneration()}
        presentationStyle="pageSheet"
        animationType="slide"
        onRequestClose={() => setChoosing(false)}
      >
        <SafeAreaView edges={["bottom"]} style={styles.body}>
          <SheetHeader
            category="picker"
            title={t("documents.chooseTrip")}
            onLeft={() => setChoosing(false)}
          />
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.content}
          >
            {chooseError ? (
              <UiText style={styles.title} accessibilityRole="alert">
                {t("importDocuments.unavailable")}
              </UiText>
            ) : (
              choices.map((trip) => (
                <UiButton
                  key={trip.id}
                  variant="text"
                  label={trip.name}
                  onPress={() => {
                    if (!active()) return;
                    switchTrip(trip.id, generation);
                    router.setParams({ tripId: trip.id });
                    setTripName(trip.name);
                    setChoosing(false);
                  }}
                />
              ))
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}
function DocumentDirectory({
  accountId,
  tripId,
  generation,
  scope,
  isCurrent,
  visible,
  onScrollOffset,
  searchOnly = false,
}: {
  accountId: string;
  tripId: string | null;
  generation: number;
  scope: "TRIP" | "PERSONAL_INBOX";
  isCurrent(): boolean;
  visible: boolean;
  onScrollOffset(offset: number, distance: number, dragging: boolean): void;
  searchOnly?: boolean;
}) {
  const { fontScale } = useWindowDimensions();
  const styles = useThemedStyles(createStyles),
    colors = useUiTheme();
  const [rows, setRows] = useState<DocumentListEntry[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState<"DENIED" | "OFFLINE_UNKNOWN" | "FAILED" | null>(null);
  const [format, setFormat] = useState<DocumentFormat>("ALL"),
    [limit, setLimit] = useState(30),
    [refresh, setRefresh] = useState(0);
  const [page, setPage] = useState(0),
    [hasMore, setHasMore] = useState(false);
  const network = useNetworkState();
  const offline = network.isConnected === false || network.isInternetReachable === false;
  const pages = useRef(
    new Map<
      string,
      {
        rows: import("@/data/repositories/importDocumentsRepository").ImportDocument[];
        before?: { recordedAt: string; captureId: string };
        done: boolean;
        page: number;
      }
    >(),
  );
  const pagingKey = useRef("");
  const searching = searchOnly;
  const [query, setQuery] = useState("");
  const [facets, setFacets] = useState<DocumentSearchFilters>({});
  const [filtering, setFiltering] = useState(false);
  const [searchScope, setSearchScope] = useState<"TRIP" | "PERSONAL_INBOX" | "ALL">(
    scope,
  );
  const current = useRef(isCurrent);
  useLayoutEffect(() => {
    current.current = isCurrent;
  }, [isCurrent]);
  const alive = useRef(true);
  const scrollOffset = useRef(0);
  const dragStart = useRef<number | null>(null);
  const list = useRef<ScrollView>(null);
  const active = useCallback(
    () => alive.current && generation === getAccountGeneration() && current.current(),
    [generation],
  );
  useEffect(() => {
    alive.current = true;
    if (!visible) return;
    let canceled = false;
    const valid = () => !canceled && active();
    void (async () => {
      await Promise.resolve();
      if (!valid()) return;
      setLoading(true);
      setError(null);
      const [{ requireActiveUserId }, { getDefaultImportDocumentsRepository }] =
        await Promise.all([
          import("@/data/auth/authRepository"),
          import("@/data/operations/defaultImportDocuments"),
        ]);
      const context = await captureAccountRequestContext(
        tripId ?? "",
        requireActiveUserId,
      );
      if (!valid() || context.accountId !== accountId) return;
      const repository = await getDefaultImportDocumentsRepository();
      const readDirectory = async (directoryTrip: string | null, title?: string) => {
        const directoryScope = directoryTrip ? "TRIP" : "PERSONAL_INBOX";
        const context = await captureAccountRequestContext(
          directoryTrip ?? "",
          requireActiveUserId,
        );
        if (!valid() || context.accountId !== accountId) return [];
        const cacheKey = `${accountId}:${generation}:${tripId}:${scope}:${searching}:${searchScope}:${refresh}`;
        if (pagingKey.current !== cacheKey) {
          pages.current.clear();
          pagingKey.current = cacheKey;
        }
        const key = directoryTrip ?? "PERSONAL_INBOX";
        const cached = pages.current.get(key) ?? { rows: [], done: false, page: -1 };
        if (!cached.done && cached.page !== page) {
          try {
            const next = await repository.list(context, directoryScope, {
              limit: 30,
              before: cached.before,
              includeText: searching,
            });
            if (!valid()) return [];
            cached.rows = [
              ...cached.rows,
              ...next.filter(
                (row) => !cached.rows.some((old) => old.captureId === row.captureId),
              ),
            ];
            cached.before = next.at(-1) ?? cached.before;
            cached.done = next.length < 30;
            cached.page = page;
          } catch (error) {
            // Accepted Core and private Capture retain independent authorities.
            if (
              directoryTrip &&
              error instanceof Error &&
              error.message === "DOCUMENTS_TRIP_ACCESS"
            )
              cached.done = true;
            else throw error;
          }
          pages.current.set(key, cached);
        }
        const legacy = cached.rows;
        const originals: DocumentListEntry[] = [];
        if (directoryTrip) {
          const { localItemImportOriginals } =
            await import("@/data/operations/localItemImportOriginals");
          const reader = await localItemImportOriginals(
            directoryTrip,
            undefined,
            generation,
          );
          originals.push(
            ...(await reader.metadata()).map((doc) => ({
              ...doc,
              origin: "CORE" as const,
            })),
          );
        }
        return mergeDocumentRows(
          originals,
          legacy.map((doc) => captureDocumentRow(doc, t("capture.ai.submittedText"))),
        ).map((row) => ({ ...row, tripId: directoryTrip, tripTitle: title }));
      };
      const directory = searching ? searchScope : scope;
      let result: DocumentListEntry[];
      if (directory === "ALL") {
        result = await readDirectory(null);
        const trips = await listCaptureTripPriors({ accountId, generation });
        for (const trip of trips) {
          if (!valid()) return;
          result.push(...(await readDirectory(trip.id, trip.name)));
        }
      } else result = await readDirectory(directory === "TRIP" ? tripId : null);
      if (valid()) {
        setHasMore([...pages.current.values()].some((entry) => !entry.done));
        setRows(
          result.sort(
            (a, b) =>
              (b.recordedAt ?? "").localeCompare(a.recordedAt ?? "") ||
              b.id.localeCompare(a.id),
          ),
        );
      }
    })()
      .catch((error) => {
        if (valid()) setError(documentReadFailure(error, offline));
      })
      .finally(() => {
        if (valid()) setLoading(false);
      });
    return () => {
      canceled = true;
    };
  }, [
    accountId,
    tripId,
    generation,
    scope,
    visible,
    refresh,
    active,
    searching,
    searchScope,
    page,
    offline,
  ]);
  useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );
  const openDetail = (entry: DocumentListEntry, information = false) => {
    if (!active()) return;
    router.push({
      pathname: "/document-detail",
      params: {
        documentId: entry.id,
        origin: entry.origin,
        tripId: entry.tripId === undefined ? (tripId ?? "") : (entry.tripId ?? ""),
        ...(entry.captureId ? { captureId: entry.captureId } : {}),
        ...(information ? { information: "true" } : {}),
      },
    });
  };
  const more = () => {
    if (!active() || loading) return;
    setLimit((value) => value + 30);
    if (hasMore) setPage((value) => value + 1);
  };
  const groups = searchDocumentRows(
    filterDocumentSearch(filterDocumentRows(rows, format), searching ? facets : {}),
    searching ? query : "",
  );
  const filtered = groups.map((group) => group[0]);
  return (
    <View style={styles.body}>
      {searchOnly ? (
        <View style={styles.search}>
          <UiTextInput
            accessibilityLabel={t("documents.search")}
            placeholder={t("documents.search")}
            value={query}
            onChangeText={setQuery}
            autoCorrect={false}
            clearButtonMode="while-editing"
            returnKeyType="search"
          />
          <ScrollView
            horizontal
            keyboardShouldPersistTaps="handled"
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterContent}
          >
            {(["TRIP", "PERSONAL_INBOX", "ALL"] as const)
              .filter((choice) => choice !== "TRIP" || tripId)
              .map((choice) => (
                <UiChoiceChip
                  key={choice}
                  label={t(
                    choice === "TRIP"
                      ? "documents.searchTrip"
                      : choice === "ALL"
                        ? "documents.searchAll"
                        : "documents.searchInbox",
                  )}
                  selected={searchScope === choice}
                  onPress={() => {
                    setSearchScope(choice);
                    setLimit(30);
                  }}
                />
              ))}
          </ScrollView>
          <UiButton
            variant="text"
            label={t("documents.searchFilters")}
            onPress={() => setFiltering(true)}
          />
        </View>
      ) : null}
      <Modal
        visible={filtering && visible}
        presentationStyle="pageSheet"
        animationType="slide"
        onRequestClose={() => setFiltering(false)}
      >
        <SafeAreaView edges={["bottom"]} style={styles.body}>
          <SheetHeader
            category="picker"
            title={t("documents.searchFilters")}
            onLeft={() => setFiltering(false)}
          />
          <ScrollView contentContainerStyle={styles.content}>
            <UiText style={styles.title}>{t("documents.privacyFilter")}</UiText>
            {([undefined, "PRIVATE", "GROUP", "SELECTED_PERSONS"] as const).map(
              (value) => (
                <UiChoiceChip
                  key={value ?? "ALL"}
                  selected={facets.visibility === value}
                  label={t(
                    value === "PRIVATE"
                      ? "importDocuments.private"
                      : value === "GROUP"
                        ? "documents.sharedTrip"
                        : value === "SELECTED_PERSONS"
                          ? "documents.sharedPeople"
                          : "documents.all",
                  )}
                  onPress={() => setFacets({ ...facets, visibility: value })}
                />
              ),
            )}
            <UiText style={styles.title}>{t("documents.storageFilter")}</UiText>
            {([undefined, "LOCAL", "UNAVAILABLE"] as const).map((value) => (
              <UiChoiceChip
                key={value ?? "ALL"}
                selected={facets.storage === value}
                label={t(
                  value === "LOCAL"
                    ? "documents.offline"
                    : value === "UNAVAILABLE"
                      ? "documents.unavailableFilter"
                      : "documents.all",
                )}
                onPress={() => setFacets({ ...facets, storage: value })}
              />
            ))}
            <UiText style={styles.title}>{t("documents.sourceFilter")}</UiText>
            {(
              [
                undefined,
                "files",
                "photos",
                "camera",
                "magic_input",
                "clipboard",
              ] as const
            ).map((value) => (
              <UiChoiceChip
                key={value ?? "ALL"}
                selected={facets.source === value}
                label={t(value ? sourceKey[value] : "documents.all")}
                onPress={() => setFacets({ ...facets, source: value })}
              />
            ))}
            <UiText style={styles.title}>{t("documents.relation")}</UiText>
            {([undefined, "LINKED", "UNLINKED", "MULTIPLE"] as const).map((relation) => (
              <UiChoiceChip
                key={relation ?? "ALL"}
                selected={facets.relation === relation}
                label={t(
                  relation === "LINKED"
                    ? "documents.linkedFilter"
                    : relation === "UNLINKED"
                      ? "documents.unlinkedFilter"
                      : relation === "MULTIPLE"
                        ? "documents.multipleFilter"
                        : "documents.all",
                )}
                onPress={() => setFacets({ ...facets, relation })}
              />
            ))}
            {(["from", "to"] as const).map((key) => (
              <View key={key} style={styles.content}>
                <UiText style={styles.title}>
                  {t(key === "from" ? "documents.dateFrom" : "documents.dateTo")}
                </UiText>
                <UiDatePicker
                  value={facets[key] ?? new Date()}
                  mode="date"
                  display="compact"
                  onChange={(_, value) => {
                    if (value) setFacets({ ...facets, [key]: value });
                  }}
                />
                {facets[key] ? (
                  <UiButton
                    variant="text"
                    label={t("documents.clearDate")}
                    onPress={() => setFacets({ ...facets, [key]: undefined })}
                  />
                ) : (
                  <UiText style={styles.meta}>{t("documents.noDateFilter")}</UiText>
                )}
              </View>
            ))}
            <UiButton
              variant="text"
              label={t("documents.resetFilters")}
              onPress={() => setFacets({})}
            />
            <UiButton label={t("common.done")} onPress={() => setFiltering(false)} />
          </ScrollView>
        </SafeAreaView>
      </Modal>
      <ScrollView
        horizontal
        keyboardShouldPersistTaps="handled"
        showsHorizontalScrollIndicator={false}
        key={fontScale}
        style={styles.filters}
        contentContainerStyle={styles.filterContent}
      >
        {filters
          .filter((filter) => scope === "TRIP" || filter !== "PRIVATE")
          .map((filter) => (
            <UiChoiceChip
              key={filter}
              label={t(filterKey[filter])}
              selected={format === filter}
              onPress={() => {
                setFormat(filter);
                setLimit(30);
              }}
            />
          ))}
      </ScrollView>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.list}
        ref={list}
        onLayout={() =>
          list.current?.scrollTo({ y: scrollOffset.current, animated: false })
        }
        alwaysBounceVertical
        onScrollBeginDrag={(event) => {
          dragStart.current = event.nativeEvent.contentOffset.y;
        }}
        onScrollEndDrag={() => {
          dragStart.current = null;
        }}
        onScrollToTop={() => onScrollOffset(0, -10, true)}
        onScroll={(event) => {
          scrollOffset.current = event.nativeEvent.contentOffset.y;
          const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
          if (
            contentOffset.y > 0 &&
            contentSize.height - layoutMeasurement.height - contentOffset.y < 180 &&
            (hasMore || filtered.length > limit)
          )
            more();
          onScrollOffset(
            scrollOffset.current,
            dragStart.current === null ? 0 : scrollOffset.current - dragStart.current,
            dragStart.current !== null,
          );
        }}
        scrollEventThrottle={32}
      >
        {loading && !rows.length ? (
          <UiText style={styles.message}>{t("importDocuments.loading")}</UiText>
        ) : error ? (
          <View style={styles.content}>
            <UiText style={styles.title} accessibilityRole="alert">
              {t(
                error === "DENIED"
                  ? "documents.denied"
                  : error === "OFFLINE_UNKNOWN"
                    ? "documents.offlineUnknown"
                    : "documents.readFailed",
              )}
            </UiText>
            <UiButton
              variant="text"
              label={t("capture.activityRefresh")}
              onPress={() => setRefresh(refresh + 1)}
            />
          </View>
        ) : !filtered.length ? (
          <UiText style={styles.message}>
            {t(hasMore ? "documents.searchPartial" : "importDocuments.empty")}
          </UiText>
        ) : (
          filtered.slice(0, limit).map((entry) => (
            <View key={`${entry.origin}:${entry.id}`} style={styles.row}>
              <Pressable
                style={styles.rowMain}
                accessibilityRole="button"
                accessibilityLabel={entry.title}
                onPress={() => {
                  if (active()) {
                    onScrollOffset(0, -10, true);
                    openDetail(entry);
                  }
                }}
              >
                <View style={styles.icon}>
                  <AppIcon
                    name={icons[documentFormat(entry)]}
                    size={22}
                    color={colors.textSecondary}
                  />
                  <View style={styles.privacy}>
                    <AppIcon
                      name={
                        entry.visibility === "GROUP"
                          ? "person.2"
                          : entry.visibility === "SELECTED_PERSONS"
                            ? "person"
                            : "lock"
                      }
                      size={10}
                      color={colors.textSecondary}
                    />
                  </View>
                </View>
                <View style={styles.rowCopy}>
                  <UiText numberOfLines={2} style={styles.title}>
                    {entry.title}
                  </UiText>
                  <UiText style={styles.meta}>
                    {t("documents.rowMetadata", {
                      format: t(documentFormatLabel[documentFormat(entry)]),
                      size: entry.byteCount
                        ? t("documents.byteSize", {
                            count: formatUiNumber(entry.byteCount),
                          })
                        : t("documents.sizeUnknown"),
                      date: entry.recordedAt
                        ? formatUiDate(new Date(entry.recordedAt), {
                            month: "short",
                            day: "numeric",
                          })
                        : t("documents.dateUnknown"),
                    })}
                  </UiText>
                  {searching && searchScope === "ALL"
                    ? groups
                        .find((group) => group[0] === entry)
                        ?.map((location) => (
                          <UiButton
                            key={`${location.origin}:${location.tripId}:${location.id}`}
                            variant="text"
                            label={location.tripTitle ?? t("documents.unknownLocation")}
                            onPress={() => {
                              if (active()) openDetail(location);
                            }}
                          />
                        ))
                    : null}
                </View>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("documents.fileInfo")}
                style={styles.more}
                onPress={() => {
                  if (active()) {
                    onScrollOffset(0, -10, true);
                    openDetail(entry, true);
                  }
                }}
              >
                <AppIcon name="ellipsis" size={20} color={colors.textSecondary} />
              </Pressable>
            </View>
          ))
        )}
        {!error && (filtered.length > limit || hasMore) ? (
          <UiButton label={t("capture.activityMore")} variant="text" onPress={more} />
        ) : null}
      </ScrollView>
    </View>
  );
}
const createStyles = (colors: UiColors) =>
  StyleSheet.create({
    body: { flex: 1, backgroundColor: colors.background },
    search: { paddingHorizontal: visual.space.page, paddingVertical: 4, gap: 4 },
    content: { padding: visual.space.page, gap: visual.space.card },
    tabs: {
      flexDirection: "row",
      backgroundColor: colors.surface,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.separator,
    },
    tab: {
      flex: 1,
      minHeight: 62,
      padding: 8,
      alignItems: "center",
      justifyContent: "center",
      gap: 4,
      borderBottomWidth: 2,
      borderBottomColor: colors.transparent,
    },
    selectedTab: { borderBottomColor: colors.accent },
    tabText: { ...visual.type.meta, color: colors.textSecondary },
    selectedText: { color: colors.accent },
    context: {
      minHeight: 50,
      paddingHorizontal: visual.space.page,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: colors.surface,
    },
    title: { ...visual.type.row, color: colors.textPrimary, flexShrink: 1 },
    meta: { ...visual.type.meta, color: colors.textSecondary },
    filters: { flexGrow: 0, flexShrink: 0, backgroundColor: colors.surface },
    filterContent: { gap: 8, paddingHorizontal: visual.space.page, paddingVertical: 8 },
    list: { paddingBottom: visual.space.section },
    message: { padding: visual.space.page, color: colors.textSecondary },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: visual.space.card,
      padding: visual.space.row,
      minHeight: 76,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.separator,
    },
    rowMain: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: visual.space.card,
      minHeight: 44,
    },
    rowCopy: { flex: 1, gap: 4 },
    more: { width: 44, minHeight: 44, alignItems: "center", justifyContent: "center" },
    icon: {
      width: 44,
      height: 44,
      borderRadius: visual.radius.control,
      backgroundColor: colors.controlTrack,
      alignItems: "center",
      justifyContent: "center",
    },
    privacy: {
      position: "absolute",
      right: -2,
      bottom: -2,
      backgroundColor: colors.surface,
      borderRadius: visual.radius.pill,
      padding: 3,
    },
  });
