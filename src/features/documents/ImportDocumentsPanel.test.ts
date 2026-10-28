import type { ReactElement } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { ImportDocumentsPanel } from "./ImportDocumentsPanel";
import { ImportDocumentsList, ImportDocumentDetail } from "./ImportDocuments";
import type { ImportDocument } from "@/data/repositories/importDocumentsRepository";
const h = vi.hoisted(() => ({
  slots: [] as unknown[],
  cursor: 0,
  effects: [] as (() => void)[],
  mounted: false,
  generation: 1,
  accountId: "qa",
  list: vi.fn(),
  read: vi.fn(),
  original: vi.fn(),
}));
vi.mock("react", () => ({
  useState(initial: unknown) {
    const i = h.cursor++;
    if (!(i in h.slots)) h.slots[i] = initial;
    return [
      h.slots[i],
      (value: unknown) => {
        h.slots[i] = typeof value === "function" ? value(h.slots[i]) : value;
      },
    ];
  },
  useRef(initial: unknown) {
    const i = h.cursor++;
    if (!(i in h.slots)) h.slots[i] = { current: initial };
    return h.slots[i];
  },
  useLayoutEffect(effect: () => void) {
    effect();
  },
  useEffect(effect: () => void) {
    if (!h.mounted) h.effects.push(effect);
  },
}));
vi.mock("./ImportDocuments", () => ({
  ImportDocumentsList: vi.fn(),
  ImportDocumentDetail: vi.fn(),
}));
vi.mock("@/data/auth/accountGeneration", () => ({
  getAccountGeneration: () => h.generation,
}));
vi.mock("@/data/auth/authRepository", () => ({
  requireActiveUserId: async () => h.accountId,
}));
vi.mock("@/data/operations/defaultImportDocuments", () => ({
  getDefaultImportDocumentsRepository: async () => ({
    list: h.list,
    read: h.read,
    original: h.original,
  }),
}));
const doc = {
  captureId: "capture-a",
  accountId: "qa",
  tripId: null,
  kind: "TEXT",
  sha256: "a".repeat(64),
  recordedAt: "2026-10-28T00:00:00Z",
} as ImportDocument;
function Harness(captureId?: string) {
  h.cursor = 0;
  h.effects = [];
  const element = ImportDocumentsPanel({
    accountId: "qa",
    tripId: null,
    scope: "PERSONAL_INBOX",
    captureId,
    isCurrent: () => true,
    onOpenDocument: vi.fn(),
    onOpenActivity: vi.fn(),
  });
  const Component = element.type as (
    props: unknown,
  ) => ReactElement<Record<string, unknown>>;
  const output = Component(element.props);
  h.effects.forEach((effect) => effect());
  h.mounted = true;
  return output;
}
const settle = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};
beforeEach(() => {
  vi.clearAllMocks();
  h.slots = [];
  h.mounted = false;
  h.generation = 1;
  h.accountId = "qa";
  h.list.mockResolvedValue([doc]);
  h.read.mockResolvedValue(doc);
  h.original.mockResolvedValue({
    document: doc,
    bytes: new TextEncoder().encode("retained original"),
  });
});
it("loads a private list and opens verified retained text through the repository", async () => {
  Harness();
  await settle();
  const list = Harness();
  expect(list.type).toBe(ImportDocumentsList);
  expect(list.props.documents).toEqual([doc]);
  expect(h.original).not.toHaveBeenCalled();
  h.slots = [];
  h.mounted = false;
  Harness(doc.captureId);
  await settle();
  const detail = Harness(doc.captureId);
  expect(detail.type).toBe(ImportDocumentDetail);
  (detail.props.onOpenOriginal as (id: string) => void)(doc.captureId);
  await settle();
  expect(Harness(doc.captureId).props.original).toEqual({
    captureId: doc.captureId,
    sha256: doc.sha256,
    text: "retained original",
  });
});
it("discards an original that completes after Account scope is invalidated", async () => {
  Harness(doc.captureId);
  await settle();
  let finish!: (value: unknown) => void;
  h.original.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  (Harness(doc.captureId).props.onOpenOriginal as (id: string) => void)(doc.captureId);
  await settle();
  h.generation++;
  finish({ document: doc, bytes: new TextEncoder().encode("private old account") });
  await settle();
  expect(Harness(doc.captureId).props.original).toBeNull();
});
it("does not decode a PDF as text or pretend a viewer exists", async () => {
  const pdf = {
    ...doc,
    kind: "FILE",
    declaredContentType: "application/pdf",
    originalFilename: "source.pdf",
  };
  h.read.mockResolvedValue(pdf);
  h.original.mockResolvedValue({
    document: pdf,
    bytes: new TextEncoder().encode("%PDF-1.7"),
  });
  Harness(doc.captureId);
  await settle();
  (Harness(doc.captureId).props.onOpenOriginal as (id: string) => void)(doc.captureId);
  await settle();
  const detail = Harness(doc.captureId);
  expect(detail.props.original).toBeNull();
  expect(detail.props.error).toBe(true);
});
