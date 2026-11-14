import { useEffect, useRef, useState } from "react";
import {
  AppState,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useLocalSearchParams } from "expo-router";
import { NavigationContextTitle } from "@/components/navigationChrome";
import { AppIcon } from "@/components/AppIcon";
import { UiButton, UiText } from "@/ui/controls";
import { UiChoiceChip, UiDatePicker, UiTextInput } from "@/ui/forms";
import { t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { useThemedStyles, useUiTheme } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { visual } from "@/ui/visual";
import { reopenDefaultCaptureJob } from "@/data/operations/defaultCaptureSubmission";

import { requireAdoptedUserId } from "@/data/auth/authRepository";
import { getAccountGeneration } from "@/data/auth/accountGeneration";
import {
  readUniversalV3ReviewExecution,
  completeUniversalV3RequiredFields,
  openUniversalV3Review,
  universalV3MissingFields,
  universalV3ReviewFields,
  universalV3ReviewStatus,
  type V3AdmissionRow,
  type UniversalV3Decision,
  universalV3NewDecision,
  universalV3LinkDecision,
} from "@/data/operations/universalV3Review";
import {
  readV3UnknownCandidates,
  type V3SaveObservation,
} from "@/data/operations/universalV3Activity";
import {
  readImportSubmission,
  updateImportSubmission,
  type ImportSubmission,
} from "@/data/repositories/importSubmissionRepository";
import { verifyUtf8TextFile } from "@/domain/capture/utf8TextFile";
import { localImportDocumentId } from "@/domain/trip/universalImportIdentity";
import type { CaptureJobReadModel } from "@/domain/capture/captureSubmission";
import { manualItineraryTypes } from "@/features/day-feed/manualItineraryTypes";
import { captureActivityTime } from "./CaptureActivity";

type Owner = Awaited<ReturnType<typeof openUniversalV3Review>>;
type Candidate = V3AdmissionRow["candidate"];
export function ImportExceptionReviewScreen() {
  useUiLocale();
  const { jobId } = useLocalSearchParams<{ jobId?: string }>();
  const [model, setModel] = useState<CaptureJobReadModel>();
  const [owner, setOwner] = useState<Owner>();
  const [rows, setRows] = useState<V3AdmissionRow[]>([]);
  const [intent, setIntent] = useState<ImportSubmission | null>(null);
  const [statuses, setStatuses] = useState<Record<string, V3SaveObservation>>({});
  const [unavailable, setUnavailable] = useState(false);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const alive = useRef(true),
    generation = useRef(getAccountGeneration());
  const current = () => alive.current && generation.current === getAccountGeneration();
  useEffect(() => {
    alive.current = true;
    let active = true,
      running = false,
      timer: ReturnType<typeof setTimeout> | undefined;
    const load = async () => {
      if (!active || !current() || running || AppState.currentState !== "active") return;
      running = true;
      try {
        if (!jobId) throw Error("IMPORT_REVIEW_CONTEXT");
        const batch = await reopenDefaultCaptureJob(jobId);
        if (!batch || !active || !current()) return;
        const state = await readUniversalV3ReviewExecution(batch);
        if (state?.state !== "REVIEW_READY") throw Error("IMPORT_REVIEW_NOT_READY");
        const submission = await readImportSubmission(batch);
        const review = await openUniversalV3Review(
          batch,
          submission ? "IMPORT" : "MANUAL",
        );
        const plan = review.batch(state.candidates);
        const unknown = await readV3UnknownCandidates(
          batch,
          plan.map((row) => row.candidate.candidateId),
        );
        const observations: Record<string, V3SaveObservation> = {};
        for (const row of plan) {
          const id = row.candidate.candidateId;
          const observed = await review.check(
            submission?.resolutions[id]?.candidate ?? row.candidate,
          );
          observations[id] =
            observed !== "VERIFIED" && unknown.has(id) ? "OUTCOME_UNKNOWN" : observed;
        }
        if (!active || !current()) return;
        setModel(batch);
        setOwner(review);
        setRows(plan);
        setIntent(submission);
        setStatuses(observations);
        setUnavailable(false);
        // Decision saved is not Review resolved. Continue only original-ID observation.
        if (
          plan.some(
            (row) =>
              observations[row.candidate.candidateId] !== "VERIFIED" &&
              submission?.resolutions[row.candidate.candidateId],
          )
        )
          timer = setTimeout(() => void load(), 5000);
      } catch {
        if (active && current()) {
          setUnavailable(true);
          timer = setTimeout(() => void load(), 5000);
        }
      } finally {
        running = false;
      }
    };
    void load();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        clearTimeout(timer);
        void load();
      }
    });
    return () => {
      active = false;
      alive.current = false;
      clearTimeout(timer);
      subscription.remove();
    };
  }, [jobId, refreshVersion]);
  const confirm = async (
    candidate: Candidate,
    decision: UniversalV3Decision,
    manual: boolean,
    durable: () => void,
  ) => {
    if (!model || !owner || !current()) return;
    const id = candidate.candidateId;
    let saved = false;
    try {
      const record = await updateImportSubmission(model, (prior) => ({
        ...prior,
        resolutions: {
          ...prior.resolutions,
          [id]: {
            candidate,
            decision: decision as Exclude<UniversalV3Decision, { action: "UPDATE" }>,
            ...(manual ? { manual: true } : {}),
          },
        },
      }));
      saved = true;
      if (!current()) return;
      setIntent(record);
      setUnavailable(false);
      durable();
      if (record.confirmed) {
        const unknown = await readV3UnknownCandidates(model, [id]);
        const status = unknown.has(id)
          ? "OUTCOME_UNKNOWN"
          : manual
            ? await owner.confirm(candidate, decision, true)
            : await owner.confirm(candidate, decision);
        if (current()) setStatuses((previous) => ({ ...previous, [id]: status }));
      }
    } catch {
      if (current()) setUnavailable(true);
      if (!saved) throw Error("IMPORT_DECISION_NOT_SAVED");
    } finally {
      if (current()) setRefreshVersion((v) => v + 1);
    }
  };
  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          headerTransparent: false,
          headerBackVisible: true,
          headerTitle: () => <NavigationContextTitle title={t("common.review")} />,
        }}
      />
      <ImportExceptionReviewContent
        model={model}
        owner={owner}
        rows={rows}
        statuses={statuses}
        intent={intent}
        unavailable={unavailable}
        isCurrent={current}
        onConfirm={confirm}
      />
    </>
  );
}

// The normal route and isolated UI checks share this view; no separate Review engine.
export function ImportExceptionReviewContent({
  model,
  owner,
  rows,
  statuses,
  intent,
  unavailable = false,
  isCurrent,
  onConfirm,
}: {
  model?: CaptureJobReadModel;
  owner?: {
    actions(candidate: Candidate, manual?: boolean): { NEW: boolean };
    targets: Owner["targets"];
  };
  rows: V3AdmissionRow[];
  statuses: Record<string, V3SaveObservation>;
  intent: ImportSubmission | null;
  unavailable?: boolean;
  isCurrent(): boolean;
  onConfirm(
    candidate: Candidate,
    decision: UniversalV3Decision,
    manual: boolean,
    durable: () => void,
  ): Promise<void>;
}) {
  useUiLocale();
  const styles = useThemedStyles(createStyles),
    colors = useUiTheme();
  const [expanded, setExpanded] = useState<string>();
  const [source, setSource] = useState<string>();
  const [values, setValues] = useState<Record<string, Record<string, string>>>({});
  const [choices, setChoices] = useState<Record<string, UniversalV3Decision>>({});
  const [calendar, setCalendar] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [originalUnavailable, setOriginalUnavailable] = useState(false);
  const [originalText, setOriginalText] = useState<{ source: string; text: string }>();
  const statusFor = (row: V3AdmissionRow) =>
    universalV3ReviewStatus(
      statuses[row.candidate.candidateId],
      !!intent?.resolutions[row.candidate.candidateId],
      !!intent?.confirmed,
    );
  const exceptions = rows.filter(
    (row) =>
      (row.disposition === "REVIEW" || statusFor(row) === "recheck") &&
      statusFor(row) !== "resolved",
  );
  const resolved = rows.filter(
    (row) => row.disposition === "REVIEW" && statusFor(row) === "resolved",
  ).length;
  const sourceFile = (id: string) =>
    model?.inputs.find(
      (file) =>
        file.contentSha256 &&
        localImportDocumentId(
          model.batch.accountId,
          model.batch.context.tripPrior?.id ?? model.assignedTripId!,
          file.contentSha256,
        ) === id,
    );
  const sourceName = (id: string) =>
    sourceFile(id)?.originalFilename ?? t("capture.admission.textSource");
  const select = (row: V3AdmissionRow) => {
    setExpanded(
      expanded === row.candidate.candidateId ? undefined : row.candidate.candidateId,
    );
    setSource(row.candidate.documentIds[0]);
    setCalendar(undefined);
    setOriginalUnavailable(false);
    setSaveError(false);
  };
  const preview = async () => {
    if (!model || !source || !isCurrent()) return;
    const selectedSource = source;
    setOriginalUnavailable(false);
    const file = sourceFile(source);
    try {
      if (!file?.contentSha256 || !file.contentByteCount)
        throw Error("IMPORT_ORIGINAL_NOT_LOCAL");
      if ((await requireAdoptedUserId()) !== model.batch.accountId || !isCurrent())
        return;
      const { readImportOriginal } = await import("@/data/files/importOriginalFileStore");
      const bytes = await readImportOriginal(
        model.batch.accountId,
        file.contentSha256,
        file.contentByteCount,
      );
      if (!bytes) throw Error("IMPORT_ORIGINAL_NOT_LOCAL");
      if (file.kind === "TEXT" || file.declaredContentType === "text/plain") {
        const text =
          file.kind === "TEXT"
            ? new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes)
            : verifyUtf8TextFile(bytes, file.originalFilename, file.declaredContentType)
                .text;
        if (isCurrent()) setOriginalText({ source: selectedSource, text });
      } else {
        const { previewImportOriginal } = await import("@/native/importOriginalPreview");
        await previewImportOriginal(
          {
            bytes,
            document: {
              sha256: file.contentSha256,
              byteCount: file.contentByteCount,
              originalFilename: file.originalFilename,
            },
          },
          isCurrent,
        );
      }
    } catch {
      if (isCurrent()) setOriginalUnavailable(true);
    }
  };
  return (
    <SafeAreaView edges={["bottom", "left", "right"]} style={styles.screen}>
      <KeyboardAvoidingView
        style={styles.screen}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.context}>
          <UiText style={styles.contextTitle}>
            {model?.inputs[0]?.originalFilename ??
              (model?.batch.context.tripPrior
                ? t("capture.review.tripBatch")
                : t("capture.review.batch"))}
          </UiText>
          {model ? (
            <UiText style={styles.meta}>
              {captureActivityTime(model.batch.createdAt)}
            </UiText>
          ) : null}
          <UiText style={styles.remaining} accessibilityLiveRegion="polite">
            {t("capture.review.remaining", { count: exceptions.length })}
          </UiText>
        </View>
        <ScrollView
          style={styles.screen}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
        >
          {!model ? <UiText style={styles.meta}>{t("capture.jobLoading")}</UiText> : null}
          {unavailable ? (
            <UiText style={styles.meta} accessibilityLiveRegion="polite">
              {t("capture.review.offlineRead")}
            </UiText>
          ) : null}
          {exceptions.map((row) => {
            const id = row.candidate.candidateId,
              open = expanded === id,
              status = statusFor(row);
            const saved = intent?.resolutions[id];
            const original = row.candidate;
            const candidate = saved?.candidate ?? original;
            const missing = universalV3MissingFields(original);
            const answers = values[id] ?? {};
            let amended = candidate,
              valid = true;
            try {
              amended = completeUniversalV3RequiredFields(original, {
                ...Object.fromEntries(
                  missing.map((field) => [
                    field.key,
                    String(saved?.candidate.fields[field.key] ?? ""),
                  ]),
                ),
                ...answers,
              });
            } catch {
              valid = false;
            }
            const manual =
              !!saved?.manual || Object.values(answers).some((value) => !!value.trim());
            const validNew = valid && owner?.actions(amended, manual).NEW;
            const choice = choices[id] ?? saved?.decision;
            const fields = universalV3ReviewFields(amended);
            const family = manualItineraryTypes.find(
              (type) => type.id === candidate.kind,
            );
            const decisionSaved = ["applying", "waiting", "confirmation"].includes(
              status,
            );
            const editable = status === "unanswered" || status === "confirmation";
            const question = t(`capture.review.question.${row.reason ?? "conflict"}`);
            const targets = owner?.targets(candidate) ?? [];
            return (
              <View key={id} style={styles.row}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={[
                    question,
                    fields.title,
                    status === "unanswered"
                      ? t("capture.review.sources", {
                          count: candidate.documentIds.length,
                        })
                      : t(`capture.review.status.${status}`),
                  ]
                    .filter(Boolean)
                    .join(", ")}
                  accessibilityState={{ expanded: open, disabled: busy }}
                  disabled={busy}
                  style={styles.rowHeader}
                  onPress={() => select(row)}
                >
                  <AppIcon
                    name={
                      decisionSaved
                        ? "checkmark.circle.fill"
                        : (family?.icon ?? "doc.text")
                    }
                    size={24}
                    color={decisionSaved ? colors.accent : colors.textSecondary}
                  />
                  <View style={styles.grow}>
                    <UiText style={styles.question}>{question}</UiText>
                    <UiText style={styles.meta}>
                      {fields.title ?? t("capture.unnamed")}
                    </UiText>
                    <UiText
                      style={status === "recheck" ? styles.warning : styles.meta}
                      accessibilityLiveRegion="polite"
                    >
                      {status === "unanswered"
                        ? t("capture.review.sources", {
                            count: candidate.documentIds.length,
                          })
                        : t(`capture.review.status.${status}`)}
                    </UiText>
                  </View>
                  <AppIcon
                    name={open ? "chevron.up" : "chevron.down"}
                    size={13}
                    color={colors.textSecondary}
                  />
                </Pressable>
                {open ? (
                  <View style={styles.expanded}>
                    <UiText style={styles.body}>
                      {t(`capture.admission.${row.reason ?? "conflict"}`)}
                    </UiText>
                    <ScrollView
                      horizontal
                      keyboardShouldPersistTaps="handled"
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.tabs}
                    >
                      {candidate.documentIds.map((documentId) => (
                        <UiChoiceChip
                          compact
                          key={documentId}
                          label={sourceName(documentId)}
                          selected={source === documentId}
                          onPress={() => {
                            setSource(documentId);
                            setOriginalUnavailable(false);
                          }}
                        />
                      ))}
                    </ScrollView>
                    <View style={styles.evidence}>
                      <UiText style={styles.question}>
                        {source ? sourceName(source) : t("capture.admission.textSource")}
                      </UiText>
                      <UiText style={styles.meta}>
                        {t("capture.admission.sourceNote")}
                      </UiText>
                      {originalText && originalText.source === source ? (
                        <UiText selectable style={styles.body}>
                          {originalText.text}
                        </UiText>
                      ) : null}
                      {originalUnavailable ? (
                        <UiText style={styles.meta}>
                          {t("importDocuments.originalUnavailable")}
                        </UiText>
                      ) : null}
                      <UiButton
                        variant="text"
                        label={t("importDocuments.openOriginal")}
                        onPress={() => void preview()}
                      />
                    </View>
                    <UiText style={styles.meta}>
                      {t("capture.review.interpretation")}
                    </UiText>
                    <UiText style={styles.body}>
                      {[
                        fields.title,
                        fields.start,
                        fields.startTime,
                        fields.end,
                        fields.place,
                        fields.endPlace,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </UiText>
                    {editable && missing.length ? (
                      <>
                        {missing.map((field) => (
                          <View key={field.key} style={styles.field}>
                            <UiText style={styles.meta}>{t(field.label)}</UiText>
                            <UiTextInput
                              accessibilityLabel={t(field.label)}
                              value={
                                answers[field.key] ??
                                String(saved?.candidate.fields[field.key] ?? "")
                              }
                              editable={!busy}
                              placeholder={
                                field.kind === "date"
                                  ? t("capture.review.dateFormat")
                                  : undefined
                              }
                              autoCapitalize={
                                field.kind === "date" ? "none" : "sentences"
                              }
                              onChangeText={(value) => {
                                setValues((prior) => ({
                                  ...prior,
                                  [id]: { ...prior[id], [field.key]: value },
                                }));
                                setChoices((prior) => ({
                                  ...prior,
                                  [id]: universalV3NewDecision,
                                }));
                              }}
                            />
                            {field.kind === "date" ? (
                              <UiButton
                                variant="text"
                                label={t("capture.review.chooseDate")}
                                onPress={() =>
                                  setCalendar(
                                    calendar === field.key ? undefined : field.key,
                                  )
                                }
                              />
                            ) : null}
                            {calendar === field.key ? (
                              <UiDatePicker
                                mode="date"
                                display="inline"
                                value={
                                  new Date(
                                    /^\d{4}-\d{2}-\d{2}$/.test(answers[field.key] ?? "")
                                      ? answers[field.key] + "T12:00:00"
                                      : Date.now(),
                                  )
                                }
                                onChange={(_event, selectedDate) => {
                                  if (selectedDate) {
                                    const value = [
                                      selectedDate.getFullYear(),
                                      String(selectedDate.getMonth() + 1).padStart(
                                        2,
                                        "0",
                                      ),
                                      String(selectedDate.getDate()).padStart(2, "0"),
                                    ].join("-");
                                    setValues((prior) => ({
                                      ...prior,
                                      [id]: { ...prior[id], [field.key]: value },
                                    }));
                                    setChoices((prior) => ({
                                      ...prior,
                                      [id]: universalV3NewDecision,
                                    }));
                                    setCalendar(undefined);
                                  }
                                }}
                              />
                            ) : null}
                          </View>
                        ))}
                        {!valid ? (
                          <UiText style={styles.warning}>
                            {t("capture.review.invalidDate")}
                          </UiText>
                        ) : null}
                        <UiText style={styles.meta}>
                          {t("capture.review.manualFacts")}
                        </UiText>
                      </>
                    ) : null}
                    {editable ? (
                      <>
                        <UiButton
                          variant="secondary"
                          label={t("capture.admission.new")}
                          icon={
                            choice?.action === "NEW" ? (
                              <AppIcon
                                name="checkmark.circle"
                                color={colors.accent}
                                size={20}
                              />
                            ) : undefined
                          }
                          disabled={!validNew || busy}
                          onPress={() =>
                            setChoices((prior) => ({
                              ...prior,
                              [id]: universalV3NewDecision,
                            }))
                          }
                        />
                        {targets.map((target) => (
                          <UiChoiceChip
                            key={target.id}
                            label={t("capture.admission.link", { title: target.title })}
                            selected={
                              choice?.action === "LINK" && choice.itemId === target.id
                            }
                            onPress={() =>
                              setChoices((prior) => ({
                                ...prior,
                                [id]: universalV3LinkDecision(target.id, target.revision),
                              }))
                            }
                          />
                        ))}
                        {choice ? (
                          <UiText style={styles.body}>
                            {t(
                              choice.action === "NEW"
                                ? "capture.admission.willCreate"
                                : "capture.admission.willLink",
                            )}
                          </UiText>
                        ) : null}
                        {saveError ? (
                          <UiText style={styles.warning}>
                            {t("capture.review.notSaved")}
                          </UiText>
                        ) : null}
                        <UiButton
                          label={t(busy ? "capture.review.saving" : "ui.confirm")}
                          disabled={
                            busy || !choice || (choice.action === "NEW" && !validNew)
                          }
                          onPress={() => {
                            if (!choice || busy || !isCurrent()) return;
                            setBusy(true);
                            setSaveError(false);
                            void onConfirm(
                              amended,
                              choice,
                              manual && choice.action === "NEW",
                              () => {
                                if (isCurrent()) {
                                  setExpanded(undefined);
                                  setCalendar(undefined);
                                }
                              },
                            )
                              .catch(() => {
                                if (isCurrent()) setSaveError(true);
                              })
                              .finally(() => {
                                if (isCurrent()) setBusy(false);
                              });
                          }}
                        />
                      </>
                    ) : (
                      <UiText style={styles.meta}>
                        {t(`capture.review.status.${status}`)}
                      </UiText>
                    )}
                  </View>
                ) : null}
              </View>
            );
          })}
          {resolved ? (
            <UiText style={styles.meta}>
              {t("capture.review.resolvedCount", { count: resolved })}
            </UiText>
          ) : null}
          {model && !exceptions.length ? (
            <UiText style={styles.body}>{t("capture.review.none")}</UiText>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
const createStyles = (colors: UiColors) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    context: {
      padding: visual.space.page,
      gap: visual.space.heading,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.separator,
      backgroundColor: colors.surface,
    },
    contextTitle: { ...visual.type.row, color: colors.textPrimary },
    remaining: { ...visual.type.row, color: colors.textPrimary },
    content: { paddingHorizontal: visual.space.page, paddingBottom: visual.space.page },
    body: { ...visual.type.row, fontWeight: "400", color: colors.textPrimary },
    meta: { ...visual.type.meta, color: colors.textSecondary },
    question: { ...visual.type.row, color: colors.textPrimary },
    warning: { ...visual.type.meta, color: colors.warning },
    row: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.separator,
    },
    rowHeader: {
      minHeight: 64,
      flexDirection: "row",
      alignItems: "center",
      gap: visual.space.card,
      paddingVertical: visual.space.card,
    },
    grow: { flex: 1, minWidth: 0 },
    expanded: { gap: visual.space.card, paddingBottom: visual.space.page },
    tabs: { gap: visual.space.heading, alignItems: "center" },
    evidence: {
      gap: visual.space.heading,
      padding: visual.space.card,
      backgroundColor: colors.surface,
    },
    field: { gap: visual.space.heading },
  });
