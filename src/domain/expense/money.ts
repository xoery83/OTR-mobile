export function parseAmountToMinor(amount: string, scale = 2): number | null {
  if (!Number.isInteger(scale) || scale < 0 || scale > 3) return null;
  const match = (
    scale === 0 ? /^(\d+)$/ : new RegExp(`^(\\d+)(?:\\.(\\d{1,${scale}}))?$`)
  ).exec(amount.trim());
  if (!match) return null;

  const whole = Number(match[1]);
  const factor = 10 ** scale;
  const fractional = Number((match[2] ?? "").padEnd(scale, "0") || "0");
  const result = whole * factor + fractional;

  return Number.isSafeInteger(result) && result > 0 ? result : null;
}
