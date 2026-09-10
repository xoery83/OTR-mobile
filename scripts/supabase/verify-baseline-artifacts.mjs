import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const baselinePath =
  "supabase/migrations/20260910000100_canonical_production_baseline.sql";
const securityPath =
  "supabase/migrations/20260910000200_canonical_security_hardening.sql";
const seedPath = "supabase/seed.sql";

const [baseline, security, seed, manifestRaw] = await Promise.all([
  readFile(baselinePath, "utf8"),
  readFile(securityPath, "utf8"),
  readFile(seedPath, "utf8"),
  readFile("supabase/schema-manifest.json", "utf8"),
]);

const manifest = JSON.parse(manifestRaw);
const expected = {
  tables: 64,
  columns: 910,
  constraints: 329,
  indexes: 240,
  functions: 29,
  triggers: 32,
  rls_tables: 64,
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
  if (pattern.test(`${baseline}\n${security}\n${seed}`)) {
    throw new Error(`Production identifier or secret-like value found: ${pattern}`);
  }
}

const nonInvalidEmails = seed.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? [];
if (nonInvalidEmails.some((email) => !email.endsWith("@otr.invalid"))) {
  throw new Error("Seed contains a non-reserved email address.");
}

const migrationChecksum = createHash("sha256")
  .update(baseline)
  .update("\0")
  .update(security)
  .digest("hex");

console.log(
  JSON.stringify(
    {
      status: "ok",
      migrationChecksum,
      schemaChecksum: manifest.checksum,
      ...expected,
    },
    null,
    2,
  ),
);
