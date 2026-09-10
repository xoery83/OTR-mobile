import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const projectRoot = new URL("../..", import.meta.url).pathname;
const forbiddenImports = [
  /expo-sqlite/,
  /@\/data\/api/,
  /@\/data\/db/,
  /@\/data\/sync/,
  /supabase/i,
];

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    return statSync(path).isDirectory()
      ? sourceFiles(path)
      : path.endsWith(".ts") || path.endsWith(".tsx")
        ? [path]
        : [];
  });
}

describe("foundation architecture boundaries", () => {
  it("keeps UI and domain modules away from direct data infrastructure", () => {
    const directories = [
      join(projectRoot, "app"),
      join(projectRoot, "src/components"),
      join(projectRoot, "src/domain"),
    ];

    for (const file of directories.flatMap(sourceFiles)) {
      if (file.endsWith("architectureBoundary.test.ts")) continue;

      const source = readFileSync(file, "utf8");

      for (const forbiddenImport of forbiddenImports) {
        expect(source, `${file} imports ${forbiddenImport}`).not.toMatch(forbiddenImport);
      }
    }
  });

  it("keeps server-only environment files out of Metro source extensions", () => {
    expect(readFileSync(join(projectRoot, "package.json"), "utf8")).not.toContain(
      ".env.backend.local",
    );
  });
});
