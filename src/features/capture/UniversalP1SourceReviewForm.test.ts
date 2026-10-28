import { createElement, type ReactNode } from "react";
import { createRequire } from "node:module";
import { beforeEach, expect, it, vi } from "vitest";
import { UniversalP1SourceReviewForm } from "./UniversalP1SourceReviewForm";
import { t, setUiLocale } from "@/ui/locale";
const { renderToStaticMarkup } = createRequire(import.meta.url)("react-dom/server");
const state = vi.hoisted(() => ({
  cursor: 0,
  buttons: [] as { label: string; disabled?: boolean; onPress(): void }[],
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: () => [
    ["retained original", false, "QA Trip", true, true][state.cursor++],
    vi.fn(),
  ],
  useEffect: () => {},
}));
vi.mock("@/ui/useUiLocale", () => ({ useUiLocale: () => "en" }));
vi.mock("@/ui/controls", () => ({
  UiText: (p: { children: ReactNode }) => createElement("span", {}, p.children),
  UiButton: (p: { label: string; disabled?: boolean; onPress(): void }) => {
    state.buttons.push(p);
    return createElement("button", { disabled: p.disabled }, p.label);
  },
}));
beforeEach(() => {
  state.cursor = 0;
  state.buttons = [];
  setUiLocale("en");
});
it.each([false, true])(
  "only confirmed Source completion disables Save; original remains readable (complete=%s)",
  async (complete) => {
    const readOriginal = vi.fn(async () => "retained original"),
      onConfirm = vi.fn();
    renderToStaticMarkup(
      createElement(UniversalP1SourceReviewForm, {
        result: {
          tripId: "qa",
          sourceBindings: [{ alias: "S0", sourceId: "source", revision: 1 }],
        } as never,
        candidate: {
          kind: "P1",
          subtype: "ACTIVITY",
          bookingTokens: [],
          ticketTokens: [],
          fields: [
            { path: "title", raw: "QA Tour", sourceId: "S0" },
            { path: "schedule.start.local_date", raw: "2026-11-02", sourceId: "S0" },
          ],
        } as never,
        disabled: false,
        complete,
        isCurrent: () => true,
        readOriginal,
        onConfirm,
      }),
    );
    const save = state.buttons.find((b) => b.label === t("capture.ai.p1Confirm"))!;
    expect(save.disabled).toBe(complete);
    save.onPress();
    expect(onConfirm).toHaveBeenCalledTimes(complete ? 0 : 1);
    const original = state.buttons.find(
      (b) => b.label === t("capture.ai.p1OpenOriginal"),
    )!;
    expect(original.disabled).toBe(false);
    original.onPress();
    await Promise.resolve();
    expect(readOriginal).toHaveBeenCalledOnce();
  },
);
