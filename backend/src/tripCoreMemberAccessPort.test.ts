import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { createCoreMemberAccessPort } from "./tripCoreMemberAccess";
import {
  actor,
  trip,
  memberCommand,
  memberReceipt,
} from "./__fixtures__/tripCoreMemberAccess";
import type { CorePgConnection } from "./tripCoreV2PgStorage";
const hash = async (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
function fixture(raw: unknown, commitLost = false) {
  const queries: { sql: string; parameters?: readonly unknown[] }[] = [];
  const connection: CorePgConnection = {
    withLease: async (work) =>
      work({
        retire() {},
        query: async (sql, parameters) => {
          queries.push({ sql, parameters });
          if (sql === "COMMIT" && commitLost) throw Error("COMMIT_ACK_LOST");
          return {
            rows: sql.startsWith("SELECT public.trip_core_member_access")
              ? [{ result: raw }]
              : [],
          };
        },
      }),
  };
  return { port: createCoreMemberAccessPort(connection, hash), queries };
}
it("validates exact result before COMMIT in the same authoritative transaction", async () => {
  const q = memberCommand(),
    raw = {
      projection: "FULL",
      domainReceiptId: q.operationId,
      receipt: await memberReceipt(q),
    },
    f = fixture(raw);
  expect((await f.port.execute(actor, trip, q)).receipt).toEqual(raw.receipt);
  expect(f.queries.at(-1)?.sql).toBe("COMMIT");
  const rpc = f.queries.find((x) =>
    x.sql.startsWith("SELECT public.trip_core_member_access"),
  )!;
  expect(rpc.parameters?.slice(0, 3)).toEqual([actor, trip, "EXECUTE"]);
  expect(JSON.parse(rpc.parameters![3] as string).command).toEqual(q);
});
it("bad result aborts the effect and receipt together", async () => {
  const q = memberCommand(),
    raw = {
      projection: "FULL",
      domainReceiptId: q.operationId,
      receipt: await memberReceipt(q),
    },
    f = fixture({
      ...raw,
      receipt: { ...raw.receipt, actorAccountId: q.payload.targetAccountId },
    });
  await expect(f.port.execute(actor, trip, q)).rejects.toThrow();
  expect(f.queries.at(-1)?.sql).toBe("ROLLBACK");
  expect(f.queries.some((x) => x.sql === "COMMIT")).toBe(false);
});
it("lost commit acknowledgement never automatically resends or changes operation", async () => {
  const q = memberCommand(),
    f = fixture(
      {
        projection: "FULL",
        domainReceiptId: q.operationId,
        receipt: await memberReceipt(q),
      },
      true,
    );
  await expect(f.port.execute(actor, trip, q)).rejects.toThrow("COMMIT_ACK_LOST");
  expect(
    f.queries.filter((x) => x.sql.startsWith("SELECT public.trip_core_member_access")),
  ).toHaveLength(1);
});
it("missing original receipt stays absent, not no-commit; never dispatches EXECUTE", async () => {
  const q = memberCommand(),
    f = fixture(null);
  expect(await f.port.readOperation(actor, trip, q.operationId)).toBeNull();
  expect(f.queries.find((x) => x.parameters)?.parameters?.[2]).toBe("RECEIPT");
});
it("access loss is scoped to B's own authenticated Account/Trip, never A's receipt", async () => {
  const q = memberCommand(),
    f = fixture({
      schemaId: "otr.trip.core-access-loss/1",
      accountId: q.payload.targetAccountId,
      tripId: trip,
      personId: q.payload.personId,
      state: "ACCESS_REVOKED",
      coreReference: { epoch: q.payload.coreEpoch, revision: 11, accessRevision: 8 },
    });
  await expect(f.port.observeAccessLoss(actor, trip)).rejects.toThrow(
    "MEMBER_ACCESS_RESULT_BINDING",
  );
  expect(f.queries.at(-1)?.sql).toBe("ROLLBACK");
});
