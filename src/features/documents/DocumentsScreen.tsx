import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
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
import { ImportDocumentsPanel } from "./ImportDocumentsPanel";
import { AppIcon } from "@/components/AppIcon";
import { GlobalMenu } from "@/components/GlobalMenu";
import { SheetHeader } from "@/components/SheetHeader";
import { UiButton, UiText } from "@/ui/controls";
import { UiChoiceChip } from "@/ui/forms";
import { t, formatUiDate, formatUiNumber } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { useThemedStyles, useUiTheme } from "@/ui/theme";
import { visual } from "@/ui/visual";
import type { UiColors } from "@/ui/palette";
import {
  captureDocumentRow,
  documentFormat,
  documentFormatLabel,
  filterDocumentRows,
  type DocumentListEntry,
  type DocumentFormat,
} from "./documentListPresentation";

type Tab = "TRIP" | "PERSONAL_INBOX" | "ACTIVITY";
const tabs: Tab[] = ["TRIP", "PERSONAL_INBOX", "ACTIVITY"];
const tabKey = {
  TRIP: "importDocuments.trip",
  PERSONAL_INBOX: "importDocuments.inbox",
  ACTIVITY: "capture.progress.activeImports",
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

export default function DocumentsScreen() {
  const generation = useSyncExternalStore(
    subscribeAccountGeneration,
    getAccountGeneration,
  );
  return <DocumentsWorkspace key={generation} generation={generation} />;
}
function DocumentsWorkspace({ generation }: { generation: number }) {
  useUiLocale();
  const styles = useThemedStyles(createStyles),
    colors = useUiTheme();
  const params = useLocalSearchParams<{ tripId?: string }>();
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
  const [tab, setTab] = useState<Tab>(tripId ? "TRIP" : "PERSONAL_INBOX");
  const pager = useRef<PagerView>(null);
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
    <View style={styles.body}>
      <Stack.Screen
        options={{
          headerShown: true,
          headerBackVisible: false,
          title: t("tripHome.documents"),
        }}
      />
      <GlobalMenu module="TRIP" journeyId={tripId} nativeToolbar />
      <View style={styles.tabs}>
        {tabs.map((name, index) => (
          <Pressable
            key={name}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === name }}
            onPress={() => {
              setTab(name);
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
      {!checked ? (
        <UiText style={styles.message}>{t("common.loading")}</UiText>
      ) : !accountId ? (
        <View style={styles.content}>
          <UiText>{t("documents.signIn")}</UiText>
          <UiButton
            label={t("navigation.signIn")}
            onPress={() => router.push("/account")}
          />
        </View>
      ) : (
        <PagerView
          ref={pager}
          style={styles.body}
          initialPage={tabs.indexOf(tab)}
          onPageSelected={(event) => setTab(tabs[event.nativeEvent.position])}
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
                  {name === "TRIP" ? (
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
                      onOpenJob={openJob}
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
              <UiText accessibilityRole="alert">
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
    </View>
  );
}
function DocumentDirectory({
  accountId,
  tripId,
  generation,
  scope,
  isCurrent,
  visible,
  onOpenJob,
}: {
  accountId: string;
  tripId: string | null;
  generation: number;
  scope: "TRIP" | "PERSONAL_INBOX";
  isCurrent(): boolean;
  visible: boolean;
  onOpenJob(id: string): void;
}) {
  const styles = useThemedStyles(createStyles),
    colors = useUiTheme();
  const [rows, setRows] = useState<DocumentListEntry[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(false);
  const [format, setFormat] = useState<DocumentFormat>("ALL"),
    [limit, setLimit] = useState(30),
    [refresh, setRefresh] = useState(0);
  const [selected, setSelected] = useState<DocumentListEntry | null>(null);
  const [text, setText] = useState<string | null>(null),
    [opening, setOpening] = useState(false),
    [originalError, setOriginalError] = useState(false);
  const current = useRef(isCurrent);
  useLayoutEffect(() => {
    current.current = isCurrent;
  }, [isCurrent]);
  const alive = useRef(true);
  const scrollOffset = useRef(0);
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
      setError(false);
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
      const legacy = [] as Awaited<ReturnType<typeof repository.list>>;
      let before: { recordedAt: string; captureId: string } | undefined;
      while (valid()) {
        let page;
        try {
          page = await repository.list(context, scope, { limit: 100, before });
        } catch (error) {
          // Core read authority is independent of the legacy Ledger-backed Capture directory.
          if (
            scope === "TRIP" &&
            error instanceof Error &&
            error.message === "DOCUMENTS_TRIP_ACCESS"
          )
            break;
          throw error;
        }
        if (!valid()) return;
        legacy.push(...page);
        if (page.length < 100) break;
        before = page.at(-1)!;
      }
      if (!valid()) return;
      let originals: DocumentListEntry[] = [];
      if (tripId) {
        const { localItemImportOriginals } =
          await import("@/data/operations/localItemImportOriginals");
        const reader = await localItemImportOriginals(tripId, undefined, generation);
        originals = (await reader.metadata()).map((doc) => ({
          ...doc,
          origin: "CORE" as const,
        }));
      }
      if (valid())
        setRows(
          [
            ...originals,
            ...legacy.map((doc) =>
              captureDocumentRow(doc, t("capture.ai.submittedText")),
            ),
          ].sort(
            (a, b) =>
              (b.recordedAt ?? "").localeCompare(a.recordedAt ?? "") ||
              a.id.localeCompare(b.id),
          ),
        );
    })()
      .catch(() => {
        if (valid()) setError(true);
      })
      .finally(() => {
        if (valid()) setLoading(false);
      });
    return () => {
      canceled = true;
    };
  }, [accountId, tripId, generation, scope, visible, refresh, active]);
  useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );
  async function openOriginal(entry: DocumentListEntry) {
    if (!tripId || !active() || opening) return;
    setOpening(true);
    setOriginalError(false);
    setText(null);
    try {
      const { localItemImportOriginals } =
        await import("@/data/operations/localItemImportOriginals");
      const reader = await localItemImportOriginals(tripId, undefined, generation);
      const original = await reader.original(entry.id);
      if (!active()) return;
      if (!original) throw Error("IMPORT_ORIGINAL_UNAVAILABLE");
      if (original.document.mediaType === "text/plain")
        setText(new TextDecoder("utf-8", { fatal: true }).decode(original.bytes));
      else {
        const { previewImportOriginal } = await import("@/native/importOriginalPreview");
        await previewImportOriginal(original, active);
      }
    } catch {
      if (active()) setOriginalError(true);
    } finally {
      if (active()) setOpening(false);
    }
  }
  if (selected)
    return (
      <View style={styles.body}>
        <UiButton
          variant="text"
          label={t("common.back")}
          onPress={() => {
            setSelected(null);
            setText(null);
            setOriginalError(false);
          }}
        />
        {selected.origin === "CAPTURE" ? (
          <ImportDocumentsPanel
            accountId={accountId}
            tripId={tripId}
            scope={scope}
            captureId={selected.id}
            isCurrent={active}
            onOpenDocument={() => {}}
            onOpenActivity={onOpenJob}
          />
        ) : (
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.content}
          >
            <UiText style={styles.title}>{selected.title}</UiText>
            <UiText style={styles.meta}>
              {t(
                selected.visibility === "GROUP"
                  ? "documents.sharedTrip"
                  : selected.visibility === "SELECTED_PERSONS"
                    ? "documents.sharedPeople"
                    : "importDocuments.private",
              )}
            </UiText>
            <UiText style={styles.meta}>{t("documents.localOnly")}</UiText>
            <UiButton
              label={t("importDocuments.openOriginal")}
              disabled={opening}
              onPress={() => void openOriginal(selected)}
            />
            {originalError ? (
              <UiText accessibilityRole="alert">
                {t("importDocuments.originalUnavailable")}
              </UiText>
            ) : null}
            {text !== null ? <UiText selectable>{text}</UiText> : null}
          </ScrollView>
        )}
      </View>
    );
  const filtered = filterDocumentRows(rows, format);
  return (
    <View style={styles.body}>
      <ScrollView
        horizontal
        keyboardShouldPersistTaps="handled"
        showsHorizontalScrollIndicator={false}
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
        onScroll={(event) => {
          scrollOffset.current = event.nativeEvent.contentOffset.y;
        }}
        scrollEventThrottle={32}
      >
        {loading ? (
          <UiText style={styles.message}>{t("importDocuments.loading")}</UiText>
        ) : error ? (
          <View style={styles.content}>
            <UiText accessibilityRole="alert">{t("importDocuments.unavailable")}</UiText>
            <UiButton
              variant="text"
              label={t("capture.activityRefresh")}
              onPress={() => setRefresh(refresh + 1)}
            />
          </View>
        ) : !filtered.length ? (
          <UiText style={styles.message}>{t("importDocuments.empty")}</UiText>
        ) : (
          filtered.slice(0, limit).map((entry) => (
            <Pressable
              key={`${entry.origin}:${entry.id}`}
              style={styles.row}
              accessibilityRole="button"
              accessibilityLabel={entry.title}
              onPress={() => {
                if (active()) setSelected(entry);
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
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("documents.fileInfo")}
                style={styles.more}
                onPress={() => {
                  if (active()) setSelected(entry);
                }}
              >
                <AppIcon name="ellipsis" size={20} color={colors.textSecondary} />
              </Pressable>
            </Pressable>
          ))
        )}
        {!error && filtered.length > limit ? (
          <UiButton
            label={t("capture.activityMore")}
            variant="text"
            onPress={() => setLimit(limit + 30)}
          />
        ) : null}
      </ScrollView>
    </View>
  );
}
const createStyles = (colors: UiColors) =>
  StyleSheet.create({
    body: { flex: 1, backgroundColor: colors.background },
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
    filters: { flexGrow: 0, maxHeight: 64, backgroundColor: colors.surface },
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
