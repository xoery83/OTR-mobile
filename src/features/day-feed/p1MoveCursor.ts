// Display placement only; never a Core clock resolver or write port.
export type MoveStep = 10 | 30 | 60 | 120;
export type PlacementRow = {
  key: string;
  itemId: string;
  date: string;
  minute: number | null;
};
export function movePrecision(x: number, width: number, previous?: MoveStep): MoveStep {
  const steps: MoveStep[] = [10, 30, 60, 120];
  const band = Math.max(0, Math.min(3, Math.floor((x / Math.max(1, width)) * 4)));
  if (previous) {
    const index = steps.indexOf(previous);
    if (x >= (index * width) / 4 - 12 && x <= ((index + 1) * width) / 4 + 12)
      return previous;
  }
  return steps[band];
}
export function moveFingerLineY(
  fingerY: number,
  topInset: number,
  height: number,
  labelBand = 64,
  bottomInset = 34,
) {
  const bottom = height - bottomInset - 12;
  return Math.max(Math.min(bottom, topInset + labelBand), Math.min(bottom, fingerY));
}

export function moveEdgeVelocity(y: number, top: number, bottom: number, height: number) {
  if (y < 0 || y > height) return 0;
  const band = 56;
  const upper = Math.max(0, Math.min(1, (top + band - y) / band));
  const lower = Math.max(0, Math.min(1, (y - (bottom - band)) / band));
  return upper > 0
    ? -(36 + 480 * upper * upper)
    : lower > 0
      ? 36 + 480 * lower * lower
      : 0;
}

export function moveDayAtY(
  regions: readonly { top: number; bottom: number; date: string }[],
  y: number,
) {
  const ordered = regions
    .filter((r) => r.bottom > r.top)
    .slice()
    .sort((a, b) => a.top - b.top);
  return (
    ordered.filter((r) => r.top <= y && y <= r.bottom).at(-1)?.date ??
    ordered.filter((r) => r.top <= y).at(-1)?.date ??
    ordered[0]?.date ??
    null
  );
}
export function movePlacementAtY(
  date: string,
  anchors: readonly { y: number; minute: number }[],
  y: number,
  step: MoveStep,
  fallback: number,
) {
  const points = anchors
    .filter((a) => Number.isFinite(a.y))
    .slice()
    .sort((a, b) => a.y - b.y);
  if (!points.length) return { date, minute: fallback };
  const nearest = points.reduce((best, point) =>
    Math.abs(point.y - y) < Math.abs(best.y - y) ? point : best,
  );
  if (Math.abs(nearest.y - y) <= 5) return { date, minute: nearest.minute };
  const upper = points.find((a) => a.y >= y) ?? points[points.length - 1];
  const lower = [...points].reverse().find((a) => a.y <= y) ?? points[0];
  const ratio = upper.y > lower.y ? (y - lower.y) / (upper.y - lower.y) : 0;
  const raw = lower.minute + (upper.minute - lower.minute) * ratio;
  const bounded = Math.max(
    Math.min(lower.minute, upper.minute),
    Math.min(Math.max(lower.minute, upper.minute), Math.round(raw / step) * step),
  );
  return { date, minute: Math.max(0, Math.min(1439, bounded)) };
}
export function moveCardPosition(
  lineY: number,
  topInset: number,
  height: number,
  labelHeight: number,
  cardHeight: number,
  bottomInset = 34,
) {
  const above = lineY - 9 - labelHeight - 12 - cardHeight,
    below = lineY + 24;
  const minimum = topInset + 8,
    maximum = height - bottomInset - 8 - cardHeight;
  return above >= minimum
    ? above
    : below <= maximum
      ? below
      : Math.max(minimum, Math.min(maximum, above));
}

export function moveDayHeightTime(
  date: string,
  top: number,
  bottom: number,
  y: number,
  step: MoveStep,
) {
  const fraction = Math.max(0, Math.min(1, (y - top) / Math.max(1, bottom - top)));
  return {
    date,
    minute: Math.max(0, Math.min(1439, Math.round((fraction * 1440) / step) * step)),
  };
}

export function moveDayLineY(
  regions: readonly { key: string; date: string; top: number; bottom: number }[],
  date: string,
  y: number,
) {
  const own = regions.filter((r) => r.date === date && r.bottom > r.top);
  if (!own.length) return y;
  const start =
    own.find((r) => r.key === `day:${date}`)?.bottom ??
    Math.min(...own.map((r) => r.top));
  const next = regions
    .filter((r) => r.key.startsWith("day:") && r.date > date && r.bottom > r.top)
    .sort((a, b) => a.top - b.top)[0];
  const end = next?.top ?? Math.max(...own.map((r) => r.bottom));
  return Math.max(start, Math.min(Math.max(start, end - 1), y));
}
