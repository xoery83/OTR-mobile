import { expect, it } from "vitest";
import {
  documentFormat,
  searchDocumentRows,
  mergeDocumentRows,
  filterDocumentSearch,
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

it("searches retained filenames and groups identical originals without losing authorized locations", () => {
  const first = {
    ...row("one", "application/pdf"),
    title: "Travel DETAILS.pdf",
    tripId: "trip-a",
    sha256: "a".repeat(64),
    byteCount: 100,
  };
  const second = { ...first, id: "two", tripId: "trip-b" };
  const different = { ...second, id: "three", sha256: "b".repeat(64) };
  expect(searchDocumentRows([first, second, first, different], "travel details")).toEqual(
    [[first, second], [different]],
  );
  expect(searchDocumentRows([first], "hotel")).toEqual([]);
  expect(searchDocumentRows([first], "ＴＲＡＶＥＬ")).toEqual([[first]]);
});

it("does not show retained Capture and formal Document as two originals after Save", () => {
  const accepted = {
    ...row("document", "text/plain"),
    sha256: "a".repeat(64),
    byteCount: 50,
  };
  const captured = { ...accepted, id: "capture", origin: "CAPTURE" as const };
  expect(mergeDocumentRows([accepted], [captured])).toEqual([accepted]);
  expect(mergeDocumentRows([accepted], [{ ...captured, byteCount: 51 }])).toHaveLength(2);
});

it("combines actual privacy, storage, recorded source and date facts with keyword search", () => {
  const doc = {
    ...row("receipt.txt", "text/plain"),
    localAvailable: true,
    source: "magic_input" as const,
    retainedText: "Harbour reservation",
    recordedAt: "2026-11-14T12:00:00.000Z",
  };
  const at = new Date(doc.recordedAt);
  expect(
    searchDocumentRows(
      filterDocumentSearch([doc], {
        visibility: "PRIVATE",
        storage: "LOCAL",
        source: "magic_input",
        from: at,
        to: at,
      }),
      "harbour",
    ),
  ).toEqual([[doc]]);
  expect(filterDocumentSearch([doc], { source: "files" })).toEqual([]);
  expect(filterDocumentSearch([doc], { storage: "UNAVAILABLE" })).toEqual([]);
  expect(filterDocumentSearch([doc], { from: new Date(2027, 0, 1) })).toEqual([]);
});
