import { acceptedBoundaryAnchor } from "@/domain/trip/dayReadModel";
import { endpoint } from "./presentation";
import { t } from "@/ui/locale";
import type { FlightPresentation } from "./presentation";
import type { MoveItem, MoveProposal } from "./p1MoveTypes";
export type BookingContext = "FUTURE" | "TODAY" | "PAST" | "UNKNOWN";
export type ReadDocument = {
  id: string;
  version: string;
  title: string;
  contentKey?: string;
  onOpen?: () => void;
};
export type ReadParticipation = {
  mode: "WHOLE_GROUP" | "SELF" | "SELECTED_MEMBERS";
  personIds?: readonly string[];
  onOpen?: () => void;
};
export type BookingAssociations = {
  participation?: ReadParticipation;
  note?: string;
  documents?: readonly ReadDocument[];
  photoIds?: readonly string[];
  photos?: readonly { id: string; uri?: string; syntheticLabel?: string }[];
  expenseIds?: readonly string[];
  onPhotos?: () => void;
  onDocuments?: () => void;
  onExpenses?: () => void;
  addPhoto?: () => void;
  addAttachment?: () => void;
  addExpense?: () => void;
  linkExpense?: () => void;
};
export type FlightLegRead = {
  id: string;
  flight: FlightPresentation;
  bookingRefs?: readonly string[];
  seats?: readonly string[];
  documents?: readonly ReadDocument[];
  onDocuments?: () => void;
  map?: () => void;
  navigate?: () => void;
};
// Ordered members must come from an owning Journey read, never PNR/airport proximity.
export type FlightJourneyRead = BookingAssociations & {
  id: string;
  legs: readonly FlightLegRead[];
  onEdit?: () => void;
};
export type StayRead = BookingAssociations & {
  id: string;
  title: string;
  pending?: boolean;
  start: string;
  end: string;
  checkinTime?: string | null;
  checkoutTime?: string | null;
  zone?: string | null;
  placeName?: string;
  address?: string;
  area?: string;
  permittedCheckin?: string;
  checkoutBy?: string;
  checkinInstructions?: string;
  checkoutInstructions?: string;
  confirmationDocuments?: readonly ReadDocument[];
  checkinDocuments?: readonly ReadDocument[];
  checkoutDocuments?: readonly ReadDocument[];
  onConfirmationDocuments?: () => void;
  onCheckinDocuments?: () => void;
  onCheckoutDocuments?: () => void;
  contactText?: string;
  onContact?: () => void;
  bookings?: readonly {
    id: string;
    title?: string;
    reference?: string;
    guests?: readonly string[];
  }[];
  map?: () => void;
  navigate?: () => void;
  onEdit?: () => void;
  ledger?: {
    currency: string;
    scale: number;
    total: number;
    myShare?: number;
    totalPerNight?: number;
    mySharePerNight?: number;
    denominator?: number;
    originals?: readonly { currency: string; minor: number; scale: number }[];
  };
};
export function readableDocuments(
  groups: readonly (readonly ReadDocument[] | undefined)[],
) {
  const docs = new Map<string, ReadDocument>(),
    conflicts = new Set<string>();
  for (const doc of groups.flatMap((g) => g ?? [])) {
    if (!doc.id || !doc.version || conflicts.has(doc.id)) continue;
    const previous = docs.get(doc.id);
    if (
      previous &&
      (previous.version !== doc.version ||
        previous.title !== doc.title ||
        previous.contentKey !== doc.contentKey)
    ) {
      docs.delete(doc.id);
      conflicts.add(doc.id);
    } else if (!previous) docs.set(doc.id, doc);
    else if (!previous.onOpen || !doc.onOpen)
      docs.set(doc.id, { ...previous, onOpen: undefined });
  }
  return [...docs.values()];
}
export function participationLabel(value?: ReadParticipation) {
  if (!value) return null;
  if (value.mode === "WHOLE_GROUP") return t("tripCreate.planEveryone");
  if (value.mode === "SELF") return t("tripCreate.planOnlyMe");
  const count = new Set(value.personIds).size;
  return count ? t("fidelity.people", { count }) : null;
}
export function stayNights(stay: Pick<StayRead, "start" | "end">) {
  const n =
    (Date.parse(stay.end + "T12:00:00Z") - Date.parse(stay.start + "T12:00:00Z")) /
    86400000;
  return Number.isSafeInteger(n) && n >= 0 ? n : null;
}
export function stayInsertionTime(stay: StayRead, role: string, context: BookingContext) {
  if (context !== "FUTURE" && context !== "TODAY") return null;
  return stayPlannedClock(stay, role);
}
export function stayPlannedClock(stay: StayRead, role: string) {
  const time =
    role === "CHECKIN"
      ? stay.checkinTime
      : role === "CHECKOUT"
        ? stay.checkoutTime
        : null;
  return time && /^([01]\d|2[0-3]):[0-5]\d(?::00)?$/.test(time) ? time.slice(0, 5) : null;
}

export function stayMoveItem(stay: StayRead, role: string) {
  if (role !== "CHECKIN" && role !== "CHECKOUT") return undefined;
  const time = stayPlannedClock(stay, role);
  const authored = role === "CHECKIN" ? stay.checkinTime : stay.checkoutTime;
  if (authored && !time) return undefined;
  const other = stayPlannedClock(stay, role === "CHECKIN" ? "CHECKOUT" : "CHECKIN");
  const otherMinute = other
    ? Number(other.slice(0, 2)) * 60 + Number(other.slice(3, 5))
    : null;
  return {
    id: `${stay.id}:${role}`,
    title: stay.title,
    availability: "READY",
    dateScope: "SAME_DAY",
    clockRole: role === "CHECKIN" ? "CHECKIN" : "CHECKOUT",
    date: role === "CHECKIN" ? stay.start : stay.end,
    time,
    ...(stay.start === stay.end && otherMinute !== null
      ? {
          minuteRange:
            role === "CHECKIN"
              ? ([0, otherMinute] as const)
              : ([otherMinute, 1439] as const),
        }
      : {}),
  } satisfies MoveItem & { id: string; title: string };
}

export function stayMoveProposal(
  item: MoveItem,
  date: string,
  minute: number,
): MoveProposal {
  if (date !== item.date || !Number.isSafeInteger(minute) || minute < 0 || minute > 1439)
    return { status: "UNAVAILABLE", unavailableReason: "DAY_LOCK" };
  const time = `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
  if (item.minuteRange && (minute < item.minuteRange[0] || minute > item.minuteRange[1]))
    return {
      status: "UNAVAILABLE",
      unavailableReason: "STAY_ORDER",
      date: item.date,
      time,
    };
  return {
    status: "READY",
    date: item.date,
    time,
  };
}

export function flightConnectionMinutes(a: FlightLegRead, b: FlightLegRead) {
  const arrival = endpoint(a.flight, "DESTINATION"),
    departure = endpoint(b.flight, "ORIGIN");
  const airport = a.flight.supplemental.endpoints.DESTINATION.code;
  if (
    !airport ||
    airport !== b.flight.supplemental.endpoints.ORIGIN.code ||
    !arrival ||
    !departure
  )
    return null;
  const end = acceptedBoundaryAnchor(arrival),
    start = acceptedBoundaryAnchor(departure);
  if (!end || !start) return null;
  const minutes = (Date.parse(start) - Date.parse(end)) / 60000;
  return Number.isSafeInteger(minutes) && minutes >= 0 ? minutes : null;
}
