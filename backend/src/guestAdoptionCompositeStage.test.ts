import { expect, it, vi, afterEach } from "vitest";
import { randomUUID } from "node:crypto";
import { fixture } from "./guestAdoptionCompositePlan.fixture";
import { stageGuestAdoptionComposite } from "./guestAdoptionCompositeStage";
import type { CorePgConnection } from "./tripCoreV2PgStorage";
afterEach(() => vi.useRealTimers());
async function harness() {
  const f = fixture(),
    checkpoint = await f.source();
  let row: { plan_text: unknown; plan_sha256: unknown } | undefined;
  let failCommit = false,
    wrongActor = false;
  const retired = vi.fn(),
    statements: string[] = [];
  const connection: CorePgConnection = {
    withLease: async (work) =>
      work({
        retire: retired,
        query: async (sql, values = []) => {
          statements.push(sql);
          if (sql.startsWith("INSERT"))
            row ??= { plan_text: values[7], plan_sha256: values[6] };
          if (sql.startsWith("SELECT")) return { rows: row && !wrongActor ? [row] : [] };
          if (sql === "COMMIT" && failCommit) throw Error("response lost");
          return { rows: [] };
        },
      }),
  };
  const owning = { grant: f.grant, preparationSha256: checkpoint.sha256 };
  return {
    f,
    checkpoint,
    owning,
    connection,
    retired,
    statements,
    commitUnknown: () => {
      failCommit = true;
    },
    actorMismatch: () => {
      wrongActor = true;
    },
    alterRow: () => {
      row!.plan_sha256 = "c".repeat(64);
    },
    stage: () => stageGuestAdoptionComposite(connection, f.user, owning, checkpoint),
  };
}
it("persists the exact qualified plan with parameterized bindings and exact retry", async () => {
  const f = await harness(),
    first = await f.stage();
  expect(await f.stage()).toEqual(first);
  expect(first.authority).toBe("NONE");
  expect(f.statements.filter((s) => s === "BEGIN")).toHaveLength(2);
  expect(f.statements.filter((s) => s === "COMMIT")).toHaveLength(2);
  expect(f.statements.find((s) => s.startsWith("INSERT"))).toContain(
    "ON CONFLICT (adoption_id) DO NOTHING",
  );
  expect(f.statements.find((s) => s.startsWith("SELECT"))).toContain(
    "actor_account_id=$2::uuid FOR UPDATE",
  );
  expect(f.retired).not.toHaveBeenCalled();
});
it("rejects a foreign actor's colliding adoption slot without returning the prior plan", async () => {
  const f = await harness();
  f.actorMismatch();
  await expect(f.stage()).rejects.toThrow("STAGE_REUSE_MISMATCH");
  expect(f.statements.at(-1)).toBe("ROLLBACK");
  expect(f.statements).not.toContain("COMMIT");
});
it("rejects changed existing plan/hash rather than overwriting it", async () => {
  const f = await harness();
  await f.stage();
  f.alterRow();
  await expect(f.stage()).rejects.toThrow("STAGE_REUSE_MISMATCH");
  expect(f.statements.at(-1)).toBe("ROLLBACK");
});
it("retains the stable adoption binding on commit response loss and returns UNKNOWN", async () => {
  const f = await harness();
  f.commitUnknown();
  await expect(f.stage()).rejects.toThrow("STAGE_OUTCOME_UNKNOWN");
  expect(f.retired).toHaveBeenCalledOnce();
  expect(f.owning.grant.adoptionId).toBe(f.f.grant.adoptionId);
});
it("does not lease PG for an invalid target or mismatched sealed preparation", async () => {
  const f = await harness();
  f.f.user.id = randomUUID();
  await expect(f.stage()).rejects.toThrow();
  expect(f.statements).toEqual([]);
});
it("rechecks expiry when a qualified plan waits for a lease", async () => {
  vi.useFakeTimers();
  const f = await harness();
  const delayed: CorePgConnection = {
    withLease: async (work) => {
      vi.setSystemTime(Date.now() + 60001);
      return f.connection.withLease(work);
    },
  };
  await expect(
    stageGuestAdoptionComposite(delayed, f.f.user, f.owning, f.checkpoint),
  ).rejects.toThrow("GRANT_EXPIRED");
  expect(f.statements).toEqual(["BEGIN", "ROLLBACK"]);
});

it.each(["INSERT", "COMMIT"])(
  "fences an outer connection deadline while %s is pending",
  async (pendingSql) => {
    const f = await harness();
    let entered!: () => void, finish!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const pending = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const statements: string[] = [],
      retire = vi.fn();
    let task: Promise<unknown> | undefined,
      row: { plan_text: unknown; plan_sha256: unknown };
    const connection: CorePgConnection = {
      withLease: async (work) => {
        task = work({
          retire,
          query: async (sql, values = []) => {
            statements.push(sql);
            if (sql.startsWith("INSERT"))
              row = { plan_text: values[7], plan_sha256: values[6] };
            if (sql.startsWith(pendingSql)) {
              entered();
              await pending;
            }
            return { rows: sql.startsWith("SELECT") ? [row] : [] };
          },
        });
        void task.catch(() => undefined);
        await started;
        throw Error("CORE_CONNECTION_TIMEOUT");
      },
    };
    await expect(
      stageGuestAdoptionComposite(connection, f.f.user, f.owning, f.checkpoint),
    ).rejects.toThrow(
      pendingSql === "COMMIT" ? "STAGE_OUTCOME_UNKNOWN" : "CORE_CONNECTION_TIMEOUT",
    );
    expect(retire).toHaveBeenCalledOnce();
    finish();
    await task!.catch(() => undefined);
    if (pendingSql === "INSERT") expect(statements).not.toContain("COMMIT");
  },
);
it("does not let cleanup failure turn a successful COMMIT into ordinary failure", async () => {
  const f = await harness();
  const connection: CorePgConnection = {
    withLease: async (work) => {
      await f.connection.withLease(work);
      throw Error("LEASE_CLEANUP_FAILED");
    },
  };
  await expect(
    stageGuestAdoptionComposite(connection, f.f.user, f.owning, f.checkpoint),
  ).rejects.toThrow("STAGE_OUTCOME_UNKNOWN");
});
