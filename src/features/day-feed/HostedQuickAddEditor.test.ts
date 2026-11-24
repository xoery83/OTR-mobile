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
  fallback: undefined as string | undefined,
  approved: undefined as unknown,
  refs: [] as { current: unknown }[],
  ref: 0,
  pending: false,
  focused: true,
  actions: [] as (() => void)[],
  navigation: {
    key: "stack", index: 1,
    routes: [{ key: "chooser" }, { key: "editor" }] as { key: string; params?: { invocation: string; editorKey: string } }[],
  },
  dispatch: vi.fn(),
}));

vi.mock("@/features/capture/hostedImport", () => ({ hostedImportEnabled: true }));
vi.mock("./hostedManualItinerary", async (original) => ({
  ...await original<typeof import("./hostedManualItinerary")>(),
  hostedManualItineraryEnabled: true,
}));
vi.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ invocation: qa.id, family: "P2", chooserKey: qa.detail ? undefined : "chooser", detail: qa.detail, fallback: qa.fallback }),
  useNavigation: () => ({
    addListener: () => () => {},
    isFocused: () => qa.focused,
    getParent: () => ({ isFocused: () => true }),
    getState: () => qa.navigation,
    dispatch: qa.dispatch,
  }),
}));
vi.mock("expo-router/react-navigation", () => ({
  usePreventRemove: vi.fn(), useRoute: () => ({ key: "editor" }),
  StackActions: { pop: (count: number) => ({ type: "POP", payload: { count } }) },
}));
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
  qa.fallback = undefined;
  qa.refs = [];
  qa.pending = false;
  qa.focused = true;
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

it("retries a refused Import return without saving again or sending a receipt to another Batch", async () => {
  qa.fallback = "import-request";
  const batch = { key: "batch" };
  const routes = [batch, ...qa.navigation.routes];
  qa.navigation = { ...qa.navigation, index: 2, routes };
  const entry = {
    tripId: "trip", generation: getAccountGeneration(), initialDate: null,
    onClose: vi.fn(), onSaved: vi.fn(),
    importFallback: { invocation: qa.fallback, sourceKey: batch.key, chooserKey: "chooser" },
  };
  qa.id = stageManualItinerary(() => entry);
  const editor = QuickAddItineraryEditorRoute().type;
  const render = () => { qa.ref = 0; return editor().props; };
  const screen = render();
  let content = screen.children;
  while (content.type !== "Editor") content = content.props.children;
  content.props.onSaved("item");
  render();
  await Promise.resolve();
  expect(entry.onSaved).not.toHaveBeenCalled();
  expect(readManualItinerary(qa.id)).toBe(entry);
  expect(qa.actions).toHaveLength(0);
  const header = render().children.props.value({ leftDisabled: true });
  expect(header.props).toMatchObject({ leftDisabled: false, rightDisabled: true });

  qa.navigation.routes = [{ key: "other-batch" }, ...routes.slice(1)];
  header.props.onLeft();
  render();
  await Promise.resolve();
  expect(qa.dispatch).toHaveBeenCalledOnce();
  expect(entry.onSaved).not.toHaveBeenCalled();

  qa.navigation.routes = routes;
  qa.dispatch.mockImplementation(() => {
    qa.navigation = { key: "stack", index: 0, routes: [batch] };
  });
  header.props.onLeft();
  render();
  expect(qa.dispatch).toHaveBeenLastCalledWith({
    type: "POP", payload: { count: 2 }, source: "editor", target: "stack",
  });
  expect(entry.onSaved).toHaveBeenCalledExactlyOnceWith("item");
  releaseManualItinerary(qa.id);
});

it("dismisses an approved Import draft from an owned child and returns only to its originating Batch", async () => {
  qa.fallback = "import-request";
  const afterClose = vi.fn();
  const onClose = vi.fn();
  const entry = {
    tripId: "trip", generation: getAccountGeneration(), initialDate: null,
    onClose, onSaved: vi.fn(),
    importFallback: { invocation: qa.fallback, sourceKey: "batch", chooserKey: "chooser" },
  };
  qa.id = stageManualItinerary(() => entry);
  qa.focused = false;
  const batch = { key: "batch" };
  const picker = { key: "picker", params: { invocation: qa.id, editorKey: "unrelated" } };
  qa.navigation = { ...qa.navigation, index: 3, routes: [batch, ...qa.navigation.routes, picker] };
  const editor = QuickAddItineraryEditorRoute().type;
  const render = () => { qa.ref = 0; return editor(); };
  qa.approved = { kind: "close", afterClose };
  render();
  await Promise.resolve();
  expect(qa.dispatch).not.toHaveBeenCalled();
  expect(afterClose).not.toHaveBeenCalled();

  picker.params.editorKey = "editor";
  qa.approved = { kind: "close", afterClose };
  qa.dispatch.mockImplementation(() => {
    qa.navigation = { key: "stack", index: 0, routes: [batch] };
  });
  render();
  expect(qa.dispatch).toHaveBeenCalledExactlyOnceWith({
    type: "POP", payload: { count: 3 }, source: "picker", target: "stack",
  });
  expect(afterClose).toHaveBeenCalledOnce();
  expect(onClose).toHaveBeenCalledOnce();
  releaseManualItinerary(qa.id);
});
