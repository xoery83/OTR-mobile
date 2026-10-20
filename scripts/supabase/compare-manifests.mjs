import { readFile } from "node:fs/promises";

const [expectedPath, actualPath] = process.argv.slice(2);
if (!expectedPath || !actualPath) {
  throw new Error("Usage: compare-manifests.mjs EXPECTED ACTUAL");
}

const [expected, actual] = await Promise.all(
  [expectedPath, actualPath].map(async (file) =>
    JSON.parse(await readFile(file, "utf8")),
  ),
);

for (const key of new Set([...Object.keys(expected), ...Object.keys(actual)])) {
  if (expected[key] !== actual[key]) {
    throw new Error(
      `Schema manifest mismatch for ${key}: expected ${expected[key]}, received ${actual[key]}.`,
    );
  }
}
