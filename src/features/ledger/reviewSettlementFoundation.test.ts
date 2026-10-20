import { createElement, type ReactNode } from "react";
import { createRequire } from "node:module";
import { afterEach, expect, it, vi } from "vitest";
import { LedgerReviewFindingScreen } from "./LedgerReviewFindingScreen";
import { SettlementAdjustmentScreen } from "./SettlementAdjustmentScreen";
import { SettlementStatementScreen } from "./SettlementStatementScreen";
import { PersonalSettlementReviewScreen } from "./PersonalSettlementReviewScreen";
import { getUiLocale, setUiLocale } from "@/ui/locale";
const { renderToStaticMarkup } = createRequire(import.meta.url)("react-dom/server") as {
  renderToStaticMarkup(element: ReactNode): string;
};
const state = vi.hoisted(() => ({ appearance: "dark", human: false }));
const original = getUiLocale();
afterEach(() => {
  setUiLocale(original);
  state.human = false;
});
vi.mock("@react-native-community/datetimepicker", () => ({ default: "input" }));
vi.mock("react-native", () => ({
  useColorScheme: () => state.appearance,
  useWindowDimensions: () => ({ fontScale: 1, width: 375 }),
  ActivityIndicator: "span",
  Pressable: "button",
  ScrollView: "main",
  Text: "span",
  TextInput: "input",
  View: "div",
  KeyboardAvoidingView: "div",
  Platform: { OS: "ios" },
  StyleSheet: {
    create: (v: unknown) => v,
    flatten: (v: unknown) => (Array.isArray(v) ? Object.assign({}, ...v) : v),
  },
}));
vi.mock("expo-router", () => ({
  router: { push: vi.fn() },
  useLocalSearchParams: () => ({ id: "f", journeyId: "j" }),
  Stack: { Screen: () => null },
}));
vi.mock("@/data/repositories/defaultLedgerExpenseRepository", () => ({}));
vi.mock("@/hooks/useLedgerReview", () => ({
  useLedgerReview: () => ({
    findings: [
      {
        id: "f",
        origin: state.human ? "HUMAN" : "HEURISTIC",
        humanNote: state.human ? "Unusually large amount" : null,
        findingType: "AMOUNT_OUTLIER",
        ruleId: "AMOUNT_OUTLIER",
        status: "OPEN",
        personalDecision: "NEEDS_REVIEW",
        layer: "HEURISTIC",
        lifecycle: "ACTIVE",
        expenseId: "e",
        observationContext: {
          expenseTitleSnapshot: "Amount",
          originalMoney: { minor: 999999999, currency: "EUR", scale: 2 },
          medianMinor: 24680,
          cohortSampleSize: 5,
          ratio: 40518.6,
        },
      },
    ],
    memberNames: {},
    act: vi.fn(),
    message: null,
    isSubmitting: false,
  }),
}));
vi.mock("@/hooks/useStage7Settlement", () => ({
  useStage7Settlement: () => ({
    finalized: {
      id: "s",
      lineageSequence: 0,
      finalizedAt: "2026-09-15T00:00:00Z",
      settlementCurrency: "NZD",
      settlementScale: 2,
      balances: [
        {
          memberId: "m",
          netMinor: 12345,
          paidMinor: 15000,
          owedMinor: 2655,
          currency: "NZD",
          scale: 2,
        },
      ],
      inputs: [],
      transfers: [],
    },
    lineage: [],
    actorMemberId: "m",
    isOrganizer: true,
    exports: [],
    updating: false,
  }),
}));
vi.mock("@/hooks/usePersonalSettlementReview", () => ({
  usePersonalSettlementReview: () => ({
    state: {
      statement: {
        memberId: "m",
        paidMinor: 15000,
        shareMinor: 2655,
        balanceMinor: 12345,
        currency: "NZD",
        scale: 2,
      },
      coverage: [],
      delta: {
        netDeltaMinor: 12,
        changedExpenses: [
          {
            expenseId: "e",
            expenseTitleSnapshot: "Amount",
            oldContribution: { shareMinor: 100 },
            newContribution: { shareMinor: 112 },
            changeGroups: ["SHARE"],
          },
        ],
      },
    },
    ready: true,
    busy: false,
    setReviewState: vi.fn(),
  }),
}));
it("renders expanded operation surfaces with Dark roles and Chinese system copy, preserving user titles", () => {
  setUiLocale("zh-Hans");
  for (const [Screen, phrase] of [
    [LedgerReviewFindingScreen, "金额异常偏大"],
    [SettlementAdjustmentScreen, "选择已确认的支出"],
    [SettlementStatementScreen, "版本 #"],
    [PersonalSettlementReviewScreen, "你的当前结算"],
  ] as const) {
    const html = renderToStaticMarkup(createElement(Screen));
    expect(html).toContain(phrase);
    expect(html).toContain("background-color:#101112");
    expect(html).not.toContain("background-color:#FFFFFF");
    expect(html).not.toContain("color:#0F172A");
  }
  const finding = renderToStaticMarkup(createElement(LedgerReviewFindingScreen));
  expect(finding).toContain("Amount");
  expect(finding).toContain("行程支出中位数的 40518.6 倍");
  const preview = renderToStaticMarkup(createElement(PersonalSettlementReviewScreen));
  expect(preview).toContain("Amount");
  expect(preview).toContain("1 笔支出已更改");
  state.human = true;
  expect(renderToStaticMarkup(createElement(LedgerReviewFindingScreen))).toContain(
    "Unusually large amount",
  );
});
it("retains populated English copy and Light surface inheritance", () => {
  setUiLocale("en");
  state.appearance = "light";
  const html = renderToStaticMarkup(createElement(LedgerReviewFindingScreen));
  expect(html).toContain("Unusually large amount");
  expect(html).toContain("What we observed");
  expect(html).toContain("background-color:#FFFFFF");
  state.appearance = "dark";
});
