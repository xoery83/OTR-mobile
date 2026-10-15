import { ScrollView, StyleSheet, View } from "react-native";
import type { CaptureJobReadModel } from "@/domain/capture/captureSubmission";
import { projectCaptureActivity } from "@/domain/capture/captureActivityProjection";
import { UiButton, UiText } from "@/ui/controls";
import { t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { useThemedStyles } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { visual } from "@/ui/visual";
import { captureActivityTime } from "./CaptureActivity";

export function CaptureProgress({
  model,
  accountId,
  busy,
  reading,
  error,
  canRetry,
  onRetry,
  onRecover,
  onOpenJob,
  onActivity,
  onNewImport,
}: {
  model: CaptureJobReadModel | null;
  accountId: string;
  busy: boolean;
  reading: boolean;
  error: boolean;
  canRetry: boolean;
  onRetry: () => void;
  onRecover: (id: string) => void;
  onOpenJob: (id: string) => void;
  onActivity: () => void;
  onNewImport: () => void;
}) {
  useUiLocale();
  const styles = useThemedStyles(createStyles);
  let activity: ReturnType<typeof projectCaptureActivity> | null = null;
  try {
    if (model) activity = projectCaptureActivity(model, accountId);
  } catch {
    error = true;
  }
  return (
    <ScrollView style={styles.body} contentContainerStyle={styles.content}>
      <UiText style={styles.secondary}>{t("capture.progress.closeHint")}</UiText>
      {reading || busy ? (
        <UiText accessibilityLiveRegion="polite" style={styles.copy}>
          {t(reading ? "capture.jobLoading" : "capture.progress.saving")}
        </UiText>
      ) : null}
      {error ? (
        <UiText accessibilityRole="alert" style={styles.error}>
          {t("capture.jobReadError")}
        </UiText>
      ) : null}
      {activity ? (
        <>
          <UiText style={styles.copy}>{captureActivityTime(activity.recordedAt)}</UiText>
          {/* Current normal C3 load verifies each accepted payload/binding; the history selector alone does not. */}
          <UiText style={styles.copy}>
            {t(
              error || reading
                ? "capture.progress.recordedCounts"
                : "capture.progress.localCounts",
              activity.counts,
            )}
          </UiText>
          <UiText style={styles.secondary}>{t("capture.progress.noCloud")}</UiText>
          <UiText style={styles.secondary}>
            {t(
              model?.processingEvents?.length
                ? "capture.processing.localValidation"
                : "capture.processingUnavailable",
            )}
          </UiText>
          {model?.allInputsAccepted &&
          model.inputs?.every((item) =>
            model.processingEvents?.some(
              (event) => event.inputId === item.id && event.state === "INPUT_VALIDATED",
            ),
          ) ? (
            <UiText style={styles.secondary}>
              {t("capture.processing.waitingInterpreter")}
            </UiText>
          ) : null}
          <UiText style={styles.secondary}>
            {t("capture.progress.outcomesUnavailable")}
          </UiText>
          <UiText accessibilityRole="header" style={styles.copy}>
            {t("capture.progress.history")}
          </UiText>
          <UiText style={styles.secondary}>
            {t(
              model?.processingEvents?.length
                ? "capture.progress.localValidationHistory"
                : "capture.progress.partialHistory",
            )}
          </UiText>
          {activity.recordedFacts.map((fact) => (
            <View key={fact.id} style={styles.fact}>
              <UiText style={styles.copy}>
                {t(
                  fact.kind === "SUBMISSION_RECORDED"
                    ? "capture.progress.registered"
                    : fact.kind === "INPUT_ACCEPTANCE_RECORDED"
                      ? "capture.progress.acceptanceRecorded"
                      : `capture.processing.${fact.kind}`,
                )}
              </UiText>
              <UiText style={styles.secondary}>{captureActivityTime(fact.at)}</UiText>
            </View>
          ))}
          {activity.currentInputs.map((item) => (
            <View key={item.inputId} style={styles.fact}>
              <UiText style={styles.copy}>
                {item.originalFilename ?? t("capture.unnamed")}
              </UiText>
              <UiText style={styles.secondary}>
                {t(
                  item.state === "ACCEPTED"
                    ? "capture.accepted"
                    : item.state === "FAILED"
                      ? "capture.failed"
                      : "capture.pending",
                )}
              </UiText>
              {item.failureCode ? (
                <UiText style={styles.secondary}>
                  {t(`capture.failure.${item.failureCode}`)}
                </UiText>
              ) : null}
              {activity.recoveryInputIds.includes(item.inputId) ? (
                <UiButton
                  label={t(
                    model?.inputs.find((input) => input.id === item.inputId)
                      ?.contentSha256
                      ? "capture.recoverPinned"
                      : model?.inputs.find((input) => input.id === item.inputId)
                            ?.acquisitionSource === "photos"
                        ? "capture.continueMissingPhoto"
                        : "capture.continueMissing",
                  )}
                  variant="secondary"
                  disabled={busy || reading}
                  onPress={() => onRecover(item.inputId)}
                />
              ) : null}
              {item.continuesFromJobId ? (
                <UiButton
                  label={t("capture.priorJob")}
                  variant="text"
                  disabled={busy || reading}
                  onPress={() => onOpenJob(item.continuesFromJobId!)}
                />
              ) : null}
              {item.continuedIn.map((link) => (
                <UiButton
                  key={link.inputId}
                  label={t("capture.nextJob")}
                  variant="text"
                  disabled={busy || reading}
                  onPress={() => onOpenJob(link.jobId)}
                />
              ))}
            </View>
          ))}
        </>
      ) : null}
      {error && canRetry ? (
        <UiButton
          label={t("capture.progress.retryIntake")}
          disabled={busy || reading}
          onPress={onRetry}
        />
      ) : null}
      <UiButton
        label={t("capture.progress.activeImports")}
        variant="secondary"
        disabled={busy || reading}
        onPress={onActivity}
      />
      <UiButton
        label={t("capture.progress.newImport")}
        disabled={busy || reading}
        onPress={onNewImport}
      />
    </ScrollView>
  );
}
const createStyles = (c: UiColors) =>
  StyleSheet.create({
    body: { flexShrink: 1, flexGrow: 0, backgroundColor: c.surface },
    content: { padding: visual.space.page, gap: visual.space.row },
    copy: { ...visual.type.row, color: c.textPrimary },
    secondary: { ...visual.type.meta, color: c.textSecondary },
    error: { ...visual.type.row, color: c.destructive },
    fact: {
      gap: visual.space.heading,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.separator,
      paddingVertical: visual.space.heading,
    },
  });
