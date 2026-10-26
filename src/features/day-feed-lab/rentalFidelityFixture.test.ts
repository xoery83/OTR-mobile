import { expect, it, vi } from "vitest";
import { composeDayStream } from "@/features/day-feed/composition";
import {
  rentalFidelityFixture,
  rentalFidelityRead,
  rentalScenarios,
} from "./rentalFidelityFixture";
vi.mock("@/features/day-feed/RentalRow", () => ({ RentalContent: () => null }));
const fixture = (id: string, role: "PICKUP" | "RETURN" = "PICKUP") =>
  rentalFidelityFixture(id, "today", vi.fn(), vi.fn(), vi.fn(), role);
it("retains all nine frozen variants without Repository, proof or mutation access", () => {
  expect(rentalScenarios).toHaveLength(9);
  for (const sample of rentalScenarios) {
    const f = fixture(sample.id);
    for (const date of f.dates) {
      const query = f.query!(date, f.zone);
      expect(() => composeDayStream(query, f.instant)).not.toThrow();
      expect(
        query.coreRows?.every(
          (row) =>
            row.certificateGeneration === null &&
            Object.values(row.capabilities).every((value) => value === false),
        ),
      ).toBe(true);
    }
  }
});
it("projects pickup/return only, never a daily Rental base, preserving unknown return", () => {
  const f = fixture("full");
  expect(
    f.query!("2027-01-16", f.zone).coreRows?.map((r) => r.rowKey.projectionRole),
  ).toEqual(["PICKUP"]);
  expect(f.query!("2027-01-17", f.zone).coreRows).toEqual([]);
  expect(
    f.query!("2027-01-20", f.zone).coreRows?.map((r) => r.rowKey.projectionRole),
  ).toEqual(["RETURN"]);
  expect(fixture("minimal").rental.return).toBeNull();
});
it("keeps actual identity, multiple vehicles and explicit visible booking relationships separate", () => {
  const f = fixture("multi"),
    open = vi.fn();
  expect(f.rentals).toHaveLength(2);
  expect(new Set(f.rentals.map((r) => r.id)).size).toBe(2);
  const a = rentalFidelityRead(f.rentals[0], vi.fn(), { rentals: f.rentals, open });
  expect(a.associatedVehicles).toHaveLength(1);
  a.associatedVehicles![0].onOpen();
  expect(open).toHaveBeenCalledWith(f.rentals[1]);
  expect(rentalFidelityRead(f.rentals[1], vi.fn()).actualModel).toBe("Toyota Corolla");
});
it("does not expose restricted booking refs, holder, drivers, media or documents", () => {
  const f = fixture("restricted");
  const read = rentalFidelityRead(f.rental, vi.fn());
  expect(read.reference).toBeUndefined();
  expect(read.holder).toBeUndefined();
  expect(read.drivers).toEqual([]);
  expect(read.bookingOriginals).toEqual([]);
  expect(read.expenseSummary).toBeUndefined();
  expect(read.photos).toBeUndefined();
});
it("opens only visible originals with bytes, and never derives supplier billing days", () => {
  const f = fixture("full"),
    action = vi.fn();
  const read = rentalFidelityRead(f.rental, action);
  read.bookingOriginals![0].onOpen();
  expect(action.mock.lastCall![1]).toContain("SYNTHETIC WEBLAB DOCUMENT");
  expect(read.photos?.count).toBe(5);
  expect(read.photos?.previews).toHaveLength(3);
  for (const id of ["unknown-days", "quote"]) {
    const f = fixture(id),
      read = rentalFidelityRead(f.rental, action);
    expect(read.expenseSummary?.perDay).toBeUndefined();
    expect(read.expenseSummary?.myPerDay).toBeUndefined();
  }
});

it("composes and renders a RETURN occurrence with its owning role and focus", () => {
  const f = fixture("full");
  const row = composeDayStream(f.query!(f.rental.return!.date, f.zone), f.instant, {
    occurrenceFocus: true,
  }).rows[0];
  expect(row.coreRowKeys.map((k) => k.projectionRole)).toEqual(["RETURN"]);
  expect(row.focusKey).toContain("RETURN");
  const rendered = f.renderer!({
    row,
    container: undefined,
    depth: "F",
    onDepth: vi.fn(),
  }) as import("react").ReactElement<{
    children: import("react").ReactElement<{ back: boolean; depth: string }>;
  }>;
  expect(rendered.props.children.props.back).toBe(true);
  expect(rendered.props.children.props.depth).toBe("F");
});
it("selects the second visible vehicle and its return day for direct F/I previews", () => {
  const first = fixture("multi");
  const second = first.rentals[1];
  const f = rentalFidelityFixture(
    "multi",
    "today",
    vi.fn(),
    vi.fn(),
    vi.fn(),
    "RETURN",
    second.id,
  );
  expect(f.rental.id).toBe(second.id);
  expect(f.selectedDate).toBe(second.return!.date);
  const rows = composeDayStream(f.query!(f.selectedDate, f.zone), f.instant, {
    occurrenceFocus: true,
  }).rows;
  expect(
    rows.find((row) => row.item.event.id === second.id)?.coreRowKeys[0],
  ).toMatchObject({ itemId: second.id, projectionRole: "RETURN" });
});
it("keeps same-day pickup and return as independently focusable occurrences", () => {
  const f = fixture("full");
  const previous = f.rental.return!.date;
  try {
    f.rental.return!.date = f.rental.pickup.date;
    const rows = composeDayStream(f.query!(f.rental.pickup.date, f.zone), f.instant, {
      occurrenceFocus: true,
    }).rows;
    expect(rows.map((row) => row.coreRowKeys[0]?.projectionRole)).toEqual([
      "PICKUP",
      "RETURN",
    ]);
    expect(new Set(rows.map((row) => row.focusKey)).size).toBe(2);
  } finally {
    f.rental.return!.date = previous;
  }
});
