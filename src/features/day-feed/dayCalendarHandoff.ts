import { getAccountGeneration, subscribeAccountGeneration } from "@/data/auth/accountGeneration";
import type { DayFeedCalendarProps } from "./DayFeedCalendarSheet";

export const hostedDayCalendarEnabled = process.env.EXPO_PUBLIC_OTR_SHEET_DAY_CALENDAR_QA === "true";

type Invocation = DayFeedCalendarProps & { isCurrent(): boolean; canSelect(date: string): boolean };

let sequence = 0;
let pending: { id: string; generation: number; calendar: Invocation } | undefined;
subscribeAccountGeneration(() => { pending = undefined; });

export function stageDayCalendar(calendar: Invocation) {
  const id = String(++sequence);
  pending = { id, generation: getAccountGeneration(), calendar };
  return id;
}

export function readDayCalendar(id: string | undefined) {
  return pending?.id === id && pending?.generation === getAccountGeneration() && pending.calendar.isCurrent()
    ? pending.calendar : undefined;
}

export function releaseDayCalendar(id: string | undefined) {
  if (pending?.id === id) pending = undefined;
}
