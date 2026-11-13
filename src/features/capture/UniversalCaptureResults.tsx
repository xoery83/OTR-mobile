import { isUnsupportedUniversalInputMetadata } from "@/domain/capture/universalInputSupport";
import { UniversalP1SourceReviewForm } from "./UniversalP1SourceReviewForm";
import {
  useUniversalP1Admission,
  type P1AdmissionActions,
  type OpenAcceptedImportItem,
} from "./useUniversalP1Admission";
import { AppState, StyleSheet, View } from "react-native";
import type { CaptureJobReadModel } from "@/domain/capture/captureSubmission";
import type {
  UniversalTaskActivity,
  UniversalImportResult,
} from "@/data/api/universalImportContracts";
import { UiButton, UiSection, UiText } from "@/ui/controls";
import { t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { useThemedStyles, useUiTheme } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { visual } from "@/ui/visual";
import { useUniversalCapture } from "./useUniversalCapture";
import { useEffect, useRef, useState } from "react";
import {
  readImportSubmission,
  updateImportSubmission,
  type ImportSubmission,
} from "@/data/repositories/importSubmissionRepository";
import type { V3AdmissionRow } from "@/data/operations/universalV3Review";
import { manualItineraryTypes } from "@/features/day-feed/manualItineraryTypes";
import {
  openUniversalV3Review,
  applyUniversalV3Batch,
} from "@/data/operations/universalV3Review";
import type { UniversalV3ExecutionStatus } from "@/data/api/universalV3Contracts";
import {
  projectUniversalV3Activity,
  readV3UnknownCandidates,
  type V3SaveObservation,
  projectUniversalV3Results,
  type V3SavedResult,
  type V3ResultOperation,
} from "@/data/operations/universalV3Activity";
import { captureActivityTime } from "./CaptureActivity";
import { localImportDocumentId } from "@/domain/trip/universalImportIdentity";
import { AppIcon } from "@/components/AppIcon";

export function UniversalCaptureResults({
  model,
  isCurrent,
  readTripTargets,
  onOpenAcceptedItem,
  originalsListedElsewhere = false,
  onLegacyPhotoReview,
  onOpenReview,
  onOpenDocument,
  onReturnToTrip,
  processingDetails = false,
}: {
  model: CaptureJobReadModel;
  readTripTargets?: () => Promise<readonly { id: string; name: string }[]>;
  onOpenAcceptedItem?: OpenAcceptedImportItem;
  originalsListedElsewhere?: boolean;
  onLegacyPhotoReview?(enabled: boolean): void;
  onOpenReview?(jobId: string): void;
  onOpenDocument?(itemId: string, documentId: string): void;
  onReturnToTrip?(view: "home" | "day", tripId: string, jobId: string): void;
  processingDetails?: boolean;
  isCurrent(): boolean;
}) {
  const state = useUniversalCapture(model, isCurrent);
  const { localFirstSelected, busy, canStart, unavailable, localFirst, start } = state;
  const submittedStart = useRef(false);
  useEffect(() => {
    if (
      submittedStart.current ||
      localFirstSelected !== true ||
      busy ||
      !canStart ||
      unavailable ||
      (localFirst && localFirst.state !== "WAITING_INPUT") ||
      !model.allInputsAccepted
    )
      return;
    let active = true;
    void readImportSubmission(model)
      .then((intent) => {
        if (!active || !isCurrent() || !intent || submittedStart.current) return;
        submittedStart.current = true;
        start();
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [
    model,
    isCurrent,
    localFirstSelected,
    localFirst,
    busy,
    canStart,
    unavailable,
    start,
  ]);

  useEffect(() => {
    onLegacyPhotoReview?.(state.localFirstSelected === false);
  }, [onLegacyPhotoReview, state.localFirstSelected]);
  const admission = useUniversalP1Admission(model, isCurrent, state.result);
  if (state.localFirstSelected === null) {
    return (
      <UiSection title={t("capture.activityStatus.activity")}>
        <UiText accessibilityLiveRegion="polite">
          {t(state.unavailable ? "capture.activityStatus.waiting" : "capture.jobLoading")}
        </UiText>
        {state.unavailable ? <UiText>{t("capture.activityHint.waiting")}</UiText> : null}
        <UiButton
          label={t("capture.ai.check")}
          variant="secondary"
          disabled={state.busy}
          onPress={state.recover}
        />
      </UiSection>
    );
  }
  if (state.localFirstSelected) {
    const processing = state.localFirst?.state === "PROCESSING";
    const unknown = state.localFirst?.state === "OUTCOME_UNKNOWN";
    const result = state.localFirst?.state === "REVIEW_READY" ? state.localFirst : null;
    return (
      <>
        <UniversalV3Activity
          key={model.batch.batchId}
          model={model}
          execution={state.localFirst}
          onOpenReview={onOpenReview}
          onOpenAcceptedItem={onOpenAcceptedItem}
          onOpenDocument={onOpenDocument}
          onReturnToTrip={onReturnToTrip}
          unavailable={state.unavailable}
          formatUnavailable={state.formatUnavailable}
          isCurrent={isCurrent}
        />
        {!result || processingDetails ? (
          <UiSection title={t("capture.activityStatus.analysis")}>
            {!result && !processing && !unknown ? (
              <UiButton
                label={t("capture.ai.process")}
                disabled={state.busy || !state.canStart}
                onPress={state.start}
              />
            ) : null}
            <UiButton
              label={t("capture.ai.check")}
              variant="secondary"
              disabled={state.busy}
              onPress={state.recover}
            />
          </UiSection>
        ) : null}
      </>
    );
  }
  return (
    <UniversalResultView
      model={model}
      isCurrent={isCurrent}
      admission={admission}
      readTripTargets={readTripTargets}
      onOpenAcceptedItem={onOpenAcceptedItem}
      originalsListedElsewhere={originalsListedElsewhere}
      {...state}
    />
  );
}
// Only a retained Submit intent permits admission; historical Activity remains read-only.
export function UniversalV3Activity({
  model,
  execution,
  unavailable,
  formatUnavailable,
  isCurrent,
  onOpenReview,
  onOpenDocument,
  onReturnToTrip,
  onOpenAcceptedItem,
}: {
  model: CaptureJobReadModel;
  execution: UniversalV3ExecutionStatus | null;
  onOpenAcceptedItem?: OpenAcceptedImportItem;
  unavailable: boolean;
  formatUnavailable: boolean;
  isCurrent(): boolean;
  onOpenReview?(jobId: string): void;
  onOpenDocument?(itemId: string, documentId: string): void;
  onReturnToTrip?(view: "home" | "day", tripId: string, jobId: string): void;
  processingDetails?: boolean;
}) {
  const navigating = useRef(false);
  const [intent, setIntent] = useState<ImportSubmission | null>(null);
  const [rows, setRows] = useState<V3AdmissionRow[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [savedResults, setSavedResults] = useState<V3SavedResult[]>([]);
  const [resultOperations, setResultOperations] = useState<V3ResultOperation[]>([]);
  const result = execution?.state === "REVIEW_READY" ? execution : null;
  const [review, setReview] =
    useState<Awaited<ReturnType<typeof openUniversalV3Review>>>();
  const [observations, setObservations] = useState<Record<string, V3SaveObservation>>({});
  const [readUnavailable, setReadUnavailable] = useState(false);
  const [revision, setRevision] = useState(0);
  const latest = useRef(isCurrent);
  useEffect(() => {
    latest.current = isCurrent;
  }, [isCurrent]);
  useEffect(() => {
    if (!result?.candidates.length) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let running = false;
    const current = () => active && latest.current();
    const read = async () => {
      if (
        !current() ||
        running ||
        AppState.currentState === "background" ||
        AppState.currentState === "inactive"
      )
        return;
      running = true;
      try {
        const unknown = await readV3UnknownCandidates(
          model,
          result.candidates.map((c) => c.candidateId),
        );
        if (!current()) return;
        const submitted = await readImportSubmission(model);
        if (!current()) return;
        setIntent(submitted);
        const owner = await openUniversalV3Review(model, submitted ? "IMPORT" : "MANUAL");
        if (!current()) return;
        setReview(owner);
        const plan = owner.batch(result.candidates);
        if (!current()) return;
        setRows(plan);
        const next = await applyUniversalV3Batch(model, owner, plan, submitted, unknown);
        if (!current()) return;
        setReview(owner);
        const facts = await owner.resultOperations(
          plan.map(
            (row) =>
              submitted?.resolutions[row.candidate.candidateId]?.candidate ??
              row.candidate,
          ),
        );
        if (!current()) return;
        setSavedResults(
          projectUniversalV3Results(facts.snapshot, facts.operations, next),
        );
        setResultOperations(facts.operations);
        setObservations(next);
        setReadUnavailable(false);
        if (
          Object.values(next).some(
            (s) =>
              s === "PENDING" ||
              s === "ITEM_VERIFIED_RELATION_PENDING" ||
              s === "OUTCOME_UNKNOWN",
          )
        )
          timer = setTimeout(() => void read(), 5000);
      } catch {
        if (current()) {
          setReadUnavailable(true);
          timer = setTimeout(() => void read(), 5000);
        }
      } finally {
        running = false;
      }
    };
    void read();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        clearTimeout(timer);
        void read();
      }
    });
    return () => {
      active = false;
      clearTimeout(timer);
      subscription.remove();
    };
    // Batch identity is fenced by the owning sheet key. Reopening reads original IDs only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result?.taskId, revision]);
  const displayRows = rows.filter((row) => row.disposition !== "ABSTAIN");
  const progress = projectUniversalV3Activity(
    result && rows.length
      ? { ...result, candidates: displayRows.map((row) => row.candidate) }
      : execution,
    observations,
    unavailable || readUnavailable,
    formatUnavailable,
  );
  const progressState =
    progress.state === "confirmation" &&
    (intent?.confirmed ||
      displayRows.every(
        (row) =>
          row.disposition === "REVIEW" && !intent?.resolutions[row.candidate.candidateId],
      ))
      ? "attention"
      : progress.state;
  const semanticReview =
    progressState === "attention" &&
    rows.some(
      (row) =>
        row.disposition === "REVIEW" &&
        observations[row.candidate.candidateId] === "UNCONFIRMED",
    );
  return (
    <UiSection title={t("capture.activityStatus.activity")}>
      <UiText>{t("capture.activityStatus.local")}</UiText>
      <UiText accessibilityRole="header" accessibilityLiveRegion="polite">
        {t(
          semanticReview
            ? "capture.admission.needsReview"
            : `capture.activityStatus.${progressState}`,
        )}
      </UiText>
      <UiText>
        {t(
          semanticReview
            ? "capture.admission.reviewHint"
            : intent && progressState === "confirmation"
              ? "capture.admission.confirmationHint"
              : `capture.activityHint.${progressState}`,
        )}
      </UiText>
      {result && progress.state !== "checking" ? (
        <>
          {savedResults.length
            ? (["created", "linked", "updated"] as const).map((action) => {
                const objects = savedResults.filter((item) => item.action === action);
                return objects.length ? (
                  <UiSection
                    key={action}
                    title={t("capture.results.group", {
                      label: t(`capture.results.${action}`),
                      count: objects.length,
                    })}
                  >
                    {objects.map((item) => (
                      <View key={item.itemId}>
                        <UiButton
                          variant="text"
                          label={item.title}
                          disabled={!onOpenAcceptedItem}
                          onPress={() => {
                            if (isCurrent())
                              onOpenAcceptedItem?.({
                                tripId:
                                  model.batch.context.tripPrior?.id ??
                                  model.assignedTripId!,
                                itemId: item.itemId,
                                family: item.family,
                                jobId: model.batch.jobId,
                              });
                          }}
                        />
                        <UiText>
                          {t(
                            manualItineraryTypes.find((type) => type.id === item.family)
                              ?.labelKey ?? "capture.results.item",
                          )}
                        </UiText>
                        {item.recordedAt ? (
                          <UiText>{captureActivityTime(item.recordedAt)}</UiText>
                        ) : null}
                        {item.state !== "complete" ? (
                          <UiText>{t(`capture.results.${item.state}`)}</UiText>
                        ) : null}
                        {onOpenDocument
                          ? model.inputs
                              .filter(
                                (file) =>
                                  file.captureId &&
                                  file.contentSha256 &&
                                  item.documentIds.includes(
                                    localImportDocumentId(
                                      model.batch.accountId,
                                      model.batch.context.tripPrior?.id ??
                                        model.assignedTripId!,
                                      file.contentSha256,
                                    ),
                                  ),
                              )
                              .map((file) => (
                                <UiButton
                                  key={file.id}
                                  variant="text"
                                  label={t("capture.results.document", {
                                    name:
                                      file.originalFilename ??
                                      t("capture.ai.submittedText"),
                                  })}
                                  onPress={() => {
                                    if (isCurrent())
                                      onOpenDocument(
                                        item.itemId,
                                        localImportDocumentId(
                                          model.batch.accountId,
                                          model.batch.context.tripPrior?.id ??
                                            model.assignedTripId!,
                                          file.contentSha256!,
                                        ),
                                      );
                                  }}
                                />
                              ))
                          : null}
                      </View>
                    ))}
                  </UiSection>
                ) : null;
              })
            : null}
          {savedResults
            .filter((item) => !item.action)
            .map((item) => (
              <UiText key={item.itemId}>
                {t("capture.results.pendingItem", {
                  title: item.title,
                  state: t(`capture.results.${item.state}`),
                })}
              </UiText>
            ))}
          {!savedResults.some((item) => item.action) ? (
            <UiText>{t("capture.results.noNew")}</UiText>
          ) : null}
          {resultOperations.some((row) => row.receipt?.outcome === "REJECTED") ? (
            <UiText>{t("capture.results.failed")}</UiText>
          ) : null}
          {rows.some((row) => row.disposition === "ABSTAIN") ? (
            <UiText>
              {t("capture.results.notCreated", {
                count: rows.filter((row) => row.disposition === "ABSTAIN").length,
              })}
            </UiText>
          ) : null}
        </>
      ) : null}
      {readUnavailable ? (
        <UiButton
          label={t("capture.ai.check")}
          variant="secondary"
          onPress={() => setRevision((n) => n + 1)}
        />
      ) : null}

      {intent &&
      !intent.confirmed &&
      rows.some(
        (row) => row.decision || intent.resolutions[row.candidate.candidateId],
      ) ? (
        <UiButton
          label={t("capture.admission.confirmBatch")}
          disabled={confirming || !review}
          onPress={() => {
            if (confirming || !isCurrent()) return;
            setConfirming(true);
            void updateImportSubmission(model, (record) => ({
              ...record,
              confirmed: true,
            }))
              .then((record) => {
                if (isCurrent()) {
                  setIntent(record);
                  setRevision((n) => n + 1);
                }
              })
              .catch(() => {
                if (isCurrent()) setReadUnavailable(true);
              })
              .finally(() => {
                if (isCurrent()) setConfirming(false);
              });
          }}
        />
      ) : null}
      {onOpenReview &&
      rows.some(
        (row) =>
          (row.disposition === "REVIEW" &&
            !intent?.resolutions[row.candidate.candidateId] &&
            observations[row.candidate.candidateId] !== "VERIFIED") ||
          observations[row.candidate.candidateId] === "REVIEW_REQUIRED" ||
          observations[row.candidate.candidateId] === "ITEM_VERIFIED_RELATION_REVIEW",
      ) ? (
        <UiButton
          label={t("capture.results.reviewCount", {
            count: rows.filter(
              (row) =>
                (row.disposition === "REVIEW" &&
                  !intent?.resolutions[row.candidate.candidateId] &&
                  observations[row.candidate.candidateId] !== "VERIFIED") ||
                observations[row.candidate.candidateId] === "REVIEW_REQUIRED" ||
                observations[row.candidate.candidateId] ===
                  "ITEM_VERIFIED_RELATION_REVIEW",
            ).length,
          })}
          variant="secondary"
          onPress={() => {
            if (navigating.current || !isCurrent()) return;
            navigating.current = true;
            onOpenReview(model.batch.jobId);
          }}
        />
      ) : null}
      {onReturnToTrip && result ? (
        <View>
          <UiButton
            variant="secondary"
            label={t("capture.results.day")}
            onPress={() => {
              if (isCurrent())
                onReturnToTrip(
                  "day",
                  model.batch.context.tripPrior?.id ?? model.assignedTripId!,
                  model.batch.jobId,
                );
            }}
          />
          <UiButton
            variant="text"
            label={t("capture.results.home")}
            onPress={() => {
              if (isCurrent())
                onReturnToTrip(
                  "home",
                  model.batch.context.tripPrior?.id ?? model.assignedTripId!,
                  model.batch.jobId,
                );
            }}
          />
        </View>
      ) : null}
    </UiSection>
  );
}

export function UniversalResultView({
  model,
  readTripTargets,
  onOpenAcceptedItem,
  result,
  busy,
  unavailable,
  photoReviewRequired = false,
  canStart,
  canStartDuringRead = false,
  isCurrent,
  start,
  recover,
  admission,
  queued = false,
  activity,
  originalsListedElsewhere = false,
}: {
  model: CaptureJobReadModel;
  readTripTargets?: () => Promise<readonly { id: string; name: string }[]>;
  onOpenAcceptedItem?: OpenAcceptedImportItem;
  result: UniversalImportResult | null;
  busy: boolean;
  unavailable: boolean;
  photoReviewRequired?: boolean;
  attempted: boolean;
  canStart: boolean;
  canStartDuringRead?: boolean;
  isCurrent(): boolean;
  start(): void;
  recover(): void;
  admission?: P1AdmissionActions;
  queued?: boolean;
  activity?: UniversalTaskActivity | null;
  originalsListedElsewhere?: boolean;
}) {
  useUiLocale();
  const s = useThemedStyles(styles);
  const colors = useUiTheme();
  const sourceName = (alias: string) => {
    const binding = result?.sourceBindings.find((b) => b.alias === alias);
    const input = model.inputs.find((i) => i.id === binding?.inputId);
    if (!input) return t("capture.ai.batchNote");
    return (
      input?.originalFilename ??
      t(input?.kind === "TEXT" ? "capture.ai.submittedText" : "capture.unnamed")
    );
  };
  const unprocessed = result
    ? model.inputs.filter(
        (input) => !result.sourceBindings.some((b) => b.inputId === input.id),
      )
    : model.inputs.filter(isUnsupportedUniversalInputMetadata);
  const ready = model.allInputsAccepted && !!model.batch.context.tripPrior;
  return (
    <UiSection title={t("capture.ai.title")}>
      <UiText style={s.meta}>{t("capture.ai.previewOnly")}</UiText>
      {activity ? (
        <UiText accessibilityLiveRegion="polite" style={s.meta}>
          {t(`capture.ai.task.${activity.state}`)}
        </UiText>
      ) : queued ? (
        <UiText style={s.meta}>{t("capture.ai.queued")}</UiText>
      ) : null}
      {unprocessed.length && (result || !originalsListedElsewhere) ? (
        <View style={s.group}>
          <UiText style={s.heading}>
            {result
              ? t("capture.ai.retainedUnprocessedTitle", { count: unprocessed.length })
              : t("capture.ai.originals")}
          </UiText>
          {result ? (
            <UiText style={s.meta}>
              {t("capture.ai.retainedUnprocessedDescription")}
            </UiText>
          ) : null}
          {unprocessed.map((input) => (
            <UiText key={input.id} style={s.copy}>
              {input.originalFilename ?? t("capture.unnamed")}
            </UiText>
          ))}
        </View>
      ) : null}
      {result ? (
        <>
          {!originalsListedElsewhere ? (
            <>
              <UiText style={s.heading}>{t("capture.ai.originals")}</UiText>
              {model.inputs
                .filter((input) =>
                  result.sourceBindings.some((b) => b.inputId === input.id),
                )
                .map((input) => {
                  const binding = result.sourceBindings.find(
                    (b) => b.inputId === input.id,
                  )!;
                  return (
                    <View key={input.id} style={s.source}>
                      <AppIcon
                        name={
                          binding.mime.startsWith("image/")
                            ? "photo"
                            : binding.pdfSource || binding.mime === "application/pdf"
                              ? "doc.richtext"
                              : "doc.text"
                        }
                        color={colors.textSecondary}
                      />
                      <UiText style={[s.copy, s.filename]}>
                        {sourceName(binding.alias)}
                      </UiText>
                    </View>
                  );
                })}
            </>
          ) : null}
          <UiText style={s.meta}>
            {t(
              result.providerOutcome === "LOCAL_FIXTURE"
                ? "capture.ai.fixture"
                : result.status === "EXECUTION_OUTCOME_UNKNOWN"
                  ? "capture.ai.unknown"
                  : "capture.ai.suggestionsStatus",
            )}
          </UiText>
          {result.candidates.map((candidate) => (
            <View key={candidate.token} style={s.group}>
              <UiText style={s.heading}>
                {candidate.fields.find((f) =>
                  [
                    "activity.name",
                    "property.name",
                    "title",
                    "flight_number",
                    "service",
                    "service.number",
                    "rental.company",
                    "agency.name",
                  ].includes(f.path),
                )?.raw ??
                  t(
                    manualItineraryTypes.find((type) => type.id === candidate.kind)!
                      .labelKey,
                  )}
              </UiText>
              <UiText style={s.meta}>
                {t(
                  admission?.statuses[candidate.token] === "SERVER_ACCEPTED"
                    ? "capture.ai.p1Accepted"
                    : candidate.presentationTier === "HIGH_CONFIDENCE"
                      ? "capture.ai.high"
                      : candidate.presentationTier === "INCOMPLETE"
                        ? "capture.ai.incomplete"
                        : candidate.presentationTier === "ABSTAIN"
                          ? "capture.ai.abstain"
                          : "capture.ai.reviewable",
                )}
              </UiText>
              {onOpenAcceptedItem &&
              admission?.statuses[candidate.token] === "SERVER_ACCEPTED" &&
              admission.acceptedItems?.[candidate.token]?.taskId === result.taskId ? (
                <UiButton
                  label={t("tripHome.preparation.day")}
                  variant="secondary"
                  disabled={busy || !isCurrent()}
                  onPress={() => {
                    const accepted = admission.acceptedItems?.[candidate.token];
                    if (!busy && isCurrent() && accepted?.taskId === result.taskId)
                      onOpenAcceptedItem({
                        tripId: result.tripId,
                        itemId: accepted.itemId,
                        family: candidate.kind,
                      });
                  }}
                />
              ) : null}
              {candidate.fields.map((field, index) => (
                <View key={`${field.path}:${index}`}>
                  <UiText style={s.copy}>{field.raw}</UiText>
                  <UiText style={s.meta}>
                    {t("capture.ai.evidence", { source: sourceName(field.sourceId) })}
                  </UiText>
                </View>
              ))}
              {candidate.readiness?.missing.length ? (
                <UiText style={s.meta}>{t("capture.ai.missingFacts")}</UiText>
              ) : null}
              {admission?.enabled &&
              result.providerOutcome === "SETTLED" &&
              result.status === "CANDIDATES_READY" &&
              (admission.enabledFamilies ?? ["P1"]).some(
                (family) => family === candidate.kind,
              ) &&
              ["HIGH_CONFIDENCE", "REVIEWABLE"].includes(
                result.quality?.decisions.find((d) => d.token === candidate.token)
                  ?.tier ?? "",
              ) ? (
                <>
                  <UiText style={s.meta}>
                    {t(
                      candidate.kind === "P2"
                        ? "capture.ai.p2Details"
                        : candidate.kind === "P3"
                          ? "capture.ai.p3Details"
                          : candidate.kind === "P4"
                            ? "capture.ai.p4Details"
                            : candidate.kind === "P5"
                              ? "capture.ai.p5Details"
                              : candidate.kind === "P6"
                                ? "capture.ai.p6Details"
                                : "capture.ai.p1Details",
                    )}
                  </UiText>
                  {admission.statuses[candidate.token] &&
                  admission.statuses[candidate.token] !== "SERVER_ACCEPTED" ? (
                    <UiText style={s.meta}>
                      {t(
                        admission.statuses[candidate.token] === "SYNC_PENDING"
                          ? "capture.ai.p1Pending"
                          : admission.statuses[candidate.token] ===
                              "OWNING_ADMISSION_PENDING"
                            ? "capture.ai.p1Blocked"
                            : "capture.ai.p1Unavailable",
                      )}
                    </UiText>
                  ) : null}
                  <UniversalP1SourceReviewForm
                    key={`${result.taskId}:${candidate.token}`}
                    result={result}
                    candidate={candidate}
                    readTripTargets={readTripTargets}
                    disabled={busy || admission.busyToken !== null || !isCurrent()}
                    confirmationUnavailable={
                      admission.statuses[candidate.token] === "UNAVAILABLE"
                    }
                    complete={admission.completed?.[candidate.token] === true}
                    isCurrent={isCurrent}
                    readOriginal={() => admission.readOriginal(result, candidate.token)}
                    onConfirm={(review) =>
                      void admission.confirm(result, candidate.token, review)
                    }
                  />
                </>
              ) : null}
            </View>
          ))}
          {result.bookingObservations.map((b) => (
            <View key={b.token} style={s.group}>
              <UiText style={s.heading}>{t("capture.ai.booking")}</UiText>
              <UiText style={s.copy}>{b.supplier.raw}</UiText>
              <UiText style={s.meta}>
                {t("capture.ai.evidence", { source: sourceName(b.supplier.sourceId) })}
              </UiText>
              <UiText style={s.copy}>{b.reference.raw}</UiText>
              <UiText style={s.meta}>
                {t("capture.ai.evidence", { source: sourceName(b.reference.sourceId) })}
              </UiText>
              {b.fields.map((field, index) => (
                <View key={`${field.path}:${index}`}>
                  <UiText style={s.copy}>{field.raw}</UiText>
                  <UiText style={s.meta}>
                    {t("capture.ai.evidence", { source: sourceName(field.sourceId) })}
                  </UiText>
                </View>
              ))}
            </View>
          ))}
          {result.ticketObservations.map((ticket) => (
            <View key={ticket.token} style={s.group}>
              <UiText style={s.heading}>{ticket.label.raw}</UiText>
              <UiText style={s.meta}>{t("capture.ai.ticketObservation")}</UiText>
              <UiText style={s.meta}>
                {t("capture.ai.evidence", { source: sourceName(ticket.label.sourceId) })}
              </UiText>
            </View>
          ))}
          {result.sourceObservations.length ? (
            <>
              <UiText style={s.heading}>{t("capture.ai.sourceDetails")}</UiText>
              <UiText style={s.meta}>{t("capture.ai.observationsOnly")}</UiText>
              {result.sourceObservations.map((value, index) => {
                const observation = observationView(value, result);
                if (!observation) return null;
                return (
                  <View key={index} style={s.group}>
                    {observation.labels?.map((label) => (
                      <UiText key={label} style={s.copy}>
                        {t(classificationKeys[label])}
                      </UiText>
                    ))}
                    {observation.label ? (
                      <UiText style={s.copy}>{observation.label}</UiText>
                    ) : null}
                    <UiText style={s.copy}>{observation.raw}</UiText>
                    <UiText style={s.meta}>
                      {t("capture.ai.evidence", {
                        source: sourceName(observation.alias),
                      })}
                    </UiText>
                  </View>
                );
              })}
              <UiText style={s.meta}>{t("capture.ai.additionalRetained")}</UiText>
            </>
          ) : null}
          {result.quality?.decisions
            .filter((d) => d.tier === "ABSTAIN")
            .map((decision) => (
              <View key={decision.token} style={s.group}>
                <UiText style={s.heading}>{t("capture.ai.abstain")}</UiText>
                {decision.reasons.map((reason, index) => (
                  <UiText key={index} style={s.copy}>
                    {reasonCopy(reason)}
                  </UiText>
                ))}
                {decision.sourceIds.map((alias) => (
                  <UiText key={alias} style={s.meta}>
                    {sourceName(alias)}
                  </UiText>
                ))}
              </View>
            ))}
          {result.unresolved.length ? (
            <UiText style={s.meta}>{t("capture.ai.unresolved")}</UiText>
          ) : null}
          {result.unresolved
            .filter(
              (item, index, items) =>
                items.findIndex(
                  (other) =>
                    other.sourceId === item.sourceId && other.reason === item.reason,
                ) === index,
            )
            .map((item, index) => (
              <View key={index} style={s.group}>
                <UiText style={s.copy}>{reasonCopy(item.reason)}</UiText>
                <UiText style={s.meta}>{sourceName(item.sourceId)}</UiText>
              </View>
            ))}
          {result.status !== "EXECUTION_OUTCOME_UNKNOWN" &&
          result.candidates.length === 0 ? (
            <UiText style={s.copy}>{t("capture.ai.noCandidates")}</UiText>
          ) : null}
        </>
      ) : null}
      {photoReviewRequired ? (
        <UiText accessibilityRole="alert" style={s.copy}>
          {t("capture.ai.photoReviewRequired")}
        </UiText>
      ) : null}
      {unavailable ? <UiText style={s.meta}>{t("capture.ai.unavailable")}</UiText> : null}
      {!ready ? <UiText style={s.meta}>{t("capture.ai.needsContext")}</UiText> : null}
      {busy ? (
        <UiText accessibilityLiveRegion="polite" style={s.copy}>
          {t("capture.ai.processing")}
        </UiText>
      ) : null}
      {!result && canStart ? (
        <UiButton
          label={t("capture.ai.process")}
          disabled={(busy && !canStartDuringRead) || !ready}
          onPress={start}
        />
      ) : null}
      <UiButton
        label={t("capture.ai.check")}
        variant="secondary"
        disabled={busy || !ready}
        onPress={recover}
      />
    </UiSection>
  );
}
const styles = (c: UiColors) =>
  StyleSheet.create({
    group: { gap: visual.space.heading, paddingVertical: visual.space.card },
    source: { flexDirection: "row", alignItems: "center", gap: visual.space.heading },
    filename: { flex: 1 },
    heading: { ...visual.type.section, color: c.textPrimary },
    copy: { ...visual.type.row, color: c.textPrimary },
    meta: { ...visual.type.meta, color: c.textSecondary },
  });
function reasonCopy(reason: string) {
  if (/^VISUAL_CANDIDATE_UNVERIFIED(?::|$)/.test(reason))
    return t("capture.ai.evidenceInsufficient");
  if (/LIFECYCLE|amendment target|cancellation notice/i.test(reason))
    return t("capture.ai.lifecycleUnknown");
  if (/TICKET|RIGHTS|ENTITLEMENT/.test(reason)) return t("capture.ai.ticketObservation");
  if (/BOOKING_OBSERVATION_WITHHELD/.test(reason)) return t("capture.ai.bookingWithheld");
  if (/UNCONFIRMED|TRAVEL_IDEA/.test(reason)) return t("capture.ai.unconfirmed");
  if (
    /EVIDENCE|VALIDATION|SCHEMA|UNSUPPORTED|MISSING/.test(reason) ||
    /^[A-Z][A-Z0-9_:-]+$/.test(reason)
  )
    return t("capture.ai.evidenceInsufficient");
  return reason;
}
const classificationKeys = {
  TICKET: "capture.ai.contentTicket",
  BOOKING_CONFIRMATION: "capture.ai.contentBooking",
  INVOICE: "capture.ai.contentInvoice",
  ITINERARY: "capture.ai.contentItinerary",
  AMENDMENT_NOTICE: "capture.ai.contentAmendment",
  UNKNOWN: "capture.ai.contentUnknown",
} as const;
function observationView(value: unknown, result: UniversalImportResult) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const e = record.evidence;
  if (!e || typeof e !== "object" || Array.isArray(e)) return null;
  const evidence = e as Record<string, unknown>;
  const binding = result.sourceBindings.find(
    (b) =>
      b.alias === evidence.alias &&
      b.sourceId === evidence.sourceId &&
      b.representationId === evidence.representationId &&
      b.revision === evidence.revision &&
      b.originalSha256 === evidence.originalSha256,
  );
  if (!binding || typeof evidence.raw !== "string") return null;
  if (
    record.type === "DOCUMENT_CLASSIFICATION" &&
    record.authority === "ADVISORY_ONLY" &&
    Array.isArray(record.labels) &&
    record.labels.every(
      (label) => typeof label === "string" && Object.hasOwn(classificationKeys, label),
    )
  )
    return {
      alias: binding.alias,
      raw: evidence.raw,
      labels: record.labels as (keyof typeof classificationKeys)[],
      label: null,
    };
  if (
    record.type === "OPTIONAL_SOURCE_FIELD" &&
    record.authority === "SOURCE_OBSERVATION_ONLY"
  ) {
    const label = record.label as Record<string, unknown> | null;
    return {
      alias: binding.alias,
      raw: evidence.raw,
      labels: null,
      label: label && typeof label.raw === "string" ? label.raw : null,
    };
  }
  if (record.type === "SAME_FIELD_SUPPORT" && record.authority === "ADVISORY_ONLY")
    return { alias: binding.alias, raw: evidence.raw, labels: null, label: null };
  return null;
}
