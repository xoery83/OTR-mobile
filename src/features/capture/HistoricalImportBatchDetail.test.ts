import { createElement, type ReactNode } from "react";
import { createRequire } from "node:module";
import { beforeEach, expect, it, vi } from "vitest";
import { setUiLocale } from "@/ui/locale";
import { uiPalette } from "@/ui/palette";
import { HistoricalImportBatchDetail } from "./HistoricalImportBatchDetail";

const { renderToStaticMarkup } = createRequire(import.meta.url)("react-dom/server");
const mock = vi.hoisted(() => ({
  readback: null as unknown,
  request: "loaded",
  expanded: false,
  buttons: new Map<string, () => void>(),
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: (initial: unknown) => [
    initial === null
      ? mock.readback
      : initial === "loading"
        ? mock.request
        : initial === false
          ? mock.expanded
          : initial,
    vi.fn(),
  ],
}));
vi.mock("@/components/AppIcon", () => ({ AppIcon: () => null }));
vi.mock("./CaptureActivity", () => ({ captureActivityTime: () => "Original time" }));
vi.mock("react-native", () => ({
  Pressable: ({ children }: { children: ReactNode }) =>
    createElement("div", null, children),
  View: "div",
  StyleSheet: { create: (styles: object) => styles, hairlineWidth: 1 },
}));
vi.mock("@/ui/theme", () => ({
  useUiTheme: () => uiPalette("light"),
  useThemedStyles: (styles: (colors: ReturnType<typeof uiPalette>) => unknown) =>
    styles(uiPalette("light")),
}));
vi.mock("@/ui/controls", () => ({
  UiText: ({ children }: { children: ReactNode }) =>
    createElement("span", null, children),
  UiSection: ({ title, children }: { title?: string; children: ReactNode }) =>
    createElement("section", null, title, children),
  UiButton: ({ label, onPress }: { label: string; onPress(): void }) => {
    mock.buttons.set(label, onPress);
    return createElement("button", null, label);
  },
}));

const saved = {
  itemId: "item-a",
  title: "Harbour walk",
  family: "P1",
  eventType: "activity",
  action: "created",
  state: "complete",
};
const props = {
  model: {
    batch: { context: { tripPrior: { id: "trip-a" } }, jobId: "original-job" },
    inputs: [{ id: "input-a", kind: "TEXT", state: "ACCEPTED", captureId: "capture-a" }],
  },
  activity: {
    recordedAt: "2026-11-21T02:46:00Z",
    counts: { selected: 1, accepted: 1 },
    recordedFacts: [],
  },
  tripName: "Original trip",
  isCurrent: () => true,
  onReview: vi.fn(),
  onOpenMaterial: vi.fn(),
  onOpenItem: vi.fn(),
} as unknown as Parameters<typeof HistoricalImportBatchDetail>[0];
const render = (options = props) =>
  renderToStaticMarkup(createElement(HistoricalImportBatchDetail, options)) as string;
beforeEach(() => {
  setUiLocale("en");
  mock.buttons.clear();
  mock.request = "loaded";
  mock.expanded = false;
  vi.clearAllMocks();
});

it("renders a verified item before its retained material and leaves the batch outcome unconfirmed", () => {
  mock.readback = { state: "REVIEW_READY", items: [saved] };
  const result = render();
  expect(result).toContain("Some results confirmed");
  expect(result).toContain("Results · 1 confirmed");
  expect(result).toContain("Activity");
  expect(result.indexOf("Harbour walk")).toBeLessThan(result.indexOf("Submitted text"));
  expect(result.match(/Original time/g)).toHaveLength(1);
  expect(result).not.toContain("Completed");
  expect([...mock.buttons.keys()]).toEqual([]);
  expect(result).not.toContain("Processing record");
});

it("keeps saved results visible beside review and explicit unknown outcomes", () => {
  mock.readback = {
    state: "REVIEW_READY",
    items: [
      saved,
      { ...saved, itemId: "item-b", title: "Existing tour", action: "linked" },
    ],
    planned: { needsReview: 1 },
    observations: { original: "VERIFIED", other: "OUTCOME_UNKNOWN" },
  };
  const result = render();
  expect(result).toContain("Harbour walk");
  expect(result).toContain("Existing tour");
  expect(result).toContain("Needs Review · 1");
  expect(result).toContain("Some save outcomes are still unknown");
  expect([...mock.buttons.keys()]).toEqual(["Continue review"]);
  mock.buttons.get("Continue review")?.();
  expect(props.onReview).toHaveBeenCalledExactlyOnceWith("original-job");
});

it("separates an explicitly abstained candidate from save failure and retains the material row", () => {
  mock.readback = {
    state: "REVIEW_READY",
    items: [],
    planned: { abstained: 1, needsReview: 0 },
    observations: { other: "REVIEW_REQUIRED" },
    operations: [{ candidateId: "other", receipt: { outcome: "REJECTED" } }],
  };
  const result = render();
  expect(result).toContain("Not created · 1");
  expect(result).toContain("Save failed · 1");
  expect(result).toContain("Submitted text");
  expect(result).not.toContain("Needs Review");
});

it("distinguishes the pending read from a retryable read error", () => {
  mock.readback = null;
  mock.request = "loading";
  expect(render()).toContain("Checking import results");
  expect(mock.buttons.size).toBe(0);
  mock.request = "failed";
  expect(render()).toContain("Couldn’t check import results");
  expect([...mock.buttons.keys()]).toEqual(["Retry"]);
});

it("puts expanded recorded events immediately under the disclosure", () => {
  vi.stubGlobal("__DEV__", false);
  try {
    mock.readback = { state: "REVIEW_READY", items: [] };
    const options = {
      ...props,
      activity: {
        ...props.activity,
        recordedFacts: [
          {
            id: "record-a",
            kind: "SUBMISSION_RECORDED" as const,
          inputId: null,
            at: props.activity.recordedAt,
          },
        ],
      },
    };
    expect(render(options)).not.toContain("Submission registered");
    mock.expanded = true;
    expect(render(options)).toMatch(/Processing record.*Submission registered/);
  } finally {
    vi.unstubAllGlobals();
  }
});
