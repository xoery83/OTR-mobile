import { ScrollView, StyleSheet, View } from "react-native";
import type {
  ImportDocument,
  ImportDocumentScope,
} from "@/data/repositories/importDocumentsRepository";
import { UiButton, UiSection, UiText } from "@/ui/controls";
import { t, formatUiDate } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { useThemedStyles } from "@/ui/theme";
import type { UiColors } from "@/ui/palette";
import { visual } from "@/ui/visual";

const matches = (document: ImportDocument, accountId: string, tripId: string | null) =>
  document.accountId === accountId && document.tripId === tripId;
const recordedTime = (at: string) =>
  formatUiDate(new Date(at), {
    // ui-foundation-exception: string -- Intl dateStyle option, not user copy
    dateStyle: "medium",
    // ui-foundation-exception: string -- Intl timeStyle retains recorded seconds
    timeStyle: "medium",
  });

// Native owns the route/pager. These Import-only views receive scoped repository observations.
export function ImportDocumentsList({
  documents,
  scope,
  accountId,
  tripId,
  loading,
  error,
  hasMore,
  isCurrent,
  onOpen,
  onMore,
  onRefresh,
}: {
  documents: readonly ImportDocument[];
  scope: ImportDocumentScope;
  accountId: string;
  tripId: string | null;
  loading: boolean;
  error: boolean;
  hasMore: boolean;
  isCurrent(): boolean;
  onOpen(captureId: string): void;
  onMore(): void;
  onRefresh(): void;
}) {
  useUiLocale();
  const s = useThemedStyles(styles);
  const expectedTrip = scope === "PERSONAL_INBOX" ? null : tripId;
  const invalid =
    !isCurrent() ||
    (scope === "TRIP" && !tripId) ||
    documents.some((doc) => !matches(doc, accountId, expectedTrip));
  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      style={s.body}
      contentContainerStyle={s.content}
    >
      <UiSection
        title={t(scope === "TRIP" ? "importDocuments.trip" : "importDocuments.inbox")}
      >
        <UiButton
          label={t("capture.activityRefresh")}
          variant="text"
          disabled={loading}
          onPress={() => {
            if (isCurrent()) onRefresh();
          }}
        />
        {loading ? (
          <UiText accessibilityLiveRegion="polite" style={s.meta}>
            {t("importDocuments.loading")}
          </UiText>
        ) : null}
        {error || invalid ? (
          <UiText accessibilityRole="alert" style={s.meta}>
            {t("importDocuments.unavailable")}
          </UiText>
        ) : null}
        {!loading && !error && !invalid && !documents.length ? (
          <UiText style={s.meta}>{t("importDocuments.empty")}</UiText>
        ) : null}
      </UiSection>
      {!invalid
        ? documents.map((doc) => (
            <UiSection key={doc.captureId}>
              <UiText accessibilityRole="header" style={s.title}>
                {doc.originalFilename ??
                  t(doc.kind === "TEXT" ? "capture.ai.submittedText" : "capture.unnamed")}
              </UiText>
              <UiText style={s.meta}>{t(`importDocuments.format.${doc.kind}`)}</UiText>
              <UiText style={s.meta}>{recordedTime(doc.recordedAt)}</UiText>
              <UiText style={s.meta}>{t("importDocuments.private")}</UiText>
              <UiText style={s.meta}>
                {t(
                  doc.custody === "UNAVAILABLE"
                    ? "importDocuments.originalUnavailable"
                    : "importDocuments.localRecorded",
                )}
              </UiText>
              <UiButton
                label={t("importDocuments.details")}
                variant="secondary"
                onPress={() => {
                  if (isCurrent()) onOpen(doc.captureId);
                }}
              />
            </UiSection>
          ))
        : null}
      {hasMore && !invalid ? (
        <UiButton
          label={t("capture.activityMore")}
          variant="secondary"
          disabled={loading}
          onPress={() => {
            if (isCurrent()) onMore();
          }}
        />
      ) : null}
    </ScrollView>
  );
}

export function ImportDocumentDetail({
  document,
  linkedItems,
  linksUnavailable = false,
  accountId,
  tripId,
  original,
  opening,
  error,
  isCurrent,
  onOpenOriginal,
  onOpenActivity,
}: {
  document: ImportDocument;
  linkedItems?: number | null;
  linksUnavailable?: boolean;
  accountId: string;
  tripId: string | null;
  original?: { captureId: string; sha256: string; text: string } | null;
  opening: boolean;
  error: boolean;
  isCurrent(): boolean;
  onOpenOriginal(captureId: string): void;
  onOpenActivity?(jobId: string): void;
}) {
  useUiLocale();
  const s = useThemedStyles(styles);
  if (!isCurrent() || !matches(document, accountId, tripId))
    return (
      <View style={s.body}>
        <UiText accessibilityRole="alert">{t("importDocuments.unavailable")}</UiText>
      </View>
    );
  const canOpenOriginal =
    document.custody !== "UNAVAILABLE" &&
    (document.kind === "TEXT" ||
      (document.kind === "FILE" && document.declaredContentType === "text/plain") ||
      process.env.EXPO_PUBLIC_OTR_IMPORT_ORIGINAL_PREVIEW_ENABLED === "true");
  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      style={s.body}
      contentContainerStyle={s.content}
    >
      <UiSection
        title={
          document.originalFilename ??
          t(document.kind === "TEXT" ? "capture.ai.submittedText" : "capture.unnamed")
        }
      >
        <UiText style={s.meta}>{t(`importDocuments.format.${document.kind}`)}</UiText>
        <UiText style={s.meta}>{recordedTime(document.recordedAt)}</UiText>
        <UiText style={s.meta}>{t("importDocuments.private")}</UiText>
        <UiText style={s.meta}>{t("importDocuments.custodyExplanation")}</UiText>
        <UiButton
          label={t("importDocuments.openOriginal")}
          disabled={opening || !canOpenOriginal}
          onPress={() => {
            if (!opening && canOpenOriginal && isCurrent())
              onOpenOriginal(document.captureId);
          }}
        />
        {error ? (
          <UiText accessibilityRole="alert">
            {t("importDocuments.originalUnavailable")}
          </UiText>
        ) : null}
        {original?.captureId === document.captureId &&
        original.sha256 === document.sha256 ? (
          <UiText selectable style={s.copy}>
            {original.text}
          </UiText>
        ) : null}
      </UiSection>
      {linksUnavailable ? (
        <UiText style={s.meta}>{t("importDocuments.itemLinksUnavailable")}</UiText>
      ) : linkedItems !== null && linkedItems !== undefined ? (
        <UiText style={s.meta}>
          {t("importDocuments.importedItems", { count: linkedItems })}
        </UiText>
      ) : null}
      {document.jobId && document.batchId && document.inputId && onOpenActivity ? (
        <UiButton
          label={t("importDocuments.openBatch")}
          variant="secondary"
          onPress={() => {
            if (isCurrent()) onOpenActivity(document.jobId!);
          }}
        />
      ) : null}
    </ScrollView>
  );
}
const styles = (colors: UiColors) =>
  StyleSheet.create({
    body: { flexGrow: 0, flexShrink: 1, backgroundColor: colors.background },
    content: { padding: visual.space.page, gap: visual.space.card },
    title: { color: colors.textPrimary, ...visual.type.row },
    copy: { color: colors.textPrimary, ...visual.type.row },
    meta: { color: colors.textSecondary, ...visual.type.meta },
  });
