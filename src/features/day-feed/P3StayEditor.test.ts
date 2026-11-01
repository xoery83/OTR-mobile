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
  useLayoutEffect: (callback: () => void) => callback(),
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
vi.mock("expo/fetch", () => ({ fetch: vi.fn() }));
vi.mock("@/data/auth/sessionAccessToken", () => ({ sessionAccessToken: vi.fn() }));
vi.mock("@/data/auth/authRepository", () => ({
  requireActiveUserId: vi.fn(),
  requireAdoptedUserId: vi.fn(),
}));
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
  UiText: (p: any) => {
    state.nodes.push({ ...p, textNode: true });
    return createElement("span", null, p.children);
  },
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
vi.mock("@/ui/theme", () => ({
  useThemedStyles: (create: (colors: unknown) => unknown) =>
    create({ textPrimary: "theme-foreground" }),
}));

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
it("retains selected Apple geography as a revision-bound unaccepted draft and invalidates manual address edits", async () => {
  const p = props(),
    initial = {
      ...fields(),
      title: "Keep my name",
      startDate: "2027-12-30",
      endDate: "2028-01-02",
      description: "Keep notes",
    };
  const draft = {
    mode: "CREATE",
    itemId: "00000000-0000-4000-8000-000000000002",
    fields: initial,
    participantOptions: [],
  };
  await open(p, { createDraft: vi.fn(async () => draft), save: vi.fn() });
  const address = "1 Example Street";
  const selected = {
    provider: "apple",
    kind: "mapItem",
    handle: "handle",
    title: "Hotel",
    secondary: address,
    address,
    sessionId: "00000000-0000-4000-8000-000000000003",
    generation: 1,
    addressComponents: {
      locality: "Nelson",
      administrativeArea: "Nelson",
      country: "New Zealand",
      countryCode: "NZ",
    },
  };
  node("tripCreate.stayLocation").onSelectHotel("Hotel", address);
  render(p);
  const onPlaceSelected = node("tripCreate.stayLocation").onPlaceSelected;
  onPlaceSelected(selected);
  const selectedRef = state.refs.find(
    (ref) => (ref.current as any)?.authority === "UNACCEPTED_PROVIDER_DRAFT",
  )!;
  expect(selectedRef.current).toMatchObject({
    addressComponents: selected.addressComponents,
    binding: {
      itemId: "00000000-0000-4000-8000-000000000002",
      tripId: p.tripId,
      inputRevision: 1,
      location: address,
    },
  });
  const preserved = state.refs.find(
    (ref) => (ref.current as any)?.description === "Keep notes",
  )!.current;
  expect(preserved).toMatchObject({
    description: "Keep notes",
    startDate: initial.startDate,
    endDate: initial.endDate,
    participation: initial.participation,
  });
  node("tripCreate.stayLocation").onChange("Manually changed");
  expect(selectedRef.current).toBeNull();
  onPlaceSelected(selected);
  expect(selectedRef.current).toBeNull();
  state.generation++;
  onPlaceSelected({ ...selected, address: "Manually changed" });
  expect(selectedRef.current).toBeNull();
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

it("synthetic Create review updates only Draft, then uses the original repository Save", async () => {
  const p = {
    ...props(),
    syntheticScan: vi.fn(
      (binding: import("./p3FormSuggestions").StaySuggestionBinding) => ({
        kind: "SYNTHETIC_STAY_SUGGESTIONS" as const,
        binding,
        candidates: [
          {
            id: "one",
            fields: {
              title: "Synthetic Inn",
              startDate: "2027-12-30",
              endDate: "2028-01-02",
            },
          },
        ],
      }),
    ),
  };
  const draft = {
    mode: "CREATE",
    itemId: "stay",
    fields: fields(),
    participantOptions: [],
  };
  const repo = {
    createDraft: vi.fn(async () => draft),
    save: vi.fn(async () => ({ itemId: "stay" })),
  };
  await open(p, repo);
  await scanFile(p);
  expect(node("formAutofill.keep").variant).toBe("secondary");
  for (let i = 0; i < 3; i++) {
    node("formAutofill.keep").onPress();
    render(p);
    expect(node("formAutofill.use").variant).toBe("primary");
  }
  node("ui.apply").onPress();
  render(p);
  expect(node("tripCreate.stayName").value).toBe("Synthetic Inn");
  expect(repo.save).not.toHaveBeenCalled();
  node("headerSave").onPress();
  await Promise.resolve();
  expect(repo.save).toHaveBeenCalledWith(
    draft,
    expect.objectContaining({
      title: "Synthetic Inn",
      startDate: "2027-12-30",
      endDate: "2028-01-02",
      stayDetails: expect.objectContaining({ propertyName: "Synthetic Inn" }),
    }),
  );
});

it("rejects an old review after a user edits away and back to the same text", async () => {
  const p = {
    ...props(),
    syntheticScan: (binding: import("./p3FormSuggestions").StaySuggestionBinding) => ({
      kind: "SYNTHETIC_STAY_SUGGESTIONS" as const,
      binding,
      candidates: [{ id: "one", fields: { title: "Suggestion" } }],
    }),
  };
  await open(p, {
    createDraft: vi.fn(async () => ({
      mode: "CREATE",
      itemId: "stay",
      fields: fields(),
      participantOptions: [],
    })),
    save: vi.fn(),
  });
  await scanFile(p);
  node("formAutofill.keep").onPress();
  render(p);
  const apply = node("ui.apply").onPress;
  node("tripCreate.stayName").onChangeText("Changed");
  render(p);
  node("tripCreate.stayName").onChangeText("");
  render(p);
  apply();
  render(p);
  expect(node("tripCreate.stayName").value).toBe("");
  expect(node("ui.apply")).toBeUndefined();
});

it("Cancel invalidates retained Apply callbacks without touching the draft", async () => {
  const p = {
    ...props(),
    syntheticScan: (binding: import("./p3FormSuggestions").StaySuggestionBinding) => ({
      kind: "SYNTHETIC_STAY_SUGGESTIONS" as const,
      binding,
      candidates: [{ id: "one", fields: { title: "Suggestion" } }],
    }),
  };
  await open(p, {
    createDraft: vi.fn(async () => ({
      mode: "CREATE",
      itemId: "stay",
      fields: fields(),
      participantOptions: [],
    })),
    save: vi.fn(),
  });
  await scanFile(p);
  node("formAutofill.keep").onPress();
  render(p);
  const apply = node("ui.apply").onPress;
  state.nodes
    .filter((entry) => entry.label === "common.cancel")
    .at(-1)!
    .onPress();
  render(p);
  apply();
  render(p);
  expect(node("tripCreate.stayName").value).toBe("");
});

it.each(["Cancel", "Draft", "Account", "Trip"] as const)(
  "ignores a late synthetic result after %s changes",
  async (change) => {
    let finish!: (result: import("./p3FormSuggestions").SyntheticStayResult) => void;
    let requested!: import("./p3FormSuggestions").StaySuggestionBinding;
    let signal!: AbortSignal;
    const p = {
      ...props(),
      syntheticScan: (
        binding: import("./p3FormSuggestions").StaySuggestionBinding,
        abort: AbortSignal,
      ) => {
        requested = binding;
        signal = abort;
        return new Promise<import("./p3FormSuggestions").SyntheticStayResult>(
          (resolve) => {
            finish = resolve;
          },
        );
      },
    };
    const repo = {
      createDraft: vi.fn(async () => ({
        mode: "CREATE",
        itemId: "stay",
        fields: fields(),
        participantOptions: [],
      })),
      save: vi.fn(),
    };
    await open(p, repo);
    await scanFile(p);
    if (change === "Cancel")
      state.nodes
        .filter((entry) => entry.label === "common.cancel")
        .at(-1)!
        .onPress();
    if (change === "Draft") node("tripCreate.stayName").onChangeText("My input");
    if (change === "Account") state.generation++;
    if (change === "Trip") p.tripId = "other-trip";
    render(p);
    finish({
      kind: "SYNTHETIC_STAY_SUGGESTIONS",
      binding: requested,
      candidates: [{ id: "one", fields: { title: "Late hotel" } }],
    });
    await new Promise((resolve) => setImmediate(resolve));
    render(p);
    expect(node("formAutofill.keep")).toBeUndefined();
    expect(node("tripCreate.stayName").value).toBe(change === "Draft" ? "My input" : "");
    expect(repo.save).not.toHaveBeenCalled();
    if (change === "Cancel") {
      expect(signal.aborted).toBe(true);
      expect(p.onClose).not.toHaveBeenCalled();
    }
  },
);

vi.mock("@/native/capturePicker", () => ({
  pickCaptureMaterial: vi.fn(async () => [
    {
      source: "files",
      name: "Synthetic booking.pdf",
      temporaryUri: "synthetic://booking",
      typeHint: "application/pdf",
    },
  ]),
}));
async function scanFile(p: ReturnType<typeof props>) {
  await node("formAutofill.files").onPress();
  render(p);
  void node("formAutofill.scan").onPress();
  render(p);
}

vi.mock("@/data/files/tripPhotoFileStore", () => ({
  retainTripPhoto: vi.fn(),
  resolveRetainedTripPhoto: vi.fn(),
  probeRetainedTripPhotoIdentity: vi.fn(),
  discardRetainedTripPhoto: vi.fn(),
}));
it.each([
  ["CREATE", false],
  ["EDIT", false],
  ["CREATE", true],
  ["EDIT", true],
  ["CREATE", "INTAKE"],
] as const)(
  "P3 %s source=%s scans selected material through the real Form and SQLite Repository Save",
  async (mode, sourceMode) => {
    const { DatabaseSync } = await import("node:sqlite");
    const { createHash, randomUUID } = await import("node:crypto");
    const { migrations } = await import("@/data/db/migrations");
    const { serializeDatabaseTransactions } =
      await import("@/data/db/databaseConnection");
    const { createTripCoreV2Repository } =
      await import("@/data/repositories/tripCoreV2Repository");
    const { createTripRepository } = await vi.importActual<
      typeof import("@/data/repositories/tripRepository")
    >("@/data/repositories/tripRepository");
    const { createManualStayRepository } = await vi.importActual<
      typeof import("@/data/repositories/manualStayRepository")
    >("@/data/repositories/manualStayRepository");
    const sql = new DatabaseSync(":memory:");
    try {
      sql.exec("PRAGMA foreign_keys=ON");
      for (const migration of migrations) sql.exec(migration.sql);
      const database = serializeDatabaseTransactions({
        async getFirstAsync<T>(query: string, ...args: unknown[]) {
          return (sql.prepare(query).get(...(args as never[])) ?? null) as T | null;
        },
        async getAllAsync<T>(query: string, ...args: unknown[]) {
          return sql.prepare(query).all(...(args as never[])) as T[];
        },
        async runAsync(query: string, ...args: unknown[]) {
          return sql.prepare(query).run(...(args as never[])) as never;
        },
        async withTransactionAsync(work: () => Promise<void>) {
          sql.exec("BEGIN");
          try {
            await work();
            sql.exec("COMMIT");
          } catch (error) {
            sql.exec("ROLLBACK");
            throw error;
          }
        },
      });
      const accountId = randomUUID(),
        tripId = randomUUID();
      const account = async () => accountId,
        clock = () => "2026-11-01T00:00:00.000Z";
      const core = createTripCoreV2Repository(
        database,
        account,
        async (bytes) => createHash("sha256").update(bytes).digest("hex"),
        clock,
      );
      await createTripRepository(database, account, core, clock).createTrip({
        tripId,
        operationId: randomUUID(),
        name: "Synthetic Scan Trip",
        destination: null,
        startDate: "2026-11-04",
        endDate: "2026-11-10",
      });
      const repository = createManualStayRepository(database, account, core, clock);
      let itemId: string | undefined;
      if (mode === "EDIT") {
        const draft = await repository.createDraft(tripId);
        itemId = draft.itemId;
        await repository.save(draft, {
          ...draft.fields,
          title: "Existing",
          location: "Original address",
          startDate: "2026-11-04",
          endDate: "2026-11-06",
          startTime: "17:00",
          endTime: "10:00",
          description: "Keep existing note",
          stayDetails: { ...draft.fields.stayDetails, propertyName: "Original property" },
        });
      }
      const scan = vi.fn(
        (
          binding: import("./p3FormSuggestions").StaySuggestionBinding,
          _signal: AbortSignal,
        ) => ({
          kind: "SYNTHETIC_STAY_SUGGESTIONS" as const,
          binding,
          candidates: [
            {
              id: "one",
              targetItemId: binding.mode === "EDIT" ? binding.itemId : undefined,
              fields:
                mode === "CREATE"
                  ? {
                      title: "Synthetic Inn",
                      location: "Selected address",
                      startDate: "2026-11-04",
                      endDate: "2026-11-06",
                      startTime: "17:00",
                      endTime: "10:00",
                    }
                  : { location: "Changed address", description: null, startTime: null },
              unsupported: [
                { field: "Contact", state: "UNSUPPORTED" as const },
                { field: "Instructions", state: "NEEDS_INPUT" as const },
              ],
            },
          ],
        }),
      );
      const auth = await import("@/data/auth/authRepository");
      vi.mocked(auth.requireAdoptedUserId).mockResolvedValue(accountId);
      const { p3SourceInterpretationFixture } =
        await import("./__fixtures__/p3SourceInterpretation");
      const sourceScan = vi.fn<import("./p3SourceSuggestions").P3SourceInterpreter>(
        async (context) =>
          p3SourceInterpretationFixture(
            context,
            mode === "CREATE"
              ? {
                  title: "Synthetic Inn",
                  location: "Selected address",
                  startDate: "2026-11-04",
                  endDate: "2026-11-06",
                  startTime: "17:00",
                  endTime: "10:00",
                }
              : { location: "Changed address" },
          ),
      );
      if (sourceMode === "INTAKE") {
        const { createCaptureSubmissionRepository } =
          await import("@/data/repositories/captureSubmissionRepository");
        const { createUniversalP3SourceInterpreter } =
          await import("@/data/operations/universalP3SourceInterpreter");
        const { universalP1SourceFixture } =
          await import("../../../backend/src/__fixtures__/universalP1Source");
        const { universalResultSchema } =
          await import("@/data/api/universalImportContracts");
        const { ApiClientError } = await import("@/data/api/client");
        const original = await universalP1SourceFixture(
          accountId,
          tripId,
          "2026-11-04",
          "P3",
        );
        const result = universalResultSchema.parse({
          ...original.input.result,
          providerOutcome: "LOCAL_FIXTURE",
        });
        let task:
          import("@/data/api/universalImportContracts").UniversalExecutionContext | null =
          null;
        sourceScan.mockImplementation(
          createUniversalP3SourceInterpreter({
            requireNormalAccount: account,
            submission: {
              repository: createCaptureSubmissionRepository(database, account, {
                sha256: async (bytes) => createHash("sha256").update(bytes).digest("hex"),
                now: clock,
                newId: randomUUID,
              }),
              open: async () => ({
                bytes: new TextEncoder().encode(
                  original.input.snapshot.representations[0].text_content!,
                ),
              }),
              now: clock,
              newId: randomUUID,
            },
            prepareSources: async (_context, job) => {
              result.batchId = job.batch.batchId;
              result.sourceBindings[0].inputId = job.inputs[0].id;
              task = {
                version: "otr.backend.universal-context/1",
                accountId,
                actorId: accountId,
                tripId,
                batchId: job.batch.batchId,
                taskId: result.taskId,
              };
            },
            createTransport: () => ({
              context: async () => {
                if (!task)
                  throw new ApiClientError(
                    "fixture missing Task",
                    "http",
                    404,
                    "TASK_NOT_FOUND",
                  );
                return task;
              },
              result: async () => result,
              execute: async () => {
                throw Error("NO_PROVIDER_IN_LOCAL_FIXTURE");
              },
            }),
          }),
        );
      }
      const p = {
        ...props(),
        tripId,
        itemId,
        ...(sourceMode ? { sourceScan } : { syntheticScan: scan }),
      };
      const save = vi.spyOn(repository, "save"); // Call-through; the actual Core/SQLite transaction executes.
      await open(p, repository);
      const pending = () =>
        Number(sql.prepare("SELECT count(*) n FROM trip_core_pending_intents").get()!.n);
      const before = pending();
      await scanFile(p);
      if (sourceMode) {
        await vi.waitFor(() => {
          render(p);
          expect(
            state.nodes.some(
              (entry) =>
                entry.label ===
                (mode === "EDIT"
                  ? "formAutofill.confirmStayTarget"
                  : "formAutofill.keep"),
            ),
          ).toBe(true);
        });
        expect(sourceScan).toHaveBeenCalledOnce();
        expect(scan).not.toHaveBeenCalled();
        expect(state.nodes.some((entry) => entry.label === "formAutofill.sample")).toBe(
          false,
        );
        if (mode === "EDIT") {
          expect(node("ui.apply").disabled).toBe(true);
          node("formAutofill.confirmStayTarget").onPress();
          render(p);
        }
      } else expect(scan).toHaveBeenCalledOnce();
      expect(
        (sourceMode ? sourceScan.mock.calls[0][0] : scan.mock.calls[0][0]).itemRevision,
      ).toEqual(mode === "EDIT" ? expect.any(Number) : null);
      if (mode === "CREATE")
        for (let i = 0; i < (sourceMode === "INTAKE" ? 3 : 6); i++) {
          node("formAutofill.keep").onPress();
          render(p);
        }
      else {
        node("formAutofill.keep").onPress();
        render(p);
        if (!sourceMode) {
          state.nodes
            .filter((entry) => entry.label === "formAutofill.keepClear")
            .at(-1)!
            .onPress();
          render(p);
        }
      }
      expect(pending()).toBe(before);
      node("ui.apply").onPress();
      render(p);
      expect(pending()).toBe(before);
      node("headerSave").onPress();
      await vi.waitFor(() => expect(p.onSaved).toHaveBeenCalledOnce());
      expect(save).toHaveBeenCalledOnce();
      const savedId = p.onSaved.mock.calls[0][0];
      const restored = await createManualStayRepository(
        database,
        account,
        core,
        clock,
      ).read(tripId, savedId);
      expect(restored.fields.location).toBe(
        sourceMode === "INTAKE"
          ? null
          : mode === "CREATE"
            ? "Selected address"
            : "Changed address",
      );
      if (mode === "EDIT") {
        expect(savedId).toBe(itemId);
        expect(restored.fields).toMatchObject({
          title: "Existing",
          startTime: "17:00",
          endTime: "10:00",
          description: sourceMode ? "Keep existing note" : null,
          stayDetails: { propertyName: "Original property" },
        });
      } else
        expect(restored.fields).toMatchObject({
          title: sourceMode === "INTAKE" ? "海滨住宿" : "Synthetic Inn",
          description: null,
          stayDetails: {
            propertyName: sourceMode === "INTAKE" ? "海滨住宿" : "Synthetic Inn",
          },
        });
      expect(pending()).toBeGreaterThan(before);
      expect(JSON.stringify(restored.fields)).not.toContain("Instructions");
    } finally {
      sql.close();
    }
  },
);

it("normal P3 entry is visibly unavailable and cannot open a picker or submit AI", async () => {
  const picker = (await import("@/native/capturePicker")).pickCaptureMaterial;
  vi.mocked(picker).mockClear();
  const p = props();
  const repo = {
    createDraft: vi.fn(async () => ({
      mode: "CREATE",
      itemId: "stay",
      fields: fields(),
      participantOptions: [],
    })),
    save: vi.fn(),
  };
  await open(p, repo);
  expect(render(p)).toContain("formAutofill.unavailable");
  expect(node("formAutofill.files").disabled).toBe(true);
  await node("formAutofill.files").onPress();
  expect(picker).not.toHaveBeenCalled();
  expect(repo.save).not.toHaveBeenCalled();
});
it("multiple Edit candidates require an explicit choice and block the wrong target", async () => {
  const draft = {
    mode: "EDIT",
    itemId: "stay",
    fields: { ...fields(), title: "Mine" },
    participantOptions: [],
  };
  const repo = { read: vi.fn(async () => draft), save: vi.fn() };
  const p = {
    ...props(),
    itemId: "stay",
    syntheticScan: (binding: import("./p3FormSuggestions").StaySuggestionBinding) => ({
      kind: "SYNTHETIC_STAY_SUGGESTIONS" as const,
      binding,
      candidates: [
        { id: "one", targetItemId: "stay", fields: { title: "Matching hotel" } },
        { id: "two", targetItemId: "another-item", fields: { title: "Other booking" } },
      ],
    }),
  };
  await open(p, repo);
  await scanFile(p);
  expect(node("ui.apply")).toBeUndefined();
  node("Other booking").onPress();
  render(p);
  expect(node("ui.apply").disabled).toBe(true);
  node("ui.apply").onPress();
  expect(node("tripCreate.stayName").value).toBe("Mine");
  node("Matching hotel").onPress();
  render(p);
  node("formAutofill.keep").onPress();
  render(p);
  node("ui.apply").onPress();
  render(p);
  expect(node("tripCreate.stayName").value).toBe("Matching hotel");
  expect(repo.save).not.toHaveBeenCalled();
});
it("malformed suggestions show a recoverable error without changing the draft", async () => {
  const scan = vi.fn(
    () => null as unknown as import("./p3FormSuggestions").SyntheticStayResult,
  );
  const p = { ...props(), syntheticScan: scan };
  await open(p, {
    createDraft: vi.fn(async () => ({
      mode: "CREATE",
      itemId: "stay",
      fields: fields(),
      participantOptions: [],
    })),
    save: vi.fn(),
  });
  await scanFile(p);
  expect(render(p)).toContain("formAutofill.failed");
  expect(node("tripCreate.stayName").value).toBe("");
  expect(node("common.tryAgain")).toBeDefined();
  expect(scan).toHaveBeenCalledOnce();
});
it("Cancel during native selection releases late material and preserves user input", async () => {
  const picker = (await import("@/native/capturePicker")).pickCaptureMaterial;
  let finish!: (
    items: import("@/features/capture/captureStaging").CaptureSelection[],
  ) => void;
  vi.mocked(picker).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const scan = vi.fn((binding: import("./p3FormSuggestions").StaySuggestionBinding) => ({
    kind: "SYNTHETIC_STAY_SUGGESTIONS" as const,
    binding,
    candidates: [],
  }));
  const p = { ...props(), syntheticScan: scan };
  await open(p, {
    createDraft: vi.fn(async () => ({
      mode: "CREATE",
      itemId: "stay",
      fields: fields(),
      participantOptions: [],
    })),
    save: vi.fn(),
  });
  node("tripCreate.stayName").onChangeText("My current draft");
  render(p);
  const picking = node("formAutofill.files").onPress();
  await new Promise((resolve) => setImmediate(resolve));
  render(p);
  state.nodes
    .filter((entry) => entry.label === "common.cancel")
    .at(-1)!
    .onPress();
  render(p);
  const release = vi.fn();
  finish([
    {
      source: "files",
      name: "Late file",
      temporaryUri: "synthetic://late",
      typeHint: "application/pdf",
      release,
    },
  ]);
  await picking;
  expect(render(p)).not.toContain("Late file");
  expect(release).toHaveBeenCalledOnce();
  expect(scan).not.toHaveBeenCalled();
  expect(node("tripCreate.stayName").value).toBe("My current draft");
  expect(p.onClose).not.toHaveBeenCalled();
});
it("explicit synthetic sample has no file URI/identity and never invokes the real picker", async () => {
  const picker = (await import("@/native/capturePicker")).pickCaptureMaterial;
  vi.mocked(picker).mockClear();
  const scan = vi.fn((binding: import("./p3FormSuggestions").StaySuggestionBinding) => ({
    kind: "SYNTHETIC_STAY_SUGGESTIONS" as const,
    binding,
    candidates: [],
  }));
  const p = { ...props(), syntheticScan: scan };
  await open(p, {
    createDraft: vi.fn(async () => ({
      mode: "CREATE",
      itemId: "stay",
      fields: fields(),
      participantOptions: [],
    })),
    save: vi.fn(),
  });
  node("formAutofill.sample").onPress();
  render(p);
  await node("formAutofill.scan").onPress();
  render(p);
  expect(picker).not.toHaveBeenCalled();
  const sample = (
    scan.mock.calls[0] as unknown[]
  )[2] as import("@/features/capture/captureStaging").CaptureSelection[];
  expect(sample[0].temporaryUri).toBeNull();
  expect(sample[0].identity).toBeUndefined();
});

it("Scan status text uses the theme foreground instead of native black in Dark Mode", async () => {
  const p = props();
  await open(p, {
    createDraft: vi.fn(async () => ({
      mode: "CREATE",
      itemId: "stay",
      fields: fields(),
      participantOptions: [],
    })),
  });
  const status = state.nodes.find(
    (entry) => entry.textNode && entry.children === "formAutofill.unavailable",
  );
  expect(status.style.color).toBe("theme-foreground");
});

it("pins one Source interpreter per Form so prop refresh cannot replace UNKNOWN's session", async () => {
  const auth = await import("@/data/auth/authRepository");
  vi.mocked(auth.requireAdoptedUserId).mockResolvedValue(
    "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  );
  const { p3SourceInterpretationFixture } =
    await import("./__fixtures__/p3SourceInterpretation");
  const first = vi.fn(
    async (
      context: import("@/data/operations/universalP3FormInterpretation").UniversalP3FormContext,
    ) => {
      const result = p3SourceInterpretationFixture(context, {});
      result.candidates = [];
      result.status = "EXECUTION_OUTCOME_UNKNOWN";
      result.providerOutcome = "UNKNOWN";
      return result;
    },
  );
  const replacement = vi.fn(first.getMockImplementation()!);
  const p = {
    ...props(),
    tripId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    sourceScan: first,
  };
  await open(p, {
    createDraft: vi.fn(async () => ({
      mode: "CREATE",
      itemId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      baseRevision: null,
      fields: fields(),
      participantOptions: [],
    })),
  });
  await scanFile(p);
  await vi.waitFor(() => expect(first).toHaveBeenCalledOnce());
  await new Promise((resolve) => setImmediate(resolve));
  const unknown = render(p);
  expect(unknown).toContain("capture.ai.task.UNKNOWN");
  expect(unknown).not.toContain("formAutofill.empty");
  p.sourceScan = replacement;
  render(p);
  await node("formAutofill.scan").onPress();
  await vi.waitFor(() => expect(first).toHaveBeenCalledTimes(2));
  expect(replacement).not.toHaveBeenCalled();
});
