import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve, dirname, relative } from "node:path";
import ts from "typescript";
import { createRequire } from "node:module";
const root = resolve(import.meta.dirname, "../../../.."),
  base = resolve(root, "docs/mcp/beta-contract-v1");
const read = (name: string) => JSON.parse(readFileSync(resolve(base, name), "utf8"));
const hash = (b: Buffer | string) => createHash("sha256").update(b).digest("hex");
const m = read("LAYER2_INPUT_MANIFEST.json"),
  pins = read("SOURCE_PINS_V1.json");
if (
  m.baselineMain !== "41de43927fd9869673c1ca929e911f58d1f6f96d" ||
  m.frozenContractCommitSha !== "2da5e1a7e88056239ad04217d3c3222421f05ec9" ||
  m.contractVersion !== "otr.mcp-beta.contract/1.0.0"
)
  throw Error("Owner pin mismatch");
const manifestBytes = execFileSync(
  "git",
  [
    "show",
    "ac81ddc7159568b0c8a0996289e8b54c44b512fa:docs/mcp/beta-contract-v1/LAYER2_INPUT_MANIFEST.json",
  ],
  { cwd: root },
);
if (!manifestBytes.equals(readFileSync(resolve(base, "LAYER2_INPUT_MANIFEST.json"))))
  throw Error("Handoff manifest mismatch");
for (const [file, digest] of Object.entries({
  ...m.sixDocumentsSha256,
  ...m.artifactsSha256,
})) {
  const b = readFileSync(resolve(base, file));
  if (hash(b) !== digest) throw Error("Frozen hash mismatch " + file);
  const original = execFileSync(
    "git",
    ["show", m.frozenContractCommitSha + ":docs/mcp/beta-contract-v1/" + file],
    { cwd: root },
  );
  if (!b.equals(original)) throw Error("Frozen commit mismatch " + file);
}
const files = new Map<string, string>();
function visit(file: string) {
  const path = relative(root, file);
  if (files.has(path)) return;
  const b = readFileSync(file),
    git = execFileSync("git", ["show", m.baselineMain + ":" + path], {
      cwd: root,
      maxBuffer: 8 * 1024 * 1024,
    });
  if (!b.equals(git)) throw Error("Baseline source differs " + path);
  files.set(path, hash(b));
  if (!path.endsWith(".ts")) return;
  for (const match of b.toString().matchAll(/(?:from\s*|import\s*)["'](\.[^"']+)["']/g)) {
    let next = resolve(dirname(file), match[1]);
    if (!next.endsWith(".ts")) next += ".ts";
    visit(next);
  }
}
for (const p of pins.sources) {
  const b = readFileSync(resolve(root, p.path));
  if (hash(b) !== p.sha256) throw Error("Source pin mismatch " + p.path);
  visit(resolve(root, p.path));
}
visit(resolve(root, "src/domain/ledger/allocation.ts"));
const ownFiles = [
  "requests.ts",
  "responses.ts",
  "plan.ts",
  "validate.ts",
  "assess.ts",
  "build.ts",
  "verify-pins.ts",
  "evaluate.ts",
  "selfcheck.ts",
].map((name) => "docs/mcp/beta-layer2/schema/" + name);
const allSources = [...files.keys(), ...ownFiles];
const assertions: any[] = [];
for (const path of allSources) {
  if (!path.endsWith(".ts")) continue;
  const bytes = readFileSync(resolve(root, path)),
    text = bytes.toString(),
    source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
  const visitNode = (node: ts.Node) => {
    let kind: string | null = null;
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ["refine", "superRefine", "transform"].includes(node.expression.name.text)
    )
      kind = "zod." + node.expression.name.text;
    if (
      ts.isFunctionDeclaration(node) &&
      node.name &&
      /^(validate|assert|parseLocalTripDestinations)/.test(node.name.text)
    )
      kind = "function." + node.name.text;
    if (kind) {
      const start = source.getLineAndCharacterOfPosition(node.getStart(source));
      assertions.push({
        id:
          path +
          ":" +
          (start.line + 1) +
          ":" +
          kind +
          ":" +
          hash(node.getText(source)).slice(0, 16),
        sourcePath: path,
        sourceSha256: hash(bytes),
        line: start.line + 1,
        kind,
        executionBoundary: path.startsWith("docs/")
          ? "LAYER2_VALIDATOR"
          : "ORIGINAL_PINNED_SCHEMA_OR_OWNING_DOMAIN",
      });
    }
    ts.forEachChild(node, visitNode);
  };
  visitNode(source);
}
const assertionManifest = {
  contractVersion: m.contractVersion,
  assertionIdsAreSourceBound: true,
  executionPolicy:
    "Selected original Zod schemas execute their reachable refinements after reference resolution. IDs also retain pinned owning domain assertions; listing an ID is not a claim of actual runtime/permission execution.",
  assertions,
};
writeFileSync(
  resolve(root, "docs/mcp/beta-layer2/SEMANTIC_ASSERTIONS.json"),
  JSON.stringify(assertionManifest, null, 2) + "\n",
);
const require = createRequire(import.meta.url);
const runtime = Object.fromEntries(
  ["zod", "ajv", "tsx", "typescript"].map((name) => [
    name,
    require(name + "/package.json").version,
  ]),
);
const receipt = {
  contractVersion: m.contractVersion,
  baselineMain: m.baselineMain,
  frozenContractCommitSha: m.frozenContractCommitSha,
  handoffCommitSha: "ac81ddc7159568b0c8a0996289e8b54c44b512fa",
  contractFilesVerified: 12,
  sourceAliasesVerified: pins.sources.length,
  transitiveSourceHashes: Object.fromEntries([...files].sort()),
  layer2ValidatorHashes: Object.fromEntries(
    ownFiles.map((path) => [path, hash(readFileSync(resolve(root, path)))]),
  ),
  runtime: { node: process.version, ...runtime },
  semanticAssertionManifest: "SEMANTIC_ASSERTIONS.json",
  semanticAssertionCount: assertions.length,
  semanticValidators: [
    "pinned Zod refinements retain executable validation; exported JSON Schema is structural only",
    "schema/requests.ts frozen new overload assertions",
    "schema/validate.ts Plan graph/confirmation/evidence checks",
  ],
  networkCalls: 0,
};
writeFileSync(
  resolve(root, "docs/mcp/beta-layer2/SCHEMA_SOURCE_PINS.json"),
  JSON.stringify(receipt, null, 2) + "\n",
);
console.log(
  "Frozen12; source aliases" +
    pins.sources.length +
    "; transitive baseline files" +
    files.size +
    " verified",
);
