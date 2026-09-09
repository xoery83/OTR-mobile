export function parseAmountToMinor(amount: string): number | null {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(amount.trim());
  if (!match) return null;

  const whole = Number(match[1]);
  const fractional = Number((match[2] ?? "").padEnd(2, "0") || "0");
  const result = whole * 100 + fractional;

  return Number.isSafeInteger(result) && result > 0 ? result : null;
}
