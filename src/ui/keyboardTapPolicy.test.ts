import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";
import { expect, it } from "vitest";

// Nested parents matter too: a correct inner form cannot override a consuming ancestor.
function productionFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return productionFiles(path);
    return path.endsWith(".tsx") &&
      !path.includes(".test.") &&
      !/(?:Stage|stage\d|acceptance|physical-smoke|ledger-prototype|day-feed-lab|flexible-native-gallery|TtrLab)/.test(
        path,
      )
      ? [path]
      : [];
  });
}
it("production scroll/list containers let a handled target receive the first keyboard-open tap", () => {
  const failures: string[] = [];
  let checked = 0;
  for (const path of [...productionFiles("app"), ...productionFiles("src")]) {
    const source = ts.createSourceFile(
      path,
      readFileSync(path, "utf8"),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    const visit = (node: ts.Node) => {
      if (
        (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
        /^(?:Animated\.)?(?:ScrollView|FlatList|SectionList)$/.test(
          node.tagName.getText(source),
        )
      ) {
        checked++;
        const prop = node.attributes.properties.find(
          (property) =>
            ts.isJsxAttribute(property) &&
            property.name.getText(source) === "keyboardShouldPersistTaps",
        );
        if (
          !prop ||
          !ts.isJsxAttribute(prop) ||
          !prop.initializer ||
          !ts.isStringLiteral(prop.initializer) ||
          !["handled", "always"].includes(prop.initializer.text)
        )
          failures.push(
            `${relative(process.cwd(), path)}:${source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1}`,
          );
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  expect(checked).toBeGreaterThan(50);
  expect(failures).toEqual([]);
});
