import { useState, type ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { AppIcon } from "@/components/AppIcon";
import { UiButton, UiText } from "@/ui/controls";
import { t, formatUiDate } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { useThemedStyles, useUiTheme } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { visual } from "@/ui/visual";
import { manualItineraryTypes } from "@/features/day-feed/manualItineraryTypes";
import type { CaptureJobReadModel } from "@/domain/capture/captureSubmission";
import type {
  V3ResultOperation,
  V3SavedResult,
} from "@/data/operations/universalV3Activity";
import { localImportDocumentId } from "@/domain/trip/universalImportIdentity";
import { captureActivityTime } from "./CaptureActivity";
import type { OpenAcceptedImportItem } from "./useUniversalP1Admission";

// View only: every result, clock and operation is supplied by the existing owning read.
export function UniversalV3ResultPresentation({
  model,
  resultReady,
  state,
  results,
  operations,
  reviewCount,
  abstainCount,
  onOpenItem,
  onOpenDocument,
  onReview,
  onDay,
  onDone,
  onReconcile,
  onHistoryChange,
  isCurrent,
  children,
}: {
  model: CaptureJobReadModel;
  resultReady: boolean;
  state: ReturnType<
    typeof import("@/data/operations/universalV3Activity").projectUniversalV3Activity
  >["state"];
  results: readonly V3SavedResult[];
  operations: readonly V3ResultOperation[];
  reviewCount: number;
  abstainCount: number;
  onOpenItem?: OpenAcceptedImportItem;
  onOpenDocument?(itemId: string, documentId: string): void;
  onReview?(): void;
  onDay?(): void;
  onDone?(): void;
  onReconcile(): void;
  onHistoryChange?(open: boolean): void;
  isCurrent(): boolean;
  children?: ReactNode;
}) {
  useUiLocale();
  const styles = useThemedStyles(createStyles),
    colors = useUiTheme();
  const [history, setHistory] = useState(false),
    [recovery, setRecovery] = useState(false);
  const tripId = model.batch.context.tripPrior?.id ?? model.assignedTripId;
  const saved = results.filter((item) => item.action);
  const failed = operations.filter((row) => row.receipt?.outcome === "REJECTED");
  const accepted = model.inputs.filter(
    (file) => file.state === "ACCEPTED" && file.acceptedAt,
  );
  const lastAcceptance = accepted
    .map((file) => file.acceptedAt!)
    .sort()
    .at(-1);
  const lastReceipt = results
    .map((item) => item.recordedAt)
    .filter((at): at is string => !!at)
    .sort()
    .at(-1);
  const showTimeline = !resultReady || history;
  const uncertain =
    state === "uncertain" || results.some((item) => item.state === "unknown");
  return (
    <View style={styles.body}>
      <UiText style={styles.meta}>{captureActivityTime(model.batch.createdAt)}</UiText>
      <View
        style={[
          styles.summary,
          {
            backgroundColor: uncertain
              ? colors.infoSurface
              : reviewCount || failed.length
                ? colors.warningSurface
                : colors.accentSurface,
          },
        ]}
      >
        <AppIcon
          name={
            uncertain
              ? "clock"
              : reviewCount || failed.length
                ? "exclamationmark.circle"
                : resultReady && state === "complete"
                  ? "checkmark.circle"
                  : "clock"
          }
          color={colors.textPrimary}
          size={22}
        />
        <View style={styles.grow}>
          <UiText
            style={styles.title}
            accessibilityRole="header"
            accessibilityLiveRegion="polite"
          >
            {t(
              resultReady && reviewCount
                ? "capture.ux.finishedReview"
                : `capture.activityStatus.${state}`,
              { count: reviewCount },
            )}
          </UiText>
          {resultReady ? (
            <View style={styles.tags}>
              {(["created", "linked", "updated"] as const).map((action) => {
                const count = saved.filter((item) => item.action === action).length;
                return count ? (
                  <UiText key={action} style={styles.meta}>
                    {t("capture.results.group", {
                      label: t(`capture.results.${action}`),
                      count,
                    })}
                  </UiText>
                ) : null;
              })}
            </View>
          ) : (
            <UiText style={styles.meta}>{t("capture.progress.closeHint")}</UiText>
          )}
        </View>
      </View>
      {showTimeline ? (
        <View style={styles.timeline}>
          <TimelineRow label={t("capture.ux.submitted")} at={model.batch.createdAt} />
          {lastAcceptance ? (
            <TimelineRow
              label={t("capture.ux.originalsSaved", { count: accepted.length })}
              at={lastAcceptance}
            />
          ) : null}
          {resultReady ? <TimelineRow label={t("capture.ux.recognitionReady")} /> : null}
          {lastReceipt ? (
            <TimelineRow label={t("capture.ux.savedResults")} at={lastReceipt} />
          ) : null}
          {!resultReady ? (
            <TimelineRow label={t(`capture.activityStatus.${state}`)} current />
          ) : null}
        </View>
      ) : null}
      {resultReady ? (
        <>
          {saved.length ? (
            <>
              <View style={styles.tags}>
                {manualItineraryTypes.flatMap((type) => {
                  const count = saved.filter((item) => item.family === type.id).length;
                  return count
                    ? [
                        <View key={type.id} style={styles.tag}>
                          <UiText style={styles.meta}>
                            {t("capture.results.group", {
                              label: t(type.labelKey),
                              count,
                            })}
                          </UiText>
                        </View>,
                      ]
                    : [];
                })}
              </View>
              <UiText style={styles.section} accessibilityRole="header">
                {t("capture.ux.savedResults")}
              </UiText>
            </>
          ) : (
            <UiText style={styles.meta}>{t("capture.results.noNew")}</UiText>
          )}
          {results.map((item) => {
            const type = manualItineraryTypes.find((type) => type.id === item.family);
            const date = item.businessDate
              ? formatUiDate(new Date(item.businessDate + "T12:00:00"))
              : undefined;
            const facts = [date, item.businessTime, item.place]
              .filter(Boolean)
              .join(" · ");
            return (
              <View key={item.itemId} style={styles.result}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={[item.title, facts].filter(Boolean).join(", ")}
                  accessibilityState={{ disabled: !onOpenItem }}
                  disabled={!onOpenItem}
                  style={styles.row}
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
                  <View style={styles.typeIcon}>
                    <AppIcon
                      name={type?.icon ?? "doc.text"}
                      size={24}
                      color={colors.textSecondary}
                    />
                  </View>
                  <View style={styles.grow}>
                    <UiText style={styles.title}>{item.title}</UiText>
                    {facts ? (
                      <UiText style={styles.meta}>{facts}</UiText>
                    ) : (
                      <UiText style={styles.meta}>
                        {t(type?.labelKey ?? "capture.results.item")}
                      </UiText>
                    )}
                    {item.state !== "complete" ? (
                      <UiText style={styles.status}>
                        {t(`capture.results.${item.state}`)}
                      </UiText>
                    ) : null}
                  </View>
                  {item.action ? (
                    <UiText style={styles.action}>
                      {t(`capture.results.${item.action}`)}
                    </UiText>
                  ) : null}
                  <AppIcon name="chevron.right" color={colors.textSecondary} size={12} />
                </Pressable>
                {item.recordedAt ? (
                  <UiText style={styles.recorded}>
                    {t("capture.ux.recorded", {
                      time: captureActivityTime(item.recordedAt),
                    })}
                  </UiText>
                ) : null}
                {onOpenDocument
                  ? model.inputs
                      .filter(
                        (file) =>
                          file.contentSha256 &&
                          tripId &&
                          item.documentIds.includes(
                            localImportDocumentId(
                              model.batch.accountId,
                              tripId,
                              file.contentSha256,
                            ),
                          ),
                      )
                      .map((file) => (
                        <Pressable
                          key={file.id}
                          style={styles.document}
                          accessibilityRole="button"
                          onPress={() => {
                            if (isCurrent() && tripId)
                              onOpenDocument(
                                item.itemId,
                                localImportDocumentId(
                                  model.batch.accountId,
                                  tripId,
                                  file.contentSha256!,
                                ),
                              );
                          }}
                        >
                          <AppIcon
                            name="paperclip"
                            size={14}
                            color={colors.textSecondary}
                          />
                          <UiText style={styles.documentLabel}>
                            {file.originalFilename ?? t("capture.ai.submittedText")}
                          </UiText>
                          <AppIcon
                            name="chevron.right"
                            size={10}
                            color={colors.textSecondary}
                          />
                        </Pressable>
                      ))
                  : null}
              </View>
            );
          })}
          {reviewCount > 0 && onReview ? (
            <UiButton
              variant="secondary"
              label={t("capture.results.reviewCount", { count: reviewCount })}
              onPress={() => {
                if (isCurrent()) onReview();
              }}
            />
          ) : null}
          {failed.length ? (
            <>
              <UiText style={styles.status}>{t("capture.ux.failed")}</UiText>
              <UiButton
                variant="secondary"
                label={t("capture.ux.saveDetails")}
                onPress={() => setRecovery(!recovery)}
              />
              {recovery ? (
                <View style={styles.recovery}>
                  <UiText style={styles.meta}>{t("capture.ux.recoveryHint")}</UiText>
                  {failed.map((row) => (
                    <View key={row.command.operationId}>
                      <UiText selectable style={styles.meta}>
                        {t("capture.ux.originalOperation", {
                          id: row.command.operationId,
                        })}
                      </UiText>
                      <UiText selectable style={styles.meta}>
                        {row.receipt?.errorCode}
                      </UiText>
                    </View>
                  ))}
                  <UiButton
                    variant="text"
                    label={t("capture.ux.reconcile")}
                    onPress={() => {
                      if (isCurrent()) onReconcile();
                    }}
                  />
                </View>
              ) : null}
            </>
          ) : null}
          {uncertain ? (
            <UiText style={styles.meta}>{t("capture.results.unknown")}</UiText>
          ) : null}
          {abstainCount ? (
            <UiText style={styles.meta}>
              {t("capture.results.notCreated", { count: abstainCount })}
            </UiText>
          ) : null}
        </>
      ) : null}
      {children}
      {onDone ? (
        <UiButton
          label={t(resultReady ? "common.done" : "common.close")}
          onPress={() => {
            if (isCurrent()) onDone();
          }}
        />
      ) : null}
      {resultReady && onDay ? (
        <UiButton
          variant="text"
          label={t("capture.results.day")}
          onPress={() => {
            if (isCurrent()) onDay();
          }}
        />
      ) : null}
      {resultReady ? (
        <UiButton
          variant="text"
          label={t(history ? "capture.ux.hideHistory" : "capture.ux.history")}
          onPress={() => {
            setHistory(!history);
            onHistoryChange?.(!history);
          }}
        />
      ) : null}
    </View>
  );
}
function TimelineRow({
  label,
  at,
  current = false,
}: {
  label: string;
  at?: string;
  current?: boolean;
}) {
  const colors = useUiTheme(),
    styles = useThemedStyles(createStyles);
  return (
    <View style={styles.event}>
      <View style={styles.marker}>
        <AppIcon
          name={current ? "clock" : "checkmark.circle.fill"}
          color={current ? colors.textSecondary : colors.accent}
          size={18}
        />
        <View style={styles.line} />
      </View>
      <View style={styles.grow}>
        <UiText style={current ? styles.title : styles.bodyCopy}>{label}</UiText>
        {at ? <UiText style={styles.meta}>{captureActivityTime(at)}</UiText> : null}
      </View>
    </View>
  );
}
const createStyles = (c: UiColors) =>
  StyleSheet.create({
    body: { gap: visual.space.row },
    grow: { flex: 1, minWidth: 0 },
    meta: { ...visual.type.meta, color: c.textSecondary },
    title: { ...visual.type.row, color: c.textPrimary },
    section: { ...visual.type.section, color: c.textPrimary },
    bodyCopy: { ...visual.type.meta, color: c.textPrimary },
    status: { ...visual.type.meta, color: c.warning },
    action: { ...visual.type.meta, color: c.textSecondary, flexShrink: 1 },
    summary: {
      flexDirection: "row",
      gap: visual.space.card,
      padding: visual.space.card,
      borderRadius: visual.radius.control,
      alignItems: "center",
    },
    tags: { flexDirection: "row", flexWrap: "wrap", gap: visual.space.heading },
    tag: {
      backgroundColor: c.groupedBackground,
      paddingHorizontal: visual.space.card,
      paddingVertical: visual.space.heading,
      borderRadius: visual.radius.pill,
    },
    result: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.separator,
      paddingBottom: visual.space.heading,
    },
    row: {
      minHeight: 64,
      flexDirection: "row",
      alignItems: "center",
      gap: visual.space.card,
      paddingVertical: visual.space.heading,
    },
    typeIcon: { width: 40, alignItems: "center" },
    recorded: { ...visual.type.meta, color: c.textSecondary, marginLeft: 52 },
    document: {
      minHeight: 44,
      marginLeft: 52,
      flexDirection: "row",
      gap: visual.space.heading,
      alignItems: "center",
    },
    documentLabel: { ...visual.type.meta, color: c.accent, flexShrink: 1 },
    timeline: { gap: visual.space.card },
    event: { flexDirection: "row", gap: visual.space.card, minHeight: 44 },
    marker: { alignItems: "center", width: 24 },
    line: {
      flex: 1,
      width: StyleSheet.hairlineWidth,
      backgroundColor: c.separator,
      marginTop: visual.space.heading,
    },
    recovery: {
      padding: visual.space.card,
      backgroundColor: c.groupedBackground,
      gap: visual.space.heading,
    },
  });
