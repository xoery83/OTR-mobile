import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { AppIcon } from "@/components/AppIcon";
import { getAccountGeneration } from "@/data/auth/accountGeneration";
import type { localItemImportOriginals } from "@/data/operations/localItemImportOriginals";
import type { projectCaptureActivity } from "@/domain/capture/captureActivityProjection";
import type { CaptureJobReadModel } from "@/domain/capture/captureSubmission";
import { manualItineraryTypes } from "@/features/day-feed/manualItineraryTypes";
import { UiButton, UiSection, UiText } from "@/ui/controls";
import { formatUiDate, t } from "@/ui/locale";
import type { UiColors } from "@/ui/palette";
import { useThemedStyles, useUiTheme } from "@/ui/theme";
import { visual } from "@/ui/visual";
import { captureActivityTime } from "./CaptureActivity";
import type { OpenAcceptedImportItem } from "./useUniversalP1Admission";

type Reader = Awaited<ReturnType<typeof localItemImportOriginals>>;
type Readback = Awaited<ReturnType<Reader["batchResults"]>>;
type Input = CaptureJobReadModel["inputs"][number];
type FactKind = ReturnType<
  typeof projectCaptureActivity
>["recordedFacts"][number]["kind"];

function factLabel(kind: FactKind) {
  return t(
    kind === "SUBMISSION_RECORDED"
      ? "capture.progress.registered"
      : kind === "INPUT_ACCEPTANCE_RECORDED"
        ? "capture.progress.acceptanceRecorded"
        : `capture.processing.${kind}`,
  );
}

function sourceLabel(source: Input["acquisitionSource"]) {
  if (source === "files") return t("activity.source.FILES");
  if (source === "photos" || source === "camera") return t("activity.source.PHOTOS");
  return t("activity.source.TEXT");
}

export function HistoricalImportBatchDetail({
  model,
  activity,
  isCurrent,
  tripName,
  onOpenItem,
  onOpenMaterial,
  onReview,
}: {
  model: CaptureJobReadModel;
  activity: ReturnType<typeof projectCaptureActivity>;
  isCurrent(): boolean;
  tripName?: string;
  onOpenItem?: OpenAcceptedImportItem;
  onOpenMaterial?(captureId: string, tripId?: string): void;
  onReview?(jobId: string): void;
}) {
  const tripId = model.batch.context.tripPrior?.id ?? model.assignedTripId ?? undefined;
  const [revision, setRevision] = useState(0);
  const [details, setDetails] = useState(false);
  const [request, setRequest] = useState<"loading" | "loaded" | "failed">(
    tripId ? "loading" : "loaded",
  );
  const checking = request === "loading";
  const [readback, setReadback] = useState<Readback | null>(null);
  const [retainedTripName, setRetainedTripName] = useState<string>();
  const currentRef = useRef(isCurrent);
  useLayoutEffect(() => {
    currentRef.current = isCurrent;
  }, [isCurrent]);
  const colors = useUiTheme(),
    styles = useThemedStyles(createStyles);

  useEffect(() => {
    if (!tripId || tripName) return;
    const generation = getAccountGeneration();
    let active = true;
    void import("@/data/auth/localTripAccess")
      .then(async ({ readLocalTripRepository }) =>
        (await readLocalTripRepository()).getTrip(tripId),
      )
      .then((trip) => {
        if (active && currentRef.current() && generation === getAccountGeneration())
          setRetainedTripName(trip?.name);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [tripId, tripName]);

  useEffect(() => {
    if (!tripId) return;
    const generation = getAccountGeneration();
    let active = true;
    const current = () =>
      active && currentRef.current() && generation === getAccountGeneration();
    if (!current()) return;
    setRequest("loading");
    void import("@/data/operations/localItemImportOriginals")
      .then(async ({ localItemImportOriginals }) => {
        if (!current()) return;
        const reader = await localItemImportOriginals(tripId, undefined, generation);
        if (!current()) return;
        const result = await reader.batchResults(model.batch.jobId, model.batch.batchId);
        if (current()) {
          setReadback(result);
          setRequest("loaded");
        }
      })
      .catch(() => {
        if (current()) setRequest("failed");
      });
    return () => {
      active = false;
    };
  }, [model.batch.batchId, model.batch.jobId, revision, tripId]);

  const items = readback?.items ?? [];
  const observations = Object.values(readback?.observations ?? {});
  const rejected = new Set(
    readback?.operations?.flatMap(({ candidateId, receipt }) =>
      receipt?.outcome === "REJECTED" ? [candidateId] : [],
    ),
  );
  const reviewCount =
    (readback?.planned?.needsReview ?? 0) +
    Object.entries(readback?.observations ?? {}).filter(
      ([id, value]) =>
        !rejected.has(id) &&
        (value === "REVIEW_REQUIRED" || value === "ITEM_VERIFIED_RELATION_REVIEW"),
    ).length;
  const notCreated = readback?.planned?.abstained ?? 0;
  const failures = rejected.size;
  const verifiedCount = items.filter(({ action }) => action).length;
  const status = verifiedCount
    ? "capture.history.partial"
    : checking
      ? "capture.ux.submitted"
      : request === "failed"
        ? "capture.history.resultsUnavailable"
        : readback?.state === "PROCESSING"
          ? "capture.activityStatus.analyzing"
          : reviewCount
            ? "capture.activityStatus.attention"
            : "capture.history.batchUnconfirmed";
  const sources = [
    ...new Set(model.inputs.map((input) => sourceLabel(input.acquisitionSource))),
  ];
  const materials = [
    ...new Set(model.inputs.map((input) => t(`importDocuments.format.${input.kind}`))),
  ].join(" · ");
  const steps = (
    [
      activity.counts.accepted > 0 && "capture.history.materialsRetained",
      readback?.state === "REVIEW_READY" && "capture.history.suggestionsAvailable",
      readback?.state === "PROCESSING" &&
        status !== "capture.activityStatus.analyzing" &&
        "capture.activityStatus.analyzing",
      observations.includes("PENDING") && "capture.activityStatus.applying",
      observations.includes("ITEM_VERIFIED_RELATION_PENDING") &&
        "capture.activityStatus.association",
      observations.includes("OUTCOME_UNKNOWN") &&
        verifiedCount > 0 &&
        "capture.history.someUnknown",
    ] as const
  ).filter((step) => typeof step === "string");
  const receiptTimes = [
    ...new Set(items.flatMap(({ recordedAt }) => (recordedAt ? [recordedAt] : []))),
  ].sort();

  return (
    <>
      <UiSection>
        <UiText
          style={styles.summary}
          accessibilityRole="header"
          accessibilityLiveRegion="polite"
        >
          {t(status)}
        </UiText>
        <UiText style={styles.meta}>{captureActivityTime(activity.recordedAt)}</UiText>
        <UiText style={styles.meta}>
          {[
            tripName ??
              retainedTripName ??
              t(tripId ? "capture.history.tripAssigned" : "capture.composer.unassigned"),
            ...sources,
          ].join(" · ")}
        </UiText>
        <UiText style={styles.meta}>
          {t("capture.history.materialCount", {
            count: activity.counts.selected,
            types: materials,
          })}
        </UiText>
      </UiSection>

      <UiSection
        title={
          verifiedCount
            ? t("capture.history.resultsTitle", { count: verifiedCount })
            : t("capture.ai.title")
        }
      >
        {items.map((item) => {
          const type = manualItineraryTypes.find(({ id }) => id === item.family);
          const date = item.businessDate
            ? formatUiDate(new Date(item.businessDate + "T12:00:00"))
            : undefined;
          const p1Type =
            item.eventType === "activity"
              ? "formEntry.activity"
              : item.eventType === "shopping"
                ? "category.shopping"
                : item.eventType === "meal"
                  ? "category.food"
                  : item.eventType === "note"
                    ? "fidelity.note"
                    : undefined;
          const facts = [
            p1Type && item.family === "P1" ? t(p1Type) : type && t(type.labelKey),
            date,
            item.businessTime,
            item.place,
          ]
            .filter(Boolean)
            .join(" · ");
          const action = item.action ? t(`capture.results.${item.action}`) : undefined;
          const canOpen = !!(onOpenItem && tripId && type);
          return (
            <Pressable
              key={item.itemId}
              disabled={!canOpen}
              accessibilityRole={canOpen ? "button" : undefined}
              style={styles.result}
              onPress={() => {
                if (isCurrent() && tripId)
                  onOpenItem?.({
                    tripId,
                    itemId: item.itemId,
                    family: item.family,
                    jobId: model.batch.jobId,
                  });
              }}
            >
              <AppIcon name={type?.icon ?? "doc.text"} color={colors.textSecondary} />
              <View style={styles.grow}>
                <UiText style={styles.title}>{item.title}</UiText>
                {facts ? <UiText style={styles.meta}>{facts}</UiText> : null}
                {action ? <UiText style={styles.body}>{action}</UiText> : null}
                {item.state !== "complete" ? (
                  <UiText style={styles.meta}>
                    {t(`capture.results.${item.state}`)}
                  </UiText>
                ) : null}
              </View>
              {canOpen ? (
                <AppIcon name="chevron.right" color={colors.textSecondary} size={12} />
              ) : null}
            </Pressable>
          );
        })}
        {reviewCount > 0 ? (
          <UiText style={styles.body}>
            {t("capture.results.reviewCount", { count: reviewCount })}
          </UiText>
        ) : null}
        {notCreated > 0 ? (
          <UiText style={styles.body}>
            {t("capture.history.notCreated", { count: notCreated })}
          </UiText>
        ) : null}
        {failures > 0 ? (
          <UiText style={styles.body}>
            {t("capture.history.saveFailures", { count: failures })}
          </UiText>
        ) : null}
        {!items.length && !reviewCount && !notCreated && !failures ? (
          <View style={styles.resultPlaceholder} accessibilityLiveRegion="polite">
            {request === "failed" ? (
              <UiButton
                label={t("capture.history.retryOriginal")}
                variant="text"
                onPress={() => {
                  if (!isCurrent()) return;
                  setRequest("loading");
                  setRevision((n) => n + 1);
                }}
              />
            ) : (
              <UiText style={styles.meta}>
                {t(
                  checking
                    ? "capture.history.checkingResults"
                    : "capture.history.noVerifiedResults",
                )}
              </UiText>
            )}
          </View>
        ) : null}
      </UiSection>

      <UiSection
        title={t("capture.history.materialsTitle", { count: activity.counts.selected })}
      >
        {model.inputs.map((input) => {
          const name =
            input.originalFilename ??
            t(input.kind === "TEXT" ? "capture.ai.submittedText" : "capture.unnamed");
          const label =
            input.state === "ACCEPTED"
              ? "capture.accepted"
              : input.state === "FAILED"
                ? "capture.failed"
                : "capture.pending";
          const captureId = input.state === "ACCEPTED" ? input.captureId : null;
          const canOpen = !!(captureId && onOpenMaterial);
          return (
            <Pressable
              key={input.id}
              style={styles.result}
              disabled={!canOpen}
              accessibilityRole={canOpen ? "button" : undefined}
              onPress={() => {
                if (isCurrent() && captureId) onOpenMaterial?.(captureId, tripId);
              }}
            >
              <AppIcon
                name={input.kind === "IMAGE" ? "photo" : "doc.text"}
                color={colors.textSecondary}
              />
              <View style={styles.grow}>
                <UiText style={styles.title}>{name}</UiText>
                <UiText style={styles.meta}>{t(label)}</UiText>
              </View>
              {canOpen ? (
                <AppIcon name="chevron.right" color={colors.textSecondary} size={12} />
              ) : null}
            </Pressable>
          );
        })}
      </UiSection>

      <UiSection title={t("capture.history.steps")}>
        {steps.map((step) => (
          <UiText key={step} style={styles.body}>
            {t(step)}
          </UiText>
        ))}
        {activity.recordedFacts.length || receiptTimes.length ? (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: details }}
            style={styles.result}
            onPress={() => setDetails((open) => !open)}
          >
            <UiText style={styles.meta}>{t("capture.history.processingRecord")}</UiText>
            <AppIcon
              name={details ? "chevron.down" : "chevron.right"}
              color={colors.textSecondary}
              size={12}
            />
          </Pressable>
        ) : null}
        {details ? (
          <View style={styles.processingRecord}>
            {activity.recordedFacts.map((fact) => (
              <UiText key={fact.id} style={styles.meta}>
                {factLabel(fact.kind)} · {captureActivityTime(fact.at)}
              </UiText>
            ))}
            {receiptTimes.map((at) => (
              <UiText key={at} style={styles.meta}>
                {t("capture.history.outcomeRecorded")} · {captureActivityTime(at)}
              </UiText>
            ))}
            {__DEV__ ? (
              <>
                <UiText style={styles.meta}>
                  {t("capture.history.references", {
                    batch: model.batch.batchId,
                    job: model.batch.jobId,
                  })}
                </UiText>
                {readback?.taskId ? (
                  <UiText style={styles.meta}>
                    {t("capture.history.taskReference", { task: readback.taskId })}
                  </UiText>
                ) : null}
                {readback?.operations?.map(({ command, receipt }) => (
                  <UiText key={command.operationId} style={styles.meta}>
                    {t("capture.history.operationReference", {
                      operation: command.operationId,
                    })}
                    {receipt
                      ? "\n" +
                        t("capture.history.receiptReference", {
                          receipt: receipt.receiptSha256,
                        })
                      : ""}
                  </UiText>
                ))}
              </>
            ) : null}
          </View>
        ) : null}
      </UiSection>
      {reviewCount > 0 && onReview ? (
        <UiButton
          label={t("capture.history.continueReview")}
          onPress={() => {
            if (isCurrent()) onReview(model.batch.jobId);
          }}
        />
      ) : null}
    </>
  );
}

const createStyles = (colors: UiColors) =>
  StyleSheet.create({
    body: { color: colors.textPrimary },
    title: { ...visual.type.row, color: colors.textPrimary },
    summary: {
      ...visual.type.row,
      color: colors.textPrimary,
      backgroundColor: colors.controlTrack,
      borderRadius: visual.radius.control,
      padding: visual.space.row,
    },

    meta: { ...visual.type.meta, color: colors.textSecondary },
    result: {
      flexDirection: "row",
      alignItems: "center",
      minHeight: 44,
      gap: visual.space.row,
      paddingVertical: visual.space.heading,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.separator,
    },
    grow: { flex: 1, gap: visual.space.heading },
    resultPlaceholder: { minHeight: 72, justifyContent: "center" },
    processingRecord: { gap: visual.space.heading },
  });
