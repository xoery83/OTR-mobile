import type { ImportDocument } from "@/data/repositories/importDocumentsRepository";

export type DocumentListEntry = {
  id: string;
  origin: "CORE" | "CAPTURE";
  title: string;
  mediaType: string | null;
  byteCount: number | null;
  recordedAt: string | null;
  localAvailable: boolean;
  visibility: "PRIVATE" | "GROUP" | "SELECTED_PERSONS";
};
export type DocumentFormat = "ALL" | "PDF" | "IMAGE" | "TEXT" | "PRIVATE" | "OFFLINE";
export function documentFormat(entry: Pick<DocumentListEntry, "mediaType">) {
  return entry.mediaType === "application/pdf"
    ? "PDF"
    : entry.mediaType?.startsWith("image/")
      ? "IMAGE"
      : entry.mediaType === "text/plain"
        ? "TEXT"
        : "FILE";
}
export function filterDocumentRows(
  rows: readonly DocumentListEntry[],
  format: DocumentFormat,
) {
  return rows.filter(
    (entry) =>
      format === "ALL" ||
      (format === "PRIVATE"
        ? entry.visibility === "PRIVATE"
        : format === "OFFLINE"
          ? entry.localAvailable
          : documentFormat(entry) === format),
  );
}
export function captureDocumentRow(
  doc: ImportDocument,
  fallbackTitle: string,
): DocumentListEntry {
  return {
    id: doc.captureId,
    origin: "CAPTURE",
    title: doc.originalFilename ?? fallbackTitle,
    mediaType: doc.kind === "TEXT" ? "text/plain" : doc.declaredContentType,
    byteCount: doc.byteCount,
    recordedAt: doc.recordedAt,
    visibility: "PRIVATE",
    localAvailable: false,
  };
}

export const documentFormatLabel = {
  PDF: "attachment.pdf",
  IMAGE: "importDocuments.format.IMAGE",
  TEXT: "importDocuments.format.TEXT",
  FILE: "importDocuments.format.FILE",
} as const;
