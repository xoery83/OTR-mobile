import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Children, isValidElement, type ReactElement } from "react";
import { MoneyText, type MoneyTextProps } from "./MoneyText";
import { formatLedgerMoney, ledgerMoneyParts } from "./format";
import { currencyScale, SUPPORTED_CURRENCY_CODES } from "@/domain/ledger/currency";

const ui = vi.hoisted(() => ({ step: 0, width: 375, fontScale: 1 }));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: () => [
    ui.step,
    (next: number) => {
      ui.step = next;
    },
  ],
}));
vi.mock("react-native", () => {
  const flatten = (style: unknown): Record<string, unknown> =>
    Array.isArray(style)
      ? Object.assign({}, ...style.map(flatten))
      : ((style || {}) as Record<string, unknown>);
  return {
    Text: "Text",
    StyleSheet: { flatten },
    useWindowDimensions: () => ({ width: ui.width, fontScale: ui.fontScale }),
  };
});

type Node = ReactElement<Record<string, any>>;
function render(props: MoneyTextProps): Node {
  const fitted = MoneyText(props);
  return (fitted.type as (props: MoneyTextProps) => Node)(fitted.props);
}
function fragments(node: Node): Node[] {
  return Children.toArray(node.props.children).flatMap((child) => {
    if (!isValidElement(child)) return [];
    const element = child as Node;
    return element.type === "Text" ? [element] : fragments(element);
  });
}
function fullText(node: Node): string {
  return Children.toArray(node.props.children)
    .map((child) => (isValidElement(child) ? fullText(child as Node) : String(child)))
    .join("");
}
const base = { minor: 123456, currency: "NZD", scale: 2 };
beforeEach(() => {
  ui.step = 0;
  ui.width = 375;
  ui.fontScale = 1;
});
afterEach(() => vi.restoreAllMocks());

describe("Canonical money display", () => {
  it("renders on iOS Hermes without native formatToParts, preserving locale parts and text", () => {
    const native = Intl.NumberFormat.prototype.formatToParts;
    vi.spyOn(Intl.NumberFormat.prototype, "formatToParts");
    Reflect.set(Intl.NumberFormat.prototype, "formatToParts", undefined);
    expect(typeof Intl.NumberFormat.prototype.formatToParts).toBe("undefined");
    for (const locale of [
      "en-NZ",
      "zh-CN",
      "de-DE",
      "ar-EG",
      "fa-IR",
      "fr-FR",
      "en-IN",
    ]) {
      for (const currency of SUPPORTED_CURRENCY_CODES) {
        const scale = currencyScale(currency)!;
        for (const minor of [0, -0, 1234567, -1234567, 12345678999]) {
          const formatter = new Intl.NumberFormat(locale, {
            style: "currency",
            currency,
            minimumFractionDigits: scale,
            maximumFractionDigits: scale,
          });
          const expected = native.call(formatter, minor / 10 ** scale);
          const fallback = ledgerMoneyParts(minor, currency, scale, locale);
          expect(fallback.map((p) => p.value).join("")).toBe(
            formatter.format(minor / 10 ** scale),
          );
          for (const type of [
            "integer",
            "fraction",
            "decimal",
            "currency",
            "minusSign",
            "group",
          ])
            expect(
              fallback
                .filter((p) => p.type === type)
                .map((p) => p.value)
                .join(""),
            ).toBe(
              expected
                .filter((p) => p.type === type)
                .map((p) => p.value)
                .join(""),
            );
          expect(
            fullText(render({ minor, currency, scale, locale, variant: "hero" })),
          ).toBe(formatLedgerMoney(minor, currency, scale, locale));
        }
      }
    }
  });
  it("keeps the previous formatter policy and exact parts text across currencies/locales", () => {
    for (const locale of [undefined, "en-NZ", "zh-CN", "de-DE", "ar-EG"]) {
      for (const currency of SUPPORTED_CURRENCY_CODES) {
        const scale = currencyScale(currency)!;
        for (const minor of [0, 1234567, -1234567, 12345678999]) {
          const expected = new Intl.NumberFormat(locale, {
            style: "currency",
            currency,
            minimumFractionDigits: scale,
            maximumFractionDigits: scale,
          }).format(minor / 10 ** scale);
          expect(formatLedgerMoney(minor, currency, scale, locale)).toBe(expected);
          expect(
            ledgerMoneyParts(minor, currency, scale, locale)
              .map((p) => p.value)
              .join(""),
          ).toBe(expected);
          const node = render({ minor, currency, scale, locale });
          expect(fullText(node)).toBe(expected);
          expect(node.props.accessibilityLabel).toBe(expected);
        }
      }
    }
  });

  it.each([
    ["NZD", 2, 123456, "1,234.56"],
    ["JPY", 0, 1234, "1,234"],
    ["ISK", 0, 1234, "1,234"],
    ["BHD", 3, 1234567, "1,234.567"],
    ["KWD", 3, 1234567, "1,234.567"],
  ])("renders %s with its complete fraction", (currency, scale, minor, expected) => {
    const node = render({ minor, currency, scale, locale: "en-NZ" });
    expect(fullText(node)).toContain(expected);
    const fraction = fragments(node).find((p) =>
      String(p.props.children).startsWith("."),
    );
    if (scale === 0) expect(fraction).toBeUndefined();
    else expect(fraction?.props.children).toBe(scale === 3 ? ".567" : ".56");
  });

  it("honours explicit scale even when currency metadata differs", () => {
    const node = render({ minor: 123456, currency: "JPY", scale: 2 });
    expect(fullText(node)).toBe(formatLedgerMoney(123456, "JPY", 2));
    expect(fullText(node)).toContain(".56");
  });

  it.each([
    ["hero", 44, 0.54, 0.7],
    ["headline", 22, 0.6, 0.75],
    ["standard", 15, 0.75, 0.9],
    ["compact", 12, 0.9, 1],
  ] as const)("owns the %s hierarchy", (variant, size, fraction, symbol) => {
    const node = render({ ...base, variant, signed: true, locale: "en-NZ" });
    expect(node.props.style.at(-1).fontSize).toBe(size);
    const parts = fragments(node);
    expect(
      parts.find((p) => p.props.children === ".56")?.props.style.fontSize,
    ).toBeCloseTo(size * fraction);
    expect(parts.find((p) => p.props.children === "+")?.props.style.fontSize).toBeCloseTo(
      size * symbol,
    );
    expect(parts.find((p) => p.props.children === "$")?.props.style.fontSize).toBeCloseTo(
      size * symbol,
    );
    for (const part of parts) {
      expect(part.props.accessible).toBe(false);
      expect(part.props.importantForAccessibility).toBe("no");
      expect(part.props.accessibilityElementsHidden).toBe(true);
    }
  });

  it("preserves signed, negative, zero, estimate and unavailable semantics", () => {
    for (const minor of [123456, -12050, 0]) {
      const node = render({ ...base, minor, signed: true, prefix: "≈ " });
      const expected = `≈ ${minor > 0 ? "+" : ""}${formatLedgerMoney(minor, "NZD", 2)}`;
      expect(fullText(node)).toBe(expected);
      expect(node.props.accessibilityLabel).toBe(expected);
    }
    expect(fullText(render({ ...base, minor: null, prefix: "≈ " }))).toBe("—");
    expect(fullText(render({ ...base, minor: null, placeholder: "Unavailable" }))).toBe(
      "Unavailable",
    );
  });

  it("preserves original/Journey values independently", () => {
    const original = render({ minor: 1234567, currency: "KWD", scale: 3 });
    const journey = render({ minor: 855346476, currency: "CNY", scale: 2 });
    expect(fullText(original)).toBe(formatLedgerMoney(1234567, "KWD", 3));
    expect(fullText(journey)).toBe(formatLedgerMoney(855346476, "CNY", 2));
  });

  it("uses one fitted line for long amounts and preserves Text props and semantic color", () => {
    const onTextLayout = vi.fn();
    const props: MoneyTextProps = {
      ...base,
      minor: -1234567890,
      variant: "hero",
      style: { fontSize: 36, color: "#9b3d18", textAlign: "right" },
      onTextLayout,
      accessibilityLabel: "Current balance",
    };
    const node = render(props);
    expect(node.props.numberOfLines).toBe(1);
    expect(node.props.adjustsFontSizeToFit).toBe(true);
    expect(node.props.minimumFontScale).toBe(0.6);
    expect(node.props.maxFontSizeMultiplier).toBe(1.35);
    expect(node.props.style[0]).toMatchObject({ flexShrink: 1, minWidth: 0 });
    expect(node.props.style[1]).toMatchObject({ color: "#9b3d18", textAlign: "right" });
    expect(node.props.accessibilityLabel).toBe("Current balance");
    const event = { nativeEvent: { lines: [{}, {}] } };
    node.props.onTextLayout(event);
    expect(onTextLayout).toHaveBeenCalledWith(event);
    const shrunk = render(props);
    expect(shrunk.props.style.at(-1).fontSize).toBeCloseTo((36 * 40) / 44);
    expect(
      fragments(shrunk).find((p) => p.props.children === ".90")?.props.style.fontSize,
    ).toBeCloseTo(((36 * 40) / 44) * 0.54);
    const key = MoneyText(props).key;
    ui.width = 320;
    ui.fontScale = 3;
    expect(MoneyText(props).key).not.toBe(key);
    const overridden = render({
      ...base,
      numberOfLines: 2,
      adjustsFontSizeToFit: false,
      minimumFontScale: 0.8,
    });
    expect(overridden.props.numberOfLines).toBe(2);
    expect(overridden.props.adjustsFontSizeToFit).toBe(false);
    expect(overridden.props.minimumFontScale).toBe(0.8);
  });
});
