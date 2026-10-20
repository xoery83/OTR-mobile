import { en, zhHans } from "./catalogs";
import { t, getFormatLocale, type MessageKey } from "./locale";
const categories: Record<string, MessageKey> = {
  flight: "category.flight",
  hotel: "category.hotel",
  car: "category.car",
  fuel: "category.fuel",
  food: "category.food",
  ticket: "category.ticket",
  shopping: "category.shopping",
  transport: "category.transport",
  insurance: "category.insurance",
  groceries: "category.groceries",
  activity: "category.activity",
  other: "category.other",
  __analysis_other_categories__: "category.analysis_other_categories",
};
const labels: Record<string, MessageKey> = {
  DRAFT: "domain.label0",
  ACCEPTED: "domain.label1",
  RATE_REQUIRED: "domain.label2",
  DELETED: "domain.label3",
  IDLE: "domain.label4",
  READING: "domain.label5",
  READY: "domain.label6",
  FAILED: "domain.label7",
  CANCELLED: "domain.label8",
  UNSUPPORTED: "domain.label9",
  Title: "domain.label10",
  Amount: "domain.label11",
  Currency: "domain.label12",
  "Spending rank": "domain.label13",
  "Largest category": "domain.label14",
  "Biggest spending day": "domain.label15",
  "Average expense": "domain.label16",
  "Expense count": "domain.label17",
  "Saved Journey data unavailable": "domain.label18",
  "Using the latest value.": "domain.label19",
  "This earlier rate choice was replaced.": "domain.label20",
  "Rate saved here. Waiting to finish\u2026": "domain.label21",
  "The amount or rate changed. Review before accepting again.": "domain.label22",
  "This rate could not be accepted. Review with your Journey organizer.":
    "domain.label23",
  "This expense is part of a confirmed Settlement. Review a correction with your organizer.":
    "domain.label24",
};
export function categoryLabel(value: string): string {
  const key =
    categories[value.toLowerCase()] ??
    (value === "Other categories" ? categories.__analysis_other_categories__ : undefined);
  return key ? t(key) : value;
}
// Accept only enumerated system-owned labels; user names/titles never enter this mapper.
export function domainLabel(value: string): string {
  const key = labels[value];
  if (key) return t(key);
  const attention = value.match(/^(\d+) expenses need attention$/);
  return attention ? t("myLedger.attentionCount", { count: attention[1] }) : value;
}
export function analysisInsightValue(
  label: string,
  value: string | number,
): string | number {
  if (label === "Largest category") return categoryLabel(String(value));
  if (label === "Biggest spending day")
    return new Intl.DateTimeFormat(getFormatLocale(), {
      month: "short",
      day: "numeric",
    }).format(new Date(String(value) + "T12:00:00Z"));
  if (label === "Spending rank") {
    const match = String(value).match(/^#(\d+) of (\d+)$/);
    if (match) return t("analysis.rankValue", { rank: match[1], count: match[2] });
  }
  return value;
}

// Exact catalog messages only. User/business values remain untouched.
const systemMessages = new Map<string, MessageKey>([
  ...Object.entries(en).map(([key, value]) => [value, key as MessageKey] as const),
  ...Object.entries(zhHans).map(([key, value]) => [value, key as MessageKey] as const),
]);
const systemTemplates = [...systemMessages].flatMap(([message, key]) => {
  // Parameter-only accessibility/money messages are not recognizable system copy.
  // Require a meaningful fixed phrase before reverse-mapping a generated message.
  const fixed = message.replace(/[{][a-zA-Z0-9_]+[}]/g, "");
  if ((fixed.match(/[a-zA-Z一-鿿]/g)?.length ?? 0) < 4) return [];
  const names: string[] = [];
  const pattern = message
    .split(/(\{\w+\})/)
    .map((part) => {
      if (/^\{\w+\}$/.test(part)) {
        names.push(part.slice(1, -1));
        return "([^]*?)";
      }
      return part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    })
    .join("");
  return names.length ? [{ key, names, pattern: new RegExp(`^${pattern}$`) }] : [];
});
export function systemMessage(value: string): string {
  const key = systemMessages.get(value);
  if (key) return t(key);
  for (const template of systemTemplates) {
    const match = value.match(template.pattern);
    if (match)
      return t(
        template.key,
        Object.fromEntries(template.names.map((name, index) => [name, match[index + 1]])),
      );
  }
  return value;
}
