import { expect, it, vi } from "vitest";
import { loadP1Detail } from "./p1DetailRead";
import { localP1Presentation } from "./localP1Presentation";
const tripId = "b15408f3-5bda-4a09-a95c-37b9f475871f";
const itemId = "ba095b25-e4ee-4b4c-8bf8-065065df6bce";
const input = { tripId, itemId, generation: 5, occurrence: "START" as const };
const item = () => ({
  itemId,
  tripId,
  itemRevision: 2,
  family: "P1",
  hidden: false,
  status: "planned",
  localState: "PENDING",
  title: "Authored plan",
  description: "Original note",
  schedule: {
    start: {
      localDate: "2026-10-25",
      localTime: "10:30",
      quality: "ESTIMATED",
      comparable: false,
    },
  },
  place: { authoredLabel: "Garden" },
  participation: { mode: "WHOLE_GROUP", personIds: [] },
  documentSummaries: [],
});
const scope = { accountId: "account", tripId, generation: 5 };
function setup() {
  const record = item();
  const result = {
    scope,
    observed: null,
    localManual: { scope, items: [record] },
  } as any;
  const draft = { itemId, mode: "EDIT", fields: {}, participantOptions: [] };
  const repository = { read: vi.fn(async () => draft) } as any;
  const ports = {
    read: vi.fn(async () => result),
    repository: vi.fn(async () => repository),
    generation: () => 5,
  };
  return { record, result, draft, repository, ports };
}
it("reads only the real scoped Item and enables Edit only after repository qualification", async () => {
  const { record, draft, repository, ports } = setup(),
    bytes = JSON.stringify(record);
  const state = await loadP1Detail(input, ports);
  expect(repository.read).toHaveBeenCalledWith(tripId, itemId, 2);
  expect(state?.editor?.draft).toBe(draft);
  expect(state?.presentation.facts).toMatchObject({
    pending: true,
    note: "Original note",
    participation: { mode: "WHOLE_GROUP" },
  });
  expect(state?.presentation.display.clocks).toMatchObject({
    primary: "10:30",
    start: { local_time: "10:30", qualified: false },
  });
  expect(JSON.stringify(record)).toBe(bytes);
});
it("keeps readable facts when Edit is denied", async () => {
  const { ports, repository } = setup();
  repository.read.mockRejectedValue(new Error("MANUAL_PLAN_UNAVAILABLE"));
  expect((await loadP1Detail(input, ports))?.editor).toBeNull();
});
it("drops a deferred Reader response after an account switch without reading an edit draft", async () => {
  const { ports, result } = setup();
  let generation = 5,
    finish!: (result: any) => void;
  ports.generation = () => generation;
  ports.read = vi.fn(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const pending = loadP1Detail(input, ports);
  generation = 6;
  finish(result);
  expect(await pending).toBeNull();
  expect(ports.repository).not.toHaveBeenCalled();
});
it("drops a deferred edit draft after an account switch", async () => {
  const { ports, repository, draft } = setup();
  let generation = 5,
    finish!: (draft: any) => void;
  ports.generation = () => generation;
  repository.read = vi.fn(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const pending = loadP1Detail(input, ports);
  for (let i = 0; i < 4; i++) await Promise.resolve();
  generation = 6;
  finish(draft);
  expect(await pending).toBeNull();
});
it.each(["scope", "account", "hidden", "family", "revision", "historical"])(
  "rejects %s results without granting Edit",
  async (kind) => {
    const { ports, result, record } = setup();
    if (kind === "scope") result.scope = { ...scope, generation: 6 };
    if (kind === "account") result.localManual.scope = { ...scope, accountId: "other" };
    if (kind === "hidden") record.hidden = true;
    if (kind === "family") record.family = "P3";
    if (kind === "revision") record.itemRevision = 0;
    if (kind === "historical") {
      result.localManual = null;
      result.observed = {
        sourceStatus: "HISTORICAL_ACCEPTED_PROJECTION",
        projection: { version: 2, items: [record] },
      };
    }
    const value = await loadP1Detail(input, ports).catch(() => null);
    expect(value).toBeNull();
    expect(ports.repository).not.toHaveBeenCalled();
  },
);
it("does not invent media, Expense counts or an end for a point P1", () => {
  const props = localP1Presentation(item() as any)!;
  expect(props.display.clocks.end).toBeUndefined();
  expect(props.facts.expenseIds).toBeUndefined();
  expect(props.facts.photoIds).toBeUndefined();
  expect(props.facts.documentIds).toEqual([]);
});

it("uses a current actor-filtered accepted projection and retains local-target pending truth", async () => {
  const { result, record, ports } = setup();
  record.localState = "ACCEPTED";
  result.localManual = null;
  result.observed = {
    sourceStatus: "CURRENTLY_MATCHES_SOURCE",
    projection: {
      version: 2,
      accountId: "account",
      tripId,
      generation: 5,
      items: [record],
      source: { localTargetIds: [itemId] },
    },
  };
  expect((await loadP1Detail(input, ports))?.presentation.facts.pending).toBe(true);
  result.observed.projection.generation = 4;
  expect(await loadP1Detail(input, ports).catch(() => null)).toBeNull();
});
