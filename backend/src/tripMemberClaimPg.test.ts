import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { createTripMemberClaimPgPort } from "./tripMemberClaimPg";
import type { MemberClaimTransaction } from "./tripMemberClaimAuthority";
import type { CorePgLease } from "./tripCoreV2PgStorage";

function fixture(result: unknown = true) {
  const scope = { actorAccountId: randomUUID(), tripId: randomUUID() };
  const lease: CorePgLease = {
    retire: vi.fn(),
    query: vi.fn(async (sql, args) => {
      if (sql.includes("trip_member_claim_transaction"))
        return { rows: [{ result: args?.[0] === "lock" ? true : result }] };
      return { rows: [] };
    }),
  };
  const port = createTripMemberClaimPgPort(
    { withLease: async (work) => work(lease) },
    { inviteExpiresAt: "2027-01-01T00:00:00Z" },
  );
  const statements = () => vi.mocked(lease.query).mock.calls.map(([sql]) => sql);
  return { scope, lease, port, statements };
}

it("commits awaited valid operations and rejects escaped transaction methods without SQL", async () => {
  const f = fixture("READ");
  let escaped!: MemberClaimTransaction;
  expect(
    await f.port.atomic(f.scope, async (tx) => {
      escaped = tx;
      return tx.currentEffectiveAccess(f.scope.actorAccountId);
    }),
  ).toBe("READ");
  expect(f.statements().at(-1)).toBe("COMMIT");
  const calls = f.statements().length;
  await expect(escaped.currentTime()).rejects.toThrow("RELEASED");
  expect(f.statements()).toHaveLength(calls);
});

it("cannot commit a forgotten method await, including a fast malformed SQL result", async () => {
  const f = fixture(false);
  await expect(
    f.port.atomic(f.scope, async (tx) => {
      void tx.link(randomUUID(), f.scope.actorAccountId, randomUUID());
    }),
  ).rejects.toThrow();
  expect(f.statements()).not.toContain("COMMIT");
});

it("retires a lease with still pending SQL and never commits it", async () => {
  const f = fixture();
  let finish!: (value: { rows: { result: boolean }[] }) => void;
  vi.mocked(f.lease.query).mockImplementation(async (sql, args) => {
    if (args?.[0] === "link")
      return new Promise((resolve) => {
        finish = resolve;
      });
    return {
      rows: sql.includes("trip_member_claim_transaction") ? [{ result: true }] : [],
    };
  });
  let pending!: Promise<void>;
  await expect(
    f.port.atomic(f.scope, async (tx) => {
      pending = tx.link(randomUUID(), f.scope.actorAccountId, randomUUID());
    }),
  ).rejects.toThrow();
  expect(f.lease.retire).toHaveBeenCalledTimes(1);
  expect(f.statements()).not.toContain("COMMIT");
  finish({ rows: [{ result: true }] });
  await expect(pending).rejects.toThrow("RELEASED");
});

it("poisons the transaction even if the callback catches actor or schema failures", async () => {
  for (const kind of ["actor", "schema"]) {
    const f = fixture("NOT_AN_ACCESS");
    await expect(
      f.port.atomic(f.scope, async (tx) => {
        await tx
          .currentEffectiveAccess(
            kind === "actor" ? randomUUID() : f.scope.actorAccountId,
          )
          .catch(() => undefined);
      }),
    ).rejects.toThrow();
    expect(f.statements()).not.toContain("COMMIT");
    expect(f.statements()).toContain("ROLLBACK");
  }
});

it("retires on unknown COMMIT without replay or ROLLBACK on the uncertain lease", async () => {
  const f = fixture();
  vi.mocked(f.lease.query).mockImplementation(async (sql) => {
    if (sql === "COMMIT") throw Error("COMMIT_RESPONSE_LOST");
    return {
      rows: sql.includes("trip_member_claim_transaction") ? [{ result: true }] : [],
    };
  });
  await expect(f.port.atomic(f.scope, async () => true)).rejects.toThrow(
    "COMMIT_RESPONSE_LOST",
  );
  expect(f.statements().filter((sql) => sql === "COMMIT")).toHaveLength(1);
  expect(f.statements()).not.toContain("ROLLBACK");
  expect(f.lease.retire).toHaveBeenCalledTimes(1);
});
