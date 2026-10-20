vi.mock("react-native-safe-area-context", () => ({ SafeAreaProvider: "div" }));
vi.mock("@/components/SheetHeader", () => ({ SheetHeader: () => null }));
vi.mock("./ManualEditorPresentation", () => ({
  ManualEditorPresentation: (p: any) => {
    state.presentationClose = p.onClose;
    return createElement("div", null, p.children);
  },
}));
vi.mock("@/ui/theme", () => ({ useThemedStyles: (make: any) => make({}) }));
import { createElement, type ReactNode } from "react";
import { createRequire } from "node:module";
import { beforeEach, expect, it, vi } from "vitest";
import { advanceAccountGeneration } from "@/data/auth/accountGeneration";
import { ManualFlightForm, ManualFlightEditor } from "./ManualFlightForm";
const state = vi.hoisted(() => ({
  values: [] as any[],
  refs: [] as any[],
  cursor: 0,
  refCursor: 0,
  mount: true,
  effects: [] as (() => void | (() => void))[],
  cleanup: [] as (() => void)[],
  nodes: [] as any[],
  factory: vi.fn(),
  presentationClose: null as null | (() => void),
  alert: vi.fn(),
}));
const { renderToStaticMarkup } = createRequire(import.meta.url)("react-dom/server") as {
  renderToStaticMarkup(node: ReactNode): string;
};
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: (initial: unknown) => {
    const i = state.cursor++;
    if (!(i in state.values)) state.values[i] = initial;
    return [
      state.values[i],
      (next: unknown) => {
        state.values[i] = next;
      },
    ];
  },
  useRef: (initial: unknown) => (state.refs[state.refCursor++] ??= { current: initial }),
  useLayoutEffect: (f: () => void | (() => void)) => {
    if (state.mount) {
      const cleanup = f();
      if (cleanup) state.cleanup.push(cleanup);
    }
  },
  useEffect: (f: () => void | (() => void)) => {
    if (state.mount) state.effects.push(f);
  },
}));
vi.mock("react-native", () => ({
  View: (p: any) => createElement("div", null, p.children),
  ScrollView: "div",
  StyleSheet: { create: (value: unknown) => value },
  Alert: { alert: (...args: any[]) => state.alert(...args) },
}));
vi.mock("@/ui/controls", () => ({
  UiButton: (p: any) => {
    state.nodes.push(p);
    return createElement("button", { disabled: p.disabled }, p.label);
  },
  UiText: (p: any) => createElement("span", null, p.children),
}));
vi.mock("@/ui/forms", () => ({
  UiTextInput: (p: any) => {
    state.nodes.push(p);
    return createElement("input", { value: p.value, readOnly: true });
  },
}));
vi.mock("./TripCalendarField", () => ({
  CalendarField: (p: any) => {
    state.nodes.push(p);
    return createElement("span", null, p.value);
  },
}));
vi.mock("@/ui/locale", () => ({ t: (key: string) => key }));
vi.mock("@/ui/useUiLocale", () => ({ useUiLocale: () => "en" }));
vi.mock("@/data/repositories/localManualFlightRepository", () => ({
  readLocalManualFlightRepository: () => state.factory(),
}));
const props = {
  tripId: "trip-a",
  initialDate: null as string | null,
  tripStartDate: null as string | null,
  onDirtyChange: vi.fn(),
  onSavingChange: vi.fn(),
  onSaved: vi.fn(async () => {}),
  onClose: vi.fn(),
};
const flush = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};
let editorMode = false;
function render() {
  state.cursor = 0;
  state.refCursor = 0;
  state.nodes = [];
  const html = renderToStaticMarkup(
    editorMode
      ? createElement(ManualFlightEditor, props)
      : createElement(ManualFlightForm, props),
  );
  for (const f of state.effects.splice(0)) {
    const cleanup = f();
    if (cleanup) state.cleanup.push(cleanup);
  }
  state.mount = false;
  return html;
}
const node = (label: string) =>
  state.nodes.find((p) => p.label === label || p.accessibilityLabel === label)!;
const deferred = <T>() => {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
};
beforeEach(() => {
  state.cleanup.forEach((f) => f());
  state.cleanup = [];
  state.values = [];
  state.refs = [];
  state.effects = [];
  state.nodes = [];
  state.mount = true;
  advanceAccountGeneration();
  vi.clearAllMocks();
  editorMode = false;
  props.initialDate = null;
  props.tripStartDate = null;
});
async function ready(
  save: (...args: any[]) => Promise<any> = vi.fn(async () => ({
    status: "LOCAL_COMMITTED",
    itemId: "item-a",
  })),
) {
  const draft = { itemId: "item-a" };
  const repo = { createDraft: vi.fn(async () => draft), save };
  state.factory.mockResolvedValue(repo);
  render();
  await flush();
  render();
  node("manualFlight.number").onChangeText("NZ5069");
  render();
  node("manualFlight.departureDate").onChange("2027-02-06");
  render();
  return { repo, draft };
}
it("requires explicit number/date and reports save only after the repository's committed outcome", async () => {
  const pending = deferred<any>(),
    save = vi.fn(
      (_draft: unknown, _fields: unknown, _current: () => boolean) => pending.promise,
    );
  const { repo, draft } = await ready(save);
  expect(node("tripCreate.saveItem").disabled).toBe(false);
  node("tripCreate.saveItem").onPress();
  render();
  expect(node("tripCreate.saveItem").disabled).toBe(true);
  expect(props.onSaved).not.toHaveBeenCalled();
  expect(repo.save).toHaveBeenCalledWith(
    draft,
    { flightNumberLiteral: "NZ5069", departureDate: "2027-02-06" },
    expect.any(Function),
  );
  pending.resolve({ status: "LOCAL_COMMITTED", itemId: "item-a" });
  await flush();
  expect(props.onSaved).toHaveBeenCalledWith("item-a");
  expect(props.onSavingChange.mock.calls).toEqual([[true], [false]]);
});
it("preserves fields on a real claim-coverage failure and reuses the same draft on retry", async () => {
  const save = vi
    .fn()
    .mockRejectedValueOnce(new Error("LOCAL_CLAIM_COVERAGE_UNKNOWN"))
    .mockResolvedValue({ status: "LOCAL_COMMITTED", itemId: "item-a" });
  const { draft } = await ready(save);
  node("tripCreate.saveItem").onPress();
  await flush();
  expect(render()).toContain("manualFlight.claimUnavailable");
  expect(node("manualFlight.number").value).toBe("NZ5069");
  expect(node("manualFlight.number").editable).toBe(false);
  expect(node("manualFlight.departureDate").disabled).toBe(true);
  node("manualFlight.number").onChangeText("NZ9999");
  node("manualFlight.departureDate").onChange("2027-02-07");
  render();
  expect(node("manualFlight.number").value).toBe("NZ5069");
  expect(node("manualFlight.departureDate").value).toBe("2027-02-06");
  expect(props.onSaved).not.toHaveBeenCalled();
  node("tripCreate.saveItem").onPress();
  await flush();
  expect(save.mock.calls[1][0]).toBe(draft);
});
it("closes its intent on unmount or Account ABA and never publishes a delayed saved state", async () => {
  const pending = deferred<any>(),
    save = vi.fn(
      (_draft: unknown, _fields: unknown, _current: () => boolean) => pending.promise,
    );
  await ready(save);
  node("tripCreate.saveItem").onPress();
  const current = save.mock.calls[0][2];
  expect(current()).toBe(true);
  advanceAccountGeneration();
  advanceAccountGeneration();
  expect(current()).toBe(false);
  state.cleanup.forEach((f) => f());
  pending.resolve({ status: "LOCAL_COMMITTED", itemId: "item-a" });
  await flush();
  expect(props.onSaved).not.toHaveBeenCalled();
  expect(props.onSavingChange.mock.calls).toEqual([[true]]);
});
it("a deferred repository factory cannot allocate a draft after the form closes", async () => {
  const pending = deferred<any>(),
    createDraft = vi.fn();
  state.factory.mockReturnValue(pending.promise);
  render();
  state.cleanup.forEach((f) => f());
  pending.resolve({ createDraft });
  await flush();
  expect(createDraft).not.toHaveBeenCalled();
});

it("accepts Day's valid date hint but Home only navigates to Trip Start without selecting it", async () => {
  props.tripStartDate = "2027-02-01";
  render();
  expect(node("manualFlight.departureDate")).toMatchObject({
    value: "",
    initialNavigationDate: "2027-02-01",
  });
  expect(node("tripCreate.saveItem").disabled).toBe(true);
});
it("prefills an explicit Day date without inventing a flight number", () => {
  props.initialDate = "2027-02-08";
  render();
  expect(node("manualFlight.departureDate").value).toBe("2027-02-08");
  expect(node("manualFlight.number").value).toBe("");
  expect(node("tripCreate.saveItem").disabled).toBe(true);
});

it("the embedded Flight wrapper protects dirty cancel and blocks dismissal during save", async () => {
  editorMode = true;
  const pending = deferred<any>();
  await ready(vi.fn(() => pending.promise));
  state.presentationClose!();
  expect(props.onClose).not.toHaveBeenCalled();
  expect(state.alert).toHaveBeenCalledOnce();
  const discard = state.alert.mock.calls[0][2][1].onPress;
  node("tripCreate.saveItem").onPress();
  render();
  state.presentationClose!();
  discard();
  expect(props.onClose).not.toHaveBeenCalled();
  pending.resolve({ status: "LOCAL_COMMITTED", itemId: "item-a" });
  await flush();
  expect(props.onSaved).toHaveBeenCalledWith("item-a");
});
