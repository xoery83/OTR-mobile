import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

it("recovers from real process termination after SQLite Core commit using the original persisted client intent and receipt", () => {
  const dir = mkdtempSync(join(tmpdir(), "otr-mcp-process-"));
  try {
    const db = join(dir, "fixture.sqlite"),
      worker = fileURLToPath(
        new URL("./fixtures/processRecoveryWorker.ts", import.meta.url),
      );
    const cwd = fileURLToPath(new URL("..", import.meta.url));
    const first = spawnSync(process.execPath, ["--import", "tsx", worker, db, "lose"], {
      cwd,
      encoding: "utf8",
      timeout: 15000,
    });
    expect(first.status, first.stderr).toBe(86);
    const second = spawnSync(
      process.execPath,
      ["--import", "tsx", worker, db, "recover"],
      { cwd, encoding: "utf8", timeout: 15000 },
    );
    expect(second.status, second.stderr).toBe(0);
    const result = JSON.parse(second.stdout.trim());
    expect(result).toMatchObject({
      posts: 1,
      itemCount: 1,
      receiptCount: 1,
      result: {
        outcome: "APPLIED",
        operation_id: "00000000-0000-4000-8000-000000000003",
        current_revision: 1,
      },
    });
    const third = spawnSync(
      process.execPath,
      ["--import", "tsx", worker, db, "recover"],
      { cwd, encoding: "utf8", timeout: 15000 },
    );
    expect(third.status, third.stderr).toBe(0);
    expect(JSON.parse(third.stdout.trim())).toEqual(result);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
