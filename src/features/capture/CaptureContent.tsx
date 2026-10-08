import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { UiButton, UiSection } from "@/ui/controls";
import { t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { useThemedStyles } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { visual } from "@/ui/visual";
import { pickCaptureMaterial } from "@/native/capturePicker";
import type { CaptureJobReadModel } from "@/domain/capture/captureSubmission";
import type {
  createDefaultCaptureSubmissionSession,
  createDefaultCaptureRecoveryAction,
} from "@/data/operations/defaultCaptureSubmission";
import { CaptureActivity, captureJobTitle } from "./CaptureActivity";
import { createCaptureStaging, type CaptureStagingSnapshot } from "./captureStaging";

// Hosts remount on invocation-context change. Context is a prior, never assignment.
export function CaptureContent({
  isCurrent,
  tripName,
  onCancel,
  jobId,
}: {
  isCurrent: () => boolean;
  tripName?: string;
  onCancel: () => void;
  jobId?: string;
}) {
  const [{ staging, invocationTripName }] = useState(() => ({
    staging: createCaptureStaging(pickCaptureMaterial, isCurrent),
    invocationTripName: tripName,
  }));
  const snapshot = useSyncExternalStore(
    staging.subscribe,
    staging.getSnapshot,
    staging.getSnapshot,
  );
  const [model, setModel] = useState<CaptureJobReadModel | null>(null);
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [reopening, setReopening] = useState(!!jobId);
  const [activity, setActivity] = useState(false);
  const [reading, setReading] = useState(!!jobId);
  const [readError, setReadError] = useState(false);
  const readEpoch = useRef(0);
  const active = useRef(false);
  const running = useRef(false);
  const session = useRef<Promise<
    Awaited<ReturnType<typeof createDefaultCaptureSubmissionSession>>
  > | null>(null);
  const recoveryActions = useRef(
    new Map<
      string,
      Promise<Awaited<ReturnType<typeof createDefaultCaptureRecoveryAction>>>
    >(),
  );
  const current = () => active.current && isCurrent();
  const progress = (next: CaptureJobReadModel) => {
    if (current()) setModel(next);
  };
  const hide = () => {
    active.current = false;
    ++readEpoch.current;
    staging.cancel();
    onCancel();
  };
  const openJob = async (id: string) => {
    if (!current() || running.current) return;
    const request = ++readEpoch.current;
    const stillCurrent = () => current() && request === readEpoch.current;
    staging.cancel();
    session.current = null;
    recoveryActions.current.clear();
    setActivity(false);
    setModel(null);
    setReopening(true);
    setReading(true);
    setReadError(false);
    setSubmitError(false);
    try {
      const api = await import("@/data/operations/defaultCaptureSubmission");
      if (!stillCurrent()) return;
      const next = await api.reopenDefaultCaptureJob(id);
      if (stillCurrent()) setModel(next);
    } catch {
      if (stillCurrent()) setReadError(true);
    } finally {
      if (stillCurrent()) setReading(false);
    }
  };
  useEffect(() => {
    active.current = true;
    const detach = staging.attach();
    const reads = readEpoch;
    const setup = ++reads.current;
    void Promise.resolve().then(() => {
      if (jobId && active.current && setup === reads.current) void openJob(jobId);
    });
    return () => {
      active.current = false;
      ++reads.current;
      detach();
    };
    // Invocation is fixed by the host; changing it requires remount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staging]);
  const submit = async () => {
    if (!current() || running.current || snapshot.selecting || !snapshot.items.length)
      return;
    running.current = true;
    setBusy(true);
    setAttempted(true);
    setSubmitError(false);
    const selected = snapshot.items.map((item) => ({ ...item }));
    session.current ??= import("@/data/operations/defaultCaptureSubmission")
      .then((api) => api.createDefaultCaptureSubmissionSession())
      .catch((error) => {
        session.current = null;
        throw error;
      });
    try {
      const owner = await session.current;
      if (!current()) return;
      await owner.submit(selected, progress);
    } catch {
      if (current()) {
        setSubmitError(true);
        try {
          const recovered = await (await session.current!).recover();
          if (recovered) progress(recovered);
        } catch {}
      }
    } finally {
      running.current = false;
      if (current()) setBusy(false);
    }
  };
  const recover = async (inputId: string) => {
    if (
      !current() ||
      running.current ||
      reading ||
      !model ||
      !model.availableActions.reacquireInputIds.includes(inputId)
    )
      return;
    const prior = model,
      item = prior.inputs.find((i) => i.id === inputId);
    if (!item) return;
    running.current = true;
    setBusy(true);
    setSubmitError(false);
    try {
      const api = await import("@/data/operations/defaultCaptureSubmission");
      if (!current()) return;
      if (!recoveryActions.current.has(inputId)) {
        recoveryActions.current.set(
          inputId,
          api
            .createDefaultCaptureRecoveryAction(prior.batch.jobId, inputId, item.revision)
            .catch((error) => {
              recoveryActions.current.delete(inputId);
              throw error;
            }),
        );
      }
      const action = await recoveryActions.current.get(inputId)!;
      if (!current()) return;
      const result = await action.run(progress);
      recoveryActions.current.delete(inputId);
      progress(result);
    } catch {
      if (current()) {
        setSubmitError(true);
        try {
          const action = await recoveryActions.current.get(inputId);
          const recovered = await action?.recover();
          if (recovered) {
            recoveryActions.current.delete(inputId);
            progress(recovered);
          }
        } catch {}
      }
    } finally {
      running.current = false;
      if (current()) setBusy(false);
    }
  };
  if (activity)
    return (
      <CaptureActivity
        isCurrent={current}
        onOpenJob={(id) => void openJob(id)}
        onReturn={() => setActivity(false)}
        onHide={hide}
      />
    );
  return (
    <CaptureTray
      snapshot={snapshot}
      model={model}
      busy={busy || reading}
      reading={reading}
      readError={readError}
      onOpenJob={(id) => void openJob(id)}
      onActivity={() => {
        if (current() && !running.current && !reading && !snapshot.selecting) {
          ++readEpoch.current;
          setActivity(true);
        }
      }}
      locked={attempted || reopening}
      submitError={submitError}
      onSubmit={() => {
        void submit();
      }}
      onRecover={(id) => {
        void recover(id);
      }}
      onAddMore={() => {
        if (
          !current() ||
          running.current ||
          reading ||
          (model && !model.availableActions.canAddMore)
        )
          return;
        ++readEpoch.current;
        staging.cancel();
        session.current = null;
        recoveryActions.current.clear();
        setModel(null);
        setAttempted(false);
        setReopening(false);
        setSubmitError(false);
        setReadError(false);
      }}
      tripName={model || reopening ? undefined : invocationTripName}
      onFiles={() => {
        void staging.pick("files");
      }}
      onPhotos={() => {
        void staging.pick("photos");
      }}
      onRemove={staging.remove}
      onCancel={hide}
    />
  );
}

export function CaptureTray({
  snapshot,
  tripName,
  onFiles,
  onPhotos,
  onRemove,
  onCancel,
  model,
  busy = false,
  locked = false,
  submitError = false,
  onSubmit,
  onRecover,
  onAddMore,
  onActivity,
  onOpenJob,
  reading = false,
  readError = false,
}: {
  snapshot: CaptureStagingSnapshot;
  tripName?: string;
  onFiles: () => void;
  onPhotos: () => void;
  onRemove: (id: number) => void;
  onCancel: () => void;
  model?: CaptureJobReadModel | null;
  busy?: boolean;
  locked?: boolean;
  submitError?: boolean;
  onSubmit?: () => void;
  onRecover?: (inputId: string) => void;
  onAddMore?: () => void;
  onActivity?: () => void;
  onOpenJob?: (jobId: string) => void;
  reading?: boolean;
  readError?: boolean;
}) {
  const [technicalJob, setTechnicalJob] = useState<string | null>(null);
  useUiLocale();
  const styles = useThemedStyles(createStyles);
  return (
    <ScrollView style={styles.body} contentContainerStyle={styles.content}>
      {onActivity ? (
        <UiButton
          label={t("capture.activity")}
          variant="secondary"
          disabled={busy || snapshot.selecting}
          onPress={onActivity}
        />
      ) : null}
      {reading ? (
        <Text accessibilityLiveRegion="polite" style={styles.secondary}>
          {t("capture.jobLoading")}
        </Text>
      ) : null}
      {readError ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {t("capture.jobReadError")}
        </Text>
      ) : null}
      {!model && !locked ? (
        <UiSection
          title={tripName ? t("capture.context", { name: tripName }) : t("capture.title")}
        >
          <Text style={styles.secondary}>
            {t(model ? "capture.localCustody" : "capture.transient")}
          </Text>
          {tripName ? (
            <Text style={styles.secondary}>{t("capture.contextHint")}</Text>
          ) : null}
          <UiButton
            label={t("capture.files")}
            variant="secondary"
            disabled={snapshot.selecting || busy || locked}
            onPress={onFiles}
          />
          <UiButton
            label={t("capture.photos")}
            variant="secondary"
            disabled={snapshot.selecting || busy || locked}
            onPress={onPhotos}
          />
          {snapshot.selecting ? (
            <Text accessibilityLiveRegion="polite" style={styles.secondary}>
              {t("capture.selecting")}
            </Text>
          ) : null}
          {snapshot.error ? (
            <Text accessibilityRole="alert" style={styles.error}>
              {t("capture.pickerError")}
            </Text>
          ) : null}
        </UiSection>
      ) : null}
      {model ? (
        <UiSection title={captureJobTitle(model)}>
          {!model.allInputsAccepted ? (
            <Text accessibilityLiveRegion="polite" style={styles.secondary}>
              {t("capture.counts", model.counts)}
            </Text>
          ) : null}
          <Text style={styles.secondary}>{t("capture.processingUnavailable")}</Text>
          {!model.allInputsAccepted ? (
            <Text style={styles.secondary}>{t("capture.reacquireHint")}</Text>
          ) : null}
          {model.inputs.map((item) => (
            <View key={item.id} style={styles.item}>
              <Text style={styles.name}>
                {item.originalFilename ?? t("capture.unnamed")}
              </Text>
              <Text style={styles.secondary}>
                {t(
                  item.state === "ACCEPTED"
                    ? "capture.accepted"
                    : item.state === "FAILED"
                      ? "capture.failed"
                      : "capture.pending",
                )}
              </Text>
              {item.failureCode ? (
                <Text style={styles.secondary}>
                  {t(`capture.failure.${item.failureCode}`)}
                </Text>
              ) : null}
              {model.availableActions.reacquireInputIds.includes(item.id) && onRecover ? (
                <UiButton
                  label={t(
                    item.contentSha256
                      ? "capture.recoverPinned"
                      : item.acquisitionSource === "photos"
                        ? "capture.continueMissingPhoto"
                        : "capture.continueMissing",
                  )}
                  variant="secondary"
                  disabled={busy}
                  onPress={() => onRecover(item.id)}
                />
              ) : null}
              {onOpenJob && item.continuesFromJobId ? (
                <UiButton
                  label={t("capture.priorJob")}
                  variant="text"
                  disabled={busy}
                  onPress={() => onOpenJob(item.continuesFromJobId!)}
                />
              ) : null}
              {item.continuedIn.map((link) =>
                onOpenJob ? (
                  <UiButton
                    key={link.inputId}
                    label={t("capture.nextJob")}
                    variant="text"
                    disabled={busy}
                    onPress={() => onOpenJob(link.jobId)}
                  />
                ) : (
                  <Text key={link.inputId} style={styles.secondary}>
                    {t("capture.continued")}
                  </Text>
                ),
              )}
            </View>
          ))}
          <UiButton
            label={t(
              technicalJob === model.batch.jobId
                ? "capture.technicalHide"
                : "capture.technicalShow",
            )}
            variant="text"
            onPress={() =>
              setTechnicalJob(
                technicalJob === model.batch.jobId ? null : model.batch.jobId,
              )
            }
          />
          {technicalJob === model.batch.jobId ? (
            <View style={styles.item}>
              <Text selectable style={styles.secondary}>
                {t("capture.jobIdentity", { id: model.batch.jobId })}
              </Text>
              {model.inputs.some(
                (item) => item.continuesFromJobId || item.continuedIn.length,
              ) ? (
                <Text style={styles.secondary}>{t("capture.lineageHint")}</Text>
              ) : null}
            </View>
          ) : null}
        </UiSection>
      ) : (
        <UiSection
          title={t(
            snapshot.items.length === 1 ? "capture.countOne" : "capture.countOther",
            { count: snapshot.items.length },
          )}
        >
          {snapshot.items.length === 0 ? (
            <Text style={styles.secondary}>{t("capture.empty")}</Text>
          ) : null}
          {snapshot.items.map((item) => {
            const name = item.name ?? t("capture.unnamed");
            return (
              <View key={item.stagingId} style={styles.item}>
                <Text style={styles.name}>{name}</Text>
                <Text style={styles.secondary}>
                  {t(
                    item.source === "files"
                      ? "capture.sourceFiles"
                      : "capture.sourcePhotos",
                  )}
                </Text>
                <Text style={styles.secondary}>
                  {t(
                    item.availability === "unavailable"
                      ? "capture.unavailable"
                      : "capture.unverified",
                  )}
                </Text>
                <UiButton
                  label={t("capture.remove", { name })}
                  variant="text"
                  disabled={busy || locked}
                  onPress={() => onRemove(item.stagingId)}
                />
              </View>
            );
          })}
        </UiSection>
      )}
      {submitError ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {t("capture.submitError")}
        </Text>
      ) : null}
      {!model && !reading && !readError ? (
        <UiButton
          label={t(snapshot.items.length === 1 ? "capture.addOne" : "capture.addOther", {
            count: snapshot.items.length,
          })}
          disabled={
            !onSubmit || busy || snapshot.selecting || !snapshot.items.length || !!model
          }
          onPress={onSubmit ?? (() => undefined)}
        />
      ) : null}
      {model?.availableActions.canAddMore && onAddMore ? (
        <UiButton
          label={t("capture.addMore")}
          variant="primary"
          disabled={busy}
          onPress={onAddMore}
        />
      ) : null}
      <UiButton
        label={t(locked || model || busy ? "capture.hide" : "common.cancel")}
        variant="text"
        onPress={onCancel}
      />
    </ScrollView>
  );
}
const createStyles = (colors: UiColors) =>
  StyleSheet.create({
    body: { flex: 1, backgroundColor: colors.background },
    content: { padding: visual.space.page, gap: visual.space.row },
    secondary: { color: colors.textSecondary, ...visual.type.meta },
    error: { color: colors.destructive, ...visual.type.row },
    name: { color: colors.textPrimary, ...visual.type.row },
    item: {
      gap: visual.space.heading,
      paddingVertical: visual.space.heading,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.separator,
    },
  });
