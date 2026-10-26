import { createElement, Fragment } from "react";
import { t } from "@/ui/locale";
import { itemsForLocalDate } from "@/domain/trip/dayReadModel";
import { closedItemCapabilities, type CoreDayRow } from "@/domain/trip/tripCoreV2Day";
import { StayReadRow, type StayRole } from "@/features/day-feed/StayReadView";
import {
  readableDocuments,
  type StayRead,
  type ReadDocument,
} from "@/features/day-feed/bookingReadPresentation";
import type { FixtureContribution } from "./contribution";
import type { FidelityAction } from "./flightFidelityFixture";
import { boundary, place, scenario } from "./fixtureFacts";
import pack from "./fixtures/p3-fidelity-v1.json";
import adjacent from "./fixtures/p3-adjacent-v1.json";
import type {
  FixtureMovePreview,
  MovePoint,
  useP1Move,
} from "@/features/day-feed/useP1Move";
type Sample = Omit<(typeof pack.items)[number], "documents" | "participants"> & {
  documents: {
    id: string;
    title: string;
    visible: boolean;
    kind?: string;
    text?: string;
    canOpenOriginal?: boolean;
  }[];
  participants: {
    mode: "WHOLE_GROUP" | "SELF" | "SELECTED_MEMBERS";
    personIds?: string[];
    visible: boolean;
  } | null;
};
export const staySamples = pack.items as Sample[];
export function stayFidelityRead(sample: Sample, action: FidelityAction): StayRead {
  const preview = () => action(sample.title);
  const docs: ReadDocument[] = sample.documents
    .filter((d) => d.visible)
    .map((d) => ({
      id: d.id,
      version: "1",
      title: d.title,
      contentKey: d.text,
      ...(d.canOpenOriginal && d.text ? { onOpen: () => action(d.title, d.text) } : {}),
    }));
  const scopeDocs = (kind: string) =>
    readableDocuments([
      docs.filter((d) =>
        sample.documents.some((source) => source.id === d.id && source.kind === kind),
      ),
    ]);
  const confirmations = scopeDocs("confirmation"),
    checkin = scopeDocs("checkin"),
    checkout = scopeDocs("checkout");
  const choose = (list: ReadDocument[]) => () =>
    action(t("fidelity.attachmentsTitle"), undefined, list);
  const ledger = sample.ledger?.visible ? sample.ledger : null;
  const field = (name: string) =>
    ledger && name in ledger && typeof ledger[name as keyof typeof ledger] === "number"
      ? (ledger[name as keyof typeof ledger] as number)
      : undefined;
  const currency =
    ledger && "currency" in ledger && typeof ledger.currency === "string"
      ? ledger.currency
      : undefined;
  const total = field("total");
  const visiblePhotos = sample.photos.filter((p) => p.visible);
  return {
    id: sample.id,
    title: sample.title,
    start: sample.start,
    end: sample.end,
    zone: sample.zone,
    checkinTime: sample.checkinTime,
    checkoutTime: sample.checkoutTime,
    placeName: sample.place?.name,
    address: sample.place && "address" in sample.place ? sample.place.address : undefined,
    area: sample.place?.area,
    permittedCheckin: sample.permittedCheckin ?? undefined,
    checkoutBy: sample.permittedCheckout ?? undefined,
    checkinInstructions: checkin
      .filter((d) => d.onOpen)
      .map((d) => d.contentKey)
      .filter(Boolean)
      .join("\n\n"),
    checkoutInstructions: checkout
      .filter((d) => d.onOpen)
      .map((d) => d.contentKey)
      .filter(Boolean)
      .join("\n\n"),
    confirmationDocuments: confirmations,
    checkinDocuments: checkin,
    checkoutDocuments: checkout,
    onConfirmationDocuments: choose(confirmations),
    onCheckinDocuments: choose(checkin),
    onCheckoutDocuments: choose(checkout),
    documents: readableDocuments([docs]),
    onDocuments: choose(docs),
    contactText: sample.contact ?? undefined,
    ...(sample.contact ? { onContact: preview } : {}),
    ...(sample.participants?.visible
      ? {
          participation: {
            mode: sample.participants.mode as "WHOLE_GROUP" | "SELF" | "SELECTED_MEMBERS",
            personIds:
              "personIds" in sample.participants
                ? sample.participants.personIds
                : undefined,
            ...(sample.capabilities.participants ? { onOpen: preview } : {}),
          },
        }
      : {}),
    note: sample.note ?? undefined,
    bookings: sample.bookings
      .filter((b) => b.visible)
      .map((b) => ({ id: b.id, title: b.title, reference: b.ref, guests: b.guests })),
    photoIds: visiblePhotos.map((p) => p.id),
    photos: visiblePhotos.map((p, i) => ({
      id: p.id,
      syntheticLabel: t("bookingRead.syntheticPhoto", { number: i + 1 }),
    })),
    expenseIds: sample.expenses.filter((e) => e.visible).map((e) => e.id),
    onPhotos: preview,
    onExpenses: preview,
    ...(sample.place?.name || sample.place?.area ? { map: preview } : {}),
    ...(sample.place?.qualification === "SYNTHETIC_QUALIFIED_PLACE"
      ? { navigate: preview }
      : {}),
    ...(sample.capabilities.edit ? { onEdit: preview } : {}),
    ...(sample.capabilities.addPhoto ? { addPhoto: preview } : {}),
    ...(sample.capabilities.addAttachment ? { addAttachment: preview } : {}),
    ...(sample.capabilities.addExpense ? { addExpense: preview } : {}),
    ...(sample.capabilities.linkExpense ? { linkExpense: preview } : {}),
    ...(currency && total !== undefined
      ? {
          ledger: {
            currency,
            scale: 2,
            total,
            totalPerNight: field("totalPerNight"),
            myShare: field("myShare"),
            mySharePerNight: field("mySharePerNight"),
            denominator: field("denominator"),
            originals:
              ledger && "originals" in ledger
                ? ledger.originals?.map((o) => ({
                    currency: o.currency,
                    minor: o.amount,
                    scale: 2,
                  }))
                : undefined,
          },
        }
      : {}),
  };
}
export function stayFidelityFixture(
  id: string,
  clock: string,
  action: FidelityAction,
  open: (role: StayRole, date: string, itemId: string) => void,
  insert: (
    role: StayRole,
    date: string,
    side: "BEFORE" | "AFTER",
    itemId: string,
  ) => void,
  preferredRole?: StayRole,
  move?: {
    previews: Record<string, FixtureMovePreview>;
    start(id: string, point: MovePoint): void;
    wrapRow: ReturnType<typeof useP1Move>["wrapRow"];
    wrapClock: ReturnType<typeof useP1Move>["wrapClock"];
  },
  selectRole?: (role: StayRole, focused: boolean) => void,
): FixtureContribution & { stay: StayRead; stays: StayRead[] } {
  const primary = staySamples.find((s) => s.id === id) ?? staySamples[0];
  // Explicit second Stay from frozen reference/p3-app.js, never inferred from adjacency.
  const samples =
    primary.id === "syn-stay-change"
      ? [
          primary,
          {
            ...staySamples[0],
            ...adjacent.stay,
            start: primary.end,
          },
        ]
      : [primary];
  const stays = samples.map((sample) => {
    const stay = stayFidelityRead(sample, action);
    stay.checkinTime = move?.previews[`${stay.id}:CHECKIN`]?.time ?? stay.checkinTime;
    stay.checkoutTime = move?.previews[`${stay.id}:CHECKOUT`]?.time ?? stay.checkoutTime;
    return stay;
  });
  const stay = stays[0],
    end = stays.reduce((end, s) => (s.end > end ? s.end : end), stay.end);
  const events = stays.map((stay) => ({
    ...place(stay.id, stay.title, stay.start),
    event_type: "hotel" as const,
    temporal_shape: "STAY" as const,
    boundaries: [boundary("START", stay.start), boundary("END", stay.end)],
  }));
  const base = scenario("p3-fidelity-only", pack.trip.title, events);
  const dates: string[] = [];
  for (
    let date = stay.start;
    date <= end;
    date = new Date(Date.parse(date + "T12:00:00Z") + 86400000).toISOString().slice(0, 10)
  )
    dates.push(date);
  const today =
    clock === "future"
      ? "2027-01-01"
      : clock === "past"
        ? "2027-02-01"
        : preferredRole === "CHECKOUT"
          ? stay.end
          : preferredRole === "BASE"
            ? (dates[1] ?? stay.start)
            : stay.start;
  const instant = today + "T00:00:00Z";
  return {
    ...base,
    stay,
    stays,
    instant,
    dates,
    selectedDate: dates[0],
    dateRange: { start: stay.start, end },
    query(date, zone) {
      const coreRows: CoreDayRow[] = [];
      const occurrences = stays.flatMap((stay, index) => {
        if (date < stay.start || date > stay.end) return [];
        const roles: StayRole[] =
          stay.start === stay.end
            ? ["CHECKIN", "CHECKOUT"]
            : date === stay.start
              ? ["CHECKIN"]
              : date === stay.end
                ? ["CHECKOUT"]
                : ["BASE"];
        for (const role of roles) {
          const time =
            role === "CHECKIN"
              ? stay.checkinTime
              : role === "CHECKOUT"
                ? stay.checkoutTime
                : null;
          coreRows.push({
            rowKey: { itemId: stay.id, projectionRole: role, localDate: date },
            itemRevision: 1,
            projectionVersion: 2,
            certificateGeneration: null,
            family: "P3",
            title: stay.title,
            status: "planned",
            position: role === "BASE" ? "BASE" : "TNS",
            itemRef: stay.id,
            capabilities: closedItemCapabilities,
            ...(time
              ? { displayTime: { comparable: false, localDate: date, localTime: time } }
              : {}),
          });
        }
        return [
          {
            ...events[index],
            temporal_shape: "POINT" as const,
            boundaries: [boundary("START", date)],
          },
        ];
      });
      return {
        ...itemsForLocalDate({ ...base.projection, events: occurrences }, date, zone),
        unresolved: [],
        coreRows,
      };
    },
    renderer(props) {
      const stay = stays.find((s) => s.id === props.row.item.event.id);
      if (!stay) return null;
      const keys = props.row.coreRowKeys;
      return createElement(
        Fragment,
        null,
        ...keys.map((key) => {
          const role: StayRole =
            key.projectionRole === "CHECKIN"
              ? "CHECKIN"
              : key.projectionRole === "CHECKOUT"
                ? "CHECKOUT"
                : "BASE";
          const date = key.localDate,
            regionKey = `${props.row.key}:${role}`;
          const focused =
            props.depth === "F" &&
            (keys.length === 1 || role === (preferredRole ?? "CHECKIN"));
          const content = createElement(StayReadRow, {
            key: regionKey,
            stay,
            role,
            focused,
            context: props.context ?? "UNKNOWN",
            hideDivider: props.nextFocused,
            onFocus: () =>
              keys.length > 1 && selectRole
                ? selectRole(role, !focused)
                : props.onDepth(focused ? "B" : "F"),
            onOpen: () => open(role, date, stay.id),
            onInsert: (side) => insert(role, date, side, stay.id),
            renderTime: move
              ? (time, content) =>
                  move.wrapClock(
                    `${regionKey}:clock`,
                    date,
                    Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5)),
                    content,
                  )
              : undefined,
            onMove:
              move && stay.onEdit
                ? (event) =>
                    move.start(`${stay.id}:${role}`, {
                      x: event.nativeEvent.pageX,
                      y: event.nativeEvent.pageY,
                    })
                : undefined,
          });
          return move
            ? createElement(
                Fragment,
                { key: regionKey },
                move.wrapRow(regionKey, date, content),
              )
            : content;
        }),
      );
    },
  };
}
