import { createElement, type ReactNode } from "react";
import { createRequire } from "node:module";
import { afterEach, expect, it, vi } from "vitest";
import {
  LocalOperationsView,
  LocalOperationsDiagnostics,
} from "./LocalOperationsDiagnostics";
import { getUiLocale, setUiLocale, t } from "@/ui/locale";
import { uiPalette } from "@/ui/palette";
import type { LocalOperationsSnapshot } from "@/data/operations/localOperations";
const { renderToStaticMarkup } = createRequire(import.meta.url)("react-dom/server") as {
  renderToStaticMarkup(element: ReactNode): string;
};
const state = vi.hoisted(() => ({
  scheme: "light" as "light" | "dark",
  mode: "dev",
  enabled: [] as boolean[],
  buttons: [] as Record<string, any>[],
}));
vi.mock("@/data/sync/transportSelection", () => ({
  getSyncTransportMode: () => state.mode,
}));
vi.mock("@/hooks/useLocalOperations", () => ({
  useLocalOperations: (enabled: boolean) => {
    state.enabled.push(enabled);
    return { snapshot: null, failed: false, refreshing: false, refresh: vi.fn() };
  },
}));
vi.mock("react-native", async () => {
  const { createElement } = await import("react");
  const flatten = (v: any): any =>
    Array.isArray(v) ? Object.assign({}, ...v.filter(Boolean).map(flatten)) : v;
  const primitive = (tag: string) => (props: Record<string, any>) => {
    if (tag === "button") state.buttons.push(props);
    return createElement(
      tag,
      {
        style: flatten(props.style),
        disabled: props.disabled,
        "aria-label": props.accessibilityLabel,
        "aria-disabled": props.accessibilityState?.disabled,
        role: props.accessibilityRole,
      },
      props.children,
    );
  };
  return {
    Text: primitive("span"),
    View: primitive("div"),
    Pressable: primitive("button"),
    useColorScheme: () => state.scheme,
    StyleSheet: { create: (v: unknown) => v },
  };
});
const original = getUiLocale();
afterEach(() => {
  setUiLocale(original);
  vi.unstubAllGlobals();
  state.enabled = [];
  state.buttons = [];
  state.mode = "dev";
});
const snapshot: LocalOperationsSnapshot = {
  generation: 0,
  observedAt: "2026-10-08T00:01:00.000Z",
  coverage: {
    intake: "UNAVAILABLE",
    semanticReview: "UNAVAILABLE",
    server: "UNAVAILABLE",
    continuation: "AVAILABLE",
    sync: "LIMITED",
    dataHealth: "AVAILABLE",
  },
  dataHealth: null,
  rows: [
    {
      source: "CONTINUATION",
      correlationId: "PRIVATE_OPERATOR_ID",
      health: "UNKNOWN_OUTCOME",
      failure: "TIMEOUT",
      userActionRequired: null,
      operatorAttentionRequired: true,
      automaticRecovery: "NONE",
      sourceUpdatedAt: "2026-10-08T00:00:00.000Z",
      clock: "SERVER_OBSERVED",
      ageSeconds: null,
      passComplete: true,
      waitReason: "WAITING_FOR_REMOTE_INTELLIGENCE",
      execution: "UNKNOWN",
      installation: "PENDING",
      metering: "UNKNOWN",
      usage: {
        inputTokens: null,
        outputTokens: null,
        totalTokens: null,
        quality: "UNKNOWN",
      },
      cost: { nanos: null, currency: null, quality: "UNKNOWN" },
    },
  ],
};
it("renders truthful coverage, UNKNOWN/attention, nullable usage/cost, measured time and themed accessible refresh in both locales/palettes", () => {
  for (const scheme of ["light", "dark"] as const)
    for (const locale of ["en", "zh-Hans"] as const) {
      state.scheme = scheme;
      setUiLocale(locale);
      state.buttons = [];
      const html = renderToStaticMarkup(
        createElement(LocalOperationsView, {
          snapshot,
          failed: false,
          refreshing: true,
          onRefresh: vi.fn(),
        }),
      );
      expect(html).toContain(t("operations.title"));
      expect(html).toContain(t("operations.health.UNKNOWN_OUTCOME"));
      expect(html).toContain(t("operations.coverage.LIMITED"));
      expect(html).toContain(t("operations.coverage.UNAVAILABLE"));
      expect(html).toContain(t("operations.unknown"));
      expect(html).toContain(t("operations.clock.SERVER_OBSERVED"));
      expect(html).toContain(
        t("operations.cost", { quality: t("operations.quality.UNKNOWN") }),
      );
      expect(html).not.toContain("PRIVATE_OPERATOR_ID");
      expect(html).not.toContain("NaN");
      expect(html).not.toContain("Invalid Date");
      expect(html).toContain(uiPalette(scheme).textSecondary);
      const refresh = state.buttons.find(
        (b) => b.accessibilityLabel === t("operations.refresh"),
      )!;
      expect(refresh.disabled).toBe(true);
      expect(refresh.accessibilityState.disabled).toBe(true);
      expect(refresh.accessibilityRole).toBe("button");
    }
});
it("does not invent age for malformed/future timestamps and exposes measured seconds when known", () => {
  const row = { ...snapshot.rows[0], sourceUpdatedAt: "bad", ageSeconds: null };
  let html = renderToStaticMarkup(
    createElement(LocalOperationsView, {
      snapshot: { ...snapshot, rows: [row] },
      failed: false,
      refreshing: false,
      onRefresh: vi.fn(),
    }),
  );
  expect(html).not.toContain("Invalid Date");
  expect(html).not.toContain("NaN");
  html = renderToStaticMarkup(
    createElement(LocalOperationsView, {
      snapshot: {
        ...snapshot,
        rows: [
          {
            ...row,
            sourceUpdatedAt: snapshot.observedAt,
            clock: "DEVICE_WALL",
            ageSeconds: 60,
          },
        ],
      },
      failed: false,
      refreshing: false,
      onRefresh: vi.fn(),
    }),
  );
  expect(html).toContain(t("operations.seconds", { seconds: "60" }));
});
it("failure/empty output never claims all sources healthy", () => {
  const html = renderToStaticMarkup(
    createElement(LocalOperationsView, {
      snapshot: null,
      failed: true,
      refreshing: false,
      onRefresh: vi.fn(),
    }),
  );
  expect(html).toContain(t("operations.unavailable"));
  expect(html).not.toContain(t("common.loading"));
});
it("component denies non-DEV and wrong transport even if reached directly", () => {
  vi.stubGlobal("__DEV__", false);
  expect(renderToStaticMarkup(createElement(LocalOperationsDiagnostics))).toBe("");
  expect(state.enabled.at(-1)).toBe(false);
  vi.stubGlobal("__DEV__", true);
  state.mode = "production";
  expect(renderToStaticMarkup(createElement(LocalOperationsDiagnostics))).toBe("");
  expect(state.enabled.at(-1)).toBe(false);
  state.mode = "dev";
  expect(renderToStaticMarkup(createElement(LocalOperationsDiagnostics))).toContain(
    t("operations.title"),
  );
  expect(state.enabled.at(-1)).toBe(true);
});

it("F6 reserves empty wording for a successfully read row source in both locales", () => {
  for (const locale of ["en", "zh-Hans"] as const) {
    setUiLocale(locale);
    for (const continuation of ["DENIED", "UNAVAILABLE", "AVAILABLE", "LIMITED"] as const)
      for (const sync of ["UNAVAILABLE", "AVAILABLE", "LIMITED"] as const) {
        const html = renderToStaticMarkup(
          createElement(LocalOperationsView, {
            snapshot: {
              ...snapshot,
              rows: [],
              coverage: {
                ...snapshot.coverage,
                continuation,
                sync,
                dataHealth: "AVAILABLE",
              },
            },
            failed: false,
            refreshing: false,
            onRefresh: vi.fn(),
          }),
        );
        const readable = [continuation, sync].some(
          (c) => c === "AVAILABLE" || c === "LIMITED",
        );
        if (readable) expect(html).toContain(t("operations.empty"));
        else {
          expect(html).not.toContain(t("operations.empty"));
          expect(html).toContain(t("operations.noReadableRows"));
        }
      }
  }
});
