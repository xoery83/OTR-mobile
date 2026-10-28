import { createElement } from "react";
import { createRequire } from "node:module";
import { beforeEach, expect, it, vi } from "vitest";
import { createCoreRentalRenderer } from "./coreRentalRenderer";
const state = vi.hoisted(() => ({ nodes: [] as any[] }));
vi.mock("react-native", () => ({
  View: (p: any) => createElement("div", null, p.children),
}));
vi.mock("./RentalRow", () => ({
  RentalContent: (p: any) => {
    state.nodes.push(p);
    return null;
  },
}));
const { renderToStaticMarkup } = createRequire(import.meta.url)("react-dom/server");
const item = {
  itemId: "rental",
  tripId: "trip",
  itemRevision: 1,
  family: "P4",
  title: "Original name",
  status: "planned",
  hidden: false,
  schedule: {
    start: {
      localDate: "2027-01-15",
      localTime: "09:00",
      quality: "EXACT",
      precision: 0,
      zoneId: "Pacific/Auckland",
    },
    end: { localDate: "2027-01-15", localTime: "18:00", quality: "EXACT", precision: 0 },
  },
  details: {},
};
const projection = {
  tripId: "trip",
  source: { localTargetIds: ["rental"] },
  items: [item],
  events: [{ id: "rental", semantic_revision: 1 }],
} as any;
const row = {
  item: { event: { id: "rental", title: "Original name" } },
  coreRowKeys: [
    { itemId: "rental", projectionRole: "PICKUP", localDate: "2027-01-15" },
    { itemId: "rental", projectionRole: "RETURN", localDate: "2027-01-15" },
  ],
} as any;
beforeEach(() => {
  state.nodes = [];
});
it("keeps same-day pickup and return as separate occurrences of one identity", () => {
  const onOpenRental = vi.fn(),
    onInsertRental = vi.fn();
  const render = createCoreRentalRenderer(projection, { onOpenRental, onInsertRental });
  renderToStaticMarkup(
    render({
      row,
      depth: "F",
      onDepth: vi.fn(),
      container: undefined,
      context: "FUTURE",
    }),
  );
  expect(state.nodes).toHaveLength(2);
  expect(state.nodes[0]).toMatchObject({ pickup: true, back: false, pending: true });
  expect(state.nodes[1]).toMatchObject({ pickup: false, back: true, depth: "B" });
  state.nodes[1].onDepth("I");
  expect(onOpenRental).toHaveBeenCalledWith("rental", "RETURN", "2027-01-15");
  state.nodes[0].onInsert("AFTER");
  expect(onInsertRental).toHaveBeenCalledWith("rental", "PICKUP", "2027-01-15", "AFTER");
});
it.each([
  { ...item, tripId: "other" },
  { ...item, itemRevision: 2 },
])("does not mix another Trip or revision's DTO into a row", (value) => {
  const render = createCoreRentalRenderer({ ...projection, items: [value] });
  expect(render({ row, depth: "B", onDepth: vi.fn(), container: undefined })).toBeNull();
});
it("uses the known endpoint's date for Floating display without qualifying its clock", () => {
  const render = createCoreRentalRenderer(projection, {
    instant: "2027-01-14T18:00:00Z",
  });
  renderToStaticMarkup(
    render({
      row,
      depth: "F",
      context: "UNKNOWN",
      onDepth: vi.fn(),
      container: undefined,
    }),
  );
  expect(state.nodes[0].context).toBe("TODAY");
  expect(state.nodes[0].facts.pickup.zone).toBe("Pacific/Auckland");
});
