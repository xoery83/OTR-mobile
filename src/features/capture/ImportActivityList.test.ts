import { createElement } from "react";
import { createRequire } from "node:module";
import { it, expect, vi } from "vitest";
import { ImportActivityList, type ActivityDirectory } from "./ImportActivityList";
import type { CaptureJobReadModel } from "@/domain/capture/captureSubmission";
const { renderToStaticMarkup } = createRequire(import.meta.url)("react-dom/server");
const inputs = vi.hoisted(() => ({
  buttons: [] as { label?: string; onPress?: () => void }[],
}));
vi.mock("react-native", () => ({
  View: "div",
  ScrollView: ({ children }: any) => createElement("main", {}, children),
  Pressable: ({ children, onPress }: any) => {
    inputs.buttons.push({ onPress });
    return createElement("button", {}, children);
  },
  ActionSheetIOS: {},
  StyleSheet: { create: (x: unknown) => x },
}));
vi.mock("@/components/AppIcon", () => ({ AppIcon: () => null }));
vi.mock("@/ui/forms", () => ({
  UiChoiceChip: ({ label, onPress }: any) => {
    inputs.buttons.push({ label, onPress });
    return createElement("button", {}, label);
  },
}));
vi.mock("@/ui/controls", () => ({
  UiText: "span",
  UiButton: ({ label }: any) => createElement("button", {}, label),
}));
vi.mock("@/ui/theme", () => ({ useThemedStyles: () => ({}), useUiTheme: () => ({}) }));
vi.mock("@/ui/useUiLocale", () => ({ useUiLocale: () => "en" }));
vi.mock("@/ui/locale", () => ({
  t: (key: string, values?: Record<string, unknown>) =>
    key + (values ? JSON.stringify(values) : ""),
  formatUiDate: (date: Date) => date.toISOString(),
}));
const job = (id: string): CaptureJobReadModel =>
  ({
    batch: {
      batchId: id,
      jobId: id,
      createdAt: "2026-11-14T00:00:00Z",
      inputs: [{ acquisitionSource: "files" }],
      context: { tripPrior: null },
    },
    inputs: [{ originalFilename: id + ".pdf" }],
    counts: { selected: 1 },
    allInputsAccepted: true,
  }) as unknown as CaptureJobReadModel;
const directory = (): ActivityDirectory => ({
  view: { current: { offset: 40 } },
  source: "ALL",
  status: "ALL",
  onFilter: vi.fn(),
  chooser: { current: null },
  collapsed: false,
  onScroll: vi.fn(),
  onSourceChange: vi.fn(),
});
it("renders one row per real Batch, no candidate count, and only loaded truthful status counts", () => {
  const html = renderToStaticMarkup(
    createElement(ImportActivityList, {
      jobs: [job("same"), job("same"), job("waiting")],
      v3: {
        same: { state: "complete", saved: 5, resultCount: 1 },
        waiting: { state: "uncertain", saved: 0 },
      },
      tasks: {},
      directory: directory(),
      loading: false,
      error: false,
      hasMore: true,
      onMore: vi.fn(),
      onRefresh: vi.fn(),
      onOpen: vi.fn(),
    }),
  );
  expect(html.match(/same.pdf/g)).toHaveLength(1);
  expect(html).toContain("activity.savedObjects{&quot;count&quot;:1}");
  expect(html).toContain("capture.activityStatus.uncertain");
  expect(html).toContain("activity.loadedCounts");
  expect(html).not.toContain('"count":5');
  expect(html).not.toContain("Check Processing Status");
});
it("restores a selected status and uses the original Job ID when opened", () => {
  inputs.buttons = [];
  const view = directory();
  view.status = "REVIEW";
  const open = vi.fn();
  const html = renderToStaticMarkup(
    createElement(ImportActivityList, {
      jobs: [job("review"), job("waiting")],
      v3: { review: { state: "attention", saved: 0 } },
      tasks: {},
      directory: view,
      loading: false,
      error: false,
      hasMore: false,
      onMore: vi.fn(),
      onRefresh: vi.fn(),
      onOpen: open,
    }),
  );
  expect(html).toContain("review.pdf");
  expect(html).not.toContain("waiting.pdf");
  inputs.buttons.filter((x) => !x.label)[0].onPress?.();
  expect(open).toHaveBeenCalledWith("review");
});
