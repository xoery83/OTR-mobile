import type { Money } from "./types";

const currencyPattern = /^[A-Z]{3}$/;

export function isValidMoney(value: Money): boolean {
  return (
    Number.isSafeInteger(value.minor) &&
    currencyPattern.test(value.currency) &&
    Number.isInteger(value.scale) &&
    value.scale >= 0 &&
    value.scale <= 4
  );
}

export function assertMoney(value: Money, label = "Money"): void {
  if (!isValidMoney(value)) throw new Error(`${label} is invalid.`);
}

function pow10(power: number): bigint {
  return 10n ** BigInt(power);
}

export function parseDecimalRatio(value: string): {
  numerator: bigint;
  denominator: bigint;
} {
  const normalized = value.trim();
  const match = /^(\d+)(?:\.(\d{1,18}))?$/.exec(normalized);
  if (!match) throw new Error("Rate must be a positive decimal with at most 18 places.");
  const fraction = match[2] ?? "";
  const denominator = pow10(fraction.length);
  const numerator = BigInt(match[1]) * denominator + BigInt(fraction || "0");
  if (numerator <= 0n) throw new Error("Rate must be positive.");
  return { numerator, denominator };
}

export function convertMoney(
  source: Money,
  targetCurrency: string,
  targetScale: number,
  decimalRate: string,
): Money {
  assertMoney(source, "Source money");
  const target: Money = { minor: 0, currency: targetCurrency, scale: targetScale };
  assertMoney(target, "Target money");
  const { numerator, denominator } = parseDecimalRatio(decimalRate);
  const scaledNumerator = BigInt(source.minor) * numerator * pow10(targetScale);
  const scaledDenominator = denominator * pow10(source.scale);
  const rounded = (scaledNumerator * 2n + scaledDenominator) / (scaledDenominator * 2n);
  const minor = Number(rounded);
  if (!Number.isSafeInteger(minor))
    throw new Error("Converted amount exceeds safe range.");
  return { minor, currency: targetCurrency, scale: targetScale };
}

export function assertSameCurrency(left: Money, right: Money): void {
  if (left.currency !== right.currency || left.scale !== right.scale) {
    throw new Error("Money currencies or scales do not match.");
  }
}
