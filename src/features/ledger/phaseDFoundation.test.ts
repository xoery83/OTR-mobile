import { systemMessage } from "@/ui/domainLabels";
import { reviewFindingCopy } from "./settlementPresentation";
import { createElement, type ReactNode } from "react";
import { createRequire } from "node:module";
import { afterEach, expect, it, vi } from "vitest";
import { getUiLocale, setUiLocale, t } from "@/ui/locale";
import { TransferDetailScreen } from "./TransferDetailScreen";
import { ReceiptCaptureScreen } from "@/components/ReceiptCaptureScreen";
import { ExpenseConflictResolutionScreen } from "./ExpenseConflictResolutionScreen";
import {
  canonicalConflictLines,
  conflictChoices,
  conflictIntentLines,
  resolutionStatus,
} from "./expenseConflictPresentation";
import type {
  LedgerExpenseDto,
  ExpenseConflictChainResponse,
} from "@/data/repositories/ledgerExpenseConflictRepository";

const { renderToStaticMarkup } = createRequire(import.meta.url)("react-dom/server") as {
  renderToStaticMarkup(element: ReactNode): string;
};
const state = vi.hoisted(() => ({ appearance: "dark" }));
const original = getUiLocale();
afterEach(() => {
  setUiLocale(original);
  state.appearance = "dark";
});
vi.mock("@react-native-community/datetimepicker", () => ({ default: "input" }));
vi.mock("react-native", () => ({
  useColorScheme: () => state.appearance,
  useWindowDimensions: () => ({ fontScale: 2.1, width: 375 }),
  Alert: { alert: vi.fn(), prompt: vi.fn() },
  Modal: ({ visible, children }: { visible: boolean; children: ReactNode }) =>
    visible ? children : null,
  ActivityIndicator: "span",
  Pressable: "button",
  ScrollView: "main",
  Text: "span",
  TextInput: "input",
  View: "div",
  StyleSheet: {
    create: (v: unknown) => v,
    flatten: (v: unknown) => (Array.isArray(v) ? Object.assign({}, ...v) : v),
  },
}));
vi.mock("react-native-safe-area-context", () => ({ SafeAreaView: "div" }));
vi.mock("expo-router", () => ({
  router: { back: vi.fn() },
  useLocalSearchParams: () => ({ id: "e" }),
  useFocusEffect: () => undefined,
  Stack: {
    Screen: () => null,
    Toolbar: Object.assign(({ children }: { children: ReactNode }) => children, {
      Button: "button",
    }),
  },
}));
vi.mock("./PersonalPaymentSection", () => ({ PersonalPaymentSection: () => null }));
vi.mock("@/data/auth/accountGeneration", () => ({ getAccountGeneration: () => 1 }));
vi.mock("@/hooks/useLedgerActiveSync", () => ({ useLedgerActiveSync: () => undefined }));
vi.mock("@/data/repositories/ledgerExpenseConflictRepository", () => ({
  getDefaultLedgerExpenseConflictRepository: vi.fn(),
}));
vi.mock("@/data/repositories/defaultLedgerExpenseRepository", () => ({}));
vi.mock("@/data/repositories/defaultLedgerSettlementRepository", () => ({}));
vi.mock("@/data/repositories/defaultLedgerReportingRepository", () => ({}));
vi.mock("@/data/operations/kickLedgerSync", () => ({
  kickLedgerOperationalSync: vi.fn(),
}));
vi.mock("@/hooks/useReceiptCapture", () => ({
  useReceiptCapture: () => ({
    expenseId: "e",
    scan: false,
    receipts: [],
    selecting: false,
    message: "Attachment added.",
    pickPhoto: vi.fn(),
    pickDocument: vi.fn(),
  }),
}));
vi.mock("@/hooks/useStage7Settlement", () => ({
  useStage7Settlement: () => ({
    journeyId: "j",
    actorMemberId: "a",
    isOrganizer: false,
    updating: false,
    busy: false,
    message: "Paid saved. Debt changes only after Received confirmation.",
    lineage: [],
    finalized: {
      journeyId: "j",
      settlementCurrency: "NZD",
      balances: [
        { memberId: "a", displayNameSnapshot: "Journey" },
        { memberId: "b", displayNameSnapshot: "Expense" },
      ],
      transfers: [
        {
          id: "tr",
          fromMemberId: "a",
          toMemberId: "b",
          revision: 1,
          status: "OPEN",
          amount: { minor: 12345, currency: "NZD", scale: 2 },
          confirmedDischarge: { minor: 0, currency: "NZD", scale: 2 },
          confirmedRemaining: { minor: 12345, currency: "NZD", scale: 2 },
          availableToReport: { minor: 12345, currency: "NZD", scale: 2 },
          awaitingAmount: { minor: 0, currency: "NZD", scale: 2 },
          payments: [],
        },
      ],
    },
  }),
}));

it("inherits both palettes/locales across remaining route trees and preserves names", () => {
  for (const locale of ["en", "zh-Hans"] as const) {
    setUiLocale(locale);
    for (const appearance of ["light", "dark"]) {
      state.appearance = appearance;
      const transfer = renderToStaticMarkup(
        createElement(TransferDetailScreen, { journeyId: "j", transferId: "tr" }),
      );
      expect(transfer).toContain(
        locale === "en" ? "Journey pays Expense" : "Journey 向 Expense 付款",
      );
      expect(transfer).toContain(locale === "en" ? "Mark as paid" : "标记已付");
      expect(transfer).toContain(locale === "en" ? "Payment needed" : "需要付款");
      expect(transfer).toContain("123");
      const receipt = renderToStaticMarkup(createElement(ReceiptCaptureScreen));
      expect(receipt).toContain(locale === "en" ? "Attachment added." : "附件已添加。");
      expect(receipt).toContain(
        locale === "en" ? "3 attachment slots remaining" : "还可添加 3 个附件",
      );
      const conflict = renderToStaticMarkup(
        createElement(ExpenseConflictResolutionScreen),
      );
      expect(conflict).toContain(locale === "en" ? "Loading changes" : "正在加载更改");
      for (const html of [transfer, receipt, conflict])
        expect(html).toContain(
          appearance === "dark" ? "background-color:#101112" : "background-color:#F6F7F9",
        );
    }
  }
});

it("localizes conflict evidence without changing choices, Money or human fields", () => {
  const expense = {
    title: "Expense",
    description: "Review",
    category: "food",
    businessStatus: "ACCEPTED",
    payerMemberId: "a",
    settlementParticipation: "INCLUDED",
    economicDate: "2026-10-01",
    original: { minor: 12345, currency: "NZD", scale: 2 },
    valuation: null,
    participants: [{ memberId: "a", displayNameSnapshot: "Journey" }],
    splits: [
      {
        memberId: "a",
        method: "EQUAL_PERSON",
        originalMinor: 12345,
        percentageUnits: null,
        weightUnits: null,
      },
    ],
  } as unknown as LedgerExpenseDto;
  const conflict = {
    commandType: "UPDATE",
    reason: null,
    submittedIntent: {
      type: "UPDATE",
      patch: {
        descriptive: { title: "Amount", description: "Review", category: "food" },
      },
    },
  } as ExpenseConflictChainResponse["conflicts"][number];
  const snapshot = JSON.stringify({ expense, conflict });
  setUiLocale("en");
  const choices = conflictChoices(conflict).map((item) => item.choice);
  setUiLocale("zh-Hans");
  const lines = canonicalConflictLines(expense);
  expect(lines[0]).toBe("Expense");
  expect(lines).toContain("Review");
  expect(lines.join("\n")).toContain("类别：餐饮");
  expect(lines.join("\n")).toContain("付款人：Journey");
  expect(conflictIntentLines(conflict, expense).join("\n")).toContain("标题：Amount");
  expect(conflictChoices(conflict).map((item) => item.choice)).toEqual(choices);
  expect(
    resolutionStatus({ status: "RETRYABLE", responseJson: null, errorCode: null }),
  ).toContain("连接网络");
  expect(JSON.stringify({ expense, conflict })).toBe(snapshot);
});

it("keeps each finding explanation attached to its original concept", () => {
  for (const locale of ["en", "zh-Hans"] as const) {
    setUiLocale(locale);
    for (const [findingType, whyKey] of [
      ["HUMAN_CONCERN", "reviewFlow.label18"],
      ["POSSIBLE_DUPLICATE", "reviewFlow.label20"],
      ["AMOUNT_OUTLIER", "reviewFlow.label22"],
      ["RATE_OUTLIER", "reviewFlow.label24"],
      ["EVIDENCE_MISMATCH", "reviewFlow.label26"],
      ["PARTICIPANT_ANOMALY", "reviewFlow.label28"],
    ] as const) {
      expect(
        reviewFindingCopy({ origin: "HEURISTIC", findingType } as unknown as Parameters<
          typeof reviewFindingCopy
        >[0]).why,
      ).toBe(t(whyKey));
    }
  }
});

it("localizes receipt validation and late-generated operation feedback", () => {
  setUiLocale("zh-Hans");
  expect(systemMessage("Enter a Title.")).toBe("请填写标题。");
  expect(
    systemMessage(
      "Amount suggestion uses JPY; Currency is NZD. Choose JPY, or edit Amount to use NZD.",
    ),
  ).toBe("金额建议使用 JPY；当前币种为 NZD。请选择 JPY，或将金额改为使用 NZD。");
  expect(
    systemMessage("Receipt Review changed. Check the fields and confirm again."),
  ).toContain("收据审核");
  expect(systemMessage("PDF saved for offline use.")).toBe("PDF 已保存，可离线使用。");
  expect(
    systemMessage(
      "2 values are still estimated. Final settlement will be available after the reference rate is published.",
    ),
  ).toContain("2 笔金额仍为预估");
});
