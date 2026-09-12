import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const baselinePath =
  "supabase/migrations/20260910000100_canonical_production_baseline.sql";
const securityPath =
  "supabase/migrations/20260910000200_canonical_security_hardening.sql";
const ledgerDomainPath = "supabase/migrations/20260911000100_ledger_2_domain.sql";
const ledgerSecurityPath = "supabase/migrations/20260911000200_ledger_2_security.sql";
const ledger4APath = "supabase/migrations/20260912000100_ledger_2_stage_4a_create.sql";
const ledger4BPath = "supabase/migrations/20260912000200_ledger_2_stage_4b_mutations.sql";
const ledger4CPath = "supabase/migrations/20260912000300_ledger_2_stage_4c_conflicts.sql";
const ledger51Path =
  "supabase/migrations/20260912000400_ledger_2_stage_5_1_financial_evidence.sql";
const ledger51LinksPath =
  "supabase/migrations/20260912000500_ledger_2_stage_5_1_evidence_links.sql";
const seedPath = "supabase/seed.sql";

const [
  baseline,
  security,
  ledgerDomain,
  ledgerSecurity,
  ledger4A,
  ledger4B,
  ledger4C,
  ledger51,
  ledger51Links,
  seed,
  manifestRaw,
] = await Promise.all([
  readFile(baselinePath, "utf8"),
  readFile(securityPath, "utf8"),
  readFile(ledgerDomainPath, "utf8"),
  readFile(ledgerSecurityPath, "utf8"),
  readFile(ledger4APath, "utf8"),
  readFile(ledger4BPath, "utf8"),
  readFile(ledger4CPath, "utf8"),
  readFile(ledger51Path, "utf8"),
  readFile(ledger51LinksPath, "utf8"),
  readFile(seedPath, "utf8"),
  readFile("supabase/schema-manifest.json", "utf8"),
]);

const manifest = JSON.parse(manifestRaw);
const expected = {
  tables: 86,
  columns: 1193,
  constraints: 583,
  indexes: 288,
  functions: 53,
  triggers: 72,
  rls_tables: 86,
  policies: 178,
  buckets: 2,
};

for (const [key, value] of Object.entries(expected)) {
  if (manifest[key] !== value) {
    throw new Error(`Expected ${key}=${value}; received ${manifest[key]}.`);
  }
}

function tableDefinition(tableName) {
  const marker = `create table public."${tableName}" (`;
  const start = baseline.indexOf(marker);
  const end = baseline.indexOf("\n);", start);
  if (start < 0 || end < 0) throw new Error(`Missing table: ${tableName}`);
  return baseline.slice(start, end);
}

for (const [tableName, columnName] of [
  ["ai_jobs", "current_step"],
  ["memory_entries", "parent_memory_id"],
]) {
  if (tableDefinition(tableName).includes(`"${columnName}"`)) {
    throw new Error(`Baseline contains deferred column: ${tableName}.${columnName}`);
  }
}

if (!security.includes("protect_profile_account_role_trigger")) {
  throw new Error("Account-role protection trigger is missing.");
}

const secretPatterns = [
  /https?:\/\/[a-z0-9-]+\.supabase\.co/i,
  /eyJ[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}/,
  /(?:service_role|anon)_key\s*=/i,
  /@(?:gmail|icloud|outlook|hotmail|kongzhong)\./i,
];
for (const pattern of secretPatterns) {
  if (
    pattern.test(
      `${baseline}\n${security}\n${ledgerDomain}\n${ledgerSecurity}\n${ledger4A}\n${ledger4B}\n${ledger4C}\n${ledger51}\n${ledger51Links}\n${seed}`,
    )
  ) {
    throw new Error(`Production identifier or secret-like value found: ${pattern}`);
  }
}

const nonInvalidEmails = seed.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? [];
if (nonInvalidEmails.some((email) => !email.endsWith("@otr.invalid"))) {
  throw new Error("Seed contains a non-reserved email address.");
}

const lineageChecksum = createHash("sha256")
  .update(baseline)
  .update("\0")
  .update(security)
  .update("\0")
  .update(ledgerDomain)
  .update("\0")
  .update(ledgerSecurity)
  .update("\0")
  .update(ledger4A)
  .update("\0")
  .update(ledger4B)
  .update("\0")
  .update(ledger4C)
  .update("\0")
  .update(ledger51)
  .update("\0")
  .update(ledger51Links)
  .digest("hex");

console.log(
  JSON.stringify(
    {
      status: "ok",
      lineageChecksum,
      schemaChecksum: manifest.checksum,
      ...expected,
    },
    null,
    2,
  ),
);
