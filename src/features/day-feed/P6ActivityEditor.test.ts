import { createElement, type ReactNode } from "react";
import { createRequire } from "node:module";
import { beforeEach, expect, it, vi } from "vitest";
import { P6ActivityEditor } from "./P6ActivityEditor";

const state = vi.hoisted(() => ({
  hooks: [] as unknown[],
  refs: [] as { current: unknown }[],
  cursor: 0,
  refCursor: 0,
  effects: [] as (() => void | (() => void))[],
  nodes: [] as Record<string, any>[],
  mount: true,
  generation: 1,
  repository: vi.fn(),
  alert: vi.fn(),
  actionSheet: vi.fn(),
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useEffect: (callback: () => void | (() => void)) => {
    if (state.mount) state.effects.push(callback);
  },
  useState: (initial: unknown) => {
    const i = state.cursor++;
    if (!(i in state.hooks))
      state.hooks[i] =
        typeof initial === "function" ? (initial as () => unknown)() : initial;
    return [
      state.hooks[i],
      (next: unknown) => {
        state.hooks[i] =
          typeof next === "function"
            ? (next as (value: unknown) => unknown)(state.hooks[i])
            : next;
      },
    ];
  },
  useRef: (initial: unknown) => (state.refs[state.refCursor++] ??= { current: initial }),
}));
vi.mock("@/data/auth/accountGeneration", () => ({
  getAccountGeneration: () => state.generation,
}));
vi.mock("@/data/db/database", () => ({ readInitializedDatabase: vi.fn() }));
vi.mock("@/data/repositories/manualActivityRepository", async () => ({
  manualActivityFieldsSchema: (
    await vi.importActual<typeof import("@/data/repositories/manualActivityRepository")>(
      "@/data/repositories/manualActivityRepository",
    )
  ).manualActivityFieldsSchema,
  createDefaultManualActivityRepository: () => state.repository(),
}));
vi.mock("./TripCalendarRangeField", () => ({
  TripCalendarRangeField: (p: any) => {
    state.nodes.push(p);
    return null;
  },
}));
vi.mock("./PlanParticipantsField", () => ({
  PlanParticipantsField: (p: any) => {
    state.nodes.push({ ...p, label: "participants" });
    return null;
  },
}));
vi.mock("@/components/AppIcon", () => ({ AppIcon: () => null }));
vi.mock("@/features/place-search/PlaceSearchSheet", () => ({
  PlaceSearchSheet: (p: any) => {
    state.nodes.push({ ...p, label: "place-search" });
    return null;
  },
}));
vi.mock("@/data/auth/accountRequestContext", () => ({
  captureAccountScope: vi.fn(async () => ({
    accountId: "qa-account",
    generation: state.generation,
  })),
}));
vi.mock("@/data/auth/authRepository", () => ({ requireActiveUserId: vi.fn() }));
vi.mock("react-native", () => ({
  ActionSheetIOS: { showActionSheetWithOptions: state.actionSheet },
  Keyboard: { dismiss: vi.fn(), addListener: vi.fn(() => ({ remove: vi.fn() })) },
  KeyboardAvoidingView: (p: any) => createElement("div", null, p.children),
  Pressable: (p: any) => createElement("div", null, p.children),
  Platform: { OS: "ios" },
  Alert: { alert: (...args: unknown[]) => state.alert(...args) },
  Modal: (p: any) => (p.visible ? createElement("div", null, p.children) : null),
  ScrollView: (p: any) => createElement("div", null, p.children),
  View: (p: any) => createElement("div", null, p.children),
  StyleSheet: { create: (value: unknown) => value },
}));
vi.mock("react-native-safe-area-context", () => ({
  SafeAreaProvider: (p: any) => createElement("div", null, p.children),
  SafeAreaView: (p: any) => createElement("div", null, p.children),
}));
vi.mock("@/components/SheetHeader", () => ({
  SheetHeader: (p: any) => {
    state.nodes.push({ label: p.leftLabel, onPress: p.onLeft });
    if (p.onRight)
      state.nodes.push({
        label: p.rightLabel,
        onPress: p.onRight,
        disabled: p.rightDisabled,
        category: p.category,
      });
    return null;
  },
}));
vi.mock("@/ui/controls", () => ({
  UiText: (p: any) => createElement("span", null, p.children),
  UiSection: (p: any) => createElement("section", null, p.title, p.children),
  UiButton: (p: any) => {
    state.nodes.push(p);
    return createElement("button", { disabled: p.disabled }, p.label);
  },
}));
vi.mock("@/ui/forms", () => ({
  UiTextInput: (p: any) => {
    state.nodes.push(p);
    return createElement("input", { value: p.value, readOnly: true });
  },
  UiFormRow: (p: any) => {
    state.nodes.push({ ...p, label: p.label });
    return null;
  },
  UiDatePicker: (p: any) => {
    state.nodes.push(p);
    return null;
  },
  UiChoiceChip: (p: any) => {
    state.nodes.push(p);
    return null;
  },
}));
vi.mock("@/ui/locale", () => ({
  t: (key: string) => key,
  formatUiDate: (date: Date) => date.toISOString().slice(0, 10),
}));
vi.mock("@/ui/useUiLocale", () => ({ useUiLocale: () => "en" }));
vi.mock("@/ui/theme", () => ({ useThemedStyles: () => ({}), useUiTheme: () => ({}) }));

const { renderToStaticMarkup } = createRequire(import.meta.url)("react-dom/server") as {
  renderToStaticMarkup(node: ReactNode): string;
};
const fields = () => ({
  title: "",
  startDate: "",
  startTime: null,
  endDate: null,
  endTime: null,
  location: null,
  description: null,
  activityDetails: { sessionLabel: null, admissionNote: null, entryLocation: null },
  participation: { mode: "WHOLE_GROUP" as const, people: [], selfPersonId: null },
});
const props = () => ({
  tripId: "00000000-0000-4000-8000-000000000001",
  tripStartDate: "2027-12-30",
  onClose: vi.fn(),
  onSaved: vi.fn(),
});
function render(p: ReturnType<typeof props>) {
  state.cursor = 0;
  state.refCursor = 0;
  state.nodes = [];
  return renderToStaticMarkup(createElement(P6ActivityEditor, p));
}
const node = (label: string) =>
  state.nodes.find(
    (entry) => entry.label === label || entry.accessibilityLabel === label,
  )!;
async function open(p: ReturnType<typeof props>, repo: any) {
  state.repository.mockResolvedValue(repo);
  render(p);
  const cleanups = state.effects.flatMap((effect) => {
    const cleanup = effect();
    return typeof cleanup === "function" ? [cleanup] : [];
  });
  state.effects = [];
  state.mount = false;
  await new Promise((resolve) => setImmediate(resolve));
  render(p);
  return () => cleanups.forEach((cleanup) => cleanup());
}
beforeEach(() => {
  state.hooks = [];
  state.refs = [];
  state.effects = [];
  state.nodes = [];
  state.mount = true;
  state.generation = 1;
  state.repository.mockReset();
  state.alert.mockReset();
  state.actionSheet.mockReset();
});
it("saves minimum name/date with no invented clock or venue through top Save", async () => {
  const p = props(),
    draft = {
      mode: "CREATE",
      itemId: "item-p6",
      fields: fields(),
      participantOptions: [],
    };
  const repo = {
    createDraft: vi.fn(async () => draft),
    save: vi.fn(async () => ({ itemId: "item-p6" })),
  };
  await open(p, repo);
  expect(node("ui.save").disabled).toBe(true);
  node("p6.form.name").onChangeText("Museum");
  render(p);
  node("tripCreate.itemDate").onChange({ start: "2027-12-29", end: "" });
  render(p);
  expect(node("ui.save").disabled).toBe(false);
  node("ui.save").onPress();
  await Promise.resolve();
  expect(repo.save).toHaveBeenCalledWith(
    draft,
    expect.objectContaining({
      title: "Museum",
      startDate: "2027-12-29",
      startTime: null,
      endDate: null,
      endTime: null,
      location: null,
    }),
  );
});
it("Cancel discards and its stale Save callback cannot commit", async () => {
  const p = props(),
    draft = {
      mode: "CREATE",
      itemId: "item-p6",
      fields: { ...fields(), startDate: "2027-12-29" },
      participantOptions: [],
    };
  const repo = { createDraft: vi.fn(async () => draft), save: vi.fn() };
  await open(p, repo);
  node("p6.form.name").onChangeText("Draft");
  render(p);
  node("common.cancel").onPress();
  const stale = node("ui.save").onPress;
  state.alert.mock.lastCall![2][1].onPress();
  stale();
  expect(p.onClose).toHaveBeenCalledOnce();
  expect(repo.save).not.toHaveBeenCalled();
});
it("retry freezes fields and retains original opaque draft/values", async () => {
  const p = props(),
    draft = {
      mode: "CREATE",
      itemId: "item-p6",
      fields: { ...fields(), title: "Museum", startDate: "2027-12-29" },
      participantOptions: [],
    };
  const repo = {
    createDraft: vi.fn(async () => draft),
    save: vi
      .fn()
      .mockRejectedValueOnce(new Error("UNKNOWN"))
      .mockResolvedValueOnce({ itemId: "item-p6" }),
  };
  await open(p, repo);
  node("ui.save").onPress();
  await Promise.resolve();
  render(p);
  expect(node("p6.form.name").editable).toBe(false);
  node("p6.form.name").onChangeText("Different");
  render(p);
  node("ui.save").onPress();
  await Promise.resolve();
  expect(repo.save.mock.calls[1]).toEqual(repo.save.mock.calls[0]);
});
it("entry-place selection stays separate from the venue and ignores stale results", async () => {
  const p = props(),
    draft = {
      mode: "CREATE",
      itemId: "item-p6",
      fields: {
        ...fields(),
        title: "Museum",
        startDate: "2027-12-29",
        location: "Venue",
      },
      participantOptions: [],
    };
  const repo = { createDraft: vi.fn(async () => draft), save: vi.fn() };
  await open(p, repo);
  node("p6.admissionDetails").onPress();
  render(p);
  await node("p6.form.entryLocation").onFocus();
  render(p);
  const stale = node("place-search");
  node("p6.form.name").onChangeText("Renamed");
  stale.onConfirm({ kind: "MANUAL", text: "Stale" });
  render(p);
  expect(node("p6.form.entryLocation").value).toBe("");
  await node("p6.form.entryLocation").onFocus();
  render(p);
  node("place-search").onConfirm({ kind: "MANUAL", text: "North entrance" });
  render(p);
  expect(node("p6.form.entryLocation").value).toBe("North entrance");
  expect(node("p6.form.venue").value).toBe("Venue");
});

it("invalid start/end date range cannot freeze the draft by attempting Save", async () => {
  const p = props(),
    draft = {
      mode: "CREATE",
      itemId: "item-p6",
      fields: { ...fields(), title: "Museum", startDate: "2027-12-29" },
      participantOptions: [],
    };
  const repo = { createDraft: vi.fn(async () => draft), save: vi.fn() };
  await open(p, repo);
  node("tripCreate.itemDate").onChange({ start: "2027-12-29", end: "2027-12-28" });
  render(p);
  expect(node("ui.save").disabled).toBe(true);
  node("tripCreate.itemDate").onChange({ start: "2027-12-29", end: "2027-12-30" });
  render(p);
  expect(node("ui.save").disabled).toBe(false);
  expect(repo.save).not.toHaveBeenCalled();
});
