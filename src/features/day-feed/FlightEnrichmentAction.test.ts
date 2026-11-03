import { createElement, type ReactNode } from "react";
import { createRequire } from "node:module";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { FlightEnrichmentAction } from "./FlightEnrichmentAction";
import { emptyFlightSegment } from "./manualFlightFormFields";
const state = vi.hoisted(() => ({
  values: [] as any[],
  refs: [] as any[],
  cursor: 0,
  refCursor: 0,
  mount: true,
  effects: [] as any[],
  effectCursor: 0,
  effectSlots: [] as { dependencies?: readonly unknown[]; cleanup?: () => void }[],
  cleanup: [] as any[],
  nodes: [] as any[],
  online: true,
  generation: 1,
  available: true,
  uuid: 0,
  textColor: "semantic-primary",
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
  useSyncExternalStore: (_: unknown, read: () => unknown) => read(),
  useLayoutEffect: (fn: any) => fn(),
  useEffect: (fn: any, dependencies?: readonly unknown[]) => {
    const index = state.effectCursor++;
    const previous = state.effectSlots[index];
    if (
      state.mount ||
      !previous ||
      !dependencies ||
      dependencies.some((value, i) => value !== previous.dependencies?.[i])
    ) {
      state.effects.push(() => {
        previous?.cleanup?.();
        const cleanup = fn();
        state.effectSlots[index] = { dependencies, cleanup };
        return cleanup;
      });
    }
  },
}));
vi.mock("react-native", () => ({
  View: (p: any) => createElement("div", null, p.children),
  StyleSheet: { create: (styles: any) => styles },
}));
vi.mock("expo-network", () => ({
  useNetworkState: () => ({ isConnected: state.online }),
}));
vi.mock("expo-crypto", () => ({ randomUUID: () => `request-${++state.uuid}` }));
vi.mock("@/data/auth/accountGeneration", () => ({
  getAccountGeneration: () => state.generation,
  subscribeAccountGeneration: () => () => {},
}));
vi.mock("@/data/repositories/flightEnrichmentRepository", () => ({
  readFlightEnrichmentRepository: (...args: any[]) => state.factory(...args),
}));
vi.mock("@/ui/theme", () => ({
  useThemedStyles: (factory: any) => factory({ textPrimary: state.textColor }),
}));
vi.mock("@/ui/useUiLocale", () => ({ useUiLocale: () => "en" }));
vi.mock("@/ui/locale", () => ({
  t: (key: string, values?: Record<string, unknown>) =>
    ["flightLookup.source", "flightLookup.observed", "flightLookup.applies"].includes(key)
      ? key + JSON.stringify(values)
      : key,
  formatUiDate: (date: Date) => date.toISOString(),
}));
vi.mock("@/ui/controls", () => ({
  UiButton: (p: any) => {
    state.nodes.push(p);
    return createElement("button", null, p.label);
  },
  UiText: (p: any) => createElement("span", { style: p.style }, p.children),
}));
const { renderToStaticMarkup } = createRequire(import.meta.url)("react-dom/server") as {
  renderToStaticMarkup(node: ReactNode): string;
};
let value = emptyFlightSegment("flight-1", "2026-10-27");
let editing = false;
let tripId = "trip";
const apply = vi.fn();
const flush = async () => {
  for (let i = 0; i < 16; i++) await Promise.resolve();
};
function render() {
  state.cursor = 0;
  state.refCursor = 0;
  state.effectCursor = 0;
  state.nodes = [];
  const html = renderToStaticMarkup(
    createElement(FlightEnrichmentAction, {
      tripId,
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
    suggestions: suggestions.map((suggestion) => ({
      existingValue: null,
      reason: null,
      source: {
        url: "https://example.test/synthetic-flight-schedule",
        evidenceId: "synthetic-source",
        quote: "Synthetic QA flight schedule; not a real airline confirmation.",
        observedAt: "2026-10-26T12:00:00Z",
      },
      applicableDate: {
        from: request.departureLocalDate,
        to: request.departureLocalDate,
        requested: request.departureLocalDate,
      },
      ...suggestion,
    })),
  };
}
beforeEach(() => {
  vi.useFakeTimers();
  Object.assign(state, {
    values: [],
    refs: [],
    cursor: 0,
    refCursor: 0,
    mount: true,
    effects: [],
    effectSlots: [],
    effectCursor: 0,
    cleanup: [],
    nodes: [],
    online: true,
    generation: 1,
    available: true,
    uuid: 0,
    textColor: "semantic-primary",
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
  tripId = "trip";
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
  value.arrivalTime = "13:30";
  value.arrivalDate = value.departureDate;
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

afterEach(() => {
  for (const cleanup of state.cleanup) cleanup?.();
  vi.useRealTimers();
});
it("Create automatically queries once after stable number/date and capability", async () => {
  render();
  await flush();
  render();
  await vi.advanceTimersByTimeAsync(599);
  expect(state.find).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  await flush();
  render();
  expect(state.find).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(2000);
  expect(state.find).toHaveBeenCalledTimes(1);
});
it("Edit with partial details remains explicit, preserving known fields", async () => {
  editing = true;
  value.originCode = "AKL";
  render();
  await flush();
  render();
  await vi.advanceTimersByTimeAsync(1000);
  expect(state.find).not.toHaveBeenCalled();
  state.nodes[0].onPress();
  await flush();
  expect(state.find).toHaveBeenCalledTimes(1);
  expect(state.find.mock.calls[0][0].knownFields.departureAirport).toBe("AKL");
});
it("account switch before the automatic timer cannot dispatch an old account request", async () => {
  render();
  await flush();
  render();
  state.generation++;
  await vi.advanceTimersByTimeAsync(1000);
  expect(state.find).not.toHaveBeenCalled();
});
it.each(["NO_RESULT", "AMBIGUOUS", "TIMEOUT"])(
  "%s leaves the handwritten draft intact and does not loop",
  async (status) => {
    const before = structuredClone(value);
    state.find.mockImplementation(async (request) => {
      if (status === "TIMEOUT") throw Error("TIMEOUT");
      return {
        ...result(request),
        status: status === "NO_RESULT" ? "NOT_FOUND" : "AMBIGUOUS",
      };
    });
    render();
    await flush();
    render();
    await vi.advanceTimersByTimeAsync(600);
    await flush();
    render();
    expect(apply).not.toHaveBeenCalled();
    expect(value).toEqual(before);
    await vi.advanceTimersByTimeAsync(5000);
    expect(state.find).toHaveBeenCalledTimes(1);
  },
);
it("a capability-closed account never dispatches automatic lookup", async () => {
  state.available = false;
  render();
  await flush();
  render();
  await vi.advanceTimersByTimeAsync(1000);
  expect(state.find).not.toHaveBeenCalled();
  expect(render()).toBe("");
});
it("rejects Keep/Replace after the draft was edited away and back to the same bytes", async () => {
  editing = true;
  value.departureTime = "12:00";
  state.find.mockImplementation(async (request) =>
    result(request, [
      {
        field: "departureLocalTime",
        value: "13:00",
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
  const replace = state.nodes.find(
    (entry) => entry.label === "flightLookup.replace",
  ).onPress;
  value = { ...value, departureTime: "15:00" };
  render();
  value = { ...value, departureTime: "12:00" };
  render();
  replace();
  expect(apply).not.toHaveBeenCalled();
});
it("requires explicit adoption even for an empty field", async () => {
  editing = true;
  state.find.mockImplementation(async (request) =>
    result(request, [
      {
        field: "departureLocalTime",
        value: "12:00",
        eligibility: "ADOPT",
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
  state.nodes.find((entry) => entry.label === "flightLookup.adopt").onPress();
  expect(apply).toHaveBeenCalledExactlyOnceWith({ departureTime: "12:00" });
});
it("budget rejection preserves manual input and never retries automatically", async () => {
  editing = true;
  const original = structuredClone(value);
  state.find.mockImplementation(async (request) => ({
    ...result(request),
    failureReason: "BUDGET_REJECTED",
  }));
  render();
  await flush();
  render();
  state.nodes[0].onPress();
  await flush();
  expect(render()).toContain("flightLookup.budget");
  expect(value).toEqual(original);
  expect(apply).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(5000);
  expect(state.find).toHaveBeenCalledOnce();
});
it.each(["Cancel", "Trip"] as const)(
  "retired %s lookup cannot show late suggestions",
  async (change) => {
    editing = true;
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
    render();
    const signal = state.find.mock.calls[0][1];
    if (change === "Cancel")
      state.nodes.find((entry) => entry.label === "common.cancel").onPress();
    else {
      tripId = "other-trip";
      render();
      await flush();
    }
    expect(signal.aborted).toBe(true);
    finish();
    await flush();
    render();
    expect(
      state.nodes.find((entry) => entry.label === "flightLookup.adopt"),
    ).toBeUndefined();
    expect(apply).not.toHaveBeenCalled();
  },
);

it("UNKNOWN remains explicit after Cancel and never starts another request for the same identity", async () => {
  const original = structuredClone(value);
  state.find.mockImplementation(async (request) => ({
    ...result(request),
    status: "UNAVAILABLE",
    failureReason: "UNKNOWN",
  }));
  render();
  await flush();
  render();
  await vi.advanceTimersByTimeAsync(600);
  await flush();
  let html = render();
  expect(html).toContain("flightLookup.unknown");
  expect(html).not.toContain("flightLookup.manual");
  expect(state.nodes[0].disabled).toBe(true);
  state.nodes.find((node) => node.label === "common.cancel").onPress();
  html = render();
  expect(html).toContain("flightLookup.unknown");
  expect(html).not.toContain("flightLookup.manual");
  await vi.advanceTimersByTimeAsync(5000);
  expect(state.find).toHaveBeenCalledOnce();
  expect(state.uuid).toBe(1);
  expect(apply).not.toHaveBeenCalled();
  expect(value).toEqual(original);
});
it("pending metering uses semantic text while suggestions remain explicitly adoptable", async () => {
  editing = true;
  state.textColor = "semantic-dark-primary";
  state.find.mockImplementation(async (request) => ({
    ...result(request, [
      {
        field: "departureLocalTime",
        value: "12:00",
        eligibility: "ADOPT",
        referenceOnly: false,
      },
    ]),
    usage: { metering: "PENDING" },
  }));
  render();
  await flush();
  render();
  state.nodes[0].onPress();
  await flush();
  const html = render();
  expect(html).toContain("flightLookup.usagePending");
  expect(html).toContain("color:semantic-dark-primary");
  expect(apply).not.toHaveBeenCalled();
  const adopt = state.nodes.find((node) => node.label === "flightLookup.adopt");
  expect(adopt.disabled).toBe(false);
  adopt.onPress();
  expect(apply).toHaveBeenCalledExactlyOnceWith({ departureTime: "12:00" });
  expect(render()).toContain("flightLookup.usagePending");
  await vi.advanceTimersByTimeAsync(5000);
  expect(state.find).toHaveBeenCalledOnce();
});

it("shows each candidate source, observation and date applicability before explicit adoption", async () => {
  state.find.mockImplementation(async (request) =>
    result(request, [
      {
        field: "departureLocalTime",
        value: "12:00",
        eligibility: "ADOPT",
        referenceOnly: false,
      },
    ]),
  );
  render();
  await flush();
  render();
  state.nodes[0].onPress();
  await flush();
  const html = render();
  expect(html).toContain("https://example.test/synthetic-flight-schedule");
  expect(html).toContain("2026-10-26T12:00:00.000Z");
  expect(html).toContain("2026-10-27");
  expect(html).toContain("Synthetic QA flight schedule");
  expect(apply).not.toHaveBeenCalled();
  state.nodes.find((n) => n.label === "flightLookup.adopt").onPress();
  expect(apply).toHaveBeenCalledWith({ departureTime: "12:00" });
});

it("shows a dated conflict as reference only and keeps original fields unchanged", async () => {
  value.originCode = "AKL";
  state.find.mockImplementation(async (request) => {
    const evidence = result(request, [
      {
        field: "departureAirport",
        value: "NRT",
        eligibility: "KEEP_OR_REPLACE",
        referenceOnly: true,
        reason: "EXISTING_VALUE_CONFLICT",
      },
    ]).suggestions[0];
    return { ...result(request), status: "REFERENCE_ONLY", references: [evidence] };
  });
  render();
  await flush();
  render();
  state.nodes[0].onPress();
  await flush();
  const html = render();
  expect(html).toContain("https://example.test/synthetic-flight-schedule");
  expect(html).toContain("flightLookup.reason.EXISTING_VALUE_CONFLICT");
  expect(
    state.nodes.some(
      (n) => n.label === "flightLookup.adopt" || n.label === "flightLookup.replace",
    ),
  ).toBe(false);
  expect(value.originCode).toBe("AKL");
  expect(apply).not.toHaveBeenCalled();
});

it("holds a contradictory airport/zone result with sources and no actionable adoption", async () => {
  state.find.mockImplementation(async (request) =>
    result(request, [
      {
        field: "departureAirport",
        value: "AKL",
        eligibility: "ADOPT",
        referenceOnly: false,
      },
      {
        field: "departureTimezone",
        value: "America/Los_Angeles",
        eligibility: "ADOPT",
        referenceOnly: false,
      },
      {
        field: "departureLocalTime",
        value: "12:00",
        eligibility: "ADOPT",
        referenceOnly: false,
      },
    ]),
  );
  render();
  await flush();
  render();
  state.nodes[0].onPress();
  await flush();
  const html = render();
  expect(html).toContain("flightLookup.inconsistent");
  expect(html).toContain("https://example.test/synthetic-flight-schedule");
  expect(
    state.nodes.some(
      (n) => n.label === "flightLookup.adopt" || n.label === "flightLookup.replace",
    ),
  ).toBe(false);
  expect(apply).not.toHaveBeenCalled();
});
it("does not render another account generation's source details", async () => {
  state.find.mockImplementation(async (request) =>
    result(request, [
      {
        field: "departureLocalTime",
        value: "12:00",
        eligibility: "ADOPT",
        referenceOnly: false,
      },
    ]),
  );
  render();
  await flush();
  render();
  state.nodes[0].onPress();
  await flush();
  expect(render()).toContain("synthetic-flight-schedule");
  state.generation++;
  expect(render()).toBe("");
  expect(apply).not.toHaveBeenCalled();
});

it("clears a retired Trip's displayed source before checking the next Trip capability", async () => {
  state.find.mockImplementation(async (request) =>
    result(request, [
      {
        field: "departureLocalTime",
        value: "12:00",
        eligibility: "ADOPT",
        referenceOnly: false,
      },
    ]),
  );
  render();
  await flush();
  render();
  state.nodes[0].onPress();
  await flush();
  expect(render()).toContain("synthetic-flight-schedule");
  const retiredAdopt = state.nodes.find((n) => n.label === "flightLookup.adopt").onPress;
  tripId = "another-trip";
  expect(render()).not.toContain("synthetic-flight-schedule");
  retiredAdopt();
  await flush();
  expect(render()).not.toContain("synthetic-flight-schedule");
  expect(apply).not.toHaveBeenCalled();
});
