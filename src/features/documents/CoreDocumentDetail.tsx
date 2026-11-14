import { useCallback, useRef, useState, useLayoutEffect } from "react";
import {
  ActionSheetIOS,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { Stack, router, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { UiButton, UiText } from "@/ui/controls";
import { AppIcon } from "@/components/AppIcon";
import { SheetHeader } from "@/components/SheetHeader";
import { t, formatUiDate, formatUiNumber } from "@/ui/locale";
import { useUiLocale } from "@/ui/useUiLocale";
import { useThemedStyles, useUiTheme } from "@/ui/theme";
import { visual } from "@/ui/visual";
import type { UiColors } from "@/ui/palette";
import { localItemImportOriginals } from "@/data/operations/localItemImportOriginals";
import {
  documentFormat,
  documentFormatLabel,
  documentSourceLabel as sourceKeys,
  type DocumentListEntry,
} from "./documentListPresentation";

type Reader = Awaited<ReturnType<typeof localItemImportOriginals>>;
type Batch = Awaited<ReturnType<Reader["batches"]>>[number];
type Item = Awaited<ReturnType<Reader["relationships"]>>[number];
type Results = Awaited<ReturnType<Reader["batchResults"]>>;
const actionKey = {
  created: "documents.resultCreated",
  linked: "documents.resultLinked",
  updated: "documents.resultUpdated",
} as const;
const formatIcons = {
  PDF: "doc.richtext",
  IMAGE: "photo",
  TEXT: "text.alignleft",
  FILE: "doc",
} as const;
const itemIcons = {
  P1: "calendar",
  P2: "airplane",
  P3: "bed.double",
  P4: "car",
  P5: "tram",
  P6: "mappin.and.ellipse",
} as const;
export function CoreDocumentDetail({
  entry,
  tripId,
  generation,
  isCurrent,
  batchJobId,
  batchId,
  informationInitially = false,
}: {
  entry: DocumentListEntry;
  tripId: string;
  generation: number;
  isCurrent(): boolean;
  batchJobId?: string;
  batchId?: string;
  informationInitially?: boolean;
}) {
  useUiLocale();
  const styles = useThemedStyles(createStyles),
    colors = useUiTheme();
  const current = useRef(isCurrent);
  useLayoutEffect(() => {
    current.current = isCurrent;
  }, [isCurrent]);
  const [items, setItems] = useState<Item[]>([]),
    [batches, setBatches] = useState<Batch[]>([]);
  const [outcomes, setOutcomes] = useState<{ batch: Batch; result: Results | null }[]>(
    [],
  );
  const [loading, setLoading] = useState(true),
    [error, setError] = useState(false),
    [batchError, setBatchError] = useState(false);
  const [available, setAvailable] = useState(entry.localAvailable),
    [opening, setOpening] = useState(false);
  const [originalError, setOriginalError] = useState(false),
    [restoreError, setRestoreError] = useState(false);
  const [text, setText] = useState<string | null>(null);
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      const valid = () => alive && current.current();
      setLoading(true);
      setError(false);
      setBatchError(false);
      setOutcomes([]);
      void (async () => {
        const reader = await localItemImportOriginals(tripId, undefined, generation);
        const doc = (await reader.metadata()).find((row) => row.id === entry.id);
        if (!doc) throw Error("DOCUMENT_ACCESS_CHANGED");
        const history = await reader.batches(entry.id).catch(() => {
          if (valid()) setBatchError(true);
          return [];
        });
        const selected = batchJobId
          ? history.filter((row) => row.jobId === batchJobId && row.batchId === batchId)
          : history;
        if (batchJobId && selected.length !== 1) throw Error("DOCUMENT_ACCESS_CHANGED");
        const linked = new Map<string, Item>();
        for (const id of batchJobId
          ? selected[0].documents.map((row) => row.id)
          : [entry.id])
          for (const item of await reader.relationships(id)) linked.set(item.id, item);
        if (!valid()) return;
        setAvailable(doc.localAvailable);
        setItems([...linked.values()]);
        setBatches(selected);
        setLoading(false);
        for (const batch of selected) {
          const result = await reader
            .batchResults(batch.jobId, batch.batchId)
            .catch(() => null);
          if (!valid()) return;
          setOutcomes((rows) => [...rows, { batch, result }]);
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
    }, [entry.id, tripId, generation, batchJobId, batchId]),
  );
  const openDocument = (document: { id: string }, origin = "CORE") => {
    if (current.current())
      router.push({
        pathname: "/document-detail",
        params: { tripId, documentId: document.id, origin },
      });
  };
  const openItem = (id: string, family: string) => {
    if (current.current() && /^P[1-6]$/.test(family))
      router.push({
        pathname: `/p${family.slice(1)}-detail` as "/p1-detail",
        params: { tripId, itemId: id },
      });
  };
  async function openOriginal(locate = false, exporting = false) {
    if (opening || !current.current()) return;
    setOpening(true);
    setOriginalError(false);
    setRestoreError(false);
    setText(null);
    let restoring = locate;
    try {
      const reader = await localItemImportOriginals(tripId, undefined, generation);
      if (locate) {
        const selected = await (
          await import("@/native/capturePicker")
        ).pickCaptureMaterial("files", () => current.current());
        if (!current.current() || !selected.length) return;
        if (selected.length !== 1) throw Error("IMPORT_ORIGINAL_MISMATCH");
        await reader.restoreOriginalFromUri(entry.id, selected[0].temporaryUri);
        if (!current.current()) return;
        setAvailable(true);
        restoring = false;
      }
      const original = await reader.original(entry.id);
      if (!current.current()) return;
      if (!original) throw Error("IMPORT_ORIGINAL_UNAVAILABLE");
      const native = await import("@/native/importOriginalPreview");
      if (exporting) await native.shareImportOriginal(original, () => current.current());
      else if (original.document.mediaType === "text/plain")
        setText(new TextDecoder("utf-8", { fatal: true }).decode(original.bytes));
      else await native.previewImportOriginal(original, () => current.current());
    } catch {
      if (current.current()) {
        setOriginalError(true);
        setRestoreError(restoring);
      }
    } finally {
      if (current.current()) setOpening(false);
    }
  }
  const at = (date: string) =>
    formatUiDate(new Date(date), { dateStyle: "medium", timeStyle: "short" });
  const summary = (
    <View style={styles.summary}>
      <View style={styles.identity}>
        <AppIcon
          name={formatIcons[documentFormat(entry)]}
          size={30}
          color={colors.textSecondary}
        />
        <View style={styles.copy}>
          <UiText style={styles.title}>{entry.title}</UiText>
          <UiText style={styles.meta}>
            {t(documentFormatLabel[documentFormat(entry)])}
            {entry.byteCount
              ? ` · ${t("documents.byteSize", { count: formatUiNumber(entry.byteCount) })}`
              : ""}
          </UiText>
        </View>
      </View>
      {entry.source ? (
        <UiText style={styles.meta}>
          {t("documents.sourceMetadata", { source: t(sourceKeys[entry.source]) })}
        </UiText>
      ) : null}
      {entry.acquiredAt ? (
        <UiText style={styles.meta}>
          {t("documents.acquiredAt", { date: at(entry.acquiredAt) })}
        </UiText>
      ) : null}
      {entry.recordedAt ? (
        <UiText style={styles.meta}>
          {t("documents.recordedAt", { date: at(entry.recordedAt) })}
        </UiText>
      ) : null}
      <UiText style={styles.meta}>
        {t(
          entry.visibility === "GROUP"
            ? "documents.sharedTrip"
            : entry.visibility === "SELECTED_PERSONS"
              ? "documents.sharedPeople"
              : "importDocuments.private",
        )}
      </UiText>
      <UiText style={styles.meta}>
        {t(available ? "documents.originalLocal" : "documents.originalUnavailable")}
      </UiText>
      <UiText style={styles.meta}>{t("documents.localOnly")}</UiText>
    </View>
  );
  return (
    <View style={styles.body}>
      <DocumentActions
        available={available && entry.canOpenOriginal !== false}
        informationInitially={informationInitially}
        onExport={() => void openOriginal(false, true)}
        isCurrent={() => current.current()}
      >
        {summary}
      </DocumentActions>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
      >
        {!batchJobId ? (
          summary
        ) : (
          <UiText style={styles.meta}>{t("documents.batchExplanation")}</UiText>
        )}
        {error ? (
          <UiText accessibilityRole="alert" style={styles.title}>
            {t("documents.denied")}
          </UiText>
        ) : null}
        {batchError ? (
          <UiText style={styles.meta}>{t("documents.batchUnavailable")}</UiText>
        ) : null}
        {batches.length ? (
          <View style={styles.section}>
            <UiText style={styles.heading}>{t("documents.sameImportResults")}</UiText>
            <UiText style={styles.meta}>{t("documents.resultsExplanation")}</UiText>
            {batches.map((batch) => {
              const result = outcomes.find(
                (row) => row.batch.jobId === batch.jobId,
              )?.result;
              return (
                <View key={batch.jobId} style={styles.section}>
                  <UiText style={styles.meta}>{at(batch.createdAt)}</UiText>
                  {result === undefined ? (
                    <UiText style={styles.meta}>{t("common.loading")}</UiText>
                  ) : !result || result.state !== "REVIEW_READY" ? (
                    <UiText style={styles.meta}>
                      {t("documents.resultsUnavailable")}
                    </UiText>
                  ) : !result.items.length ? (
                    <UiText style={styles.meta}>
                      {t("documents.noVerifiedResults")}
                    </UiText>
                  ) : (
                    result.items.map((row) => (
                      <View key={row.itemId} style={styles.row}>
                        <AppIcon
                          name={itemIcons[row.family as keyof typeof itemIcons] ?? "doc"}
                          size={20}
                          color={colors.textSecondary}
                        />
                        <View style={styles.copy}>
                          <UiText style={styles.title}>{row.title}</UiText>
                          <UiText style={styles.meta}>
                            {t(
                              row.state === "complete" && row.action
                                ? actionKey[row.action]
                                : "documents.resultPending",
                            )}
                          </UiText>
                        </View>
                        <UiButton
                          variant="text"
                          label={t("documents.openItem")}
                          disabled={row.state !== "complete"}
                          onPress={() => openItem(row.itemId, row.family)}
                        />
                      </View>
                    ))
                  )}
                  {!batchJobId ? (
                    <UiButton
                      variant="text"
                      label={t("documents.viewBatch", { date: at(batch.createdAt) })}
                      onPress={() => {
                        if (current.current())
                          router.push({
                            pathname: "/document-detail",
                            params: {
                              tripId,
                              documentId: entry.id,
                              origin: "CORE",
                              jobId: batch.jobId,
                              batchId: batch.batchId,
                            },
                          });
                      }}
                    />
                  ) : (
                    <>
                      {batch.documents.map((doc) => (
                        <UiButton
                          key={doc.id}
                          variant="text"
                          label={doc.title}
                          onPress={() => openDocument(doc)}
                        />
                      ))}
                      {batch.otherOriginals.map((doc) => (
                        <UiButton
                          key={doc.captureId}
                          variant="text"
                          label={doc.originalFilename ?? t("capture.ai.submittedText")}
                          onPress={() => openDocument({ id: doc.captureId }, "CAPTURE")}
                        />
                      ))}
                      <UiButton
                        variant="text"
                        label={t("documents.openActivity")}
                        onPress={() => {
                          if (current.current())
                            router.push({
                              pathname: "/capture",
                              params: { tripId, jobId: batch.jobId },
                            });
                        }}
                      />
                    </>
                  )}
                </View>
              );
            })}
          </View>
        ) : null}
        {!error ? (
          <View style={styles.section}>
            <UiText style={styles.heading}>
              {t(batchJobId ? "documents.batchItems" : "documents.directItems")}
            </UiText>
            {loading ? (
              <UiText style={styles.meta}>{t("common.loading")}</UiText>
            ) : !items.length ? (
              <UiText style={styles.meta}>{t("documents.noDirectItems")}</UiText>
            ) : (
              items.map((item) => (
                <View key={item.id} style={styles.row}>
                  <AppIcon
                    name={itemIcons[item.family as keyof typeof itemIcons] ?? "doc"}
                    size={22}
                    color={colors.textSecondary}
                  />
                  <View style={styles.copy}>
                    <UiText style={styles.title}>
                      {item.title || t("documents.untitledItem")}
                    </UiText>
                    {item.date || item.time ? (
                      <UiText style={styles.meta}>
                        {[item.date, item.time].filter(Boolean).join(" · ")}
                      </UiText>
                    ) : null}
                    {item.place ? (
                      <UiText style={styles.meta}>{item.place}</UiText>
                    ) : null}
                  </View>
                  <UiButton
                    variant="text"
                    label={t("documents.openItem")}
                    onPress={() => openItem(item.id, item.family)}
                  />
                </View>
              ))
            )}
          </View>
        ) : null}
        {!batchJobId && !error && entry.canOpenOriginal !== false ? (
          <View style={styles.section}>
            <UiButton
              label={t(
                available ? "importDocuments.openOriginal" : "documents.locateOriginal",
              )}
              disabled={opening}
              onPress={() => void openOriginal(!available)}
            />
            {!available ? (
              <UiText style={styles.meta}>
                {t("documents.originalMissingHelp", { name: entry.title })}
              </UiText>
            ) : null}
            {originalError ? (
              <UiText style={styles.meta} accessibilityRole="alert">
                {t(
                  restoreError
                    ? "documents.originalMismatch"
                    : "documents.originalOpenFailed",
                )}
              </UiText>
            ) : null}
            {text !== null ? (
              <UiText selectable style={styles.title}>
                {text}
              </UiText>
            ) : null}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

export function DocumentActions({
  available,
  informationInitially = false,
  onExport,
  isCurrent,
  children,
}: {
  available: boolean;
  informationInitially?: boolean;
  onExport(): void;
  isCurrent(): boolean;
  children: import("react").ReactNode;
}) {
  const styles = useThemedStyles(createStyles);
  const [information, setInformation] = useState(informationInitially),
    [menu, setMenu] = useState(false);
  const showMenu = () => {
    if (!isCurrent()) return;
    if (Platform.OS !== "ios") {
      setMenu(true);
      return;
    }
    ActionSheetIOS.showActionSheetWithOptions(
      {
        options: [
          t("documents.fileInfo"),
          t("documents.export"),
          t("documents.renameUnavailable"),
          t("documents.sharingUnavailable"),
          t("documents.moveUnavailable"),
          t("documents.removeUnavailable"),
          t("common.cancel"),
        ],
        cancelButtonIndex: 6,
        disabledButtonIndices: [...(!available ? [1] : []), 2, 3, 4, 5],
      },
      (index) => {
        if (!isCurrent()) return;
        if (index === 0) setInformation(true);
        if (index === 1) onExport();
      },
    );
  };
  return (
    <>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          icon="ellipsis"
          accessibilityLabel={t("documents.more")}
          onPress={showMenu}
        />
      </Stack.Toolbar>
      <Modal
        visible={(information || menu) && isCurrent()}
        presentationStyle="pageSheet"
        animationType="slide"
        onRequestClose={() => {
          setInformation(false);
          setMenu(false);
        }}
      >
        <SafeAreaView edges={["bottom"]} style={styles.body}>
          <SheetHeader
            category="action"
            title={t("documents.fileInfo")}
            onLeft={() => {
              setInformation(false);
              setMenu(false);
            }}
          />
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.content}
          >
            {children}
            {menu ? (
              <UiButton
                label={t("documents.export")}
                disabled={!available}
                onPress={() => {
                  setMenu(false);
                  onExport();
                }}
              />
            ) : null}
            <UiText style={styles.meta}>{t("documents.owningUnavailable")}</UiText>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </>
  );
}

const createStyles = (colors: UiColors) =>
  StyleSheet.create({
    body: { flex: 1, backgroundColor: colors.background },
    content: {
      padding: visual.space.page,
      gap: visual.space.section,
      paddingBottom: visual.space.section,
    },
    identity: { flexDirection: "row", alignItems: "center", gap: visual.space.card },
    copy: { flex: 1, gap: 4 },
    section: { gap: visual.space.card },
    summary: { gap: visual.space.heading },
    title: { ...visual.type.row, color: colors.textPrimary },
    heading: { ...visual.type.section, color: colors.textPrimary },
    meta: { ...visual.type.meta, color: colors.textSecondary },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: visual.space.card,
      paddingVertical: visual.space.row,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.separator,
    },
  });
