import { Children, isValidElement, type ReactNode } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { fixture, sha256 } from "@/data/repositories/__fixtures__/captureBatchAssessment";
import {
  createCaptureSubmissionRepository,
  createCaptureSubmissionTransactionStore,
} from "@/data/repositories/captureSubmissionRepository";
import { createUpdatesInboxRepository } from "@/data/repositories/updatesInboxRepository";
import { captureAccountRequestContext } from "@/data/auth/accountRequestContext";
import {
  getAccountGeneration,
  advanceAccountGeneration,
} from "@/data/auth/accountGeneration";
import { randomUUID } from "node:crypto";
import { UpdatesInboxScreen, updatesNoticeTime } from "./UpdatesInboxScreen";
import { setUiLocale, t } from "@/ui/locale";

const s = vi.hoisted(() => ({
  slots: [] as any[],
  cursor: 0,
  queued: [] as (() => void)[],
  open: vi.fn(),
  push: vi.fn(),
  trip: null as any,
}));
const same = (a: any[], b: any[]) =>
  a?.length === b.length && a.every((value, i) => Object.is(value, b[i]));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useSyncExternalStore: (_: unknown, snapshot: () => unknown) => snapshot(),
  useState: (initial: any) => {
    const i = s.cursor++;
    s.slots[i] ??= { value: typeof initial === "function" ? initial() : initial };
    return [
      s.slots[i].value,
      (next: any) => {
        s.slots[i].value = typeof next === "function" ? next(s.slots[i].value) : next;
      },
    ];
  },
  useRef: (initial: any) => {
    const i = s.cursor++;
    return (s.slots[i] ??= { current: initial });
  },
  useMemo: (make: () => any, deps: any[]) => {
    const i = s.cursor++;
    if (!s.slots[i] || !same(s.slots[i].deps, deps)) s.slots[i] = { value: make(), deps };
    return s.slots[i].value;
  },
  useCallback: (value: any, deps: any[]) => {
    const i = s.cursor++;
    if (!s.slots[i] || !same(s.slots[i].deps, deps)) s.slots[i] = { value, deps };
    return s.slots[i].value;
  },
  useLayoutEffect: (callback: () => any, deps: any[]) => {
    const i = s.cursor++;
    if (!s.slots[i] || !same(s.slots[i].deps, deps)) {
      s.slots[i]?.cleanup?.();
      s.slots[i] = { deps, cleanup: callback() };
    }
  },
}));
vi.mock("expo-router", () => ({
  router: { push: s.push },
  useFocusEffect: (callback: () => any) => {
    const i = s.cursor++;
    if (s.slots[i]?.callback !== callback) {
      s.slots[i]?.cleanup?.();
      s.slots[i] = { callback };
      s.queued.push(() => {
        s.slots[i].cleanup = callback();
      });
    }
  },
}));
vi.mock("react-native", () => ({
  View: "View",
  ScrollView: "Scroll",
  Pressable: "Row",
  StyleSheet: { create: (value: any) => value, hairlineWidth: 1 },
}));
vi.mock("react-native-safe-area-context", () => ({ SafeAreaView: "Safe" }));
vi.mock("@/components/AppIcon", () => ({ AppIcon: "Icon" }));
vi.mock("@/ui/controls", () => ({ UiButton: "Button", UiText: "Text" }));
vi.mock("@/ui/forms", () => ({ UiChoiceChip: "Chip", UiTextInput: "Input" }));
vi.mock("@/ui/theme", () => ({ useThemedStyles: () => ({}), useUiTheme: () => ({}) }));
vi.mock("@/features/day-feed/TripViewContext", () => ({
  useTripView: () => ({ workingTrip: s.trip }),
}));
vi.mock("@/data/operations/defaultUpdatesInbox", () => ({
  openDefaultUpdatesInbox: () => s.open(),
}));

let key: string | null = null;
function render(): any {
  const outer = UpdatesInboxScreen();
  if (String(outer.key) !== key) {
    s.slots.forEach((slot) => slot?.cleanup?.());
    s.slots = [];
    s.queued = [];
    key = String(outer.key);
  }
  s.cursor = 0;
  const Content = outer.type as (props: any) => ReactNode;
  const node = Content(outer.props);
  s.queued.splice(0).forEach((effect) => effect());
  return node;
}
const flush = async () => {
  for (let i = 0; i < 60; i++) await Promise.resolve();
};
function nodes(node: ReactNode, type: string): any[] {
  if (!isValidElement(node)) return [];
  return [
    ...(node.type === type ? [node.props] : []),
    ...Children.toArray((node.props as any).children).flatMap((child) =>
      nodes(child, type),
    ),
  ];
}
const button = (node: ReactNode, label: string) =>
  nodes(node, "Button").find((props) => props.label === label)!;
beforeEach(() => {
  s.slots.forEach((slot) => slot?.cleanup?.());
  s.slots = [];
  s.cursor = 0;
  s.queued = [];
  key = null;
  s.open.mockReset();
  s.push.mockReset();
  s.trip = { tripId: randomUUID(), generation: getAccountGeneration() };
  setUiLocale("en");
});
async function setup(withFailure = true) {
  const f = fixture(),
    deps = { sha256, now: () => "2026-10-15T04:25:36.000Z", newId: randomUUID };
  const submissions = createCaptureSubmissionRepository(f.db, f.getAccount, deps);
  const source = createCaptureSubmissionTransactionStore(f.db, deps);
  const repository = createUpdatesInboxRepository(f.db, f.getAccount, source);
  const request = f.request();
  if (withFailure)
    await submissions.submit(
      request,
      new Map([[request.inputs[0].id, async () => ({ text: "" })]]),
    );
  const context = await captureAccountRequestContext("", f.getAccount);
  s.open.mockResolvedValue({ context, repository });
  render();
  await flush();
  return { f, submissions, source, repository, context, request };
}
it("loads actual owning personal notices without marking read and formats persisted seconds", async () => {
  const data = await setup();
  const node = render();
  expect(nodes(node, "Row")).toHaveLength(1);
  expect(
    nodes(node, "Text").some((props) => props.children === t("updates.personalCapture")),
  ).toBe(true);
  expect(
    nodes(node, "Text").some(
      (props) => props.children === updatesNoticeTime("2026-10-15T04:25:36.000Z"),
    ),
  ).toBe(true);
  expect(updatesNoticeTime("2026-10-15T04:25:36Z")).not.toBe(
    updatesNoticeTime("2026-10-15T04:25:37Z"),
  );
  expect(
    (
      await data.repository.list(
        { category: "ALL", unreadOnly: false, query: "", currentTripId: null },
        data.context,
      )
    ).cards[0].unread,
  ).toBe(true);
});
it("query/category/unread Mark All passes the exact current filter and never resolves C3", async () => {
  const data = await setup(),
    before = await data.submissions.reopen(data.request.jobId);
  const mark = vi.spyOn(data.repository, "markAllRead");
  nodes(render(), "Chip")
    .find((props) => props.label === t("updates.category.NEEDS_ATTENTION"))!
    .onPress();
  render();
  await flush();
  nodes(render(), "Chip")
    .find((props) => props.label === t("updates.unreadOnly"))!
    .onPress();
  render();
  await flush();
  nodes(render(), "Input")[0].onChangeText("EMPTY_PAYLOAD");
  render();
  await flush();
  const target = button(render(), t("updates.markAll"));
  expect(target.disabled).toBe(false);
  target.onPress();
  await flush();
  render();
  await flush();
  expect(mark).toHaveBeenCalledWith(
    {
      category: "NEEDS_ATTENTION",
      unreadOnly: true,
      query: "EMPTY_PAYLOAD",
      currentTripId: s.trip.tripId,
    },
    data.context,
    { presentationText: expect.any(Function) },
  );
  expect(await data.submissions.reopen(data.request.jobId)).toEqual(before);
  expect(button(render(), t("updates.markAll")).disabled).toBe(true);
});
it("card opens the normal same Job with a bounded Updates return origin, preserving filters and Trip", async () => {
  const data = await setup(),
    trip = s.trip;
  nodes(render(), "Input")[0].onChangeText("capture");
  render();
  await flush();
  nodes(render(), "Row")[0].onPress();
  await flush();
  expect(s.push).toHaveBeenCalledWith({
    pathname: "/capture",
    params: {
      jobId: data.request.jobId,
      origin: "UPDATES",
      originGeneration: String(data.context.generation),
    },
  });
  expect(s.trip).toBe(trip);
  expect(nodes(render(), "Input")[0].value).toBe("capture");
});
it("an old A→B→A filter intent cannot navigate after its awaited owning open", async () => {
  const data = await setup();
  const original = data.repository.open.bind(data.repository);
  let release!: () => void;
  vi.spyOn(data.repository, "open").mockImplementation(async (...args) => {
    const result = await original(...args);
    await new Promise<void>((done) => {
      release = done;
    });
    return result;
  });
  nodes(render(), "Row")[0].onPress();
  await flush();
  nodes(render(), "Input")[0].onChangeText("other");
  render();
  await flush();
  nodes(render(), "Input")[0].onChangeText("");
  render();
  await flush();
  release();
  await flush();
  expect(s.push).not.toHaveBeenCalled();
  expect(button(render(), t("updates.refresh")).disabled).toBe(false);
});
it("Account generation drift denies awaited navigation and removes the old account rows", async () => {
  const data = await setup();
  const original = data.repository.open.bind(data.repository);
  vi.spyOn(data.repository, "open").mockImplementation(async (...args) => {
    const result = await original(...args);
    advanceAccountGeneration();
    return result;
  });
  nodes(render(), "Row")[0].onPress();
  await flush();
  expect(s.push).not.toHaveBeenCalled();
  s.open.mockRejectedValue(new Error("not current"));
  render();
  await flush();
  expect(nodes(render(), "Row")).toHaveLength(0);
});
it("zero unread retains a disabled action, and unavailable source never becomes a completed result", async () => {
  await setup(false);
  const node = render();
  expect(button(node, t("updates.markAll")).disabled).toBe(true);
  expect(
    nodes(node, "Text").some((props) => props.children === t("updates.coverage")),
  ).toBe(true);
  for (const locale of ["en", "zh-Hans"] as const) {
    setUiLocale(locale);
    expect(button(render(), t("updates.markAll")).disabled).toBe(true);
  }
});

it("failed current owning revalidation disables an unavailable card and exposes no false completed outcome", async () => {
  const data = await setup();
  vi.spyOn(data.source, "load").mockRejectedValue(
    new Error("current source unavailable"),
  );
  button(render(), t("updates.refresh")).onPress();
  await flush();
  const node = render();
  expect(nodes(node, "Row")[0].disabled).toBe(true);
  expect(button(node, t("updates.markAll")).disabled).toBe(true);
  expect(
    nodes(node, "Text").some(
      (props) => props.children === t("updates.state.UNAVAILABLE"),
    ),
  ).toBe(true);
  expect(s.push).not.toHaveBeenCalled();
});

it("reviewer: an old Mark All handler cannot mark its former category/query after a new filter commits", async () => {
  const data = await setup();
  const old = button(render(), t("updates.markAll"));
  expect(old.disabled).toBe(false);
  nodes(render(), "Input")[0].onChangeText("no-matching-notice");
  render();
  await flush();
  expect(button(render(), t("updates.markAll")).disabled).toBe(true);
  old.onPress();
  await flush();
  expect(
    (
      await data.repository.list(
        { category: "ALL", unreadOnly: false, query: "", currentTripId: null },
        data.context,
      )
    ).cards[0].unread,
  ).toBe(true);
});
it.each(["en", "zh-Hans"] as const)(
  "reviewer: localized visible card title is searchable in %s",
  async (locale) => {
    await setup();
    setUiLocale(locale);
    render();
    await flush();
    expect(nodes(render(), "Row")).toHaveLength(1);
    nodes(render(), "Input")[0].onChangeText(t("updates.needsInput", { count: 1 }));
    render();
    await flush();
    expect(nodes(render(), "Row")).toHaveLength(1);
  },
);
it.each(["en", "zh-Hans"] as const)(
  "localized title query Mark All preserves nonmatching batches in %s",
  async (locale) => {
    const data = await setup();
    const second = data.f.request(2);
    await data.submissions.submit(
      second,
      new Map(second.inputs.map((input) => [input.id, async () => ({ text: "" })])),
    );
    setUiLocale(locale);
    render();
    await flush();
    nodes(render(), "Input")[0].onChangeText(t("updates.needsInput", { count: 1 }));
    render();
    await flush();
    expect(nodes(render(), "Row")).toHaveLength(1);
    button(render(), t("updates.markAll")).onPress();
    await flush();
    const unread = await data.repository.list(
      { category: "ALL", unreadOnly: true, query: "", currentTripId: null },
      data.context,
    );
    expect(unread.cards.map((card) => card.jobId)).toEqual([second.jobId]);
  },
);

it("reviewer: stale Refresh cannot invalidate the current matching filter or leave it permanently loading", async () => {
  const data = await setup();
  const oldRefresh = button(render(), t("updates.refresh"));
  nodes(render(), "Input")[0].onChangeText("EMPTY_PAYLOAD");
  render();
  await flush();
  expect(button(render(), t("updates.markAll")).disabled).toBe(false);
  const list = vi.spyOn(data.repository, "list");
  oldRefresh.onPress();
  await flush();
  expect(list).not.toHaveBeenCalled();
  expect(button(render(), t("updates.markAll")).disabled).toBe(false);
});
