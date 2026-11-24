import { afterEach, expect, it, vi } from "vitest";
import P1DocumentLinkRoute from "../../../app/p1-document-link";
import { advanceAccountGeneration, getAccountGeneration } from "@/data/auth/accountGeneration";
import { readP1DocumentLink, releaseP1DocumentLink, stageP1DocumentLink } from "./p1DocumentLinkSheet";

const state = vi.hoisted(() => ({
  focused: true,
  id: undefined as string | undefined,
  values: [] as unknown[],
  cursor: 0,
  effects: [] as (() => unknown)[],
  requestClose: vi.fn(),
}));

vi.mock("react", async original => ({
  ...(await original<typeof import("react")>()),
  useCallback: (callback: unknown) => callback,
  useEffect: (effect: () => unknown) => { state.effects.push(effect); },
  useLayoutEffect: (effect: () => unknown) => { effect(); },
  useRef: (value: unknown) => ({ current: value }),
  useState: () => {
    const row = state.cursor++;
    return [state.values[row], (value: unknown) => { state.values[row] = value; }];
  },
  useSyncExternalStore: (_subscribe: unknown, version: () => unknown) => version(),
}));
vi.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ invocation: state.id }),
  useNavigation: () => ({
    isFocused: () => state.focused,
    getState: () => ({
      index: 1,
      routes: [{ key: "detail" }, { name: "p1-document-link", params: { invocation: state.id } }],
    }),
  }),
}));
vi.mock("expo-router/react-navigation", () => ({
  useIsFocused: () => state.focused,
  usePreventRemove: () => {},
}));
vi.mock("react-native", () => ({ StyleSheet: { create: (style: unknown) => style }, View: "view" }));
vi.mock("@/components/SheetRoutePanel", () => ({ SheetRoutePanel: "panel" }));
vi.mock("@/components/SheetHost", () => ({
  useSheetMotion: () => ({
    requestClose: state.requestClose, isExitPending: () => false, exitPending: false,
  }),
}));
vi.mock("@/features/day-feed/P1DocumentLinkPicker", () => ({
  DocumentLinkChoices: "document-choices",
  readLinkPicker: vi.fn(),
}));
vi.mock("@/ui/useUiLocale", () => ({ useUiLocale: () => "en" }));
vi.mock("@/ui/controls", () => ({ UiText: "text" }));

afterEach(() => releaseP1DocumentLink(state.id));

function render() {
  state.cursor = 0;
  state.effects = [];
  return P1DocumentLinkRoute();
}

it("unlocks the original sheet when queuing finishes covered and closes after focus returns", async () => {
  const onQueued = vi.fn();
  state.id = stageP1DocumentLink({
    generation: getAccountGeneration(), originKey: "detail", isCurrent: () => true,
    revisionCurrent: () => true, tripId: "trip", itemId: "item", itemRevision: 1, onQueued,
  });
  let finish!: () => void;
  const queued = new Promise<void>(resolve => { finish = resolve; });
  const save = vi.fn(() => queued);
  const selected = { id: "document", revision: 2 };
  state.values = [{ save }, selected, false];
  render().props.action.onPress();
  expect(save).toHaveBeenCalledExactlyOnceWith(selected);
  expect(readP1DocumentLink(state.id)?.busy).toBe(true);
  state.focused = false;
  finish();
  await queued;
  expect(readP1DocumentLink(state.id)?.busy).toBe(false);
  expect(readP1DocumentLink(state.id)?.queued).toBe(true);
  expect(state.requestClose).not.toHaveBeenCalled();
  state.focused = true;
  const panel = render();
  expect(panel.props.leadingDisabled).toBe(false);
  expect(panel.props.action).toBeUndefined();
  state.effects.at(-1)?.();
  expect(state.requestClose).toHaveBeenCalledOnce();
  expect(onQueued).not.toHaveBeenCalled();
});

it("lets the retired Sheet close after an account change during a write", async () => {
  state.id = stageP1DocumentLink({
    generation: getAccountGeneration(), originKey: "detail", isCurrent: () => true,
    revisionCurrent: () => true, tripId: "trip", itemId: "item", itemRevision: 1, onQueued: vi.fn(),
  });
  const pending = Promise.resolve();
  state.values = [{ save: () => pending }, { id: "document" }, false];
  render().props.action.onPress();
  expect(render().props.leadingDisabled).toBe(true);
  advanceAccountGeneration();
  expect(render().props.leadingDisabled).toBe(false);
  await pending;
  expect(render().props.action).toBeUndefined();
});
