import { expect, it, vi } from "vitest";
import { loadP6Detail } from "./p6DetailRead";
const tripId = "a0000000-0000-4000-8000-000000000001",
  itemId = "a0000000-0000-4000-8000-000000000003";
const input = { tripId, itemId, generation: 5 };
function context(itemChanges = {}) {
  const item = {
    itemId,
    tripId,
    itemRevision: 1,
    family: "P6",
    title: "Activity",
    hidden: false,
    status: "planned",
    localState: "PENDING",
    schedule: {
      start: {
        localDate: "2026-10-25",
        localTime: "16:00",
        quality: "EXACT",
        precision: 0,
        comparable: false,
      },
      end: {
        localDate: "2026-10-28",
        localTime: "10:00",
        quality: "EXACT",
        precision: 0,
        comparable: false,
      },
    },
    details: {},
    participation: { mode: "WHOLE_GROUP", personIds: [] },
    documentSummaries: [],
    bookingSummaries: [],
    ...itemChanges,
  };
  return {
    scope: { generation: 5, accountId: "account" },
    observed: null,
    localManual: {
      scope: { generation: 5, accountId: "account", tripId },
      items: [item],
    },
  } as any;
}
it("shows the current actor-scoped Activity read while an unavailable edit capability stays closed", async () => {
  const result = await loadP6Detail(input, {
    read: async () => context(),
    repository: async () => {
      throw Error("closed");
    },
    generation: () => 5,
  });
  expect(result?.presentation).toMatchObject({
    title: "Activity",
    facts: {
      family: "P6",
      start: { date: "2026-10-25" },
      end: { date: "2026-10-28" },
    },
    pending: true,
  });
  expect(result?.editor).toBeNull();
});
it.each([
  { hidden: true },
  { family: "P2" },
  { itemRevision: 0 },
  { status: "cancelled" },
])("rejects unavailable or other-family item facts: %j", async (changes) => {
  await expect(
    loadP6Detail(input, {
      read: async () => context(changes),
      repository: vi.fn(),
      generation: () => 5,
    }),
  ).rejects.toThrow("P6_UNAVAILABLE");
});
it("does not expose a previous account's read after account generation changes", async () => {
  let generation = 5;
  const result = await loadP6Detail(input, {
    read: async () => {
      generation = 6;
      return context();
    },
    repository: vi.fn(),
    generation: () => generation,
  });
  expect(result).toBeNull();
});
it("binds Edit to the exact Repository draft rather than granting it from readable fields", async () => {
  const draft = { itemId, fields: {} },
    repository = { read: vi.fn(async () => draft) } as any;
  const result = await loadP6Detail(input, {
    read: async () => context(),
    repository: async () => repository,
    generation: () => 5,
  });
  expect(repository.read).toHaveBeenCalledWith(tripId, itemId, 1);
  expect(result?.editor).toEqual({ repository, draft });
});

it("preserves sparse authorized activity without manufacturing arrival date", async () => {
  const result = await loadP6Detail(input, {
    read: async () => context({ schedule: { start: { localDate: "2026-10-25" } } }),
    repository: async () => {
      throw Error("closed");
    },
    generation: () => 5,
  });
  expect(result?.presentation.facts.end?.date).toBeUndefined();
});
it("publishes readable facts before slow Edit qualification", async () => {
  let release!: () => void;
  const readable = vi.fn();
  const promise = loadP6Detail(input, {
    read: async () => context(),
    repository: async () => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      throw Error("closed");
    },
    generation: () => 5,
    onReadable: readable,
  });
  await new Promise((resolve) => setImmediate(resolve));
  expect(readable).toHaveBeenCalledOnce();
  release();
  await promise;
});
