import { expect, it, vi } from "vitest";
import type { CorePgConnection } from "./tripCoreV2PgStorage";
import { runAuthQaCloseControl } from "./authQaCloseControl";
function fixture(values: boolean[]) {
  const leases: string[][] = [],
    pins: unknown[][] = [];
  const connection: CorePgConnection = {
    async withLease(work) {
      const trace: string[] = [];
      leases.push(trace);
      return work({
        retire: vi.fn(),
        async query(sql: string, args: unknown[] = []) {
          trace.push(sql);
          if (sql.startsWith("SELECT")) {
            pins.push(args);
            return { rows: [{ closed: values.shift() }] };
          }
          return { rows: [] };
        },
      });
    },
  };
  return { connection, leases, pins };
}
it("close is followed by independent READ ONLY verification with exact QA pins", async () => {
  const f = fixture([true, true]);
  expect(await runAuthQaCloseControl(f.connection, true)).toEqual({
    status: "AUTH_QA_POLICY_CLOSED",
    closed: true,
  });
  expect(f.leases.map((trace) => [trace[0], trace.at(-1)])).toEqual([
    ["BEGIN", "COMMIT"],
    ["BEGIN READ ONLY", "COMMIT"],
  ]);
  expect(f.pins).toEqual([[true], [false]]);
});
it("verify cannot issue a closing mutation and reports ACTIVE accurately", async () => {
  const f = fixture([false]);
  expect(await runAuthQaCloseControl(f.connection, false)).toEqual({
    status: "AUTH_QA_POLICY_ACTIVE",
    closed: false,
  });
  expect(f.leases).toHaveLength(1);
  expect(f.leases[0][0]).toBe("BEGIN READ ONLY");
  expect(f.pins[0][0]).toBe(false);
});
it("ambiguous close cannot report CLOSED or continue to another write", async () => {
  const f = fixture([]);
  await expect(runAuthQaCloseControl(f.connection, true)).rejects.toThrow(
    "AUTH_QA_CLOSURE_UNCONFIRMED",
  );
  expect(f.leases).toHaveLength(1);
  expect(f.leases[0].at(-1)).toBe("ROLLBACK");
});
