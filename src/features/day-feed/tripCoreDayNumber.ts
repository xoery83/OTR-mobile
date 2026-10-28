import { validateCalendarDate } from "@/domain/trip/dayReadModel";

// Only confirmed Trip Root dates belong here; never Item Coverage or suggested dates.
// A known end bounds numbering. An unset end gives an ordinal, not a total duration.
export function tripCoreDayNumber(
  date: string,
  confirmedCore: Readonly<{ startDate: string | null; endDate: string | null }> | null,
): number | null {
  const start = confirmedCore?.startDate;
  if (!start) return null;
  const end = confirmedCore.endDate;
  try {
    validateCalendarDate(date);
    validateCalendarDate(start);
    if (end !== null) validateCalendarDate(end);
  } catch {
    return null;
  }
  if (date < start || (end !== null && (end < start || date > end))) return null;
  // UTC is a date-only arithmetic axis, not an inferred travel timezone or instant.
  return (
    (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000 + 1
  );
}
