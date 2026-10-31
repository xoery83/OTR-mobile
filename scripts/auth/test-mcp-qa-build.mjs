import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, copyFileSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = process.cwd();
const script = fileURLToPath(new URL("./build-mcp-qa-runtime.mjs", import.meta.url));
const pins = JSON.parse(readFileSync(resolve("backend/mcp/source-pins.json"), "utf8"));
const fixture = mkdtempSync(join(tmpdir(), "otr-mcp-build-pin-"));
const shadow = resolve("mcp/contract.tsx");
let ownShadow = false;
const build = (source) => spawnSync(process.execPath, [script, source], {
  cwd: root, encoding: "utf8", timeout: 15000,
});
try {
  for (const file of Object.keys(pins.files)) {
    const target = join(fixture, file);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(resolve(file), target);
  }
  writeFileSync(join(fixture, "mcp/read.ts"), "// changed unreviewed fixture\n", { flag: "a" });
  const changed = build(fixture);
  assert.notEqual(changed.status, 0);
  assert.match(changed.stderr, /MCP_REVIEWED_SOURCE_REQUIRED/);
  writeFileSync(shadow, readFileSync(resolve("mcp/contract.ts")), { flag: "wx" });
  ownShadow = true;
  const unlisted = build(root);
  assert.notEqual(unlisted.status, 0);
  assert.match(unlisted.stderr, /MCP_UNREVIEWED_BUILD_INPUT/);
  rmSync(shadow); ownShadow = false;
  const valid = build(root);
  assert.equal(valid.status, 0, valid.stderr);
  console.log(JSON.stringify({ status: "BUILD_PIN_AND_SHADOW_SOURCE_DENIAL_PASS", checks: 3, providerCalls: 0, devChanges: 0 }));
} finally {
  if (ownShadow) rmSync(shadow);
  rmSync(fixture, { recursive: true, force: true });
}
