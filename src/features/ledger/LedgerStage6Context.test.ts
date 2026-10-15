import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { expect, it, vi } from "vitest";
import { createLatestRequest } from "./latestRequest";
import { chooseJourneyEntry } from "@/domain/ledger/journeyContext";

const source = readFileSync(new URL("./LedgerStage6Screen.tsx", import.meta.url), "utf8");
const ast = ts.createSourceFile(
  "screen.tsx",
  source,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
let callback = "";
function find(node: ts.Node) {
  if (
    ts.isVariableDeclaration(node) &&
    node.name.getText(ast) === "loadContext" &&
    node.initializer &&
    ts.isCallExpression(node.initializer)
  )
    callback = node.initializer.arguments[0].getText(ast);
  ts.forEachChild(node, find);
}
find(ast);

// Execute the screen's actual context callback and state setters, as in mountedMyLedgerProbe.
function mountedContext() {
  const a = { journeyId: "A", title: "Trip A" };
  const b = { journeyId: "B", title: "Trip B" };
  const state = {
    projection: { journey: a } as { journey: typeof a } | null,
    journeys: [a],
    loading: false,
    message: null as string | null,
    picker: true,
  };
  const request = createLatestRequest();
  const contextRequest = createLatestRequest();
  const explicitTripRef = { current: "A" };
  const selectedJourneyIdRef = { current: "A" as string | null };
  const initialize = vi.fn(async (_id: string) => {});
  const available = vi.fn(async () => [a, b]);
  const loadProjection = vi.fn(async (journey: typeof a) => {
    state.projection = { journey };
    selectedJourneyIdRef.current = journey.journeyId;
    return true;
  });
  let generation = 1;
  function load(target: string) {
    explicitTripRef.current = target;
    const env = {
      explicitTrip: target,
      explicitTripRef,
      contextRequest,
      request,
      memberRequest: createLatestRequest(),
      getAccountGeneration: () => generation,
      captureAccountScope: async () => ({ generation }),
      requireActiveUserId: async () => "actor",
      readLocalTripRepository: async () => ({ initializeLocalLedger: initialize }),
      getDefaultLedgerReportingRepository: async () => ({
        listJourneys: available,
        getSelectedJourneyId: async () => "A",
      }),
      chooseJourneyEntry,
      localToday: () => "2026-10-16",
      manualJourneyId: { current: undefined },
      scopeRef: { current: "MINE" },
      selectedJourneyIdRef,
      selectedMemberIdRef: { current: null },
      loadProjection,
      t: (key: string) => key,
      setProjection: (value: typeof state.projection) => {
        state.projection = value;
      },
      setJourneys: (value: typeof state.journeys) => {
        state.journeys = value;
      },
      setLoading: (value: boolean) => {
        state.loading = value;
      },
      setMessage: (value: string | null) => {
        state.message = value;
      },
      setJourneyPickerOpen: (value: boolean) => {
        state.picker = value;
      },
    };
    const js = ts.transpileModule(`(${callback})`, {
      compilerOptions: { target: ts.ScriptTarget.ES2022 },
    }).outputText;
    return (runInNewContext(js, env) as () => Promise<void>)();
  }
  return {
    state,
    request,
    load,
    initialize,
    available,
    loadProjection,
    a,
    b,
    changeAccount: () => generation++,
  };
}

it.each(["initialization failure", "missing Journey"])(
  "A→unavailable B clears A and ends loading: %s",
  async (failure) => {
    const f = mountedContext();
    const oldRequest = f.request.begin();
    if (failure === "initialization failure")
      f.initialize.mockRejectedValue(new Error("LOCAL_FAILURE"));
    else f.available.mockResolvedValue([f.a]);
    const pending = f.load("B");
    expect(f.state).toMatchObject({
      projection: null,
      journeys: [],
      loading: true,
      picker: false,
    });
    expect(f.request.isCurrent(oldRequest)).toBe(false);
    await pending;
    expect(f.state).toMatchObject({
      projection: null,
      journeys: [],
      loading: false,
      message: "entry.contextUnavailable",
    });
    expect(f.loadProjection).not.toHaveBeenCalled();
    // Explicit unavailable context cannot render the generic My Ledger/Journey destination list.
    expect(source).toContain(") : !explicitTrip ? (");
  },
);

it("A→valid B retains the normal B projection", async () => {
  const f = mountedContext();
  await f.load("B");
  expect(f.initialize).toHaveBeenCalledWith("B");
  expect(f.state).toMatchObject({
    projection: { journey: f.b },
    loading: false,
    message: null,
  });
});

it("late A initialization cannot replace valid B or change its loading/message", async () => {
  const f = mountedContext();
  let finish!: () => void;
  f.initialize.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  const old = f.load("A");
  await vi.waitFor(() => expect(f.initialize).toHaveBeenCalledWith("A"));
  await f.load("B");
  finish();
  await old;
  expect(f.loadProjection).toHaveBeenCalledTimes(1);
  expect(f.state).toMatchObject({
    projection: { journey: f.b },
    loading: false,
    message: null,
  });
});

it("Account generation change fences a late explicit-context failure", async () => {
  const f = mountedContext();
  let fail!: (error: Error) => void;
  f.initialize.mockImplementationOnce(
    () =>
      new Promise<void>((_resolve, reject) => {
        fail = reject;
      }),
  );
  const pending = f.load("B");
  await vi.waitFor(() => expect(f.initialize).toHaveBeenCalledWith("B"));
  f.changeAccount();
  f.state.message = "new account";
  fail(new Error("OLD_FAILURE"));
  await pending;
  expect(f.state.message).toBe("new account");
});
