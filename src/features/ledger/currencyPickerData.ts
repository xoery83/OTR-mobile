import { SUPPORTED_CURRENCY_CODES } from "@/domain/ledger/currency";
import currencyNames from "./currencyNames.json";

const aliases: Record<string, string[]> = {
  AUD: ["澳元", "澳大利亚", "australia", "aussie dollar"],
  NZD: ["纽币", "纽元", "新西兰", "new zealand", "nz dollar"],
  JPY: ["日元", "日本", "japan", "yen"],
  CNY: ["人民币", "中国", "china", "rmb", "yuan"],
  USD: ["美元", "美金", "united states"],
  EUR: ["欧元", "euro area"],
  GBP: ["英镑", "united kingdom"],
  ISK: ["冰岛", "iceland"],
};

const normalize = (value: string) =>
  value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/\s+/g, " ")
    .trim();

export function currencyName(code: string, locale: string): string {
  const names = currencyNames[code as keyof typeof currencyNames];
  return (locale.startsWith("zh") ? names?.zh : names?.en) ?? code;
}

export function searchCurrencies(query: string): string[] {
  const needle = normalize(query);
  if (!needle) return SUPPORTED_CURRENCY_CODES;
  const names = ["en", "zh-Hans"];
  return SUPPORTED_CURRENCY_CODES.map((code) => {
    const fields = [
      code,
      ...names.map((locale) => currencyName(code, locale)),
      ...(aliases[code] ?? []),
    ].map(normalize);
    const rank =
      normalize(code) === needle
        ? 0
        : normalize(code).startsWith(needle)
          ? 1
          : fields.includes(needle)
            ? 2
            : fields.some((field) => field.startsWith(needle))
              ? 3
              : fields.some((field) => field.includes(needle))
                ? 4
                : 5;
    return { code, rank };
  })
    .filter((item) => item.rank < 5)
    .sort((a, b) => a.rank - b.rank || a.code.localeCompare(b.code))
    .map((item) => item.code);
}

export function suggestedCurrencies(candidates: string[]): string[] {
  return [...new Set([...candidates, "USD", "EUR", "GBP"])]
    .filter((code) => SUPPORTED_CURRENCY_CODES.includes(code))
    .slice(0, 6);
}
