import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { DocumentActions } from "./CoreDocumentDetail";
import { ScrollView } from "react-native";
import { UiButton, UiSection, UiText } from "@/ui/controls";
import { useUiTheme } from "@/ui/theme";
import { t, formatUiDate } from "@/ui/locale";
import { getAccountGeneration } from "@/data/auth/accountGeneration";
import { captureAccountRequestContext } from "@/data/auth/accountRequestContext";
import type {
  ImportDocument,
  ImportDocumentScope,
} from "@/data/repositories/importDocumentsRepository";
import { verifyUtf8TextFile } from "@/domain/capture/utf8TextFile";
import { ImportDocumentDetail, ImportDocumentsList } from "./ImportDocuments";

type Props = {
  accountId: string;
  tripId: string | null;
  scope: ImportDocumentScope;
  captureId?: string;
  originalBatchId?: string;
  onOriginalDismiss?(): void;
  showHistoricalLinks?: boolean;
  detailActions?: boolean;
  informationInitially?: boolean;
  informationOnly?: boolean;
  informationMenu?: boolean;
  onInformationVerified?(): (() => void) | undefined;
  openInformation?(menu: boolean): boolean;
  showBackdrop?: boolean;
  isCurrent(): boolean;
  onOpenDocument(captureId: string): void;
  onOpenActivity(jobId: string): void;
  previewOriginal?(
    original: { document: ImportDocument; bytes: Uint8Array },
    isCurrent: () => boolean,
    displayName: string,
  ): Promise<void>;
};

// Native owns routing; an identity change remounts this private read surface.
export function ImportDocumentsPanel(props: Props) {
  return (
    <ScopedDocuments
      key={`${props.accountId}:${props.scope}:${props.tripId ?? ""}:${props.captureId ?? ""}:${props.originalBatchId ?? ""}`}
      {...props}
    />
  );
}
function ScopedDocuments(props: Props) {
  const colors = useUiTheme();
  const [linkedItems, setLinkedItems] = useState<number | null>(null);
  const [linksUnavailable, setLinksUnavailable] = useState(false);
  const [linksLoading, setLinksLoading] = useState(
    props.scope === "TRIP" && props.showHistoricalLinks !== false,
  );
  const [linksRetry, setLinksRetry] = useState(0);
  const [documents, setDocuments] = useState<ImportDocument[]>([]);
  const inventory = useRef(documents);
  const [document, setDocument] = useState<ImportDocument | null>(null);
  const [original, setOriginal] = useState<{
    captureId: string;
    sha256: string;
    text: string;
  } | null>(null);
  const [loading, setLoading] = useState(true),
    [opening, setOpening] = useState(false);
  const [error, setError] = useState(false),
    [hasMore, setHasMore] = useState(false);
  const { onInformationVerified } = props;
  useLayoutEffect(() => {
    if (document && !loading && !error) return onInformationVerified?.();
  }, [onInformationVerified, document, loading, error]);
  const generation = useRef(getAccountGeneration()),
    alive = useRef(true),
    sequence = useRef(0);
  const visible = props.isCurrent();
  const wasVisible = useRef(visible);
  const view = useRef(props.isCurrent);
  useLayoutEffect(() => {
    view.current = props.isCurrent;
  }, [props.isCurrent]);
  const scopeCurrent = () =>
    alive.current && generation.current === getAccountGeneration();
  const current = () => scopeCurrent() && view.current();
  async function reader() {
    if (!current()) throw Error("DOCUMENTS_STALE");
    const [{ requireActiveUserId }, { getDefaultImportDocumentsRepository }] =
      await Promise.all([
        import("@/data/auth/authRepository"),
        import("@/data/operations/defaultImportDocuments"),
      ]);
    if (!current()) throw Error("DOCUMENTS_STALE");
    const context = await captureAccountRequestContext(
      props.scope === "TRIP" ? (props.tripId ?? "") : "",
      requireActiveUserId,
    );
    if (!current() || context.accountId !== props.accountId)
      throw Error("DOCUMENTS_STALE");
    const repository = await getDefaultImportDocumentsRepository();
    if (!current()) throw Error("DOCUMENTS_STALE");
    return { context, repository };
  }
  async function load(more = false) {
    if (!current() || documents !== inventory.current) return;
    const request = ++sequence.current;
    try {
      const { context, repository } = await reader();
      if (!current() || request !== sequence.current) return;
      setLoading(true);
      setError(false);
      if (props.captureId) {
        const next = props.originalBatchId
          ? await repository.readBatchMaterial(context, props.scope, props.captureId)
          : await repository.read(context, props.scope, props.captureId);
        if (current() && request === sequence.current) setDocument(next);
      } else {
        const tail = more ? documents.at(-1) : undefined;
        const next = await repository.list(
          context,
          props.scope,
          tail
            ? { before: { recordedAt: tail.recordedAt, captureId: tail.captureId } }
            : {},
        );
        if (current() && request === sequence.current) {
          const refreshed = more
            ? [
                ...documents,
                ...next.filter(
                  (row) => !documents.some((old) => old.captureId === row.captureId),
                ),
              ]
            : next;
          inventory.current = refreshed;
          setDocuments(refreshed);
          setHasMore(next.length === 30);
        }
      }
    } catch {
      if (current() && request === sequence.current) setError(true);
    } finally {
      if (scopeCurrent() && request === sequence.current) setLoading(false);
    }
  }
  async function openOriginal(captureId: string) {
    if (!current() || opening || captureId !== props.captureId) return;
    const request = ++sequence.current;
    setOpening(true);
    setError(false);
    setOriginal(null);
    let phase = "REPOSITORY_READ";
    try {
      const { context, repository } = await reader();
      const batchDocument = props.originalBatchId
        ? await repository.readBatchMaterial(context, props.scope, captureId)
        : null;
      if (!current() || request !== sequence.current) return;
      if (props.originalBatchId && batchDocument?.batchId !== props.originalBatchId)
        throw Error("DOCUMENTS_SCOPE_MISMATCH");
      const scope = batchDocument?.tripId === null ? "PERSONAL_INBOX" : props.scope;
      const retained = await repository.original(context, scope, captureId);
      if (props.originalBatchId) {
        const after = await repository.readBatchMaterial(context, props.scope, captureId);
        if (
          after.tripId !== retained.document.tripId ||
          after.sha256 !== retained.document.sha256 ||
          after.batchId !== props.originalBatchId ||
          retained.document.batchId !== props.originalBatchId
        )
          throw Error("DOCUMENTS_ORIGINAL_CHANGED");
      }
      if (!current() || request !== sequence.current) return;
      if (
        retained.document.kind === "TEXT" ||
        (retained.document.kind === "FILE" &&
          retained.document.declaredContentType === "text/plain")
      ) {
        const text =
          retained.document.kind === "TEXT"
            ? new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
                retained.bytes,
              )
            : verifyUtf8TextFile(
                retained.bytes,
                retained.document.originalFilename,
                retained.document.declaredContentType,
              ).text;
        if (current() && request === sequence.current && retained.document.sha256)
          setOriginal({ captureId, sha256: retained.document.sha256, text });
      } else {
        phase = "NATIVE_PREVIEW";
        const preview =
          props.previewOriginal ??
          (await import("@/native/importOriginalPreview")).previewImportOriginal;
        if (!current() || request !== sequence.current) return;
        await preview(
          retained,
          () => current() && request === sequence.current,
          retained.document.originalFilename ?? t("capture.unnamed"),
        );
        if (current() && request === sequence.current) props.onOriginalDismiss?.();
      }
    } catch (error) {
      if (process.env.EXPO_PUBLIC_OTR_IMPORT_ORIGINAL_PREVIEW_ENABLED === "true") {
        try {
          const code =
            typeof error === "object" && error !== null && "code" in error
              ? error.code
              : error instanceof Error
                ? error.message
                : null;
          console.info(
            JSON.stringify({
              event: "import_original_preview_failure",
              phase,
              code:
                typeof code === "string" &&
                [
                  "IMPORT_ORIGINAL_INTEGRITY",
                  "IMPORT_PREVIEW_UNAVAILABLE",
                  "IMPORT_PREVIEW_UNSUPPORTED",
                  "DOCUMENTS_ORIGINAL_CHANGED",
                  "DOCUMENTS_NOT_FOUND",
                  "DOCUMENTS_SCOPE_MISMATCH",
                  "DOCUMENTS_TRIP_ACCESS",
                  "DOCUMENTS_STALE",
                ].includes(code)
                  ? code
                  : "UNCLASSIFIED",
              kind:
                error instanceof TypeError
                  ? "TYPE"
                  : error instanceof Error
                    ? "ERROR"
                    : "UNKNOWN",
            }),
          );
        } catch {
          // Diagnostics must not suppress original-unavailable recovery.
        }
      }
      if (current() && request === sequence.current) setError(true);
    } finally {
      if (scopeCurrent()) setOpening(false);
    }
  }
  useEffect(() => {
    alive.current = true;
    void Promise.resolve().then(() => {
      if (props.originalBatchId && props.captureId) return openOriginal(props.captureId);
      return load();
    });
    return () => {
      alive.current = false;
    };
    // Identity changes remount the keyed private surface.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!props.originalBatchId && visible && !wasVisible.current)
      void Promise.resolve().then(() => load());
    wasVisible.current = visible;
    // A retained view reloads only when it becomes visible again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);
  useEffect(() => {
    if (
      !document ||
      document.tripId === null ||
      props.scope !== "TRIP" ||
      !visible ||
      props.showHistoricalLinks === false
    )
      return;
    let canceled = false;
    void (async () => {
      setLinksLoading(true);
      setLinksUnavailable(false);
      const { context } = await reader();
      if (canceled || !current()) return;
      setLinkedItems(null);
      const { readDefaultImportDocumentItems } =
        await import("@/data/operations/importDocumentItems");
      if (canceled || !current()) return;
      const items = await readDefaultImportDocumentItems(
        context,
        props.scope,
        document,
        () => !canceled && current(),
      );
      if (!canceled && current()) setLinkedItems(items === null ? null : items.length);
    })()
      .catch(() => {
        if (!canceled && current()) setLinksUnavailable(true);
      })
      .finally(() => {
        if (!canceled && current()) setLinksLoading(false);
      });
    return () => {
      canceled = true;
    };
    // Parent scope remounts on Account/Trip/Capture identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [document, visible, linksRetry]);
  if (props.originalBatchId && props.captureId) {
    return (
      <ScrollView keyboardShouldPersistTaps="handled">
        <UiSection>
          {original ? (
            <UiText selectable style={{ color: colors.textPrimary }}>
              {original.text}
            </UiText>
          ) : error ? (
            <>
              <UiText accessibilityRole="alert" style={{ color: colors.textPrimary }}>
                {t("importDocuments.originalUnavailable")}
              </UiText>
              <UiButton
                variant="text"
                label={t("capture.history.retryOriginal")}
                onPress={() => void openOriginal(props.captureId!)}
              />
            </>
          ) : (
            <UiText
              accessibilityLiveRegion="polite"
              style={{ color: colors.textSecondary }}
            >
              {t("common.loading")}
            </UiText>
          )}
        </UiSection>
      </ScrollView>
    );
  }
  if (props.informationOnly && !document) return (
    <UiText accessibilityRole={error ? "alert" : undefined}>
      {t(error ? "documents.denied" : "common.loading")}
    </UiText>
  );
  if (props.captureId && document) {
    const detail = (
      <ImportDocumentDetail
        document={document}
        localOnly={props.showHistoricalLinks === false}
        linkedItems={linkedItems}
        linksUnavailable={linksUnavailable}
        linksLoading={linksLoading}
        onRetryLinks={() => {
          if (current() && !linksLoading) setLinksRetry((value) => value + 1);
        }}
        accountId={props.accountId}
        tripId={document.tripId}
        original={original}
        opening={opening}
        error={error}
        isCurrent={current}
        showBackdrop={props.showBackdrop}
        onOpenOriginal={(id) => {
          void openOriginal(id);
        }}
        onOpenActivity={props.onOpenActivity}
      />
    );
    if (!props.detailActions) return detail;
    return (
      <>
        <DocumentActions
          available={document.localAvailable === true}
          informationInitially={props.informationInitially}
          informationOnly={props.informationOnly}
          informationMenu={props.informationMenu}
          openInformation={props.openInformation}
          isCurrent={current}
          onExport={() => {
            if (!current() || opening) return;
            setOpening(true);
            setError(false);
            void (async () => {
              const { context, repository } = await reader();
              const retained = await repository.original(
                context,
                props.scope,
                document.captureId,
              );
              if (current())
                await (
                  await import("@/native/importOriginalPreview")
                ).shareImportOriginal(retained, current);
            })()
              .catch(() => {
                if (current()) setError(true);
              })
              .finally(() => {
                if (scopeCurrent()) setOpening(false);
              });
          }}
        >
          <UiText>{document.originalFilename ?? t("capture.ai.submittedText")}</UiText>
          {document.acquisitionSource ? (
            <UiText>
              {t("documents.sourceMetadata", {
                source: t(
                  document.acquisitionSource === "files"
                    ? "documents.sourceFiles"
                    : document.acquisitionSource === "photos"
                      ? "documents.sourcePhotos"
                      : document.acquisitionSource === "camera"
                        ? "documents.sourceCamera"
                        : document.acquisitionSource === "clipboard"
                          ? "documents.sourcePaste"
                          : "documents.sourceText",
                ),
              })}
            </UiText>
          ) : null}
          <UiText>
            {t("documents.acquiredAt", {
              date: formatUiDate(new Date(document.recordedAt)),
            })}
          </UiText>
          <UiText>
            {t(
              document.localAvailable
                ? "documents.originalLocal"
                : "documents.originalUnavailable",
            )}
          </UiText>
          <UiText>{t("importDocuments.private")}</UiText>
        </DocumentActions>
        {props.informationOnly ? null : detail}
      </>
    );
  }
  return (
    <ImportDocumentsList
      documents={documents}
      scope={props.scope}
      accountId={props.accountId}
      tripId={props.tripId}
      loading={loading}
      error={error}
      hasMore={hasMore}
      isCurrent={current}
      onOpen={props.onOpenDocument}
      onMore={() => {
        if (!loading) void load(true);
      }}
      onRefresh={() => {
        if (!loading) void load();
      }}
    />
  );
}
