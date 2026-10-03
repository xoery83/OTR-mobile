import { en, zhHans } from "../../src/ui/catalogs";
import { glossaryTerms, terminologyIssues } from "./terminology";
import { readFileSync } from "node:fs";
import { uiDebt, newUiDebt, representativeFiles, scanUiSource, uiFiles } from "./guard";
const glossary = glossaryTerms(
  readFileSync("docs/architecture/OTR_TERMINOLOGY_GLOSSARY.md", "utf8"),
);
if (Object.keys(glossary).length !== 47)
  throw new Error(
    "Normative glossary table is missing or changed; review guard coverage.",
  );
for (const issue of terminologyIssues(en, zhHans, glossary)) {
  console.error("Catalog terminology: " + issue.key + " violates " + issue.rule);
  process.exitCode = 1;
}
const baseline = JSON.parse(
  readFileSync("scripts/ui/legacy-baseline.json", "utf8"),
) as Record<string, number>;
const current = uiDebt(process.cwd());
const added = newUiDebt(current, baseline);
if (added.length) {
  for (const [key, count] of added)
    console.error(`${key}: ${count - (baseline[key] ?? 0)} new occurrence(s)`);
  process.exitCode = 1;
}

const covered = new Set(representativeFiles(process.cwd()));
// Frozen pre-foundation file inventory, including old files with zero scanner findings.
// This is not a violation baseline and never exempts covered trees or new literals.
const oldFiles = new Set<string>(
  JSON.parse(readFileSync("scripts/ui/legacy-files.json", "utf8")),
);
// New modules also need canonical native/form/theme inheritance. No baseline
// forgiveness applies inside representative trees or to new UI files.
for (const file of new Set([
  ...covered,
  ...uiFiles(process.cwd())
    .map((file) => file.slice(process.cwd().length + 1))
    .filter((file) => !oldFiles.has(file) && !/\.(test|spec)\./.test(file)),
])) {
  const issues = scanUiSource(readFileSync(file, "utf8"), file, true);
  for (const issue of issues) {
    console.error(`${file}:${issue.line} incomplete ${issue.rule}: ${issue.value}`);
    process.exitCode = 1;
  }
}

if (!process.exitCode)
  console.log(
    `UI guard PASS; ${Object.values(current).reduce((a, b) => a + b, 0)} legacy occurrences; ${covered.size} representative UI files checked without baseline forgiveness.`,
  );
