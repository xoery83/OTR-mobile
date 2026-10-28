import { createElement } from "react";
import { createRequire } from "node:module";
import { beforeEach, expect, it, vi } from "vitest";
import { createCoreStayRenderer } from "./coreStayRenderer";
const state = vi.hoisted(() => ({
  rows: [] as any[],
  selectedRole: null as string | null,
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: () => [
    state.selectedRole,
    (value: string) => {
      state.selectedRole = value;
    },
  ],
}));
vi.mock("react-native", () => ({
  View: (p: any) => createElement("div", null, p.children),
}));
vi.mock("./StayReadView", () => ({
  StayReadRow: (p: any) => {
    state.rows.push(p);
    return null;
  },
  StayReadView: () => null,
}));
const { renderToStaticMarkup } = createRequire(import.meta.url)("react-dom/server");
const item = {
  itemId: "stay",
  tripId: "trip",
  itemRevision: 1,
  family: "P3",
  title: "SkyCity Hotel",
  status: "planned",
  hidden: false,
  schedule: {
    start: { localDate: "2026-10-27", localTime: "17:00" },
    end: { localDate: "2026-10-30" },
  },
  participation: { mode: "WHOLE_GROUP", personIds: [] },
  details: {},
  documentSummaries: [],
  bookingSummaries: [],
};
const projection = {
  tripId: "trip",
  items: [item],
  events: [{ id: "stay", semantic_revision: 1 }],
} as any;
function render(
  roles: string[],
  date = "2026-10-29",
  actions = {},
  depth: "B" | "F" = "B",
) {
  const renderer = createCoreStayRenderer(projection, actions);
  const row = {
    item: { event: { id: "stay" } },
    coreRowKeys: roles.map((projectionRole) => ({
      itemId: "stay",
      localDate: date,
      projectionRole,
    })),
  } as any;
  renderToStaticMarkup(
    renderer({
      row,
      depth,
      onDepth: vi.fn(),
      container: undefined,
      context: "FUTURE",
    }),
  );
}
beforeEach(() => {
  state.rows = [];
  state.selectedRole = null;
});
it("retains Focus when a previous no-activity Base alias becomes the activity-day tail", () => {
  state.selectedRole = "TONIGHT";
  render(["BASE_FROM", "BASE_RETURN"], "2026-10-29", {}, "F");
  expect(state.rows).toHaveLength(1);
  expect(state.rows[0]).toMatchObject({ role: "BASE", focused: true });
  state.rows = [];
  state.selectedRole = "CHECKOUT";
  render(["CHECKIN", "CHECKOUT"], "2026-10-27", {}, "F");
  expect(state.rows.map((row) => [row.role, row.focused])).toEqual([
    ["CHECKIN", false],
    ["CHECKOUT", true],
  ]);
});
it("renders a single Daily Base for the accepted G2 pair and opens the same Stay/day", () => {
  const onOpenStay = vi.fn();
  render(["BASE_FROM", "BASE_RETURN"], "2026-10-29", { onOpenStay });
  expect(state.rows).toHaveLength(1);
  expect(state.rows[0]).toMatchObject({ role: "BASE", stay: { id: "stay" } });
  state.rows[0].onOpen();
  expect(onOpenStay).toHaveBeenCalledWith("stay", "BASE", "2026-10-29");
});
it("preserves one no-activity base and same-day check-in/out as two roles", () => {
  render(["TONIGHT"]);
  expect(state.rows).toHaveLength(1);
  state.rows = [];
  render(["CHECKIN", "CHECKOUT"], "2026-10-27");
  expect(state.rows.map((row) => row.role)).toEqual(["CHECKIN", "CHECKOUT"]);
});
