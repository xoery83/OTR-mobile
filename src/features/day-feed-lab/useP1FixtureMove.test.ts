import { useP1CivilMove } from "@/features/day-feed/useP1CivilMove";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { p1FidelityFixture } from "./p1FidelityFixture";
import { itemsForLocalDate } from "@/domain/trip/dayReadModel";
import { composeDayStream } from "@/features/day-feed/composition";
import { useP1FixtureMove } from "./useP1FixtureMove";
const hooks = vi.hoisted(() => ({
  cursor: 0,
  slots: [] as any[],
  effects: [] as (() => void)[],
  scale: 1,
  geometryRegistered: false,
  offset: 0,
  appState: null as null | ((state: string) => void),
}));
vi.mock("react", async (original) => {
  const same = (a?: any[], b?: any[]) =>
    a && b && a.length === b.length && a.every((x, i) => Object.is(x, b[i]));
  return {
    ...(await original<typeof import("react")>()),
    useRef: (value: any) => {
      const i = hooks.cursor++;
      return (hooks.slots[i] ??= { value: { current: value } }).value;
    },
    useState: (value: any) => {
      const i = hooks.cursor++;
      hooks.slots[i] ??= { value };
      return [
        hooks.slots[i].value,
        (next: any) => {
          hooks.slots[i].value =
            typeof next === "function" ? next(hooks.slots[i].value) : next;
        },
      ];
    },
    useCallback: (callback: any) => {
      hooks.cursor++;
      return callback;
    },
    useEffect: (effect: () => any, deps: any[]) => {
      const i = hooks.cursor++,
        old = hooks.slots[i];
      if (!same(old?.deps, deps))
        hooks.effects.push(() => {
          old?.cleanup?.();
          hooks.slots[i] = { deps, cleanup: effect() };
        });
    },
    useLayoutEffect: (effect: () => any, deps: any[]) => {
      const i = hooks.cursor++,
        old = hooks.slots[i];
      if (!same(old?.deps, deps))
        hooks.effects.push(() => {
          old?.cleanup?.();
          hooks.slots[i] = { deps, cleanup: effect() };
        });
    },
  };
});
vi.mock("react-native", () => ({
  Modal: "modal",
  View: "view",
  StyleSheet: { absoluteFill: {}, create: (x: any) => x },
  useWindowDimensions: () => ({ width: 402, height: 874, fontScale: hooks.scale }),
  AppState: {
    addEventListener: (_: string, callback: any) => {
      hooks.appState = callback;
      return { remove: vi.fn() };
    },
  },
}));
vi.mock("@/ui/controls", () => ({ UiText: "text", UiButton: "button" }));
vi.mock("@/components/SheetHeader", () => ({ SheetHeader: "header" }));
vi.mock("@/ui/locale", () => ({ t: (key: string) => key, formatUiDate: () => "Jan16" }));
vi.mock("@/ui/useUiLocale", () => ({ useUiLocale: () => {} }));
vi.mock("@/ui/theme", () => ({ useThemedStyles: () => ({}) }));
vi.mock("@/features/day-feed/P1Row", () => ({ P1Row: () => null }));
vi.mock("./P1FixtureNowMarker", () => ({ P1FixtureNowMarker: () => null }));
const real = vi.hoisted(() => ({ generation: 5, read: vi.fn(), save: vi.fn() }));
vi.mock("@/data/auth/accountGeneration", () => ({
  getAccountGeneration: () => real.generation,
}));
vi.mock("@/data/repositories/manualPlanRepository", () => ({
  createDefaultManualPlanRepository: async () => ({ read: real.read, save: real.save }),
}));
vi.mock("@/data/repositories/manualStayRepository", () => ({
  createDefaultManualStayRepository: async () => ({ read: real.read, save: real.save }),
}));
const list = {
  current: {
    saveAnchor: vi.fn(() => null),
    scrollBy: vi.fn(),
    restoreAnchor: vi.fn(),
    jumpToDayHeader: vi.fn(),
  },
};
function render(key = "test", onFinish?: () => void) {
  hooks.cursor = 0;
  // Hook slots/effects are driven by the repository's deterministic hook harness.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const value = useP1FixtureMove(list, key, 100, 34, onFinish);
  hooks.effects.splice(0).forEach((effect) => effect());
  if (!hooks.geometryRegistered) {
    hooks.geometryRegistered = true;
    const fixture = p1FidelityFixture("future");
    const rows = composeDayStream(
      itemsForLocalDate(fixture.projection, "2027-01-16", fixture.zone),
      fixture.instant,
    ).rows;
    const positions: Record<string, number> = {
      "syn-p1-exact": 434,
      "syn-p1-afternoon": 600,
      "syn-p1-viewpoint": 720,
    };
    for (const row of rows)
      if (positions[row.item.event.id] !== undefined) {
        const top = positions[row.item.event.id];
        value.register(
          {
            measureInWindow: (callback: any) => callback(21, top - hooks.offset, 360, 80),
          } as any,
          "2027-01-16",
          row.key,
        );
        const boundary = row.item.event.boundaries.find((b) => b.role === "START");
        if (boundary?.local_time)
          value.register(
            {
              measureInWindow: (callback: any) =>
                callback(21, top + 6 - hooks.offset, 60, 20),
            } as any,
            "2027-01-16",
            `${row.key}:PRIMARY`,
            Number(boundary.local_time.slice(0, 2)) * 60 +
              Number(boundary.local_time.slice(3, 5)),
          );
        const end = row.item.event.boundaries.find(
          (b) => b.role === "END" && b.local_date === "2027-01-16",
        );
        if (end?.local_time)
          value.register(
            {
              measureInWindow: (callback: any) =>
                callback(21, top + 31 - hooks.offset, 60, 20),
            } as any,
            "2027-01-16",
            `${row.key}:SECONDARY`,
            Number(end.local_time.slice(0, 2)) * 60 + Number(end.local_time.slice(3, 5)),
          );
      }
    value.register(
      {
        measureInWindow: (callback: any) => callback(21, 900 - hooks.offset, 360, 80),
      } as any,
      "2027-01-17",
      "day:2027-01-17",
    );
  }
  return value;
}
const touch = (x: number, y: number, count = 1) =>
  ({
    nativeEvent: {
      pageX: x,
      pageY: y,
      touches: Array.from({ length: count }, () => ({})),
    },
  }) as any;
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("requestAnimationFrame", (callback: (now: number) => void) =>
    setTimeout(() => callback(Date.now()), 16),
  );
  vi.stubGlobal("cancelAnimationFrame", (id: ReturnType<typeof setTimeout>) =>
    clearTimeout(id),
  );
  hooks.cursor = 0;
  hooks.slots = [];
  hooks.effects = [];
  hooks.appState = null;
  hooks.scale = 1;
  hooks.geometryRegistered = false;
  hooks.offset = 0;
  list.current.scrollBy.mockImplementation((delta: number) => {
    hooks.offset += delta;
    return true;
  });
  list.current.scrollBy.mockClear();
  list.current.restoreAnchor.mockClear();
  vi.spyOn(console, "info").mockImplementation(() => {});
});
afterEach(() => {
  hooks.slots.forEach((slot) => slot?.cleanup?.());
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it("ordinary feed release/cancellation never invokes move-finish chrome restoration", () => {
  const finished = vi.fn();
  let move = render("test", finished);
  move.touchHandlers.onTouchEnd(touch(200, 450, 0));
  move.touchHandlers.onTouchCancel();
  move.touchHandlers.onResponderRelease();
  hooks.appState?.("inactive");
  expect(finished).not.toHaveBeenCalled();
  move.handlers.start("syn-p1-exact", { x: 200, y: 450 });
  move = render("test", finished);
  move.touchHandlers.onResponderRelease();
  move.touchHandlers.onTouchEnd(touch(200, 450, 0));
  move.touchHandlers.onTouchCancel();
  expect(finished).toHaveBeenCalledTimes(1);
  move.handlers.start("syn-p1-exact", { x: 200, y: 450 });
  move = render("test", finished);
  move.touchHandlers.onTouchCancel();
  move.touchHandlers.onTouchEnd(touch(200, 450, 0));
  expect(finished).toHaveBeenCalledTimes(2);
});
it("stationary hold/release ends immediately without confirmation or a running timer", () => {
  let move = render();
  move.handlers.start("syn-p1-exact", { x: 200, y: 450 });
  move = render();
  expect(move.active).toBe(true);
  move.touchHandlers.onTouchEnd(touch(200, 450, 0));
  move = render();
  expect(move.active).toBe(false);
  expect((move.confirmation as any).props.visible).toBe(false);
  expect(vi.getTimerCount()).toBe(0);
});
it("host receives move and release after pickup row callbacks have been discarded", () => {
  let move = render();
  move.handlers.start("syn-p1-exact", { x: 200, y: 450 });
  move = render();
  move.touchHandlers.onTouchMove(touch(200, 540));
  vi.advanceTimersByTime(1000);
  move.touchHandlers.onTouchEnd(touch(200, 540, 0));
  move = render();
  expect(move.active).toBe(false);
  expect((move.confirmation as any).props.visible).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
  expect(move.previews).toEqual({});
});
it("touch cancellation and app interruption cancel without confirming", () => {
  let move = render();
  move.handlers.start("syn-p1-exact", { x: 200, y: 450 });
  move = render();
  move.touchHandlers.onTouchCancel();
  move = render();
  expect(move.active).toBe(false);
  move.handlers.start("syn-p1-exact", { x: 200, y: 450 });
  move = render();
  hooks.appState?.("inactive");
  move = render();
  expect(move.active).toBe(false);
  expect((move.confirmation as any).props.visible).toBe(false);
});
it("horizontal precision change alone preserves an off-grid time even near screen edges", () => {
  let move = render();
  move.handlers.start("syn-p1-hills", { x: 200, y: 120 });
  move = render();
  move.touchHandlers.onTouchMove(touch(80, 120));
  vi.advanceTimersByTime(1000);
  move.touchHandlers.onTouchEnd(touch(80, 120, 0));
  move = render();
  expect(move.active).toBe(false);
  expect((move.confirmation as any).props.visible).toBe(false);
  expect(list.current.scrollBy).not.toHaveBeenCalled();
});

it("second finger cancels at touch-down and cannot take over the pickup", () => {
  let move = render();
  move.handlers.start("syn-p1-exact", { x: 200, y: 450 });
  move = render();
  move.touchHandlers.onTouchStart(touch(210, 460, 2));
  move.touchHandlers.onTouchEnd(touch(200, 450, 1));
  move.touchHandlers.onTouchMove(touch(210, 600, 1));
  vi.advanceTimersByTime(1000);
  move.touchHandlers.onTouchEnd(touch(210, 600, 0));
  move = render();
  expect(move.active).toBe(false);
  expect((move.confirmation as any).props.visible).toBe(false);
  expect(move.previews).toEqual({});
  expect(vi.getTimerCount()).toBe(0);
});

it("new cursor crosses midnight, releases to preview, and confirmation is in-memory only", () => {
  let move = render();
  move.handlers.start("syn-p1-exact", { x: 380, y: 250 });
  move = render();
  move.touchHandlers.onTouchMove(touch(380, 800));
  vi.advanceTimersByTime(13000);
  move.touchHandlers.onTouchEnd(touch(380, 800, 0));
  move = render();
  const modal = move.confirmation as any;
  expect(modal.props.visible).toBe(true);
  const body = modal.props.children.props.children.props.children;
  const header = body[0];
  header.props.onRight();
  move = render();
  expect(move.previews["syn-p1-exact"].date).toBe("2027-01-17");
  expect((move.confirmation as any).props.visible).toBe(false);
});

it.each(["cancel", "scene", "pickup"])(
  "stale Confirm cannot apply after %s",
  (action) => {
    let move = render();
    move.handlers.start("syn-p1-exact", { x: 200, y: 450 });
    move = render();
    move.touchHandlers.onTouchMove(touch(200, 600));
    vi.advanceTimersByTime(1500);
    move.touchHandlers.onTouchEnd(touch(200, 600, 0));
    move = render();
    const header = (move.confirmation as any).props.children.props.children.props
      .children[0];
    expect(header.props.rightDisabled).toBe(false);
    const retained = header.props.onRight;
    if (action === "cancel") header.props.onLeft();
    if (action === "scene") move = render("new-scene");
    if (action === "pickup") move.handlers.start("syn-p1-hills", { x: 200, y: 450 });
    retained();
    move = render(action === "scene" ? "new-scene" : "test");
    expect(move.previews).toEqual({});
  },
);

it("host claims the responder only after pickup and releases without the recycled row", () => {
  let move = render();
  expect(move.touchHandlers.onMoveShouldSetResponderCapture()).toBe(false);
  move.handlers.start("syn-p1-exact", { x: 200, y: 450 });
  move = render();
  expect(move.touchHandlers.onMoveShouldSetResponderCapture()).toBe(true);
  move.touchHandlers.onResponderMove(touch(200, 600));
  vi.advanceTimersByTime(1500);
  move.touchHandlers.onResponderRelease();
  move = render();
  expect(move.active).toBe(false);
  expect((move.confirmation as any).props.visible).toBe(true);
  expect(move.touchHandlers.onMoveShouldSetResponderCapture()).toBe(false);
});

it("keeps the line at the finger despite different measured gaps and never restores an anchor", async () => {
  let move = render();
  move.handlers.start("syn-p1-exact", { x: 200, y: 450 });
  move = render();
  const walk = (value: any): any[] =>
    !value
      ? []
      : Array.isArray(value)
        ? value.flatMap(walk)
        : typeof value === "object"
          ? [value, ...walk(value.props?.children)]
          : [];
  const line = () =>
    walk(move.overlay).find((node) => node.props?.testID === "p1-move-insertion");
  expect(line().props.style[1].top).toBe(450);
  move.touchHandlers.onTouchMove(touch(200, 500));
  vi.advanceTimersByTime(1500);
  move = render();
  expect(line().props.style[1].top).toBe(500);
  expect(list.current.restoreAnchor).not.toHaveBeenCalled();
  expect(list.current.scrollBy).not.toHaveBeenCalled();
  move.handlers.cancel();
});
it("keeps larger text within the usable viewport without inserting row padding", () => {
  hooks.scale = 3;
  let move = render();
  move.handlers.start("syn-p1-exact", { x: 200, y: 110 });
  move = render();
  expect("regionStyle" in move).toBe(false);
  const walk = (value: any): any[] =>
    !value
      ? []
      : Array.isArray(value)
        ? value.flatMap(walk)
        : typeof value === "object"
          ? [value, ...walk(value.props?.children)]
          : [];
  const line = walk(move.overlay).find(
    (node) => node.props?.testID === "p1-move-insertion",
  );
  expect(line.props.style[1].top).toBeGreaterThanOrEqual(248);
  move.handlers.cancel();
});
it("confirmation explicitly labels original and destination without a date-only action", () => {
  let move = render();
  move.handlers.start("syn-p1-exact", { x: 200, y: 450 });
  move = render();
  move.touchHandlers.onTouchMove(touch(200, 600));
  vi.advanceTimersByTime(1500);
  move.touchHandlers.onTouchEnd(touch(200, 600, 0));
  move = render();
  const walk = (value: any): any[] =>
    !value
      ? []
      : Array.isArray(value)
        ? value.flatMap(walk)
        : typeof value === "object"
          ? [value, ...walk(value.props?.children)]
          : [];
  const nodes = walk(move.confirmation);
  expect(nodes.some((node) => node.props?.children === "fidelity.moveFrom")).toBe(true);
  expect(nodes.some((node) => node.props?.children === "fidelity.moveTo")).toBe(true);
  expect(nodes.some((node) => node.props?.label === "fidelity.moveDateOnly")).toBe(false);
});

it("middle drag holds the feed still; edge scrolling stops as soon as finger returns", () => {
  let move = render();
  move.handlers.start("syn-p1-exact", { x: 200, y: 450 });
  move = render();
  move.touchHandlers.onTouchMove(touch(200, 500));
  vi.advanceTimersByTime(1000);
  expect(list.current.scrollBy).not.toHaveBeenCalled();
  move.touchHandlers.onTouchMove(touch(200, 800));
  vi.advanceTimersByTime(700);
  expect(list.current.scrollBy).toHaveBeenCalled();
  move.touchHandlers.onTouchMove(touch(200, 500));
  vi.advanceTimersByTime(32);
  const count = list.current.scrollBy.mock.calls.length;
  vi.advanceTimersByTime(500);
  expect(list.current.scrollBy.mock.calls.length).toBe(count);
  move.handlers.cancel();
});

it("a second pickup calibrates fresh geometry after ordinary feed scrolling", () => {
  let move = render();
  move.handlers.start("syn-p1-exact", { x: 200, y: 450 });
  move = render();
  move.touchHandlers.onTouchEnd(touch(200, 450, 0));
  move = render();
  hooks.offset = 100;
  move.handlers.start("syn-p1-exact", { x: 200, y: 350 });
  move = render();
  move.touchHandlers.onTouchMove(touch(200, 360));
  vi.advanceTimersByTime(100);
  move.touchHandlers.onTouchEnd(touch(200, 360, 0));
  move = render();
  expect((move.confirmation as any).props.visible).toBe(true);
  const header = (move.confirmation as any).props.children.props.children.props
    .children[0];
  header.props.onRight();
  move = render();
  expect(move.previews["syn-p1-exact"].time).toBe("11:00");
});
it("switching precision at a settled interior position does not resnap the selected time", () => {
  let move = render();
  move.handlers.start("syn-p1-exact", { x: 200, y: 450 });
  move = render();
  move.touchHandlers.onTouchMove(touch(200, 500));
  vi.advanceTimersByTime(80);
  move.touchHandlers.onTouchMove(touch(380, 500));
  vi.advanceTimersByTime(80);
  move.touchHandlers.onTouchEnd(touch(380, 500, 0));
  move = render();
  const header = (move.confirmation as any).props.children.props.children.props
    .children[0];
  header.props.onRight();
  move = render();
  expect(move.previews["syn-p1-exact"].time).toBe("12:00");
});

it.each(["RETRY", "CANCEL_NEW"])(
  "real civil move handles a frozen draft after failure: %s",
  async (recovery) => {
    const date = "2026-10-25",
      itemId = "real-p1";
    const fields = {
      title: "Local P1",
      startDate: date,
      startTime: "10:30",
      endDate: null,
      endTime: null,
      location: "Garden",
      description: null,
      participation: { mode: "WHOLE_GROUP", personIds: [] },
    };
    const draft = { mode: "EDIT", itemId, fields, participantOptions: [] };
    real.generation = 5;
    real.read.mockReset();
    real.save.mockReset();
    real.read.mockResolvedValue({ ...draft }).mockResolvedValueOnce(draft);
    const frozen = new WeakMap<object, string>();
    let failures = 1;
    real.save.mockImplementation(async (opened, fields) => {
      const bytes = JSON.stringify(fields);
      if (frozen.has(opened) && frozen.get(opened) !== bytes)
        throw new Error("MANUAL_PLAN_DRAFT_FROZEN");
      frozen.set(opened, bytes);
      if (failures-- > 0) throw new Error("transient after attempt");
      return { itemId };
    });
    const rowKey = { itemId, projectionRole: "START", localDate: date };
    const read = {
      scope: { accountId: "account", generation: 5 },
      observed: null,
      localManual: {
        scope: { accountId: "account", tripId: "trip", generation: 5 },
        source: { fingerprint: "one" },
        items: [
          {
            itemId,
            itemRevision: 1,
            family: "P1",
            status: "planned",
            title: "Local P1",
            schedule: {
              start: { localDate: date, localTime: "10:30", comparable: false },
            },
          },
        ],
        rows: (day: string) => (day === date ? [{ rowKey, itemRef: itemId }] : []),
      },
    } as any;
    const saved = vi.fn(),
      finish = vi.fn();
    const renderReal = () => {
      hooks.cursor = 0;
      // eslint-disable-next-line react-hooks/rules-of-hooks
      const value = useP1CivilMove(
        list,
        read,
        "trip",
        5,
        [date, "2026-10-26"],
        62,
        34,
        saved,
        finish,
      );
      hooks.effects.splice(0).forEach((effect) => effect());
      return value;
    };
    let move = renderReal();
    for (let i = 0; i < 8; i++) await Promise.resolve();
    move = renderReal();
    expect(move.canMove(itemId)).toBe(true);
    for (const [key, day, y, minute] of [
      [`day:${date}`, date, 200, undefined],
      [`local:${JSON.stringify(rowKey)}`, date, 400, undefined],
      ["clock", date, 430, 630],
      ["day:2026-10-26", "2026-10-26", 800, undefined],
    ] as const)
      move.register(
        { measureInWindow: (cb: any) => cb(21, y, 360, 40) } as any,
        day,
        key,
        minute,
      );
    move.handlers.start(itemId, { x: 200, y: 430 });
    move = renderReal();
    move.handlers.change({ x: 200, y: 600 });
    move.handlers.end();
    move = renderReal();
    expect((move.confirmation as any).props.visible).toBe(true);
    let header = (move.confirmation as any).props.children.props.children.props
      .children[0];
    header.props.onRight();
    for (let i = 0; i < 8; i++) await Promise.resolve();
    move = renderReal();
    expect((move.confirmation as any).props.visible).toBe(true);
    expect(saved).not.toHaveBeenCalled();
    header = (move.confirmation as any).props.children.props.children.props.children[0];
    if (recovery === "CANCEL_NEW") {
      header.props.onLeft();
      move = renderReal();
      for (let i = 0; i < 8; i++) await Promise.resolve();
      move = renderReal();
      expect(real.read).toHaveBeenCalledTimes(2);
      move.handlers.start(itemId, { x: 200, y: 430 });
      move = renderReal();
      move.handlers.change({ x: 200, y: 650 });
      move.handlers.end();
      move = renderReal();
      header = (move.confirmation as any).props.children.props.children.props.children[0];
    }
    header.props.onRight();
    header.props.onRight(); // same-frame double tap must not submit twice
    for (let i = 0; i < 8; i++) await Promise.resolve();
    move = renderReal();
    expect(saved).toHaveBeenCalledTimes(recovery === "CANCEL_NEW" ? 2 : 1);
    expect(real.save).toHaveBeenCalledTimes(2);
    expect(real.save.mock.calls[0][0]).toBe(draft);
    if (recovery === "RETRY")
      expect(real.save.mock.calls[1]).toEqual(real.save.mock.calls[0]);
    else {
      expect(real.save.mock.calls[1][0]).not.toBe(draft);
      expect(real.save.mock.calls[1][1].startTime).not.toBe(
        real.save.mock.calls[0][1].startTime,
      );
    }
    expect(real.save.mock.calls[1][1]).toMatchObject({
      title: "Local P1",
      location: "Garden",
      endDate: null,
      endTime: null,
    });
    expect(real.save.mock.calls[1][1].startTime).not.toBe("10:30");
    expect(move.previews).toEqual({});
    expect((move.confirmation as any).props.visible).toBe(false);
  },
);
it.each([
  ["CHECKIN", "16:00"],
  ["CHECKOUT", "10:00"],
  ["CHECKIN", null],
  ["CHECKOUT", null],
])(
  "real Stay %s move from %s saves only that clock and retains both dates",
  async (role, clock) => {
    const itemId = "real-stay",
      start = "2026-10-25",
      end = "2026-10-28";
    const fields = {
      title: "Hotel",
      startDate: start,
      endDate: end,
      startTime: role === "CHECKIN" ? clock : "16:00",
      endTime: role === "CHECKOUT" ? clock : "10:00",
      location: "Hotel address",
      description: null,
      participation: { mode: "WHOLE_GROUP", people: [], selfPersonId: null },
      stayDetails: {
        propertyName: "Hotel",
        permittedCheckinFrom: null,
        permittedCheckinUntil: null,
        permittedCheckoutBy: null,
      },
    };
    const draft = { mode: "EDIT", itemId, fields, participantOptions: [] };
    real.generation = 5;
    real.read.mockReset().mockResolvedValue(draft);
    real.save.mockReset().mockResolvedValue({ itemId });
    const item = {
      itemId,
      itemRevision: 1,
      family: "P3",
      title: "Hotel",
      status: "planned",
      hidden: false,
      details: {},
      participation: { mode: "WHOLE_GROUP", personIds: [] },
      documentSummaries: [],
      schedule: {
        start: { localDate: start, localTime: fields.startTime, comparable: false },
        end: { localDate: end, localTime: fields.endTime, comparable: false },
      },
    };
    const read = {
      scope: { accountId: "account", generation: 5 },
      observed: null,
      localManual: {
        scope: { accountId: "account", tripId: "trip", generation: 5 },
        source: { fingerprint: "stay-one" },
        items: [item, { ...item, itemId: "flight", family: "P2" }],
        rows: () => [],
      },
    } as any;
    const saved = vi.fn();
    const renderReal = () => {
      hooks.cursor = 0;
      // eslint-disable-next-line react-hooks/rules-of-hooks
      const value = useP1CivilMove(
        list,
        read,
        "trip",
        5,
        [start, end],
        62,
        34,
        saved,
        vi.fn(),
      );
      hooks.effects.splice(0).forEach((effect) => effect());
      return value;
    };
    let move = renderReal();
    for (let i = 0; i < 8; i++) await Promise.resolve();
    move = renderReal();
    expect(move.canMove(`${itemId}:${role}`)).toBe(true);
    expect(move.canMove(`${itemId}:BASE`)).toBe(false);
    expect(move.canMove("flight")).toBe(false);
    expect(move.canMove(itemId)).toBe(false);
    move.showConfirmationPreview(`${itemId}:${role}`);
    move = renderReal();
    const header = (move.confirmation as any).props.children.props.children.props
      .children[0];
    await header.props.onRight();
    expect(real.save).toHaveBeenCalledOnce();
    expect(real.save.mock.calls[0][0]).toBe(draft);
    expect(real.save.mock.calls[0][1]).toEqual({
      ...fields,
      ...(role === "CHECKIN"
        ? { startTime: clock ? "16:30" : "12:00" }
        : { endTime: clock ? "10:30" : "12:00" }),
    });
    expect(saved).toHaveBeenCalledOnce();
  },
);
