import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { coreDefaults } from "@/domain/trip/tripCoreV2";
import { coreDateBoundary } from "@/domain/trip/tripCoreV2Temporal";
import {
  applyCoreCommand,
  emptyCoreGraph,
  type CoreActor,
  type CoreGraph,
} from "@/domain/trip/tripCoreV2Mutation";
import {
  prepareManualStayInstruction,
  readManualStayInstructions,
} from "./manualStayInstructions";
const stamp = "2026-11-05T00:00:00Z";
const ids = () => ({ operationId: randomUUID(), entryId: randomUUID() });
function fixture() {
  const itemId = randomUUID();
  const actor: CoreActor = {
    accountId: randomUUID(),
    tripId: randomUUID(),
    active: true,
    canManageShared: false,
    personId: null,
    personIds: [],
  };
  const graph = applyCoreCommand(
    emptyCoreGraph(),
    {
      contractVersion: 2,
      intentVersion: 2,
      operationId: randomUUID(),
      tripId: actor.tripId,
      command: "CREATE_ITEM",
      target: { kind: "ITEM", id: itemId },
      baseVector: [{ kind: "ITEM", id: itemId, revision: null }],
      admission: { mode: "MANUAL", sourceIntentId: null, policyVersion: null },
      payload: {
        family: "P3",
        core: { title: "QA stay" },
        schedule: {
          start: coreDateBoundary("2026-11-05"),
          end: coreDateBoundary("2026-11-07"),
        },
        ...coreDefaults("member"),
      },
    },
    actor,
    stamp,
  ).graph;
  return { graph, actor, itemId };
}
function append(graph: CoreGraph, actor: CoreActor, itemId: string, body: string) {
  const draft = readManualStayInstructions(graph, actor, itemId);
  const command = prepareManualStayInstruction(
    draft,
    graph,
    actor,
    "checkInInstruction",
    body,
    ids(),
  )!;
  return applyCoreCommand(graph, command, actor, stamp).graph;
}
it("maps manual check-in/out to existing typed ARRIVAL/DEPARTURE commands and Core readback", () => {
  const f = fixture();
  let graph = f.graph;
  for (const [field, section] of [
    ["checkInInstruction", "ARRIVAL"],
    ["checkOutInstruction", "DEPARTURE"],
  ] as const) {
    const draft = readManualStayInstructions(graph, f.actor, f.itemId);
    expect(draft[field]).toMatchObject({ entries: [], value: "", editable: true });
    const command = prepareManualStayInstruction(
      draft,
      graph,
      f.actor,
      field,
      " 手工说明 ",
      ids(),
    )!;
    expect(command.target.kind).toBe("INSTRUCTION");
    expect(command.payload).toMatchObject({
      itemId: f.itemId,
      section,
      body: " 手工说明 ",
      sourceRepresentationId: null,
    });
    graph = applyCoreCommand(graph, command, f.actor, stamp).graph;
    expect(readManualStayInstructions(graph, f.actor, f.itemId)[field].value).toBe(
      " 手工说明 ",
    );
  }
  expect(graph.trip_instruction_entries).toHaveLength(2);
});
it("Keep/omitted/unchanged produce no command; blank is not a clear operation", () => {
  const f = fixture();
  const graph = append(f.graph, f.actor, f.itemId, "Bell at reception");
  const draft = readManualStayInstructions(graph, f.actor, f.itemId);
  for (const value of [undefined, "Bell at reception"])
    expect(
      prepareManualStayInstruction(
        draft,
        graph,
        f.actor,
        "checkInInstruction",
        value,
        ids(),
      ),
    ).toBeNull();
  expect(() =>
    prepareManualStayInstruction(
      draft,
      graph,
      f.actor,
      "checkInInstruction",
      "  ",
      ids(),
    ),
  ).toThrow("READ_ONLY");
});
it("keeps even local null-source heads read-only until owning correction eligibility is available", () => {
  const f = fixture();
  const graph = append(f.graph, f.actor, f.itemId, "Old instructions");
  const draft = readManualStayInstructions(graph, f.actor, f.itemId);
  const oldId = draft.checkInInstruction.entries[0].entryId;
  expect(draft.checkInInstruction).toMatchObject({
    editable: false,
    value: "Old instructions",
  });
  expect(() =>
    prepareManualStayInstruction(
      draft,
      graph,
      f.actor,
      "checkInInstruction",
      "Updated guidance",
      ids(),
    ),
  ).toThrow("READ_ONLY");
  expect(graph.trip_instruction_entries).toHaveLength(1);
  expect(graph.trip_instruction_entries[0]).toMatchObject({
    id: oldId,
    body: "Old instructions",
    source_representation_id: null,
  });
});

it("preserves multiple chains and source identity instead of selecting or flattening", () => {
  const f = fixture();
  const graph = append(f.graph, f.actor, f.itemId, "First chain");
  graph.trip_instruction_entries.push({
    ...graph.trip_instruction_entries[0],
    id: randomUUID(),
    body: "Second chain",
  });
  const draft = readManualStayInstructions(graph, f.actor, f.itemId);
  expect(draft.checkInInstruction).toMatchObject({ editable: false, value: "" });
  expect(draft.checkInInstruction.entries.map((r) => r.body).sort()).toEqual([
    "First chain",
    "Second chain",
  ]);
  expect(() =>
    prepareManualStayInstruction(
      draft,
      graph,
      f.actor,
      "checkInInstruction",
      "flatten",
      ids(),
    ),
  ).toThrow("READ_ONLY");
  graph.trip_instruction_entries.pop();
  const source = randomUUID();
  graph.trip_instruction_entries[0].source_representation_id = source;
  const sourced = readManualStayInstructions(graph, f.actor, f.itemId);
  expect(sourced.checkInInstruction.entries[0].sourceRepresentationId).toBe(source);
  expect(() =>
    prepareManualStayInstruction(
      sourced,
      graph,
      f.actor,
      "checkInInstruction",
      "rewrite",
      ids(),
    ),
  ).toThrow("READ_ONLY");
});
it("rejects stale actor, Trip, parent revision, instruction revision and access state", () => {
  const f = fixture();
  const graph = append(f.graph, f.actor, f.itemId, "Existing guidance");
  const draft = readManualStayInstructions(graph, f.actor, f.itemId);
  for (const mutate of [
    (g: CoreGraph) => {
      g.itinerary_events[0].semantic_revision = 9;
    },
    (g: CoreGraph) => {
      g.trip_instruction_entries[0].revision = 9;
    },
    (g: CoreGraph) => {
      g.trip_instruction_entries[0].hidden_at = stamp;
    },
  ]) {
    const changed = structuredClone(graph);
    mutate(changed);
    expect(() =>
      prepareManualStayInstruction(
        draft,
        changed,
        f.actor,
        "checkInInstruction",
        "new",
        ids(),
      ),
    ).toThrow();
  }
  for (const actor of [
    { ...f.actor, accountId: randomUUID() },
    { ...f.actor, tripId: randomUUID() },
    { ...f.actor, active: false },
    { ...f.actor, canManageShared: true },
  ])
    expect(() =>
      prepareManualStayInstruction(
        draft,
        graph,
        actor,
        "checkInInstruction",
        "new",
        ids(),
      ),
    ).toThrow();
});
it("does not disclose a private instruction through its public parent", () => {
  const f = fixture();
  const graph = append(f.graph, f.actor, f.itemId, "Private guidance");
  graph.itinerary_events[0].visibility = "GROUP";
  graph.trip_instruction_entries[0].visibility = "PRIVATE";
  const other = { ...f.actor, accountId: randomUUID() };
  expect(
    readManualStayInstructions(graph, other, f.itemId).checkInInstruction.entries,
  ).toEqual([]);
});

it("inherits selected parent ACL without inventing participant or instruction identity", () => {
  const f = fixture();
  const person = randomUUID();
  f.graph.itinerary_events[0].visibility = "SELECTED_PERSONS";
  f.graph.trip_item_visibility_people.push({ item_id: f.itemId, person_id: person });
  const draft = readManualStayInstructions(f.graph, f.actor, f.itemId);
  const stable = ids();
  const first = prepareManualStayInstruction(
    draft,
    f.graph,
    f.actor,
    "checkOutInstruction",
    "Leave key",
    stable,
  )!;
  expect(first.payload).toMatchObject({
    acl: { visibility: "SELECTED_PERSONS", people: [person] },
  });
  expect(
    prepareManualStayInstruction(
      draft,
      f.graph,
      f.actor,
      "checkOutInstruction",
      "Leave key",
      stable,
    ),
  ).toEqual(first);
  f.graph.trip_item_visibility_people.length = 0;
  expect(() =>
    prepareManualStayInstruction(
      draft,
      f.graph,
      f.actor,
      "checkOutInstruction",
      "Leave key",
      stable,
    ),
  ).toThrow("STALE");
});
it("rejects an unknown draft and a hidden parent without a write command", () => {
  const f = fixture();
  const draft = readManualStayInstructions(f.graph, f.actor, f.itemId);
  expect(() =>
    prepareManualStayInstruction(
      { ...draft },
      f.graph,
      f.actor,
      "checkInInstruction",
      "new",
      ids(),
    ),
  ).toThrow("DRAFT");
  f.graph.itinerary_events[0].hidden_at = stamp;
  expect(() =>
    prepareManualStayInstruction(
      draft,
      f.graph,
      f.actor,
      "checkInInstruction",
      "new",
      ids(),
    ),
  ).toThrow("SCOPE");
});

it("keeps a Reader-redacted source-linked head read-only instead of treating null as manual proof", async () => {
  const { coreActorReadRecords } =
    await import("../../../backend/src/tripCoreV2Collection");
  const f = fixture();
  const draft = readManualStayInstructions(f.graph, f.actor, f.itemId);
  const command = prepareManualStayInstruction(
    draft,
    f.graph,
    f.actor,
    "checkInInstruction",
    "Source-linked guidance",
    ids(),
  )!;
  const sourceId = randomUUID();
  (command.payload as { sourceRepresentationId: string | null }).sourceRepresentationId =
    sourceId;
  const graph = applyCoreCommand(f.graph, command, f.actor, stamp).graph;
  const record = coreActorReadRecords(graph, f.actor).find(
    (r) => r.kind === "INSTRUCTION",
  )!;
  const body = record.body as Record<string, unknown>;
  expect(body.source_representation_id).toBeNull();
  expect(graph.trip_instruction_entries[0].source_representation_id).toBe(sourceId);
  const readerGraph = structuredClone(graph);
  readerGraph.trip_instruction_entries = [body];
  const redacted = readManualStayInstructions(readerGraph, f.actor, f.itemId);
  expect(redacted.checkInInstruction.editable).toBe(false);
  expect(
    prepareManualStayInstruction(
      redacted,
      readerGraph,
      f.actor,
      "checkInInstruction",
      undefined,
      ids(),
    ),
  ).toBeNull();
  expect(() =>
    prepareManualStayInstruction(
      redacted,
      readerGraph,
      f.actor,
      "checkInInstruction",
      "replace linked guidance",
      ids(),
    ),
  ).toThrow("READ_ONLY");
});

it("rejects blank new instructions without writing a clear or duplicate append", () => {
  const f = fixture();
  const draft = readManualStayInstructions(f.graph, f.actor, f.itemId);
  expect(() =>
    prepareManualStayInstruction(
      draft,
      f.graph,
      f.actor,
      "checkInInstruction",
      "  ",
      ids(),
    ),
  ).toThrow("EMPTY_NOT_CLEAR");
  expect(f.graph.trip_instruction_entries).toEqual([]);
});
