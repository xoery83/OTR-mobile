import { createElement, type ReactNode } from "react";
import { createRequire } from "node:module";
import { beforeEach, expect, it, vi } from "vitest";
import { FlightEnrichmentAction } from "./FlightEnrichmentAction";
import { emptyFlightSegment } from "./manualFlightFormFields";
const state = vi.hoisted(() => ({
  values: [] as any[],
  refs: [] as any[],
  cursor: 0,
  refCursor: 0,
  mount: true,
  effects: [] as any[],
  cleanup: [] as any[],
  nodes: [] as any[],
  online: true,
  generation: 1,
  available: true,
  uuid: 0,
  find: vi.fn(),
  factory: vi.fn(),
}));
vi.mock("react", async (original) => ({
  ...(await original<any>()),
  useState: (initial: any) => {
    const i = state.cursor++;
    if (!(i in state.values)) state.values[i] = initial;
    return [
      state.values[i],
      (next: any) => {
        state.values[i] = typeof next === "function" ? next(state.values[i]) : next;
      },
    ];
  },
  useRef: (initial: any) => (state.refs[state.refCursor++] ??= { current: initial }),
  useLayoutEffect: (fn: any) => fn(),
  useEffect: (fn: any) => {
    if (state.mount) state.effects.push(fn);
  },
}));
vi.mock("react-native", () => ({
  View: (p: any) => createElement("div", null, p.children),
}));
vi.mock("expo-network", () => ({
  useNetworkState: () => ({ isConnected: state.online }),
}));
vi.mock("expo-crypto", () => ({ randomUUID: () => `request-${++state.uuid}` }));
vi.mock("@/data/auth/accountGeneration", () => ({
  getAccountGeneration: () => state.generation,
}));
vi.mock("@/data/repositories/flightEnrichmentRepository", () => ({
  readFlightEnrichmentRepository: (...args: any[]) => state.factory(...args),
}));
vi.mock("@/ui/useUiLocale", () => ({ useUiLocale: () => "en" }));
vi.mock("@/ui/locale", () => ({ t: (key: string) => key }));
vi.mock("@/ui/controls", () => ({
  UiButton: (p: any) => {
    state.nodes.push(p);
    return createElement("button", null, p.label);
  },
  UiText: (p: any) => createElement("span", null, p.children),
}));
const { renderToStaticMarkup } = createRequire(import.meta.url)("react-dom/server") as {
  renderToStaticMarkup(node: ReactNode): string;
};
let value = emptyFlightSegment("flight-1", "2026-10-27");
let editing = false;
const apply = vi.fn();
const flush = async () => {
  for (let i = 0; i < 16; i++) await Promise.resolve();
};
function render() {
  state.cursor = 0;
  state.refCursor = 0;
  state.nodes = [];
  const html = renderToStaticMarkup(
    createElement(FlightEnrichmentAction, {
      tripId: "trip",
      value,
      editing,
      disabled: false,
      onApply: apply,
    }),
  );
  for (const effect of state.effects.splice(0)) state.cleanup.push(effect());
  state.mount = false;
  return html;
}
function result(request: any, suggestions: any[] = []) {
  return {
    version: request.version,
    requestId: request.requestId,
    idempotencyKey: request.idempotencyKey,
    mode: request.mode,
    draft: request.draft,
    query: {
      flightNumber: request.flightNumber,
      departureLocalDate: request.departureLocalDate,
    },
    status: "PARTIAL",
    candidates: [],
    references: [],
    suggestions,
  };
}
beforeEach(() => {
  Object.assign(state, {
    values: [],
    refs: [],
    cursor: 0,
    refCursor: 0,
    mount: true,
    effects: [],
    cleanup: [],
    nodes: [],
    online: true,
    generation: 1,
    available: true,
    uuid: 0,
  });
  state.find.mockReset().mockImplementation(async (request) => result(request));
  state.factory.mockReset().mockImplementation(async () => ({
    available: async () => state.available,
    find: state.find,
  }));
  value = {
    ...emptyFlightSegment("flight-1", "2026-10-27"),
    flightNumberLiteral: "NZ501",
  };
  editing = false;
  apply.mockReset().mockImplementation((changes) => {
    value = { ...value, ...changes };
  });
});
it("does not expose lookup offline or when the owning capability is closed", async () => {
  state.online = false;
  expect(render()).toBe("");
  await flush();
  expect(state.factory).not.toHaveBeenCalled();
  expect(state.find).not.toHaveBeenCalled();
});
it("does no paid work on mount and dispatches once per flight/date identity", async () => {
  render();
  await flush();
  render();
  expect(state.find).not.toHaveBeenCalled();
  const button = state.nodes[0];
  button.onPress();
  button.onPress();
  await flush();
  render();
  expect(state.find).toHaveBeenCalledTimes(1);
  expect(state.nodes[0].disabled).toBe(true);
  expect(state.find.mock.calls[0][0]).toMatchObject({
    mode: "CREATE",
    flightNumber: "NZ501",
    departureLocalDate: "2026-10-27",
  });
});
it("shows Keep/Replace for a conflicting time without overwriting it automatically", async () => {
  value.departureTime = "14:00";
  state.find.mockImplementation(async (request) =>
    result(request, [
      {
        field: "departureLocalTime",
        value: "12:00",
        eligibility: "KEEP_OR_REPLACE",
        referenceOnly: false,
      },
    ]),
  );
  render();
  await flush();
  render();
  state.nodes[0].onPress();
  await flush();
  render();
  expect(apply).not.toHaveBeenCalled();
  state.nodes.find((n) => n.label === "flightLookup.replace").onPress();
  expect(apply).toHaveBeenCalledWith({ departureTime: "12:00" });
});
it("Cancel aborts the request and a late response cannot change the draft", async () => {
  let finish!: (v: any) => void;
  state.find.mockImplementation(
    (request) =>
      new Promise((resolve) => {
        finish = () =>
          resolve(
            result(request, [
              {
                field: "departureLocalTime",
                value: "12:00",
                eligibility: "ADOPT",
                referenceOnly: false,
              },
            ]),
          );
      }),
  );
  render();
  await flush();
  render();
  state.nodes[0].onPress();
  for (const cleanup of state.cleanup) cleanup?.();
  expect(state.find.mock.calls[0][1].aborted).toBe(true);
  finish(null);
  await flush();
  expect(apply).not.toHaveBeenCalled();
});
it("rejects a result after a field edit or account change", async () => {
  let finish!: () => void;
  state.find.mockImplementation(
    (request) =>
      new Promise((resolve) => {
        finish = () =>
          resolve(
            result(request, [
              {
                field: "departureLocalTime",
                value: "12:00",
                eligibility: "ADOPT",
                referenceOnly: false,
              },
            ]),
          );
      }),
  );
  render();
  await flush();
  render();
  state.nodes[0].onPress();
  value = { ...value, destinationCode: "CHC" };
  render();
  finish();
  await flush();
  expect(apply).not.toHaveBeenCalled();
});
it("an existing fully entered Edit flight does not offer lookup", async () => {
  editing = true;
  value.originCode = "AKL";
  value.destinationCode = "NSN";
  value.departureTime = "12:00";
  render();
  await flush();
  expect(render()).toBe("");
  expect(state.find).not.toHaveBeenCalled();
});
it("changing flight identity during lookup cannot start a second paid request or lose Cancel", async () => {
  let finish!: () => void;
  state.find.mockImplementation(
    (request) =>
      new Promise((resolve) => {
        finish = () => resolve(result(request));
      }),
  );
  render();
  await flush();
  render();
  state.nodes[0].onPress();
  value = { ...value, flightNumberLiteral: "NZ502" };
  render();
  expect(state.nodes[0].disabled).toBe(true);
  state.nodes[0].onPress();
  expect(state.find).toHaveBeenCalledTimes(1);
  for (const cleanup of state.cleanup) cleanup?.();
  expect(state.find.mock.calls[0][1].aborted).toBe(true);
  finish();
  await flush();
  expect(apply).not.toHaveBeenCalled();
});
it("reconnect releases loading for a new identity while a retired response stays fenced", async () => {
  const completions: (() => void)[] = [];
  state.find.mockImplementation(
    (request) =>
      new Promise((resolve) => {
        completions.push(() =>
          resolve(
            result(request, [
              {
                field: "departureLocalTime",
                value: "12:00",
                eligibility: "ADOPT",
                referenceOnly: false,
              },
            ]),
          ),
        );
      }),
  );
  render();
  await flush();
  render();
  state.nodes[0].onPress();
  for (const cleanup of state.cleanup.splice(0)) cleanup?.();
  expect(state.find.mock.calls[0][1].aborted).toBe(true);
  state.online = false;
  state.mount = true;
  render();
  for (const cleanup of state.cleanup.splice(0)) cleanup?.();
  state.online = true;
  state.mount = true;
  render();
  await flush();
  value = { ...value, flightNumberLiteral: "NZ502" };
  render();
  expect(state.nodes[0].disabled).toBe(false);
  state.nodes[0].onPress();
  expect(state.find).toHaveBeenCalledTimes(2);
  completions[0]();
  await flush();
  expect(apply).not.toHaveBeenCalled();
  value = { ...value, flightNumberLiteral: "NZ503" };
  render();
  state.nodes[0].onPress();
  expect(state.find).toHaveBeenCalledTimes(2);
  for (const cleanup of state.cleanup) cleanup?.();
  completions[1]();
  await flush();
  expect(apply).not.toHaveBeenCalled();
});
