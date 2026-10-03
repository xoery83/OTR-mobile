import { afterEach, describe, expect, it, vi } from "vitest";
import { en, zhHans, catalogs, type MessageKey } from "./catalogs";
import {
  getUiLocale,
  setUiLocale,
  subscribeUiLocale,
  resolveUiLocale,
  translate,
  getFormatLocale,
  formatUiDate,
} from "./locale";
import { lightPalette, darkPalette, uiPalette } from "./palette";
import { scanUiSource, newUiDebt } from "../../scripts/ui/guard";
import {
  formatLedgerMoney,
  ledgerMoneyParts,
  formatLedgerDate,
  formatLedgerDateRange,
} from "@/features/ledger/format";
const originalLocale = getUiLocale();
afterEach(() => {
  setUiLocale(originalLocale);
  vi.restoreAllMocks();
});

describe("UI foundation", () => {
  it("has populated complete catalogs, matching parameters and fallback", () => {
    expect(Object.keys(en).length).toBeGreaterThan(200);
    expect(Object.keys(zhHans).sort()).toEqual(Object.keys(en).sort());
    for (const key of Object.keys(en) as MessageKey[]) {
      expect(zhHans[key].trim(), key).not.toBe("");
      expect(zhHans[key].match(/\{\w+\}/g)?.sort() ?? [], key).toEqual(
        en[key].match(/\{\w+\}/g)?.sort() ?? [],
      );
    }
    const dictionary = catalogs["zh-Hans"];
    const saved = dictionary["navigation.ledger"];
    Reflect.deleteProperty(dictionary, "navigation.ledger");
    try {
      expect(translate("navigation.ledger", {}, "zh-Hans")).toBe("Ledger");
    } finally {
      dictionary["navigation.ledger"] = saved;
    }
    expect(() => translate("search.expenseCountOther")).toThrow(
      "Missing UI message parameter",
    );
  });
  it("switches mounted subscriptions without resetting any business state and formats both locales", () => {
    setUiLocale("en");
    const observer = vi.fn();
    const unsubscribe = subscribeUiLocale(observer);
    for (const language of ["zh-Hans", "en", "zh-Hans"] as const) {
      setUiLocale(language);
      expect(getUiLocale()).toBe(language);
      expect(translate("navigation.ledger")).toBe(language === "en" ? "Ledger" : "账本");
      for (const [minor, currency, scale] of [
        [123456, "NZD", 2],
        [-12345, "JPY", 0],
        [12345, "KWD", 3],
      ] as const) {
        const expected = new Intl.NumberFormat(getFormatLocale(), {
          style: "currency",
          currency,
          minimumFractionDigits: scale,
          maximumFractionDigits: scale,
        }).format(minor / 10 ** scale);
        expect(formatLedgerMoney(minor, currency, scale)).toBe(expected);
        expect(
          ledgerMoneyParts(minor, currency, scale)
            .map((p) => p.value)
            .join(""),
        ).toBe(expected);
      }
      expect(formatUiDate(new Date(2026, 9, 3))).toBe(
        new Intl.DateTimeFormat(getFormatLocale(), {
          year: "numeric",
          month: "short",
          day: "numeric",
        }).format(new Date(2026, 9, 3)),
      );
      expect(formatLedgerDate("2026-10-03", new Date(2026, 9, 3))).toBe(
        language === "en" ? "Today" : "今天",
      );
      expect(formatLedgerDateRange(null, "2026-10-03", new Date(2026, 9, 3))).toBe(
        language === "en" ? "Until Today" : "截至 今天",
      );
    }
    expect(observer).toHaveBeenCalledTimes(3);
    unsubscribe();
    setUiLocale("en");
    expect(observer).toHaveBeenCalledTimes(3);
    for (const value of ["zh", "zh-CN", "zh-SG", "zh-Hans-CN"])
      expect(resolveUiLocale(value)).toBe("zh-Hans");
    for (const value of ["fr-FR", "zh-Hant", "zh-TW", "zh-HK"])
      expect(resolveUiLocale(value)).toBe("en");
  });
  it("provides semantic pairs with readable contrast in both appearances", () => {
    const luminance = (hex: string) => {
      const c = hex
        .slice(1)
        .match(/../g)!
        .map((h) => parseInt(h, 16) / 255)
        .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
      return c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722;
    };
    const contrast = (a: string, b: string) => {
      const x = luminance(a),
        y = luminance(b);
      return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
    };
    for (const colors of [lightPalette, darkPalette]) {
      for (const background of [
        colors.background,
        colors.surface,
        colors.elevatedSurface,
      ])
        for (const text of [
          colors.textPrimary,
          colors.textSecondary,
          colors.textTertiary,
        ])
          expect(contrast(text, background)).toBeGreaterThanOrEqual(4.5);
      for (const [text, bg] of [
        [colors.accent, colors.selected],
        [colors.onAccent, colors.accent],
        [colors.warning, colors.warningSurface],
        [colors.success, colors.successSurface],
        [colors.info, colors.infoSurface],
        [colors.destructive, colors.destructiveSurface],
      ])
        expect(contrast(text, bg)).toBeGreaterThanOrEqual(4.5);
    }
    expect(
      new Set([
        darkPalette.background,
        darkPalette.groupedBackground,
        darkPalette.surface,
        darkPalette.expandedSurface,
        darkPalette.elevatedSurface,
      ]).size,
    ).toBe(3);
    expect(contrast(darkPalette.separator, darkPalette.surface)).toBeLessThan(1.5);
    expect(luminance(darkPalette.textPrimary)).toBeGreaterThan(
      luminance(darkPalette.textSecondary),
    );
    expect(luminance(darkPalette.textSecondary)).toBeGreaterThan(
      luminance(darkPalette.textTertiary),
    );
    expect(uiPalette("dark")).toBe(darkPalette);
    expect(uiPalette("light")).toBe(lightPalette);
  });
  it("rejects new debt even when old debt is deleted and allows only line-scoped reasoned exceptions", () => {
    const code =
      'const S=()=> <Text accessibilityLabel="Hello" style={{color:"#fff"}}>Welcome {ready ? "Yes" : "No"}</Text>';
    const issues = scanUiSource(code, "app/new.tsx");
    expect(issues.filter((i) => i.rule === "color")).toHaveLength(1);
    expect(issues.filter((i) => i.rule === "string").length).toBeGreaterThanOrEqual(4);
    expect(
      scanUiSource('const S=()=> <Text>{t("common.close")}</Text>', "app/new.tsx"),
    ).toEqual([]);
    expect(
      scanUiSource(
        'const S=()=> <Text>{status === "OPEN" ? t("common.close") : name}</Text>',
        "app/new.tsx",
      ),
    ).toEqual([]);
    expect(
      scanUiSource(
        '// ui-foundation-exception: color -- fixed receipt media stage\nconst color="#fff";\nconst other="#000";',
        "app/new.tsx",
      ).map((i) => i.value),
    ).toEqual(["#000"]);
    expect(
      scanUiSource(
        '// ui-foundation-exception: color -- short\nconst color="#fff";',
        "app/new.tsx",
      ),
    ).toHaveLength(1);
    expect(
      scanUiSource("const S=()=> <Text>New debt</Text>", "src/ui/new.tsx"),
    ).toHaveLength(1);
    expect(
      scanUiSource(
        "function MoneyText(){return null}",
        "src/features/trip/Sample.tsx",
      ).map((i) => i.rule),
    ).toEqual(["duplicate-control"]);
    expect(
      scanUiSource("const HeaderAction=()=>null", "src/features/trip/Sample.tsx").map(
        (i) => i.rule,
      ),
    ).toEqual(["deprecated-control"]);
    expect(
      scanUiSource('const text="#fff"', "src/ui/catalogs.ts").map((i) => i.rule),
    ).toEqual(["color"]);
    expect(newUiDebt({ fresh: 1 }, { old: 100 })).toEqual([["fresh", 1]]);
    expect(newUiDebt({ old: 2 }, { old: 1 })).toEqual([["old", 2]]);
  });
});
