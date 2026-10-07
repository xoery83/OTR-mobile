import { segmentedControlTokens } from "./segmented";
import { lightPalette, darkPalette } from "./palette";
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ts from "typescript";
import { expect, it } from "vitest";
import { representativeFiles, scanUiSource } from "../../scripts/ui/guard";
import { getUiLocale, setUiLocale } from "./locale";
import { categoryLabel, domainLabel, systemMessage } from "./domainLabels";

it("checks complete representative UI trees without legacy baseline forgiveness", () => {
  const files = representativeFiles(process.cwd());
  for (const required of [
    "TransferDetailScreen",
    "ExpenseConflictResolutionScreen",
    "ReceiptCaptureScreen",
    "ExpenseSliceScreen",
    "LedgerReviewScreen",
    "LedgerReviewFindingScreen",
    "PersonalSettlementReviewScreen",
    "SettlementUpdateScreen",
    "SettlementAdjustmentScreen",
    "SettlementStatementScreen",
    "GlobalMenu",
    "AppNavigationMenu",
    "AccountManagementScreen",
    "MyLedgerScreen",
    "SpendingAnalysisSections",
    "ReceiptReviewSheet",
    "ReceiptCandidateTags",
    "ExpenseAttachmentViewer",
    "CurrencyPicker",
    "UiFoundationFixture",
    "forms",
  ])
    expect(
      files.some((file) => file.endsWith(`/${required}.tsx`)),
      required,
    ).toBe(true);
  for (const file of files)
    expect(scanUiSource(readFileSync(file, "utf8"), file, true), file).toEqual([]);
});
it("automatically includes newly imported children and rejects inherited light-only forms or hidden copy", () => {
  const root = mkdtempSync(join(tmpdir(), "otr-ui-coverage-"));
  try {
    mkdirSync(join(root, "src/features/trip"), { recursive: true });
    writeFileSync(
      join(root, "src/features/trip/Screen.tsx"),
      'export {Form as default} from "./Form";',
    );
    writeFileSync(
      join(root, "src/features/trip/Form.tsx"),
      'const choices=["Food & shopping"]; const Form=()=> <TextInput/>',
    );
    const files = representativeFiles(root, ["src/features/trip/Screen.tsx"]);
    expect(files).toContain("src/features/trip/Form.tsx");
    expect(
      scanUiSource(
        readFileSync(join(root, "src/features/trip/Form.tsx"), "utf8"),
        "src/features/trip/Form.tsx",
        true,
      ).map((issue) => issue.rule),
    ).toEqual(["string", "canonical-form"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
  expect(
    scanUiSource(
      "const T=()=> <Animated.Text>Legacy overlay</Animated.Text>",
      "src/features/trip/Segment.tsx",
    ).map((i) => i.rule),
  ).toEqual(["string"]);
  for (const code of [
    'const T=()=> <DateTimePicker themeVariant="light"/>',
    'import {contentVisual as cv} from "../ledger/contentVisual"; const color=cv.color.card;',
    'const captions={title:t("common.close")};',
    'const style={experimental_backgroundImage:"linear-gradient(90deg, rgba(255,255,255,1) 0%, transparent 100%)"};',
  ])
    expect(
      scanUiSource(code, "src/features/trip/Screen.tsx", true).length,
    ).toBeGreaterThan(0);
});
it("renders only one localized text node per animated Spending/Settlement segment", () => {
  const source = readFileSync("src/features/ledger/LedgerStage6Screen.tsx", "utf8");
  const ast = ts.createSourceFile(
    "Screen.tsx",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const segment = ast.statements.find(
    (n) => ts.isFunctionDeclaration(n) && n.name?.text === "Segment",
  )!;
  const labels: string[] = [];
  const visit = (node: ts.Node) => {
    if (
      ts.isJsxElement(node) &&
      /^(?:Text|Animated\.Text)$/.test(node.openingElement.tagName.getText(ast))
    )
      labels.push(node.getText(ast));
    ts.forEachChild(node, visit);
  };
  visit(segment);
  expect(labels).toHaveLength(1);
  expect(labels[0]).toContain('t("ledger.spending")');
  expect(labels[0]).toContain('t("ledger.settlement")');
  expect(labels[0]).not.toMatch(/>\s*(Spending|Settlement)\s*</);
});
it("localizes canonical display values and known system messages while preserving business data", () => {
  const before = getUiLocale();
  try {
    setUiLocale("zh-Hans");
    expect(categoryLabel("food")).toBe("餐饮");
    expect(categoryLabel("Family dinner category")).toBe("Family dinner category");
    expect(domainLabel("RATE_REQUIRED")).toBe("需要汇率");
    expect(domainLabel("Alex")).toBe("Alex");
    expect(systemMessage("Choose an amount and participant.")).toBe(
      "请选择金额和参与者。",
    );
    expect(systemMessage("Maximum 3 attachments per expense.")).toBe(
      "每笔支出最多 3 个附件。",
    );
    setUiLocale("en");
    expect(categoryLabel("food")).toBe("Food");
  } finally {
    setUiLocale(before);
  }
});

it("localizes foundation actions and generated health messages without changing raw business or technical values", () => {
  const original = getUiLocale();
  try {
    setUiLocale("zh-Hans");
    for (const [source, display] of [
      ["Data check complete", "数据检查完成"],
      ["3 saved changes synced", "已同步 3 项已保存的更改"],
      ["1 local issue repaired", "已修复 1 个本地问题"],
      ["2 items need your attention", "2 个项目需要你关注"],
      ["Last checked 12m ago", "12 分钟前检查"],
      ["Checking shared data", "检查共享数据"],
      ["This is not an approved test account.", "这不是已批准的测试账户。"],
    ])
      expect(systemMessage(source)).toBe(display);
    expect(categoryLabel("My custom category")).toBe("My custom category");
    expect(systemMessage("DH_SYNC_OPERATION_STATE_V1")).toBe(
      "DH_SYNC_OPERATION_STATE_V1",
    );
    setUiLocale("en");
    expect(systemMessage("无法保存调试模式。")).toBe("Debug Mode could not be saved.");
  } finally {
    setUiLocale(original);
  }
});

it("shares segment foreground/surface roles across animated and static controls, separate from root tabs", () => {
  for (const colors of [lightPalette, darkPalette]) {
    const tokens = segmentedControlTokens(colors);
    expect(tokens.selectedLabel).toBe(colors.textPrimary);
    expect(tokens.label).toBe(colors.textSecondary);
    expect(tokens.selectedSurface).toBe(colors.elevatedSurface);
    expect(tokens.trackSurface).toBe(colors.controlTrack);
    expect(tokens.trackSurface).not.toBe(colors.background);
  }
  for (const name of [
    "LedgerStage6Screen",
    "MyLedgerScreen",
    "LedgerAnalysisScreen",
    "SettlementReadinessScreen",
  ]) {
    const source = readFileSync(`src/features/ledger/${name}.tsx`, "utf8");
    expect(source).toContain('from "@/ui/segmented"');
    expect(source).not.toMatch(
      /(?:segmentTextSelected|navTextActive|navTextOverlay):\s*\{\s*color: colors.accent/,
    );
  }
});
it("keeps the acceptance fixture behind persisted Debug Mode even for direct diagnostics entry", () => {
  const source = readFileSync("src/components/FoundationDiagnosticsScreen.tsx", "utf8");
  expect(source).toContain('transportMode === "dev" && debugMode');
  expect(source).toContain("readDiagnosticsDebugMode()");
  expect(source).toContain("setDebugMode(enabled)");
  expect(source).not.toContain("getDefaultLedgerReportingRepository()");
  expect(source).toContain("useFocusEffect");
  const settings = readFileSync("app/settings.tsx", "utf8");
  expect(settings).toContain("debugMode ? (");
  expect(settings).toContain('router.push("/ui-foundation-check")');
  const verification = readFileSync("app/ui-foundation-check.tsx", "utf8");
  expect(representativeFiles(process.cwd())).toContain("app/ui-foundation-check.tsx");
  expect(verification).toContain('EXPO_PUBLIC_OTR_SYNC_TRANSPORT === "dev"');
  expect(verification).toContain("developer && debugMode ? <UiFoundationFixture />");
  expect(verification).toContain("setDebugMode(preferences.debugMode)");
  expect(verification).toContain("useFocusEffect");
});
