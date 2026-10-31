import { build } from "esbuild";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve, join } from "node:path";
const source = resolve(process.argv[2]);
const metadata = JSON.parse(readFileSync(join(source, "SNAPSHOT.json"), "utf8"));
if (metadata.sourceSHA !== "8812dbbb8b9ed610c7716415b1377b6443005c4d")
  throw Error("MCP_SOURCE_VERSION_REQUIRED");
const input = join(source, "dist/mcp/index.mjs");
const hash = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");
if (hash(input) !== "866b6c1286daf38aef9ca7ee759442ca96d9e98c1af2c1f92eca6d6e5183f94c")
  throw Error("MCP_FROZEN_ARTIFACT_MISMATCH");
const requireMcp = createRequire(join(source, "mcp/package.json"));
const outfile = "dist/mcp/runtime.mjs";
await build({
  entryPoints: ["backend/mcp/runtime.mjs"],
  outfile,
  bundle: true,
  platform: "node",
  target: "node24",
  format: "esm",
  alias: { "@otr/mcp": input, jose: requireMcp.resolve("jose") },
  banner: {
    js: 'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);',
  },
});
const result = {
  status: "COMPILED_ONLY_NOT_DEPLOYED",
  mcpSource: metadata.sourceSHA,
  mcpInputSHA256: hash(input),
  runtimeSHA256: hash(outfile),
  mobileDependencyChanges: false,
  providerCalls: 0,
};
writeFileSync("dist/mcp/runtime-build.json", JSON.stringify(result, null, 2) + "\n");
console.log(JSON.stringify(result));
