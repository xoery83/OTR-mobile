import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { coreDefaults } from "./tripCoreV2";
import { validateCoreCommand, type CoreCommand } from "./tripCoreV2Commands";
import { coreDateBoundary } from "./tripCoreV2Temporal";
import {
  applyCoreCommand,
  emptyCoreGraph,
  type CoreActor,
  type CoreGraph,
} from "./tripCoreV2Mutation";
import {
  resolveCoreInstructionParentForSubmit,
  CoreInstructionScopeError,
} from "./tripCoreInstructionParent";

const now = "2026-11-05T00:00:00Z";
function fixture() {
  const actor: CoreActor = {
    accountId: randomUUID(),
    tripId: randomUUID(),
    personId: null,
    personIds: [],
    active: true,
    canManageShared: false,
  };
  const itemId = randomUUID();
  const command = (
    name: string,
    id: string,
    payload: unknown,
    baseVector: { kind: string; id: string; revision: number | null }[],
    kind = "INSTRUCTION",
  ) =>
    validateCoreCommand({
      contractVersion: 2,
      intentVersion: 2,
      operationId: randomUUID(),
      tripId: actor.tripId,
      command: name,
      target: { kind, id },
      baseVector: baseVector.sort((a, b) =>
        `${a.kind}:${a.id}`.localeCompare(`${b.kind}:${b.id}`),
      ),
      admission: { mode: "MANUAL", sourceIntentId: null, policyVersion: null },
      payload,
    });
  const create = (id: string) =>
    command(
      "CREATE_ITEM",
      id,
      {
        family: "P3",
        core: { title: "Synthetic Stay" },
        schedule: {
          start: coreDateBoundary("2026-12-14"),
          end: coreDateBoundary("2026-12-17"),
        },
        ...coreDefaults("member"),
      },
      [{ kind: "ITEM", id, revision: null }],
      "ITEM",
    );
  const graph = applyCoreCommand(emptyCoreGraph(), create(itemId), actor, now).graph;
  const entryId = randomUUID(),
    newEntryId = randomUUID();
  const append = command(
    "APPEND_INSTRUCTION",
    entryId,
    {
      itemId,
      section: "ARRIVAL",
      body: "Ring reception.",
      sensitivity: "NORMAL",
      sourceRepresentationId: null,
      acl: { visibility: "GROUP", people: [] },
    },
    [
      { kind: "INSTRUCTION", id: entryId, revision: null },
      { kind: "ITEM", id: itemId, revision: 1 },
    ],
  );
  const appended = applyCoreCommand(graph, append, actor, now).graph;
  const correct = command(
    "CORRECT_INSTRUCTION",
    entryId,
    {
      newEntryId,
      body: "Use side reception bell.",
      sensitivity: "NORMAL",
      acl: { visibility: "GROUP", people: [] },
    },
    [
      { kind: "INSTRUCTION", id: entryId, revision: 1 },
      { kind: "INSTRUCTION", id: newEntryId, revision: null },
      { kind: "ITEM", id: itemId, revision: 2 },
    ],
  );
  return { actor, graph, append, appended, correct, itemId, entryId, newEntryId, create };
}
type Fixture = ReturnType<typeof fixture>;
const resolve = (f: Fixture, graph: CoreGraph, command: unknown, actor = f.actor) =>
  resolveCoreInstructionParentForSubmit(graph, actor, command, now);

it.each(["append", "correct"] as const)(
  "resolves legal %s parent P3 and exposes the exact Native familyundefined RED cause",
  (kind) => {
    const f = fixture(),
      graph = kind === "append" ? f.graph : f.appended,
      command = f[kind];
    const before = structuredClone(graph),
      commandBefore = structuredClone(command);
    // Exact old consumer expression from Native b562: entry ID is not ITEM ID.
    expect(
      graph.itinerary_events.find((r) => r.id === command.target.id)?.experience_family,
    ).toBeUndefined();
    const scope = resolve(f, graph, command);
    expect(scope).toEqual({ parentItemId: f.itemId, family: "P3", section: "ARRIVAL" });
    expect(["P1"].includes(scope.family)).toBe(false);
    expect(graph).toEqual(before); // Canonical preview is discarded, not committed.
    expect(command).toEqual(commandBefore);
  },
);

it("resolves the actual immutable correction chain without claiming Source or handwritten eligibility", () => {
  const f = fixture();
  const graph = applyCoreCommand(f.appended, f.correct, f.actor, now).graph;
  const nextEntry = randomUUID();
  const next = validateCoreCommand({
    ...f.correct,
    operationId: randomUUID(),
    target: { kind: "INSTRUCTION", id: f.newEntryId },
    baseVector: [
      { kind: "INSTRUCTION", id: f.newEntryId, revision: 1 },
      { kind: "INSTRUCTION", id: nextEntry, revision: null },
      { kind: "ITEM", id: f.itemId, revision: 3 },
    ].sort((a, b) => `${a.kind}:${a.id}`.localeCompare(`${b.kind}:${b.id}`)),
    payload: { ...(f.correct.payload as object), newEntryId: nextEntry },
  });
  const sourceId = randomUUID();
  for (const row of graph.trip_instruction_entries) {
    row.source_representation_id = sourceId;
    row.field_state = {
      "trip_instruction_entries.body": {
        state: "KNOWN",
        origin: "SOURCE",
        protected: false,
        changed_revision: 1,
        evidence_ref: null,
      },
    };
  }
  expect(resolve(f, graph, next)).toEqual({
    parentItemId: f.itemId,
    family: "P3",
    section: "ARRIVAL",
  });
  expect(
    graph.trip_instruction_entries.every((r) => r.source_representation_id === sourceId),
  ).toBe(true);
  // Scope classification does not produce an eligibility/provenance boolean.
  expect(Object.keys(resolve(f, graph, next)).sort()).toEqual([
    "family",
    "parentItemId",
    "section",
  ]);
});

const mutations: Record<
  string,
  (f: Fixture) => { graph: CoreGraph; command: unknown; actor?: CoreActor }
> = {
  "missing parent": (f) => {
    f.graph.itinerary_events = [];
    return { graph: f.graph, command: f.append };
  },
  "unknown family": (f) => {
    f.graph.itinerary_events[0].experience_family = "P7";
    return { graph: f.graph, command: f.append };
  },
  "foreign actor": (f) => ({
    graph: f.graph,
    command: f.append,
    actor: { ...f.actor, accountId: randomUUID() },
  }),
  "inactive actor": (f) => ({
    graph: f.graph,
    command: f.append,
    actor: { ...f.actor, active: false },
  }),
  "cross Trip command": (f) => ({
    graph: f.graph,
    command: { ...f.append, tripId: randomUUID() },
  }),
  "cross Trip parent": (f) => {
    f.graph.itinerary_events[0].trip_id = randomUUID();
    return { graph: f.graph, command: f.append };
  },
  "hidden parent": (f) => {
    f.graph.itinerary_events[0].hidden_at = now;
    return { graph: f.graph, command: f.append };
  },
  "cancelled parent": (f) => {
    f.graph.itinerary_events[0].status = "cancelled";
    return { graph: f.graph, command: f.append };
  },
  "same family wrong APPEND parent": (f) => {
    const other = randomUUID();
    return {
      graph: applyCoreCommand(f.graph, f.create(other), f.actor, now).graph,
      command: {
        ...f.append,
        payload: { ...(f.append.payload as object), itemId: other },
      },
    };
  },
  "same family wrong CORRECT parent": (f) => {
    const other = randomUUID();
    const graph = applyCoreCommand(f.appended, f.create(other), f.actor, now).graph;
    graph.trip_instruction_entries[0].event_id = other;
    return { graph, command: f.correct };
  },
  "stale parent": (f) => {
    f.graph.itinerary_events[0].semantic_revision = 2;
    return { graph: f.graph, command: f.append };
  },
  "stale entry": (f) => {
    f.appended.trip_instruction_entries[0].revision = 2;
    return { graph: f.appended, command: f.correct };
  },
  "missing target entry": (f) => ({ graph: f.graph, command: f.correct }),
  "duplicate entry": (f) => {
    f.appended.trip_instruction_entries.push(
      structuredClone(f.appended.trip_instruction_entries[0]),
    );
    return { graph: f.appended, command: f.correct };
  },
  "duplicate parent": (f) => {
    f.graph.itinerary_events.push(structuredClone(f.graph.itinerary_events[0]));
    return { graph: f.graph, command: f.append };
  },
  "foreign entry": (f) => {
    f.appended.trip_instruction_entries[0].trip_id = randomUUID();
    return { graph: f.appended, command: f.correct };
  },
  "private foreign entry": (f) => {
    f.appended.trip_instruction_entries[0].owner_account_id = randomUUID();
    f.appended.trip_instruction_entries[0].visibility = "PRIVATE";
    return { graph: f.appended, command: f.correct };
  },
  "readable unmanaged entry": (f) => {
    f.appended.trip_instruction_entries[0].owner_account_id = randomUUID();
    return { graph: f.appended, command: f.correct };
  },
  "hidden entry": (f) => {
    f.appended.trip_instruction_entries[0].hidden_at = now;
    return { graph: f.appended, command: f.correct };
  },
  "entry cycle": (f) => {
    f.appended.trip_instruction_entries[0].supersedes_id = f.entryId;
    return { graph: f.appended, command: f.correct };
  },
  "unknown predecessor": (f) => {
    f.appended.trip_instruction_entries[0].supersedes_id = randomUUID();
    return { graph: f.appended, command: f.correct };
  },
  "already applied append": (f) => ({ graph: f.appended, command: f.append }),
  "already applied correction": (f) => ({
    graph: applyCoreCommand(f.appended, f.correct, f.actor, now).graph,
    command: f.correct,
  }),
  "missing new entry null base": (f) => ({
    graph: f.appended,
    command: {
      ...f.correct,
      baseVector: f.correct.baseVector.filter((v) => v.id !== f.newEntryId),
    },
  }),
  "unrelated extra base": (f) => ({
    graph: f.graph,
    command: {
      ...f.append,
      baseVector: [
        ...f.append.baseVector,
        { kind: "ITEM", id: randomUUID(), revision: null },
      ].sort((a, b) => `${a.kind}:${a.id}`.localeCompare(`${b.kind}:${b.id}`)),
    },
  }),
  "unproven source admission": (f) => ({
    graph: f.graph,
    command: {
      ...f.append,
      admission: {
        mode: "REVIEWED_SOURCE",
        sourceIntentId: randomUUID(),
        policyVersion: null,
      },
    },
  }),
};
it.each(Object.entries(mutations))(
  "fails closed on %s without mutation",
  (_name, mutate) => {
    const f = fixture(),
      { graph, command, actor } = mutate(f),
      before = structuredClone(graph);
    expect(() => resolve(f, graph, command, actor)).toThrow(
      "CORE_INSTRUCTION_SCOPE_UNRESOLVED",
    );
    expect(graph).toEqual(before);
  },
);

it("rejects a mismatched chain section, a fork and a missing predecessor even when another visible P3 exists", () => {
  for (const kind of ["section", "fork", "missing"] as const) {
    const f = fixture(),
      graph = applyCoreCommand(f.appended, f.correct, f.actor, now).graph;
    const last = randomUUID();
    const next: CoreCommand = validateCoreCommand({
      ...f.correct,
      operationId: randomUUID(),
      target: { kind: "INSTRUCTION", id: f.newEntryId },
      baseVector: [
        { kind: "INSTRUCTION", id: f.newEntryId, revision: 1 },
        { kind: "INSTRUCTION", id: last, revision: null },
        { kind: "ITEM", id: f.itemId, revision: 3 },
      ].sort((a, b) => `${a.kind}:${a.id}`.localeCompare(`${b.kind}:${b.id}`)),
      payload: { ...(f.correct.payload as object), newEntryId: last },
    });
    if (kind === "section") graph.trip_instruction_entries[0].section = "DEPARTURE";
    if (kind === "fork")
      graph.trip_instruction_entries.push({
        ...graph.trip_instruction_entries[1],
        id: randomUUID(),
      });
    if (kind === "missing")
      graph.trip_instruction_entries = graph.trip_instruction_entries.filter(
        (r) => r.id !== f.entryId,
      );
    expect(() => resolve(f, graph, next)).toThrow("CORE_INSTRUCTION_SCOPE_UNRESOLVED");
  }
});

it("maps malformed/schema-invalid requests to the typed neutral error without input bodies", () => {
  const f = fixture();
  for (const command of [
    null,
    {},
    { ...f.append, target: { kind: "ITEM", id: f.entryId } },
    { ...f.append, payload: { ...(f.append.payload as object), body: "" } },
  ]) {
    try {
      resolve(f, f.graph, command);
      throw Error("TEST_EXPECTED_DENIAL");
    } catch (error) {
      expect(error).toBeInstanceOf(CoreInstructionScopeError);
      expect((error as CoreInstructionScopeError).code).toBe(
        "CORE_INSTRUCTION_SCOPE_UNRESOLVED",
      );
      expect((error as Error).message).toBe("CORE_INSTRUCTION_SCOPE_UNRESOLVED");
      expect((error as Error).cause).toBeUndefined();
    }
  }
});
it("does not hide unexpected programmer faults behind a scope refusal", () => {
  const f = fixture();
  Object.defineProperty(f.graph, "itinerary_events", {
    get() {
      throw Error("TEST_PROGRAMMER_FAULT");
    },
  });
  expect(() => resolve(f, f.graph, f.append)).toThrow("TEST_PROGRAMMER_FAULT");
});
