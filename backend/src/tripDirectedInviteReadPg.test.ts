import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { composeDirectedInviteReader } from "./tripDirectedInviteReadPg";
import type { CorePgConnection } from "./tripCoreV2PgStorage";

function fixture() {
  const actor = randomUUID(), trip = randomUUID(), invite = randomUUID();
  const recipients = { version: 1, accountId: actor, tripId: trip, recipients: [] };
  const invitation = { version: 1, accountId: actor, invitation: {
    inviteId: invite, tripId: trip, personId: randomUUID(), tripName: "Synthetic Trip",
    personName: "Synthetic Person", status: "PENDING", expiresAt: "2026-11-20T00:00:00Z",
  }};
  const query = vi.fn(async (sql: string, _params?: readonly unknown[]) => ({
    rows: sql.startsWith("SELECT") ? [{ result: recipients as unknown }] : [],
  }));
  const retire = vi.fn();
  const connection: CorePgConnection = { withLease: (work) => work({ query, retire }) };
  const port = composeDirectedInviteReader(connection, { enabled: true })!;
  return { actor, trip, invite, recipients, invitation, query, retire, connection, port };
}
it("does not compose from a connection alone when disabled", () => {
  const f = fixture();
  expect(composeDirectedInviteReader(f.connection, { enabled: false })).toBeUndefined();
  expect(f.query).not.toHaveBeenCalled();
});
it("binds trusted actor and Trip using one business-read-only transaction", async () => {
  const f = fixture();
  expect(await f.port.recipients({ accountId: f.actor, tripId: f.trip })).toEqual(f.recipients);
  expect(f.query.mock.calls.map(([sql]) => sql)).toEqual([
    "BEGIN", "SELECT public.trip_directed_invite_read($1::text,$2::uuid,$3::uuid) AS result", "COMMIT",
  ]);
  expect(f.query.mock.calls[1][1]).toEqual(["recipients", f.actor, f.trip]);
});
it("binds recipient preview without requiring Trip access", async () => {
  const f = fixture();
  f.query.mockImplementation(async (sql) => ({ rows: sql.startsWith("SELECT") ? [{ result: f.invitation }] : [] }));
  expect(await f.port.invitation({ accountId: f.actor, inviteId: f.invite })).toEqual(f.invitation);
  expect(f.query.mock.calls[1][1]).toEqual(["invitation", f.actor, f.invite]);
});
it("returns genuine owning not-visible null", async () => {
  const f = fixture();
  f.query.mockImplementation(async (sql) => ({ rows: sql.startsWith("SELECT") ? [{ result: null }] : [] }));
  expect(await f.port.invitation({ accountId: f.actor, inviteId: f.invite })).toBeNull();
});
it.each(["account", "trip", "missing", "duplicate"])("rejects %s result and rolls back", async (kind) => {
  const f = fixture();
  const result = { ...f.recipients, ...(kind === "account" ? { accountId: randomUUID() } : {}),
    ...(kind === "trip" ? { tripId: randomUUID() } : {}) };
  f.query.mockImplementation(async (sql) => ({ rows: !sql.startsWith("SELECT") || kind === "missing" ? [] :
    kind === "duplicate" ? [{ result }, { result }] : [{ result }] }));
  await expect(f.port.recipients({ accountId: f.actor, tripId: f.trip })).rejects.toThrow();
  expect(f.query.mock.calls.at(-1)?.[0]).toBe("ROLLBACK");
});
it("retires a connection on ambiguous COMMIT instead of reusing it", async () => {
  const f = fixture();
  f.query.mockImplementation(async (sql) => {
    if (sql === "COMMIT") throw Error("lost commit response");
    return { rows: sql.startsWith("SELECT") ? [{ result: f.recipients }] : [] };
  });
  await expect(f.port.recipients({ accountId: f.actor, tripId: f.trip })).rejects.toThrow("lost commit");
  expect(f.retire).toHaveBeenCalledOnce();
});
it("invalid identifiers never acquire/query the database", async () => {
  const f = fixture();
  await expect(f.port.recipients({ accountId: "bad", tripId: f.trip })).rejects.toThrow();
  expect(f.query).not.toHaveBeenCalled();
});
it("incoming binds only the authenticated Account and null object without Trip membership", async () => {
  const f = fixture();
  const value = { version: 1, accountId: f.actor, invitations: [{ tripId: f.trip, inviteId: f.invite }] };
  f.query.mockImplementation(async sql => ({ rows: sql.startsWith("SELECT") ? [{ result: value }] : [] }));
  expect(await f.port.incoming!({ accountId: f.actor })).toEqual(value);
  expect(f.query.mock.calls[1][1]).toEqual(["incoming", f.actor, null]);
});
it.each(["account", "duplicate", "overflow"])("incoming rejects %s output before commit", async kind => {
  const f = fixture();
  const reference = { tripId: f.trip, inviteId: f.invite };
  const value = { version: 1, accountId: kind === "account" ? randomUUID() : f.actor,
    invitations: kind === "overflow" ? Array.from({ length: 101 }, () => ({ ...reference, inviteId: randomUUID() })) :
      kind === "duplicate" ? [reference, reference] : [reference] };
  f.query.mockImplementation(async sql => ({ rows: sql.startsWith("SELECT") ? [{ result: value }] : [] }));
  await expect(f.port.incoming!({ accountId: f.actor })).rejects.toThrow();
  expect(f.query.mock.calls.at(-1)?.[0]).toBe("ROLLBACK");
});
