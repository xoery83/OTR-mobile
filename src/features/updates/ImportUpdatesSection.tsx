import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useFocusEffect } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";
import { AppIcon } from "@/components/AppIcon";
import { useThemedStyles, useUiTheme } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { visual } from "@/ui/visual";
import { getAccountGeneration } from "@/data/auth/accountGeneration";
import type { AccountRequestContext } from "@/data/auth/accountRequestContext";
import {
  readDefaultUniversalImportUpdates,
  reopenDefaultUniversalImportUpdate,
  type UniversalImportUpdate,
  markDefaultUniversalImportUpdateRead,
  importUpdateReadVersion,
} from "@/data/operations/universalImportUpdates";
import type { UpdatesFilter } from "@/domain/updates/updatesInbox";
import type { CaptureJobReadModel } from "@/domain/capture/captureSubmission";
import { UiButton, UiText } from "@/ui/controls";
import { formatUiDate, t } from "@/ui/locale";

export function ImportUpdatesSection({
  filter,
  generation,
  onOpen,
  batchId,
  jobId,
  onActivity,
  onReadControls,
  otherRows = [],
  refreshKey = 0,
}: {
  otherRows?: readonly {
    batchId: string;
    at: string;
    content: ReactNode;
    attention?: boolean;
  }[];
  refreshKey?: number;
  filter: UpdatesFilter;
  generation: number;
  onOpen(jobId: string, originGeneration: number, destination?: "REVIEW"): void;
  batchId?: string;
  jobId?: string;
  onActivity?(): void;
  onReadControls?(count: number, mark: () => Promise<void>, total: number | null): void;
}) {
  const styles = useThemedStyles(createStyles),
    colors = useUiTheme();
  const visible = filter.category !== "MESSAGES";
  const scope = `${generation}:${filter.currentTripId ?? "ACCOUNT"}:${batchId ?? "ALL"}`;
  const [seen, setSeen] = useState<Record<string, string>>({});
  const [observed, setObserved] = useState<{
    scope: string;
    cards: UniversalImportUpdate[];
    localJobs: readonly CaptureJobReadModel[];
    context: AccountRequestContext;
  } | null>(null);
  const [loading, setLoading] = useState(false),
    [failed, setFailed] = useState(false),
    [busy, setBusy] = useState(false),
    [refresh, setRefresh] = useState(0);
  const active = useRef(false),
    epoch = useRef(0),
    opening = useRef<number | null>(null);
  const current = (ticket: number) =>
    active.current && epoch.current === ticket && generation === getAccountGeneration();
  useFocusEffect(
    useCallback(() => {
      active.current = true;
      const ticket = ++epoch.current;
      setBusy(false);
      if (visible) {
        setObserved(null);
        setLoading(true);
        setFailed(false);
        void readDefaultUniversalImportUpdates(
          filter.currentTripId,
          () => current(ticket),
          (cards, context) => {
            if (current(ticket))
              setObserved((previous) => ({
                scope,
                cards,
                context,
                localJobs: previous?.scope === scope ? previous.localJobs : [],
              }));
          },
          (localJobs, context) => {
            if (current(ticket)) setObserved({ scope, cards: [], localJobs, context });
          },
          batchId && jobId ? { batchId, jobId } : undefined,
        )
          .catch(() => {
            if (current(ticket)) setFailed(true);
          })
          .finally(() => {
            if (current(ticket)) setLoading(false);
          });
      }
      return () => {
        active.current = false;
        epoch.current++;
        opening.current = null;
      };
      // Query/unread presentation never starts extra remote work per keystroke.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [visible, filter.currentTripId, generation, refresh, batchId, jobId, refreshKey]),
  );
  const loaded = observed?.scope === scope ? observed : null;
  const open = async (
    card: Pick<UniversalImportUpdate, "accountId" | "batchId" | "jobId" | "attention"> & {
      tripId: string | null;
    },
    notice?: UniversalImportUpdate,
  ) => {
    if (!loaded || opening.current === epoch.current || !current(epoch.current)) return;
    const ticket = epoch.current;
    opening.current = ticket;
    setBusy(true);
    try {
      const job = await reopenDefaultUniversalImportUpdate(loaded.context, card);
      if (notice && current(ticket)) {
        try {
          await markDefaultUniversalImportUpdateRead(loaded.context, notice);
          if (current(ticket))
            setSeen((value) => ({
              ...value,
              [`${scope}:${notice.id}`]: importUpdateReadVersion(notice),
            }));
        } catch {
          if (current(ticket)) setFailed(true);
        }
      }
      if (current(ticket))
        onOpen(
          job.batch.jobId,
          loaded.context.generation,
          "attention" in card && card.attention === "REVIEW" ? "REVIEW" : undefined,
        );
    } catch {
      if (current(ticket)) setFailed(true);
    } finally {
      if (opening.current === ticket) opening.current = null;
      if (current(ticket)) setBusy(false);
    }
  };
  const label = (card: UniversalImportUpdate) =>
    card.activity
      ? t(
          card.attention === "FAILURE"
            ? "activity.failed"
            : `capture.activityStatus.${card.activity.state}`,
        )
      : card.savedItemCount
        ? t("updates.importSaved", { count: card.savedItemCount })
        : t(`capture.ai.task.${card.state}`);
  const query = filter.query.trim().toLocaleLowerCase();
  const localTitle = (job: CaptureJobReadModel) =>
    (job.batch.inputs?.length === 1 && job.batch.inputs[0].originalFilename) ||
    t(
      job.counts.selected === 1
        ? "capture.progress.singleMaterialBatchTitle"
        : "capture.progress.batchTitle",
      { count: job.counts.selected },
    );
  const localJobs =
    loaded?.localJobs.filter(
      (job) =>
        filter.category !== "NEEDS_ATTENTION" &&
        !filter.unreadOnly &&
        job.allInputsAccepted &&
        (!batchId || job.batch.batchId === batchId) &&
        !loaded.cards.some((card) => card.batchId === job.batch.batchId) &&
        localTitle(job).toLocaleLowerCase().includes(query),
    ) ?? [];
  const unread = (card: UniversalImportUpdate) =>
    card.unread !== false &&
    seen[`${scope}:${card.id}`] !== importUpdateReadVersion(card);
  const cards =
    loaded?.cards.filter(
      (card) =>
        (!batchId || card.batchId === batchId) &&
        (filter.category !== "NEEDS_ATTENTION" || !!card.attention) &&
        (!filter.unreadOnly || unread(card)) &&
        `${t("updates.importActivity")} ${label(card)} ${card.sourceDisplayName ?? ""} ${card.submittedText ? t("capture.ai.submittedText") : ""}`
          .toLocaleLowerCase()
          .includes(query),
    ) ?? [];
  const mark = async (selected: readonly UniversalImportUpdate[]) => {
    if (!visible || !loaded || !current(epoch.current)) return;
    const ticket = epoch.current;
    for (const card of selected) {
      if (!current(ticket)) return;
      await markDefaultUniversalImportUpdateRead(loaded.context, card);
      if (current(ticket))
        setSeen((value) => ({
          ...value,
          [`${scope}:${card.id}`]: importUpdateReadVersion(card),
        }));
    }
  };
  useEffect(() => {
    onReadControls?.(
      visible ? cards.filter(unread).length : 0,
      () => mark(cards.filter(unread)),
      !visible ? 0 : loading || failed ? null : cards.length + localJobs.length,
    );
  });
  if (!visible) return null;
  const rows = new Map<string, { at: string; content: ReactNode }>(
    otherRows.map((row) => [row.batchId, row]),
  );
  for (const job of localJobs) {
    const tripId = job.batch.context.tripPrior?.id ?? job.assignedTripId ?? null;
    rows.set(job.batch.batchId, {
      at: job.batch.createdAt,
      content: (
        <ImportUpdateRow
          title={localTitle(job)}
          summary={t("capture.progress.registered")}
          at={job.batch.createdAt}
          isUnread={false}
          onPress={() => {
            void open({
              accountId: job.batch.accountId,
              tripId,
              batchId: job.batch.batchId,
              jobId: job.batch.jobId,
            });
          }}
          disabled={busy || !job.availableActions.canReopen}
        />
      ),
    });
  }
  for (const card of cards) {
    const at = card.submittedAt ?? card.updatedAt;
    rows.set(card.batchId ?? card.id, {
      at,
      content: (
        <ImportUpdateRow
          title={
            card.sourceDisplayName ??
            (card.submittedText
              ? t("capture.ai.submittedText")
              : t("updates.importActivity"))
          }
          summary={
            card.savedItemCount === undefined
              ? label(card)
              : t("updates.importOutcome", {
                  status: label(card),
                  count: card.savedItemCount,
                })
          }
          at={at}
          isUnread={unread(card)}
          onPress={() => void open(card, card)}
          disabled={busy}
        />
      ),
    });
  }
  // A currently actionable intake issue retains its own recovery authority.
  for (const item of otherRows) if (item.attention) rows.set(item.batchId, item);
  return (
    <View>
      {loading && !loaded ? (
        <UiText style={styles.message} accessibilityLiveRegion="polite">
          {t("common.loading")}
        </UiText>
      ) : null}
      {failed ? (
        <View>
          <UiText style={styles.message} accessibilityRole="alert">
            {t("updates.unavailable")}
          </UiText>
          <UiButton
            label={t("updates.refresh")}
            variant="text"
            disabled={busy || loading}
            onPress={() => setRefresh((value) => value + 1)}
          />
        </View>
      ) : null}
      {[...rows.entries()]
        .sort(
          ([a, x], [b, y]) => Date.parse(y.at) - Date.parse(x.at) || a.localeCompare(b),
        )
        .map(([id, value]) => (
          <View key={id}>{value.content}</View>
        ))}
      {onActivity ? (
        <View style={styles.history}>
          <UiText style={styles.meta}>{t("updates.localHistory")}</UiText>
          <Pressable
            accessibilityRole="button"
            onPress={onActivity}
            style={styles.historyLink}
          >
            <UiText style={styles.action}>{t("documents.activityTab")}</UiText>
            <AppIcon name="chevron.right" size={12} color={colors.accent} />
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}
function ImportUpdateRow({
  title,
  summary,
  at,
  isUnread,
  onPress,
  disabled,
}: {
  title: string;
  summary: string;
  at: string;
  isUnread: boolean;
  onPress(): void;
  disabled: boolean;
}) {
  const styles = useThemedStyles(createStyles),
    colors = useUiTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={styles.row}
    >
      <View style={styles.icon}>
        <AppIcon name="doc.text" color={colors.textSecondary} size={20} />
        {isUnread ? <View style={styles.dot} /> : null}
      </View>
      <View style={styles.copy}>
        <UiText numberOfLines={2} style={[styles.title, isUnread && styles.unread]}>
          {title}
        </UiText>
        <UiText style={styles.summary}>{summary}</UiText>
        <UiText style={styles.meta}>
          {formatUiDate(new Date(at), {
            // ui-foundation-exception: string -- Intl persisted notification creation time
            dateStyle: "medium",
            // ui-foundation-exception: string -- Intl precision includes recorded seconds
            timeStyle: "medium",
          })}
        </UiText>
      </View>
      <AppIcon name="chevron.right" size={14} color={colors.textSecondary} />
    </Pressable>
  );
}
const createStyles = (c: UiColors) =>
  StyleSheet.create({
    row: {
      minHeight: 72,
      flexDirection: "row",
      alignItems: "center",
      gap: visual.space.card,
      paddingVertical: visual.space.row,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.separator,
    },
    icon: { width: 28, minHeight: 28, alignItems: "center", justifyContent: "center" },
    dot: {
      position: "absolute",
      width: 6,
      height: 6,
      borderRadius: visual.radius.pill,
      backgroundColor: c.accent,
      right: 0,
      top: 0,
    },
    copy: { flex: 1, gap: 3 },
    title: { ...visual.type.row, fontWeight: "400", color: c.textPrimary },
    unread: { fontWeight: visual.type.row.fontWeight },
    summary: { ...visual.type.meta, color: c.textPrimary },
    meta: { ...visual.type.meta, color: c.textSecondary },
    message: {
      ...visual.type.meta,
      color: c.textSecondary,
      paddingVertical: visual.space.card,
    },
    history: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      flexWrap: "wrap",
      gap: visual.space.heading,
      paddingVertical: visual.space.heading,
    },
    historyLink: {
      minHeight: 44,
      flexDirection: "row",
      alignItems: "center",
      gap: visual.space.heading,
    },
    action: { ...visual.type.action, color: c.accent },
  });
