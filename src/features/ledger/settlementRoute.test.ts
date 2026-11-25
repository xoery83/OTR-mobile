import { expect, it, vi } from "vitest";

import SettlementRoute from "../../../app/(tabs)/expenses/settlement";

const navigation = vi.hoisted(() => ({
  root: { key: "root", index: 0, routes: [] as { key: string; name: string }[] },
  ledgerIndex: 0,
  dispatch: vi.fn(),
  isFocused: vi.fn(() => true),
}));

vi.mock("expo-router", () => ({
  Stack: { Toolbar: Object.assign(() => null, { Button: "toolbar-button" }) },
  useLocalSearchParams: () => ({ journeyId: "trip-1", journeyTitle: "Trip 1" }),
  useNavigation: (path?: string) =>
    path === "/"
      ? { getState: () => navigation.root, dispatch: navigation.dispatch }
      : { isFocused: navigation.isFocused },
}));
vi.mock("expo-router/react-navigation", () => ({
  useNavigationState: (select: (state: { index: number }) => unknown) =>
    select({ index: navigation.ledgerIndex }),
}));
vi.mock("@/features/ledger/SettlementReadinessScreen", () => ({
  SettlementReadinessScreen: "settlement",
}));
vi.mock("@/ui/useUiLocale", () => ({ useUiLocale: vi.fn() }));
vi.mock("@/ui/locale", () => ({ t: (key: string) => key }));

const originatingTrip = { key: "trip-from-search", name: "search-trip" };
const settlementTabs = { key: "settlement-tabs", name: "(tabs)" };

it("returns to the exact Search Trip stack entry on a cross-stack open", () => {
  navigation.root = { key: "root", index: 1, routes: [originatingTrip, settlementTabs] };
  navigation.ledgerIndex = 0;
  navigation.dispatch.mockClear();
  const [toolbar, screen] = SettlementRoute().props.children;
  const button = toolbar.props.children;
  expect(button.props.accessibilityLabel).toBe("common.back");
  expect(screen.props).toEqual({ journeyId: "trip-1", journeyTitle: "Trip 1" });
  button.props.onPress();
  navigation.isFocused.mockReturnValueOnce(false);
  button.props.onPress();
  navigation.root = {
    key: "root",
    index: 1,
    routes: [{ ...originatingTrip, key: "different-trip" }, settlementTabs],
  };
  button.props.onPress();
  expect(navigation.dispatch).toHaveBeenCalledExactlyOnceWith({
    type: "GO_BACK",
    target: "root",
    source: "settlement-tabs",
  });
});

it("leaves the ordinary Ledger back button and direct entry alone", () => {
  navigation.root = { key: "root", index: 1, routes: [originatingTrip, settlementTabs] };
  navigation.ledgerIndex = 1;
  expect(SettlementRoute().props.children[0]).toBeNull();

  navigation.root = { key: "root", index: 0, routes: [settlementTabs] };
  navigation.ledgerIndex = 0;
  expect(SettlementRoute().props.children[0]).toBeNull();
});
