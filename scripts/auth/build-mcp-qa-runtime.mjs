import { build, version as esbuildVersion } from "esbuild";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, lstatSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve, join, relative, sep } from "node:path";
const source = resolve(process.argv[2] ?? ".");
const pins = JSON.parse(readFileSync(new URL("../../backend/mcp/source-pins.json", import.meta.url), "utf8"));
const hash = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");
function verifySources() {
  for (const [file, expected] of Object.entries(pins.files)) {
    const path = resolve(source, file);
    if (relative(source, path).startsWith("..") || !lstatSync(path).isFile() || hash(path) !== expected)
      throw Error("MCP_REVIEWED_SOURCE_REQUIRED");
  }
}
verifySources();
// Build from reviewed checkout files, without a temporary SNAPSHOT or opaque prebuilt SDK.
const input = resolve("dist/mcp/sdk-input.mjs");
const sdk = await build({
  entryPoints: [join(source, "mcp/index.ts")], outfile: input,
  bundle: true, platform: "node", target: "node24", format: "esm", metafile: true,
});
for (const file of Object.keys(sdk.metafile.inputs)) {
  const path = resolve(file);
  const key = relative(source, path).split(sep).join("/");
  if (key.split("/").includes("node_modules")) continue;
  if (!Object.hasOwn(pins.files, key)) throw Error("MCP_UNREVIEWED_BUILD_INPUT");
}
verifySources();
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
  mcpReviewedSource: pins.mcpReviewedSource,
  mcpSourceCommit: pins.mcpSourceCommit,
  sourcePinsSHA256: hash(new URL("../../backend/mcp/source-pins.json", import.meta.url)),
  sdkInputSHA256: hash(input),
  runtimeSHA256: hash(outfile),
  esbuildVersion,
  mobileDependencyChanges: false,
  providerCalls: 0,
};
writeFileSync("dist/mcp/runtime-build.json", JSON.stringify(result, null, 2) + "\n");
console.log(JSON.stringify(result));
