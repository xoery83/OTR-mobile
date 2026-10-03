export type TerminologyIssue = { key: string; rule: string };
type Catalog = Record<string, string>;

// Exact-key exceptions, not namespace exemptions. English context is validated.
export const terminologyExceptions = {
  "reviewFlow.label20": {
    english:
      "This looks similar to another Expense and may count the same spending twice.",
    rule: "expense",
    reason: "支出 names the Expense; 同一笔消费 names duplicated Spending, not Expense.",
  },
  "health.idle": {
    english: "Run a check when you want to review this account's saved data.",
    rule: "review",
    reason: "Account data health check, not the product Review workflow.",
  },
  "ui.checkTheReviewFields": {
    english: "Check the review fields.",
    rule: "review",
    reason: "The verb Check describes inspecting fields; 审核 still labels review.",
  },
} as const;

const rules = [
  { id: "journey", english: /\bJourneys?\b/i, forbidden: /旅行/ },
  {
    id: "expense",
    english: /\bExpenses?\b/i,
    forbidden:
      /^(?:费用|消费)$|(?:笔|新建|添加|原始|已确认|草稿|跨币种)(?:费用|消费)|费用(?:金额|总额|日期|详情|笔数|表单)|消费日期/,
  },
  { id: "review", english: /\breview(?:ed|ing)?\b/i, forbidden: /检查/ },
  {
    id: "journey-value",
    english: /\bJourney value\b/i,
    forbidden: /行程估值|行程结算币种金额/,
  },
  { id: "traveller", english: /\btravellers?\b/i, forbidden: /旅行者/ },
  { id: "receipt", english: /\breceipts?\b/i, forbidden: /票据/ },
  {
    id: "journey-currency",
    english: /\bJourney currency\b/i,
    forbidden: /旅行结算货币|行程货币|行程币种/,
  },
] as const;

export function terminologyIssues(
  english: Catalog,
  chinese: Catalog,
  approved: Catalog,
): TerminologyIssue[] {
  const issues: TerminologyIssue[] = [];
  const canonical = new Map(
    Object.entries(approved).map(([en, zh]) => [en.toLowerCase(), zh]),
  );
  for (const [key, en] of Object.entries(english)) {
    const zh = chinese[key];
    if (zh === undefined || !zh.trim()) {
      issues.push({ key, rule: "missing-translation" });
      continue;
    }
    const params = (value: string) => (value.match(/\{\w+\}/g) ?? []).sort().join(",");
    if (params(en) !== params(zh)) issues.push({ key, rule: "parameters" });
    const label = en.trim().toLowerCase();
    const expected =
      canonical.get(label) ?? canonical.get(label.replace(/ies$/, "y").replace(/s$/, ""));
    // Only standalone canonical labels. Compound Share meanings are separate
    // glossary rows; Split method context is explicitly allowed by the owner.
    if (
      expected &&
      zh.trim() !== expected &&
      !(en.trim().toLowerCase() === "split" && zh.trim() === "分摊方式")
    ) {
      issues.push({ key, rule: "canonical-label" });
    }
    for (const rule of rules) {
      // Generic Traveller may legitimately co-occur with Journey in one sentence.
      const wording =
        rule.id === "journey" && /\btravellers?\b/i.test(en)
          ? zh.replace(/旅行成员/g, "")
          : zh;
      if (!rule.english.test(en) || !rule.forbidden.test(wording)) continue;
      const exception = terminologyExceptions[key as keyof typeof terminologyExceptions];
      if (exception?.rule === rule.id && exception.english === en) continue;
      issues.push({ key, rule: rule.id });
    }
  }
  for (const key of Object.keys(chinese)) {
    if (!(key in english)) issues.push({ key, rule: "unknown-key" });
  }
  return issues;
}

// The normative Markdown table is the authority; don't duplicate its full map.
export function glossaryTerms(markdown: string): Catalog {
  const terms: Catalog = {};
  for (const line of markdown.split("\n")) {
    const cells = line
      .split("|")
      .slice(1, -1)
      .map((cell) => cell.trim());
    if (
      cells.length === 2 &&
      /^[A-Za-z]/.test(cells[0]) &&
      /[\u3400-\u9fff]/.test(cells[1])
    )
      terms[cells[0]] = cells[1];
  }
  return terms;
}
