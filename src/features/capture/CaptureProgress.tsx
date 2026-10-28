import { ScrollView, StyleSheet, View } from "react-native";
import { lazy, Suspense, useRef } from "react";
import type { CaptureJobReadModel } from "@/domain/capture/captureSubmission";
import { projectCaptureActivity } from "@/domain/capture/captureActivityProjection";
import { UiButton, UiText } from "@/ui/controls";
import { t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { useThemedStyles } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { visual } from "@/ui/visual";
import { captureActivityTime } from "./CaptureActivity";
const UniversalResults = lazy(() =>
  import("./UniversalCaptureResults").then((module) => ({
    default: module.UniversalCaptureResults,
  })),
);

export function CaptureProgress({
  model,
  readTripTargets,
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
  isCurrent,
}: {
  model: CaptureJobReadModel | null;
  readTripTargets?: () => Promise<readonly { id: string; name: string }[]>;
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
  isCurrent?: () => boolean;
}) {
  useUiLocale();
  const styles = useThemedStyles(createStyles);
  const scroll = useRef<ScrollView>(null);
  const position = useRef({ y: 0, height: 0, contentHeight: 0 });
  const page = (direction: number) => {
    const p = position.current;
    p.y = Math.max(
      0,
      Math.min(Math.max(0, p.contentHeight - p.height), p.y + direction * p.height * 0.8),
    );
    scroll.current?.scrollTo({ y: p.y, animated: false });
  };
  let activity: ReturnType<typeof projectCaptureActivity> | null = null;
  try {
    if (model) activity = projectCaptureActivity(model, accountId);
  } catch {
    error = true;
  }
  const hasUniversalReader = Boolean(isCurrent && model?.allInputsAccepted);
  const body = (
    <ScrollView
      ref={scroll}
      onLayout={({ nativeEvent }) => {
        position.current.height = nativeEvent.layout.height;
      }}
      onContentSizeChange={(_width, height) => {
        position.current.contentHeight = height;
      }}
      onScroll={({ nativeEvent }) => {
        position.current.y = nativeEvent.contentOffset.y;
      }}
      scrollEventThrottle={16}
      keyboardShouldPersistTaps="handled"
      style={styles.body}
      contentContainerStyle={styles.content}
    >
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
          {model?.processingEvents?.length || !hasUniversalReader ? (
            <UiText style={styles.secondary}>
              {t(
                model?.processingEvents?.length
                  ? "capture.processing.localValidation"
                  : "capture.processingUnavailable",
              )}
            </UiText>
          ) : null}
          {model?.localInterpretationResults?.length ? (
            <UiText style={styles.secondary}>
              {t("capture.processing.localPartial")}
            </UiText>
          ) : null}
          {model?.allInputsAccepted &&
          model.inputs?.every((item) =>
            model.processingEvents?.some(
              (event) => event.inputId === item.id && event.state === "INPUT_VALIDATED",
            ),
          ) &&
          !model.localInterpretationEvents?.length ? (
            <UiText style={styles.secondary}>
              {t(
                isCurrent
                  ? "capture.processing.localValidation"
                  : "capture.processing.waitingInterpreter",
              )}
            </UiText>
          ) : null}
          {!hasUniversalReader ? (
            <UiText style={styles.secondary}>
              {t("capture.progress.outcomesUnavailable")}
            </UiText>
          ) : null}
          {isCurrent && model?.allInputsAccepted ? (
            <Suspense
              fallback={
                <UiText style={styles.secondary}>{t("capture.jobLoading")}</UiText>
              }
            >
              <UniversalResults
                readTripTargets={readTripTargets}
                key={model.batch.batchId}
                model={model}
                isCurrent={isCurrent}
              />
            </Suspense>
          ) : null}
          <UiText accessibilityRole="header" style={styles.copy}>
            {t("capture.progress.history")}
          </UiText>
          <UiText style={styles.secondary}>
            {t(
              model?.localInterpretationEvents?.length
                ? "capture.progress.localInterpretationHistory"
                : model?.processingEvents?.length
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
      {canRetry &&
      (error ||
        model?.inputs.some(
          (input) => input.state === "FAILED" && input.failureCode === "READER_FAILURE",
        )) ? (
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
  return (
    <>
      {typeof __DEV__ !== "undefined" && __DEV__ ? (
        <View style={styles.paging}>
          <UiButton
            variant="secondary"
            label={t("capture.progress.pageUp")}
            onPress={() => page(-1)}
          />
          <UiButton
            variant="secondary"
            label={t("capture.progress.pageDown")}
            onPress={() => page(1)}
          />
        </View>
      ) : null}
      {body}
    </>
  );
}
const createStyles = (c: UiColors) =>
  StyleSheet.create({
    body: { flexShrink: 1, flexGrow: 0, backgroundColor: c.surface },
    paging: {
      flexDirection: "row",
      justifyContent: "space-between",
      paddingHorizontal: visual.space.page,
      gap: visual.space.row,
    },
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
