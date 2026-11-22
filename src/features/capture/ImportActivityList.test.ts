import { createElement } from "react";
import { createRequire } from "node:module";
import { it, expect, vi } from "vitest";
import { ImportActivityList, type ActivityDirectory } from "./ImportActivityList";
import type { CaptureJobReadModel } from "@/domain/capture/captureSubmission";
const { renderToStaticMarkup } = createRequire(import.meta.url)("react-dom/server");
const inputs = vi.hoisted(() => ({
  fontScale: 1,
  buttons: [] as { label?: string; onPress?: () => void }[],
}));
vi.mock("react-native", () => ({
  View: ({ children, style }: any) =>
    createElement("div", { "data-direction": style?.flexDirection }, children),
  useWindowDimensions: () => ({ fontScale: inputs.fontScale }),

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
  UiText: ({ children, numberOfLines }: any) =>
    createElement("span", { "data-lines": numberOfLines }, children),
  UiButton: ({ label }: any) => createElement("button", {}, label),
}));
vi.mock("@/ui/theme", () => ({
  useThemedStyles: (factory: any) => factory({}),
  useUiTheme: () => ({}),
}));
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
  expect(html).toContain(
    "activity.outcome{&quot;status&quot;:&quot;capture.activityStatus.complete&quot;,&quot;count&quot;:1}",
  );
  expect(html).toContain("capture.activityStatus.uncertain");
  expect(html).toContain("activity.loadedCounts");
  expect(html.indexOf("activity.loadedCounts")).toBeGreaterThan(
    html.indexOf("waiting.pdf"),
  );
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

it("keeps source labels and Trip names while the hidden filter cannot exclude a Batch", () => {
  const file = job("file");
  const photo = job("photo");
  photo.batch.inputs = [{ acquisitionSource: "camera" }] as any;
  (file.inputs[0] as any).diagnosticName = "INTERNAL_READER_DIAGNOSTIC";
  (file.batch.context as any).tripPrior = { id: "trip" };
  const view = directory();
  view.source = "FILES";
  view.tripNames = { trip: "Auckland Weekend" };
  const html = renderToStaticMarkup(
    createElement(ImportActivityList, {
      jobs: [file, photo],
      v3: {},
      tasks: {},
      directory: view,
      loading: false,
      error: false,
      hasMore: false,
      onMore: vi.fn(),
      onRefresh: vi.fn(),
      onOpen: vi.fn(),
    }),
  );
  expect(html).toContain("file.pdf");
  expect(html).toContain("photo.pdf");
  expect(html).not.toContain("activity.sourceChooser");
  expect(html).toContain("activity.source.FILES");
  expect(html).toContain("Auckland Weekend");
  expect(html).not.toContain("INTERNAL_READER_DIAGNOSTIC");
  expect(html).not.toContain("activity.loadedCounts");
});

it("stacks the timestamp at large sizes and keeps the full title and trip context", () => {
  inputs.fontScale = 1.6;
  try {
    const html = renderToStaticMarkup(
      createElement(ImportActivityList, {
        jobs: [job("Long itinerary document filename")],
        v3: {},
        tasks: {},
        directory: directory(),
        loading: false,
        error: false,
        hasMore: false,
        onMore: vi.fn(),
        onRefresh: vi.fn(),
        onOpen: vi.fn(),
      }),
    );
    expect(html).toContain(
      "<div><span>Long itinerary document filename.pdf</span><span>2026",
    );
    expect(html).toContain("activity.context");
    expect(html).not.toContain("data-lines");
  } finally {
    inputs.fontScale = 1;
  }
});
