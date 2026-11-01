import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = fileURLToPath(new URL("../../", import.meta.url));
const manifest = JSON.parse(readFileSync(new URL("./realtime-v1-qa.json", import.meta.url), "utf8"));
for (const check of manifest.checks) {
  console.log(`LOCAL_FIXTURE_ONLY: ${check.name}`);
  const result = spawnSync(process.execPath, [
    "node_modules/vitest/vitest.mjs", "run", "--configLoader", "runner", ...check.args,
  ], { cwd: root, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
console.log("LOCAL_FIXTURE_PASS — not device, private-channel, Hosted or latency qualification.");
