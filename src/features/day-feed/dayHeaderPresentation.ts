import { formatUiDate, formatUiNumber, t } from "@/ui/locale";
import type { DayHeaderStyle } from "@/domain/trip/dayHeaderStyle";

export type DayHeaderDestination = Readonly<
  | {
      kind: "single" | "route";
      label: string;
      source: "explicit" | "stay" | "transport" | "activity";
    }
  | { kind: "unresolved"; label: null; source: "none" }
>;

// Current Core place/item projections omit geographic identity and group visibility.
// No Trip-level label, POI/address, participant mode or airport code proves a Day city.
export const unresolvedDayHeaderDestination: DayHeaderDestination = Object.freeze({
  kind: "unresolved",
  label: null,
  source: "none",
});

export function dayHeaderPresentation({
  date,
  start,
  today,
  style = "A",
  destination = unresolvedDayHeaderDestination,
}: {
  date: string;
  start: string;
  today: string;
  style?: DayHeaderStyle;
  destination?: DayHeaderDestination;
}) {
  const at = new Date(date + "T12:00:00Z");
  const ordinal =
    Math.round((at.getTime() - Date.parse(start + "T12:00:00Z")) / 86400000) + 1;
  const delta = Math.round((at.getTime() - Date.parse(today + "T12:00:00Z")) / 86400000);
  const weekday = formatUiDate(at, { weekday: "long", timeZone: "UTC" });
  const shortDate = formatUiDate(at, { dateStyle: "medium", timeZone: "UTC" });
  const weekdayDate = t("fidelity.weekdayDate", { weekday, date: shortDate });
  const day = t("fidelity.dayOrdinal", { day: formatUiNumber(ordinal) });
  const relative =
    delta === 0 ? t("search.today") : delta === 1 ? t("fidelity.tomorrow") : null;
  const label = destination.label?.trim() || null;
  const standardTitle = relative ?? weekday;
  const standardSubtitle = relative ? weekdayDate : shortDate;
  const title =
    style === "B"
      ? (relative ?? day)
      : style === "C"
        ? (label ?? standardTitle)
        : style === "D"
          ? (label ?? weekday)
          : standardTitle;
  const subtitle =
    style === "B"
      ? relative
        ? label
          ? t("dayHeader.dayDestination", { day, destination: label })
          : day
        : (label ?? shortDate)
      : style === "C"
        ? label
          ? weekdayDate
          : standardSubtitle
        : style === "D"
          ? label
            ? t("dayHeader.dayWeekday", { day, weekday })
            : day
          : standardSubtitle;
  return {
    ordinal,
    delta,
    title,
    subtitle,
    badgeTop:
      style === "B"
        ? formatUiDate(at, { weekday: "short", timeZone: "UTC" })
        : style === "D"
          ? formatUiDate(at, { month: "short", timeZone: "UTC" })
          : null,
    badgeBottom: formatUiNumber(
      style === "B" || style === "D" ? at.getUTCDate() : ordinal,
    ),
  };
}
