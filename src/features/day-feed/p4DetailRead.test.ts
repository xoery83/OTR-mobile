import { rentalTemporalContext } from "./rentalReadPresentation";
import { expect, it, vi } from "vitest";
import { loadP4Detail } from "./p4DetailRead";
const tripId = "a0000000-0000-4000-8000-000000000001",
  itemId = "a0000000-0000-4000-8000-000000000003";
const input = { tripId, itemId, generation: 5, occurrence: "PICKUP" as const };
function context(itemChanges = {}) {
  const item = {
    itemId,
    tripId,
    itemRevision: 1,
    family: "P4",
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
it("shows the current actor-scoped Rental read while an unavailable edit capability stays closed", async () => {
  const result = await loadP4Detail(input, {
    read: async () => context(),
    repository: async () => {
      throw Error("closed");
    },
    generation: () => 5,
  });
  expect(result?.presentation).toMatchObject({
    title: "Hotel",
    facts: {
      family: "P4",
      pickup: { date: "2026-10-25" },
      return: { date: "2026-10-28" },
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
    loadP4Detail(input, {
      read: async () => context(changes),
      repository: vi.fn(),
      generation: () => 5,
    }),
  ).rejects.toThrow("P4_UNAVAILABLE");
});
it("does not expose a previous account's read after account generation changes", async () => {
  let generation = 5;
  const result = await loadP4Detail(input, {
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
  const result = await loadP4Detail(input, {
    read: async () => context(),
    repository: async () => repository,
    generation: () => 5,
  });
  expect(repository.read).toHaveBeenCalledWith(tripId, itemId, 1);
  expect(result?.editor).toEqual({ repository, draft });
});

it("does not relabel sparse pickup facts as a Return occurrence", async () => {
  await expect(
    loadP4Detail(
      { ...input, occurrence: "RETURN" },
      {
        read: async () => context({ schedule: { start: { localDate: "2026-10-25" } } }),
        repository: vi.fn(),
        generation: () => 5,
      },
    ),
  ).rejects.toThrow("P4_UNAVAILABLE");
});

it("uses each known endpoint zone across device midnight and retains Floating fallback", () => {
  const facts = {
    family: "P4" as const,
    pickup: { date: "2026-10-26", zone: "America/New_York" },
    return: { date: "2026-10-28", zone: "Pacific/Auckland" },
  };
  const instant = "2026-10-26T16:00:00Z";
  expect(rentalTemporalContext(facts, "PICKUP", instant, "2026-10-27")).toBe("TODAY");
  expect(rentalTemporalContext(facts, "RETURN", instant, "2026-10-26")).toBe("FUTURE");
  expect(
    rentalTemporalContext(
      { ...facts, pickup: { date: "2026-10-27" } },
      "PICKUP",
      instant,
      "2026-10-27",
    ),
  ).toBe("TODAY");
  expect(
    rentalTemporalContext(
      { ...facts, return: undefined },
      "RETURN",
      instant,
      "2026-10-27",
    ),
  ).toBe("UNKNOWN");
});

it("publishes validated readable content before slow edit qualification", async () => {
  const ports = { read: async () => context(), repository: vi.fn(), generation: () => 5 };
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const onReadable = vi.fn();
  const result = loadP4Detail(input, {
    ...ports,
    repository: async () => {
      await gate;
      throw Error("closed");
    },
    onReadable,
  });
  for (let i = 0; i < 6; i++) await Promise.resolve();
  expect(onReadable).toHaveBeenCalledWith(
    expect.objectContaining({ itemId, editor: null }),
  );
  release();
  expect((await result)?.editor).toBeNull();
});
