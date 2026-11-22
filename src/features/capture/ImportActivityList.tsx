import { useEffect, useRef, type MutableRefObject } from "react";
import { ActionSheetIOS, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { AppIcon } from "@/components/AppIcon";
import { UiButton, UiText } from "@/ui/controls";
import { UiChoiceChip } from "@/ui/forms";
import { t, formatUiDate } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { useThemedStyles, useUiTheme } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { visual } from "@/ui/visual";
import { projectImportActivityRow } from "@/data/operations/universalV3Activity";
import type { V3ActivityProgress } from "@/data/operations/universalActivityReader";
import type { UniversalTaskActivity } from "@/data/api/universalImportContracts";
import type { CaptureJobReadModel } from "@/domain/capture/captureSubmission";

const sources = ["ALL", "FILES", "PHOTOS", "TEXT"] as const;
export const showImportActivitySourceFilter = false;
const statuses = [
  "ALL",
  "PROCESSING",
  "WAITING",
  "REVIEW",
  "COMPLETED",
  "FAILED",
] as const;
export type ActivityView = {
  source: (typeof sources)[number];
  status: (typeof statuses)[number];
  offset: number;
};
export type ActivityDirectory = {
  view: MutableRefObject<{ offset: number }>;
  source: ActivityView["source"];
  status: ActivityView["status"];
  onFilter(source: ActivityView["source"], status: ActivityView["status"]): void;
  chooser: MutableRefObject<(() => void) | null>;
  collapsed: boolean;
  tripNames?: Readonly<Record<string, string>>;
  onSourceChange(source: ActivityView["source"]): void;
  onScroll(offset: number): void;
};

// This is a view over the existing reader, not a second Activity lifecycle.
export function ImportActivityList({
  jobs,
  v3,
  tasks,
  directory,
  loading,
  error,
  hasMore,
  onMore,
  onRefresh,
  onOpen,
}: {
  jobs: readonly CaptureJobReadModel[];
  v3: Readonly<Record<string, V3ActivityProgress>>;
  tasks: Readonly<Record<string, UniversalTaskActivity>>;
  directory: ActivityDirectory;
  loading: boolean;
  error: boolean;
  hasMore: boolean;
  onMore(): void;
  onRefresh(): void;
  onOpen(jobId: string): void;
}) {
  useUiLocale();
  const { view: viewRef, chooser: chooserRef } = directory;
  const colors = useUiTheme(),
    styles = useThemedStyles(createStyles);
  const { source, status } = directory;
  const scroll = useRef<ScrollView>(null);
  const restored = useRef(false);
  const choose = () =>
    ActionSheetIOS.showActionSheetWithOptions(
      {
        options: [
          ...sources.map((value) => t(`activity.source.${value}`)),
          t("common.cancel"),
        ],
        cancelButtonIndex: sources.length,
      },
      (index) => {
        const next = sources[index];
        if (!next) return;
        directory.onFilter(next, status);
        directory.onSourceChange(next);
        viewRef.current.offset = 0;
        scroll.current?.scrollTo({ y: 0, animated: false });
      },
    );
  useEffect(() => {
    chooserRef.current = choose;
    return () => {
      chooserRef.current = null;
    };
  });
  const unique = [...new Map(jobs.map((job) => [job.batch.batchId, job])).values()];
  const rows = unique
    .map((job) => ({
      job,
      fact: projectImportActivityRow(
        job,
        v3[job.batch.batchId],
        tasks[job.batch.batchId],
      ),
    }))
    .filter(
      ({ fact }) =>
        !showImportActivitySourceFilter || source === "ALL" || fact.sources.includes(source),
    );
  const visible = rows.filter(({ fact }) => status === "ALL" || fact.status === status);
  return (
    <View style={styles.body}>
      {showImportActivitySourceFilter && !directory.collapsed ? (
        <UiButton
          label={t("activity.sourceChooser", { source: t(`activity.source.${source}`) })}
          variant="text"
          onPress={choose}
        />
      ) : null}
      <ScrollView
        ref={scroll}
        style={styles.body}
        contentInsetAdjustmentBehavior="never"
        stickyHeaderIndices={[0]}
        keyboardShouldPersistTaps="handled"
        scrollEventThrottle={16}
        onContentSizeChange={() => {
          if (!restored.current && jobs.length) {
            restored.current = true;
            scroll.current?.scrollTo({
              y: viewRef.current.offset,
              animated: false,
            });
          }
        }}
        onScroll={(event) => {
          const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
          const y = Math.max(0, contentOffset.y);
          viewRef.current.offset = y;
          directory.onScroll(y);
          if (
            !loading &&
            hasMore &&
            contentSize.height - y - layoutMeasurement.height < 240
          )
            onMore();
        }}
      >
        <View style={styles.filters}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chips}
          >
            {statuses.map((value) => (
              <UiChoiceChip
                key={value}
                compact
                label={
                  value === "ALL" || value === "COMPLETED"
                    ? t(`activity.status.${value}`)
                    : t("activity.statusCount", {
                        status: t(`activity.status.${value}`),
                        count: rows.filter(({ fact }) => fact.status === value).length,
                      })
                }
                selected={status === value}
                onPress={() => {
                  directory.onFilter(source, value);
                  viewRef.current.offset = 0;
                  scroll.current?.scrollTo({ y: 0, animated: false });
                }}
              />
            ))}
          </ScrollView>
        </View>
        {loading ? (
          <UiText style={styles.message} accessibilityLiveRegion="polite">
            {t("common.loading")}
          </UiText>
        ) : null}
        {error ? (
          <UiText style={styles.message} accessibilityRole="alert">
            {t("capture.activityError")}
          </UiText>
        ) : null}
        {!loading && !error && !visible.length ? (
          <UiText style={styles.message}>{t("activity.empty")}</UiText>
        ) : null}
        {visible.map(({ job, fact }) => {
          const title =
            (job.inputs.length === 1 && job.inputs[0].originalFilename) ||
            t(
              job.counts.selected === 1
                ? "capture.progress.singleMaterialBatchTitle"
                : "capture.progress.batchTitle",
              { count: job.counts.selected },
            );
          const icon =
            fact.sources.length > 1
              ? "square.stack"
              : fact.sources[0] === "FILES"
                ? "doc.text"
                : fact.sources[0] === "PHOTOS"
                  ? "photo"
                  : "text.alignleft";
          const badge =
            fact.status === "COMPLETED"
              ? "checkmark.circle"
              : fact.status === "FAILED"
                ? "exclamationmark.circle"
                : fact.status === "REVIEW"
                  ? "questionmark.circle"
                  : fact.status === "PROCESSING"
                    ? "arrow.trianglehead.2.clockwise"
                    : "clock";
          const recordedAt = new Date(fact.at);
          const state = t(
            fact.phase === "failed"
              ? "activity.failed"
              : `capture.activityStatus.${fact.phase}`,
          );
          return (
            <Pressable
              key={fact.batchId}
              style={styles.row}
              accessibilityRole="button"
              onPress={() => onOpen(fact.jobId)}
            >
              <View style={styles.icon}>
                <AppIcon name={icon} color={colors.textSecondary} size={24} />
                <View style={styles.badge}>
                  <AppIcon name={badge} color={colors.textSecondary} size={12} />
                </View>
              </View>
              <View style={styles.copy}>
                <View style={styles.heading}>
                  <UiText style={styles.title} numberOfLines={1}>
                    {title}
                  </UiText>
                  <UiText
                    style={styles.meta}
                    accessibilityLabel={formatUiDate(recordedAt, {
                      // ui-foundation-exception: string -- complete recorded time for accessibility
                      dateStyle: "medium",
                      // ui-foundation-exception: string -- Intl recorded time precision, not visible copy
                      timeStyle: "medium",
                    })}
                  >
                    {formatUiDate(recordedAt, {
                      // ui-foundation-exception: string -- compact actual recorded time, full timestamp on Batch/accessibility
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </UiText>
                </View>
                <UiText style={styles.meta} numberOfLines={1}>
                  {t("activity.context", {
                    source: fact.sources
                      .map((value) => t(`activity.source.${value}`))
                      .join(" · "),
                    scope:
                      directory.tripNames?.[
                        job.batch.context.tripPrior?.id ?? job.assignedTripId ?? ""
                      ] ??
                      t(
                        (job.batch.context.tripPrior?.id ?? job.assignedTripId)
                          ? "activity.tripScope"
                          : "documents.searchInbox",
                      ),
                  })}
                </UiText>
                <UiText style={styles.summary}>
                  {fact.resultCount === undefined
                    ? state
                    : t("activity.outcome", { status: state, count: fact.resultCount })}
                </UiText>
              </View>
              <AppIcon name="chevron.right" color={colors.textSecondary} size={14} />
            </Pressable>
          );
        })}
        {hasMore ? (
          <UiText style={styles.footer}>{t("activity.loadedCounts")}</UiText>
        ) : null}
        {hasMore ? (
          <UiButton
            label={t("capture.activityMore")}
            disabled={loading}
            variant="text"
            onPress={onMore}
          />
        ) : null}
        {error ? (
          <UiButton
            label={t("updates.refresh")}
            disabled={loading}
            variant="text"
            onPress={onRefresh}
          />
        ) : null}
      </ScrollView>
    </View>
  );
}
const createStyles = (colors: UiColors) =>
  StyleSheet.create({
    body: { flex: 1, backgroundColor: colors.background },
    filters: { backgroundColor: colors.background },
    chips: {
      paddingHorizontal: visual.space.page,
      gap: visual.space.card,
      paddingVertical: 2,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: visual.space.page,
      paddingVertical: 8,
      gap: visual.space.card,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.separator,
      minHeight: 72,
    },
    icon: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
    badge: {
      position: "absolute",
      right: 0,
      bottom: 0,
      backgroundColor: colors.background,
      borderRadius: visual.radius.pill,
    },
    copy: { flex: 1, gap: 2 },
    heading: { flexDirection: "row", alignItems: "baseline", flexWrap: "wrap", gap: 4 },
    title: {
      flexGrow: 1,
      flexShrink: 1,
      flexBasis: 120,
      color: colors.textPrimary,
      ...visual.type.row,
    },
    meta: { color: colors.textSecondary, ...visual.type.meta },
    summary: { color: colors.textPrimary, ...visual.type.meta },
    footer: {
      paddingHorizontal: visual.space.page,
      paddingTop: visual.space.heading,
      color: colors.textSecondary,
      ...visual.type.meta,
    },
    message: {
      padding: visual.space.page,
      color: colors.textSecondary,
      ...visual.type.row,
    },
  });
