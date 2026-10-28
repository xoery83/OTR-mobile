import { UniversalP1SourceReviewForm } from "./UniversalP1SourceReviewForm";
import {
  useUniversalP1Admission,
  type P1AdmissionActions,
} from "./useUniversalP1Admission";
import { StyleSheet, View } from "react-native";
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
import { manualItineraryTypes } from "@/features/day-feed/manualItineraryTypes";
import { AppIcon } from "@/components/AppIcon";

export function UniversalCaptureResults({
  model,
  isCurrent,
  readTripTargets,
}: {
  model: CaptureJobReadModel;
  readTripTargets?: () => Promise<readonly { id: string; name: string }[]>;
  isCurrent(): boolean;
}) {
  const state = useUniversalCapture(model, isCurrent);
  const admission = useUniversalP1Admission(model, isCurrent, state.result);
  return (
    <UniversalResultView
      model={model}
      isCurrent={isCurrent}
      admission={admission}
      readTripTargets={readTripTargets}
      {...state}
    />
  );
}
export function UniversalResultView({
  model,
  readTripTargets,
  result,
  busy,
  unavailable,
  canStart,
  isCurrent,
  start,
  recover,
  admission,
  queued = false,
  activity,
}: {
  model: CaptureJobReadModel;
  readTripTargets?: () => Promise<readonly { id: string; name: string }[]>;
  result: UniversalImportResult | null;
  busy: boolean;
  unavailable: boolean;
  attempted: boolean;
  canStart: boolean;
  isCurrent(): boolean;
  start(): void;
  recover(): void;
  admission?: P1AdmissionActions;
  queued?: boolean;
  activity?: UniversalTaskActivity | null;
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
      {result ? (
        <>
          <UiText style={s.heading}>{t("capture.ai.originals")}</UiText>
          {model.inputs
            .filter((input) => result.sourceBindings.some((b) => b.inputId === input.id))
            .map((input) => {
              const binding = result.sourceBindings.find((b) => b.inputId === input.id)!;
              return (
                <View key={input.id} style={s.source}>
                  <AppIcon
                    name={
                      binding.mime.startsWith("image/")
                        ? "photo"
                        : binding.mime === "application/pdf"
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
                  candidate.presentationTier === "HIGH_CONFIDENCE"
                    ? "capture.ai.high"
                    : candidate.presentationTier === "INCOMPLETE"
                      ? "capture.ai.incomplete"
                      : candidate.presentationTier === "ABSTAIN"
                        ? "capture.ai.abstain"
                        : "capture.ai.reviewable",
                )}
              </UiText>
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
                  {admission.statuses[candidate.token] ? (
                    <UiText style={s.meta}>
                      {t(
                        admission.statuses[candidate.token] === "SERVER_ACCEPTED"
                          ? "capture.ai.p1Accepted"
                          : admission.statuses[candidate.token] === "SYNC_PENDING"
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
          {result.unresolved.map((item, index) => (
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
          disabled={busy || !ready}
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
  if (/LIFECYCLE|amendment target|cancellation notice/i.test(reason))
    return t("capture.ai.lifecycleUnknown");
  if (/TICKET|RIGHTS|ENTITLEMENT/.test(reason)) return t("capture.ai.ticketObservation");
  if (/BOOKING_OBSERVATION_WITHHELD/.test(reason)) return t("capture.ai.bookingWithheld");
  if (/UNCONFIRMED|TRAVEL_IDEA/.test(reason)) return t("capture.ai.unconfirmed");
  if (/EVIDENCE|VALIDATION|SCHEMA|UNSUPPORTED|MISSING/.test(reason))
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
