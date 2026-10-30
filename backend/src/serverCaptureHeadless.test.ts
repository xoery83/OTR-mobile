import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { expect, it } from "vitest";

it("the real Capture build loads in Node without loading Native Guest storage", () => {
  const directory = mkdtempSync(join(tmpdir(), "otr-headless-capture-"));
  try {
    const bundle = join(directory, "server-capture.mjs");
    const env = {
      PATH: process.env.PATH,
      NODE_NO_WARNINGS: "1",
      NODE_ENV: "test" as const,
    };
    const build = spawnSync(
      "npm",
      ["run", "backend:build:capture", "--", `--outfile=${bundle}`],
      {
        env,
        encoding: "utf8",
        timeout: 15000,
      },
    );
    expect(build.status, build.stderr).toBe(0);
    const start = spawnSync(process.execPath, [bundle], {
      env,
      encoding: "utf8",
      timeout: 5000,
    });
    // No runtime configuration is supplied: fail closed after module loading.
    expect(start.status).toBe(1);
    expect(start.stdout + start.stderr).toContain("CAPTURE_RUNTIME_UNAVAILABLE");
    expect(start.stdout + start.stderr).not.toContain("ERR_MODULE_NOT_FOUND");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}, 25000);
