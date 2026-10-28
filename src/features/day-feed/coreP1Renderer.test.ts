import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { createCoreP1Renderer } from "./coreP1Renderer";
import { composeDayStream } from "./composition";
import {
  applyCoreCommand,
  emptyCoreGraph,
  type CoreActor,
} from "@/domain/trip/tripCoreV2Mutation";
import { coreDefaults } from "@/domain/trip/tripCoreV2";
import { coreDateBoundary } from "@/domain/trip/tripCoreV2Temporal";
import { projectCoreP1P3Feed } from "@/domain/trip/tripCoreV2P1P3DayFeed";
vi.mock("./P1Row", () => ({ P1Row: () => null }));
const date = "2027-01-16";
function read() {
  const actor: CoreActor = {
    accountId: randomUUID(),
    tripId: randomUUID(),
    personId: null,
    personIds: [],
    active: true,
    canManageShared: true,
  };
  const id = randomUUID();
  const graph = applyCoreCommand(
    emptyCoreGraph(),
    {
      contractVersion: 2,
      intentVersion: 2,
      operationId: randomUUID(),
      tripId: actor.tripId,
      command: "CREATE_ITEM",
      target: { kind: "ITEM", id },
      baseVector: [{ kind: "ITEM", id, revision: null }],
      admission: { mode: "MANUAL", sourceIntentId: null, policyVersion: null },
      payload: {
        family: "P1",
        core: { title: "Authored P1", description: "Original local note" },
        schedule: { start: coreDateBoundary(date), end: coreDateBoundary("2027-01-17") },
        ...coreDefaults("organizer"),
      },
    },
    actor,
    "2027-01-01T00:00:00Z",
  ).graph;
  const projection = projectCoreP1P3Feed(
    graph,
    actor,
    {
      generation: 1,
      epoch: "fixture",
      revision: "1",
      accessRevision: 1,
      actorPersonBindingHash: "fixture",
      participatingRosterHash: "fixture",
      manifestSha256: "fixture",
    },
    [],
  );
  const row = composeDayStream(projection.query(date, "UTC"), "2027-01-16T12:00:00Z", {
    occurrenceFocus: true,
  }).rows[0];
  return { graph, projection, row };
}
function rendered(
  projection: ReturnType<typeof read>["projection"],
  row: ReturnType<typeof read>["row"],
) {
  const element = createCoreP1Renderer(projection)({
    row,
    container: undefined,
    context: "TODAY",
    depth: "F",
    onDepth: vi.fn(),
  }) as any;
  return element ? element.type(element.props).props : null;
}
it("maps the existing actor-filtered Core P1 view without fixture facts or writes", () => {
  const { graph, projection, row } = read(),
    bytes = JSON.stringify(graph);
  const props = rendered(projection, row);
  expect(props.event.id).toBe(projection.items[0].itemId);
  expect(props.facts).toMatchObject({
    note: "Original local note",
    participation: { mode: "WHOLE_GROUP" },
    documentIds: [],
  });
  expect(props.facts.photoIds).toBeUndefined();
  expect(props.facts.expenseIds).toBeUndefined();
  expect(props.actions).toBeUndefined();
  expect(JSON.stringify(graph)).toBe(bytes);
});
it.each(["stale", "hidden", "different-trip"])(
  "rejects %s supplemental facts",
  (kind) => {
    const { projection, row } = read();
    if (kind === "stale") projection.items[0].itemRevision = 99;
    if (kind === "hidden") projection.items[0].hidden = true;
    if (kind === "different-trip") projection.items[0].tripId = randomUUID();
    expect(rendered(projection, row)).toBeNull();
  },
);
it("keeps the cross-day END as the same Item and uses the END presentation", () => {
  const { projection } = read();
  const end = composeDayStream(
    projection.query("2027-01-17", "UTC"),
    "2027-01-17T12:00:00Z",
    { occurrenceFocus: true },
  ).rows.find((row) => row.item.roles.includes("END"))!;
  expect(rendered(projection, end).occurrence).toBe("END");
  expect(rendered(projection, end).event.id).toBe(projection.items[0].itemId);
});
it("never treats expense-link identities as Expense IDs or grants Document open", () => {
  const { projection, row } = read();
  projection.items[0].expenseLinkIds = [randomUUID(), randomUUID()];
  const props = rendered(projection, row);
  expect(props.facts.expenseIds).toBeUndefined();
  expect(props.actions).toBeUndefined();
});

it("forwards the owning insert callback with the actual Item/date and clock", () => {
  const { projection, row } = read();
  const onInsert = vi.fn(),
    instant = "2027-01-01T12:00:00Z";
  const element = createCoreP1Renderer(projection, {
    instant,
    onInsert,
    insertionToday: date,
  })({
    row,
    container: undefined,
    context: "FUTURE",
    depth: "F",
    onDepth: vi.fn(),
  }) as any;
  const props = element.type(element.props).props;
  expect(props.instant).toBe(instant);
  expect(props.insertionToday).toBe(date);
  props.onInsert("AFTER");
  expect(onInsert).toHaveBeenCalledWith(projection.items[0].itemId, "AFTER", date);
});
