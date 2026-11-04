import { afterEach, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import {
  advanceAccountGeneration,
  getAccountGeneration,
} from "@/data/auth/accountGeneration";
import { guestP1DraftInventory } from "@/data/auth/guestP1DraftInventory";
import {
  retainGuestStayEditor,
  type GuestStayEditorMemory,
} from "./guestStayEditorLease";
const state = vi.hoisted(() => ({ localId: "" }));
vi.mock("@/data/auth/authRepository", () => ({
  requireCommittedGuestPrincipal: async () => ({ kind: "GUEST", localId: state.localId }),
}));
afterEach(() => advanceAccountGeneration());
const fixture = () => {
  state.localId = randomUUID();
  return {
    kind: "GUEST" as const,
    localId: state.localId,
    generation: getAccountGeneration(),
  };
};
it("blocks beforeAuth without emitting any fabricated P1 snapshot and recovers the same in-memory Stay draft", async () => {
  const scope = fixture(),
    trip = randomUUID();
  const lease = retainGuestStayEditor(scope, trip);
  const original = {
    source: { draft: { itemId: randomUUID() } },
    fields: { title: "Unsaved local stay" },
    initial: "original",
  } as unknown as GuestStayEditorMemory;
  lease.acquire();
  lease.retain(() => original);
  expect(() => lease.acquire()).toThrow("GUEST_P3_EDITOR_BUSY");
  await expect(guestP1DraftInventory.freeze(scope)).rejects.toThrow(
    "GUEST_ADOPTION_PREFLIGHT_REQUIRED",
  );
  // A modal unmount does not unregister or replace the original Form identity.
  lease.detach();
  const remounted = retainGuestStayEditor(scope, trip);
  remounted.acquire();
  expect(remounted).toBe(lease);
  expect(remounted.recover()).toBe(original);
  expect(remounted.recover()?.source.draft.itemId).toBe(original.source.draft.itemId);
  remounted.release(); // explicit discard
  const empty = await guestP1DraftInventory.freeze(scope);
  expect(empty.entries).toEqual([]);
  await empty.resume();
});
it("does not share another Trip or generation's private Form memory", async () => {
  const scope = fixture(),
    trip = randomUUID();
  const old = retainGuestStayEditor(scope, trip);
  old.retain(() => ({ fields: { title: "Private" } }) as GuestStayEditorMemory);
  const other = retainGuestStayEditor(scope, randomUUID());
  expect(other.recover()).toBeNull();
  advanceAccountGeneration();
  expect(old.recover()).toBeNull();
  expect(other.recover()).toBeNull();
  const current = { ...scope, generation: getAccountGeneration() };
  const empty = await guestP1DraftInventory.freeze(current);
  expect(empty.entries).toEqual([]);
  await empty.resume();
});
