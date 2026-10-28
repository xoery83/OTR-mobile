import type { LocalManualRead } from "@/data/repositories/tripLocalManualReadRepository";
import type { CoreBoundaryView } from "@/domain/trip/tripCoreV2Day";
import { validateCalendarDate } from "@/domain/trip/dayReadModel";
import { stayMoveItem } from "./bookingReadPresentation";
import type { StayRead } from "./bookingReadPresentation";
// Actor-filtered Reader facts only; optional owning actions are supplied by the caller.
export function localStayPresentation(
  item: LocalManualRead["items"][number],
): StayRead | null {
  if (
    !Number.isSafeInteger(item.itemRevision) ||
    Number(item.itemRevision) < 1 ||
    item.family !== "P3" ||
    item.hidden ||
    ["cancelled", "skipped"].includes(String(item.status))
  )
    return null;
  const schedule = item.schedule as { start?: CoreBoundaryView; end?: CoreBoundaryView };
  if (!schedule.start?.localDate || !schedule.end?.localDate) return null;
  try {
    validateCalendarDate(schedule.start.localDate);
    validateCalendarDate(schedule.end.localDate);
    if (schedule.end.localDate < schedule.start.localDate) return null;
  } catch {
    return null;
  }
  const text = (key: string) =>
    typeof item.details[key] === "string" && item.details[key]
      ? (item.details[key] as string)
      : undefined;
  const mode = item.participation.mode;
  const address = item.place?.acceptedAddress ?? item.place?.authoredAddress;
  const placeName = item.place?.authoredLabel;
  return {
    pending: item.localState === "PENDING",
    id: item.itemId,
    // ui-foundation-exception: string -- Core field key, not display copy.
    title: text("propertyName") ?? String(item.title),
    start: schedule.start.localDate,
    end: schedule.end.localDate,
    checkinTime: schedule.start.localTime,
    checkoutTime: schedule.end.localTime,
    zone: schedule.start.zoneId,
    placeName: placeName?.trim() === address?.trim() ? undefined : placeName,
    address,
    permittedCheckin:
      [text("permittedCheckinFrom"), text("permittedCheckinUntil")]
        .filter(Boolean)
        .join("–") || undefined,
    checkoutBy: text("permittedCheckoutBy"),
    ...(mode === "WHOLE_GROUP" || mode === "SELF" || mode === "SELECTED_MEMBERS"
      ? {
          participation: {
            mode,
            personIds: item.participation.personIds.filter(
              (id): id is string => typeof id === "string",
            ),
          },
        }
      : {}),
    ...(typeof item.description === "string" ? { note: item.description } : {}),
    bookings: item.bookingSummaries?.flatMap((booking) =>
      typeof booking.id === "string" &&
      Number.isSafeInteger(booking.revision) &&
      Number(booking.revision) > 0
        ? [
            {
              id: booking.id,
              ...(typeof booking.title === "string" ? { title: booking.title } : {}),
              ...("confirmation_code" in booking &&
              typeof booking.confirmation_code === "string"
                ? { reference: booking.confirmation_code }
                : {}),
            },
          ]
        : [],
    ),
    documents: item.documentSummaries.flatMap((d) =>
      typeof d.id === "string" &&
      typeof d.title === "string" &&
      typeof d.contentVersion === "number" &&
      Number.isSafeInteger(d.contentVersion)
        ? [{ id: d.id, title: d.title, version: String(d.contentVersion) }]
        : [],
    ),
  };
}

// This manual Repository changes Floating civil clocks only; it cannot preserve
// named-zone instant qualification or resolve DST gaps/folds during a drag.
export function localStayMoveItem(item: LocalManualRead["items"][number], role: string) {
  const schedule = item.schedule as { start?: CoreBoundaryView; end?: CoreBoundaryView };
  if (
    [schedule.start, schedule.end].some(
      (b) => b && (b.zoneId || b.instant || b.comparable || b.quality === "EXACT"),
    )
  )
    return undefined;
  const stay = localStayPresentation(item);
  return stay ? stayMoveItem(stay, role) : undefined;
}
export function localStayMapTargets(item: LocalManualRead["items"][number]) {
  const stay = localStayPresentation(item);
  if (!stay) return null;
  const query = stay.address ?? stay.placeName ?? stay.title;
  const place = item.place;
  const qualified =
    place?.qualification === "QUALIFIED" &&
    typeof place.latitude === "number" &&
    typeof place.longitude === "number" &&
    Number.isFinite(place.latitude) &&
    Number.isFinite(place.longitude) &&
    Math.abs(place.latitude) <= 90 &&
    Math.abs(place.longitude) <= 180;
  return {
    map: `https://maps.apple.com/?q=${encodeURIComponent(query)}`,
    navigate: qualified
      ? `https://maps.apple.com/?daddr=${place!.latitude},${place!.longitude}`
      : null,
  };
}
