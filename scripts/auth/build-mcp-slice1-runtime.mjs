// DEV-only isolated Slice1 packaging; never activates Auth or modifies the default build.
import { build, version as esbuildVersion } from "esbuild";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, lstatSync, realpathSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const source = realpathSync(resolve(process.argv[2] ?? "."));
const out = resolve(process.argv[3] ?? join(root, "dist/mcp-slice1"));
const recovery = process.argv[4] === "recovery-guide";
if (process.argv[4] !== undefined && !recovery) throw Error("SLICE1_PROFILE_INVALID");
const pinsPath = join(root, recovery
  ? "backend/mcp/slice1-recovery-source-pins.json"
  : "backend/mcp/slice1-source-pins.json");
const pins = JSON.parse(readFileSync(pinsPath, "utf8"));
const expected = recovery
  ? "3b5ceca51d6ad4ba56312041880d01452e68d7bf1069dd19454ba34868e62083"
  : "7832ae51e06deb8df439540f8ab8723ba1bcbc807993e44799721e624be2f8c1";
const digest = (value) => createHash("sha256").update(value).digest("hex");
if (
  pins.profile !== "SLICE1_NOTES_EDIT" ||
  pins.sdkSHA256 !== expected ||
  Object.keys(pins.files).length !== 51
)
  throw Error("SLICE1_PINS_INVALID");
function verifySources() {
  for (const [file, hash] of Object.entries(pins.files)) {
    const path = resolve(source, file);
    if (
      relative(source, realpathSync(path)).startsWith("..") ||
      !lstatSync(path).isFile() ||
      digest(readFileSync(path)) !== hash
    )
      throw Error("SLICE1_SOURCE_REQUIRED");
  }
}
verifySources();
const sdk = await build({
  absWorkingDir: source,
  entryPoints: ["mcp/index.ts"],
  bundle: true,
  platform: "node",
  target: "node24",
  format: "esm",
  metafile: true,
  write: false,
});
for (const input of Object.keys(sdk.metafile.inputs)) {
  const file = relative(source, resolve(source, input)).split(sep).join("/");
  if (!file.split("/").includes("node_modules") && !Object.hasOwn(pins.files, file))
    throw Error("SLICE1_UNREVIEWED_INPUT");
}
verifySources();
if (sdk.outputFiles.length !== 1 || digest(sdk.outputFiles[0].contents) !== expected)
  throw Error("SLICE1_SDK_MISMATCH");
mkdirSync(out, { recursive: true });
const sdkPath = join(out, "slice1-sdk.mjs");
writeFileSync(sdkPath, sdk.outputFiles[0].contents);
const requireMcp = createRequire(join(source, "mcp/package.json"));
const outfile = join(out, "runtime.mjs");
await build({
  absWorkingDir: root,
  entryPoints: ["backend/mcp/runtime.mjs"],
  outfile,
  bundle: true,
  platform: "node",
  target: "node24",
  format: "esm",
  alias: { jose: requireMcp.resolve("jose") },
  plugins: [
    {
      name: "exact-slice1-sdk",
      setup(builder) {
        builder.onResolve({ filter: /^@otr\/mcp$/ }, () => ({
          path: "slice1-sdk.mjs",
          namespace: "otr-slice1",
        }));
        builder.onLoad({ filter: /^slice1-sdk\.mjs$/, namespace: "otr-slice1" }, () => ({
          contents: Buffer.from(sdk.outputFiles[0].contents).toString("utf8"),
          loader: "js",
          resolveDir: source,
        }));
      },
    },
  ],
  banner: {
    js: 'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);',
  },
});
const result = {
  status: "DEFAULT_CLOSED_COMPILED_ONLY",
  profile: pins.profile,
  sourceCount: 51,
  pinsSHA256: digest(readFileSync(pinsPath)),
  sdkSHA256: expected,
  runtimeSHA256: digest(readFileSync(outfile)),
  wrapperSHA256: digest(readFileSync(join(root, "backend/mcp/runtime.mjs"))),
  esbuildVersion,
  providerCalls: 0,
  activation: false,
};
writeFileSync(join(out, "runtime-build.json"), JSON.stringify(result, null, 2) + "\n");
console.log(JSON.stringify(result));
