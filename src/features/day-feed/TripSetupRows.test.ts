import { Children, isValidElement, type ReactNode } from "react";
import { TripPreparationWidget } from "./TripPreparationWidget";
import { beforeEach, expect, it, vi } from "vitest";
import type { TripPreparationSetup } from "@/data/repositories/tripPreparationSetupRepository";
import { TripCurrencyRow, TripMembersSummary, TripSetupRows } from "./TripSetupRows";
const state = vi.hoisted(() => ({ open: false, key: null as string | null }));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: () => [
    state.open,
    (value: boolean) => {
      state.open = value;
    },
  ],
}));
vi.mock("@/components/AppIcon", () => ({ AppIcon: "AppIcon" }));
vi.mock("./TripMembersSheet", () => ({ TripMembersSheet: "TripMembersSheet" }));
vi.mock("react-native", () => ({ View: "View", StyleSheet: { create: (s: any) => s } }));
vi.mock("@/ui/controls", () => ({ UiText: "UiText" }));
vi.mock("@/ui/forms", () => ({ UiFormRow: "UiFormRow" }));
vi.mock("@/ui/theme", () => ({ useThemedStyles: () => ({}), useUiTheme: () => ({}) }));
vi.mock("@/ui/useUiLocale", () => ({ useUiLocale: () => "en" }));
vi.mock("./TripCalendarRangeField", () => ({ tripRangeLabel: () => "range" }));
vi.mock("@/ui/locale", () => ({
  t: (key: string, args: any = {}) => [key, ...Object.values(args)].join(":"),
  formatUiNumber: String,
}));
let setup: TripPreparationSetup;
beforeEach(() => {
  state.open = false;
  state.key = null;
  setup = {
    context: { accountId: "actor", generation: 1, tripId: "trip" },
    currency: {
      state: "AVAILABLE",
      code: "JPY",
      scale: 0,
      permission: "OWNER",
      lock: "NOT_OBSERVED",
    },
    members: { state: "AVAILABLE", namedCount: 3, people: [] },
    invitations: "UNKNOWN",
    connections: "UNKNOWN",
  };
});
it("displays actual currency and routes only an observed eligible owner to existing settings", () => {
  const open = vi.fn();
  let row = TripCurrencyRow({ setup, onOpen: open });
  expect(row.props.value).toBe("tripForm.currencyChange:JPY");
  row.props.onPress();
  expect(open).toHaveBeenCalledOnce();
  if (setup.currency.state !== "AVAILABLE") throw new Error("test setup");
  for (const changes of [
    { lock: "FINALIZED" as const },
    { lock: "UNKNOWN" as const },
    { permission: "READ_ONLY" as const },
  ]) {
    row = TripCurrencyRow({
      setup: { ...setup, currency: { ...setup.currency, ...changes } },
      onOpen: open,
    });
    expect(row.props.disabled).toBe(true);
    row.props.onPress();
  }
  expect(open).toHaveBeenCalledOnce();
});
function summary(setup: TripPreparationSetup | null, tripId = "trip", generation = 1) {
  const scoped = TripMembersSummary({ setup, tripId, generation });
  if (state.key !== scoped.key) {
    state.key = scoped.key;
    state.open = false;
  }
  return (scoped.type as any)(scoped.props);
}
it("never substitutes fake currency or invitation counts for unknown facts", () => {
  const row = TripCurrencyRow({ setup: null, onOpen: vi.fn() });
  expect(row.props.value).toBe("tripForm.currencyUnknown");
  expect(row.props.disabled).toBe(true);
  const named = JSON.stringify(summary(setup));
  expect(named).toContain("tripForm.namedPeople:3");
  expect(named).toContain("tripForm.namedPeopleHint");
  expect(named).not.toContain("invited");
  expect(JSON.stringify(summary(null))).toContain("tripForm.membersUnknown");
});

it("offers only missing metadata setup without treating intentional one-sided dates as missing", () => {
  const complete = JSON.stringify(
    TripSetupRows({
      setup,
      metadata: { startDate: "2026-12-14", endDate: null, destination: "Auckland" },
      onEdit: vi.fn(),
    }),
  );
  expect(complete).not.toContain("tripForm.setup");
  expect(complete).not.toContain("tripForm.dates");
  expect(complete).not.toContain("tripCreate.destination");
  const missing = JSON.stringify(
    TripSetupRows({
      setup,
      metadata: { startDate: null, endDate: null, destination: "" },
      onEdit: vi.fn(),
    }),
  );
  expect(missing).toContain("tripForm.setup");
  expect(missing).toContain("tripForm.dates");
  expect(missing).toContain("tripCreate.destination");
});

it("keeps unmet setup reachable after real Preparation counts are populated", () => {
  const containsSetup = (node: ReactNode): boolean =>
    isValidElement<{ children?: ReactNode }>(node) &&
    (node.type === TripSetupRows ||
      Children.toArray(node.props.children).some(containsSetup));
  const widget = TripPreparationWidget({
    value: { itemCount: 1, counts: [], recent: [] },
    state: "READY",
    setup,
    metadata: { startDate: null, endDate: null, destination: null },
    copy: {
      title: "Preparation",
      empty: "Empty",
      recent: "Recent",
      loading: "Loading",
      unavailable: "Unavailable",
      importPlans: "Import",
      buildItinerary: "Build",
      importMore: "More",
      openDay: "Day",
      families: { P1: "P1", P2: "P2", P3: "P3", P4: "P4", P5: "P5", P6: "P6" },
    },
  });
  expect(containsSetup(widget)).toBe(true);
});

it("does not show missing destination setup when the ordered destination list is populated and scalar is empty", () => {
  const metadata = {
    startDate: "2026-10-23",
    endDate: "2026-10-25",
    destination: null,
    destinations: [
      { displayLabel: "Nelson, New Zealand" },
      { displayLabel: "Auckland, New Zealand" },
    ],
  };
  const before = JSON.stringify(metadata);
  const rows = JSON.stringify(TripSetupRows({ setup, metadata, onEdit: vi.fn() }));
  expect(rows).not.toContain("tripCreate.destination");
  expect(rows).not.toContain("tripCreate.notSet");
  expect(rows).not.toContain("tripForm.setup");
  expect(JSON.stringify(metadata)).toBe(before);
});
