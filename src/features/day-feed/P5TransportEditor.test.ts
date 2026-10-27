import { createElement, type ReactNode } from "react";
import { createRequire } from "node:module";
import { beforeEach, expect, it, vi } from "vitest";
import { P5TransportEditor } from "./P5TransportEditor";

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
vi.mock("@/data/repositories/manualTransportRepository", () => ({
  createDefaultManualTransportRepository: () => state.repository(),
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
  transportType: "TRAIN" as const,
  departureDate: "",
  departureTime: null,
  departureLocation: "",
  arrivalDate: null,
  arrivalTime: null,
  arrivalLocation: null,
  description: null,
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
  return renderToStaticMarkup(createElement(P5TransportEditor, p));
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
it("saves an authored Train with NTC departure and unknown arrival", async () => {
  const p = props();
  const draft = {
    mode: "CREATE",
    itemId: "item-p5",
    fields: fields(),
    participantOptions: [],
  };
  const repo = {
    createDraft: vi.fn(async () => draft),
    save: vi.fn(async () => ({
      localStatus: "PENDING",
      itemId: "item-p5",
      operationIds: ["op"],
    })),
  };
  await open(p, repo);
  expect(node("ui.save").disabled).toBe(true);
  node("tripCreate.transportName").onChangeText("Train to town");
  render(p);
  node("tripCreate.departurePlace").onChangeText("Central Station");
  render(p);
  node("tripCreate.departureDate").onPress();
  render(p);
  state.nodes
    .find((entry) => entry.mode === "date")!
    .onChange(undefined, new Date(2027, 11, 29, 12));
  render(p);
  node("common.done").onPress();
  render(p);
  expect(node("ui.save").disabled).toBe(false);
  node("ui.save").onPress();
  await Promise.resolve();
  expect(repo.save).toHaveBeenCalledWith(
    draft,
    expect.objectContaining({
      transportType: "TRAIN",
      departureDate: "2027-12-29",
      departureTime: null,
      departureLocation: "Central Station",
      arrivalDate: null,
      arrivalTime: null,
      arrivalLocation: null,
    }),
  );
  expect(p.onSaved).toHaveBeenCalledWith("item-p5");
});
it("late discard cannot save after terminal close", async () => {
  const p = props();
  const draft = {
    mode: "CREATE",
    itemId: "item-p5",
    fields: {
      ...fields(),
      departureDate: "2027-12-29",
      departureLocation: "Central Station",
    },
    participantOptions: [],
  };
  const repo = { createDraft: vi.fn(async () => draft), save: vi.fn() };
  await open(p, repo);
  node("tripCreate.transportName").onChangeText("Draft");
  render(p);
  node("common.cancel").onPress();
  const staleSave = node("ui.save").onPress;
  state.alert.mock.lastCall![2][1].onPress();
  staleSave();
  expect(p.onClose).toHaveBeenCalledOnce();
  expect(repo.save).not.toHaveBeenCalled();
});
it("retries an unknown result with the same opaque draft and first fields", async () => {
  const p = props();
  const draft = {
    mode: "CREATE",
    itemId: "item-p5",
    fields: {
      ...fields(),
      departureDate: "2027-12-29",
      departureLocation: "Central Station",
    },
    participantOptions: [],
  };
  const repo = {
    createDraft: vi.fn(async () => draft),
    save: vi
      .fn()
      .mockRejectedValueOnce(new Error("UNKNOWN"))
      .mockResolvedValueOnce({
        localStatus: "PENDING",
        itemId: "item-p5",
        operationIds: ["op"],
      }),
  };
  await open(p, repo);
  node("tripCreate.transportName").onChangeText("Train to town");
  render(p);
  node("ui.save").onPress();
  await Promise.resolve();
  render(p);
  expect(node("tripCreate.transportName").editable).toBe(false);
  node("tripCreate.transportName").onChangeText("Changed after attempt");
  render(p);
  node("ui.save").onPress();
  await Promise.resolve();
  expect(repo.save).toHaveBeenCalledTimes(2);
  expect(repo.save.mock.calls[1]).toEqual(repo.save.mock.calls[0]);
  expect(p.onSaved).toHaveBeenCalledWith("item-p5");
});
it("keeps an authored arrival time without inventing its date", async () => {
  const p = props();
  const draft = {
    mode: "CREATE",
    itemId: "item-p5",
    fields: {
      ...fields(),
      title: "Ferry",
      departureDate: "2027-12-29",
      departureLocation: "Pier A",
      arrivalDate: null,
      arrivalTime: "18:30",
    },
    participantOptions: [],
  };
  const repo = {
    createDraft: vi.fn(async () => draft),
    save: vi.fn(async () => ({
      localStatus: "PENDING",
      itemId: "item-p5",
      operationIds: ["op"],
    })),
  };
  await open(p, repo);
  node("tripCreate.transportName").onChangeText("Ferry to town");
  render(p);
  node("ui.save").onPress();
  await Promise.resolve();
  expect(repo.save).toHaveBeenCalledWith(
    draft,
    expect.objectContaining({ arrivalDate: null, arrivalTime: "18:30" }),
  );
});

it("uses one type selector and commits its native selection through the existing fields", async () => {
  const p = props();
  const draft = {
    mode: "CREATE",
    itemId: "item-p5",
    fields: {
      ...fields(),
      title: "Bus",
      departureDate: "2027-12-29",
      departureLocation: "Station",
    },
    participantOptions: [],
  };
  const repo = {
    createDraft: vi.fn(async () => draft),
    save: vi.fn(async () => ({ itemId: "item-p5" })),
  };
  await open(p, repo);
  expect(node("ui.save").category).toBe("form");
  node("tripCreate.transportType").onPress();
  const [options, selected] = state.actionSheet.mock.lastCall!;
  expect(options.options).toEqual([
    "tripCreate.transportType.TRAIN",
    "tripCreate.transportType.BUS",
    "tripCreate.transportType.FERRY",
    "tripCreate.transportType.WATER_TAXI",
    "tripCreate.transportType.SHUTTLE",
    "tripCreate.transportType.TRANSFER",
    "common.cancel",
  ]);
  selected(1);
  render(p);
  node("ui.save").onPress();
  await Promise.resolve();
  expect(repo.save).toHaveBeenCalledWith(
    draft,
    expect.objectContaining({ transportType: "BUS" }),
  );
});
it("keeps place search actor-bound and stale results cannot overwrite the form", async () => {
  const p = props();
  const draft = {
    mode: "CREATE",
    itemId: "item-p5",
    fields: {
      ...fields(),
      title: "Train",
      departureDate: "2027-12-29",
      departureLocation: "Station",
    },
    participantOptions: [],
  };
  const repo = { createDraft: vi.fn(async () => draft), save: vi.fn() };
  await open(p, repo);
  await node("tripCreate.departurePlace").onFocus();
  render(p);
  const search = node("place-search");
  expect(search.binding).toMatchObject({
    accountId: "qa-account",
    tripId: p.tripId,
    editorId: "item-p5",
  });
  node("tripCreate.transportName").onChangeText("New title");
  search.onConfirm({ kind: "MANUAL", text: "Stale address" });
  render(p);
  expect(node("tripCreate.departurePlace").value).toBe("Station");
  await node("tripCreate.departurePlace").onFocus();
  render(p);
  node("place-search").onConfirm({ kind: "MANUAL", text: "Updated station" });
  render(p);
  expect(node("tripCreate.departurePlace").value).toBe("Updated station");
});
