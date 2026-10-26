import { it, expect } from "vitest";
import { runUniversalContinuationFixture } from "./__fixtures__/universalContinuationRuntime";
it.skipIf(process.platform !== "linux")(
  "recovers retained settled raw after immutable deadline through real SQLite and anchored custody, no Provider",
  async () => {
    const result = await runUniversalContinuationFixture(
      "/custody-tests",
      undefined,
      true,
    );
    expect(result.realProviderCalls).toBe(0);
    expect(result.checks).toHaveLength(4);
  },
);

import { createUniversalSourceReader } from "./universalSourceRead";
import type { Task } from "../../src/domain/intelligence/persistence";
import { vi } from "vitest";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
it.each([
  "registration",
  "revision",
  "ancestry",
  "failed_run",
  "batch_binding",
  "task_binding",
])(
  "owning Source reader rejection propagates for %s, no generic fallback",
  async (reason) => {
    const ids = Array.from({ length: 5 }, () => randomUUID());
    const task = {
      account_id: ids[0],
      trip_id: ids[1],
      import_id: ids[2],
      task_id: ids[3],
      run_id: ids[4],
    } as Task;
    const query = vi.fn(
      async (sql: string, parameters?: readonly unknown[]) => {
        if (sql.includes("trip_source_read_universal_inputs")) {
          expect(parameters).toEqual(ids);
          throw Error("OWNING_SOURCE_QUALIFICATION_REJECTED");
        }
        return { rows: [] };
      },
    );
    const readBinary = vi.fn();
    const reader = createUniversalSourceReader({
      connection: { withLease: async (work) => work({ query, retire() {} }) },
      readBinary,
    });
    await expect(reader(task)).rejects.toThrow(
      "OWNING_SOURCE_QUALIFICATION_REJECTED",
    );
    expect(readBinary).not.toHaveBeenCalled();
    expect(query).toHaveBeenCalledWith("ROLLBACK");
  },
);
it("recovery composition installs existing Source reader, never a catalog-derived qualifier or Source command port", () => {
  const source = readFileSync(
    new URL("./universalSettledRecoveryOperator.ts", import.meta.url),
    "utf8",
  );
  expect(source).toContain("createUniversalSourceReader({");
  expect(source).toContain("createSourcePgConnection(config.sourcePg)");
  expect(source).not.toContain("retainedRecoveryManifest");
  expect(source).not.toContain("trip_sources.find");
  expect(source).not.toContain("universalOriginalSourcePort");
});
