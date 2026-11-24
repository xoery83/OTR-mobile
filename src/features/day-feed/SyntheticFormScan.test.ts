import { createElement, type ReactNode } from "react";
import { createRequire } from "node:module";
import { beforeEach, expect, it, vi } from "vitest";
import * as component from "./SyntheticFormScan";
import type { StaySuggestionBinding } from "./p3FormSuggestions";
import { OpenFormScanSourceContext, type FormScanSourceEntry } from "./formScanSourceHandoff";
const state = vi.hoisted(() => ({
  values: [] as unknown[],
  cursor: 0,
  nodes: [] as any[],
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useEffect: () => {},
  useLayoutEffect: (effect: () => void) => effect(),
  useRef: (initial: unknown) => {
    const index = state.cursor++;
    if (!(index in state.values)) state.values[index] = { current: initial };
    return state.values[index];
  },
  useState: (initial: unknown) => {
    const index = state.cursor++;
    if (!(index in state.values)) state.values[index] = initial;
    return [
      state.values[index],
      (value: unknown) => {
        state.values[index] = value;
      },
    ];
  },
}));
vi.mock("react-native", () => ({
  Keyboard: { dismiss: vi.fn() },
  View: (p: any) => createElement("div", null, p.children),
  Modal: (p: any) => (p.visible ? createElement("div", null, p.children) : null),
  StyleSheet: { create: (x: unknown) => x },
}));
vi.mock("react-native-safe-area-context", () => ({
  SafeAreaProvider: (p: any) => createElement("div", null, p.children),
  SafeAreaView: (p: any) => createElement("div", null, p.children),
}));
vi.mock("@/components/AppIcon", () => ({ AppIcon: () => null }));
vi.mock("@/components/SheetHeader", () => ({
  SheetHeader: (p: any) => {
    state.nodes.push({ label: "cancelChooser", onPress: p.onLeft });
    return null;
  },
}));
vi.mock("@/ui/forms", () => ({
  UiChoiceChip: () => null,
  UiFormRow: (p: any) => {
    state.nodes.push(p);
    return null;
  },
}));
vi.mock("@/ui/controls", () => ({
  UiText: (p: any) => createElement("span", null, p.children),
  UiSection: (p: any) => createElement("section", null, p.children),
  UiButton: (p: any) => {
    state.nodes.push(p);
    return null;
  },
}));
vi.mock("@/native/capturePicker", () => ({ pickCaptureMaterial: vi.fn() }));
vi.mock("@/ui/locale", () => ({ t: (key: string) => key }));
vi.mock("@/ui/theme", () => ({ useThemedStyles: (fn: any) => fn({}) }));
const { renderToStaticMarkup } = createRequire(import.meta.url)("react-dom/server") as {
  renderToStaticMarkup(node: ReactNode): string;
};
beforeEach(() => {
  state.values = [];
  state.cursor = 0;
  state.nodes = [];
});
function render(props: {
  disabled?: boolean;
  onPick?: (source: "files" | "photos" | "camera") => void;
  sourceMode?: boolean;
  availability?: typeof import("@/native/p3FormScan").getP3SourceScanAvailability;
}) {
  state.cursor = 0;
  state.nodes = [];
  expect(component.FormScanEntry).toBeTypeOf("function");
  return renderToStaticMarkup(createElement(component.FormScanEntry, props));
}
const node = (label: string) => state.nodes.find((entry) => entry.label === label)!;
it("starts with one canonical compact row; unavailable families open a controlled chooser without acquisition", () => {
  render({});
  expect(state.nodes).toHaveLength(1);
  expect(node("formAutofill.scan")).toMatchObject({ compact: true, variant: "action" });
  node("formAutofill.scan").onPress();
  const html = render({});
  expect(html).toContain("formAutofill.unavailable");
  for (const label of ["ui.camera", "formAutofill.photos", "formAutofill.files"])
    expect(node(label).disabled).toBe(true);
  node("cancelChooser").onPress();
  render({});
  expect(state.nodes).toHaveLength(1);
});
it("formal P3 allows only Files, closes chooser and delegates the original source choice once", () => {
  const onPick = vi.fn();
  const props = {
    onPick,
    sourceMode: true,
    availability: (
      source: "files" | "photos" | "camera",
    ): ReturnType<typeof import("@/native/p3FormScan").getP3SourceScanAvailability> =>
      source === "files"
        ? { available: true }
        : { available: false, reason: "UNSUPPORTED_SOURCE" },
  };
  render(props);
  node("formAutofill.scan").onPress();
  render(props);
  expect(node("ui.camera").disabled).toBe(true);
  expect(node("formAutofill.photos").disabled).toBe(true);
  node("ui.camera").onPress();
  node("formAutofill.photos").onPress();
  expect(onPick).not.toHaveBeenCalled();
  node("formAutofill.files").onPress();
  render(props);
  expect(onPick).toHaveBeenCalledExactlyOnceWith("files");
  expect(node("formAutofill.files")).toBeUndefined();
});
it("Cancel leaves the caller draft and source acquisition untouched", () => {
  const onPick = vi.fn();
  const draft = { title: "My existing draft" };
  const before = structuredClone(draft);
  const props = {
    onPick,
    sourceMode: true,
    availability: (
      source: "files" | "photos" | "camera",
    ): ReturnType<typeof import("@/native/p3FormScan").getP3SourceScanAvailability> =>
      source === "files"
        ? { available: true }
        : { available: false, reason: "UNSUPPORTED_SOURCE" },
  };
  render(props);
  node("formAutofill.scan").onPress();
  render(props);
  node("cancelChooser").onPress();
  render(props);
  expect(onPick).not.toHaveBeenCalled();
  expect(draft).toEqual(before);
});
it("busy forms cannot open or acquire through a stale chooser action", () => {
  const onPick = vi.fn();
  render({ onPick, sourceMode: true });
  node("formAutofill.scan").onPress();
  render({ onPick, sourceMode: true, disabled: true });
  expect(node("formAutofill.scan").disabled).toBe(true);
  expect(node("formAutofill.files")).toBeUndefined();
  node("formAutofill.scan").onPress();
  expect(onPick).not.toHaveBeenCalled();
});

it("hands supported choices to the host without opening the legacy chooser", () => {
  const onPick = vi.fn();
  const open = vi.fn<(read: () => FormScanSourceEntry | null) => void>();
  renderToStaticMarkup(createElement(OpenFormScanSourceContext.Provider, { value: open },
    createElement(component.FormScanEntry, { onPick, sourceMode: false })));
  node("formAutofill.scan").onPress();
  const entry = open.mock.calls[0]?.[0]();
  expect(entry?.enabled("files")).toBe(true);
  expect(node("formAutofill.files")).toBeUndefined();
  expect(onPick).not.toHaveBeenCalled();
  entry?.choose("files");
  expect(onPick).toHaveBeenCalledExactlyOnceWith("files", undefined);
});

it("keeps existing material and its provider when a replacement picker is cancelled", async () => {
  const { pickCaptureMaterial } = await import("@/native/capturePicker");
  const release = vi.fn();
  const staleRelease = vi.fn();
  vi.mocked(pickCaptureMaterial)
    .mockResolvedValueOnce([{ source: "files", temporaryUri: null, name: "Existing scan", typeHint: null, release }])
    .mockResolvedValueOnce([])
    .mockImplementationOnce(async (_source, isCurrent) => {
      expect(isCurrent?.()).toBe(true);
      focused = false;
      expect(isCurrent?.()).toBe(false);
      return [{ source: "files", temporaryUri: null, name: "Late scan", typeHint: null, release: staleRelease }];
    });
  const open = vi.fn<(read: () => FormScanSourceEntry | null) => void>();
  let focused = true;
  const binding: StaySuggestionBinding = {
    formId: "editor", tripId: "trip", itemId: "draft", generation: 0, revision: 0, mode: "CREATE",
  };
  function renderScan() {
    state.cursor = 0;
    state.nodes = [];
    return renderToStaticMarkup(createElement(OpenFormScanSourceContext.Provider, { value: open },
      createElement(component.SyntheticFormScan, {
        scan: vi.fn(),
        context: () => binding,
        fields: () => ({}),
        disabled: false,
        onApply: vi.fn(),
        apply: () => null,
        labels: {},
      })));
  }
  async function chooseFiles() {
    node("formAutofill.scan").onPress();
    await open.mock.lastCall?.[0]()?.choose("files", () => focused);
    await vi.waitFor(() => expect(vi.mocked(pickCaptureMaterial)).toHaveBeenCalledTimes(open.mock.calls.length));
  }
  renderScan();
  await chooseFiles();
  expect(renderScan()).toContain("Existing scan");
  await chooseFiles();
  expect(renderScan()).toContain("Existing scan");
  expect(release).not.toHaveBeenCalled();
  await chooseFiles();
  const afterBlur = renderScan();
  expect(afterBlur).toContain("Existing scan");
  expect(afterBlur).not.toContain("Late scan");
  expect(staleRelease).toHaveBeenCalledOnce();
  expect(release).not.toHaveBeenCalled();
});
