import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { resolve, relative, dirname } from "node:path";
import ts from "typescript";

export type Violation = { rule: string; value: string; line: number };
const textProps =
  /^(?:title|label|text|placeholder|accessibilityLabel|accessibilityHint|headerTitle|leftLabel|rightLabel|emptyLabel|busyLabel|message|action|empty|totalLabel|detail)$/;
const messageCalls =
  /^(?:set\w*(?:Error|Message)|alert|prompt|showActionSheetWithOptions)$/;
const colorLiteral =
  /^(?:#[\da-f]{3,8}|rgba?\([^)]*\)|hsla?\([^)]*\)|black|white|red|green|blue|gray|grey|transparent)$/i;
const visible = (value: string) => /[\p{L}\p{N}]/u.test(value.trim());

export function scanUiSource(
  source: string,
  file: string,
  strictFoundation = false,
): Violation[] {
  if (/\.(?:test|spec)\.[jt]sx?$/.test(file)) return [];
  if (file === "src/ui/palette.ts") return [];
  const catalog = file === "src/ui/catalogs.ts";
  const ast = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    /\.[jt]sx$/.test(file) ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const lines = source.split(/\r?\n/);
  const findings: Violation[] = [];
  const add = (node: ts.Node, rule: string, value: string) => {
    const line = ast.getLineAndCharacterOfPosition(node.getStart(ast)).line;
    const exception = lines[line - 1]
      ?.trim()
      .match(/^\/\/ ui-foundation-exception: (color|string|static-theme) -- (.{12,})$/);
    if (exception?.[1] !== rule)
      findings.push({ rule, value: value.trim().replace(/\s+/g, " "), line: line + 1 });
  };
  const isCopy = (node: ts.Node) => {
    if (
      strictFoundation &&
      ts.isStringLiteral(node) &&
      !(ts.isPropertyAssignment(node.parent) && node.parent.name === node) &&
      /[A-Za-z]{2}.*\s+.*[A-Za-z]{2}/.test(node.text)
    ) {
      let machine = false;
      for (let p = node.parent; p; p = p.parent) {
        if (
          ts.isBinaryExpression(p) &&
          [
            ts.SyntaxKind.EqualsEqualsEqualsToken,
            ts.SyntaxKind.ExclamationEqualsEqualsToken,
          ].includes(p.operatorToken.kind)
        )
          machine = true;
        if (
          ts.isCallExpression(p) &&
          /(?:startsWith|endsWith|includes|translate|t)$/.test(p.expression.getText(ast))
        )
          machine = true;
      }
      if (!machine) return true;
    }
    for (let parent = node.parent; parent; parent = parent.parent) {
      if (
        ts.isBinaryExpression(parent) &&
        [
          ts.SyntaxKind.EqualsEqualsEqualsToken,
          ts.SyntaxKind.ExclamationEqualsEqualsToken,
        ].includes(parent.operatorToken.kind)
      )
        return false;
      if (ts.isPropertyAssignment(parent) && parent.name.getText(ast) === "style")
        return false;
      if (ts.isJsxAttribute(parent))
        return (
          textProps.test(parent.name.getText(ast)) ||
          /^(?:hint|subtitle|description)$/.test(parent.name.getText(ast))
        );
      if (
        ts.isPropertyAssignment(parent) &&
        !ts.isObjectLiteralExpression(parent.initializer) &&
        textProps.test(parent.name.getText(ast).replace(/["']/g, ""))
      )
        return true;
      if (
        ts.isNewExpression(parent) &&
        /(?:Date|DateTimeFormat|NumberFormat|DisplayNames)$/.test(
          parent.expression.getText(ast),
        )
      )
        return false;
      if (
        ts.isArrayLiteralExpression(parent) &&
        parent.elements.every(
          (item) => ts.isStringLiteral(item) && /^[A-Z_]+$/.test(item.text),
        )
      )
        return false;
      if (ts.isCallExpression(parent)) {
        const name = parent.expression.getText(ast).split(".").at(-1)!;
        if (name === "t" || name === "translate" || name === "getText") return false;
        if (
          file === "src/features/ledger/MoneyText.tsx" &&
          name === "fragment" &&
          parent.arguments.indexOf(node as ts.Expression) === 2
        )
          return false; // React key, not displayed text.
        // Do not treat date keys, Intl options or a native prompt mode as UI copy.
        if (
          parent.expression.getText(ast) === "Alert.prompt" &&
          parent.arguments.indexOf(node as ts.Expression) >= 3
        )
          return false;
        if (
          [
            "DateTimeFormat",
            "NumberFormat",
            "DisplayNames",
            "Date",
            "toLocaleString",
            "toLocaleDateString",
            "endsWith",
            "includes",
          ].includes(name)
        )
          return false;
        if (
          messageCalls.test(name) ||
          parent.expression.getText(ast).startsWith("Alert.")
        )
          return true;
      }
      if (ts.isJsxElement(parent))
        return /^(?:Text|Animated\.Text|UiButton|Stack\.Toolbar\.Button)$/.test(
          parent.openingElement.tagName.getText(ast),
        );
      if (ts.isFunctionLike(parent) || ts.isStatement(parent)) return false;
    }
    return false;
  };
  const canonical = new Map([
    ["SheetHeader", "src/components/SheetHeader.tsx"],
    ["OverlayDismissAction", "src/components/OverlayDismissAction.tsx"],
    ["MoneyText", "src/features/ledger/MoneyText.tsx"],
    ["AppIcon", "src/components/AppIcon.tsx"],
  ]);
  const compatibilityNames = new Set<string>();
  for (const statement of ast.statements) {
    if (
      ts.isImportDeclaration(statement) &&
      /contentVisual/.test(statement.moduleSpecifier.getText(ast))
    ) {
      const bindings = statement.importClause?.namedBindings;
      if (bindings && ts.isNamedImports(bindings))
        for (const item of bindings.elements)
          if ((item.propertyName ?? item.name).text === "contentVisual")
            compatibilityNames.add(item.name.text);
    }
  }
  const visit = (node: ts.Node) => {
    if (
      ts.isPropertyAccessExpression(node) &&
      node.name.text === "color" &&
      compatibilityNames.has(node.expression.getText(ast))
    )
      add(node, "static-theme", node.getText(ast));
    if (
      ts.isImportDeclaration(node) &&
      node.importClause?.namedBindings &&
      /ui\/palette/.test(node.moduleSpecifier.getText(ast)) &&
      /(?:lightPalette|darkPalette)/.test(node.importClause.namedBindings.getText(ast))
    )
      add(node, "static-theme", node.importClause.namedBindings.getText(ast));
    if (
      ts.isJsxAttribute(node) &&
      ["themeVariant", "colorScheme", "keyboardAppearance"].includes(
        node.name.getText(ast),
      ) &&
      node.initializer &&
      ts.isStringLiteral(node.initializer)
    )
      add(node, "static-theme", node.getText(ast));
    if (
      ts.isCallExpression(node) &&
      ["t", "translate"].includes(node.expression.getText(ast))
    ) {
      let parent: ts.Node | undefined = node.parent;
      while (parent && !ts.isFunctionLike(parent)) parent = parent.parent;
      if (!parent) add(node, "frozen-locale", node.getText(ast));
    }
    if (
      strictFoundation &&
      file !== "src/ui/forms.tsx" &&
      ts.isJsxOpeningLikeElement(node) &&
      ["TextInput", "DateTimePicker"].includes(node.tagName.getText(ast))
    ) {
      const canonical = ast.statements.some(
        (statement) =>
          ts.isImportDeclaration(statement) &&
          statement.moduleSpecifier.getText(ast).includes("ui/forms"),
      );
      if (!canonical) add(node, "canonical-form", node.tagName.getText(ast));
    }

    const declaredName =
      ts.isFunctionDeclaration(node) || ts.isVariableDeclaration(node)
        ? node.name?.getText(ast)
        : undefined;
    if (
      declaredName &&
      canonical.has(declaredName) &&
      canonical.get(declaredName) !== file
    )
      add(node, "duplicate-control", declaredName);
    if (declaredName && /^(HeaderAction|HeaderIconAction)$/.test(declaredName))
      add(node, "deprecated-control", declaredName);
    if (
      ts.isImportDeclaration(node) &&
      /(?:HeaderIconAction|HeaderAction|ledger\/SheetHeader)/.test(
        node.moduleSpecifier.getText(ast),
      )
    )
      add(node, "deprecated-control", node.moduleSpecifier.getText(ast));
    if (ts.isJsxText(node) && visible(node.text)) add(node, "string", node.text);
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      if (
        colorLiteral.test(node.text) ||
        /(?:linear-gradient|radial-gradient)\([^)]*(?:#[\da-fA-F]{3,8}|rgba?\()/i.test(
          node.text,
        )
      )
        add(node, "color", node.text);
      else if (!catalog && visible(node.text) && isCopy(node))
        add(node, "string", node.text);
    }
    if (
      ts.isTemplateExpression(node) &&
      isCopy(node) &&
      visible(
        node.head.text + node.templateSpans.map((span) => span.literal.text).join(""),
      )
    )
      add(node, "string", node.getText(ast));
    ts.forEachChild(node, visit);
  };
  visit(ast);
  return findings;
}

export function uiFiles(root: string) {
  const walk = (path: string): string[] =>
    readdirSync(path).flatMap((name) => {
      const file = resolve(path, name);
      return statSync(file).isDirectory()
        ? walk(file)
        : /\.[jt]sx?$/.test(name)
          ? [file]
          : [];
    });
  return ["app", "src/components", "src/features", "src/ui"].flatMap((dir) =>
    walk(resolve(root, dir)),
  );
}
export function uiDebt(root: string) {
  const debt: Record<string, number> = {};
  for (const file of uiFiles(root)) {
    const path = relative(root, file);
    for (const issue of scanUiSource(readFileSync(file, "utf8"), path)) {
      const key = JSON.stringify([path, issue.rule, issue.value]);
      debt[key] = (debt[key] ?? 0) + 1;
    }
  }
  return debt;
}
export function newUiDebt(
  current: Record<string, number>,
  baseline: Record<string, number>,
) {
  return Object.entries(current).filter(([key, count]) => count > (baseline[key] ?? 0));
}

// Owner-approved representative UI roots. Relative/component imports expand coverage
// automatically, so adding a child cannot silently restore baseline debt.
export const representativeRoots = [
  "app/(tabs)/capture.tsx",
  "src/features/ledger/LedgerReviewScreen.tsx",
  "src/features/ledger/LedgerReviewFindingScreen.tsx",
  "src/features/ledger/PersonalSettlementReviewScreen.tsx",
  "src/features/ledger/SettlementUpdateScreen.tsx",
  "src/features/ledger/SettlementAdjustmentScreen.tsx",
  "src/features/ledger/SettlementStatementScreen.tsx",

  "src/components/GlobalMenu.tsx",
  "app/settings.tsx",
  "app/ui-foundation-check.tsx",
  "app/account.tsx",
  "app/data-sync.tsx",
  "app/(tabs)/expenses/currency.tsx",
  "app/(tabs)/expenses/settings.tsx",
  "src/features/ledger/LedgerStage6Screen.tsx",
  "src/features/ledger/SettlementReadinessScreen.tsx",
  "src/features/ledger/LedgerSearchScreen.tsx",
  "src/features/ledger/LedgerExpenseDetailScreen.tsx",
  "src/features/ledger/LedgerExpenseEntryScreen.tsx",
  "src/features/ledger/MyLedgerScreen.tsx",
  "src/features/ledger/LedgerAnalysisScreen.tsx",
  "src/features/ledger/ExchangeRateLookup.tsx",
  "src/features/ledger/ConfirmExpenseDateScreen.tsx",
  "src/components/FoundationDiagnosticsScreen.tsx",
  "app/_layout.tsx",
  "app/(tabs)/_layout.tsx",
  "app/(tabs)/expenses/_layout.tsx",
];
export function representativeFiles(root: string, roots = representativeRoots): string[] {
  const visited = new Set<string>();
  const pending = [...roots];
  if (roots === representativeRoots) {
    const ledgerRoutes = resolve(root, "app/(tabs)/expenses");
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const file = resolve(dir, name);
        if (statSync(file).isDirectory()) walk(file);
        else if (file.endsWith(".tsx")) pending.push(relative(root, file));
      }
    };
    walk(ledgerRoutes);
    pending.push(
      "src/features/ledger/expenseConflictPresentation.ts",
      "src/features/ledger/settlementPresentation.ts",
    );
  }
  while (pending.length) {
    const file = pending.pop()!;
    if (visited.has(file)) continue;
    visited.add(file);
    const source = readFileSync(resolve(root, file), "utf8");
    const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
    for (const node of ast.statements)
      if (
        (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
        node.moduleSpecifier &&
        ts.isStringLiteral(node.moduleSpecifier)
      ) {
        const name = node.moduleSpecifier.text;
        const base = name.startsWith("@/")
          ? resolve(root, "src", name.slice(2))
          : name.startsWith(".")
            ? resolve(root, dirname(file), name)
            : null;
        if (!base) continue;
        const path = [base + ".tsx", resolve(base, "index.tsx")].find(existsSync);
        if (path) pending.push(relative(root, path));
      }
  }
  return [...visited].sort();
}
