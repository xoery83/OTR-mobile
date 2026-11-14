import { expect, it } from "vitest";
import {
  documentFormat,
  filterDocumentRows,
  type DocumentListEntry,
} from "./documentListPresentation";
const row = (id: string, mediaType: string | null): DocumentListEntry => ({
  id,
  mediaType,
  origin: "CORE",
  title: id,
  recordedAt: null,
  byteCount: null,
  visibility: "PRIVATE",
  localAvailable: false,
});
it("uses actual MIME for all six supported formats, never filename or inferred Item type", () => {
  const rows = [
    row("fake.png", "text/plain"),
    row("pdf", "application/pdf"),
    ...["png", "jpeg", "webp", "gif"].map((x) => row(x, "image/" + x)),
    row("unknown.pdf", null),
  ];
  expect(filterDocumentRows(rows, "ALL")).toHaveLength(7);
  expect(filterDocumentRows(rows, "IMAGE")).toHaveLength(4);
  expect(filterDocumentRows(rows, "TEXT").map((x) => x.id)).toEqual(["fake.png"]);
  expect(documentFormat(rows.at(-1)!)).toBe("FILE");
});

it("offline and private filters use separate real facts, not filename or cloud inference", () => {
  const available = { ...row("local", "text/plain"), localAvailable: true };
  const shared = { ...row("remote", "text/plain"), visibility: "GROUP" as const };
  expect(filterDocumentRows([available, shared], "OFFLINE")).toEqual([available]);
  expect(filterDocumentRows([available, shared], "PRIVATE")).toEqual([available]);
});
