import { expect, it, vi } from "vitest";
import { loadP3Detail } from "./p3DetailRead";
const tripId = "a0000000-0000-4000-8000-000000000001",
  itemId = "a0000000-0000-4000-8000-000000000003";
const input = { tripId, itemId, generation: 5, occurrence: "CHECKIN" as const };
function context(itemChanges = {}) {
  const item = {
    itemId,
    tripId,
    itemRevision: 1,
    family: "P3",
    title: "Hotel",
    hidden: false,
    status: "planned",
    localState: "PENDING",
    schedule: {
      start: { localDate: "2026-10-25", localTime: "16:00", comparable: false },
      end: { localDate: "2026-10-28", localTime: "10:00", comparable: false },
    },
    details: {},
    participation: { mode: "WHOLE_GROUP", personIds: [] },
    documentSummaries: [],
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
it("shows the current actor-scoped Stay read while an unavailable edit capability stays closed", async () => {
  const result = await loadP3Detail(input, {
    read: async () => context(),
    repository: async () => {
      throw Error("closed");
    },
    generation: () => 5,
  });
  expect(result?.presentation).toMatchObject({
    id: itemId,
    checkinTime: "16:00",
    checkoutTime: "10:00",
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
    loadP3Detail(input, {
      read: async () => context(changes),
      repository: vi.fn(),
      generation: () => 5,
    }),
  ).rejects.toThrow("P3_UNAVAILABLE");
});
it("does not expose a previous account's read after account generation changes", async () => {
  let generation = 5;
  const result = await loadP3Detail(input, {
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
  const result = await loadP3Detail(input, {
    read: async () => context(),
    repository: async () => repository,
    generation: () => 5,
  });
  expect(repository.read).toHaveBeenCalledWith(tripId, itemId, 1);
  expect(result?.editor).toEqual({ repository, draft });
});
