import { expect, it, vi } from "vitest";
import type { CorePgConnection } from "./tripCoreV2PgStorage";
import { runSourcePdfCloseControl } from "./sourcePdfCloseControl";
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
  expect(await runSourcePdfCloseControl(f.connection, true)).toEqual({
    status: "PDF_SCOPE_CLOSED_VERIFIED",
    closed: true,
  });
  expect(f.leases.map((trace) => [trace[0], trace.at(-1)])).toEqual([
    ["BEGIN", "COMMIT"],
    ["BEGIN READ ONLY", "COMMIT"],
  ]);
  expect(f.pins).toEqual([
    [
      "f4b059c5-8241-4ffb-aa15-37fa25474543",
      "825f79b2-4a9d-4535-a62e-43000ca50c4a",
      true,
    ],
    [
      "f4b059c5-8241-4ffb-aa15-37fa25474543",
      "825f79b2-4a9d-4535-a62e-43000ca50c4a",
      false,
    ],
  ]);
});
it("verify cannot issue a closing mutation and reports ACTIVE accurately", async () => {
  const f = fixture([false]);
  expect(await runSourcePdfCloseControl(f.connection, false)).toEqual({
    status: "PDF_SCOPE_ACTIVE",
    closed: false,
  });
  expect(f.leases).toHaveLength(1);
  expect(f.leases[0][0]).toBe("BEGIN READ ONLY");
  expect(f.pins[0][2]).toBe(false);
});
it("ambiguous close cannot report CLOSED or continue to another write", async () => {
  const f = fixture([]);
  await expect(runSourcePdfCloseControl(f.connection, true)).rejects.toThrow(
    "PDF_CLOSURE_UNCONFIRMED",
  );
  expect(f.leases).toHaveLength(1);
  expect(f.leases[0].at(-1)).toBe("ROLLBACK");
});
