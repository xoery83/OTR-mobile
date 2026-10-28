export type DayFeedShellScroll = Readonly<{
  offset: number;
  turnOffset: number;
  direction: -1 | 0 | 1;
  navigationVisible: boolean;
}>;

export const initialDayFeedShellScroll: DayFeedShellScroll = {
  offset: 0,
  turnOffset: 0,
  direction: 0,
  navigationVisible: true,
};

// Programmatic date jumps/restoration are not forward reading gestures.
export function updateDayFeedShellScroll(
  previous: DayFeedShellScroll,
  offset: number,
  userDriven: boolean,
): DayFeedShellScroll {
  if (!Number.isFinite(offset)) return previous;
  offset = Math.max(0, offset);
  if (offset <= 4) return { ...initialDayFeedShellScroll, offset, turnOffset: offset };
  if (!userDriven) return { ...previous, offset, turnOffset: offset, direction: 0 };
  return updateDayFeedShellReadingMotion(previous, offset - previous.offset);
}

export function updateDayFeedShellReadingMotion(
  previous: DayFeedShellScroll,
  delta: number,
): DayFeedShellScroll {
  if (!Number.isFinite(delta)) return previous;
  if (!delta) return previous;
  const offset = previous.offset + delta;
  const direction = delta > 0 ? 1 : -1;
  const turnOffset =
    direction === previous.direction ? previous.turnOffset : previous.offset;
  return {
    offset,
    turnOffset,
    direction,
    navigationVisible:
      direction === 1 && offset - turnOffset >= 32
        ? false
        : direction === -1 && turnOffset - offset >= 8
          ? true
          : previous.navigationVisible,
  };
}

export type DayFeedShellVisibleDates = Readonly<{ first: string; last: string }>;
export type DayFeedShellDateState = Readonly<{
  visible: DayFeedShellVisibleDates | null;
  pending: DayFeedShellVisibleDates | null;
  pendingSince: number;
}>;
export const initialDayFeedShellDates: DayFeedShellDateState = {
  visible: null,
  pending: null,
  pendingSince: 0,
};
const sameRange = (a: DayFeedShellVisibleDates | null, b: DayFeedShellVisibleDates) =>
  a?.first === b.first && a.last === b.last;

// Root supplies actual viewable Day sections; never derive dates from row times.
export function updateDayFeedShellDates(
  previous: DayFeedShellDateState,
  visible: DayFeedShellVisibleDates,
  now: number,
  immediate = false,
): DayFeedShellDateState {
  if (!Number.isFinite(now) || visible.last < visible.first) return previous;
  if (immediate || !previous.visible)
    return { visible, pending: null, pendingSince: now };
  if (sameRange(previous.visible, visible))
    return { ...previous, pending: null, pendingSince: now };
  if (!sameRange(previous.pending, visible))
    return { ...previous, pending: visible, pendingSince: now };
  return now - previous.pendingSince >= 120
    ? { visible, pending: null, pendingSince: now }
    : previous;
}
