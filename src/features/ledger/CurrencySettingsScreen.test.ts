import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { CurrencySettingsScreen } from "./CurrencySettingsScreen";
const state = vi.hoisted(() => ({
  values: [] as any[],
  cursor: 0,
  mount: true,
  cleanups: [] as (() => void)[],
  reporting: vi.fn(),
  trips: vi.fn(),
  settlement: vi.fn(),
  preview: vi.fn(),
  commit: vi.fn(),
  classify: vi.fn(),
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: (initial: any) => {
    const i = state.cursor++;
    if (!(i in state.values)) state.values[i] = initial;
    return [
      state.values[i],
      (v: any) => {
        state.values[i] = v;
      },
    ];
  },
  useRef: (v: any) => ({ current: v }),
  useEffect: (fn: any) => {
    if (state.mount) {
      const cleanup = fn();
      if (typeof cleanup === "function") state.cleanups.push(cleanup);
    }
  },
}));
vi.mock("react-native", () => ({
  ActivityIndicator: "ActivityIndicator",
  View: "View",
  Text: "Text",
  ScrollView: "ScrollView",
  Modal: "Modal",
  Pressable: "Pressable",
  Alert: { alert: vi.fn() },
  StyleSheet: { create: (s: any) => s },
}));
vi.mock("expo-network", () => ({
  useNetworkState: () => ({ isConnected: true, isInternetReachable: true }),
}));
vi.mock("@/ui/theme", () => ({ useUiTheme: () => ({}), useThemedStyles: () => ({}) }));
vi.mock("@/ui/locale", () => ({ t: (s: string) => s }));
vi.mock("@/ui/useUiLocale", () => ({ useUiLocale: () => "en" }));
vi.mock("@/ui/domainLabels", () => ({ systemMessage: (s: string) => s }));
vi.mock("@/components/AppIcon", () => ({ AppIcon: "AppIcon" }));
vi.mock("@/components/SheetHeader", () => ({ SheetHeader: "SheetHeader" }));
vi.mock("./CurrencyPicker", () => ({ CurrencyPicker: "CurrencyPicker" }));
vi.mock("./ExchangeRateLookup", () => ({ ExchangeRateLookup: "ExchangeRateLookup" }));
vi.mock("@/data/repositories/tripRepository", () => ({
  readLocalTripRepository: async () => ({ listTrips: state.trips }),
}));
vi.mock("@/data/repositories/defaultLedgerReportingRepository", () => ({
  getDefaultLedgerReportingRepository: () => state.reporting(),
}));
vi.mock("@/data/repositories/defaultLedgerSettlementRepository", () => ({
  getDefaultLedgerSettlementRepository: () => state.settlement(),
}));
vi.mock("@/data/repositories/ledgerCurrencyRepository", () => ({
  classifyJourneyCurrencyPreviewFailure: (...a: any[]) => state.classify(...a),
  ledgerCurrencyRepository: {
    preview: (...a: any[]) => state.preview(...a),
    commit: (...a: any[]) => state.commit(...a),
  },
}));
type Node = ReactElement<any>;
const nodes = (n: ReactNode): Node[] =>
  isValidElement(n)
    ? [n as Node, ...Children.toArray((n as Node).props.children).flatMap(nodes)]
    : [];
const b = {
  journeyId: "b",
  title: "Other Trip",
  settlementCurrency: "NZD",
  startDate: "2020-01-01",
  endDate: "2030-12-31",
  settlementScale: 2,
};
const actor = vi.fn().mockResolvedValue({ role: "owner" });
const render = (id?: string) => {
  state.cursor = 0;
  const v = nodes(CurrencySettingsScreen({ journeyId: id }));
  state.mount = false;
  return v;
};
const flush = async () => {
  for (let i = 0; i < 15; i++) await Promise.resolve();
};
beforeEach(() => {
  state.cleanups = [];
  state.trips.mockReset().mockResolvedValue([]);
  state.values = [];
  state.cursor = 0;
  state.mount = true;
  actor.mockClear();
  state.preview.mockReset();
  state.commit.mockReset();
  state.classify.mockReset();
  state.reporting.mockResolvedValue({
    getSelectedJourneyId: async () => "b",
    listJourneys: async () => [b],
    getActorContext: actor,
  });
  state.settlement.mockResolvedValue({ hasFinalized: async () => false });
});
it("never falls back to another Trip or previews/commits its currency when explicit A is missing", async () => {
  render("a");
  await flush();
  const v = render("a");
  expect(actor).not.toHaveBeenCalled();
  expect(v.some((n) => n.props.children === "currencySettings.copy12")).toBe(true);
  await v.find((n) => n.type === "CurrencyPicker")!.props.onSelect("USD");
  await flush();
  expect(state.preview).not.toHaveBeenCalled();
  expect(state.commit).not.toHaveBeenCalled();
  expect(v.some((n) => n.props.children === "Other Trip")).toBe(false);
});
it("keeps explicit same-Trip lookup and existing owner authority", async () => {
  render("b");
  await flush();
  expect(actor).toHaveBeenCalledExactlyOnceWith("b");
  expect(render("b").some((n) => n.props.children === "Other Trip")).toBe(true);
});
it("retains the historical selected Journey fallback only when no explicit ID is supplied", async () => {
  render();
  await flush();
  expect(actor).toHaveBeenCalledExactlyOnceWith("b");
});

it("withholds a previously loaded B immediately when an explicit A is supplied", async () => {
  render("b");
  await flush();
  expect(render("b").some((n) => n.props.children === "Other Trip")).toBe(true);
  const v = render("a");
  expect(v.some((n) => n.props.children === "Other Trip")).toBe(false);
  await v.find((n) => n.type === "CurrencyPicker")!.props.onSelect("USD");
  await flush();
  expect(state.preview).not.toHaveBeenCalled();
  expect(state.commit).not.toHaveBeenCalled();
});

const failures = [
  ["CONFIG_UNAVAILABLE", "previewConfigUnavailable"],
  ["CONNECTIVITY", "copy1"],
  ["AUTH", "previewAuth"],
  ["FORBIDDEN", "previewForbidden"],
  ["CONFLICT", "previewConflict"],
  ["SERVICE", "previewService"],
  ["INVALID_RESPONSE", "previewInvalid"],
  ["UNKNOWN", "previewUnknown"],
];
it.each(failures)(
  "shows safe %s preview failure without committing or changing currency",
  async (kind, key) => {
    const error = new Error("private error details");
    state.preview.mockRejectedValue(error);
    state.classify.mockReturnValue({ kind });
    render("b");
    await flush();
    await render("b")
      .find((n) => n.type === "CurrencyPicker")!
      .props.onSelect("EUR");
    const v = render("b");
    expect(state.preview).toHaveBeenCalledExactlyOnceWith("b", "EUR");
    expect(state.classify).toHaveBeenCalledExactlyOnceWith(error);
    expect(v.some((n) => n.props.children === `currencySettings.${key}`)).toBe(true);
    expect(v.some((n) => n.props.children === "private error details")).toBe(false);
    expect(state.commit).not.toHaveBeenCalled();
    expect(state.values[2].settlementCurrency).toBe("NZD");
  },
);

it("uses the same local Trip's current name without changing Ledger identity/currency", async () => {
  state.trips.mockResolvedValue([{ id: "a", name: "Wrong account Trip" }, { id: "b", name: "Renamed Trip" }]);
  render("b");
  await flush();
  const v = render("b");
  expect(v.some((n) => n.props.children === "Renamed Trip")).toBe(true);
  expect(v.some((n) => n.props.children === "Wrong account Trip")).toBe(false);
  expect(state.values[2]).toMatchObject({ journeyId: "b", settlementCurrency: "NZD" });
  expect(actor).toHaveBeenCalledExactlyOnceWith("b");
});
it("retains Ledger caption when the lawful local Trip reader is unavailable", async () => {
  state.trips.mockRejectedValue(new Error("TRIP_LOCAL_UNAVAILABLE"));
  render("b");
  await flush();
  expect(render("b").some((n) => n.props.children === "Other Trip")).toBe(true);
  expect(actor).toHaveBeenCalledExactlyOnceWith("b");
});

it("ignores an old Trip name read completing after another Journey has loaded", async () => {
  let finishOld!: (trips: { id: string; name: string }[]) => void;
  const oldRead = new Promise<{ id: string; name: string }[]>((resolve) => { finishOld = resolve; });
  state.reporting.mockResolvedValue({
    getSelectedJourneyId: async () => "b",
    listJourneys: async () => [{ ...b, journeyId: "a", title: "Old A" }, b],
    getActorContext: actor,
  });
  state.trips.mockReturnValueOnce(oldRead).mockResolvedValueOnce([{ id: "b", name: "Current B" }]);
  render("a");
  await flush();
  expect(state.trips).toHaveBeenCalledTimes(1);
  state.cleanups[0]();
  state.mount = true;
  render("b");
  await flush();
  expect(state.values[2]).toMatchObject({ journeyId: "b", title: "Current B" });
  finishOld([{ id: "a", name: "Late A" }]);
  await flush();
  expect(state.values[2]).toMatchObject({ journeyId: "b", title: "Current B" });
  expect(render("b").some((n) => n.props.children === "Current B")).toBe(true);
});
