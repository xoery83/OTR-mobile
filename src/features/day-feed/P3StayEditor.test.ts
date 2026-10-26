import { createElement, type ReactNode } from "react";
import { createRequire } from "node:module";
import { beforeEach, expect, it, vi } from "vitest";
import type { ManualStayFields } from "@/data/repositories/manualStayRepository";
import { P3StayEditor } from "./P3StayEditor";

vi.mock("@/data/repositories/tripRepository", () => ({
  readLocalTripRepository: vi.fn(async () => ({
    getTrip: vi.fn(async () => ({ startDate: "2027-12-30", endDate: "2028-01-09" })),
  })),
}));
vi.mock("./P3StayLocationField", () => ({
  P3StayLocationField: (p: any) => {
    state.nodes.push({
      ...p,
      accessibilityLabel: "tripCreate.stayLocation",
      onChangeText: p.onChange,
    });
    return null;
  },
}));
vi.mock("./TripCalendarRangeField", () => ({
  TripCalendarRangeField: (p: any) => {
    state.nodes.push({ ...p, label: "stayDates" });
    return null;
  },
}));
vi.mock("./PlanParticipantsField", () => ({
  PlanParticipantsField: (p: any) => {
    state.nodes.push({ ...p, label: "participants" });
    return null;
  },
}));

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
  dismissKeyboard: vi.fn(),
  scrollToEnd: vi.fn(),
  keyboardShown: null as null | (() => void),
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
vi.mock("@/data/auth/authRepository", () => ({ requireActiveUserId: vi.fn() }));
vi.mock("@/data/db/database", () => ({ readInitializedDatabase: vi.fn() }));
vi.mock("@/data/repositories/manualStayRepository", async () => ({
  manualStayFieldsSchema: (
    await vi.importActual<typeof import("@/data/repositories/manualStayRepository")>(
      "@/data/repositories/manualStayRepository",
    )
  ).manualStayFieldsSchema,
  createDefaultManualStayRepository: () => state.repository(),
}));
vi.mock("react-native", () => ({
  Alert: { alert: (...args: unknown[]) => state.alert(...args) },
  Platform: { OS: "ios" },
  KeyboardAvoidingView: (p: any) => createElement("div", null, p.children),
  Keyboard: {
    dismiss: () => state.dismissKeyboard(),
    addListener: (_: string, callback: () => void) => {
      state.keyboardShown = callback;
      return { remove: vi.fn() };
    },
  },
  Pressable: (p: any) => createElement("button", null, p.children),
  Modal: (p: any) => {
    if (p.visible) state.nodes.push({ ...p, label: "timeModal" });
    return p.visible ? createElement("div", null, p.children) : null;
  },
  ScrollView: (p: any) => {
    if (p.ref) p.ref.current = { scrollToEnd: state.scrollToEnd };
    state.nodes.push({ ...p, label: "formScroll" });
    return createElement("div", null, p.children);
  },
  View: (p: any) => {
    if (p.onTouchEnd)
      state.nodes.push({ label: "calendarKeyboardDismiss", onTouchEnd: p.onTouchEnd });
    return createElement("div", null, p.children);
  },
  StyleSheet: { create: (value: unknown) => value },
}));
vi.mock("react-native-safe-area-context", () => ({
  SafeAreaProvider: (p: any) => createElement("div", null, p.children),
  SafeAreaView: (p: any) => createElement("div", null, p.children),
}));
vi.mock("@/components/SheetHeader", () => ({
  SheetHeader: (p: any) => {
    state.nodes.push({ label: p.leftLabel, onPress: p.onLeft });
    state.nodes.push({
      label: "headerSave",
      visibleLabel: p.rightLabel,
      disabled: p.rightDisabled,
      onPress: p.onRight,
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
  const range = node("stayDates");
  const key = label === "tripCreate.checkin" ? "start" : "end";
  const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  range.onChange({ ...range.value, [key]: value });
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
  state.dismissKeyboard.mockReset();
});

it("opens the sibling Rental form without changing a clean P3 draft", async () => {
  const p = { ...props(), onChooseRental: vi.fn() };
  const value = fields();
  await open(p, {
    createDraft: vi.fn(async () => ({
      mode: "CREATE",
      itemId: "stay",
      fields: value,
      participantOptions: [],
    })),
  });
  node("tripCreate.rental").onPress();
  expect(p.onChooseRental).toHaveBeenCalledOnce();
  expect(p.onClose).not.toHaveBeenCalled();
});

it("opens Transport from a clean P3 draft", async () => {
  const p = { ...props(), onChooseTransport: vi.fn() };
  await open(p, {
    createDraft: vi.fn(async () => ({
      mode: "CREATE",
      itemId: "stay",
      fields: fields(),
      participantOptions: [],
    })),
  });
  node("tripCreate.transport").onPress();
  expect(p.onChooseTransport).toHaveBeenCalledOnce();
  expect(p.onClose).not.toHaveBeenCalled();
});

it("reuses the Trip range calendar without preselecting dates and requires both stay dates", async () => {
  const p = props(),
    draft = { mode: "CREATE", itemId: "stay", fields: fields(), participantOptions: [] };
  const repo = {
    createDraft: vi.fn(async () => draft),
    save: vi.fn(async (_draft: unknown, _fields: ManualStayFields) => ({
      itemId: "stay",
    })),
  };
  await open(p, repo);
  node("tripCreate.stayName").onChangeText("Harbour Inn");
  render(p);
  expect(node("stayDates").initialNavigationDate).toBe("2027-12-30");
  expect(node("stayDates").presentation).toBe("field");
  expect(node("stayDates").value).toEqual({ start: "", end: "" });
  expect(node("headerSave").disabled).toBe(true);
  chooseDate(p, "tripCreate.checkin", new Date(2027, 11, 29, 12));
  expect(node("headerSave").disabled).toBe(true);
  chooseDate(p, "tripCreate.checkout", new Date(2028, 0, 2, 12));
  expect(node("headerSave").disabled).toBe(false);
  node("headerSave").onPress();
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
  chooseDate(p, "tripCreate.checkin", new Date(2027, 11, 29, 12));
  chooseDate(p, "tripCreate.checkout", new Date(2028, 0, 2, 12));
  node("headerSave").onPress();
  await Promise.resolve();
  render(p);
  expect(node("tripCreate.stayName").editable).toBe(false);
  expect(node("headerSave").disabled).toBe(false);
  node("headerSave").onPress();
  await Promise.resolve();
  render(p);
  expect(repo.save).toHaveBeenCalledTimes(2);
  expect(repo.save.mock.calls[1]).toEqual(repo.save.mock.calls[0]);
  expect(node("headerSave").disabled).toBe(true);
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
  chooseDate(p, "tripCreate.checkin", new Date(2027, 11, 29, 12));
  chooseDate(p, "tripCreate.checkout", new Date(2028, 0, 2, 12));
  const oldNameChange = node("tripCreate.stayName").onChangeText;
  const oldSave = node("headerSave").onPress;
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
  expect(node("tripCreate.stayArrivalFrom")).toBeUndefined();
  expect(node("tripCreate.stayArrivalUntil")).toBeUndefined();
  expect(node("tripCreate.stayCheckoutBy")).toBeUndefined();
  expect(node("tripCreate.stayCheckinTime")).toBeDefined();
  expect(node("tripCreate.stayCheckoutTime")).toBeDefined();
  node("tripCreate.stayName").onChangeText("Renamed stay");
  node("tripCreate.stayLocation").onChangeText("Museum entrance");
  render(p);
  node("headerSave").onPress();
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
  const oldSave = node("headerSave").onPress;
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

it("rejects an old P3 Save after Discard closes a dirty draft", async () => {
  const p = props();
  const value = fields();
  value.title = "Original stay";
  value.startDate = "2027-12-29";
  value.endDate = "2028-01-02";
  const save = vi.fn();
  await open(p, {
    createDraft: vi.fn(async () => ({
      mode: "CREATE",
      itemId: "stay",
      fields: value,
      participantOptions: [],
    })),
    save,
  });
  node("tripCreate.stayName").onChangeText("Changed stay");
  render(p);
  const oldSave = node("headerSave").onPress;
  const oldChange = node("tripCreate.stayName").onChangeText;
  node("common.cancel").onPress();
  state.alert.mock.lastCall![2][1].onPress();
  oldChange("Late stay");
  oldSave();
  expect(p.onClose).toHaveBeenCalledOnce();
  expect(save).not.toHaveBeenCalled();
});

it("has only header Save and rejects stale Save after dates are cleared", async () => {
  const p = props(),
    value = fields();
  value.title = "Three night stay";
  value.startDate = "2026-11-01";
  value.endDate = "2026-11-04";
  const repo = {
    createDraft: vi.fn(async () => ({
      mode: "CREATE",
      itemId: "stay",
      fields: value,
      participantOptions: [],
    })),
    save: vi.fn(),
  };
  await open(p, repo);
  expect(node("headerSave").disabled).toBe(false);
  const oldSave = node("headerSave").onPress;
  node("stayDates").onChange({ start: "2026-11-01", end: "" });
  render(p);
  expect(node("headerSave").disabled).toBe(true);
  expect(node("headerSave").disabled).toBe(true);
  oldSave();
  expect(repo.save).not.toHaveBeenCalled();
});

it("invalid fields remain editable rather than freezing the draft on a rejected attempt", async () => {
  const p = props(),
    value = fields();
  value.title = "Stay";
  value.startDate = "2026-02-30";
  value.endDate = "2026-03-04";
  const repo = {
    createDraft: vi.fn(async () => ({
      mode: "CREATE",
      itemId: "stay",
      fields: value,
      participantOptions: [],
    })),
    save: vi.fn(async (_draft: unknown, _fields: ManualStayFields) => ({
      itemId: "stay",
    })),
  };
  await open(p, repo);
  expect(node("headerSave").disabled).toBe(true);
  node("headerSave").onPress();
  expect(repo.save).not.toHaveBeenCalled();
  render(p);
  expect(node("tripCreate.stayName").editable).toBe(true);
  chooseDate(p, "tripCreate.checkin", new Date(2026, 2, 1, 12));
  expect(node("headerSave").disabled).toBe(false);
  node("headerSave").onPress();
  await Promise.resolve();
  expect(repo.save).toHaveBeenCalledOnce();
});

it("removes an already-open time picker when Save freezes the P3 draft", async () => {
  const p = props(),
    value = fields();
  value.title = "Stay";
  value.startDate = "2026-11-01";
  value.endDate = "2026-11-04";
  await open(p, {
    createDraft: vi.fn(async () => ({
      mode: "CREATE",
      itemId: "stay",
      fields: value,
      participantOptions: [],
    })),
    save: vi.fn(() => new Promise(() => {})),
  });
  node("tripCreate.stayCheckinTime").onPress();
  render(p);
  expect(state.nodes.some((entry) => entry.mode === "time")).toBe(true);
  expect(
    state.nodes.find(
      (entry) =>
        entry.label === "timeModal" && entry.presentationStyle === "overFullScreen",
    )?.transparent,
  ).toBe(true);
  node("headerSave").onPress();
  render(p);
  expect(state.nodes.some((entry) => entry.mode === "time")).toBe(false);
  expect(node("headerSave").disabled).toBe(true);
});

it("rejects a retained Save callback after the owning repository reports a conflict", async () => {
  const p = props(),
    value = fields();
  value.title = "Stay";
  value.startDate = "2026-11-01";
  value.endDate = "2026-11-04";
  const repo = {
    createDraft: vi.fn(async () => ({
      mode: "CREATE",
      itemId: "stay",
      fields: value,
      participantOptions: [],
    })),
    save: vi.fn(async () => {
      throw new Error("MANUAL_PLAN_CONFLICT");
    }),
  };
  await open(p, repo);
  const oldSave = node("headerSave").onPress;
  oldSave();
  await new Promise((resolve) => setImmediate(resolve));
  render(p);
  expect(node("headerSave").disabled).toBe(true);
  oldSave();
  await Promise.resolve();
  expect(repo.save).toHaveBeenCalledOnce();
  expect(p.onSaved).not.toHaveBeenCalled();
});

it("uses the short header Save label and dismisses the keyboard for P3 date/time entry", async () => {
  const p = props();
  await open(p, {
    createDraft: vi.fn(async () => ({
      mode: "CREATE",
      itemId: "stay",
      fields: fields(),
      participantOptions: [],
    })),
  });
  expect(node("headerSave").visibleLabel).toBe("ui.save");
  expect(node("tripCreate.saveItem")).toBeUndefined();
  expect(node("tripCreate.saveChanges")).toBeUndefined();
  node("calendarKeyboardDismiss").onTouchEnd();
  node("tripCreate.stayCheckinTime").onPress();
  expect(state.dismissKeyboard).toHaveBeenCalledTimes(2);
});

it("places location immediately after name and delegates participants to the P1 control", async () => {
  const p = props(),
    value = fields();
  value.title = "Stay";
  value.startDate = "2026-11-01";
  value.endDate = "2026-11-04";
  const repo = {
    createDraft: vi.fn(async () => ({
      mode: "CREATE",
      itemId: "stay",
      fields: value,
      participantOptions: [
        { personId: "00000000-0000-4000-8000-000000000009", displayName: "QA" },
      ],
    })),
    save: vi.fn(async (_draft: unknown, _fields: ManualStayFields) => ({
      itemId: "stay",
    })),
  };
  await open(p, repo);
  const nameIndex = state.nodes.findIndex(
    (n) => n.accessibilityLabel === "tripCreate.stayName",
  );
  expect(state.nodes[nameIndex + 1].accessibilityLabel).toBe("tripCreate.stayLocation");
  expect(node("tripCreate.stayLocation").nameQuery).toBe(null);
  node("tripCreate.stayName").onChangeText("Park Hyatt Auckland");
  render(p);
  expect(node("tripCreate.stayLocation").nameQuery).toBe("Park Hyatt Auckland");
  expect(node("participants").options).toEqual([
    { personId: "00000000-0000-4000-8000-000000000009", displayName: "QA" },
  ]);
  node("participants").onChange({
    mode: "SELECTED_MEMBERS",
    people: [],
    selfPersonId: null,
  });
  render(p);
  expect(node("headerSave").disabled).toBe(true);
  node("participants").onChange({
    mode: "SELECTED_MEMBERS",
    people: ["00000000-0000-4000-8000-000000000009"],
    selfPersonId: null,
  });
  render(p);
  node("headerSave").onPress();
  await Promise.resolve();
  expect(repo.save.mock.calls[0][1].participation.people).toEqual([
    "00000000-0000-4000-8000-000000000009",
  ]);
});

it("uses compact Participants and atomically accepts a hotel's resolved name and address", async () => {
  const p = props();
  const value = fields();
  value.title = "my hotel";
  await open(p, {
    createDraft: vi.fn(async () => ({
      itemId: "stay",
      fields: value,
      participantOptions: [],
    })),
  });
  expect(node("participants").compact).toBe(true);
  expect(node("stayDates").markToday).toBe(true);
  expect(node("stayDates").startWithCheckin).toBe(true);
  expect(node("stayDates").referenceRange).toEqual({
    start: "2027-12-30",
    end: "2028-01-09",
  });
  node("tripCreate.stayLocation").onSelectHotel(
    "Park Hyatt Auckland",
    "99 Halsey Street",
  );
  render(p);
  expect(node("tripCreate.stayName").value).toBe("Park Hyatt Auckland");
  expect(node("tripCreate.stayLocation").value).toBe("99 Halsey Street");
  expect(node("tripCreate.stayLocation").nameQuery).toBe(null);
});

it.each([
  ["tripCreate.stayCheckinTime", 17],
  ["tripCreate.stayCheckoutTime", 10],
])("seeds %s picker only, preserving an unset clock on Cancel", async (label, hour) => {
  const p = props();
  const value = { ...fields(), startDate: "2027-12-30", endDate: "2028-01-02" };
  await open(p, {
    createDraft: vi.fn(async () => ({
      mode: "CREATE",
      itemId: "stay",
      fields: value,
      participantOptions: [],
    })),
  });
  node(label).onPress();
  render(p);
  const picker = state.nodes.find((n) => n.mode === "time")!;
  expect(picker.value.getHours()).toBe(hour);
  expect(picker.value.getMinutes()).toBe(0);
  node("common.cancel").onPress();
  render(p);
  expect(node(label).value).toBe("tripCreate.notSet");
});
it("keeps Notes visible when keyboard resizing changes the form viewport and stops scrolling after blur", async () => {
  const p = props();
  await open(p, {
    createDraft: async () => ({
      mode: "CREATE",
      itemId: "stay",
      fields: fields(),
      participantOptions: [],
    }),
  });
  state.scrollToEnd.mockClear();
  const notes = node("tripCreate.stayNotes"),
    scroll = node("formScroll");
  notes.onFocus();
  scroll.onLayout();
  state.keyboardShown?.();
  expect(state.scrollToEnd).toHaveBeenCalledTimes(3);
  notes.onBlur();
  scroll.onLayout();
  state.keyboardShown?.();
  expect(state.scrollToEnd).toHaveBeenCalledTimes(3);
});
