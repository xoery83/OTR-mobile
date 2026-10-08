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
  useEffect(() => {
    active.current = true;
    const detach = staging.attach();
    if (jobId) {
      void import("@/data/operations/defaultCaptureSubmission")
        .then((api) => api.getDefaultCaptureSubmissionRepository())
        .then((repo) => repo.reopen(jobId))
        .then(progress)
        .catch(() => {
          if (current()) setSubmitError(true);
        });
    }
    return () => {
      active.current = false;
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
    if (!current() || running.current || !model) return;
    const prior = model,
      item = prior.inputs.find((i) => i.id === inputId)!;
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
  return (
    <CaptureTray
      snapshot={snapshot}
      model={model}
      busy={busy}
      locked={attempted || reopening}
      submitError={submitError}
      onSubmit={() => {
        void submit();
      }}
      onRecover={(id) => {
        void recover(id);
      }}
      onAddMore={() => {
        if (running.current) return;
        staging.cancel();
        session.current = null;
        recoveryActions.current.clear();
        setModel(null);
        setAttempted(false);
        setReopening(false);
        setSubmitError(false);
      }}
      tripName={invocationTripName}
      onFiles={() => {
        void staging.pick("files");
      }}
      onPhotos={() => {
        void staging.pick("photos");
      }}
      onRemove={staging.remove}
      onCancel={() => {
        staging.cancel();
        onCancel();
      }}
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
}) {
  useUiLocale();
  const styles = useThemedStyles(createStyles);
  return (
    <ScrollView style={styles.body} contentContainerStyle={styles.content}>
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
      {model ? (
        <UiSection title={t("capture.intakeTitle")}>
          <Text accessibilityLiveRegion="polite" style={styles.secondary}>
            {t("capture.counts", model.counts)}
          </Text>
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
              {item.state !== "ACCEPTED" && onRecover ? (
                <UiButton
                  label={t(
                    item.contentSha256
                      ? "capture.recoverPinned"
                      : "capture.continueMissing",
                  )}
                  variant="secondary"
                  disabled={busy}
                  onPress={() => onRecover(item.id)}
                />
              ) : null}
              {item.continuedIn.length ? (
                <Text style={styles.secondary}>{t("capture.continued")}</Text>
              ) : null}
            </View>
          ))}
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
      <UiButton
        label={t(snapshot.items.length === 1 ? "capture.addOne" : "capture.addOther", {
          count: snapshot.items.length,
        })}
        disabled={
          !onSubmit || busy || snapshot.selecting || !snapshot.items.length || !!model
        }
        onPress={onSubmit ?? (() => undefined)}
      />
      {model && onAddMore ? (
        <UiButton
          label={t("capture.addMore")}
          variant="secondary"
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
    content: { padding: visual.space.page, gap: visual.space.section },
    secondary: { color: colors.textSecondary, ...visual.type.meta },
    error: { color: colors.destructive, ...visual.type.row },
    name: { color: colors.textPrimary, ...visual.type.row },
    item: { gap: visual.space.heading },
  });
