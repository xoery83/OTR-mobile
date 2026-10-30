import { expect, it } from "vitest";
import { createGuestDraftInventory } from "./guestDraftInventory";
function registry() {
  return createGuestDraftInventory<{ tripId: string }, "unit">(
    async () => {},
    "unit",
    (s) => s.tripId,
  );
}
const participant = {
  freeze: () => ({
    snapshot: { tripId: "unused" },
    isCurrent: () => true,
    resume: () => {},
  }),
};
it("requires no participants, retains them on rejection and allows normal discard", () => {
  const r = registry(),
    unregister = r.register(participant);
  expect(() => r.freezeEmpty()).toThrow("PREFLIGHT_REQUIRED");
  unregister();
  const lease = r.freezeEmpty();
  lease.assertCurrent();
  lease.release();
});
it("blocks a late registration and invalidates the zero snapshot", () => {
  const r = registry(),
    lease = r.freezeEmpty();
  expect(() => r.register(participant)).toThrow("HANDOFF_ACTIVE");
  expect(() => lease.assertCurrent()).toThrow("HANDOFF_CHANGED");
  lease.release();
  const unregister = r.register(participant);
  unregister();
  const next = r.freezeEmpty();
  next.assertCurrent();
  next.release();
});
it("releases without needing a Guest generation check and cannot be replayed", () => {
  const r = registry(),
    lease = r.freezeEmpty();
  lease.release();
  lease.release();
  expect(() => lease.assertCurrent()).toThrow("HANDOFF_CHANGED");
  const next = r.freezeEmpty();
  expect(() => r.freezeEmpty()).toThrow("PREFLIGHT_REQUIRED");
  next.release();
});
