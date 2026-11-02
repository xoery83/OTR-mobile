import { createElement } from "react";
import { createRequire } from "node:module";
import { expect, it, vi } from "vitest";
import { ImportUpdatesSection } from "./ImportUpdatesSection";
const { renderToStaticMarkup } = createRequire(import.meta.url)("react-dom/server") as {
  renderToStaticMarkup(element: ReturnType<typeof createElement>): string;
};
const fixture = vi.hoisted(() => ({ cards: [] as Record<string, unknown>[] }));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: (initial: unknown) => [
    initial === null ? { scope: "1:trip", cards: fixture.cards, context: {} } : initial,
    vi.fn(),
  ],
}));
vi.mock("expo-router", () => ({ useFocusEffect: vi.fn() }));
vi.mock("react-native", () => ({ View: "div" }));
vi.mock("@/ui/controls", () => ({
  UiSection: "section",
  UiText: "span",
  UiButton: ({ label }: { label: string }) => createElement("button", null, label),
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
  reopenDefaultUniversalImportUpdate: () => {
    throw Error("UNEXPECTED_IO");
  },
}));
function render(query = "") {
  return renderToStaticMarkup(
    createElement(ImportUpdatesSection, {
      generation: 1,
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
it("renders registered time separately from unchanged event time and searches existing display names", () => {
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
  expect(html).toContain("capture.progress.registered");
  expect(html).toContain("2026-11-01T19:26:26.000Z");
  expect(html).toContain("2026-11-01T19:38:42.000Z");
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
