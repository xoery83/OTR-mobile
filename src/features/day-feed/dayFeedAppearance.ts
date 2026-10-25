import { localCalendarDate } from "@/domain/trip/dayReadModel";
import type { UiColors } from "@/ui/palette";
// Decoration only. A device-date fallback never qualifies an Item clock, NOW or Reader context.
export function dayFeedAppearanceDate(
  instant: string,
  viewZone: string | null | undefined,
  deviceZone: string,
) {
  try {
    return localCalendarDate(instant, viewZone || deviceZone);
  } catch {
    return null;
  }
}
export function dayFeedPhaseColor(date: string, today: string | null, colors: UiColors) {
  return !today
    ? colors.background
    : date < today
      ? colors.dayPast
      : date === today
        ? colors.surface
        : colors.dayFuture;
}
