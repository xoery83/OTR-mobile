import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve, dirname } from "node:path";
import ts from "typescript";

import { describe, expect, it } from "vitest";

const projectRoot = new URL("../..", import.meta.url).pathname;
const forbiddenImports = [
  /expo-sqlite/,
  /@\/data\/api/,
  /@\/data\/db/,
  /@\/data\/sync/,
  /^(?:@supabase\/|supabase(?:\/|$))/i,
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

function runtimeImports(
  source: string,
  file = join(projectRoot, "src/features/example.tsx"),
) {
  const result: string[] = [];
  const syntax = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const add = (value: ts.Expression) => {
    if (!ts.isStringLiteral(value)) return;
    const name = value.text;
    result.push(
      name.startsWith(".")
        ? "@/" +
            relative(join(projectRoot, "src"), resolve(dirname(file), name)).replaceAll(
              "\\",
              "/",
            )
        : name,
    );
  };
  const visit = (node: ts.Node) => {
    if (ts.isImportTypeNode(node)) return;
    if (ts.isImportDeclaration(node)) {
      const clause = node.importClause;
      const bindings = clause?.namedBindings;
      if (
        !clause?.isTypeOnly &&
        (!bindings ||
          !ts.isNamedImports(bindings) ||
          clause?.name ||
          bindings.elements.length === 0 ||
          bindings.elements.some((element) => !element.isTypeOnly))
      )
        add(node.moduleSpecifier);
    } else if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier &&
      !node.isTypeOnly &&
      (!node.exportClause ||
        !ts.isNamedExports(node.exportClause) ||
        node.exportClause.elements.length === 0 ||
        node.exportClause.elements.some((element) => !element.isTypeOnly))
    )
      add(node.moduleSpecifier);
    else if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === "require")) &&
      node.arguments[0]
    )
      add(node.arguments[0]);
    ts.forEachChild(node, visit);
  };
  visit(syntax);
  return result;
}

describe("foundation architecture boundaries", () => {
  it("keeps UI and domain modules away from direct data infrastructure", () => {
    const directories = [
      join(projectRoot, "app"),
      join(projectRoot, "src/components"),
      join(projectRoot, "src/domain"),
      join(projectRoot, "src/features"),
    ];

    for (const file of directories.flatMap(sourceFiles)) {
      if (/\.test\.tsx?$/.test(file) || file.includes("/__tests__/")) continue;

      const source = readFileSync(file, "utf8");

      for (const forbiddenImport of forbiddenImports) {
        for (const module of runtimeImports(source, file))
          expect(module, `${file} imports ${module}`).not.toMatch(forbiddenImport);
      }
    }
  });

  it("keeps server-only environment files out of Metro source extensions", () => {
    expect(readFileSync(join(projectRoot, "package.json"), "utf8")).not.toContain(
      ".env.backend.local",
    );
  });

  it("keeps the removable Ledger prototype out of normal runtime composition", () => {
    const prototypeDirectory = join(projectRoot, "src/features/ledger-prototype");
    const files = [join(projectRoot, "app"), join(projectRoot, "src")]
      .flatMap(sourceFiles)
      .filter(
        (file) =>
          !file.startsWith(prototypeDirectory) &&
          !/\.test\.tsx?$/.test(file) &&
          !file.includes("/__tests__/"),
      );

    for (const file of files) {
      for (const module of runtimeImports(readFileSync(file, "utf8"), file))
        expect(module, file).not.toContain("ledger-prototype");
    }
  });

  it("routes validated persisted ids into the focused Transfer detail", () => {
    const route = readFileSync(
      join(projectRoot, "app/(tabs)/expenses/transfer/[id].tsx"),
      "utf8",
    );
    const detail = readFileSync(
      join(projectRoot, "src/features/ledger/TransferDetailScreen.tsx"),
      "utf8",
    );

    expect(route).toContain("focusedTransferParams(id, journeyId)");
    expect(route).toContain("<TransferDetailScreen");
    expect(detail).toContain("item.settlement.journeyId === journeyId");
    expect(detail).not.toContain("SettlementReadinessScreen");
  });
});

it("checks static/dynamic/require/re-export infrastructure while ignoring comments, display copy and erased type imports", () => {
  expect(
    runtimeImports(`// import db from "expo-sqlite"
    const label = "ledger-prototype";
    import type { Context } from "@/data/db/database";
    import { type Row } from "@/data/api/client";
    type T = import("@/data/db/database").Context;
    export type { Row } from "@/data/sync/worker";`),
  ).toEqual([]);
  expect(
    runtimeImports(
      `import db from "expo-sqlite"; import("../data/db/database"); require("@supabase/supabase-js"); export { run } from "@/data/sync/worker"; import { type Row, run } from "@/data/api/client";`,
    ),
  ).toEqual([
    "expo-sqlite",
    "@/data/db/database",
    "@supabase/supabase-js",
    "@/data/sync/worker",
    "@/data/api/client",
  ]);
});
