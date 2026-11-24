import { createElement } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import QuickAddItineraryEditorRoute from "../../../app/import-plans/quick-add-edit";
import { getAccountGeneration } from "@/data/auth/accountGeneration";
import { ManualItineraryExitContext, readManualItinerary, releaseManualItinerary, stageManualItinerary } from "./hostedManualItinerary";

const qa = vi.hoisted(() => ({
  id: "",
  detail: undefined as string | undefined,
  originMatches: true,
  originFocused: true,
  approved: undefined as unknown,
  refs: [] as { current: unknown }[],
  ref: 0,
  pending: false,
  actions: [] as (() => void)[],
  navigation: { key: "stack", index: 1, routes: [{ key: "chooser" }, { key: "editor" }] },
  dispatch: vi.fn(),
}));

vi.mock("@/features/capture/hostedImport", () => ({ hostedImportEnabled: true }));
vi.mock("./hostedManualItinerary", async (original) => ({
  ...await original<typeof import("./hostedManualItinerary")>(),
  hostedManualItineraryEnabled: true,
}));
vi.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ invocation: qa.id, family: "P2", chooserKey: qa.detail ? undefined : "chooser", detail: qa.detail }),
  useNavigation: () => ({
    addListener: () => () => {},
    isFocused: () => true,
    getState: () => qa.navigation,
    dispatch: qa.dispatch,
  }),
}));
vi.mock("expo-router/react-navigation", () => ({ usePreventRemove: vi.fn(), useRoute: () => ({ key: "editor" }) }));
vi.mock("react", async (original) => ({
  ...await original<typeof import("react")>(),
  useEffect: (run: () => void) => run(),
  useRef: (initial: unknown) => qa.refs[qa.ref++] ??= { current: initial },
  useState: () => [qa.approved, (next: unknown) => {
    qa.approved = typeof next === "function" ? next(qa.approved) : next;
  }],
  useCallback: (callback: unknown) => callback,
  useContext: (context: unknown) => context === ManualItineraryExitContext && qa.detail ? ({
    allowClose: () => {},
    registerClose: () => () => {},
    hasOrigin: (key: string) => key === "detail-route" && qa.originMatches,
  }) : null,
  useSyncExternalStore: (_: unknown, snapshot: () => unknown) => snapshot(),
}));
vi.mock("react-native", () => ({ StyleSheet: { create: (styles: unknown) => styles } }));
vi.mock("@/components/SheetNavigationHeader", () => ({}));
vi.mock("@/components/SheetHeader", () => ({ SheetHeader: "Header" }));
vi.mock("@/components/SheetRoutePanel", () => ({ SheetRoutePanel: "SheetRoutePanel" }));
vi.mock("@/components/SheetScrollView", () => ({}));
vi.mock("@/components/SheetHost", () => ({
  useSheetMotion: () => ({
    exitPending: qa.pending,
    isExitPending: () => qa.pending,
    requestCloseWithAction: (action: () => void) => {
      qa.pending = true;
      qa.actions.push(action);
    },
  }),
}));
vi.mock("./ManualItineraryContent", () => ({
  ManualItineraryContent: "Editor",
  isManualItineraryFamily: () => true,
}));

beforeEach(() => {
  qa.detail = undefined;
  qa.originMatches = true;
  qa.originFocused = true;
  qa.approved = undefined;
  qa.refs = [];
  qa.pending = false;
  qa.actions = [];
  qa.navigation = { key: "stack", index: 1, routes: [{ key: "chooser" }, { key: "editor" }] };
  qa.dispatch.mockReset();
});

it("retries only dismissal for the exact locally committed item after a root exit refuses", () => {
  const onSaved = vi.fn();
  const entry = {
    generation: getAccountGeneration(), tripId: "trip",
    initialDate: null, onClose: vi.fn(), onSaved,
  };
  qa.id = stageManualItinerary(() => entry);
  const editor = QuickAddItineraryEditorRoute().type;
  const render = () => {
    qa.ref = 0;
    return editor().props;
  };

  const screen = render();
  const header = screen.children.props;
  let content = header.children;
  while (content.type !== "Editor") content = content.props.children;
  content.props.onSaved("item-a");
  render();
  expect(qa.actions).toHaveLength(1);
  expect(onSaved).not.toHaveBeenCalled();

  qa.pending = false;
  render();
  expect(qa.approved).toBeUndefined();
  expect(screen.value()).toBe(false);
  const retry = render().children.props.value({ leftDisabled: true });
  expect(retry.props.leftDisabled).toBe(false);
  expect(retry.props.rightDisabled).toBe(true);
  retry.props.onLeft();
  render();
  expect(qa.actions).toHaveLength(2);
  qa.actions[1]();
  expect(onSaved).toHaveBeenCalledExactlyOnceWith("item-a");

  releaseManualItinerary(qa.id);
  expect(screen.value()).toBe(false);
});

it("retains the hosted draft when nested Back is refused and releases only after the original chooser returns", async () => {
  const entry = { generation: getAccountGeneration(), tripId: "trip", initialDate: null, onClose: vi.fn(), onSaved: vi.fn() };
  qa.id = stageManualItinerary(() => entry);
  const editor = QuickAddItineraryEditorRoute().type;
  const render = () => {
    qa.ref = 0;
    return editor().props;
  };
  let content = render().children;
  while (content.type !== "Editor") content = content.props.children;
  const afterClose = vi.fn();
  content.props.onClose(afterClose);
  render();
  await Promise.resolve();
  expect(qa.approved).toBeUndefined();
  expect(afterClose).not.toHaveBeenCalled();

  qa.dispatch.mockImplementation(() => {
    qa.navigation = { ...qa.navigation, index: 0, routes: [{ key: "chooser" }] };
  });
  content.props.onClose(afterClose);
  render();
  expect(qa.dispatch).toHaveBeenCalledTimes(2);
  expect(afterClose).toHaveBeenCalledOnce();
  releaseManualItinerary(qa.id);
});

it("opens a standalone exact-item root and publishes Save only after its detail returns", () => {
  qa.detail = "1";
  const onSaved = vi.fn();
  const editor = QuickAddItineraryEditorRoute().type;
  const opened = { repository: {}, draft: { itemId: "real-item", revision: 73 } };
  const entry = {
    tripId: "trip", generation: getAccountGeneration(), initialDate: null, onClose: vi.fn(), onSaved,
    detailEdit: {
      family: "P2" as const, itemId: "real-item", originKey: "detail-route",
      originFocused: () => qa.originFocused,
      render: vi.fn(presentation => createElement("ExistingEditor", { ...presentation, opened })),
    },
  };
  qa.id = stageManualItinerary(() => entry);
  const render = () => { qa.ref = 0; return editor().props; };
  const props = render();
  const rootHeader = props.children.props.value({ title: "Edit" });
  expect(rootHeader.props.root).toBe(true);
  let rendered = props.children.props.children;
  while (rendered.type !== entry.detailEdit.render) rendered = rendered.props.children;
  expect(rendered.props).toMatchObject({ embedded: true });
  expect(rendered.type(rendered.props).props.opened).toBe(opened);

  qa.originFocused = true;
  rendered.props.onSaved("real-item");
  expect(onSaved).not.toHaveBeenCalled();
  render();
  expect(qa.actions).toHaveLength(1);
  qa.actions[0]();
  qa.actions[0]();
  expect(onSaved).toHaveBeenCalledExactlyOnceWith("real-item");
  expect(readManualItinerary(qa.id)).toBeUndefined();
});

it("does not mount on a wrong predecessor or report to a different active detail", () => {
  qa.detail = "1";
  const onSaved = vi.fn();
  const editor = QuickAddItineraryEditorRoute().type;
  const entry = {
    tripId: "trip", generation: getAccountGeneration(), initialDate: null, onClose: vi.fn(), onSaved,
    detailEdit: {
      family: "P2" as const, itemId: "pinned-item", originKey: "detail-route",
      originFocused: () => qa.originFocused,
      render: vi.fn(_presentation => null),
    },
  };
  qa.id = stageManualItinerary(() => entry);
  const render = () => { qa.ref = 0; return editor(); };
  qa.originMatches = false;
  expect(render().type).toBe("SheetRoutePanel");
  expect(entry.detailEdit.render).not.toHaveBeenCalled();
  qa.originMatches = true;
  let rendered = render().props.children.props.children;
  while (rendered.type !== entry.detailEdit.render) rendered = rendered.props.children;
  rendered.props.onSaved("pinned-item");
  render();
  qa.originFocused = false;
  qa.actions[0]();
  expect(onSaved).not.toHaveBeenCalled();
});
