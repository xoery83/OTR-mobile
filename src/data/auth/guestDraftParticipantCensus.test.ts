import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { createGuestDraftInventory, type GuestDraftScope } from "./guestDraftInventory";
import { createGuestTripDraftInventory } from "./guestTripDraftInventory";
import { createGuestP1DraftInventory } from "./guestP1DraftInventory";
vi.mock("./authRepository", () => ({ requireCommittedGuestPrincipal: vi.fn() }));
const scope = (): GuestDraftScope => ({
  kind: "GUEST",
  localId: randomUUID(),
  generation: 3,
});
function fixture(check = vi.fn(async (_scope: GuestDraftScope) => {})) {
  const registry = createGuestDraftInventory(
    check,
    "unit-guest-registry/1",
    (s: { tripId: string; id: string }) => s.id,
  );
  const resume = vi.fn(),
    isCurrent = vi.fn(() => true);
  const freeze = vi.fn(() => ({
    snapshot: { id: randomUUID(), tripId: randomUUID() },
    resume,
    isCurrent,
  }));
  return { registry, check, participant: { freeze }, freeze, resume, isCurrent };
}
it("returns frozen zero/one registration metadata and monotonic registration version without touching editors", async () => {
  const f = fixture(),
    s = scope();
  const zero = await f.registry.readParticipantCensus(s);
  expect(zero).toMatchObject({
    registeredParticipantCount: 0,
    registrationVersion: 0,
    handoffActive: false,
  });
  const unregister = f.registry.register(f.participant);
  const one = await f.registry.readParticipantCensus(s);
  expect(one).toMatchObject({
    registeredParticipantCount: 1,
    registrationVersion: 1,
    registrySchemaId: "unit-guest-registry/1",
  });
  expect(Object.isFrozen(one)).toBe(true);
  expect(Object.isFrozen(one.scope)).toBe(true);
  expect(Object.keys(one).sort()).toEqual(
    [
      "handoffActive",
      "registeredParticipantCount",
      "registrationVersion",
      "registrySchemaId",
      "schemaId",
      "scope",
    ].sort(),
  );
  expect(f.freeze).not.toHaveBeenCalled();
  expect(f.resume).not.toHaveBeenCalled();
  expect(f.isCurrent).not.toHaveBeenCalled();
  unregister();
  unregister();
  expect(await f.registry.readParticipantCensus(s)).toMatchObject({
    registeredParticipantCount: 0,
    registrationVersion: 2,
  });
});
it("observation does not lock registration or alter subsequent freeze/resume semantics", async () => {
  const f = fixture(),
    s = scope();
  await f.registry.readParticipantCensus(s);
  const unregister = f.registry.register(f.participant);
  const lease = await f.registry.freeze(s);
  expect(lease.entries).toHaveLength(1);
  await lease.resume();
  expect(f.freeze).toHaveBeenCalledOnce();
  expect(f.resume).toHaveBeenCalledOnce();
  expect((await f.registry.readParticipantCensus(s)).registrationVersion).toBe(1);
  unregister();
  const empty = f.registry.freezeEmpty();
  empty.assertCurrent();
  empty.release();
  expect((await f.registry.readParticipantCensus(s)).registrationVersion).toBe(2);
});
it("rejects stale scope before and after observation instead of returning0", async () => {
  const f = fixture(),
    s = scope();
  f.check.mockRejectedValueOnce(Error("GUEST_DRAFT_SCOPE_CHANGED"));
  await expect(f.registry.readParticipantCensus(s)).rejects.toThrow("SCOPE_CHANGED");
  f.check
    .mockResolvedValueOnce(undefined)
    .mockRejectedValueOnce(Error("GUEST_DRAFT_SCOPE_CHANGED"));
  await expect(f.registry.readParticipantCensus(s)).rejects.toThrow("SCOPE_CHANGED");
});
it.each(["register", "unregister", "empty-handoff", "handoff-aba"])(
  "rejects %s changes between scope awaits",
  async (mode) => {
    const f = fixture(),
      s = scope();
    let release: (() => void) | undefined;
    if (mode === "unregister") release = f.registry.register(f.participant);
    f.check.mockResolvedValueOnce(undefined).mockImplementationOnce(async () => {
      if (mode === "register") f.registry.register(f.participant);
      if (mode === "unregister") release!();
      if (mode === "empty-handoff") {
        const lease = f.registry.freezeEmpty();
        release = () => lease.release();
      }
      if (mode === "handoff-aba") {
        const lease = f.registry.freezeEmpty();
        lease.release();
      }
    });
    await expect(f.registry.readParticipantCensus(s)).rejects.toThrow("CENSUS_CHANGED");
    release?.();
  },
);
it("never reports an empty snapshot while empty or regular handoff is active", async () => {
  const f = fixture(),
    s = scope(),
    empty = f.registry.freezeEmpty();
  await expect(f.registry.readParticipantCensus(s)).rejects.toThrow("HANDOFF_ACTIVE");
  empty.release();
  const lease = await f.registry.freeze(s);
  await expect(f.registry.readParticipantCensus(s)).rejects.toThrow("HANDOFF_ACTIVE");
  await lease.resume();
  expect((await f.registry.readParticipantCensus(s)).registeredParticipantCount).toBe(0);
});
it("copies caller scope and exposes the same leaf through existing Trip/P1 factories", async () => {
  const s = { ...scope() },
    check = vi.fn(async (_scope: GuestDraftScope) => {}),
    f = fixture(check);
  const expected = { ...s };
  const reading = f.registry.readParticipantCensus({
    ...s,
    unexpectedPrivateField: "unit-only-no-echo",
  } as GuestDraftScope);
  s.localId = randomUUID();
  expect((await reading).scope).toEqual(expected);
  expect(check).toHaveBeenCalledWith(expected);
  for (const registry of [
    createGuestTripDraftInventory(async () => {}),
    createGuestP1DraftInventory(async () => {}),
  ])
    expect(
      (await registry.readParticipantCensus(scope())).registeredParticipantCount,
    ).toBe(0);
});
it("failed normal freeze still clears its existing state and does not invent registration changes", async () => {
  const f = fixture(),
    s = scope();
  f.check.mockRejectedValueOnce(Error("STALE"));
  await expect(f.registry.freeze(s)).rejects.toThrow("STALE");
  expect(await f.registry.readParticipantCensus(s)).toMatchObject({
    registeredParticipantCount: 0,
    registrationVersion: 0,
  });
});
