import type { ComponentProps } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import TripMetadataCoverRoute from "../../../app/trip-metadata-sheet/cover";
import type { TripCoverPicker, TripCoverSheetValue } from "./TripCoverPicker";

const state = vi.hoisted(() => ({
  navigation: { key: "stack", index: 1, routes: [{ key: "editor" }, { key: "cover" }] },
  dispatch: vi.fn(),
  onSelect: vi.fn(),
  onChoosePhoto: vi.fn(),
  cover: undefined as TripCoverSheetValue | undefined,
  draft: undefined as string | null | undefined,
  open: true,
  focused: true,
}));

vi.mock("react", async original => ({
  ...(await original<typeof import("react")>()),
  useState: () => [state.draft, (draft: typeof state.draft) => { state.draft = draft; }],
  useEffect: () => {},
  useSyncExternalStore: (_subscribe: unknown, read: () => unknown) => read(),
}));
vi.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ invocation: "owner", selection: "selection", editorKey: "editor" }),
  useNavigation: () => ({
    getState: () => state.navigation,
    isFocused: () => state.focused,
    dispatch: state.dispatch,
  }),
}));
vi.mock("expo-router/react-navigation", () => ({ useRoute: () => ({ key: "cover" }) }));
vi.mock("@/components/SheetHost", () => ({ useSheetMotion: () => ({ isExitPending: () => false }) }));
vi.mock("@/components/SheetRoutePanel", () => ({ SheetRoutePanel: "panel" }));
vi.mock("./TripCoverPicker", () => ({ TripCoverPicker: "picker" }));
vi.mock("./tripMetadataSheet", () => ({
  readTripMetadataSheet: () => ({ open: state.open }),
  subscribeTripMetadataSheet: () => () => {},
}));
vi.mock("./tripCoverSheet", () => ({
  readTripMetadataCover: () => state.cover,
  subscribeTripCoverSheet: () => () => {},
  tripCoverSheetBusy: () => false,
}));
vi.mock("@/ui/useUiLocale", () => ({ useUiLocale: () => "en" }));

function chooser() {
  return TripMetadataCoverRoute().props as ComponentProps<typeof TripCoverPicker>;
}

function acceptPop() {
  state.navigation = { ...state.navigation, index: 0, routes: state.navigation.routes.slice(0, 1) };
}

beforeEach(() => {
  state.navigation = { key: "stack", index: 1, routes: [{ key: "editor" }, { key: "cover" }] };
  state.open = true;
  state.focused = true;
  state.draft = undefined;
  state.dispatch.mockReset();
  state.onSelect.mockReset();
  state.onChoosePhoto.mockReset();
  state.cover = {
    trip: { id: "trip", name: "Trip" },
    selectedRaw: "coast",
    onSelect: state.onSelect,
    onChoosePhoto: state.onChoosePhoto,
  };
});

it("only applies a cover after verified return to the exact editor, once", async () => {
  const select = chooser().hosted!.child!.onSelect;
  await select("coast", true);
  expect(state.onSelect).not.toHaveBeenCalled();
  state.dispatch.mockImplementation(acceptPop);
  await select("coast", true);
  await select("coast", true);
  expect(state.dispatch).toHaveBeenLastCalledWith({ type: "GO_BACK", target: "stack", source: "cover" });
  expect(state.onSelect).toHaveBeenCalledExactlyOnceWith("coast");
});

it("cancels an automatic selection without changing the editor draft", async () => {
  await chooser().hosted!.child!.onSelect(null, false);
  expect(chooser().selectedRaw).toBeNull();
  expect(chooser().hosted!.child!.action).toBeDefined();
  state.dispatch.mockImplementation(acceptPop);
  chooser().hosted!.child!.onBack();
  chooser().hosted!.child!.action!.onPress();
  expect(state.onSelect).not.toHaveBeenCalled();
});

it("drops a photo completing after the owning cover handoff has been replaced", async () => {
  const apply = vi.fn();
  state.onChoosePhoto.mockImplementation(async (_processing, handoff) => {
    expect(handoff.isCurrent()).toBe(true);
    state.cover = { ...state.cover! };
    expect(handoff.isCurrent()).toBe(false);
    if (!handoff.returnToEditor()) return false;
    apply();
    return true;
  });
  await expect(chooser().onChoosePhoto!(async () => {})).resolves.toBe(false);
  expect(state.dispatch).not.toHaveBeenCalled();
  expect(apply).not.toHaveBeenCalled();
});

it("does not change the photo draft until selection returns to the exact editor", async () => {
  const apply = vi.fn(() => expect(state.navigation.routes[state.navigation.index]?.key).toBe("editor"));
  state.onChoosePhoto.mockImplementation(async (_processing, handoff) => {
    if (!handoff.returnToEditor()) return false;
    apply();
    return true;
  });
  const choosePhoto = chooser().onChoosePhoto!;
  await expect(choosePhoto(async () => {})).resolves.toBe(false);
  expect(apply).not.toHaveBeenCalled();
  state.dispatch.mockImplementation(acceptPop);
  await expect(choosePhoto(async () => {})).resolves.toBe(true);
  expect(apply).toHaveBeenCalledTimes(1);
});
