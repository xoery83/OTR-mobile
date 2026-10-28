import pack from "./fixtures/p6-fidelity-v1.json";
import type { TicketedActivityFacts } from "@/features/day-feed/TicketedActivityRow";
import type { CorePlaceView } from "@/domain/trip/tripCoreV2Day";
// Diagnostics only: frozen fixture visibility flags are never production authorization.
type Place = {
  name?: string;
  address?: string;
  qualification?: string;
  latitude?: number;
  longitude?: number;
};
type Clock = { date?: string; time?: string; zone?: string };
type Person = {
  id: string;
  personId?: string;
  visible: boolean;
  matched?: boolean;
  name: string;
  seat?: string;
  section?: string;
  row?: string;
};
type Activity = {
  id: string;
  visible: boolean;
  name: string;
  start: Clock;
  end?: Clock;
  venue?: Place;
  entry?: Clock & { required?: boolean; kind?: string; place?: Place };
  facts?: {
    visible: boolean;
    label: string;
    value: string;
    semantic?: string;
    language?: string;
    evidence?: string;
  }[];
  attendees?: Person[];
  participants?: { visible: boolean; mode: string };
  ticketIds?: string[];
  documents?: {
    id: string;
    visible: boolean;
    title: string;
    kind?: string;
    canOpenOriginal?: boolean;
  }[];
  booking?: { id: string; visible: boolean; ref: string };
  instructions?: string;
  contact?: string;
  note?: string;
  photos?: { id: string; visible: boolean; activityId: string; uri?: string }[];
  expenses?: { id: string; visible: boolean; coverageActivityIds: string[] }[];
  ledger?: {
    visible: boolean;
    total: number;
    myShare?: number;
    currency: string;
    scale: number;
    originals?: { amount: number; scale: number; currency: string }[];
  };
  capabilities?: {
    edit?: boolean;
    addPhoto?: boolean;
    addAttachment?: boolean;
    addExpense?: boolean;
    linkExpense?: boolean;
  };
};
type Ticket = {
  id: string;
  visible: boolean;
  classification: string;
  title: string;
  activityIds: string[];
  personIds?: string[];
  access: "availableOffline" | "onlineRequired" | "notDownloaded" | "unavailable";
  canOpenOriginal: boolean;
  requiresSelection?: boolean;
};
export type ActivityFixtureScenario = {
  id: string;
  label: string;
  activities: Activity[];
  tickets: Ticket[];
};
export const activityFidelityScenarios = pack.scenarios as ActivityFixtureScenario[];
function place(value: Place | undefined): CorePlaceView | undefined {
  if (!value) return undefined;
  const qualified =
    value.qualification === "QUALIFIED" &&
    typeof value.latitude === "number" &&
    typeof value.longitude === "number";
  return {
    qualification: qualified ? "QUALIFIED" : "TEXT_ONLY",
    authoredLabel: value.name,
    authoredAddress: value.address,
    ...(qualified ? { latitude: value.latitude, longitude: value.longitude } : {}),
  };
}
export function activityFidelityFacts(
  scenario: ActivityFixtureScenario,
  id: string,
  action: (kind: string, id: string) => void = () => {},
): TicketedActivityFacts | null {
  const activity = scenario.activities.find((a) => a.id === id && a.visible);
  if (!activity?.start.date) return null;
  const people = activity.attendees?.filter((p) => p.visible) ?? [];
  const viewer = people.find((p) => p.personId === pack.viewerPersonId && p.matched);
  const originals = scenario.tickets.filter(
    (ticket) =>
      ticket.visible &&
      ticket.activityIds.includes(id) &&
      activity.ticketIds?.includes(ticket.id),
  );
  const ticketFacts = (ticket: Ticket) => ({
    id: ticket.id,
    title: ticket.title,
    access: ticket.access,
    requiresSelection: ticket.requiresSelection,
    ...(ticket.canOpenOriginal &&
    !["unavailable", "notDownloaded"].includes(ticket.access)
      ? { onOpen: () => action("ticket", ticket.id) }
      : {}),
    coveredParticipants: people
      .filter((p) => ticket.personIds?.includes(p.personId ?? p.id))
      .map((p) => [p.name, p.section, p.row, p.seat].filter(Boolean).join(" · ")),
  });
  const photos = activity.photos?.filter((p) => p.visible && p.activityId === id) ?? [];
  const expenses = [
    ...new Map(
      activity.expenses
        ?.filter((e) => e.visible && e.coverageActivityIds.includes(id))
        .map((e) => [e.id, e]) ?? [],
    ).values(),
  ];
  const ledger = activity.ledger?.visible ? activity.ledger : undefined;
  return {
    family: "P6",
    title: activity.name,
    start: { ...activity.start, date: activity.start.date },
    end: activity.end,
    venue: place(activity.venue),
    entryPlace: place(activity.entry?.place),
    ...(activity.entry?.required && activity.entry.date && activity.entry.time
      ? {
          requiredArrival: {
            date: activity.entry.date,
            time: activity.entry.time,
            zone: activity.entry.zone,
            place: place(activity.entry.place),
          },
        }
      : {}),
    ...(viewer
      ? { ownAdmission: { seat: viewer.seat, row: viewer.row, section: viewer.section } }
      : {}),
    participants: people.map((p) => ({
      id: p.id,
      name: p.name,
      seat: p.seat,
      row: p.row,
      section: p.section,
    })),
    ...(activity.participants?.visible && activity.participants.mode === "WHOLE_GROUP"
      ? { participationMode: "WHOLE_GROUP" }
      : {}),
    dynamicAdmission: activity.facts?.filter((f) => f.visible),
    instructions: activity.instructions,
    note: activity.note,
    tickets: originals.filter((t) => t.classification === "TICKET").map(ticketFacts),
    bookings: activity.booking?.visible
      ? [{ id: activity.booking.id, title: activity.booking.ref }]
      : [],
    documents: [
      ...(activity.documents
        ?.filter((d) => d.visible)
        .map((d) => ({
          id: d.id,
          title: d.title,
          ...(d.canOpenOriginal ? { onOpen: () => action("document", d.id) } : {}),
        })) ?? []),
      ...originals
        .filter((t) => t.classification !== "TICKET")
        .map((t) => ({
          ...ticketFacts(t),
          onOpen: t.canOpenOriginal ? () => action("document", t.id) : undefined,
        })),
    ],
    photos: photos.length
      ? {
          count: photos.length,
          previews: photos
            .filter((p): p is typeof p & { uri: string } => !!p.uri)
            .map((p) => ({ id: p.id, uri: p.uri })),
          onViewAll: () => action("photos", id),
        }
      : undefined,
    expenseCount: expenses.length,
    expenseSummary: ledger
      ? {
          total: { minor: ledger.total, currency: ledger.currency, scale: ledger.scale },
          ...(ledger.myShare !== undefined
            ? {
                myShare: {
                  minor: ledger.myShare,
                  currency: ledger.currency,
                  scale: ledger.scale,
                },
              }
            : {}),
          originals: ledger.originals?.map((a) => ({
            minor: a.amount,
            currency: a.currency,
            scale: a.scale,
          })),
        }
      : undefined,
    ...(activity.capabilities?.edit ? { onEdit: () => action("edit", id) } : {}),
    ...(activity.capabilities?.addPhoto
      ? { onAddPhoto: () => action("addPhoto", id) }
      : {}),
    ...(activity.capabilities?.addAttachment
      ? { onAddAttachment: () => action("addAttachment", id) }
      : {}),
    ...(activity.capabilities?.addExpense
      ? { onAddExpense: () => action("addExpense", id) }
      : {}),
    ...(activity.capabilities?.linkExpense
      ? { onLinkExpense: () => action("linkExpense", id) }
      : {}),
  };
}
