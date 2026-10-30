import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { fixture } from "./guestAdoptionCompositePlan.fixture";
import { prepareGuestAdoptionCompositePlan } from "./guestAdoptionCompositePlan";
import { executeGuestAdoptionCompositePgOnTransaction } from "./guestAdoptionCompositePg";
import type { CorePgTransactionContext } from "./tripCoreV2PgStorage";
async function setup() {
  const f = fixture(),
    checkpoint = await f.source();
  const plan = await prepareGuestAdoptionCompositePlan(
    f.user,
    { grant: f.grant, preparationSha256: checkpoint.sha256 },
    checkpoint,
  );
  const raw = { planText: plan.canonicalText, planSha256: plan.sha256 };
  const query = vi.fn(async (sql: string) => ({
    rows: sql.includes("read_scope")
      ? [{ result: raw }]
      : sql.includes("scope_binding")
        ? [{ result: { actorAccountId: randomUUID() } }]
        : [],
  }));
  const storage = { withLockedCommand: vi.fn() };
  const context: CorePgTransactionContext = {
    lease: { query, retire: vi.fn() },
    storage,
  };
  const run = (signal?: AbortSignal) =>
    executeGuestAdoptionCompositePgOnTransaction(
      f.user,
      f.grant.adoptionId,
      plan.sha256,
      context,
      signal,
    );
  return { f, plan, raw, query, storage, context, run };
}
it.each(["ANONYMOUS", "UNKNOWN"] as const)(
  "rejects %s before any SQL",
  async (accountClass) => {
    const h = await setup();
    await expect(
      executeGuestAdoptionCompositePgOnTransaction(
        { ...h.f.user, accountClass },
        h.f.grant.adoptionId,
        h.plan.sha256,
        h.context,
      ),
    ).rejects.toThrow("NORMAL_ACCOUNT_REQUIRED");
    expect(h.query).not.toHaveBeenCalled();
  },
);
it("refuses an already-aborted request before acquiring a scope", async () => {
  const h = await setup(),
    controller = new AbortController();
  controller.abort();
  await expect(h.run(controller.signal)).rejects.toThrow("EXECUTION_ABORTED");
  expect(h.query).not.toHaveBeenCalled();
});
it.each(["planText", "planSha256"] as const)(
  "checks actual locked %s before any owning operation",
  async (key) => {
    const h = await setup();
    h.raw[key] += "x";
    await expect(h.run()).rejects.toThrow();
    expect(h.storage.withLockedCommand).not.toHaveBeenCalled();
    expect(
      h.query.mock.calls.every(
        ([sql]) => sql.includes("begin_scope") || sql.includes("read_scope"),
      ),
    ).toBe(true);
  },
);
it("pins each subsequent check to the real stage Actor/Guest/inventory/grant/plan tuple", async () => {
  const h = await setup();
  await expect(h.run()).rejects.toMatchObject({
    status: 503,
    code: "TRIP_CREATE_UNAVAILABLE",
  });
  expect(h.query.mock.calls.some(([sql]) => sql.includes("scope_binding"))).toBe(true);
  expect(h.query.mock.calls.some(([sql]) => sql.includes("trip_create_command"))).toBe(
    false,
  );
  expect(h.storage.withLockedCommand).not.toHaveBeenCalled();
});
it("does not issue transaction-control statements itself", async () => {
  const h = await setup();
  await h.run().catch(() => {});
  expect(
    h.query.mock.calls.every(([sql]) =>
      sql.startsWith("SELECT otr_auth_guest_composite."),
    ),
  ).toBe(true);
});
