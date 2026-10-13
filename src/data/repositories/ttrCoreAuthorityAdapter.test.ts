import { expect, it, vi } from "vitest";
import { getAccountGeneration } from "@/data/auth/accountGeneration";
import { ttrFixture } from "@/domain/trip/__fixtures__/ttr";
import type { CoreQualifiedTtrRead } from "./tripCoreV2Repository";
import { createTtrCoreAuthorityAdapter } from "./ttrCoreAuthorityAdapter";

const orderId = "40000000-0000-4000-8000-000000000001";
const now = "2026-10-11T12:00:00Z";

function fixture() {
  const input = ttrFixture();
  input.scope.generation = getAccountGeneration();
  input.to!.endpoint!.coordinates!.longitude = 0; // Equal geometry is not authority.
  input.period = "UNKNOWN";
  delete input.spatialEquivalence;
  const ctx = { ...input.scope };
  const read = {
    version: "otr-core-ttr-input/1",
    status: "QUALIFIED",
    input,
    authorityKey: "opaque-capture",
    spatial: {
      equivalence: "UNKNOWN",
      proximityAuthority: "GEOMETRY_ONLY",
      annotations: [{ accepted_access_note: "private" }],
    },
    authority: {
      scope: ctx,
      personId: "50000000-0000-4000-8000-000000000001",
      branchId: "branch-1",
      order: { id: orderId, revision: 1 },
      collection: { access_revision: 7 },
      refreshGeneration: 1,
      from: { eventId: input.from!.eventId },
      to: { eventId: input.to!.eventId },
      coverage: "NONE_PROVEN",
      expiry: input.expiry,
    },
  } as unknown as CoreQualifiedTtrRead;
  let leaseCurrent = true;
  const lease = {
    envelope: read,
    isCurrent: () => leaseCurrent,
    ifCurrent(emit: () => undefined) {
      if (!leaseCurrent) return false;
      if (emit() !== undefined) throw new Error("CORE_TTR_ASYNC_HANDOFF_FORBIDDEN");
      return true;
    },
  };
  const core = {
    readTtr: vi.fn(async () => read),
    revalidateTtrWithinTransaction: vi.fn(async () => true),
    guardTtrPublication: vi.fn(async (_ctx, _order, _from, _to, _read, handoff) => {
      handoff(lease);
      return { status: "CURRENT" as const };
    }),
  };
  const adapter = createTtrCoreAuthorityAdapter(
    core as unknown as Parameters<typeof createTtrCoreAuthorityAdapter>[0],
    () => now,
  );
  return { input, ctx, read, core, adapter, lease, revoke: () => (leaseCurrent = false) };
}

it("maps Core UNKNOWN and 0m to visible TTR without exposing private annotations", async () => {
  const f = fixture();
  const value = await f.adapter.capture(
    f.ctx,
    orderId,
    f.input.from!.eventId,
    f.input.to!.eventId,
  );
  expect(value.status).toBe("QUALIFIED");
  if (value.status !== "QUALIFIED") return;
  expect(value.relation.accessRevision).toBe(7);
  expect(value.relation.input.spatialEquivalence).toEqual({ equivalence: "UNKNOWN" });
  expect(value.projection.visibility).toBe("STRAIGHT_LINE");
  expect(value.projection.geometricDistance?.meters).toBe(0);
  expect(JSON.stringify(value)).not.toContain("private");
  expect(f.core.readTtr).toHaveBeenCalledWith(
    f.ctx,
    orderId,
    f.input.from!.eventId,
    f.input.to!.eventId,
  );
  expect(await f.adapter.isCurrentRelation(f.ctx, value.relation)).toBe(true);
  expect(f.core.revalidateTtrWithinTransaction).toHaveBeenCalledWith(
    f.ctx,
    orderId,
    f.input.from!.eventId,
    f.input.to!.eventId,
    f.read,
  );
});

it("fences changed relation, account generation, stale Core and disposed captures", async () => {
  const f = fixture();
  const value = await f.adapter.capture(
    f.ctx,
    orderId,
    f.input.from!.eventId,
    f.input.to!.eventId,
  );
  if (value.status !== "QUALIFIED") throw new Error("Fixture unavailable");
  const changed = structuredClone(value.relation);
  changed.input.anchors.toRowKey = "other-row";
  expect(await f.adapter.isCurrentRelation(f.ctx, changed)).toBe(false);
  expect(
    await f.adapter.isCurrentRelation(
      { ...f.ctx, generation: f.ctx.generation + 1 },
      value.relation,
    ),
  ).toBe(false);
  expect(await f.adapter.guardAfterCommit(f.ctx, changed, () => undefined)).toEqual({
    status: "STALE",
    reason: "AUTHORITY_CHANGED",
  });
  expect(f.core.guardTtrPublication).not.toHaveBeenCalled();
  f.core.revalidateTtrWithinTransaction.mockResolvedValue(false);
  expect(await f.adapter.isCurrentRelation(f.ctx, value.relation)).toBe(false);
  value.relation.input.anchors.toRowKey = "mutated-return-value";
  expect(await f.adapter.isCurrentRelation(f.ctx, value.relation)).toBe(false);
  f.adapter.dispose();
  expect(await f.adapter.isCurrentRelation(f.ctx, value.relation)).toBe(false);
});

it("uses the post-commit Core lease and preserves stale publication results", async () => {
  const f = fixture();
  const value = await f.adapter.capture(
    f.ctx,
    orderId,
    f.input.from!.eventId,
    f.input.to!.eventId,
  );
  if (value.status !== "QUALIFIED") throw new Error("Fixture unavailable");
  let received = 0;
  const result = await f.adapter.guardAfterCommit(f.ctx, value.relation, (lease) => {
    const accepted = lease.ifCurrent(() => {
      received++;
      return undefined;
    });
    if (accepted) received++;
    return undefined;
  });
  expect(result).toEqual({ status: "CURRENT" });
  expect(received).toBe(2);
  expect(f.core.guardTtrPublication).toHaveBeenCalledWith(
    f.ctx,
    orderId,
    f.input.from!.eventId,
    f.input.to!.eventId,
    f.read,
    expect.any(Function),
  );
  f.revoke();
  expect(f.lease.ifCurrent(() => undefined)).toBe(false);
  f.core.guardTtrPublication.mockResolvedValue({
    status: "STALE",
    reason: "REFRESH_PENDING",
  } as never);
  expect(
    await f.adapter.guardAfterCommit(f.ctx, value.relation, () => undefined),
  ).toEqual({ status: "STALE", reason: "REFRESH_PENDING" });
  f.core.guardTtrPublication.mockResolvedValue({
    status: "UNAVAILABLE",
    reason: "ACCESS_UNAVAILABLE",
  } as never);
  expect(
    await f.adapter.guardAfterCommit(f.ctx, value.relation, () => undefined),
  ).toEqual({ status: "UNAVAILABLE", reason: "ACCESS_UNAVAILABLE" });
});

it("fails closed on incompatible Core spatial authority or unavailable input", async () => {
  const f = fixture();
  f.core.readTtr.mockResolvedValueOnce({
    version: "otr-core-ttr-input/1",
    status: "UNAVAILABLE",
    reason: "CONTINUITY_UNKNOWN",
  } as never);
  expect(
    await f.adapter.capture(f.ctx, orderId, f.input.from!.eventId, f.input.to!.eventId),
  ).toEqual({
    version: "otr-core-ttr-input/1",
    status: "UNAVAILABLE",
    reason: "CONTINUITY_UNKNOWN",
  });
  f.core.readTtr.mockResolvedValueOnce({
    ...f.read,
    spatial: { ...f.read.spatial, equivalence: "SAME_LOCATION" },
  } as never);
  await expect(
    f.adapter.capture(f.ctx, orderId, f.input.from!.eventId, f.input.to!.eventId),
  ).rejects.toThrow("TTR_CORE_AUTHORITY_INVALID");
  f.core.readTtr.mockResolvedValueOnce({
    ...f.read,
    input: {
      ...f.read.input,
      scope: {
        ...f.read.input.scope,
        tripId: "20000000-0000-4000-8000-000000000099",
      },
    },
  } as never);
  await expect(
    f.adapter.capture(f.ctx, orderId, f.input.from!.eventId, f.input.to!.eventId),
  ).rejects.toThrow("TTR_CORE_AUTHORITY_INVALID");
});

it("withholds a Core handoff when the dormant adapter is disposed during recheck", async () => {
  const f = fixture();
  const value = await f.adapter.capture(
    f.ctx,
    orderId,
    f.input.from!.eventId,
    f.input.to!.eventId,
  );
  if (value.status !== "QUALIFIED") throw new Error("Fixture unavailable");
  let resume!: () => void;
  const waiting = new Promise<void>((resolve) => (resume = resolve));
  f.core.guardTtrPublication.mockImplementation(
    async (_ctx, _order, _from, _to, _read, handoff) => {
      await waiting;
      handoff(f.lease);
      return { status: "CURRENT" };
    },
  );
  const handoff = vi.fn(() => undefined);
  const pending = f.adapter.guardAfterCommit(f.ctx, value.relation, handoff);
  f.adapter.dispose();
  resume();
  expect(await pending).toEqual({ status: "STALE", reason: "AUTHORITY_CHANGED" });
  expect(handoff).not.toHaveBeenCalled();
});
