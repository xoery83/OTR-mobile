import { useCallback, useEffect, useRef, useState } from "react";
import { ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { UiButton, UiText } from "@/ui/controls";
import { t, formatUiDate, formatUiNumber } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { useThemedStyles } from "@/ui/theme";
import { visual } from "@/ui/visual";
import type { UiColors } from "@/ui/palette";
import { localItemImportOriginals } from "@/data/operations/localItemImportOriginals";
import type { DocumentListEntry } from "./documentListPresentation";
import { ImportDocumentsPanel } from "./ImportDocumentsPanel";
import type { ImportDocument } from "@/data/repositories/importDocumentsRepository";
import { documentFormat, documentFormatLabel } from "./documentListPresentation";

const resultActionKey = {
  created: "documents.resultCreated",
  linked: "documents.resultLinked",
  updated: "documents.resultUpdated",
} as const;
type Reader = Awaited<ReturnType<typeof localItemImportOriginals>>;
type Batch = Awaited<ReturnType<Reader["batches"]>>[number];
type Item = Awaited<ReturnType<Reader["relationships"]>>[number];
type Page =
  { document: DocumentListEntry } | { batch: Batch } | { capture: ImportDocument };
export function CoreDocumentDetail({
  entry,
  tripId,
  generation,
  isCurrent,
  onBack,
  onOpenJob,
}: {
  entry: DocumentListEntry;
  tripId: string;
  generation: number;
  isCurrent(): boolean;
  onBack(): void;
  onOpenJob(id: string): void;
}) {
  useUiLocale();
  const styles = useThemedStyles(createStyles);
  // Native button labels need fresh measurement after a hot Dynamic Type change.
  const { fontScale } = useWindowDimensions();
  const [pages, setPages] = useState<Page[]>([{ document: entry }]);
  const page = pages.at(-1)!;
  const [items, setItems] = useState<Item[]>([]),
    [batches, setBatches] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(true),
    [error, setError] = useState(false);
  const [text, setText] = useState<string | null>(null),
    [originalError, setOriginalError] = useState(false);
  const [opening, setOpening] = useState(false);
  const current = useRef(isCurrent);
  useEffect(() => {
    current.current = isCurrent;
  }, [isCurrent]);
  const document = "document" in page ? page.document : null;
  const batch = "batch" in page ? page.batch : null;
  const capture = "capture" in page ? page.capture : null;
  const [batchError, setBatchError] = useState(false);
  const [results, setResults] = useState<Awaited<
    ReturnType<Reader["batchResults"]>
  > | null>(null);
  const [resultError, setResultError] = useState(false);
  useFocusEffect(
    useCallback(() => {
      if (capture) return;
      let alive = true;
      const valid = () => alive && current.current();
      setItems([]);
      setBatches([]);
      setBatchError(false);
      setResults(null);
      setResultError(false);
      setError(false);
      setLoading(true);
      setText(null);
      setOriginalError(false);
      void (async () => {
        const reader = await localItemImportOriginals(tripId, undefined, generation);
        const docs = await reader.metadata();
        const ids = document
          ? [document.id]
          : (batch?.documents ?? []).map((row) => row.id);
        if (ids.some((id) => !docs.some((row) => row.id === id)))
          throw Error("DOCUMENT_ACCESS_CHANGED");
        const linked = new Map<string, Item>();
        for (const id of ids)
          for (const item of await reader.relationships(id)) linked.set(item.id, item);
        let imports: Batch[] = [];
        if (document)
          try {
            imports = await reader.batches(document.id);
          } catch {
            if (valid()) setBatchError(true);
          }
        if (valid()) {
          setItems([...linked.values()]);
          setBatches(imports);
          setLoading(false);
        }
        if (batch) {
          try {
            const observed = await reader.batchResults(batch.jobId, batch.batchId);
            if (valid()) setResults(observed);
          } catch {
            if (valid()) setResultError(true);
          }
        }
      })()
        .catch(() => {
          if (valid()) setError(true);
        })
        .finally(() => {
          if (valid()) setLoading(false);
        });
      return () => {
        alive = false;
      };
    }, [tripId, generation, document, batch, capture]),
  );
  const back = () => {
    if (!current.current()) return;
    if (pages.length > 1) setPages(pages.slice(0, -1));
    else onBack();
  };
  async function openOriginal() {
    if (!document || opening || !current.current()) return;
    setOpening(true);
    setOriginalError(false);
    setText(null);
    try {
      const reader = await localItemImportOriginals(tripId, undefined, generation);
      const original = await reader.original(document.id);
      if (!current.current()) return;
      if (!original) throw Error("IMPORT_ORIGINAL_UNAVAILABLE");
      if (original.document.mediaType === "text/plain")
        setText(new TextDecoder("utf-8", { fatal: true }).decode(original.bytes));
      else {
        const { previewImportOriginal } = await import("@/native/importOriginalPreview");
        await previewImportOriginal(original, () => current.current());
      }
    } catch {
      if (current.current()) setOriginalError(true);
    } finally {
      if (current.current()) setOpening(false);
    }
  }
  if (capture)
    return (
      <View key={fontScale} style={styles.body}>
        <UiButton variant="text" label={t("common.back")} onPress={back} />
        <ImportDocumentsPanel
          accountId={capture.accountId}
          tripId={capture.tripId}
          scope={capture.tripId ? "TRIP" : "PERSONAL_INBOX"}
          captureId={capture.captureId}
          showHistoricalLinks={false}
          isCurrent={() => current.current()}
          onOpenDocument={() => {}}
          onOpenActivity={(jobId) => {
            if (!current.current()) return;
            const parent = pages.at(-2);
            if (parent && "batch" in parent && parent.batch.jobId === jobId)
              setPages(pages.slice(0, -1));
            else onOpenJob(jobId);
          }}
        />
      </View>
    );
  return (
    <View key={fontScale} style={styles.body}>
      <UiButton variant="text" label={t("common.back")} onPress={back} />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
      >
        <UiText style={styles.title}>
          {document?.title ?? t("documents.importBatch")}
        </UiText>
        {document ? (
          <>
            <UiText style={styles.meta}>
              {t(documentFormatLabel[documentFormat(document)])}
              {document.byteCount
                ? ` · ${t("documents.byteSize", { count: formatUiNumber(document.byteCount) })}`
                : ""}
            </UiText>
            <UiText style={styles.meta}>
              {t(
                document.visibility === "GROUP"
                  ? "documents.sharedTrip"
                  : document.visibility === "SELECTED_PERSONS"
                    ? "documents.sharedPeople"
                    : "importDocuments.private",
              )}
            </UiText>
            <UiText style={styles.meta}>{t("documents.localOnly")}</UiText>
            {batchError ? (
              <UiText style={styles.title} accessibilityRole="alert">
                {t("documents.batchUnavailable")}
              </UiText>
            ) : null}
            {batches.map((batch) => (
              <UiButton
                key={batch.jobId}
                variant="secondary"
                label={t("documents.viewBatch", {
                  date: formatUiDate(new Date(batch.createdAt), {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  }),
                })}
                onPress={() => {
                  if (current.current()) setPages([...pages, { batch }]);
                }}
              />
            ))}
          </>
        ) : (
          <>
            <UiText style={styles.meta}>{t("documents.batchExplanation")}</UiText>
            {(batch?.documents ?? []).map((row) => (
              <UiButton
                key={row.id}
                variant="text"
                label={row.title}
                onPress={() => {
                  if (current.current())
                    setPages([
                      ...pages,
                      { document: { ...row, origin: "CORE", localAvailable: false } },
                    ]);
                }}
              />
            ))}
            {(batch?.otherOriginals ?? []).map((original) => (
              <UiButton
                key={original.captureId}
                variant="text"
                label={original.originalFilename ?? t("capture.ai.submittedText")}
                onPress={() => {
                  if (current.current()) setPages([...pages, { capture: original }]);
                }}
              />
            ))}
            <UiButton
              variant="secondary"
              label={t("documents.openActivity")}
              onPress={() => {
                if (current.current()) batch && onOpenJob(batch.jobId);
              }}
            />
          </>
        )}
        {batch ? (
          <>
            <UiText style={styles.heading}>{t("documents.sameImportResults")}</UiText>
            <UiText style={styles.meta}>{t("documents.resultsExplanation")}</UiText>
            {resultError || (results && results.state !== "REVIEW_READY") ? (
              <UiText style={styles.meta}>{t("documents.resultsUnavailable")}</UiText>
            ) : !results ? (
              <UiText style={styles.meta}>{t("common.loading")}</UiText>
            ) : !results.items.length ? (
              <UiText style={styles.meta}>{t("documents.noVerifiedResults")}</UiText>
            ) : (
              results.items.map((result) => (
                <View key={result.itemId} style={styles.item}>
                  <UiText style={styles.title}>{result.title}</UiText>
                  <UiText style={styles.meta}>
                    {t(
                      result.state === "complete" && result.action
                        ? resultActionKey[result.action]
                        : "documents.resultPending",
                    )}
                  </UiText>
                  {/^P[1-6]$/.test(result.family) ? (
                    <UiButton
                      variant="text"
                      label={t("documents.openItem")}
                      onPress={() => {
                        if (current.current())
                          router.push({
                            pathname:
                              `/p${result.family.slice(1)}-detail` as "/p1-detail",
                            params: { tripId, itemId: result.itemId },
                          });
                      }}
                    />
                  ) : null}
                </View>
              ))
            )}
          </>
        ) : null}
        <UiText style={styles.heading}>
          {t(document ? "documents.directItems" : "documents.batchItems")}
        </UiText>
        {!document ? (
          <UiText style={styles.meta}>{t("documents.batchItemsExplanation")}</UiText>
        ) : null}
        {loading ? (
          <UiText style={styles.title}>{t("common.loading")}</UiText>
        ) : error ? (
          <UiText style={styles.title} accessibilityRole="alert">
            {t("importDocuments.itemLinksUnavailable")}
          </UiText>
        ) : !items.length ? (
          <UiText style={styles.meta}>{t("documents.noDirectItems")}</UiText>
        ) : (
          items.map((item) => (
            <View key={item.id} style={styles.item}>
              <UiText style={styles.title}>
                {item.title || t("documents.untitledItem")}
              </UiText>
              {/^P[1-6]$/.test(item.family) ? (
                <UiButton
                  variant="text"
                  label={t("documents.openItem")}
                  onPress={() => {
                    if (current.current())
                      router.push({
                        pathname: `/p${item.family.slice(1)}-detail` as "/p1-detail",
                        params: { tripId, itemId: item.id },
                      });
                  }}
                />
              ) : null}
            </View>
          ))
        )}
        {document && document.canOpenOriginal !== false ? (
          <>
            <UiButton
              label={t("importDocuments.openOriginal")}
              disabled={opening}
              onPress={() => void openOriginal()}
            />
            {originalError ? (
              <UiText style={styles.title} accessibilityRole="alert">
                {t("importDocuments.originalUnavailable")}
              </UiText>
            ) : null}
            {text !== null ? (
              <UiText style={styles.title} selectable>
                {text}
              </UiText>
            ) : null}
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}
const createStyles = (colors: UiColors) =>
  StyleSheet.create({
    body: { flex: 1, backgroundColor: colors.background },
    content: {
      padding: visual.space.page,
      gap: visual.space.card,
      paddingBottom: visual.space.section,
    },
    title: { ...visual.type.row, color: colors.textPrimary },
    heading: {
      ...visual.type.row,
      color: colors.textPrimary,
      marginTop: visual.space.card,
    },
    meta: { ...visual.type.meta, color: colors.textSecondary },
    item: {
      gap: 4,
      paddingVertical: visual.space.row,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.separator,
    },
  });
