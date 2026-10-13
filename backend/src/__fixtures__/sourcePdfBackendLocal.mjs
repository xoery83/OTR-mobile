// Accepted disposable launcher passes only newly generated local fixture credentials.
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
const [environment, output] = process.argv.slice(2);
assert(environment && output);
const r = spawnSync(
  "node_modules/.bin/vitest",
  [
    "run",
    "backend/src/sourcePdfBackendPreparation.test.ts",
    "--reporter=json",
    "--outputFile=" + output,
  ],
  {
    env: { ...process.env, OTR_PDF_STORAGE_FIXTURE: environment },
    stdio: "inherit",
    timeout: 60000,
  },
);
assert.equal(r.status, 0);
