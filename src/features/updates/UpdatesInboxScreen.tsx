import { useSheetScrollDismissal } from "@/components/SheetHost";
import { hostedImportEnabled } from "@/features/capture/hostedImport";
import { ImportUpdatesSection } from "./ImportUpdatesSection";
import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { AppIcon } from "@/components/AppIcon";
import {
  getAccountGeneration,
  subscribeAccountGeneration,
} from "@/data/auth/accountGeneration";
import { assertAccountRequestGeneration } from "@/data/auth/accountRequestContext";
import { openDefaultUpdatesInbox } from "@/data/operations/defaultUpdatesInbox";
import type { CaptureUpdateCard, UpdatesFilter } from "@/domain/updates/updatesInbox";
import { useTripView } from "@/features/day-feed/TripViewContext";
import { UiButton, UiText } from "@/ui/controls";
import { UiChoiceChip, UiTextInput } from "@/ui/forms";
import { formatUiDate, t, translate } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { useThemedStyles, useUiTheme } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { visual } from "@/ui/visual";

type Session = Awaited<ReturnType<typeof openDefaultUpdatesInbox>>;
type Page = Awaited<ReturnType<Session["repository"]["list"]>>;
const categories = ["ALL", "NEEDS_ATTENTION", "ACTIVITY", "MESSAGES"] as const;
export const updatesNoticeTime = (at: string) =>
  formatUiDate(new Date(at), {
    // ui-foundation-exception: string -- Intl stored-time formatting, not visible copy
    dateStyle: "medium",
    // ui-foundation-exception: string -- Intl precision includes persisted seconds
    timeStyle: "medium",
  });
export const updatesCardTitle = (card: CaptureUpdateCard) =>
  card.sourceState === "ACTION_REQUIRED"
    ? t("updates.needsInput", { count: card.recoveryInputs.length })
    : t(`updates.state.${card.sourceState}`);

type OpenImport = (jobId: string, originGeneration: number, destination?: "REVIEW") => void;

type UpdatesInboxProps = {
  onOpenImport?: OpenImport;
  bindRefresh?(refresh: (() => void) | null): void;
};

export function UpdatesInboxScreen(props: UpdatesInboxProps = {}) {
  const generation = useSyncExternalStore(
    subscribeAccountGeneration,
    getAccountGeneration,
  );
  return <UpdatesInboxContent key={generation} generation={generation} {...props} />;
}
function UpdatesInboxContent({ generation, onOpenImport, bindRefresh }: UpdatesInboxProps & { generation: number }) {
  const sheetScroll = useSheetScrollDismissal();
  const locale = useUiLocale();
  const { fontScale } = useWindowDimensions();
  const styles = useThemedStyles(createStyles),
    colors = useUiTheme();
  const { workingTrip } = useTripView();
  const params = useLocalSearchParams<{
    activityId?: string;
    activityJobId?: string;
    activityTripId?: string;
    originGeneration?: string;
  }>();
  const [showAll, setShowAll] = useState(false);
  const activityId =
    !showAll && params.originGeneration === String(generation) &&
    typeof params.activityId === "string"
      ? params.activityId
      : undefined;
  const importMark = useRef<(() => Promise<void>) | null>(null);
  const [importUnread, setImportUnread] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);
  const [importCount, setImportCount] = useState<number | null>(null);
  const bindImportRead = useCallback(
    (count: number, mark: () => Promise<void>, total?: number | null) => {
      importMark.current = mark;
      setImportUnread(count);
      setImportCount(total ?? null);
    },
    [],
  );
  const [category, setCategory] = useState<UpdatesFilter["category"]>("ALL");
  const [unreadOnly, setUnreadOnly] = useState(false),
    [query, setQuery] = useState("");
  const filter = useMemo<UpdatesFilter>(
    () => ({
      category,
      unreadOnly,
      query,
      currentTripId: activityId
        ? params.activityTripId || null
        : workingTrip?.generation === generation
          ? workingTrip.tripId
          : null,
    }),
    [
      category,
      unreadOnly,
      query,
      workingTrip,
      generation,
      activityId,
      params.activityTripId,
    ],
  );
  const presentationText = useMemo(() => {
    const title = translate("updates.needsInput", { count: "{count}" }, locale);
    const source = translate("updates.personalCapture", undefined, locale);
    const states = {
      RECOVERED: translate("updates.state.RECOVERED", undefined, locale),
      INACTIVE: translate("updates.state.INACTIVE", undefined, locale),
      UNAVAILABLE: translate("updates.state.UNAVAILABLE", undefined, locale),
    };
    return (state: CaptureUpdateCard["sourceState"], count: number) =>
      `${state === "ACTION_REQUIRED" ? title.replace("{count}", String(count)) : states[state]} ${source}`;
  }, [locale]);
  const filterKey = JSON.stringify([filter, locale]);
  const renderedIntent = useMemo(
    () => Symbol(`${filterKey}:${generation}`),
    [filterKey, generation],
  );
  const [loaded, setLoaded] = useState<{ filterKey: string; page: Page } | null>(null);
  const [loading, setLoading] = useState(false),
    [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const session = useRef<Session | null>(null),
    active = useRef(false),
    request = useRef(0);
  const intent = useRef<symbol | null>(null),
    action = useRef(false);
  // Committed filter identity fences A→B→A without changing the existing navigation owner.
  useLayoutEffect(() => {
    const lease = intent,
      requests = request;
    lease.current = renderedIntent;
    return () => {
      lease.current = null;
      requests.current++;
    };
  }, [renderedIntent]);
  const page = loaded?.filterKey === filterKey ? loaded.page : null;
  const current = useCallback(
    (ticket: number, owner: symbol | null) => {
      if (
        !active.current ||
        !owner ||
        intent.current !== owner ||
        request.current !== ticket ||
        generation !== getAccountGeneration()
      )
        return false;
      try {
        if (session.current) assertAccountRequestGeneration(session.current.context);
        return true;
      } catch {
        return false;
      }
    },
    [generation],
  );
  const load = useCallback(
    async (older = false, before?: NonNullable<Page["next"]>) => {
      if (!current(request.current, renderedIntent)) return;
      const ticket = ++request.current,
        owner = renderedIntent;
      setLoading(true);
      setFailed(false);
      try {
        const reader = session.current ?? (await openDefaultUpdatesInbox());
        if (!current(ticket, owner)) return;
        assertAccountRequestGeneration(reader.context);
        session.current = reader;
        const next = await reader.repository.list(filter, reader.context, {
          before,
          presentationText,
        });
        if (!current(ticket, owner)) return;
        setLoaded((previous) => ({
          filterKey,
          page: {
            ...next,
            cards:
              older && previous?.filterKey === filterKey
                ? [
                    ...previous.page.cards,
                    ...next.cards.filter(
                      (card) =>
                        !previous.page.cards.some(
                          (old) => old.notificationId === card.notificationId,
                        ),
                    ),
                  ]
                : next.cards,
          },
        }));
      } catch {
        if (active.current && intent.current === owner && request.current === ticket)
          setFailed(true);
      } finally {
        if (active.current && intent.current === owner && request.current === ticket)
          setLoading(false);
      }
    },
    [filter, filterKey, current, renderedIntent, presentationText],
  );
  useFocusEffect(
    useCallback(() => {
      active.current = true;
      if (!action.current) setBusy(false);
      void load();
      return () => {
        active.current = false;
        request.current++;
      };
    }, [load]),
  );
  const refresh = useCallback(() => {
    if (!active.current || generation !== getAccountGeneration()) return;
    void load();
    setRefreshKey((value) => value + 1);
  }, [generation, load]);
  useLayoutEffect(() => {
    bindRefresh?.(refresh);
    return () => bindRefresh?.(null);
  }, [bindRefresh, refresh]);
  const operate = async (work: (reader: Session) => Promise<void>) => {
    const ticket = request.current,
      owner = renderedIntent,
      reader = session.current;
    if (!reader || action.current || loading || !current(ticket, owner)) return;
    action.current = true;
    setBusy(true);
    setFailed(false);
    try {
      await work(reader);
      if (current(ticket, owner)) void load();
    } catch {
      if (current(ticket, owner)) setFailed(true);
    } finally {
      action.current = false;
      if (active.current && generation === getAccountGeneration()) setBusy(false);
    }
  };
  const navigateToImport: OpenImport = (jobId, originGeneration, destination) => {
    if (onOpenImport) {
      onOpenImport(jobId, originGeneration, destination);
      return;
    }
    const review = hostedImportEnabled ? "/import-plans/review" : "/import-review";
    router.push({
      pathname: destination === "REVIEW" ? review : "/import-plans",
      params: { jobId, origin: "UPDATES", originGeneration: String(originGeneration) },
    });
  };
  const open = (card: CaptureUpdateCard) =>
    operate(async (reader) => {
      const ticket = request.current,
        owner = renderedIntent;
      const target = await reader.repository.open(
        card.notificationId,
        card.materialVersion,
        card.recoveryInputs,
        reader.context,
      );
      if (!current(ticket, owner)) return;
      assertAccountRequestGeneration(reader.context);
      navigateToImport(target.job.batch.jobId, reader.context.generation);
    });
  const intakeCards =
    page?.cards.filter((card) => !activityId || card.batchId === activityId) ?? [];
  const unread =
    intakeCards.filter((card) => card.unread && card.sourceState !== "UNAVAILABLE")
      .length ?? 0;
  return (
    <SafeAreaView edges={["bottom", "left", "right"]} style={styles.root}>
      <View style={styles.filters}>
        {activityId ? (
          <UiButton
            label={t("updates.batchScope")}
            variant="text"
            onPress={() => {
              if (onOpenImport) setShowAll(true);
              else router.setParams({
                activityId: undefined,
                activityJobId: undefined,
                activityTripId: undefined,
                originGeneration: undefined,
              });
            }}
          />
        ) : null}
        <ScrollView
          keyboardShouldPersistTaps="handled"
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categories}
        >
          {categories.map((value) => (
            <UiChoiceChip
              key={value}
              compact
              label={t(`updates.category.${value}`)}
              selected={category === value}
              onPress={() => setCategory(value)}
            />
          ))}
        </ScrollView>
        <View style={styles.unreadControl}>
          <UiText style={styles.secondary}>{t("updates.unreadOnly")}</UiText>
          <Switch
            accessibilityLabel={t("updates.unreadOnly")}
            value={unreadOnly}
            onValueChange={setUnreadOnly}
            trackColor={{ true: colors.accent }}
          />
        </View>
        <UiTextInput
          accessibilityLabel={t("updates.search")}
          placeholder={t("updates.search")}
          value={query}
          onChangeText={setQuery}
          maxLength={200}
          autoCapitalize="none"
          style={fontScale >= 2 ? {
            minHeight: Math.ceil(visual.type.row.fontSize * fontScale) + 2 * visual.space.card,
          } : undefined}
        />
      </View>
      <ScrollView
        {...sheetScroll}
        style={styles.list}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={bindRefresh ? undefined : (
          <RefreshControl refreshing={loading} onRefresh={refresh} tintColor={colors.accent} />
        )}
      >
        <ImportUpdatesSection
          filter={filter}
          generation={generation}
          batchId={activityId}
          jobId={
            typeof params.activityJobId === "string" ? params.activityJobId : undefined
          }
          onActivity={() => {
            if (active.current && generation === getAccountGeneration())
              router.push({ pathname: "/documents", params: { scope: "ACTIVITY" } });
          }}
          refreshKey={refreshKey}
          otherRows={intakeCards.map((card) => ({
            batchId: card.batchId,
            at: card.createdAt,
            attention: card.sourceState === "ACTION_REQUIRED",
            content: (
              <Pressable
                key={card.notificationId}
                accessibilityRole="button"
                accessibilityState={{
                  disabled: loading || busy || card.sourceState === "UNAVAILABLE",
                }}
                disabled={loading || busy || card.sourceState === "UNAVAILABLE"}
                onPress={() => void open(card)}
                style={styles.row}
              >
                <AppIcon
                  name="tray"
                  color={card.unread ? colors.accent : colors.textSecondary}
                  size={18}
                />
                <View style={styles.rowCopy}>
                  <UiText
                    style={[styles.summary, card.unread && styles.unread]}
                    numberOfLines={2}
                  >
                    {updatesCardTitle(card)}
                  </UiText>
                  <UiText style={styles.secondary}>{t("updates.personalCapture")}</UiText>
                  <UiText style={styles.secondary}>
                    {updatesNoticeTime(card.createdAt)}
                  </UiText>
                </View>
              </Pressable>
            ),
          }))}
          onReadControls={bindImportRead}
          onOpen={(jobId, originGeneration, destination) => {
            if (
              !active.current ||
              intent.current !== renderedIntent ||
              generation !== getAccountGeneration() ||
              originGeneration !== generation
            )
              return;
            navigateToImport(jobId, originGeneration, destination);
          }}
        />
        {loading ? (
          <UiText accessibilityLiveRegion="polite" style={styles.secondary}>
            {t("common.loading")}
          </UiText>
        ) : null}
        {failed || page?.unknownSourcesInPage ? (
          <UiText accessibilityRole="alert" style={styles.secondary}>
            {t("updates.unavailable")}
          </UiText>
        ) : null}
        {!loading && !failed && !intakeCards.length && importCount === 0 ? (
          <UiText style={styles.secondary}>
            {t(
              query
                ? "updates.emptySearch"
                : unreadOnly
                  ? "updates.emptyUnread"
                  : category === "NEEDS_ATTENTION"
                    ? "updates.emptyAttention"
                    : "updates.emptyAll",
            )}
          </UiText>
        ) : null}
        {page?.next ? (
          <UiButton
            label={t("updates.loadMore")}
            variant="text"
            disabled={loading || busy}
            onPress={() => void load(true, page.next!)}
          />
        ) : null}
        {failed ? (
          <UiButton
            label={t("updates.refresh")}
            variant="text"
            disabled={loading || busy}
            onPress={() => {
              void load();
              setRefreshKey((value) => value + 1);
            }}
          />
        ) : null}
      </ScrollView>
      <View style={styles.footer}>
        <UiButton
          label={t("updates.markAll")}
          variant="secondary"
          disabled={loading || busy || (!unread && !importUnread) || failed}
          onPress={() =>
            void operate(async (reader) => {
              await importMark.current?.();
              await reader.repository.markAllRead(filter, reader.context, {
                presentationText,
                ...(activityId ? { batchId: activityId } : {}),
                notifications: intakeCards.map(({ notificationId, materialVersion }) => ({
                  notificationId,
                  materialVersion,
                })),
              });
            })
          }
        />
      </View>
    </SafeAreaView>
  );
}
const createStyles = (c: UiColors) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.background },
    filters: { padding: visual.space.page, gap: visual.space.heading },
    categories: { gap: visual.space.heading },
    unreadControl: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      minHeight: 44,
    },
    list: { flex: 1, backgroundColor: c.background },
    content: { paddingHorizontal: visual.space.page, gap: visual.space.card },
    secondary: { ...visual.type.meta, color: c.textSecondary },
    row: {
      minHeight: 44,
      flexDirection: "row",
      alignItems: "center",
      gap: visual.space.card,
      paddingVertical: visual.space.heading,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.separator,
    },
    rowCopy: { flex: 1, gap: visual.space.heading },
    summary: { ...visual.type.row, color: c.textPrimary },
    unread: { fontWeight: visual.type.action.fontWeight },
    footer: { padding: visual.space.page },
  });
