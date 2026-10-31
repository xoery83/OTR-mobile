import { randomUUID } from "node:crypto";
import { beforeEach, expect, it, vi } from "vitest";
import type { TripPreparationSetup } from "@/data/repositories/tripPreparationSetupRepository";
import { ServerParentTripPeople } from "./ServerParentTripPeople";

const state = vi.hoisted(() => ({
  generation: 5,
  values: [] as unknown[],
  refs: [] as any[],
  cursor: 0,
  refCursor: 0,
  mounted: false,
  callback: undefined as any,
  memo: undefined as undefined | { deps: unknown[]; value: unknown },
  effectDeps: undefined as readonly unknown[] | undefined,
  effectCleanup: undefined as (() => void) | undefined,
  cleanups: [] as (() => void)[],
  effects: [] as (() => void)[],
  read: vi.fn(),
  save: vi.fn(),
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useRef: (value: unknown) => (state.refs[state.refCursor++] ??= { current: value }),
  useCallback: (fn: unknown) => (state.callback ??= fn),
  useMemo: (fn: () => unknown, deps: unknown[]) => {
    if (!state.memo || deps.some((value, index) => value !== state.memo!.deps[index]))
      state.memo = { deps, value: fn() };
    return state.memo.value;
  },
  useState: (value: unknown) => {
    const index = state.cursor++;
    if (!(index in state.values)) state.values[index] = value;
    return [
      state.values[index],
      (next: unknown) => {
        state.values[index] = next;
      },
    ];
  },
  useLayoutEffect: (effect: () => void | (() => void), deps: unknown[]) => {
    if (deps.length || !state.mounted) {
      const cleanup = effect();
      if (cleanup) state.cleanups.push(cleanup);
    }
  },
  useEffect: (effect: () => void | (() => void), deps: unknown[]) => {
    if (!state.effectDeps || deps.some((dep, i) => dep !== state.effectDeps![i])) {
      state.effectDeps = deps;
      state.effects.push(() => {
        state.effectCleanup?.();
        state.effectCleanup = effect() || undefined;
      });
    }
  },
}));
vi.mock("@/data/auth/accountGeneration", () => ({
  getAccountGeneration: () => state.generation,
}));
vi.mock("@/data/repositories/tripPersonCloudCreateRepository", () => ({
  readServerParentPeopleContext: state.read,
  saveServerParentTripTraveler: state.save,
}));
vi.mock("@/features/day-feed/TripSetupRows", () => ({ TripMembersSummary: "Summary" }));

let props: Parameters<typeof ServerParentTripPeople>[0];
const setup = (): TripPreparationSetup => ({
  context: {
    accountId: randomUUID(),
    tripId: randomUUID(),
    generation: state.generation,
  },
  currency: { state: "UNKNOWN" },
  invitations: "UNKNOWN",
  connections: "UNKNOWN",
  members: {
    state: "AVAILABLE",
    namedCount: 0,
    people: [{ personId: randomUUID(), displayName: "", isCurrentActor: true }],
  },
});
function render() {
  state.cursor = state.refCursor = 0;
  const node = ServerParentTripPeople(props);
  state.effects.splice(0).forEach((effect) => effect());
  state.mounted = true;
  return node.props;
}
async function settled() {
  await Promise.resolve();
  await Promise.resolve();
  return render();
}
const owner = () =>
  props.setup!.members.state === "AVAILABLE"
    ? props.setup!.members.people[0].personId
    : "";
const proof = () => ({ context: { ...props.setup!.context }, ownerPersonId: owner() });
const input = () => ({
  operationId: randomUUID(),
  personId: randomUUID(),
  displayName: "同行人 林",
});
beforeEach(() => {
  state.effectCleanup?.();
  state.cleanups.splice(0).forEach((cleanup) => cleanup());
  state.generation = 5;
  state.values = [];
  state.refs = [];
  state.callback = undefined;
  state.memo = undefined;
  state.mounted = false;
  state.effectDeps = undefined;
  state.effectCleanup = undefined;
  state.effects = [];
  state.read.mockReset();
  state.save.mockReset();
  const current = setup();
  props = {
    tripId: current.context.tripId,
    generation: 5,
    setup: current,
    onSetup: vi.fn(),
  };
  state.read.mockImplementation(async () => proof());
});

it("keeps Add closed until formal OriginalOwner qualification, then saves through the existing scoped facade", async () => {
  expect(render().onAddTraveler).toBeUndefined();
  const ui = await settled(),
    request = input();
  state.save.mockResolvedValue({
    people: [
      { personId: owner(), displayName: "" },
      {
        personId: request.personId,
        displayName: request.displayName,
        localState: "LOCAL_PENDING",
      },
    ],
  });
  await ui.onAddTraveler!(request);
  expect(state.read).toHaveBeenCalledWith(props.setup!.context);
  expect(state.save).toHaveBeenCalledWith(props.setup!.context, request);
  expect(props.onSetup).toHaveBeenCalledWith(
    expect.objectContaining({
      members: {
        state: "AVAILABLE",
        namedCount: 1,
        people: [
          { personId: owner(), displayName: "", isCurrentActor: true },
          {
            personId: request.personId,
            displayName: request.displayName,
            localState: "LOCAL_PENDING",
            isCurrentActor: false,
          },
        ],
      },
    }),
  );
});

it.each(["closed", "owner", "account", "trip", "generation"])(
  "preserves the readable roster and closed Add for an unqualified parent: %s",
  async (kind) => {
    const p = proof();
    if (kind === "owner") p.ownerPersonId = randomUUID();
    if (kind === "account") p.context.accountId = randomUUID();
    if (kind === "trip") p.context.tripId = randomUUID();
    if (kind === "generation") p.context.generation += 1;
    state.read.mockImplementation(async () => {
      if (kind === "closed") throw Error("CLOSED");
      return p;
    });
    render();
    const ui = await settled();
    expect(ui.onAddTraveler).toBeUndefined();
    expect(ui.setup).toEqual(props.setup);
    render();
    expect(state.read).toHaveBeenCalledOnce();
    expect(state.save).not.toHaveBeenCalled();
  },
);

it("rejects an old Add callback after an Account change", async () => {
  render();
  const old = (await settled()).onAddTraveler!;
  state.generation += 1;
  const next = setup();
  props = {
    ...props,
    generation: state.generation,
    tripId: next.context.tripId,
    setup: next,
  };
  render();
  await expect(old(input())).rejects.toThrow("PEOPLE_CONTEXT_CHANGED");
  expect(state.save).not.toHaveBeenCalled();
});

it("discards a late qualification from another Trip instead of enabling its Add callback", async () => {
  const oldProof = proof();
  let done!: (value: typeof oldProof) => void;
  state.read.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        done = resolve;
      }),
  );
  render();
  const next = setup();
  props = { ...props, tripId: next.context.tripId, setup: next };
  state.read.mockRejectedValue(Error("CLOSED"));
  render();
  await settled();
  done(oldProof);
  expect((await settled()).onAddTraveler).toBeUndefined();
  expect(state.save).not.toHaveBeenCalled();
});

it("rejects a retained callback after unmount", async () => {
  render();
  const old = (await settled()).onAddTraveler!;
  state.cleanups.splice(0).forEach((cleanup) => cleanup());
  state.effectCleanup?.();
  await expect(old(input())).rejects.toThrow("PEOPLE_CONTEXT_CHANGED");
  expect(state.save).not.toHaveBeenCalled();
});

it("keeps Add mounted across a fresh setup/context object for the same identity", async () => {
  render();
  expect((await settled()).onAddTraveler).toBeTypeOf("function");
  props = { ...props, setup: { ...props.setup!, context: { ...props.setup!.context } } };
  expect(render().onAddTraveler).toBeTypeOf("function");
  expect((await settled()).onAddTraveler).toBeTypeOf("function");
  expect(state.read).toHaveBeenCalledOnce();
});

it("finishes the same save across an ordinary setup refresh and preserves its latest currency context", async () => {
  render();
  const save = (await settled()).onAddTraveler!;
  let done!: (value: unknown) => void;
  state.save.mockImplementation(
    () =>
      new Promise((resolve) => {
        done = resolve;
      }),
  );
  const saving = save(input());
  const currency = {
    state: "AVAILABLE" as const,
    code: "NZD",
    scale: 2,
    permission: "READ_ONLY" as const,
    lock: "UNKNOWN" as const,
  };
  props = {
    ...props,
    setup: { ...props.setup!, context: { ...props.setup!.context }, currency },
  };
  expect(render().onAddTraveler).toBeTypeOf("function");
  done({ people: [{ personId: owner(), displayName: "" }] });
  await saving;
  expect(props.onSetup).toHaveBeenCalledWith(
    expect.objectContaining({ currency, context: props.setup!.context }),
  );
  expect(state.read).toHaveBeenCalledOnce();
});

it("does not reactivate old qualification after Actor changes away and back while the reader is closed", async () => {
  render();
  const old = (await settled()).onAddTraveler!;
  const original = props.setup!;
  state.read.mockRejectedValue(Error("CLOSED"));
  props = {
    ...props,
    setup: {
      ...original,
      members: {
        state: "AVAILABLE",
        namedCount: 0,
        people: [{ personId: randomUUID(), displayName: "", isCurrentActor: true }],
      },
    },
  };
  render();
  await settled();
  props = { ...props, setup: original };
  render();
  expect((await settled()).onAddTraveler).toBeUndefined();
  await expect(old(input())).rejects.toThrow("PEOPLE_CONTEXT_CHANGED");
  expect(state.save).not.toHaveBeenCalled();
});

it("withholds a late saved roster after Trip change and never reports it into the new Trip", async () => {
  render();
  const old = (await settled()).onAddTraveler!;
  let done!: (value: unknown) => void;
  state.save.mockImplementation(
    () =>
      new Promise((resolve) => {
        done = resolve;
      }),
  );
  const saving = old(input());
  const next = setup();
  next.context = { ...next.context, accountId: props.setup!.context.accountId };
  props = { ...props, tripId: next.context.tripId, setup: next };
  render();
  done({ people: [] });
  await expect(saving).rejects.toThrow("PEOPLE_CONTEXT_CHANGED");
  expect(props.onSetup).not.toHaveBeenCalled();
});

it("propagates save failure and keeps the current roster without confirmed local success", async () => {
  render();
  const ui = await settled();
  state.save.mockRejectedValue(Error("PERSON_PARENT_CONTEXT_CHANGED"));
  await expect(ui.onAddTraveler!(input())).rejects.toThrow(
    "PERSON_PARENT_CONTEXT_CHANGED",
  );
  expect(props.onSetup).not.toHaveBeenCalled();
});
