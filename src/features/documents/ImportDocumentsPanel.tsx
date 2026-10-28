import { useEffect, useLayoutEffect, useRef, useState } from "react";
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
  isCurrent(): boolean;
  onOpenDocument(captureId: string): void;
  onOpenActivity(jobId: string): void;
  previewOriginal?(
    original: { document: ImportDocument; bytes: Uint8Array },
    isCurrent: () => boolean,
  ): Promise<void>;
};

// Native owns routing; an identity change remounts this private read surface.
export function ImportDocumentsPanel(props: Props) {
  return (
    <ScopedDocuments
      key={`${props.accountId}:${props.scope}:${props.tripId ?? ""}:${props.captureId ?? ""}`}
      {...props}
    />
  );
}
function ScopedDocuments(props: Props) {
  const [linkedItems, setLinkedItems] = useState<number | null>(null);
  const [linksUnavailable, setLinksUnavailable] = useState(false);
  const [documents, setDocuments] = useState<ImportDocument[]>([]);
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
    if (!current()) return;
    const request = ++sequence.current;
    try {
      const { context, repository } = await reader();
      if (!current() || request !== sequence.current) return;
      setLoading(true);
      setError(false);
      if (props.captureId) {
        const next = await repository.read(context, props.scope, props.captureId);
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
          setDocuments((previous) =>
            more
              ? [
                  ...previous,
                  ...next.filter(
                    (row) => !previous.some((old) => old.captureId === row.captureId),
                  ),
                ]
              : next,
          );
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
      const retained = await repository.original(context, props.scope, captureId);
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
        await preview(retained, () => current() && request === sequence.current);
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
    void Promise.resolve().then(() => load());
    return () => {
      alive.current = false;
    };
    // Identity changes remount the keyed private surface.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (visible && !wasVisible.current) void Promise.resolve().then(() => load());
    wasVisible.current = visible;
    // A retained view reloads only when it becomes visible again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);
  useEffect(() => {
    if (!document || props.scope !== "TRIP" || !visible) return;
    let canceled = false;
    void (async () => {
      const { context } = await reader();
      if (canceled || !current()) return;
      setLinkedItems(null);
      setLinksUnavailable(false);
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
    })().catch(() => {
      if (!canceled && current()) setLinksUnavailable(true);
    });
    return () => {
      canceled = true;
    };
    // Parent scope remounts on Account/Trip/Capture identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [document, visible]);
  if (props.captureId && document)
    return (
      <ImportDocumentDetail
        document={document}
        linkedItems={linkedItems}
        linksUnavailable={linksUnavailable}
        accountId={props.accountId}
        tripId={props.scope === "TRIP" ? props.tripId : null}
        original={original}
        opening={opening}
        error={error}
        isCurrent={current}
        onOpenOriginal={(id) => {
          void openOriginal(id);
        }}
        onOpenActivity={props.onOpenActivity}
      />
    );
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
