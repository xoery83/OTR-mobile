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

it("passes exact Claim admission to SQL and rejects missing proof before link", async () => {
  const f = fixture(),
    personId = randomUUID(),
    inviteId = randomUUID();
  const admission = { operationId: randomUUID(), intentDigest: "b".repeat(64) };
  await f.port.atomic(f.scope, (tx) =>
    tx.link(personId, f.scope.actorAccountId, inviteId, admission),
  );
  expect(
    vi.mocked(f.lease.query).mock.calls.find(([, args]) => args?.[0] === "link")?.[1],
  ).toEqual(["link", JSON.stringify({ personId, inviteId, ...admission })]);
  const invalid = fixture();
  await expect(
    invalid.port.atomic(invalid.scope, (tx) =>
      tx.link(personId, invalid.scope.actorAccountId, inviteId, undefined as never),
    ),
  ).rejects.toThrow();
  expect(
    vi.mocked(invalid.lease.query).mock.calls.some(([, args]) => args?.[0] === "link"),
  ).toBe(false);
  expect(invalid.statements()).not.toContain("COMMIT");
});

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
      void tx.link(randomUUID(), f.scope.actorAccountId, randomUUID(), {
        operationId: randomUUID(),
        intentDigest: "a".repeat(64),
      });
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
      pending = tx.link(randomUUID(), f.scope.actorAccountId, randomUUID(), {
        operationId: randomUUID(),
        intentDigest: "a".repeat(64),
      });
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

it.each(["LEASE", "RPC", "COMMIT"])(
  "records only safe %s diagnostics while retaining transaction failure semantics",
  async (stage) => {
    const f = fixture(),
      failure = Object.assign(Error("UNIT_CREDENTIAL_DO_NOT_LOG"), {
        code: "42501",
        detail: "UNIT_PAYLOAD_DO_NOT_LOG",
      });
    const original = vi.mocked(f.lease.query).getMockImplementation()!;
    vi.mocked(f.lease.query).mockImplementation(async (sql, args) => {
      if (
        (stage === "RPC" && args?.[0] === "lock") ||
        (stage === "COMMIT" && sql === "COMMIT")
      )
        throw failure;
      return original(sql, args);
    });
    const port =
      stage === "LEASE"
        ? createTripMemberClaimPgPort(
            {
              withLease: async () => {
                throw failure;
              },
            },
            { inviteExpiresAt: "2027-01-01T00:00:00Z" },
          )
        : f.port;
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    try {
      await expect(port.atomic(f.scope, async () => true)).rejects.toBe(failure);
      expect(log).toHaveBeenCalledOnce();
      expect(JSON.parse(String(log.mock.calls[0][0]))).toEqual({
        event: "member_claim_pg_failed",
        stage,
        lastRpcMethod: stage === "LEASE" ? null : "lock",
        sqlState: "42501",
      });
      expect(JSON.stringify(log.mock.calls)).not.toMatch(
        new RegExp(
          `UNIT_CREDENTIAL|UNIT_PAYLOAD|${f.scope.actorAccountId}|${f.scope.tripId}`,
        ),
      );
      if (stage === "RPC") expect(f.statements().at(-1)).toBe("ROLLBACK");
      if (stage === "COMMIT") {
        expect(f.statements()).not.toContain("ROLLBACK");
        expect(f.lease.retire).toHaveBeenCalledOnce();
      }
    } finally {
      log.mockRestore();
    }
  },
);

it("does not emit arbitrary error codes as SQLSTATE", async () => {
  const f = fixture(),
    log = vi.spyOn(console, "info").mockImplementation(() => {});
  vi.mocked(f.lease.query).mockRejectedValueOnce(
    Object.assign(Error("PRIVATE_ERROR"), { code: "UNIT_EMAIL_OR_SECRET_DO_NOT_LOG" }),
  );
  try {
    await expect(f.port.atomic(f.scope, async () => true)).rejects.toThrow(
      "PRIVATE_ERROR",
    );
    expect(JSON.parse(String(log.mock.calls[0][0]))).toMatchObject({
      stage: "BEGIN",
      sqlState: null,
    });
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/UNIT_EMAIL|PRIVATE_ERROR/);
  } finally {
    log.mockRestore();
  }
});

it.each(["logger", "code-getter"])(
  "preserves original COMMIT UNKNOWN when %s diagnostics fail",
  async (mode) => {
    const f = fixture(),
      original = Error("ORIGINAL_COMMIT_RESPONSE_LOST");
    if (mode === "code-getter")
      Object.defineProperty(original, "code", {
        get() {
          throw Error("GETTER_FAILED");
        },
      });
    const log = vi.spyOn(console, "info").mockImplementation(() => {
      if (mode === "logger") throw Error("LOGGER_FAILED");
    });
    const query = vi.mocked(f.lease.query).getMockImplementation()!;
    vi.mocked(f.lease.query).mockImplementation(async (sql, args) => {
      if (sql === "COMMIT") throw original;
      return query(sql, args);
    });
    try {
      await expect(f.port.atomic(f.scope, async () => true)).rejects.toBe(original);
      expect(f.statements().filter((s) => s === "COMMIT")).toHaveLength(1);
      expect(f.statements()).not.toContain("ROLLBACK");
      expect(f.lease.retire).toHaveBeenCalledOnce();
    } finally {
      log.mockRestore();
    }
  },
);
