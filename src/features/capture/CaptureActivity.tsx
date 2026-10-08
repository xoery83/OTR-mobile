import { useEffect, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text } from "react-native";
import type { CaptureJobReadModel } from "@/domain/capture/captureSubmission";
import { UiButton, UiSection } from "@/ui/controls";
import { formatUiDate, t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { useThemedStyles } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { visual } from "@/ui/visual";

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
}: {
  isCurrent: () => boolean;
  onOpenJob: (jobId: string) => void;
  onReturn: () => void;
  onHide: () => void;
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
}) {
  useUiLocale();
  const styles = useThemedStyles(createStyles);
  return (
    <ScrollView style={styles.body} contentContainerStyle={styles.content}>
      <UiSection title={t("capture.activity")}>
        <Text style={styles.secondary}>{t("capture.activityHint")}</Text>
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
        {error ? (
          <Text accessibilityRole="alert" style={styles.error}>
            {t("capture.activityError")}
          </Text>
        ) : null}
        {!loading && !error && !jobs.length ? (
          <Text style={styles.secondary}>{t("capture.activityEmpty")}</Text>
        ) : null}
      </UiSection>
      {jobs.map((job) => (
        <UiSection key={job.batch.jobId}>
          <Text accessibilityRole="header" style={styles.title}>
            {captureJobTitle(job)}
          </Text>
          <Text style={styles.secondary}>
            {formatUiDate(new Date(job.batch.createdAt), {
              // ui-foundation-exception: string -- Intl dateStyle option, not user-facing copy
              dateStyle: "medium",
              // ui-foundation-exception: string -- Intl timeStyle option, not user-facing copy
              timeStyle: "short",
            })}
          </Text>
          {!job.allInputsAccepted ? (
            <Text style={styles.secondary}>{t("capture.counts", job.counts)}</Text>
          ) : null}
          {job.inputs?.some((item) => item.continuesFromJobId) ? (
            <Text style={styles.secondary}>{t("capture.continuedSelection")}</Text>
          ) : null}
          <UiButton
            label={t("capture.jobView", { summary: captureJobTitle(job) })}
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
    content: { padding: visual.space.page, gap: visual.space.card },
    title: { color: colors.textPrimary, ...visual.type.row },
    secondary: { color: colors.textSecondary, ...visual.type.meta },
    error: { color: colors.destructive, ...visual.type.row },
  });
