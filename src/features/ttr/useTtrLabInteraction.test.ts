import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  useTtrLabInteraction,
  type TtrLabInteractionInput,
} from "./useTtrLabInteraction";
import { ttrFixture } from "@/domain/trip/__fixtures__/ttr";
import { ttrIdentityKey, type TtrMode } from "@/domain/trip/ttr";
import { openTtr, projectTtr, type TtrSelection } from "@/domain/trip/ttrState";
import type { TtrInteractionSource } from "./interactionController";

// Same injected-hook strategy used by G2 render tests; no native/renderer claim.
const hooks = vi.hoisted(() => ({
  cursor: 0,
  slots: [] as { value?: any; deps?: readonly unknown[]; cleanup?: () => void }[],
  effects: [] as (() => void)[],
}));
vi.mock("react", async (original) => {
  const equal = (a?: readonly unknown[], b?: readonly unknown[]) =>
    !!a && !!b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
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
    useMemo: (create: () => unknown, deps: readonly unknown[]) => {
      const i = hooks.cursor++;
      if (!equal(hooks.slots[i]?.deps, deps)) hooks.slots[i] = { value: create(), deps };
      return hooks.slots[i].value;
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
});
afterEach(() => {
  for (const s of hooks.slots) s.cleanup?.();
  vi.unstubAllGlobals();
});
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
function fixture() {
  const input = ttrFixture();
  input.expiry = { eventDate: "2027-01-15", zone: "UTC" };
  let source: TtrInteractionSource = {
    relation: { input, accessRevision: 1, publicationVersion: 4 },
    projection: projectTtr(openTtr(input, null, 4), {
      now: "2027-01-14T12:00:00Z",
      displayPermission: "DENIED",
    }),
    presentation: { key: "feed/1", authorized: true },
  };
  let saved: TtrSelection | null = null;
  const repository = {
    read: vi.fn(async (ctx) => {
      expect(Object.keys(ctx).sort()).toEqual(["accountId", "generation", "tripId"]);
      return saved;
    }),
    confirm: vi.fn(async (_ctx: any, relation: typeof source.relation, mode: TtrMode) => {
      saved = {
        identityKey: ttrIdentityKey(source.projection.identity!),
        mode,
        selectedAt: "2027-01-14T12:00:00Z",
        expiry: relation.input.expiry,
      };
      return saved;
    }),
  };
  const original = JSON.stringify(source);
  const publish = vi.fn((projection, _key) => {
    source = {
      ...source,
      projection,
      relation: { ...source.relation, publicationVersion: projection.publicationVersion },
    };
    return true;
  });
  const dismissHost = vi.fn();
  const props: TtrLabInteractionInput = {
    context: { ...input.scope, localDate: "2027-01-15", visitKey: "visit/1" },
    authorization: { key: "feed/1", version: 1, actionable: true },
    resolve: () => source,
    repository,
    clock: () => "2027-01-14T12:00:00Z",
    publish,
    dismissHost,
  };
  let adapter: ReturnType<typeof useTtrLabInteraction>;
  const Harness = () => {
    hooks.cursor = 0;
    adapter = useTtrLabInteraction(props);
    for (const fn of hooks.effects.splice(0)) fn();
    return adapter;
  };
  Harness();
  const vector = () =>
    [
      source.projection.actions.openTtr!,
      {
        key: ttrIdentityKey(source.projection.identity!),
        inputFingerprint: source.projection.inputFingerprint,
      },
    ] as const;
  const open = async () => {
    await adapter.onOpenTtr(...vector());
    return Harness();
  };
  return {
    props,
    repository,
    publish,
    dismissHost,
    original,
    source: () => source,
    setSource: (s: TtrInteractionSource) => {
      source = s;
    },
    render: Harness,
    open,
    vector,
    current: () => adapter,
    saved: () => saved,
    unmount: () => {
      for (const s of hooks.slots) s.cleanup?.();
    },
  };
}
it("exact G2 intent opens/reads without selecting a mode or publishing a draft", async () => {
  const f = fixture();
  const a = await f.open();
  expect(a.view.phase).toBe("READY");
  expect(a.view.state!.preview!.mode).toBeNull();
  a.preview("walking");
  expect(f.render().view.state!.preview!.mode).toBe("walking");
  expect(f.publish).not.toHaveBeenCalled();
  expect(f.repository.confirm).not.toHaveBeenCalled();
  expect(JSON.stringify(f.source())).toBe(f.original);
  f.current().dismiss();
  expect(f.render().view.phase).toBe("CLOSED");
  expect(f.dismissHost).toHaveBeenCalledTimes(1);
});
it("durable Confirm publishes an owned deeply immutable replacement, then dismisses only host", async () => {
  const f = fixture();
  const a = await f.open();
  a.preview("transit");
  await f.current().confirm();
  const view = f.render().view;
  expect(view.phase).toBe("PUBLISHED");
  expect(view.state!.confirmed!.mode).toBe("transit");
  const projection = f.publish.mock.calls[0][0];
  expect(projection.modeOrigin).toBe("USER_CONFIRMED");
  expect(projection.route).toEqual({ status: "MISSING" });
  expect(Object.isFrozen(projection)).toBe(true);
  expect(Object.isFrozen(projection.identity)).toBe(true);
  expect(() => {
    projection.actions.openTtr!.publicationVersion = 999;
  }).toThrow();
  expect(f.dismissHost).toHaveBeenCalledTimes(1);
});
it("double Confirm shares the pending promise and cannot publish before acknowledgment", async () => {
  const f = fixture();
  const a = await f.open();
  a.preview("walking");
  const hold = deferred();
  const original = f.repository.confirm.getMockImplementation()!;
  f.repository.confirm.mockImplementationOnce(async (...args) => {
    await hold.promise;
    return original(...args);
  });
  const one = f.current().confirm(),
    two = f.current().confirm();
  expect(one).toBe(two);
  expect(f.render().view.phase).toBe("SAVING");
  expect(f.publish).not.toHaveBeenCalled();
  f.current().preview("driving");
  expect(f.render().view.state!.preview!.mode).toBe("walking");
  hold.resolve();
  await one;
  expect(f.repository.confirm).toHaveBeenCalledTimes(1);
});
it("rapid draft modes change no storage; final explicit selection alone is confirmed", async () => {
  const f = fixture();
  const a = await f.open();
  for (const mode of ["walking", "driving", "transit"] as const) a.preview(mode);
  expect(f.repository.confirm).not.toHaveBeenCalled();
  await f.current().confirm();
  expect(f.saved()!.mode).toBe("transit");
});
it("Dismiss during pending Confirm prevents stale publication even when the row is durable", async () => {
  const f = fixture();
  const a = await f.open();
  a.preview("walking");
  const hold = deferred();
  const original = f.repository.confirm.getMockImplementation()!;
  f.repository.confirm.mockImplementationOnce(async (...args) => {
    await hold.promise;
    return original(...args);
  });
  const pending = f.current().confirm();
  f.current().dismiss();
  hold.resolve();
  await pending;
  expect(f.saved()!.mode).toBe("walking");
  expect(f.publish).not.toHaveBeenCalled();
  expect(f.render().view.phase).toBe("CLOSED");
  await f.open();
  expect(f.current().view.state!.confirmed!.mode).toBe("walking");
});
it.each([
  "date",
  "trip",
  "generation",
  "traveller",
  "access",
  "input",
  "actionability",
  "visit",
] as const)("%s changes fence pending Open without unhandled rejection", async (kind) => {
  const f = fixture();
  const hold = deferred();
  f.repository.read.mockImplementationOnce(async () => {
    await hold.promise;
    return null;
  });
  const opening = f.current().onOpenTtr(...f.vector());
  if (kind === "date") f.props.context = { ...f.props.context, localDate: "2027-01-16" };
  if (kind === "trip")
    f.props.context = {
      ...f.props.context,
      tripId: "20000000-0000-4000-8000-000000000002",
    };
  if (kind === "generation") f.props.context = { ...f.props.context, generation: 3 };
  if (kind === "traveller")
    f.props.context = { ...f.props.context, travellerKey: "synthetic-person/other" };
  if (kind === "visit") f.props.context = { ...f.props.context, visitKey: "visit/2" };
  if (kind === "actionability")
    f.props.authorization = { ...f.props.authorization, actionable: false, version: 2 };
  if (kind === "access" || kind === "input") {
    const src = structuredClone(f.source());
    if (kind === "access")
      f.setSource({ ...src, relation: { ...src.relation, accessRevision: 2 } });
    else {
      src.relation.input.to!.endpoint!.coordinates!.longitude = 2;
      f.setSource(src);
    }
  }
  f.render();
  hold.resolve();
  await expect(opening).resolves.toBeUndefined();
  expect(f.render().view.phase).not.toBe("READY");
  expect(f.publish).not.toHaveBeenCalled();
});
it.each(["authorization", "nesting", "unmount"] as const)(
  "%s during Confirm fences old projection",
  async (kind) => {
    const f = fixture();
    const a = await f.open();
    a.preview("walking");
    const hold = deferred();
    const original = f.repository.confirm.getMockImplementation()!;
    f.repository.confirm.mockImplementationOnce(async (...args) => {
      await hold.promise;
      return original(...args);
    });
    const request = f.current().confirm();
    if (kind === "unmount") f.unmount();
    else {
      f.props.authorization = { ...f.props.authorization, actionable: false, version: 2 };
      f.render();
    }
    hold.resolve();
    await request;
    expect(f.publish).not.toHaveBeenCalled();
    expect(f.dismissHost).not.toHaveBeenCalled();
  },
);
it("A→B→A cannot revive an old callback or close the current host", async () => {
  const f = fixture();
  const old = await f.open();
  old.preview("walking");
  const originalContext = { ...f.props.context };
  f.props.context = {
    ...originalContext,
    generation: 2,
    accountId: "90000000-0000-4000-8000-000000000001",
  };
  f.render();
  f.props.context = { ...originalContext, generation: 3, visitKey: "visit/3" };
  const src = structuredClone(f.source());
  src.relation.input.scope.generation = 3;
  f.setSource(src);
  f.render();
  await f.open();
  old.dismiss();
  await old.confirm();
  expect(f.dismissHost).not.toHaveBeenCalled();
  expect(f.current().view.phase).toBe("READY");
});
it("old Confirm after a new Open never publishes into the newer session", async () => {
  const f = fixture();
  const a = await f.open();
  a.preview("walking");
  const hold = deferred();
  const original = f.repository.confirm.getMockImplementation()!;
  f.repository.confirm.mockImplementationOnce(async (...args) => {
    await hold.promise;
    return original(...args);
  });
  const old = f.current().confirm();
  f.current().dismiss();
  await f.open();
  f.current().preview("driving");
  await f.current().confirm();
  hold.resolve();
  await old;
  expect(f.publish.mock.calls.map((c) => c[0].mode)).toEqual(["driving"]);
  expect(f.render().view.phase).toBe("PUBLISHED");
});
it("uncertain outcome requires explicit safe re-read, never an automatic retry", async () => {
  const f = fixture();
  const a = await f.open();
  a.preview("walking");
  const original = f.repository.confirm.getMockImplementation()!;
  f.repository.confirm.mockImplementationOnce(async (...args) => {
    await original(...args);
    throw new Error("SQL_ACK_UNCERTAIN");
  });
  await f.current().confirm();
  expect(f.render().view.phase).toBe("UNCERTAIN");
  expect(f.publish).not.toHaveBeenCalled();
  await f.current().recover();
  expect(f.render().view.phase).toBe("PUBLISHED");
  expect(f.repository.confirm).toHaveBeenCalledTimes(1);
});
it("SQL rejection and read failure retain uncertainty and do not report success", async () => {
  const f = fixture();
  const a = await f.open();
  a.preview("walking");
  f.repository.confirm.mockRejectedValueOnce(new Error("SQL_ROLLBACK"));
  await f.current().confirm();
  f.repository.read.mockRejectedValueOnce(new Error("READ_FAILED"));
  await f.current().recover();
  expect(f.render().view.phase).toBe("UNCERTAIN");
  expect(f.publish).not.toHaveBeenCalled();
});
it.each(["confirm", "recover"] as const)(
  "rejected G2 publication after %s stays SAVED_UNPUBLISHED",
  async (kind) => {
    const f = fixture();
    const a = await f.open();
    a.preview("walking");
    if (kind === "recover") {
      const original = f.repository.confirm.getMockImplementation()!;
      f.repository.confirm.mockImplementationOnce(async (...args) => {
        await original(...args);
        throw new Error("ACK");
      });
      await f.current().confirm();
    }
    f.publish.mockImplementationOnce(() => false);
    await f.current()[kind]();
    expect(f.render().view.phase).toBe("SAVED_UNPUBLISHED");
    expect(f.dismissHost).not.toHaveBeenCalled();
  },
);
it("duplicate safe re-read shares a single pending read and blocks draft actions", async () => {
  const f = fixture();
  const a = await f.open();
  a.preview("walking");
  f.repository.confirm.mockRejectedValueOnce(new Error("SQL_ACK"));
  await f.current().confirm();
  const hold = deferred();
  f.repository.read.mockImplementationOnce(async () => {
    await hold.promise;
    return null;
  });
  const reads = f.repository.read.mock.calls.length;
  const one = f.current().recover(),
    two = f.current().recover();
  expect(one).toBe(two);
  expect(f.render().view.phase).toBe("RECOVERING");
  f.current().preview("driving");
  expect(f.render().view.state!.preview!.mode).toBe("walking");
  hold.resolve();
  await one;
  expect(f.repository.read).toHaveBeenCalledTimes(reads + 1);
  expect(f.render().view.phase).toBe("READY");
});
it("stale intent and unavailable resolver errors are caught before any write", async () => {
  const f = fixture();
  const [intent, presentation] = f.vector();
  await f.current().onOpenTtr({ ...intent, publicationVersion: 999 }, presentation);
  expect(f.render().view.phase).toBe("UNAVAILABLE");
  f.props.resolve = () => null;
  f.render();
  await f.open();
  expect(f.repository.confirm).not.toHaveBeenCalled();
});
it("explicit disposal invalidates the mounted session and cannot reopen it", async () => {
  const f = fixture();
  const a = await f.open();
  a.dispose();
  expect(f.render().view.phase).toBe("UNAVAILABLE");
  await f.current().onOpenTtr(...f.vector());
  expect(f.repository.read).toHaveBeenCalledTimes(1);
  expect(f.publish).not.toHaveBeenCalled();
});
it("Release hook and inactive presentation make no repository request", async () => {
  const f = fixture();
  vi.stubGlobal("__DEV__", false);
  await f.open();
  expect(f.repository.read).not.toHaveBeenCalled();
  expect(f.current().view.phase).toBe("UNAVAILABLE");
});
it("has no Day row/Focus/scroll/Provider or fixture-registry mutation path", () => {
  const source = readFileSync(
    new URL("./useTtrLabInteraction.ts", import.meta.url),
    "utf8",
  );
  expect(source).not.toMatch(
    /composeDayStream|setFocus|setScroll|setDate|fetch\(|MapKit|fixtureRegistration/,
  );
});
it("UNKNOWN equal geometry stays actionable through the unchanged React adapter", async () => {
  const f = fixture();
  const src = structuredClone(f.source());
  src.relation.input.to!.endpoint!.coordinates = {
    ...src.relation.input.from!.endpoint!.coordinates!,
  };
  const projection = projectTtr(
    openTtr(src.relation.input, null, src.relation.publicationVersion),
    {
      now: f.props.clock(),
      displayPermission: "DENIED",
    },
  );
  f.setSource({ ...src, projection });
  const a = await f.open();
  expect(a.view.phase).toBe("READY");
  a.preview("walking");
  await f.current().confirm();
  expect(f.render().view.phase).toBe("PUBLISHED");
  expect(f.publish.mock.calls[0][0].geometricDistance!.meters).toBe(0);
});
