// Temporary display placement only; never a Core clock resolver or write port.
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
export function moveTickRate(offset: number, step: MoveStep) {
  if (Math.abs(offset) <= 10) return 0;
  const rates = { 10: [1.2, 3], 30: [0.9, 2.2], 60: [0.6, 1.6], 120: [0.5, 1.2] };
  const [low, high] = rates[step];
  const distance = Math.min(1, (Math.abs(offset) - 10) / 140);
  return Math.sign(offset) * (low + (high - low) * distance ** 1.6);
}
export function moveClockTick(
  date: string,
  minute: number,
  step: MoveStep,
  ticks: number,
  first: string,
  last: string,
) {
  if (!ticks) return { date, minute };
  const next =
    (ticks > 0 ? Math.floor(minute / step) : Math.ceil(minute / step)) * step +
    ticks * step;
  // UTC arithmetic here shifts a date-only key, not an Item instant or a 24h duration.
  const day = new Date(`${date}T12:00:00Z`);
  day.setUTCDate(day.getUTCDate() + Math.floor(next / 1440));
  const target = day.toISOString().slice(0, 10);
  if (target < first || target > last) return { date, minute };
  return { date: target, minute: ((next % 1440) + 1440) % 1440 };
}
export function moveInsertionTarget(
  rows: readonly PlacementRow[],
  date: string,
  minute: number,
  itemId: string,
  ntc: boolean,
) {
  const day = rows.filter((row) => row.date === date && row.itemId !== itemId);
  const next = day.find((row) => row.minute !== null && (ntc || row.minute > minute));
  if (next) return { key: next.key, date, edge: "BEFORE" as const };
  const previous = day.at(-1);
  return { key: previous?.key ?? `day:${date}`, date, edge: "AFTER" as const };
}

export function moveFollowAnchor(
  anchor: { key: string; date: string; within: number },
  delta: number,
  rows: readonly PlacementRow[],
  heightFor: (key: string) => number | undefined,
) {
  const within = anchor.within + delta;
  if (within >= 0) return { ...anchor, within };
  const index = rows.findIndex((row) => row.key === anchor.key);
  const previous = rows[index - 1];
  if (!previous) return { ...anchor, within: 0 };
  return {
    key: previous.key,
    date: previous.date,
    within: Math.max(0, (heightFor(previous.key) ?? 0) + within),
  };
}
