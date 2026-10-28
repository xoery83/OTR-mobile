import { createElement, type ReactNode } from "react";
import { createRequire } from "node:module";
import { beforeEach, expect, it, vi } from "vitest";
import type { ManualRentalFields } from "@/data/repositories/manualRentalRepository";
import { P4RentalEditor } from "./P4RentalEditor";

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
  useLayoutEffect: (callback: () => void) => callback(),
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
vi.mock("./TripCalendarRangeField", () => ({
  TripCalendarRangeField: (p: any) => {
    state.nodes.push({ ...p, label: p.label });
    return null;
  },
}));
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
vi.mock("@/data/auth/accountGeneration", () => ({
  getAccountGeneration: () => state.generation,
}));
vi.mock("@/data/repositories/manualRentalRepository", () => ({
  createDefaultManualRentalRepository: () => state.repository(),
}));
vi.mock("react-native", () => ({
  Alert: { alert: (...args: unknown[]) => state.alert(...args) },
  Keyboard: { dismiss: vi.fn(), addListener: vi.fn(() => ({ remove: vi.fn() })) },
  Platform: { OS: "ios" },
  KeyboardAvoidingView: (p: any) => createElement("div", null, p.children),
  Pressable: (p: any) => {
    state.nodes.push(p);
    return createElement("div", null, p.children);
  },
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
    state.nodes.push({ label: p.leftLabel ?? "common.cancel", onPress: p.onLeft });
    if (p.onRight)
      state.nodes.push({
        label: p.rightLabel ?? "common.done",
        onPress: p.onRight,
        disabled: p.rightDisabled,
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
vi.mock("@/data/repositories/tripRepository", () => ({
  readLocalTripRepository: async () => ({ getTrip: async () => null }),
}));
vi.mock("@/ui/theme", () => ({ useThemedStyles: () => ({}), useUiTheme: () => ({}) }));
vi.mock("@/components/AppIcon", () => ({ AppIcon: () => null }));

const { renderToStaticMarkup } = createRequire(import.meta.url)("react-dom/server") as {
  renderToStaticMarkup(node: ReactNode): string;
};
const fields = (): ManualRentalFields => ({
  title: "",
  startDate: "",
  startTime: "",
  endDate: "",
  endTime: "",
  location: null,
  description: null,
  participation: { mode: "WHOLE_GROUP", people: [], selfPersonId: null },
  pickupLocation: "",
  returnLocation: "",
  rentalDetails: {
    supplier: null,
    reservedCategory: null,
    orSimilar: null,
    actualVehicleModel: null,
    verifiedPlate: null,
  },
});
const props = () => ({
  tripId: "00000000-0000-4000-8000-000000000001",
  tripStartDate: "2027-12-30",
  tripEndDate: "2028-01-05",
  onClose: vi.fn(),
  onSaved: vi.fn(),
});
function render(p: ReturnType<typeof props>) {
  state.cursor = 0;
  state.refCursor = 0;
  state.nodes = [];
  return renderToStaticMarkup(createElement(P4RentalEditor, p));
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
  const field = node("tripCreate.rentalDates");
  const value = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
  field.onChange({
    ...field.value,
    [label === "tripCreate.rentalPickupDate" ? "start" : "end"]: value,
  });
  render(p);
}
function chooseTime(p: ReturnType<typeof props>, label: string, hour: number) {
  node(label).onPress();
  render(p);
  state.nodes
    .find((entry) => entry.mode === "time")!
    .onChange(undefined, new Date(2027, 11, 29, hour, 15));
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

it("opens Transport from a clean P4 draft", async () => {
  const p = { ...props(), onChooseTransport: vi.fn() };
  await open(p, {
    createDraft: vi.fn(async () => ({
      mode: "CREATE",
      itemId: "rental",
      fields: fields(),
      participantOptions: [],
    })),
  });
  node("tripCreate.transport").onPress();
  expect(p.onChooseTransport).toHaveBeenCalledOnce();
  expect(p.onClose).not.toHaveBeenCalled();
});

it("requires both authored pickup/return dates, times and places before local Save", async () => {
  const p = props();
  const draft = { mode: "CREATE", itemId: "rental-one", fields: fields() };
  const repo = {
    createDraft: vi.fn(async () => draft),
    save: vi.fn(async () => ({
      localStatus: "PENDING",
      itemId: "rental-one",
      operationIds: ["op"],
    })),
  };
  await open(p, repo);
  expect(node("ui.save").disabled).toBe(true);
  expect(render(p)).not.toContain("tripCreate.planParticipants");
  node("tripCreate.rentalName").onChangeText("Airport car");
  chooseDate(p, "tripCreate.rentalPickupDate", new Date(2027, 11, 29, 12));
  chooseTime(p, "tripCreate.rentalPickupTime", 10);
  node("tripCreate.rentalPickupPlace").onChangeText("Terminal pickup desk");
  render(p);
  chooseDate(p, "tripCreate.rentalReturnDate", new Date(2028, 0, 2, 12));
  chooseTime(p, "tripCreate.rentalReturnTime", 11);
  expect(node("ui.save").disabled).toBe(true);
  node("tripCreate.rentalReturnPlace").onChangeText("Downtown desk");
  render(p);
  expect(node("ui.save").disabled).toBe(false);
  node("ui.save").onPress();
  await Promise.resolve();
  expect(repo.save).toHaveBeenCalledWith(
    draft,
    expect.objectContaining({
      title: "Airport car",
      startDate: "2027-12-29",
      startTime: "10:15",
      pickupLocation: "Terminal pickup desk",
      endDate: "2028-01-02",
      endTime: "11:15",
      returnLocation: "Downtown desk",
      location: null,
      participation: draft.fields.participation,
    }),
  );
  expect(p.onSaved).toHaveBeenCalledWith("rental-one");
});

it("edits the original Rental ID while preserving independent booked and actual vehicle facts", async () => {
  const base = fields();
  Object.assign(base, {
    title: "Original rental",
    startDate: "2027-12-29",
    startTime: "10:15",
    endDate: "2028-01-02",
    endTime: "11:15",
    pickupLocation: "Airport",
    returnLocation: "City",
  });
  base.rentalDetails = {
    supplier: "Supplier",
    reservedCategory: "Compact",
    orSimilar: true,
    actualVehicleModel: "Blue hatchback",
    verifiedPlate: "ABC123",
  };
  const draft = { mode: "EDIT", itemId: "same-rental", fields: base };
  const repository = {
    save: vi.fn(async () => ({
      localStatus: "PENDING",
      itemId: "same-rental",
      operationIds: ["edit"],
    })),
  };
  const p = { ...props(), itemId: "same-rental", opened: { repository, draft } };
  render(p);
  for (const effect of state.effects) effect();
  state.mount = false;
  render(p);
  node("tripCreate.rentalName").onChangeText("Renamed rental");
  node("tripCreate.rentalReturnPlace").onChangeText("City return desk");
  render(p);
  node("ui.save").onPress();
  await Promise.resolve();
  expect(repository.save).toHaveBeenCalledWith(
    draft,
    expect.objectContaining({
      title: "Renamed rental",
      returnLocation: "City return desk",
      rentalDetails: base.rentalDetails,
    }),
  );
  expect(p.onSaved).toHaveBeenCalledWith("same-rental");
});

it("locks the first P4 Save and ignores a queued Discard confirmation", async () => {
  const p = props();
  const value = fields();
  Object.assign(value, {
    title: "Original rental",
    startDate: "2027-12-29",
    startTime: "10:15",
    endDate: "2028-01-02",
    endTime: "11:15",
    pickupLocation: "Airport",
    returnLocation: "City",
  });
  const repo = {
    createDraft: vi.fn(async () => ({
      mode: "CREATE",
      itemId: "rental-alert",
      fields: value,
    })),
    save: vi.fn(() => new Promise(() => {})),
  };
  await open(p, repo);
  node("tripCreate.rentalName").onChangeText("Changed rental");
  render(p);
  const oldCancel = node("common.cancel").onPress;
  const oldSave = node("ui.save").onPress;
  oldCancel();
  const discard = state.alert.mock.lastCall![2][1].onPress;
  oldSave();
  node("tripCreate.rentalName").onChangeText("Late change");
  discard();
  expect(repo.save).toHaveBeenCalledOnce();
  expect(
    (repo.save.mock.calls as unknown as [unknown, ManualRentalFields][])[0][1].title,
  ).toBe("Changed rental");
  expect(p.onClose).not.toHaveBeenCalled();
});

it("rejects an old P4 Save after Discard closes the dirty Rental draft", async () => {
  const p = props();
  const value = fields();
  Object.assign(value, {
    title: "Original rental",
    startDate: "2027-12-29",
    startTime: "10:15",
    endDate: "2028-01-02",
    endTime: "11:15",
    pickupLocation: "Airport",
    returnLocation: "City",
  });
  const save = vi.fn();
  await open(p, {
    createDraft: vi.fn(async () => ({ mode: "CREATE", itemId: "rental", fields: value })),
    save,
  });
  node("tripCreate.rentalName").onChangeText("Changed rental");
  render(p);
  const oldSave = node("ui.save").onPress;
  const oldChange = node("tripCreate.rentalName").onChangeText;
  node("common.cancel").onPress();
  state.alert.mock.lastCall![2][1].onPress();
  oldChange("Late rental");
  oldSave();
  expect(p.onClose).toHaveBeenCalledOnce();
  expect(save).not.toHaveBeenCalled();
});

it("opens independent full-screen endpoint searches without renaming the rental", async () => {
  const p = props();
  await open(p, {
    createDraft: vi.fn(async () => ({
      mode: "CREATE",
      itemId: "rental-search",
      fields: fields(),
    })),
  });
  node("tripCreate.rentalName").onChangeText("My rental");
  render(p);
  node("tripCreate.rentalPickupPlace").onFocus();
  await Promise.resolve();
  render(p);
  expect(node("place-search").binding.editorId).toBe("rental-search");
  node("place-search").onConfirm({ kind: "MANUAL", text: "Airport desk" });
  render(p);
  expect(node("tripCreate.rentalPickupPlace").value).toBe("Airport desk");
  expect(node("tripCreate.rentalReturnPlace").value).toBe("");
  expect(node("tripCreate.rentalName").value).toBe("My rental");
  node("tripCreate.rentalReturnPlace").onFocus();
  await Promise.resolve();
  render(p);
  const oldSelection = node("place-search").onConfirm;
  state.generation++;
  oldSelection({ kind: "MANUAL", text: "Wrong account address" });
  render(p);
  expect(node("tripCreate.rentalReturnPlace").value).toBe("");
});

it("ignores a pending place selection after the editor changes Trip", async () => {
  const p = props();
  await open(p, {
    createDraft: vi.fn(async () => ({
      mode: "CREATE",
      itemId: "rental-search",
      fields: fields(),
    })),
  });
  node("tripCreate.rentalPickupPlace").onFocus();
  await Promise.resolve();
  render(p);
  const confirm = node("place-search").onConfirm;
  render({ ...p, tripId: "00000000-0000-4000-8000-000000000099" });
  confirm({ kind: "MANUAL", text: "Old Trip address" });
  render(p);
  expect(node("tripCreate.rentalPickupPlace").value).toBe("");
});

it("reuses Trip reference dates and keeps an opted-in return address aligned with pickup", async () => {
  const p = props();
  await open(p, {
    createDraft: vi.fn(async () => ({
      mode: "CREATE",
      itemId: "rental",
      fields: fields(),
    })),
  });
  expect(node("tripCreate.rentalDates").referenceRange).toEqual({
    start: p.tripStartDate,
    end: p.tripEndDate,
  });
  node("tripCreate.rentalPickupPlace").onChangeText("Depot A");
  render(p);
  node("tripCreate.rentalSameLocation").onPress();
  render(p);
  expect(node("tripCreate.rentalReturnPlace").value).toBe("Depot A");
  expect(node("tripCreate.rentalReturnPlace").editable).toBe(false);
  node("tripCreate.rentalPickupPlace").onChangeText("Depot B");
  render(p);
  expect(node("tripCreate.rentalReturnPlace").value).toBe("Depot B");
  node("tripCreate.rentalSameLocation").onPress();
  render(p);
  expect(node("tripCreate.rentalReturnPlace").editable).toBe(true);
  node("tripCreate.rentalReturnPlace").onChangeText("Custom depot");
  render(p);
  node("tripCreate.rentalPickupPlace").onChangeText("Depot C");
  render(p);
  expect(node("tripCreate.rentalReturnPlace").value).toBe("Custom depot");
});

it.each([
  ["Depot A", "Depot A", true],
  ["Depot A", "Depot B", false],
  ["", "", false],
])(
  "restores same-return selection from saved pickup %s and return %s",
  async (pickup, destination, checked) => {
    const p = { ...props(), itemId: "rental-edit" };
    await open(p, {
      read: vi.fn(async () => ({
        mode: "EDIT",
        itemId: p.itemId,
        fields: { ...fields(), pickupLocation: pickup, returnLocation: destination },
      })),
    });
    expect(node("tripCreate.rentalSameLocation").accessibilityState.checked).toBe(
      checked,
    );
    expect(node("tripCreate.rentalReturnPlace").editable).toBe(!checked);
    node("tripCreate.rentalPickupPlace").onChangeText("Updated depot");
    render(p);
    expect(node("tripCreate.rentalReturnPlace").value).toBe(
      checked ? "Updated depot" : destination,
    );
  },
);

it("restores same-return selection in an already opened rental draft", () => {
  const p = {
    ...props(),
    opened: {
      repository: {} as any,
      draft: {
        mode: "EDIT" as const,
        itemId: "rental-opened",
        fields: { ...fields(), pickupLocation: "Depot", returnLocation: "Depot" },
      },
    },
  };
  render(p);
  expect(node("tripCreate.rentalSameLocation").accessibilityState.checked).toBe(true);
  expect(node("tripCreate.rentalReturnPlace").editable).toBe(false);
});
