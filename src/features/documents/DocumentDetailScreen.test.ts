import { beforeEach, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import DocumentDetailScreen from "./DocumentDetailScreen";
import DocumentFileInfoLayout from "../../../app/document-file-info/_layout";
import { ImportDocumentsPanel } from "./ImportDocumentsPanel";
import { publishQualifiedFileInfo } from "./documentFileInfoReadback";

const state = vi.hoisted(() => ({
  focused: false,
  generation: 2,
  documentId: "test-pdf",
  foreground: "document-file-info",
  laggingForeground: undefined as string | undefined,
  previousKey: "detail",
  routeKey: "detail",
  originRouteKey: undefined as string | undefined,
}));

function routeState(foreground = state.foreground) {
  return {
    index: 1,
    routes: [
      { key: state.previousKey },
      { key: "file-info", name: foreground },
    ],
  };
}

vi.mock("react", async (load) => ({
  ...await load<typeof import("react")>(),
  useCallback: (callback: unknown) => callback,
  useEffect: () => {},
  useLayoutEffect: () => {},
  useRef: (current: unknown) => ({ current }),
  useState: (initial: unknown) => [
    initial === null ? {
      scope: JSON.stringify([2, "", "test-pdf", "CAPTURE", undefined]),
      entry: { origin: "CAPTURE" },
      accountId: "qa",
    } : initial,
    vi.fn(),
  ],
  useSyncExternalStore: (_subscribe: unknown, read: () => unknown) => read(),
}));
vi.mock("react-native", () => ({
  View: "view",
  StyleSheet: { create: (value: unknown) => value },
}));
vi.mock("expo-router", () => ({
  Stack: { Screen: "screen" },
  router: { push: vi.fn() },
  useFocusEffect: () => {},
  useIsFocused: () => state.focused,
  useLocalSearchParams: () => ({ documentId: state.documentId, origin: "CAPTURE", originRouteKey: state.originRouteKey }),
  useNavigation: () => ({ isFocused: () => state.focused, getState: () => routeState() }),
}));
vi.mock("expo-router/react-navigation", () => ({
  useRoute: () => ({ key: state.routeKey }),
  useNavigationState: (select: (value: unknown) => unknown) =>
    select(routeState(state.laggingForeground)),
}));
vi.mock("@/data/auth/accountGeneration", () => ({
  getAccountGeneration: () => state.generation,
  subscribeAccountGeneration: vi.fn(),
}));
vi.mock("@/data/auth/authRepository", () => ({}));
vi.mock("@/data/auth/accountRequestContext", () => ({}));
vi.mock("@/data/operations/localItemImportOriginals", () => ({}));
vi.mock("@/data/operations/defaultImportDocuments", () => ({}));
vi.mock("@/ui/controls", () => ({ UiText: "text" }));
vi.mock("@/ui/locale", () => ({ t: (key: string) => key }));
vi.mock("@/ui/theme", () => ({ useUiTheme: () => ({ background: "background" }) }));
vi.mock("@/ui/useUiLocale", () => ({ useUiLocale: () => "en" }));
vi.mock("@/components/SheetRouteLayout", () => ({ SheetRouteLayout: "sheet" }));
vi.mock("./openHostedDocumentInformation", () => ({ openHostedDocumentInformation: vi.fn() }));
vi.mock("./CoreDocumentDetail", () => ({ CoreDocumentDetail: vi.fn() }));
vi.mock("./ImportDocumentsPanel", () => ({ ImportDocumentsPanel: vi.fn() }));

function render() {
  return DocumentDetailScreen().props as {
    accessibilityElementsHidden: boolean;
    pointerEvents: string;
    style: (false | { display?: string })[];
    children: [ReactElement, ReactElement<{ isCurrent: () => boolean }> | null];
  };
}

beforeEach(() => {
  state.focused = false;
  state.generation = 2;
  state.documentId = "test-pdf";
  state.foreground = "document-file-info";
  state.laggingForeground = undefined;
  state.previousKey = "detail";
  state.routeKey = "detail";
  state.originRouteKey = undefined;
});

const scope = (id: string, owner = "detail") => JSON.stringify([owner, 2, "", id, "CAPTURE", undefined]);

it("keeps the owning detail visible and inert after authorized File Info reads it", () => {
  const release = publishQualifiedFileInfo("file-info", scope("test-pdf"));
  const covered = render();
  release();
  expect(covered.style).not.toContainEqual({ display: "none" });
  expect(covered.accessibilityElementsHidden).toBe(true);
  expect(covered.pointerEvents).toBe("none");
  const backdrop = covered.children[1];
  expect(backdrop?.type).toBe(ImportDocumentsPanel);
  expect(backdrop?.props.isCurrent()).toBe(false);

  state.focused = true;
  state.foreground = "document-detail";
  const active = render();
  expect(active.pointerEvents).toBe("auto");
  expect(active.children[1]?.key).toBe(backdrop?.key);
  expect(active.children[1]?.props.isCurrent()).toBe(true);
});

it("keeps the backdrop hidden while reading, after denial, or when a different file was authorized", () => {
  expect(render().style).toContainEqual({ display: "none" });
  const releaseOther = publishQualifiedFileInfo("file-info", scope("other"));
  expect(render().style).toContainEqual({ display: "none" });
  releaseOther();
  const release = publishQualifiedFileInfo("file-info", scope("test-pdf"));
  expect(render().style).not.toContainEqual({ display: "none" });
  release();
  expect(render().style).toContainEqual({ display: "none" });
});

it("keeps the loaded Detail mounted when focus changes before the stack observer", () => {
  state.laggingForeground = "document-detail";
  const pending = render();
  expect(pending.style).toContainEqual({ display: "none" });
  expect(pending.children[1]?.type).toBe(ImportDocumentsPanel);
  const release = publishQualifiedFileInfo("file-info", scope("test-pdf"));
  try {
    expect(render().style).not.toContainEqual({ display: "none" });
    state.foreground = "unrelated";
    state.laggingForeground = "document-file-info";
    const unrelated = render();
    expect(unrelated.style).toContainEqual({ display: "none" });
    expect(unrelated.children[1]).toBeNull();
  } finally {
    release();
  }
});

it("uses the outer File Info key and the exact detail origin for a nested reader", () => {
  const releaseLeaf = publishQualifiedFileInfo("index", scope("test-pdf"));
  expect(render().style).toContainEqual({ display: "none" });
  releaseLeaf();
  const releaseOtherOwner = publishQualifiedFileInfo("file-info", scope("test-pdf", "other-detail"));
  expect(render().style).toContainEqual({ display: "none" });
  releaseOtherOwner();
  state.routeKey = "file-info";
  const fileInfoRootKey = DocumentFileInfoLayout().props.value;
  state.routeKey = "index";
  state.originRouteKey = "detail";
  state.focused = true;
  const form = DocumentDetailScreen({ informationOnly: true, fileInfoRootKey }).props.children[1];
  expect(form.type).toBe(ImportDocumentsPanel);
  const cleanup = form.props.onInformationVerified();
  state.routeKey = "detail";
  state.focused = false;
  expect(render().style).not.toContainEqual({ display: "none" });
  cleanup();
  expect(render().style).toContainEqual({ display: "none" });
});

it.each(["generation", "documentId", "foreground", "previousKey"] as const)(
  "hides the cached detail when %s changes",
  (field) => {
    const release = publishQualifiedFileInfo("file-info", scope("test-pdf"));
    if (field === "generation") state.generation++;
    else state[field] = "changed";
    const screen = render();
    release();
    expect(screen.style).toContainEqual({ display: "none" });
    expect(screen.children[1]).toBeNull();
  },
);
