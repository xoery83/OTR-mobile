import { useEffect, useRef, useState } from "react";
import { ScrollView, StyleSheet } from "react-native";
import { projectCaptureActivity } from "@/domain/capture/captureActivityProjection";
import type { CaptureJobReadModel } from "@/domain/capture/captureSubmission";
import { UiButton, UiSection, UiText as Text } from "@/ui/controls";
import { formatUiDate, t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { useThemedStyles } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { visual } from "@/ui/visual";

export const captureActivityTime = (at: string) =>
  formatUiDate(new Date(at), {
    // ui-foundation-exception: string -- Intl dateStyle, not visible copy
    dateStyle: "medium",
    // ui-foundation-exception: string -- Intl timeStyle includes stored seconds
    timeStyle: "medium",
  });

export function captureJobTitle(job: CaptureJobReadModel) {
  const count = job.allInputsAccepted
    ? job.counts.accepted
    : job.counts.failed + job.counts.pending;
  return t(
    job.allInputsAccepted
      ? count === 1
        ? "capture.savedOne"
        : "capture.savedOther"
      : count === 1
        ? "capture.unsavedOne"
        : "capture.unsavedOther",
    { count },
  );
}

const pageSize = 20;
// Account admission/focus belongs to the host. Experience may mount this same seam.
export function CaptureActivity({
  isCurrent,
  onOpenJob,
  onReturn,
  onHide,
  expectedAccountId,
}: {
  isCurrent: () => boolean;
  onOpenJob: (jobId: string) => void;
  onReturn: () => void;
  onHide: () => void;
  expectedAccountId?: string;
}) {
  const [jobs, setJobs] = useState<CaptureJobReadModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const epoch = useRef(0);
  const active = useRef(false);
  const running = useRef(false);
  const load = async (older = false) => {
    if (!active.current || !isCurrent() || running.current) return;
    running.current = true;
    const request = ++epoch.current;
    const current = () => active.current && request === epoch.current && isCurrent();
    setLoading(true);
    setError(false);
    try {
      const api = await import("@/data/operations/defaultCaptureSubmission");
      if (!current()) return;
      const last = older ? jobs.at(-1)?.batch : undefined;
      const page = await api.listDefaultCaptureJobs({
        limit: pageSize,
        before: last ? { createdAt: last.createdAt, batchId: last.batchId } : undefined,
      });
      if (!current()) return;
      setJobs(older ? [...jobs, ...page] : page);
      setHasMore(page.length === pageSize);
    } catch {
      if (current()) setError(true);
    } finally {
      if (request === epoch.current) {
        running.current = false;
        if (current()) setLoading(false);
      }
    }
  };
  useEffect(() => {
    active.current = true;
    const requests = epoch;
    const setup = ++requests.current;
    void Promise.resolve().then(() => {
      if (active.current && setup === requests.current) void load();
    });
    return () => {
      active.current = false;
      ++requests.current;
      running.current = false;
    };
    // Host remounts on Account/context/focus changes; locale and theme keep the list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <CaptureActivityList
      expectedAccountId={expectedAccountId}
      jobs={jobs}
      loading={loading}
      error={error}
      hasMore={hasMore}
      onRefresh={() => void load()}
      onMore={() => void load(true)}
      onOpenJob={(id) => {
        if (active.current && isCurrent()) onOpenJob(id);
      }}
      onReturn={onReturn}
      onHide={onHide}
    />
  );
}

export function CaptureActivityList({
  jobs,
  loading,
  error,
  hasMore,
  onRefresh,
  onMore,
  onOpenJob,
  onReturn,
  onHide,
  expectedAccountId,
}: {
  jobs: readonly CaptureJobReadModel[];
  loading: boolean;
  error: boolean;
  hasMore: boolean;
  onRefresh: () => void;
  onMore: () => void;
  onOpenJob: (jobId: string) => void;
  onReturn: () => void;
  onHide: () => void;
  expectedAccountId?: string;
}) {
  useUiLocale();
  const styles = useThemedStyles(createStyles);
  const visibleJobs = expectedAccountId
    ? jobs.filter((job) => {
        try {
          projectCaptureActivity(job, expectedAccountId);
          return true;
        } catch {
          return false;
        }
      })
    : jobs;
  const scopedError = error || visibleJobs.length !== jobs.length;
  return (
    <ScrollView
      style={expectedAccountId ? styles.sheetBody : styles.body}
      contentContainerStyle={styles.content}
    >
      <UiSection
        title={t(
          expectedAccountId ? "capture.progress.activeImports" : "capture.activity",
        )}
      >
        <Text style={styles.secondary}>
          {t(
            expectedAccountId ? "capture.progress.accountScope" : "capture.activityHint",
          )}
        </Text>
        <UiButton
          label={t("capture.activityRefresh")}
          variant="text"
          disabled={loading}
          onPress={onRefresh}
        />
        {loading ? (
          <Text accessibilityLiveRegion="polite" style={styles.secondary}>
            {t("capture.activityLoading")}
          </Text>
        ) : null}
        {scopedError ? (
          <Text accessibilityRole="alert" style={styles.error}>
            {t("capture.activityError")}
          </Text>
        ) : null}
        {!loading && !scopedError && !visibleJobs.length ? (
          <Text style={styles.secondary}>{t("capture.activityEmpty")}</Text>
        ) : null}
      </UiSection>
      {visibleJobs.map((job) => (
        <UiSection key={job.batch.jobId}>
          <Text accessibilityRole="header" style={styles.title}>
            {expectedAccountId
              ? t("capture.progress.batchTitle", { count: job.counts.selected })
              : captureJobTitle(job)}
          </Text>
          <Text style={styles.secondary}>{captureActivityTime(job.batch.createdAt)}</Text>
          {!job.allInputsAccepted ? (
            <Text style={styles.secondary}>
              {t(
                expectedAccountId && (loading || scopedError)
                  ? "capture.progress.recordedCounts"
                  : "capture.counts",
                job.counts,
              )}
            </Text>
          ) : null}
          {job.inputs?.some((item) => item.continuesFromJobId) ? (
            <Text style={styles.secondary}>{t("capture.continuedSelection")}</Text>
          ) : null}
          <UiButton
            label={t("capture.jobView", {
              summary:
                expectedAccountId && (loading || scopedError)
                  ? t("capture.progress.batchTitle", { count: job.counts.selected })
                  : captureJobTitle(job),
            })}
            variant="secondary"
            disabled={!job.availableActions.canReopen}
            onPress={() => onOpenJob(job.batch.jobId)}
          />
        </UiSection>
      ))}
      {hasMore ? (
        <UiButton
          label={t("capture.activityMore")}
          variant="secondary"
          disabled={loading}
          onPress={onMore}
        />
      ) : null}
      <UiButton
        label={t("capture.activityReturn")}
        variant="secondary"
        onPress={onReturn}
      />
      <UiButton label={t("capture.hide")} variant="text" onPress={onHide} />
    </ScrollView>
  );
}
const createStyles = (colors: UiColors) =>
  StyleSheet.create({
    body: { flex: 1, backgroundColor: colors.background },
    // The Composer measures intrinsic content under its existing cap; flex:1 collapses an unbounded child.
    sheetBody: { flexGrow: 0, flexShrink: 1, backgroundColor: colors.background },
    content: { padding: visual.space.page, gap: visual.space.card },
    title: { color: colors.textPrimary, ...visual.type.row },
    secondary: { color: colors.textSecondary, ...visual.type.meta },
    error: { color: colors.destructive, ...visual.type.row },
  });
