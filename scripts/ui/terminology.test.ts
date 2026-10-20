import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { en, zhHans } from "../../src/ui/catalogs";
import { glossaryTerms, terminologyIssues } from "./terminology";
const approved = glossaryTerms(
  readFileSync("docs/architecture/OTR_TERMINOLOGY_GLOSSARY.md", "utf8"),
);
it("matches the normative owner glossary and complete populated catalogs", () => {
  expect(Object.keys(approved)).toHaveLength(47);
  expect(terminologyIssues(en, zhHans, approved)).toEqual([]);
});
it("rejects canonical label and phrase regressions without a historical baseline", () => {
  for (const [english, chinese, rule] of [
    ["Choose a Journey", "选择旅行", "journey"],
    ["Expense", "消费", "canonical-label"],
    ["New Expense", "新建费用", "expense"],
    ["Open Review", "打开检查", "review"],
    ["Receipt {number}", "票据 {number}", "receipt"],
    ["Journey Currency", "旅行结算货币", "journey"],
    ["Payments", "转账", "canonical-label"],
    ["Journey Value", "行程估值", "journey-value"],
    ["Change Journey value", "更改行程结算币种金额", "journey-value"],
    ["Spending by traveller", "按旅行者统计消费", "traveller"],
    ["Owner", "组织者", "canonical-label"],
  ]) {
    expect(
      terminologyIssues({ newKey: english }, { newKey: chinese }, approved).map(
        (i) => i.rule,
      ),
    ).toContain(rule);
  }
});
it("retains natural context and only permits documented exact-key exceptions", () => {
  const pairs = {
    activeAccount: ["Active", "当前"],
    activeJourney: ["Active", "进行中"],
    rootToday: ["Today", "今日"],
    proseToday: ["Today", "今天"],
    method: ["Split", "分摊方式"],
    file: ["Share", "分享"],
    allocation: ["Share", "份额"],
    check: ["Check the latest values", "检查最新金额"],
    fee: ["Bank fee", "银行费用"],
    expenseFee: ["An Expense can include a bank fee", "一笔支出可以包含银行费用"],
  };
  const english = Object.fromEntries(Object.entries(pairs).map(([k, v]) => [k, v[0]]));
  const chinese = Object.fromEntries(Object.entries(pairs).map(([k, v]) => [k, v[1]]));
  expect(terminologyIssues(english, chinese, approved)).toEqual([]);
  expect(
    terminologyIssues(
      { "health.idle": "Open Review" },
      { "health.idle": "打开检查" },
      approved,
    ),
  ).toContainEqual({ key: "health.idle", rule: "review" });
});
it("detects missing translations, parameter drift and unexpected keys", () => {
  expect(
    terminologyIssues(
      { a: "Receipt {number}", b: "Expense" },
      { a: "收据 {name}", extra: "用户" },
      approved,
    ),
  ).toEqual([
    { key: "a", rule: "parameters" },
    { key: "b", rule: "missing-translation" },
    { key: "extra", rule: "unknown-key" },
  ]);
});

it("resolves representative screen copy in both locales with approved distinctions", async () => {
  const { translate, getUiLocale, setUiLocale } = await import("../../src/ui/locale");
  const before = getUiLocale();
  try {
    const pairs = [
      ["navigation.ledger", "Ledger", "账本"],
      ["ledger.chooseJourney", "Choose a Journey", "选择行程"],
      ["ui.newExpense", "New Expense", "新建支出"],
      ["search.participant", "Participant", "参与者"],
      ["ui.spendingAnalysis", "Spending Analysis", "消费分析"],
      ["settlement.payments", "Payments", "付款"],
      ["currencySettings.heading", "Journey Currency", "行程结算币种"],
      ["common.review", "Review", "审核"],
      ["navigation.finding", "Finding", "待处理事项"],
      ["navigation.trip", "Trip", "旅行"],
      ["ui.journeyValue", "Journey value", "行程币种金额"],
      ["common.traveller", "Traveller", "旅行成员"],
    ] as const;
    for (const language of ["en", "zh-Hans"] as const) {
      setUiLocale(language);
      for (const [key, english, chinese] of pairs)
        expect(translate(key), key).toBe(language === "en" ? english : chinese);
    }
    setUiLocale("zh-Hans");
    // A user title/name that happens to equal an English concept remains data.
    expect(
      translate("expense.previewAttachment", { title: "Journey", type: "PDF" }),
    ).toContain("Journey");
    expect(translate("search.paidByName", { name: "Expense" })).toContain("Expense");
  } finally {
    setUiLocale(before);
  }
});

it("preserves final owner boundaries without inventing rates or lifecycle states", () => {
  expect(approved.Owner).toBe("所有者");
  expect(approved.Organizer).toBe("组织者");
  expect(approved["Journey Value"]).toBe("行程币种金额");
  expect(approved["Actual payer cost"]).toBe("实际付款金额");
  expect(approved["Actual Rate"]).toBeUndefined();
  expect(approved.Final).toBeUndefined();
  expect(
    terminologyIssues(
      { journey: "A Traveller in this Journey", final: "Final settlement" },
      { journey: "此行程中的一位旅行成员", final: "最终结算" },
      approved,
    ),
  ).toEqual([]);
});
