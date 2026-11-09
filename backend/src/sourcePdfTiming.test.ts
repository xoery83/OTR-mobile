import { performance } from "node:perf_hooks";
import { expect, it, vi } from "vitest";
import { recordSourcePdfTiming, runSourcePdfTimings } from "./sourcePdfTiming";

it("emits bounded remote timings and exact PG counts for Start/Resume and Wake", async () => {
  const log = vi.spyOn(console, "info").mockImplementation(() => {});
  try {
    await runSourcePdfTimings("safe-request-id", "start-resume", async () => {
      recordSourcePdfTiming("pg_connect", performance.now() - 4);
      recordSourcePdfTiming("pg_connect", performance.now() - 6, Error("private"));
      recordSourcePdfTiming(
        "pg_sql_setup",
        performance.now() - 5,
        undefined,
        "session_reset",
      );
      for (let index = 1; index <= 8; index++)
        recordSourcePdfTiming(
          "pg_source_command",
          performance.now() - index * 50,
          undefined,
          "source_rpc_" + index,
        );
      recordSourcePdfTiming(
        "pg_task_command",
        performance.now() - 5,
        { code: "55P03", message: "private" },
        "task_rpc",
      );
      recordSourcePdfTiming("pg_sql_end", performance.now() - 1, undefined, "pg_sql_end");
      recordSourcePdfTiming("pg_catalog_connect", performance.now() - 2);
      recordSourcePdfTiming(
        "pg_catalog_command",
        performance.now() - 1,
        undefined,
        "catalog_session",
      );
      await runSourcePdfTimings("safe-request-id", "run-wake", async () => {
        recordSourcePdfTiming("provider_http", performance.now() - 100);
      });
      return new Response(null, { status: 409 });
    });
    const [wake, start] = log.mock.calls.map(([line]) => JSON.parse(line));
    expect(wake).toMatchObject({
      action: "run-wake",
      pgCommands: 0,
      pgSourceTaskConnectionAttempts: 0,
      pgConnectionsOpened: 0,
      slowestRemote: [{ operation: "provider_http" }],
    });
    expect(start).toMatchObject({
      action: "start-resume",
      status: 409,
      pgCommands: 12,
      pgSourceTaskConnectionAttempts: 2,
      pgConnectionsOpened: 2,
      pgCatalogConnectionsOpened: 1,
      pgCommandsByStage: { session: 2, source: 8, task: 1, catalog: 1 },
      phases: { pg_task_command: { failures: { lock_unavailable: 1 } } },
    });
    expect(
      start.slowestRemote.map(({ operation }: { operation: string }) => operation),
    ).toEqual([
      "source_rpc_8",
      "source_rpc_7",
      "source_rpc_6",
      "source_rpc_5",
      "source_rpc_4",
    ]);
    expect(JSON.stringify([wake, start])).not.toContain("private");
  } finally {
    log.mockRestore();
  }
});
