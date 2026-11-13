import { useEffect, useRef, useState } from "react";
import { AppState, ScrollView, StyleSheet, View } from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { NavigationContextTitle } from "@/components/navigationChrome";
import { AppIcon } from "@/components/AppIcon";
import { UiButton, UiText } from "@/ui/controls";
import { UiChoiceChip } from "@/ui/forms";
import { t } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { useThemedStyles, useUiTheme } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { visual } from "@/ui/visual";
import { reopenDefaultCaptureJob } from "@/data/operations/defaultCaptureSubmission";
import { createUniversalImportTransport } from "@/data/api/universalImportTransport";
import { captureAccountRequestContext } from "@/data/auth/accountRequestContext";
import { requireAdoptedUserId } from "@/data/auth/authRepository";
import { getAccountGeneration } from "@/data/auth/accountGeneration";
import {
  openUniversalV3Review,
  universalV3ReviewFields,
  type V3AdmissionRow,
  type UniversalV3Decision,
  universalV3NewDecision,
  universalV3LinkDecision,
} from "@/data/operations/universalV3Review";
import {
  readImportSubmission,
  updateImportSubmission,
} from "@/data/repositories/importSubmissionRepository";
import { verifyUtf8TextFile } from "@/domain/capture/utf8TextFile";
import { localImportDocumentId } from "@/domain/trip/universalImportIdentity";
import type { CaptureJobReadModel } from "@/domain/capture/captureSubmission";
import type { V3SaveObservation } from "@/data/operations/universalV3Activity";

export function ImportExceptionReviewScreen() {
  useUiLocale();
  const styles = useThemedStyles(createStyles);
  const colors = useUiTheme();
  const { jobId } = useLocalSearchParams<{ jobId?: string }>();
  const [model, setModel] = useState<CaptureJobReadModel>();
  const [owner, setOwner] = useState<Awaited<ReturnType<typeof openUniversalV3Review>>>();
  const [rows, setRows] = useState<V3AdmissionRow[]>([]);
  const [expanded, setExpanded] = useState<string>();
  const [source, setSource] = useState<string>();
  const [choice, setChoice] = useState<UniversalV3Decision>();
  const [title, setTitle] = useState("");
  const [day, setDay] = useState("");
  const [statuses, setStatuses] = useState<
    Record<string, V3SaveObservation | "RESOLVED">
  >({});
  const [unavailable, setUnavailable] = useState(false);
  const [originalUnavailable, setOriginalUnavailable] = useState(false);
  const [originalText, setOriginalText] = useState<{ source: string; text: string }>();
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const alive = useRef(true),
    generation = useRef(getAccountGeneration());
  const current = () => alive.current && generation.current === getAccountGeneration();
  useEffect(() => {
    alive.current = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = async () => {
      try {
        if (!jobId) throw Error("IMPORT_REVIEW_CONTEXT");
        if (!current()) return;
        const batch = await reopenDefaultCaptureJob(jobId);
        if (!batch || !current()) return;
        const trip = batch.batch.context.tripPrior?.id ?? batch.assignedTripId;
        if (!trip) throw Error("IMPORT_REVIEW_CONTEXT");
        const context = await captureAccountRequestContext(trip, requireAdoptedUserId);
        const state = await createUniversalImportTransport(requireAdoptedUserId, {
          baseUrl: process.env.EXPO_PUBLIC_OTR_API_BASE_URL!,
        }).readLocalFirstExecution(context, batch.batch.batchId);
        if (state?.state !== "REVIEW_READY") throw Error("IMPORT_REVIEW_NOT_READY");
        const intent = await readImportSubmission(batch);
        const review = await openUniversalV3Review(batch, intent ? "IMPORT" : "MANUAL");
        const plan = review.batch(state.candidates);
        const observations: Record<string, V3SaveObservation | "RESOLVED"> = {};
        for (const row of plan) {
          const resolution = intent?.resolutions[row.candidate.candidateId];
          const observed = await review.check(resolution?.candidate ?? row.candidate);
          observations[row.candidate.candidateId] =
            observed === "UNCONFIRMED" && resolution ? "RESOLVED" : observed;
        }
        if (!current()) return;
        setLoading(false);
        setModel(batch);
        setOwner(review);
        setRows(plan);
        setStatuses((previous) => ({ ...previous, ...observations }));
        setUnavailable(false);
        if (
          Object.values(observations).some(
            (state) => state === "PENDING" || state === "ITEM_VERIFIED_RELATION_PENDING",
          )
        )
          timer = setTimeout(() => {
            if (AppState.currentState === "active") void load();
          }, 5000);
      } catch {
        if (current()) {
          setUnavailable(true);
          setLoading(false);
          timer = setTimeout(() => void load(), 5000);
        }
      }
    };
    void load();
    return () => {
      alive.current = false;
      clearTimeout(timer);
    };
  }, [jobId, refreshVersion]);
  const selected = rows.find((row) => row.candidate.candidateId === expanded);
  const amended = selected?.candidate;
  const validNew = amended && owner?.actions(amended).NEW;
  const select = (row: V3AdmissionRow) => {
    setExpanded(
      expanded === row.candidate.candidateId ? undefined : row.candidate.candidateId,
    );
    setSource(row.candidate.documentIds[0]);
    setChoice(undefined);
    setOriginalUnavailable(false);
    const facts = universalV3ReviewFields(row.candidate);
    setTitle(facts.title ?? "");
    setDay(facts.start ?? "");
  };
  const preview = async () => {
    if (!model || !source || !current()) return;
    setOriginalUnavailable(false);
    const trip = model.batch.context.tripPrior?.id ?? model.assignedTripId;
    const file = model.inputs.find(
      (file) =>
        file.contentSha256 &&
        trip &&
        localImportDocumentId(model.batch.accountId, trip, file.contentSha256) === source,
    );
    if (!file?.contentSha256 || !file.contentByteCount) return;
    try {
      if ((await requireAdoptedUserId()) !== model.batch.accountId || !current()) return;
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
        if (current()) setOriginalText({ source, text });
        return;
      }
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
        current,
      );
    } catch {
      if (current()) setOriginalUnavailable(true);
    }
  };
  const chooseNew = () => setChoice(universalV3NewDecision);
  const chooseLink = (target: { id: string; revision: number }) =>
    setChoice(universalV3LinkDecision(target.id, target.revision));
  const confirm = async () => {
    if (!model || !owner || !selected || !amended || !choice || busy || !current())
      return;
    setBusy(true);
    setUnavailable(false);
    try {
      const intent = await readImportSubmission(model);
      if (!intent) throw Error("IMPORT_SUBMISSION_MISSING");
      await updateImportSubmission(model, (record) => ({
        ...record,
        resolutions: {
          ...record.resolutions,
          [selected.candidate.candidateId]: {
            candidate: amended,
            decision: choice as Exclude<UniversalV3Decision, { action: "UPDATE" }>,
          },
        },
      }));
      const state = intent.confirmed ? await owner.confirm(amended, choice) : "RESOLVED";
      if (current())
        setStatuses((previous) => ({
          ...previous,
          [selected.candidate.candidateId]: state,
        }));
    } catch {
      if (current()) setUnavailable(true);
    } finally {
      if (current()) {
        setBusy(false);
        setRefreshVersion((value) => value + 1);
      }
    }
  };
  const exceptions = rows.filter(
    (row) =>
      (row.disposition === "REVIEW" &&
        statuses[row.candidate.candidateId] !== "VERIFIED") ||
      statuses[row.candidate.candidateId] === "REVIEW_REQUIRED" ||
      statuses[row.candidate.candidateId] === "ITEM_VERIFIED_RELATION_REVIEW",
  );
  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          headerBackVisible: false,
          headerLeft: () => (
            <UiButton
              variant="text"
              label={t("common.back")}
              icon={<AppIcon name="chevron.left" color={colors.accent} size={18} />}
              onPress={() => router.back()}
            />
          ),
          headerTitle: () => <NavigationContextTitle title={t("common.review")} />,
        }}
      />
      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <UiText style={styles.heading}>
          {loading
            ? t("capture.jobLoading")
            : t("capture.admission.reviewHeading", { count: exceptions.length })}
        </UiText>
        {unavailable ? (
          <UiText style={styles.body} accessibilityLiveRegion="polite">
            {t("capture.admission.unavailable")}
          </UiText>
        ) : null}
        {exceptions.map((row) => {
          const id = row.candidate.candidateId,
            status = statuses[id],
            open = expanded === id;
          const unsaved = [
            "room.type",
            "guest.name",
            "driver.name",
            "activity.category",
            "operating_flight",
            "platform",
          ].flatMap((key) =>
            row.candidate.fields[key] === undefined
              ? []
              : [String(row.candidate.fields[key])],
          );
          return (
            <View key={id} style={styles.row}>
              <UiButton
                variant="text"
                icon={<AppIcon name="doc.text" color={colors.textSecondary} size={20} />}
                label={
                  universalV3ReviewFields(row.candidate).title ?? t("capture.unnamed")
                }
                onPress={() => select(row)}
              />
              <UiText style={styles.body}>
                {t(`capture.admission.${row.reason ?? "conflict"}`)}
              </UiText>
              {status && status !== "UNCONFIRMED" ? (
                <UiText style={styles.body} accessibilityLiveRegion="polite">
                  {t(
                    status === "VERIFIED"
                      ? "capture.ai.v3.verified"
                      : status === "RESOLVED"
                        ? "capture.admission.resolved"
                        : status === "OUTCOME_UNKNOWN"
                          ? "capture.ai.unknown"
                          : status === "REVIEW_REQUIRED" ||
                              status === "ITEM_VERIFIED_RELATION_REVIEW"
                            ? "capture.ai.v3.changed"
                            : "capture.ai.v3.pending",
                  )}
                </UiText>
              ) : null}
              {open && model && owner ? (
                <>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    {row.candidate.documentIds.map((id, index) => (
                      <UiChoiceChip
                        key={id}
                        compact
                        selected={source === id}
                        label={t("capture.admission.source", { index: index + 1 })}
                        onPress={() => setSource(id)}
                      />
                    ))}
                  </ScrollView>
                  <View style={styles.source}>
                    <UiText style={styles.body}>
                      {model.inputs.find(
                        (file) =>
                          file.contentSha256 &&
                          localImportDocumentId(
                            model.batch.accountId,
                            model.batch.context.tripPrior?.id ?? model.assignedTripId!,
                            file.contentSha256,
                          ) === source,
                      )?.originalFilename ?? t("capture.admission.textSource")}
                    </UiText>
                    <UiText style={styles.body}>
                      {t("capture.admission.sourceNote")}
                    </UiText>
                    <UiButton
                      variant="text"
                      label={t("importDocuments.openOriginal")}
                      onPress={() => void preview()}
                    />
                  </View>
                  {originalText && originalText.source === source ? (
                    <UiText selectable style={styles.body}>
                      {originalText.text}
                    </UiText>
                  ) : null}
                  {originalUnavailable ? (
                    <UiText style={styles.body}>
                      {t("importDocuments.originalUnavailable")}
                    </UiText>
                  ) : null}
                  <UiText style={styles.body}>{title}</UiText>
                  {unsaved.length ? (
                    <UiText style={styles.body}>
                      {t("capture.ai.v3.notSaved", { details: unsaved.join(" · ") })}
                    </UiText>
                  ) : null}
                  <UiText style={styles.body}>{day}</UiText>
                  {row.reason === "missing" ? (
                    <UiText style={styles.body}>
                      {t("capture.admission.manualRequired")}
                    </UiText>
                  ) : null}
                  <UiButton
                    variant="secondary"
                    disabled={!validNew || busy}
                    label={t("capture.admission.new")}
                    onPress={chooseNew}
                  />
                  {owner.targets(row.candidate).map((target) => (
                    <UiChoiceChip
                      key={target.id}
                      label={t("capture.admission.link", { title: target.title })}
                      selected={
                        !!choice && "itemId" in choice && choice.itemId === target.id
                      }
                      onPress={() => chooseLink(target)}
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
                  <UiButton
                    label={t("capture.admission.resolve")}
                    disabled={
                      !choice ||
                      busy ||
                      (status !== "UNCONFIRMED" && status !== "RESOLVED")
                    }
                    onPress={() => void confirm()}
                  />
                </>
              ) : null}
            </View>
          );
        })}
      </ScrollView>
    </>
  );
}
const createStyles = (colors: UiColors) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    content: { padding: visual.space.page },
    body: { ...visual.type.meta, color: colors.textPrimary },
    heading: { ...visual.type.section, color: colors.textPrimary },
    row: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.separator,
      paddingVertical: visual.space.page,
      gap: visual.space.card,
    },
    source: {
      backgroundColor: colors.surface,
      padding: visual.space.card,
      gap: visual.space.heading,
    },
  });
