import { createElement, Fragment } from "react";
import { itemsForLocalDate } from "@/domain/trip/dayReadModel";
import { closedItemCapabilities, type CoreDayRow } from "@/domain/trip/tripCoreV2Day";
import { RentalContent, type RentalFacts } from "@/features/day-feed/RentalRow";
import { t } from "@/ui/locale";
import { boundary, place, scenario } from "./fixtureFacts";
import type { FixtureContribution } from "./contribution";
import type { FidelityAction } from "./flightFidelityFixture";
import pack from "./fixtures/p4-fidelity-v1.json";
type Endpoint = {
  date: string;
  time?: string | null;
  zone?: string | null;
  place?: {
    name?: string;
    address?: string;
    area?: string;
    qualification?: string;
  } | null;
};
type Rental = {
  id: string;
  visible: boolean;
  name: string;
  label?: string;
  supplier?: string;
  bookedClass?: string;
  pickup: Endpoint;
  return?: Endpoint | null;
  actual?: { model?: string; plate?: string; visible?: boolean } | null;
  holder?: { name: string; visible: boolean } | null;
  drivers?: { name: string; visible: boolean }[];
  booking?: { id: string; ref: string; visible: boolean } | null;
  contact?: string | null;
  documents: {
    id: string;
    kind: string;
    title: string;
    visible: boolean;
    canOpenOriginal?: boolean;
    text?: string;
  }[];
  photos: { id: string; visible: boolean }[];
  expenses: { id: string; visible: boolean; canEdit?: boolean }[];
  ledger?: {
    visible: boolean;
    currency: string;
    total?: number;
    myShare?: number;
    billingDays?: number | null;
    dayBasis?: string | null;
    totalPerDay?: number | null;
    myPerDay?: number | null;
    originals?: { currency: string; amount: number }[];
  } | null;
  relatedRentalIds?: string[];
  note?: string | null;
  capabilities?: Record<string, boolean>;
};
export const rentalScenarios = pack.scenarios as unknown as {
  id: string;
  label: string;
  rentals: Rental[];
}[];
export function rentalFidelityRead(
  sample: Rental,
  action: FidelityAction,
  related?: { rentals: readonly Rental[]; open(target: Rental): void },
): RentalFacts {
  const preview = () => action(sample.name);
  const endpoint = (value: Endpoint): RentalFacts["pickup"] => ({
    date: value.date,
    ...(value.time ? { time: value.time } : {}),
    zone: value.zone,
    ...(value.place
      ? {
          onMap: () =>
            action(
              t("fidelity.map"),
              value.place?.address ?? value.place?.name ?? value.place?.area,
            ),
          ...(value.place.qualification === "SYNTHETIC_QUALIFIED_PLACE"
            ? { onNavigate: () => action(t("fidelity.navigate"), value.place?.address) }
            : {}),
        }
      : {}),
    ...(value.place
      ? {
          place: {
            qualification: "TEXT_ONLY",
            authoredLabel: value.place.name,
            authoredAddress: value.place.address ?? value.place.area,
          },
        }
      : {}),
  });
  const documents = (kind: string) =>
    sample.documents
      .filter((d) => d.kind === kind && d.visible && d.canOpenOriginal && d.text)
      .map((d) => ({ id: d.id, title: d.title, onOpen: () => action(d.title, d.text) }));
  const photos = sample.photos.filter((p) => p.visible),
    expenses = sample.expenses.filter((e) => e.visible);
  const ledger = sample.ledger?.visible ? sample.ledger : null;
  const billed =
    Number.isSafeInteger(ledger?.billingDays) &&
    (ledger?.billingDays ?? 0) > 0 &&
    !!ledger?.dayBasis;
  // Frozen reference uses explicit minor units; no date-span billing calculation.
  const money = (minor: number, currency: string) => ({ minor, currency, scale: 2 });
  return {
    family: "P4",
    associatedVehicles: related
      ? (sample.relatedRentalIds ?? []).flatMap((id) => {
          const target = related.rentals.find((r) => r.id === id);
          return target?.visible &&
            sample.booking?.visible &&
            target.booking?.visible &&
            target.booking.id === sample.booking.id
            ? [
                {
                  id,
                  label: target.label ?? target.name,
                  onOpen: () => related.open(target),
                },
              ]
            : [];
        })
      : undefined,
    pickup: endpoint(sample.pickup),
    ...(sample.return ? { return: endpoint(sample.return) } : {}),
    supplier: sample.supplier,
    bookedClass: sample.bookedClass,
    actualModel: sample.actual?.visible ? sample.actual.model : undefined,
    plate: sample.actual?.visible ? sample.actual.plate : undefined,
    stableVehicleLabel: sample.label,
    ...(sample.holder?.visible ? { holder: sample.holder.name } : {}),
    drivers: sample.drivers?.filter((d) => d.visible).map((d) => d.name),
    ...(sample.booking?.visible ? { reference: sample.booking.ref } : {}),
    bookingOriginals: documents("confirmation"),
    pickupInstructions: documents("pickup"),
    returnInstructions: documents("return"),
    ...(sample.contact ? { call: () => action(t("p4.call"), sample.contact!) } : {}),
    ...(photos.length
      ? {
          photos: {
            count: photos.length,
            previews: photos.slice(0, 3).map((p, index) => ({
              id: p.id,
              syntheticLabel: t("bookingRead.syntheticPhoto", { number: index + 1 }),
            })),
            onViewAll: preview,
          },
        }
      : {}),
    expenseCount: expenses.length,
    ...(ledger && typeof ledger.total === "number"
      ? {
          expenseSummary: {
            total: money(ledger.total, ledger.currency),
            ...(typeof ledger.myShare === "number"
              ? { myShare: money(ledger.myShare, ledger.currency) }
              : {}),
            ...(billed
              ? {
                  billingDays: ledger.billingDays!,
                  ...(typeof ledger.totalPerDay === "number"
                    ? { perDay: money(ledger.totalPerDay, ledger.currency) }
                    : {}),
                  ...(typeof ledger.myPerDay === "number"
                    ? { myPerDay: money(ledger.myPerDay, ledger.currency) }
                    : {}),
                }
              : {}),
            originals: ledger.originals?.map((o) => money(o.amount, o.currency)),
          },
        }
      : {}),
    ...(sample.capabilities?.edit ? { onEdit: preview } : {}),
    ...(sample.capabilities?.linkExpense ? { onLinkExpense: preview } : {}),
    ...(sample.capabilities?.addExpense ? { onAddExpense: preview } : {}),
    ...(sample.capabilities?.addPhoto ? { onAddPhoto: preview } : {}),
    ...(sample.capabilities?.addAttachment ? { onAddAttachment: preview } : {}),
    ...(expenses.some((e) => e.canEdit) ? { onEditExpense: preview } : {}),
  };
}
// DEV-only frozen fixture, never adopted by TripView/Repository or Admission.
export function rentalFidelityFixture(
  id: string,
  clock: string,
  action: FidelityAction,
  open: (role: "PICKUP" | "RETURN", date: string, item: string) => void,
  insert: (role: string, date: string, side: "BEFORE" | "AFTER") => void,
  preferredRole: "PICKUP" | "RETURN" = "PICKUP",
  selectedItem?: string,
): FixtureContribution & { rentals: Rental[]; rental: Rental } {
  const sample = rentalScenarios.find((s) => s.id === id) ?? rentalScenarios[0];
  const rentals = sample.rentals.filter((r) => r.visible),
    rental = rentals.find((r) => r.id === selectedItem) ?? rentals[0];
  const end = rentals
    .map((r) => r.return?.date ?? r.pickup.date)
    .sort()
    .at(-1)!;
  const base = scenario(
    `p4-reference-${sample.id}`,
    pack.trip.title,
    rentals.map((r) => place(r.id, r.name, r.pickup.date)),
  );
  const selectedDate =
    preferredRole === "RETURN"
      ? (rental.return?.date ?? rental.pickup.date)
      : rental.pickup.date;
  const day = new Date(`${selectedDate}T12:00:00Z`);
  day.setUTCDate(day.getUTCDate() + (clock === "future" ? -1 : clock === "past" ? 1 : 0));
  return {
    ...base,
    rentals,
    rental,
    selectedDate,
    dateRange: { start: rental.pickup.date, end },
    instant: day.toISOString(),
    metadata: { summary: t("fidelity.previewOnly"), expected: [] },
    dates: Array.from(
      {
        length:
          Math.round((Date.parse(end) - Date.parse(rental.pickup.date)) / 86400000) + 1,
      },
      (_, i) =>
        new Date(Date.parse(`${rental.pickup.date}T12:00:00Z`) + i * 86400000)
          .toISOString()
          .slice(0, 10),
    ),
    query(date, zone) {
      const coreRows: CoreDayRow[] = [];
      const events = rentals.flatMap((r) => {
        const roles = [
          ...(r.pickup.date === date ? ["PICKUP" as const] : []),
          ...(r.return?.date === date ? ["RETURN" as const] : []),
        ];
        if (!roles.length) return [];
        for (const role of roles)
          coreRows.push({
            rowKey: { itemId: r.id, projectionRole: role, localDate: date },
            itemRevision: 1,
            projectionVersion: 2,
            certificateGeneration: null,
            family: "P4",
            title: r.name,
            status: "planned",
            position: "TNS",
            itemRef: r.id,
            capabilities: closedItemCapabilities,
          });
        return roles.map((role) => ({
          ...place(r.id, r.name, date),
          boundaries: [boundary(role === "PICKUP" ? "START" : "END", date)],
        }));
      });
      return {
        ...itemsForLocalDate({ ...base.projection, events }, date, zone),
        unresolved: [],
        coreRows,
      };
    },
    renderer(props) {
      const sample = rentals.find((r) => r.id === props.row.item.event.id);
      if (!sample) return null;
      const facts = rentalFidelityRead(sample, action, {
        rentals,
        open: (target) => open("PICKUP", target.pickup.date, target.id),
      });
      return createElement(
        Fragment,
        null,
        ...props.row.coreRowKeys.map((key) => {
          const role = key.projectionRole === "RETURN" ? "RETURN" : "PICKUP";
          return createElement(RentalContent, {
            key: role,
            title: sample.name,
            pickup: role === "PICKUP",
            back: role === "RETURN",
            facts,
            note: sample.note ?? undefined,
            context: clock === "past" ? "PAST" : clock === "future" ? "FUTURE" : "TODAY",
            depth: props.depth,
            onDepth: (depth) =>
              depth === "I" ? open(role, key.localDate, sample.id) : props.onDepth(depth),
            onInsert: (side) => insert(role, key.localDate, side),
          });
        }),
      );
    },
  };
}
