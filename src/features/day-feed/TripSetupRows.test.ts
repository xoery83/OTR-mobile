import { beforeEach, expect, it, vi } from "vitest";
import type { TripPreparationSetup } from "@/data/repositories/tripPreparationSetupRepository";
import { TripCurrencyRow, TripMembersSummary } from "./TripSetupRows";
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
it("never substitutes fake currency or invitation counts for unknown facts", () => {
  const row = TripCurrencyRow({ setup: null, onOpen: vi.fn() });
  expect(row.props.value).toBe("tripForm.currencyUnknown");
  expect(row.props.disabled).toBe(true);
  const named = JSON.stringify(TripMembersSummary({ setup }));
  expect(named).toContain("tripForm.namedPeople:3");
  expect(named).toContain("tripForm.namedPeopleHint");
  expect(named).not.toContain("invited");
  expect(JSON.stringify(TripMembersSummary({ setup: null }))).toContain(
    "tripForm.membersUnknown",
  );
});
