import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { ttrLabFixture } from "@/features/ttr/labFixtures";
import { composeDayStream } from "@/features/day-feed/composition";
import {
  composedTtrActionability,
  createG2TtrSessionBridge,
} from "@/features/day-feed/ttrSessionBridge";
import { itemsForLocalDate } from "@/domain/trip/dayReadModel";
import { qualifyTtr, ttrIdentityKey } from "@/domain/trip/ttr";
import { useTtrSessionHost } from "./useTtrSessionHost";

const hooks = vi.hoisted(() => ({
  cursor: 0,
  slots: [] as { value?: any; deps?: readonly unknown[]; cleanup?: () => void }[],
  effects: [] as (() => void)[],
}));
const storage = vi.hoisted(() => ({
  saved: null as any,
  fail: false,
  reads: 0,
  writes: 0,
  generation: 0,
}));
vi.mock("@/data/auth/accountGeneration", () => ({
  getAccountGeneration: () => storage.generation,
}));
vi.mock("@/data/repositories/ttrLabSelectionRepository", () => ({
  openTtrLabSelectionRepository: vi.fn(async () => ({
    repository: {
      read: async () => {
        ++storage.reads;
        return storage.saved;
      },
      confirm: async (_context: unknown, relation: any, mode: any) => {
        if (storage.fail) throw new Error("WRITE_FAILED");
        ++storage.writes;
        storage.saved = {
          identityKey: (() => {
            const qualified = qualifyTtr(relation.input);
            if (qualified.status !== "QUALIFIED") throw new Error("UNQUALIFIED");
            return ttrIdentityKey(qualified.identity);
          })(),
          mode,
          selectedAt: "2027-01-15T12:00:00Z",
          expiry: relation.input.expiry,
        };
        return storage.saved;
      },
    },
    close: async () => {},
  })),
}));
vi.mock("react", async (original) => {
  const equal = (a?: readonly unknown[], b?: readonly unknown[]) =>
    !!a && !!b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  const memo = (create: () => unknown, deps: readonly unknown[]) => {
    const i = hooks.cursor++;
    if (!equal(hooks.slots[i]?.deps, deps)) hooks.slots[i] = { value: create(), deps };
    return hooks.slots[i].value;
  };
  return {
    ...(await original<typeof import("react")>()),
    useRef: (value: unknown) => {
      const i = hooks.cursor++;
      return (hooks.slots[i] ??= { value: { current: value } }).value;
    },
    useState: (initial: any) => {
      const i = hooks.cursor++;
      hooks.slots[i] ??= { value: typeof initial === "function" ? initial() : initial };
      return [
        hooks.slots[i].value,
        (next: any) => {
          hooks.slots[i].value =
            typeof next === "function" ? next(hooks.slots[i].value) : next;
        },
      ];
    },
    useMemo: memo,
    useCallback: (fn: unknown, deps: readonly unknown[]) => memo(() => fn, deps),
    useEffect: (effect: () => any, deps?: readonly unknown[]) => {
      const i = hooks.cursor++;
      const old = hooks.slots[i];
      if (!equal(old?.deps, deps))
        hooks.effects.push(() => {
          old?.cleanup?.();
          hooks.slots[i] = { deps, cleanup: effect() };
        });
    },
    useLayoutEffect: (effect: () => any, deps?: readonly unknown[]) => {
      const i = hooks.cursor++;
      const old = hooks.slots[i];
      if (!equal(old?.deps, deps))
        hooks.effects.push(() => {
          old?.cleanup?.();
          hooks.slots[i] = { deps, cleanup: effect() };
        });
    },
  };
});
beforeEach(() => {
  vi.stubGlobal("__DEV__", true);
  hooks.cursor = 0;
  hooks.slots = [];
  hooks.effects = [];
  storage.saved = null;
  storage.fail = false;
  storage.reads = 0;
  storage.writes = 0;
});
afterEach(() => {
  for (const s of hooks.slots) s.cleanup?.();
  vi.unstubAllGlobals();
});
function setup() {
  const f = ttrLabFixture("NOW_COLLISION");
  const input = {
    facts: f.supplemental!,
    accountId: f.projection.accountId,
    tripId: f.id,
    date: f.selectedDate,
    generation: 0,
    instant: f.instant,
    visit: {},
    permitted: true,
  };
  const bridge = createG2TtrSessionBridge();
  let host!: ReturnType<typeof useTtrSessionHost>;
  const Render = () => {
    hooks.cursor = 0;
    host = useTtrSessionHost(input);
    while (hooks.effects.length) hooks.effects.shift()!();
    const p = host.projection!;
    const stream = composeDayStream(
      itemsForLocalDate(f.projection, f.selectedDate, f.zone),
      f.instant,
      { ...f.ports, transitions: [p] },
    );
    const next = bridge.prepare(
      composedTtrActionability(host.sessionPort.scope, stream, [p], input.permitted),
    );
    if (bridge.commit(next, host.sheetOpen)) host.sessionPort.onChange(next);
    return host;
  };
  const settle = async () => {
    for (let i = 0; i < 8; i++) {
      await Promise.resolve();
      Render();
    }
    return host;
  };
  const open = async () => {
    await settle();
    const p = host.projection!;
    host.onOpenTtr(p.actions.openTtr!, {
      key: ttrIdentityKey(p.identity!),
      inputFingerprint: p.inputFingerprint,
    });
    await settle();
    return host;
  };
  Render();
  return { input, render: Render, settle, open, current: () => host };
}
it("opens the accepted owning Controller and leaves Preview/Dismiss non-durable", async () => {
  const x = setup();
  let h = await x.open();
  expect(h.adapter.view.phase).toBe("READY");
  expect(h.sheetOpen).toBe(true);
  h.adapter.preview("walking");
  h = await x.settle();
  expect(h.adapter.view.state?.preview?.mode).toBe("walking");
  expect(storage.writes).toBe(0);
  h.adapter.dismiss();
  h = await x.settle();
  expect(h.sheetOpen).toBe(false);
  expect(storage.writes).toBe(0);
});
it("invalidates permission loss and never automatically reopens", async () => {
  const x = setup();
  await x.open();
  x.input.permitted = false;
  let h = await x.settle();
  expect(h.sheetOpen).toBe(false);
  expect(h.lastInvalidation).toMatchObject({
    version: "g2-ttr-invalidation/1",
    reason: "PERMISSION",
    previous: { actionable: true },
    current: { actionable: false },
  });
  expect(h.lastInvalidation!.revision).toBeGreaterThan(0);
  x.input.permitted = true;
  h = await x.settle();
  expect(h.sheetOpen).toBe(false);
  expect(storage.writes).toBe(0);
});
it("rejects an old host callback across A to B to A visit identities", async () => {
  const x = setup();
  await x.settle();
  const old = x.current().onOpenTtr;
  const p = x.current().projection!;
  x.input.visit = {};
  await x.settle();
  x.input.visit = {};
  await x.settle();
  old(p.actions.openTtr!, {
    key: ttrIdentityKey(p.identity!),
    inputFingerprint: p.inputFingerprint,
  });
  const h = await x.settle();
  expect(h.sheetOpen).toBe(false);
  expect(storage.reads).toBe(0);
});
it("failed durable Confirm cannot publish a confirmed projection", async () => {
  const x = setup();
  let h = await x.open();
  const before = h.projection;
  h.adapter.preview("walking");
  h = await x.settle();
  storage.fail = true;
  await h.adapter.confirm();
  h = await x.settle();
  expect(h.adapter.view.phase).toBe("UNCERTAIN");
  expect(h.projection).toBe(before);
  expect(storage.writes).toBe(0);
});
it("publishes an immutable selected-mode projection only after durable Confirm and closes the owning Sheet", async () => {
  const x = setup();
  let h = await x.open();
  const before = h.projection;
  h.adapter.preview("walking");
  h = await x.settle();
  expect(h.projection).toBe(before);
  expect(storage.writes).toBe(0);
  await h.adapter.confirm();
  h = await x.settle();
  expect(storage.writes).toBe(1);
  expect(h.projection).toMatchObject({
    visibility: "SELECTED_MODE",
    modeOrigin: "USER_CONFIRMED",
    mode: "walking",
  });
  expect(Object.isFrozen(h.projection)).toBe(true);
  expect(h.sheetOpen).toBe(false);
  await x.open();
  h = x.current();
  expect(h.adapter.view.state?.confirmed?.mode).toBe("walking");
});
it("invalidates a live publication replacement and rejects the retained callback without reopening", async () => {
  const x = setup();
  let h = await x.open();
  const old = h.onOpenTtr;
  const p = h.projection!;
  h.replacePublication();
  h = await x.settle();
  expect(h.sheetOpen).toBe(false);
  expect(storage.writes).toBe(0);
  old(p.actions.openTtr!, {
    key: ttrIdentityKey(p.identity!),
    inputFingerprint: p.inputFingerprint,
  });
  h = await x.settle();
  expect(h.sheetOpen).toBe(false);
  expect(h.rejectedTaps).toBeGreaterThan(0);
});
it("accepts the owning reducer's version after multiple explicit mode previews", async () => {
  const x = setup();
  let h = await x.open();
  for (const mode of ["walking", "driving", "transit"] as const) {
    h.adapter.preview(mode);
    h = await x.settle();
  }
  const version = h.adapter.view.state!.publicationVersion;
  await h.adapter.confirm();
  h = await x.settle();
  expect(h.projection?.publicationVersion).toBe(version);
  expect(h.projection?.mode).toBe("transit");
  expect(storage.writes).toBe(1);
});
