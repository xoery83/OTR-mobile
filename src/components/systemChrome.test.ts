import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { canEditLedgerExpense } from "@/data/repositories/ledgerExpenseEditAccess";

const read = (file: string) => readFileSync(new URL(file, import.meta.url), "utf8");

it("keeps native header visibility, routes and state contracts", () => {
  const detail = read("../features/ledger/LedgerExpenseDetailScreen.tsx");
  expect(detail).toContain("hidden={!canEdit}");
  expect(detail).toContain("canEditLedgerExpense(actor?.role, settlement)");
  expect(detail).toContain('pathname: "/expenses/new"');
  expect(detail).toContain(
    "params: { expenseId: expense.id, journeyId: expense.journeyId }",
  );
  for (const role of ["owner", "group_member", "guest", null]) {
    expect(canEditLedgerExpense(role, true)).toBe(false);
    expect(canEditLedgerExpense(role, false)).toBe(
      role === "owner" || role === "group_member",
    );
  }
  const ledger = read("../features/ledger/LedgerStage6Screen.tsx");
  expect(ledger).toContain("hidden={!journey}");
  expect(ledger).toContain("onPress={openNewExpense}");
  expect(ledger).toContain("openSearch();");
  expect(ledger).toContain("journeySearch.current?.blur();");
  expect(ledger).toContain('setJourneyQuery("");');
  const search = read("../features/ledger/LedgerSearchScreen.tsx");
  expect(search).toContain("<Stack.Toolbar.Badge");
  expect(search).toContain("{String(filterCount)}");
  expect(search).toContain('t("search.activeFilters", { count: filterCount })');
  expect(search).toContain("onPress={() => setFilterOpen(true)}");
  const analysis = read("../features/ledger/LedgerAnalysisScreen.tsx");
  expect(analysis).toContain("hidden={!presets.length}");
  expect(analysis).toContain("selected={Boolean(view?.range.from)}");
  for (const source of [
    detail,
    ledger,
    search,
    analysis,
    read("./ReceiptCaptureScreen.tsx"),
  ]) {
    expect(source).toMatch(
      /<Stack.Toolbar placement="(?:right|left)">\s*<Stack.Toolbar.Button/,
    );
    expect(source).not.toContain("headerRight:");
    expect(source).not.toContain("HeaderIconAction");
  }
});

it("keeps overlay dismissal lightweight with a labeled 44pt target", () => {
  const dismiss = read("./OverlayDismissAction.tsx");
  expect(dismiss).toContain("accessibilityLabel={label}");
  expect(dismiss).toContain('accessibilityRole="button"');
  expect(dismiss).toContain("onPress={onPress}");
  expect(dismiss).toContain("minWidth: 44");
  expect(dismiss).toContain("minHeight: 44");
  expect(dismiss).not.toMatch(/backgroundColor|borderRadius|shadow/);
  const viewer = read("../features/ledger/ExpenseAttachmentViewer.tsx");
  expect(viewer).toContain('label={t("ui.closeAttachmentPreview")}');
  expect(viewer).toContain("color={colors.mediaText}");
  expect(viewer).toContain("onPress={onClose}");
  const capture = read("./ReceiptCaptureScreen.tsx");
  expect(capture).toContain("onPress={() => router.back()}");
  expect(capture).toContain(
    'accessibilityLabel={scan ? t("common.cancel") : t("common.close")}',
  );
});
