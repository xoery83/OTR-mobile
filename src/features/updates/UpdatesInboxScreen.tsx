import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";
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

export function UpdatesInboxScreen() {
  const generation = useSyncExternalStore(
    subscribeAccountGeneration,
    getAccountGeneration,
  );
  return <UpdatesInboxContent key={generation} generation={generation} />;
}
function UpdatesInboxContent({ generation }: { generation: number }) {
  const locale = useUiLocale();
  const styles = useThemedStyles(createStyles),
    colors = useUiTheme();
  const { workingTrip } = useTripView();
  const [category, setCategory] = useState<UpdatesFilter["category"]>("ALL");
  const [unreadOnly, setUnreadOnly] = useState(false),
    [query, setQuery] = useState("");
  const filter = useMemo<UpdatesFilter>(
    () => ({
      category,
      unreadOnly,
      query,
      currentTripId: workingTrip?.generation === generation ? workingTrip.tripId : null,
    }),
    [category, unreadOnly, query, workingTrip, generation],
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
      router.push({
        pathname: "/capture",
        params: {
          jobId: target.job.batch.jobId,
          origin: "UPDATES",
          originGeneration: String(reader.context.generation),
        },
      });
    });
  const unread =
    page?.cards.filter((card) => card.unread && card.sourceState !== "UNAVAILABLE")
      .length ?? 0;
  return (
    <SafeAreaView edges={["bottom", "left", "right"]} style={styles.root}>
      <View style={styles.filters}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categories}
        >
          {categories.map((value) => (
            <UiChoiceChip
              key={value}
              label={t(`updates.category.${value}`)}
              selected={category === value}
              onPress={() => setCategory(value)}
            />
          ))}
        </ScrollView>
        <UiChoiceChip
          label={t("updates.unreadOnly")}
          selected={unreadOnly}
          onPress={() => setUnreadOnly((value) => !value)}
        />
        <UiTextInput
          accessibilityLabel={t("updates.search")}
          placeholder={t("updates.search")}
          value={query}
          onChangeText={setQuery}
          maxLength={200}
          autoCapitalize="none"
        />
      </View>
      <ScrollView
        style={styles.list}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <UiText style={styles.secondary}>{t("updates.coverage")}</UiText>
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
        {!loading && !failed && !page?.cards.length ? (
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
        {page?.cards.map((card) => (
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
        ))}
        {page?.next ? (
          <UiButton
            label={t("updates.loadMore")}
            variant="text"
            disabled={loading || busy}
            onPress={() => void load(true, page.next!)}
          />
        ) : null}
        <UiButton
          label={t("updates.refresh")}
          variant="text"
          disabled={loading || busy}
          onPress={() => void load()}
        />
      </ScrollView>
      <View style={styles.footer}>
        <UiButton
          label={t("updates.markAll")}
          variant="secondary"
          disabled={loading || busy || !unread || failed}
          onPress={() =>
            void operate(async (reader) => {
              await reader.repository.markAllRead(filter, reader.context, {
                presentationText,
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
