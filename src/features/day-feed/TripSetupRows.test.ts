import { beforeEach, expect, it, vi } from "vitest";
import type { TripPreparationSetup } from "@/data/repositories/tripPreparationSetupRepository";
import { TripCurrencyRow, TripMembersSummary } from "./TripSetupRows";
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
vi.mock("./TripMembersSheet", () => ({ TripMembersSheet: "TripMembersSheet" }));
vi.mock("react-native", () => ({ View: "View", StyleSheet: { create: (s: any) => s } }));
vi.mock("@/ui/controls", () => ({ UiText: "UiText" }));
vi.mock("@/ui/forms", () => ({ UiFormRow: "UiFormRow" }));
vi.mock("@/ui/theme", () => ({ useThemedStyles: () => ({}) }));
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
