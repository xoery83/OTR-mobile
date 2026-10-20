import { createElement, type ReactNode } from "react";
import { createRequire } from "node:module";
import { beforeEach, expect, it, vi } from "vitest";
import type { ManualStayFields } from "@/data/repositories/manualStayRepository";
import { P3StayEditor } from "./P3StayEditor";

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
vi.mock("@/data/repositories/manualStayRepository", () => ({
  createDefaultManualStayRepository: () => state.repository(),
}));
vi.mock("react-native", () => ({
  Alert: { alert: (...args: unknown[]) => state.alert(...args) },
  Modal: (p: any) => createElement("div", null, p.children),
  ScrollView: (p: any) => createElement("div", null, p.children),
  View: (p: any) => createElement("div", null, p.children),
  StyleSheet: { create: (value: unknown) => value },
}));
vi.mock("react-native-safe-area-context", () => ({
  SafeAreaProvider: (p: any) => createElement("div", null, p.children),
}));
vi.mock("@/components/SheetHeader", () => ({
  SheetHeader: (p: any) => {
    state.nodes.push({ label: p.leftLabel, onPress: p.onLeft });
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
vi.mock("@/ui/theme", () => ({ useThemedStyles: () => ({}) }));

const { renderToStaticMarkup } = createRequire(import.meta.url)("react-dom/server") as {
  renderToStaticMarkup(node: ReactNode): string;
};
const fields = (): ManualStayFields => ({
  title: "",
  startDate: "",
  startTime: null,
  endDate: "",
  endTime: null,
  location: null,
  description: null,
  participation: { mode: "WHOLE_GROUP", people: [], selfPersonId: null },
  stayDetails: {
    propertyName: null,
    permittedCheckinFrom: null,
    permittedCheckinUntil: null,
    permittedCheckoutBy: null,
  },
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
  return renderToStaticMarkup(createElement(P3StayEditor, p));
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
function chooseDate(p: ReturnType<typeof props>, label: string, date: Date) {
  node(label).onPress();
  render(p);
  state.nodes.find((entry) => entry.mode === "date")!.onChange(undefined, date);
  render(p);
  node("common.done").onPress();
  render(p);
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
});

it("navigates to Trip Start without selecting and requires both stay dates", async () => {
  const p = props();
  const draft = {
    mode: "CREATE",
    itemId: "item-a",
    fields: fields(),
    participantOptions: [],
  };
  const repo = {
    createDraft: vi.fn(async () => draft),
    save: vi.fn(async () => ({
      localStatus: "PENDING",
      itemId: "item-a",
      operationIds: ["op-a"],
    })),
  };
  await open(p, repo);
  node("tripCreate.stayName").onChangeText("Harbour Inn");
  expect(render(p)).toContain("tripCreate.stayDatesRequired");
  expect(node("tripCreate.saveItem").disabled).toBe(true);
  node("tripCreate.checkin").onPress();
  render(p);
  const picker = state.nodes.find((entry) => entry.mode === "date")!;
  expect([
    picker.value.getFullYear(),
    picker.value.getMonth(),
    picker.value.getDate(),
  ]).toEqual([2027, 11, 30]);
  node("common.cancel").onPress();
  render(p);
  expect(node("tripCreate.saveItem").disabled).toBe(true);
  node("tripCreate.checkin").onPress();
  render(p);
  state.nodes
    .find((entry) => entry.mode === "date")!
    .onChange(undefined, new Date(2027, 11, 29, 12));
  render(p);
  node("common.done").onPress();
  render(p);
  expect(node("tripCreate.saveItem").disabled).toBe(true);
  node("tripCreate.checkout").onPress();
  render(p);
  const checkoutPicker = state.nodes.find((entry) => entry.mode === "date")!;
  expect([
    checkoutPicker.value.getFullYear(),
    checkoutPicker.value.getMonth(),
    checkoutPicker.value.getDate(),
  ]).toEqual([2027, 11, 29]);
  node("common.cancel").onPress();
  render(p);
  chooseDate(p, "tripCreate.checkout", new Date(2028, 0, 2, 12));
  expect(node("tripCreate.saveItem").disabled).toBe(false);
  node("tripCreate.saveItem").onPress();
  await Promise.resolve();
  expect(repo.save).toHaveBeenCalledWith(
    draft,
    expect.objectContaining({
      title: "Harbour Inn",
      startDate: "2027-12-29",
      endDate: "2028-01-02",
      startTime: null,
      endTime: null,
    }),
  );
  expect(p.onSaved).toHaveBeenCalledWith("item-a");
});

it("keeps the same draft and fields after an unknown save result; conflict disables retry", async () => {
  const p = props();
  const draft = {
    mode: "CREATE",
    itemId: "item-b",
    fields: fields(),
    participantOptions: [],
  };
  const repo = {
    createDraft: vi.fn(async () => draft),
    save: vi
      .fn()
      .mockRejectedValueOnce(new Error("NETWORK_UNKNOWN"))
      .mockRejectedValueOnce(new Error("MANUAL_PLAN_CONFLICT")),
  };
  await open(p, repo);
  node("tripCreate.stayName").onChangeText("Walk");
  render(p);
  node("tripCreate.checkin").onPress();
  render(p);
  state.nodes
    .find((entry) => entry.mode === "date")!
    .onChange(undefined, new Date(2027, 11, 29, 12));
  render(p);
  node("common.done").onPress();
  render(p);
  chooseDate(p, "tripCreate.checkout", new Date(2028, 0, 2, 12));
  node("tripCreate.saveItem").onPress();
  await Promise.resolve();
  render(p);
  expect(node("tripCreate.stayName").editable).toBe(false);
  expect(node("tripCreate.saveItem").disabled).toBe(false);
  node("tripCreate.saveItem").onPress();
  await Promise.resolve();
  render(p);
  expect(repo.save).toHaveBeenCalledTimes(2);
  expect(repo.save.mock.calls[1]).toEqual(repo.save.mock.calls[0]);
  expect(node("tripCreate.saveItem").disabled).toBe(true);
  expect(p.onSaved).not.toHaveBeenCalled();
  node("common.cancel").onPress();
  expect(p.onClose).not.toHaveBeenCalled();
  state.alert.mock.lastCall![2][1].onPress();
  expect(p.onClose).toHaveBeenCalledOnce();
});

it("blocks old same-turn handlers and retries only the first submitted fields", async () => {
  const p = props();
  const draft = {
    mode: "CREATE",
    itemId: "item-locked",
    fields: fields(),
    participantOptions: [],
  };
  let rejectFirst!: (error: Error) => void;
  const repo = {
    createDraft: vi.fn(async () => draft),
    save: vi
      .fn()
      .mockImplementationOnce(() => new Promise((_, reject) => (rejectFirst = reject)))
      .mockResolvedValue({
        localStatus: "PENDING",
        itemId: "item-locked",
        operationIds: [],
      }),
  };
  await open(p, repo);
  node("tripCreate.stayName").onChangeText("First title");
  node("tripCreate.checkin").onPress();
  render(p);
  state.nodes
    .find((entry) => entry.mode === "date")!
    .onChange(undefined, new Date(2027, 11, 29, 12));
  render(p);
  node("common.done").onPress();
  render(p);
  chooseDate(p, "tripCreate.checkout", new Date(2028, 0, 2, 12));
  const oldNameChange = node("tripCreate.stayName").onChangeText;
  const oldSave = node("tripCreate.saveItem").onPress;
  const oldCancel = node("common.cancel").onPress;
  oldSave();
  oldNameChange("Changed after Save");
  oldCancel();
  oldSave();
  expect(repo.save).toHaveBeenCalledTimes(1);
  expect(p.onClose).not.toHaveBeenCalled();
  expect(state.alert).not.toHaveBeenCalled();
  rejectFirst(new Error("NETWORK_UNKNOWN"));
  await Promise.resolve();
  oldNameChange("Changed before retry");
  oldSave();
  await Promise.resolve();
  expect(repo.save).toHaveBeenCalledTimes(2);
  expect(repo.save.mock.calls[1]).toEqual(repo.save.mock.calls[0]);
  expect(repo.save.mock.calls[0][1].title).toBe("First title");
  expect(p.onSaved).toHaveBeenCalledWith("item-locked");
});

it("edits an existing P3 through its original repository draft and preserves the item ID", async () => {
  const base = fields();
  base.title = "Existing stay";
  base.startDate = "2027-12-29";
  base.endDate = "2028-01-02";
  base.stayDetails.propertyName = "Original property name";
  base.stayDetails.permittedCheckinFrom = "15:00";
  const draft = {
    mode: "EDIT",
    itemId: "item-existing",
    fields: base,
    participantOptions: [],
  };
  const repository = {
    save: vi.fn(async () => ({
      localStatus: "PENDING",
      itemId: "item-existing",
      operationIds: ["edit-op"],
    })),
  };
  const p = {
    ...props(),
    itemId: "item-existing",
    opened: { repository, draft },
  };
  render(p);
  for (const effect of state.effects) effect();
  state.mount = false;
  render(p);
  expect(node("tripCreate.stayArrivalFrom").value).toBe("15:00");
  node("tripCreate.stayName").onChangeText("Renamed stay");
  node("tripCreate.stayLocation").onChangeText("Museum entrance");
  render(p);
  node("tripCreate.saveChanges").onPress();
  await Promise.resolve();
  expect(repository.save).toHaveBeenCalledWith(
    draft,
    expect.objectContaining({
      title: "Renamed stay",
      location: "Museum entrance",
      stayDetails: expect.objectContaining({
        propertyName: "Original property name",
        permittedCheckinFrom: "15:00",
      }),
    }),
  );
  expect(p.onSaved).toHaveBeenCalledWith("item-existing");
});

it("ignores a queued Discard confirmation after P3 Save starts", async () => {
  const p = props();
  const value = fields();
  value.title = "Original stay";
  value.startDate = "2027-12-29";
  value.endDate = "2028-01-02";
  const repo = {
    createDraft: vi.fn(async () => ({
      mode: "CREATE",
      itemId: "item-alert",
      fields: value,
      participantOptions: [],
    })),
    save: vi.fn(() => new Promise(() => {})),
  };
  await open(p, repo);
  node("tripCreate.stayName").onChangeText("Changed stay");
  render(p);
  const oldCancel = node("common.cancel").onPress;
  const oldSave = node("tripCreate.saveItem").onPress;
  oldCancel();
  const discard = state.alert.mock.lastCall![2][1].onPress;
  oldSave();
  discard();
  expect(repo.save).toHaveBeenCalledOnce();
  expect(p.onClose).not.toHaveBeenCalled();
});

it("ignores P3 Discard confirmation after Account change or unmount", async () => {
  const p = props();
  const value = fields();
  value.title = "Original stay";
  value.startDate = "2027-12-29";
  value.endDate = "2028-01-02";
  const cleanup = await open(p, {
    createDraft: vi.fn(async () => ({
      mode: "CREATE",
      itemId: "item-alert",
      fields: value,
      participantOptions: [],
    })),
  });
  node("tripCreate.stayName").onChangeText("Changed stay");
  render(p);
  const oldCancel = node("common.cancel").onPress;
  oldCancel();
  const discard = state.alert.mock.lastCall![2][1].onPress;
  state.generation++;
  oldCancel();
  discard();
  expect(state.alert).toHaveBeenCalledOnce();
  expect(p.onClose).not.toHaveBeenCalled();
  state.generation--;
  cleanup();
  discard();
  expect(p.onClose).not.toHaveBeenCalled();
});
