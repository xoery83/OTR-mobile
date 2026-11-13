import { createElement } from "react";
import { createRequire } from "node:module";
import { beforeEach, expect, it, vi } from "vitest";
import { UniversalV3ResultPresentation } from "./UniversalV3ResultPresentation";
import { setUiLocale, t } from "@/ui/locale";
const { renderToStaticMarkup } = createRequire(import.meta.url)("react-dom/server");
const h = vi.hoisted(() => ({ buttons: new Map<string, any>(), recovery: false }));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: () => [h.recovery, () => {}],
}));
vi.mock("react-native", () => ({
  View: "div",
  Pressable: "button",
  StyleSheet: { create: (s: unknown) => s, hairlineWidth: 1 },
}));
vi.mock("@/components/AppIcon", () => ({ AppIcon: () => null }));
vi.mock("@/ui/theme", () => ({ useThemedStyles: () => ({}), useUiTheme: () => ({}) }));
vi.mock("@/ui/controls", () => ({
  UiText: (p: any) => createElement("span", {}, p.children),
  UiButton: (p: any) => {
    h.buttons.set(p.label, p);
    return createElement("button", {}, p.label);
  },
}));
const model = {
  batch: {
    createdAt: "2026-11-14T00:00:00Z",
    accountId: "actor",
    jobId: "job",
    context: { tripPrior: { id: "trip" } },
  },
  inputs: [],
} as any;
const base = {
  model,
  resultReady: true,
  state: "attention" as const,
  results: [
    {
      itemId: "item",
      title: "Hotel",
      family: "P3",
      action: "linked" as const,
      state: "complete" as const,
      documentIds: ["a", "b"],
      recordedAt: "2026-11-14T00:02:00Z",
      businessDate: "2026-12-18",
      place: "Auckland",
    },
  ],
  operations: [],
  reviewCount: 1,
  abstainCount: 1,
  isCurrent: () => true,
  onReconcile: vi.fn(),
};
beforeEach(() => {
  setUiLocale("en");
  h.buttons.clear();
  h.recovery = false;
});
it.each(["en", "zh-Hans"] as const)(
  "separates business categories from operation outcomes and always permits Done in %s",
  (locale) => {
    setUiLocale(locale);
    const done = vi.fn(),
      review = vi.fn();
    const html = renderToStaticMarkup(
      createElement(UniversalV3ResultPresentation, {
        ...base,
        onDone: done,
        onReview: review,
      }),
    );
    expect(html).toContain(
      t("capture.results.group", { label: t("formEntry.stay"), count: 1 }),
    );
    expect(html).toContain(
      t("capture.results.group", { label: t("capture.results.linked"), count: 1 }),
    );
    expect(html).not.toContain(
      t("capture.results.group", { label: t("capture.results.created"), count: 0 }),
    );
    expect(html).toContain("Auckland");
    expect(html).toContain(t("capture.results.notCreated", { count: 1 }));
    expect(h.buttons.get(t("common.done")).disabled).toBeUndefined();
    h.buttons.get(t("common.done")).onPress();
    expect(done).toHaveBeenCalledOnce();
    expect(review).not.toHaveBeenCalled();
  },
);
it("shows UNKNOWN without failure recovery or a second Analyze action", () => {
  const html = renderToStaticMarkup(
    createElement(UniversalV3ResultPresentation, {
      ...base,
      state: "uncertain",
      results: [{ ...base.results[0], state: "unknown" }],
      reviewCount: 0,
    }),
  );
  expect(html).toContain(t("capture.results.unknown"));
  expect(html).not.toContain(t("capture.ux.failed"));
  expect(h.buttons.has(t("capture.ai.process"))).toBe(false);
});
it("rejected original operation opens only its recovery details, not semantic Review", () => {
  h.recovery = true;
  const reconcile = vi.fn();
  const html = renderToStaticMarkup(
    createElement(UniversalV3ResultPresentation, {
      ...base,
      reviewCount: 0,
      onReconcile: reconcile,
      operations: [
        {
          candidateId: "c",
          documentIds: [],
          command: { operationId: "original-op" },
          receipt: { outcome: "REJECTED", errorCode: "PAYLOAD_INVALID" },
        },
      ] as any,
    }),
  );
  expect(html).toContain("original-op");
  expect(html).toContain("PAYLOAD_INVALID");
  expect(h.buttons.has(t("capture.results.reviewCount", { count: 0 }))).toBe(false);
  h.buttons.get(t("capture.ux.reconcile")).onPress();
  expect(reconcile).toHaveBeenCalledOnce();
});
