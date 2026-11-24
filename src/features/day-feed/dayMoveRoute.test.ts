import { afterEach, expect, it, vi } from "vitest";
import DayMoveRoute from "../../../app/day-move";
import { getAccountGeneration } from "@/data/auth/accountGeneration";
import { releaseDayMoveSheet, stageDayMoveSheet } from "./dayMoveConfirmationSheet";

const state = vi.hoisted(() => ({
  id: undefined as string | undefined,
  origin: "origin-day",
  focused: true,
  exiting: false,
  dayIsCurrent: true,
  requestClose: vi.fn(),
}));

vi.mock("react", async original => ({
  ...(await original<typeof import("react")>()),
  useSyncExternalStore: (_subscribe: unknown, read: () => unknown) => read(),
}));
vi.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ invocation: state.id }),
  useNavigation: () => ({
    isFocused: () => state.focused,
    getState: () => ({
      index: 1,
      routes: [{ key: state.origin, name: "trip-home" }, { key: "sheet", name: "day-move" }],
    }),
  }),
}));
vi.mock("expo-router/react-navigation", () => ({ usePreventRemove: () => {} }));
vi.mock("react-native", () => ({
  StyleSheet: { create: (value: unknown) => value },
  View: "view",
}));
vi.mock("@/components/SheetHost", () => ({
  useSheetMotion: () => ({
    requestClose: state.requestClose,
    isExitPending: () => state.exiting,
    exitPending: state.exiting,
  }),
}));
vi.mock("@/components/SheetRoutePanel", () => ({ SheetRoutePanel: "panel" }));
vi.mock("@/ui/useUiLocale", () => ({ useUiLocale: () => "en" }));

afterEach(() => {
  releaseDayMoveSheet(state.id);
  state.requestClose.mockReset();
  state.exiting = false;
  state.dayIsCurrent = true;
  state.origin = "origin-day";
  state.focused = true;
});

it("holds the existing operation during exit and closes only on its own successful completion", async () => {
  let finish!: (saved: boolean) => void;
  const saved = new Promise<boolean>(resolve => { finish = resolve; });
  const apply = vi.fn(() => saved);
  state.id = stageDayMoveSheet({
    generation: getAccountGeneration(), originKey: "origin-day", originFocused: () => true,
    originCurrent: () => state.dayIsCurrent,
    confirmation: {
      body: null, proposalIdentity: {}, titleKey: "fidelity.moveTitle", disabled: false,
      isCurrent: () => true, isBusy: () => false, dismiss: vi.fn(), apply,
    },
  });
  const press = DayMoveRoute().props.action.onPress;
  state.exiting = true;
  press();
  expect(apply).not.toHaveBeenCalled();
  state.exiting = false;
  press();
  expect(apply).toHaveBeenCalledOnce();
  expect(state.requestClose).not.toHaveBeenCalled();
  finish(true);
  await saved;
  expect(state.requestClose).toHaveBeenCalledOnce();
});

it("keeps the original operation inaccessible when a different Day is beneath the Sheet", () => {
  const apply = vi.fn(async () => true);
  state.id = stageDayMoveSheet({
    generation: getAccountGeneration(), originKey: "origin-day", originFocused: () => true,
    originCurrent: () => state.dayIsCurrent,
    confirmation: {
      body: null, proposalIdentity: {}, titleKey: "fidelity.moveTitle", disabled: false,
      isCurrent: () => true, isBusy: () => false, dismiss: vi.fn(), apply,
    },
  });
  const press = DayMoveRoute().props.action.onPress;
  state.origin = "different-day";
  expect(DayMoveRoute().props.action).toBeUndefined();
  press();
  state.origin = "origin-day";
  state.dayIsCurrent = false;
  press();
  expect(apply).not.toHaveBeenCalled();
});
