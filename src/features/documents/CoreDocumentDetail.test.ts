import { expect, it, vi } from "vitest";
import { CoreDocumentDetail } from "./CoreDocumentDetail";
import { uiPalette } from "@/ui/palette";
import type { DocumentListEntry } from "./documentListPresentation";

const harness = vi.hoisted(() => ({
  focus: undefined as (() => () => void) | undefined,
  metadata: vi.fn(),
  batches: vi.fn(),
  relationships: vi.fn(),
}));

vi.mock("react", async (load) => ({
  ...await load<typeof import("react")>(),
  useState: (value: unknown) => [value, vi.fn()],
  useLayoutEffect: () => {},
  useCallback: (callback: unknown) => callback,
  useRef: (current: unknown) => ({ current }),
}));
vi.mock("react-native", () => ({
  ScrollView: "main",
  Pressable: "button",
  View: "div",
  StyleSheet: { create: (style: unknown) => style, hairlineWidth: 1 },
}));
vi.mock("react-native-safe-area-context", () => ({ SafeAreaView: "div" }));
vi.mock("expo-router", () => ({
  router: {},
  Stack: {},
  useFocusEffect: (start: () => () => void) => { harness.focus = start; },
}));
vi.mock("@/components/AppIcon", () => ({ AppIcon: "icon" }));
vi.mock("@/components/SheetHeader", () => ({ SheetHeader: "header" }));
vi.mock("@/ui/controls", () => ({ UiButton: "button", UiText: "span" }));
vi.mock("@/ui/theme", () => ({
  useThemedStyles: (factory: (colors: unknown) => unknown) => factory(uiPalette("light")),
  useUiTheme: () => uiPalette("light"),
}));
vi.mock("@/ui/useUiLocale", () => ({ useUiLocale: () => "en" }));
vi.mock("@/data/operations/localItemImportOriginals", () => ({
  localItemImportOriginals: async () => harness,
}));

it("reads a document's direct items before waiting on import history", async () => {
  const entry: DocumentListEntry = {
    id: "document",
    origin: "CORE",
    byteCount: 900,
    title: "Rail ticket",
    mediaType: "application/pdf",
    recordedAt: "2026-11-21T00:00:00Z",
    localAvailable: true,
    visibility: "PRIVATE",
  };
  let finishHistory!: (value: unknown[]) => void;
  harness.metadata.mockResolvedValue([entry]);
  harness.relationships.mockResolvedValue([]);
  harness.batches.mockReturnValue(new Promise((resolve) => { finishHistory = resolve; }));

  CoreDocumentDetail({ entry, tripId: "trip", generation: 1, isCurrent: () => true });
  const blur = harness.focus!();
  try {
    await vi.waitFor(() => expect(harness.batches).toHaveBeenCalledWith(entry.id));
    expect(harness.relationships).toHaveBeenCalledExactlyOnceWith(entry.id);
    expect(harness.relationships.mock.invocationCallOrder[0]).toBeLessThan(
      harness.batches.mock.invocationCallOrder[0],
    );
  } finally {
    blur();
    finishHistory([]);
  }
});
