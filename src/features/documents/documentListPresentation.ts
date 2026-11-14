import type { ImportDocument } from "@/data/repositories/importDocumentsRepository";

export type DocumentListEntry = {
  id: string;
  tripId?: string | null;
  tripTitle?: string;
  sha256?: string;
  canOpenOriginal?: boolean;
  source?: "files" | "photos" | "camera" | "magic_input" | "clipboard" | null;
  retainedText?: string | null;
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
    sha256: doc.sha256 ?? undefined,
    mediaType: doc.kind === "TEXT" ? "text/plain" : doc.declaredContentType,
    byteCount: doc.byteCount,
    recordedAt: doc.recordedAt,
    visibility: "PRIVATE",
    localAvailable: doc.localAvailable === true,
    source: doc.acquisitionSource,
    retainedText: doc.retainedText,
  };
}

export const documentFormatLabel = {
  PDF: "attachment.pdf",
  IMAGE: "importDocuments.format.IMAGE",
  TEXT: "importDocuments.format.TEXT",
  FILE: "importDocuments.format.FILE",
} as const;

// Search only retained filenames/metadata; no OCR or inferred model text.
export function searchDocumentRows(rows: readonly DocumentListEntry[], query: string) {
  const words = query
    .trim()
    .normalize("NFKC")
    .toLocaleLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  const groups = new Map<string, DocumentListEntry[]>();
  for (const row of rows) {
    if (
      !words.every((word) =>
        [row.title, row.retainedText ?? ""]
          .join(" ")
          .normalize("NFKC")
          .toLocaleLowerCase()
          .includes(word),
      )
    )
      continue;
    const key =
      row.sha256 && row.byteCount
        ? `${row.sha256}:${row.byteCount}:${row.mediaType}`
        : `${row.origin}:${row.tripId ?? ""}:${row.id}`;
    const group = groups.get(key) ?? [];
    if (
      !group.some(
        (entry) =>
          entry.id === row.id &&
          entry.tripId === row.tripId &&
          entry.origin === row.origin,
      )
    )
      group.push(row);
    groups.set(key, group);
  }
  return [...groups.values()];
}

export function mergeDocumentRows(
  core: readonly DocumentListEntry[],
  captured: readonly DocumentListEntry[],
) {
  return [
    ...core.map((row) => {
      const original = captured.find(
        (candidate) =>
          row.sha256 &&
          candidate.sha256 === row.sha256 &&
          candidate.byteCount === row.byteCount &&
          candidate.mediaType === row.mediaType,
      );
      return original
        ? { ...row, source: original.source, retainedText: original.retainedText }
        : row;
    }),
    ...captured.filter(
      (row) =>
        !core.some(
          (accepted) =>
            row.sha256 &&
            accepted.sha256 === row.sha256 &&
            accepted.byteCount === row.byteCount &&
            accepted.mediaType === row.mediaType,
        ),
    ),
  ];
}

export type DocumentSearchFilters = {
  visibility?: DocumentListEntry["visibility"];
  storage?: "LOCAL" | "UNAVAILABLE";
  source?: NonNullable<DocumentListEntry["source"]>;
  from?: Date;
  to?: Date;
};
export function filterDocumentSearch(
  rows: readonly DocumentListEntry[],
  filters: DocumentSearchFilters,
) {
  const day = (date: Date) =>
    new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  return rows.filter((row) => {
    if (filters.visibility && row.visibility !== filters.visibility) return false;
    if (filters.storage && row.localAvailable !== (filters.storage === "LOCAL"))
      return false;
    if (filters.source && row.source !== filters.source) return false;
    if (filters.from || filters.to) {
      if (!row.recordedAt) return false;
      const at = new Date(row.recordedAt);
      if (
        !Number.isFinite(at.getTime()) ||
        (filters.from && day(at) < day(filters.from)) ||
        (filters.to && day(at) > day(filters.to))
      )
        return false;
    }
    return true;
  });
}

// Layout/inset changes must not reopen chrome during the same upward gesture.
export function documentChromeAfterScroll(
  collapsed: boolean,
  offset: number,
  distance: number,
  dragging: boolean,
) {
  if (!dragging) return collapsed;
  if (distance > 6) return true;
  if (distance < -6 && offset <= 0) return false;
  return collapsed;
}
