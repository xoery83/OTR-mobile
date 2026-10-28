import { randomUUID, createHash } from "node:crypto";
import { expect, it, vi } from "vitest";
import {
  createGuestP1DraftInventory,
  guestP1DraftInventory,
  type GuestP1DraftParticipant,
} from "./guestP1DraftInventory";
import { requireCommittedGuestPrincipal } from "./authRepository";
import { getAccountGeneration } from "./accountGeneration";

vi.mock("./authRepository", () => ({ requireCommittedGuestPrincipal: vi.fn() }));

const scope = () => ({ kind: "GUEST" as const, localId: randomUUID(), generation: 1 });
function participant() {
  const snapshot: ReturnType<GuestP1DraftParticipant["freeze"]>["snapshot"] = {
    schemaId: "otr.auth.guest-p1-draft/1",
    tripId: randomUUID(),
    itemId: randomUUID(),
    mode: "CREATE",
    fields: {
      title: "未保存旅程",
      startDate: "",
      startTime: null,
      endDate: null,
      endTime: null,
      location: null,
      description: null,
      participation: { mode: "WHOLE_GROUP", people: [], selfPersonId: null },
    },
    initialFields: {} as never,
    firstAttempt: null,
    placeSelection: null,
  };
  const resume = vi.fn();
  const isCurrent = vi.fn(() => true);
  const freeze = vi.fn(() => ({ snapshot, resume, isCurrent }));
  return { freeze, snapshot, resume, isCurrent };
}

it("pins canonical P1 draft bytes without saving, and releases the same participant once", async () => {
  const check = vi.fn(async () => {});
  const inventory = createGuestP1DraftInventory(check),
    draft = participant(),
    source = scope();
  inventory.register(draft);
  const lease = await inventory.freeze(source);
  expect(lease.entries).toHaveLength(1);
  const entry = lease.entries[0];
  expect(entry.id).toBe(draft.snapshot.itemId);
  expect(entry.bytes).toBe(Buffer.byteLength(entry.canonicalText));
  expect(entry.sha256).toBe(
    createHash("sha256").update(entry.canonicalText).digest("hex"),
  );
  expect(JSON.parse(entry.canonicalText).fields.title).toBe("未保存旅程");
  await expect(inventory.freeze(source)).rejects.toThrow("GUEST_DRAFT_HANDOFF_ACTIVE");
  await lease.resume();
  await lease.resume();
  expect(draft.resume).toHaveBeenCalledOnce();
});

it("rejects the wrong Guest before touching any editor", async () => {
  const inventory = createGuestP1DraftInventory(async () => {
    throw Error("WRONG_GUEST");
  });
  const draft = participant();
  inventory.register(draft);
  await expect(inventory.freeze(scope())).rejects.toThrow("WRONG_GUEST");
  expect(draft.freeze).not.toHaveBeenCalled();
});

it("rolls back all earlier UI freezes when another editor cannot safely participate", async () => {
  const inventory = createGuestP1DraftInventory(async () => {}),
    first = participant();
  inventory.register(first);
  const remove = inventory.register({
    freeze() {
      throw Error("SAVE_UNKNOWN");
    },
  });
  await expect(inventory.freeze(scope())).rejects.toThrow("SAVE_UNKNOWN");
  expect(first.resume).toHaveBeenCalledOnce();
  remove();
  const lease = await inventory.freeze(scope());
  await lease.resume();
});

it("invalidates collection on unmount and releases UI locks even when resume reports a stale lease", async () => {
  const inventory = createGuestP1DraftInventory(async () => {}),
    draft = participant();
  const remove = inventory.register(draft),
    source = scope();
  const lease = await inventory.freeze(source);
  remove();
  await expect(lease.assertCurrent()).rejects.toThrow("GUEST_DRAFT_HANDOFF_CHANGED");
  await expect(lease.resume()).rejects.toThrow("GUEST_DRAFT_HANDOFF_CHANGED");
  expect(draft.resume).toHaveBeenCalledOnce();
  const empty = await inventory.freeze(source);
  expect(empty.entries).toEqual([]);
  await empty.resume();
});

it("retains only one snapshot per item and resumes both editors on duplicate registration", async () => {
  const inventory = createGuestP1DraftInventory(async () => {}),
    first = participant(),
    second = participant();
  second.snapshot.itemId = first.snapshot.itemId;
  inventory.register(first);
  inventory.register(second);
  await expect(inventory.freeze(scope())).rejects.toThrow("GUEST_DRAFT_DUPLICATE_ITEM");
  expect(first.resume).toHaveBeenCalledOnce();
  expect(second.resume).toHaveBeenCalledOnce();
});

it("rechecks identity after asynchronous hashing and restores original UI state on rejection", async () => {
  let checks = 0;
  const inventory = createGuestP1DraftInventory(async () => {
    if (++checks > 1) throw Error("ACCOUNT_CHANGED");
  });
  const draft = participant();
  inventory.register(draft);
  await expect(inventory.freeze(scope())).rejects.toThrow("ACCOUNT_CHANGED");
  expect(draft.resume).toHaveBeenCalledOnce();
});

it("uses the committed Guest object and real generation in the default registry", async () => {
  const source = { ...scope(), generation: getAccountGeneration() };
  vi.mocked(requireCommittedGuestPrincipal).mockResolvedValue({
    kind: "GUEST",
    localId: source.localId,
  });
  const lease = await guestP1DraftInventory.freeze(source);
  await lease.resume();
  vi.mocked(requireCommittedGuestPrincipal).mockResolvedValue({
    kind: "GUEST",
    localId: randomUUID(),
  });
  await expect(guestP1DraftInventory.freeze(source)).rejects.toThrow(
    "GUEST_DRAFT_SCOPE_CHANGED",
  );
});

it("releases concurrent resume calls once and cannot let old cleanup unlock a new handoff", async () => {
  const inventory = createGuestP1DraftInventory(async () => {}),
    draft = participant(),
    source = scope();
  inventory.register(draft);
  const old = await inventory.freeze(source);
  const results = await Promise.allSettled([old.resume(), old.resume()]);
  expect(results.some((result) => result.status === "fulfilled")).toBe(true);
  expect(draft.resume).toHaveBeenCalledOnce();
  const current = await inventory.freeze(source);
  await old.resume();
  await expect(inventory.freeze(source)).rejects.toThrow("GUEST_DRAFT_HANDOFF_ACTIVE");
  await current.resume();
  expect(draft.resume).toHaveBeenCalledTimes(2);
});
