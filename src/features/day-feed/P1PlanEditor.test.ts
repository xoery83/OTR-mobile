import { createElement, type ReactNode } from "react";
import { createRequire } from "node:module";
import { beforeEach, expect, it, vi } from "vitest";
import { P1PlanEditor } from "./P1PlanEditor";
import { createGuestP1DraftInventory } from "@/data/auth/guestP1DraftInventory";
vi.mock("./TripCalendarRangeField", () => ({
  TripCalendarRangeField: (p: any) => {
    state.nodes.push(p);
    return null;
  },
}));
vi.mock("./PlanParticipantsField", () => ({
  PlanParticipantsField: (p: any) => {
    state.nodes.push({ participantField: p });
    return null;
  },
}));
vi.mock("@/components/AppIcon", () => ({ AppIcon: () => null }));
vi.mock("@/features/place-search/PlaceSearchSheet", () => ({
  PlaceSearchSheet: (props: any) => {
    state.nodes.push({ placeSearch: props });
    return null;
  },
}));
vi.mock("@/data/auth/accountRequestContext", () => ({
  captureAccountScope: async () => ({
    accountId: "00000000-0000-4000-8000-000000000099",
    generation: state.generation,
  }),
}));
vi.mock("@/data/auth/authRepository", () => ({ requireActiveUserId: vi.fn() }));

vi.mock("@/data/auth/guestP1DraftInventory", async (original) => ({
  ...(await original<typeof import("@/data/auth/guestP1DraftInventory")>()),
  guestP1DraftInventory: {
    register(
      participant: import("@/data/auth/guestP1DraftInventory").GuestP1DraftParticipant,
    ) {
      state.draftParticipants.push(participant);
      return () => {
        state.draftParticipants = state.draftParticipants.filter(
          (value) => value !== participant,
        );
      };
    },
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
  draftParticipants:
    [] as import("@/data/auth/guestP1DraftInventory").GuestP1DraftParticipant[],
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
vi.mock("@/data/repositories/manualPlanRepository", () => ({
  createDefaultManualPlanRepository: () => state.repository(),
}));
vi.mock("react-native", () => ({
  Keyboard: { dismiss: vi.fn() },
  Alert: { alert: (...args: unknown[]) => state.alert(...args) },
  Modal: (p: any) => createElement("div", null, p.children),
  ScrollView: (p: any) => {
    state.nodes.push({ scrollView: p });
    return createElement("div", null, p.children);
  },
  Pressable: (p: any) => {
    state.nodes.push(p);
    return createElement("button", null, p.children);
  },
  View: (p: any) => createElement("div", null, p.children),
  StyleSheet: { create: (value: unknown) => value },
}));
vi.mock("react-native-safe-area-context", () => ({
  SafeAreaView: (p: any) => createElement("div", null, p.children),
  SafeAreaProvider: (p: any) => createElement("div", null, p.children),
}));
vi.mock("@/components/SheetHeader", () => ({
  SheetHeader: (p: any) => {
    state.nodes.push({
      header: p,
      label: p.leftLabel ?? "common.cancel",
      onPress: p.onLeft,
    });
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
vi.mock("@/ui/theme", () => ({ useUiTheme: () => ({}), useThemedStyles: () => ({}) }));

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
  participation: { mode: "WHOLE_GROUP", people: [], selfPersonId: null },
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
  return renderToStaticMarkup(createElement(P1PlanEditor, p));
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
  state.draftParticipants = [];
});

it("opens the sibling Rental form without changing a clean P1 draft", async () => {
  const p = { ...props(), onChooseRental: vi.fn() };
  const value = fields();
  await open(p, {
    createDraft: vi.fn(async () => ({
      mode: "CREATE",
      itemId: "plan",
      fields: value,
      participantOptions: [],
    })),
  });
  node("tripCreate.rental").onPress();
  expect(p.onChooseRental).toHaveBeenCalledOnce();
  expect(p.onClose).not.toHaveBeenCalled();
});

it("opens Transport from a clean P1 draft", async () => {
  const p = { ...props(), onChooseTransport: vi.fn() };
  await open(p, {
    createDraft: vi.fn(async () => ({
      mode: "CREATE",
      itemId: "plan",
      fields: fields(),
      participantOptions: [],
    })),
  });
  node("tripCreate.transport").onPress();
  expect(p.onChooseTransport).toHaveBeenCalledOnce();
  expect(p.onClose).not.toHaveBeenCalled();
});

it("navigates Home picker to Trip Start without selecting it, then saves authored date as NTC", async () => {
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
  node("tripCreate.planName").onChangeText("Visit the museum");
  expect(render(p)).toContain("tripCreate.planStartRequired");
  expect(node("ui.save").disabled).toBe(true);
  expect(node("tripCreate.itemDate").initialNavigationDate).toBe("2027-12-30");
  expect(node("tripCreate.itemDate").value).toEqual({ start: "", end: "" });
  node("tripCreate.itemDate").onChange({ start: "2027-12-29", end: "" });
  render(p);
  expect(node("ui.save").disabled).toBe(false);
  node("ui.save").onPress();
  await Promise.resolve();
  expect(repo.save).toHaveBeenCalledWith(
    draft,
    expect.objectContaining({
      title: "Visit the museum",
      startDate: "2027-12-29",
      startTime: null,
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
  node("tripCreate.planName").onChangeText("Walk");
  render(p);
  node("tripCreate.itemDate").onChange({ start: "2027-12-29", end: "" });
  render(p);
  node("ui.save").onPress();
  await Promise.resolve();
  render(p);
  expect(node("tripCreate.planName").editable).toBe(false);
  expect(node("ui.save").disabled).toBe(false);
  node("ui.save").onPress();
  await Promise.resolve();
  render(p);
  expect(repo.save).toHaveBeenCalledTimes(2);
  expect(repo.save.mock.calls[1]).toEqual(repo.save.mock.calls[0]);
  expect(node("ui.save").disabled).toBe(true);
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
  node("tripCreate.planName").onChangeText("First title");
  node("tripCreate.itemDate").onChange({ start: "2027-12-29", end: "" });
  render(p);
  const oldNameChange = node("tripCreate.planName").onChangeText;
  const oldSave = node("ui.save").onPress;
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

it("edits an existing P1 through its original repository draft and preserves the item ID", async () => {
  const base = fields();
  base.title = "Existing plan";
  base.startDate = "2027-12-29";
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
  node("tripCreate.planLocation").onChangeText("Museum entrance");
  render(p);
  node("ui.save").onPress();
  await Promise.resolve();
  expect(repository.save).toHaveBeenCalledWith(
    draft,
    expect.objectContaining({ title: "Existing plan", location: "Museum entrance" }),
  );
  expect(p.onSaved).toHaveBeenCalledWith("item-existing");
});

it("ignores a queued Discard confirmation after P1 Save starts", async () => {
  const p = props();
  const value = fields();
  value.title = "Original plan";
  value.startDate = "2027-12-29";
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
  node("tripCreate.planName").onChangeText("Changed plan");
  render(p);
  const oldCancel = node("common.cancel").onPress;
  const oldSave = node("ui.save").onPress;
  oldCancel();
  const discard = state.alert.mock.lastCall![2][1].onPress;
  oldSave();
  discard();
  expect(repo.save).toHaveBeenCalledOnce();
  expect(p.onClose).not.toHaveBeenCalled();
});

it("ignores P1 Discard confirmation after Account change or unmount", async () => {
  const p = props();
  const value = fields();
  value.title = "Original plan";
  value.startDate = "2027-12-29";
  const cleanup = await open(p, {
    createDraft: vi.fn(async () => ({
      mode: "CREATE",
      itemId: "item-alert",
      fields: value,
      participantOptions: [],
    })),
  });
  node("tripCreate.planName").onChangeText("Changed plan");
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

it("rejects an old P1 Save after Discard closes a dirty draft", async () => {
  const p = props();
  const value = fields();
  value.title = "Original plan";
  value.startDate = "2027-12-29";
  const save = vi.fn();
  await open(p, {
    createDraft: vi.fn(async () => ({
      mode: "CREATE",
      itemId: "plan",
      fields: value,
      participantOptions: [],
    })),
    save,
  });
  node("tripCreate.planName").onChangeText("Changed plan");
  render(p);
  const oldSave = node("ui.save").onPress;
  const oldChange = node("tripCreate.planName").onChangeText;
  node("common.cancel").onPress();
  state.alert.mock.lastCall![2][1].onPress();
  oldChange("Late plan");
  oldSave();
  expect(p.onClose).toHaveBeenCalledOnce();
  expect(save).not.toHaveBeenCalled();
});

it("rejects an old P1 Save after a clean sibling transition", async () => {
  const p = { ...props(), onChooseRental: vi.fn() };
  const value = fields();
  value.title = "Original plan";
  value.startDate = "2027-12-29";
  const save = vi.fn();
  await open(p, {
    createDraft: vi.fn(async () => ({
      mode: "CREATE",
      itemId: "plan",
      fields: value,
      participantOptions: [],
    })),
    save,
  });
  const oldSave = node("ui.save").onPress;
  node("tripCreate.rental").onPress();
  oldSave();
  expect(p.onChooseRental).toHaveBeenCalledOnce();
  expect(save).not.toHaveBeenCalled();
});

async function withPlace(title = "Dinner with Friends", location: string | null = null) {
  const p = props(),
    value = { ...fields(), title, startDate: "2027-02-08", location };
  const repo = {
    createDraft: vi.fn(async () => ({
      mode: "CREATE",
      itemId: "00000000-0000-4000-8000-000000000011",
      fields: value,
      participantOptions: [],
    })),
    save: vi.fn(async () => ({
      localStatus: "PENDING",
      itemId: "00000000-0000-4000-8000-000000000011",
    })),
  };
  await open(p, repo);
  return { p, repo };
}
const placeResult = (usePlaceName = false) => ({
  kind: "SELECTED",
  place: {
    provider: "apple",
    title: "Sky Tower",
    address: "Victoria Street West, Auckland",
    handle: "opaque",
    kind: "mapItem",
    sessionId: "session",
    generation: 1,
  },
  usePlaceName,
});
async function search(p: ReturnType<typeof props>, label = "tripCreate.findPlace") {
  if (label === "placeSearch.searchLocation") node("tripCreate.planLocation").onFocus();
  else node(label).onPress();
  await Promise.resolve();
  await Promise.resolve();
  render(p);
  return state.nodes.find((n) => n.placeSearch)!.placeSearch;
}
it("P1 searches authored Name but always fills only Location using immediate selection", async () => {
  const { p, repo } = await withPlace();
  const sheet = await search(p);
  expect(sheet.initialQuery).toBe("Dinner with Friends");
  expect(sheet.nameChoice).toBe(false);
  expect(sheet.selectionMode).toBe("immediate");
  sheet.onConfirm(placeResult());
  render(p);
  expect(node("tripCreate.planName").value).toBe("Dinner with Friends");
  expect(node("tripCreate.planLocation").value).toBe("Victoria Street West, Auckland");
  node("ui.save").onPress();
  await Promise.resolve();
  expect(repo.save).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({
      title: "Dinner with Friends",
      location: "Victoria Street West, Auckland",
    }),
  );
});
it("P1 location search and cancel preserve Name and all existing fields", async () => {
  const { p } = await withPlace("Original activity", "Original address");
  const sheet = await search(p, "placeSearch.searchLocation");
  expect(sheet.initialQuery).toBe("Original address");
  expect(sheet.nameChoice).toBe(false);
  sheet.onCancel();
  render(p);
  expect(node("tripCreate.planName").value).toBe("Original activity");
  expect(node("tripCreate.planLocation").value).toBe("Original address");
  sheet.onConfirm(placeResult(true));
  render(p);
  expect(node("tripCreate.planLocation").value).toBe("Original address");
});
it("P1 replaces Location on explicit candidate selection, never Name, and rejects stale callbacks", async () => {
  const { p } = await withPlace("Original activity", "Existing confirmed address");
  const sheet = await search(p);
  sheet.onConfirm(placeResult(true));
  render(p);
  expect(state.alert).not.toHaveBeenCalled();
  expect(node("tripCreate.planName").value).toBe("Original activity");
  expect(node("tripCreate.planLocation").value).toBe("Victoria Street West, Auckland");
  sheet.onConfirm({ kind: "MANUAL", text: "stale address" });
  render(p);
  expect(node("tripCreate.planLocation").value).toBe("Victoria Street West, Auckland");
});

it("manual Find a Place preserves existing Name; manual Location remains a real save value", async () => {
  const { p } = await withPlace();
  let sheet = await search(p);
  sheet.onConfirm({ kind: "MANUAL", text: "Changed search only" });
  render(p);
  expect(node("tripCreate.planName").value).toBe("Dinner with Friends");
  sheet = await search(p, "placeSearch.searchLocation");
  sheet.onConfirm({ kind: "MANUAL", text: "42 Offline Road" });
  render(p);
  expect(node("tripCreate.planLocation").value).toBe("42 Offline Road");
});

it("selected P1 location saves through the existing same-ID Edit writer without changing dates or participants", async () => {
  const p0 = props(),
    value = { ...fields(), title: "Existing activity", startDate: "2027-02-08" };
  const draft = {
    mode: "EDIT",
    itemId: "00000000-0000-4000-8000-000000000011",
    fields: value,
    participantOptions: [],
  };
  const repo = {
    save: vi.fn(async () => ({ localStatus: "PENDING", itemId: draft.itemId })),
  };
  const p = { ...p0, itemId: draft.itemId, opened: { repository: repo, draft } };
  await open(p, repo);
  const sheet = await search(p, "placeSearch.searchLocation");
  sheet.onConfirm(placeResult());
  render(p);
  node("ui.save").onPress();
  await Promise.resolve();
  expect(repo.save).toHaveBeenCalledWith(
    draft,
    expect.objectContaining({
      title: value.title,
      startDate: value.startDate,
      participation: value.participation,
      location: "Victoria Street West, Auckland",
    }),
  );
  expect(p.onSaved).toHaveBeenCalledWith(draft.itemId);
});

it("keeps button taps handled while the P1 Name keyboard is open", async () => {
  const { p } = await withPlace();
  expect(
    state.nodes.find((entry) => entry.scrollView)?.scrollView.keyboardShouldPersistTaps,
  ).toBe("handled");
  const sheet = await search(p);
  expect(sheet.initialQuery).toBe("Dinner with Friends");
});

it("prefills a new P1 date and advisory start time and saves the authored value", async () => {
  const p = { ...props(), initialDate: "2027-01-16", initialStartTime: "12:30" };
  const draft = {
    mode: "CREATE",
    itemId: "new-plan",
    fields: fields(),
    participantOptions: [],
  };
  const repo = {
    createDraft: vi.fn(async () => draft),
    save: vi.fn(async () => ({
      itemId: "new-plan",
      localStatus: "PENDING",
      operationIds: [],
    })),
  };
  await open(p, repo);
  expect(node("tripCreate.itemDate").value.start).toBe("2027-01-16");
  node("tripCreate.planName").onChangeText("Lunch");
  render(p);
  node("ui.save").onPress();
  await Promise.resolve();
  expect(repo.save).toHaveBeenCalledWith(
    draft,
    expect.objectContaining({ startTime: "12:30", startDate: "2027-01-16" }),
  );
  expect(draft.fields.startTime).toBeNull();
});

it("never applies insertion defaults over an existing P1 edit", async () => {
  const p = {
    ...props(),
    itemId: "existing",
    initialDate: "2027-01-16",
    initialStartTime: "12:30",
  };
  const original = {
    ...fields(),
    title: "Existing",
    startDate: "2027-02-08",
    startTime: "09:15",
  };
  await open(p, {
    read: vi.fn(async () => ({
      mode: "EDIT",
      itemId: "existing",
      fields: original,
      participantOptions: [],
    })),
  });
  expect(node("tripCreate.itemDate").value.start).toBe("2027-02-08");
  expect(state.hooks.some((value: any) => value?.startTime === "09:15")).toBe(true);
});

vi.mock("@/data/auth/localTripAccess", async () => ({
  readLocalTripPrincipal: vi.fn(async () => ({
    kind: "ACCOUNT",
    accountId: "test-account",
  })),
  ...(await import("@/data/repositories/manualPlanRepository")),
  kickLocalTripSync: vi.fn(async () => {}),
}));

function liveInventory() {
  const inventory = createGuestP1DraftInventory(async (scope) => {
    if (scope.generation !== state.generation) throw Error("GUEST_SCOPE_CHANGED");
  });
  state.draftParticipants.forEach((participant) => inventory.register(participant));
  return inventory;
}
const guestScope = () => ({
  kind: "GUEST" as const,
  localId: "00000000-0000-4000-8000-000000000088",
  generation: state.generation,
});

it("freezes actual typed P1 fields, rejects queued Save/Discard, and resumes the same original draft without saving", async () => {
  const { p, repo } = await withPlace("Original title");
  node("tripCreate.planName").onChangeText("输入尚未保存");
  render(p);
  const oldChange = node("tripCreate.planName").onChangeText;
  const oldSave = node("ui.save").onPress;
  node("common.cancel").onPress();
  const oldDiscard = state.alert.mock.lastCall![2][1].onPress;
  const lease = await liveInventory().freeze(guestScope());
  const snapshot = JSON.parse(lease.entries[0].canonicalText);
  expect(snapshot.fields.title).toBe("输入尚未保存");
  expect(snapshot.initialFields.title).toBe("Original title");
  oldChange("Late edit");
  oldSave();
  oldDiscard();
  render(p);
  expect(node("tripCreate.planName").value).toBe("输入尚未保存");
  expect(node("ui.save").disabled).toBe(true);
  expect(repo.save).not.toHaveBeenCalled();
  expect(p.onClose).not.toHaveBeenCalled();
  await lease.resume();
  render(p);
  node("tripCreate.planName").onChangeText("Resumed title");
  render(p);
  node("ui.save").onPress();
  await Promise.resolve();
  expect(repo.save).toHaveBeenCalledWith(
    expect.objectContaining({ itemId: snapshot.itemId }),
    expect.objectContaining({ title: "Resumed title" }),
  );
});

it("keeps unresolved P1 Save attempts out of adoption without unfreezing their retry contract", async () => {
  const { p, repo } = await withPlace();
  repo.save.mockRejectedValue(new Error("NETWORK_UNKNOWN"));
  node("ui.save").onPress();
  await Promise.resolve();
  render(p);
  await expect(liveInventory().freeze(guestScope())).rejects.toThrow(
    "GUEST_P1_DRAFT_NOT_READY",
  );
  expect(repo.save).toHaveBeenCalledOnce();
  expect(node("tripCreate.planName").editable).toBe(false);
  expect(p.onClose).not.toHaveBeenCalled();
});

it("preserves open Place selection and only snapshots after its explicit cancellation", async () => {
  const { p, repo } = await withPlace("Original", "Original address");
  const sheet = await search(p);
  await expect(liveInventory().freeze(guestScope())).rejects.toThrow(
    "GUEST_P1_DRAFT_NOT_READY",
  );
  expect(repo.save).not.toHaveBeenCalled();
  sheet.onCancel();
  render(p);
  const lease = await liveInventory().freeze(guestScope());
  await lease.resume();
  sheet.onConfirm(placeResult());
  render(p);
  expect(node("tripCreate.planLocation").value).toBe("Original address");
});

it.each(["account change", "unmount"])(
  "invalidates the P1 snapshot on %s and rejects its old Save callback",
  async (reason) => {
    const p = props();
    const draft = {
      mode: "CREATE",
      itemId: "00000000-0000-4000-8000-000000000011",
      fields: { ...fields(), title: "Keep draft", startDate: "2027-02-08" },
      participantOptions: [],
    };
    const repo = { createDraft: vi.fn(async () => draft), save: vi.fn() };
    const cleanup = await open(p, repo);
    const oldSave = node("ui.save").onPress;
    const oldChange = node("tripCreate.planName").onChangeText;
    const lease = await liveInventory().freeze(guestScope());
    if (reason === "unmount") cleanup();
    else state.generation++;
    await expect(lease.assertCurrent()).rejects.toThrow();
    await expect(lease.resume()).rejects.toThrow();
    oldChange("Late old-identity change");
    oldSave();
    if (reason === "account change") {
      render(p);
      expect(node("tripCreate.planName").editable).toBe(true);
      expect(node("tripCreate.planName").value).toBe("Keep draft");
      node("tripCreate.planName").onChangeText("New-generation stale-source edit");
      node("ui.save").onPress();
      render(p);
      expect(node("tripCreate.planName").value).toBe("Keep draft");
    }
    expect(repo.save).not.toHaveBeenCalled();
    expect(p.onClose).not.toHaveBeenCalled();
  },
);

it.each(["tripCreate.startTime", "tripCreate.endTime"])(
  "blocks P1 handoff while the unconfirmed %s picker is open",
  async (label) => {
    const { p, repo } = await withPlace();
    const oldOpen = node(label).onPress;
    oldOpen();
    const inventory = liveInventory();
    await expect(inventory.freeze(guestScope())).rejects.toThrow(
      "GUEST_P1_DRAFT_NOT_READY",
    );
    render(p);
    state.nodes.find((entry) => entry.header?.title === label)!.header.onLeft();
    const lease = await inventory.freeze(guestScope());
    oldOpen();
    await lease.assertCurrent();
    expect(JSON.parse(lease.entries[0].canonicalText).fields).toMatchObject({
      startTime: null,
      endTime: null,
    });
    expect(repo.save).not.toHaveBeenCalled();
    await lease.resume();
  },
);
it("blocks unconfirmed P1 range selection and rejects late range opening after freeze", async () => {
  await withPlace();
  const calendar = node("tripCreate.itemDate");
  expect(calendar.onOpenChange(true)).toBe(true);
  const inventory = liveInventory();
  await expect(inventory.freeze(guestScope())).rejects.toThrow(
    "GUEST_P1_DRAFT_NOT_READY",
  );
  calendar.onOpenChange(false);
  const lease = await inventory.freeze(guestScope());
  expect(calendar.onOpenChange(true)).toBe(false);
  await lease.assertCurrent();
  await lease.resume();
});

it("renders a restored Create through opened and retains its original dirty baseline for the next freeze", async () => {
  const baseline = fields();
  const draft = {
    mode: "CREATE",
    itemId: "00000000-0000-4000-8000-000000000089",
    fields: { ...baseline, title: "  恢复中  ", startDate: "2027-" },
    initialFields: baseline,
    participantOptions: [],
  };
  const repository = { save: vi.fn() };
  const p = { ...props(), opened: { repository, draft } };
  await open(p, repository);
  expect(node("tripCreate.planName").value).toBe("  恢复中  ");
  node("common.cancel").onPress();
  expect(state.alert).toHaveBeenCalled();
  expect(p.onClose).not.toHaveBeenCalled();
  const lease = await liveInventory().freeze(guestScope());
  const snapshot = JSON.parse(lease.entries[0].canonicalText);
  expect(snapshot.itemId).toBe(draft.itemId);
  expect(snapshot.fields).toEqual(draft.fields);
  expect(snapshot.initialFields).toEqual(baseline);
  expect(repository.save).not.toHaveBeenCalled();
  await lease.resume();
});
