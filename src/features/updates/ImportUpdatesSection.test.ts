import { createElement } from "react";
import { createRequire } from "node:module";
import { expect, it, vi } from "vitest";
import { ImportUpdatesSection } from "./ImportUpdatesSection";
const { renderToStaticMarkup } = createRequire(import.meta.url)("react-dom/server") as {
  renderToStaticMarkup(element: ReturnType<typeof createElement>): string;
};
const fixture = vi.hoisted(() => ({
  cards: [] as Record<string, unknown>[],
  localJobs: [] as Record<string, unknown>[],
  loading: false,
  stateSlot: 0,
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: (initial: unknown) => {
    const slot = fixture.stateSlot++;
    return [
      initial === null
        ? {
            scope: "1:trip:ALL",
            cards: fixture.cards,
            localJobs: fixture.localJobs,
            context: {},
          }
        : slot === 2
          ? fixture.loading
          : initial,
      vi.fn(),
    ];
  },
}));
vi.mock("expo-router", () => ({ useFocusEffect: vi.fn() }));
vi.mock("react-native", () => ({
  View: "div",
  Pressable: ({ children, disabled, onPress }: any) =>
    createElement("button", { disabled, onClick: onPress }, children),
  StyleSheet: { create: (v: unknown) => v, hairlineWidth: 1 },
}));
vi.mock("@/components/AppIcon", () => ({ AppIcon: () => null }));
vi.mock("@/ui/theme", () => ({ useThemedStyles: () => ({}), useUiTheme: () => ({}) }));
vi.mock("@/ui/controls", () => ({
  UiSection: "section",
  UiText: "span",
  UiButton: ({ label, disabled }: { label: string; disabled?: boolean }) =>
    createElement("button", { disabled }, label),
}));
vi.mock("@/ui/locale", () => ({
  t: (key: string) => key,
  formatUiDate: (date: Date) => date.toISOString(),
}));
vi.mock("@/data/auth/accountGeneration", () => ({
  getAccountGeneration: () => 1,
}));
vi.mock("@/data/operations/universalImportUpdates", () => ({
  readDefaultUniversalImportUpdates: () => {
    throw Error("UNEXPECTED_IO");
  },
  importUpdateReadVersion: (card: any) => JSON.stringify([card.state, card.updatedAt]),
  markDefaultUniversalImportUpdateRead: vi.fn(),
  reopenDefaultUniversalImportUpdate: () => {
    throw Error("UNEXPECTED_IO");
  },
}));
function render(
  query = "",
  otherRows: {
    batchId: string;
    at: string;
    content: ReturnType<typeof createElement>;
  }[] = [],
) {
  fixture.stateSlot = 0;
  return renderToStaticMarkup(
    createElement(ImportUpdatesSection, {
      generation: 1,
      otherRows,
      filter: {
        category: "ALL",
        unreadOnly: false,
        currentTripId: "trip",
        query,
      } as never,
      onOpen: vi.fn(),
    }),
  );
}
it("shows one original notification time in compact rows and searches existing display names", () => {
  fixture.cards = [
    {
      id: "batch",
      state: "RESULTS_READY",
      sourceDisplayName: "photo.png",
      submittedAt: "2026-11-01T19:26:26Z",
      updatedAt: "2026-11-01T19:38:42Z",
    },
  ];
  const html = render("photo.png");
  expect(html).toContain("photo.png");
  expect(html.match(/2026-11-01T19:26:26.000Z/g)).toHaveLength(1);
  expect(html).toContain("2026-11-01T19:26:26.000Z");
  expect(html).not.toContain("2026-11-01T19:38:42.000Z");
  expect(render("missing.pdf")).not.toContain("photo.png");
  fixture.cards = [
    {
      id: "text",
      state: "RESULTS_READY",
      submittedText: true,
      updatedAt: "2026-11-01T19:38:42Z",
    },
  ];
  expect(render("capture.ai.submittedText")).toContain("capture.ai.submittedText");
  fixture.cards = [
    { id: "legacy", state: "RESULTS_READY", updatedAt: "2026-11-01T19:38:42Z" },
  ];
  expect(render()).not.toContain("capture.progress.registered");
  expect(render()).toContain("2026-11-01T19:38:42.000Z");
});

it("renders a reopenable local record without fabricating Task state and replaces it with the same Batch observation", () => {
  fixture.cards = [];
  fixture.loading = true;
  const namedJob = {
      batch: {
        accountId: "account",
        createdAt: "2026-11-01T19:26:26Z",
        batchId: "local",
        jobId: "job",
        context: { tripPrior: { id: "trip" } },
        inputs: [{ originalFilename: "lantern.txt" }],
      },
      counts: { selected: 1 },
      allInputsAccepted: true,
      availableActions: { canReopen: true },
  };
  fixture.localJobs = [namedJob];
  const local = render("lantern.txt");
  expect(local).toContain("lantern.txt");
  expect(local).toContain("<button");
  expect(local).toContain("capture.progress.registered");
  expect(local).not.toContain("capture.ai.task.");
  expect(local).not.toContain("common.loading");
  expect(local).toContain("2026-11-01T19:26:26.000Z");
  expect(local).not.toContain("updates.refresh");
  expect(render("other.pdf")).not.toContain("lantern.txt");
  const untitled = { ...namedJob, batch: { ...namedJob.batch, inputs: [] } };
  fixture.localJobs = [untitled];
  expect(render()).toContain("capture.progress.singleMaterialBatchTitle");
  fixture.localJobs = [{ ...untitled, counts: { selected: 2 } }];
  expect(render()).toContain("capture.progress.batchTitle");
  fixture.cards = [
    {
      id: "batch",
      batchId: "local",
      state: "RESULTS_READY",
      sourceDisplayName: "lantern.txt",
      updatedAt: "2026-11-01T19:38:42Z",
    },
  ];
  const remote = render();
  expect(remote).toContain("capture.ai.task.RESULTS_READY");
  expect(remote).not.toContain("capture.jobView");
  fixture.localJobs = [];
  fixture.loading = false;
});

it("keeps one compact chronological row per Batch across original Import and intake records", () => {
  fixture.cards = [
    {
      id: "import-old",
      batchId: "old",
      state: "RESULTS_READY",
      sourceDisplayName: "older-import.pdf",
      submittedAt: "2026-11-01T19:26:26Z",
      updatedAt: "2026-11-03T19:26:26Z",
    },
  ];
  fixture.localJobs = [];
  const html = render("", [
    {
      batchId: "new",
      at: "2026-11-02T19:26:26Z",
      content: createElement("span", {}, "newer-intake"),
    },
    {
      batchId: "old",
      at: "2026-11-01T19:26:26Z",
      content: createElement("span", {}, "duplicate-intake"),
    },
  ]);
  expect(html.indexOf("newer-intake")).toBeLessThan(html.indexOf("older-import.pdf"));
  expect(html).not.toContain("duplicate-intake");
  expect(html.match(/older-import.pdf/g)).toHaveLength(1);
  expect(html).not.toContain("updates.importCoverage");
  expect(html).not.toContain("updates.refresh");
});
