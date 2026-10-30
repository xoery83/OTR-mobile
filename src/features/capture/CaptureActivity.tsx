import type { UniversalTaskActivity } from "@/data/api/universalImportContracts";
import { getAccountGeneration } from "@/data/auth/accountGeneration";
import { CaptureCustodyDevAction } from "./CaptureCustodyDevAction";
import { useEffect, useRef, useState } from "react";
import { ScrollView, StyleSheet } from "react-native";
import {
  captureProcessingSummary,
  captureLocalInterpretationSummary,
  projectCaptureActivity,
} from "@/domain/capture/captureActivityProjection";
import type { CaptureJobReadModel } from "@/domain/capture/captureSubmission";
import { UiButton, UiSection, UiText as Text } from "@/ui/controls";
import { formatUiDate, t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { useThemedStyles } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { visual } from "@/ui/visual";
import { subscribeCaptureProcessingActivity } from "@/data/operations/captureProcessingActivity";

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
  const [taskActivities, setTaskActivities] = useState<
    Record<string, UniversalTaskActivity>
  >({});
  const [jobs, setJobs] = useState<CaptureJobReadModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const inventory = useRef(jobs);
  const activities = useRef(taskActivities);
  const accountGeneration = useRef(getAccountGeneration());
  const epoch = useRef(0);
  const active = useRef(false);
  const running = useRef(false);
  const reloadRequested = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const refresh = useRef<() => void>(() => undefined);
  const scopeCurrent = () =>
    active.current && isCurrent() && accountGeneration.current === getAccountGeneration();
  const clearPoll = () => {
    clearTimeout(timer.current);
    timer.current = undefined;
  };
  const pendingJobs = () =>
    inventory.current.filter((job) => {
      const state = activities.current[job.batch.batchId]?.state;
      return state !== undefined && ["PENDING", "WAITING", "PROCESSING"].includes(state);
    });
  const mergeActivities = (observations: Record<string, UniversalTaskActivity>) => {
    const batches = new Set(inventory.current.map((job) => job.batch.batchId));
    activities.current = Object.fromEntries(
      Object.entries({ ...activities.current, ...observations }).filter(([batchId]) =>
        batches.has(batchId),
      ),
    );
    setTaskActivities(activities.current);
  };
  const readActivities = async (
    next: readonly CaptureJobReadModel[],
    current: () => boolean,
  ) => {
    const reader = await import("@/data/operations/universalActivityReader");
    if (!current()) return;
    const observations = await reader.readDefaultUniversalActivities(
      next,
      current,
      (batchId, activity) => {
        if (current()) mergeActivities({ [batchId]: activity });
      },
    );
    // Missing/offline observations do not erase the last known state for the same Batch.
    if (current()) mergeActivities(observations);
  };
  const schedulePoll = () => {
    clearPoll();
    if (scopeCurrent() && pendingJobs().length)
      timer.current = setTimeout(() => void poll(), 5000);
  };
  const settled = () => {
    running.current = false;
    if (!scopeCurrent()) return;
    if (reloadRequested.current) {
      reloadRequested.current = false;
      refresh.current();
    } else schedulePoll();
  };
  const poll = async () => {
    timer.current = undefined;
    if (!scopeCurrent() || running.current) return;
    const pending = pendingJobs();
    if (!pending.length) return;
    running.current = true;
    const request = ++epoch.current;
    const current = () => scopeCurrent() && request === epoch.current;
    try {
      await readActivities(pending, current);
    } catch {
      /* Preserve known state offline. */
    } finally {
      if (request === epoch.current) settled();
    }
  };
  const load = async (older = false, expectedInventory = jobs) => {
    if (!scopeCurrent() || expectedInventory !== inventory.current) return;
    if (running.current) {
      if (!older) reloadRequested.current = true;
      return;
    }
    clearPoll();
    running.current = true;
    const request = ++epoch.current;
    const current = () => scopeCurrent() && request === epoch.current;
    setLoading(true);
    setError(false);
    try {
      const api = await import("@/data/operations/defaultCaptureSubmission");
      if (!current()) return;
      const last = older ? expectedInventory.at(-1)?.batch : undefined;
      const page = await api.listDefaultCaptureJobs({
        limit: pageSize,
        before: last ? { createdAt: last.createdAt, batchId: last.batchId } : undefined,
      });
      if (!current()) return;
      const next = older ? [...expectedInventory, ...page] : page;
      inventory.current = next;
      setJobs(next);
      mergeActivities({});
      setHasMore(page.length === pageSize);
      try {
        await readActivities(next, current);
      } catch {
        /* List remains available offline. */
      }
    } catch {
      if (current()) setError(true);
    } finally {
      if (request === epoch.current) {
        if (current()) setLoading(false);
        settled();
      }
    }
  };
  useEffect(() => {
    refresh.current = () => void load(false, inventory.current);
  });
  useEffect(() => {
    active.current = true;
    const unsubscribe = subscribeCaptureProcessingActivity((accountId) => {
      if (!expectedAccountId || accountId === expectedAccountId) refresh.current();
    });
    const requests = epoch;
    const setup = ++requests.current;
    void Promise.resolve().then(() => {
      if (active.current && setup === requests.current) void load();
    });
    return () => {
      active.current = false;
      clearPoll();
      reloadRequested.current = false;
      ++requests.current;
      running.current = false;
      unsubscribe();
    };
    // Host remounts on Account/context/focus changes; locale and theme keep the list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <CaptureActivityList
      isCurrent={scopeCurrent}
      expectedAccountId={expectedAccountId}
      taskActivities={taskActivities}
      jobs={jobs}
      loading={loading}
      error={error}
      hasMore={hasMore}
      onRefresh={() => void load()}
      onMore={() => void load(true)}
      onOpenJob={(id) => {
        if (scopeCurrent()) onOpenJob(id);
      }}
      onReturn={onReturn}
      onHide={onHide}
    />
  );
}

export function CaptureActivityList({
  taskActivities = {},
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
  isCurrent = () => false,
}: {
  isCurrent?: () => boolean;
  taskActivities?: Readonly<Record<string, UniversalTaskActivity>>;
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
      keyboardShouldPersistTaps="handled"
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
          {isCurrent() && taskActivities[job.batch.batchId] ? (
            <Text style={styles.secondary}>
              {t(`capture.ai.task.${taskActivities[job.batch.batchId].state}`)}
            </Text>
          ) : null}
          {captureProcessingSummary(job) ? (
            <Text style={styles.secondary}>
              {t(`capture.processing.${captureProcessingSummary(job)!}`)}
            </Text>
          ) : null}
          {captureLocalInterpretationSummary(job) ? (
            <Text style={styles.secondary}>
              {t(`capture.processing.${captureLocalInterpretationSummary(job)!}`)}
            </Text>
          ) : null}
          {job.allInputsAccepted &&
          job.inputs?.every((item) =>
            job.processingEvents?.some(
              (event) => event.inputId === item.id && event.state === "INPUT_VALIDATED",
            ),
          ) &&
          !job.localInterpretationEvents?.length ? (
            <Text style={styles.secondary}>
              {t("capture.processing.waitingInterpreter")}
            </Text>
          ) : null}
          <UiButton
            label={t("capture.jobView", {
              summary: expectedAccountId
                ? t("capture.progress.batchTitle", {
                    count: job.counts.selected,
                  })
                : captureJobTitle(job),
            })}
            variant="secondary"
            disabled={!job.availableActions.canReopen}
            onPress={() => onOpenJob(job.batch.jobId)}
          />
          <CaptureCustodyDevAction job={job} isCurrent={isCurrent} />
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
    sheetBody: {
      flexGrow: 0,
      flexShrink: 1,
      backgroundColor: colors.background,
    },
    content: { padding: visual.space.page, gap: visual.space.card },
    title: { color: colors.textPrimary, ...visual.type.row },
    secondary: { color: colors.textSecondary, ...visual.type.meta },
    error: { color: colors.destructive, ...visual.type.row },
  });
