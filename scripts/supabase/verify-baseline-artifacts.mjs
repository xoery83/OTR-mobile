import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";

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
const ledger52Path =
  "supabase/migrations/20260912000600_ledger_2_stage_5_2_receipt_assets.sql";
const ledger71Path =
  "supabase/migrations/20260912000700_ledger_2_stage_7_1_settlements.sql";
const ledger71GuardPath =
  "supabase/migrations/20260912000800_ledger_2_stage_7_1_active_settlement_guard.sql";
const ledger72APath =
  "supabase/migrations/20260912000900_ledger_2_stage_7_2a_payments.sql";
const ledger72AGrantsPath =
  "supabase/migrations/20260912001000_ledger_2_stage_7_2a_internal_rpc_grants.sql";
const ledger72ALineagePath =
  "supabase/migrations/20260912001100_ledger_2_stage_7_2a_payment_lineage_guard.sql";
const ledger72BPath =
  "supabase/migrations/20260913000100_ledger_2_stage_7_2b_adjustments.sql";
const hostedParityPath =
  "supabase/migrations/20260913000200_hosted_dev_lineage_reconciliation.sql";
const ledger8ReviewPath =
  "supabase/migrations/20260913000300_ledger_2_stage_8_review_actions.sql";
const ledger8FeedPath =
  "supabase/migrations/20260913000400_ledger_2_stage_8_review_change_feed.sql";
const ledger9ImportPath = "supabase/migrations/20260913000500_ledger_stage_9_import.sql";
const settlementParticipationPath =
  "supabase/migrations/20260913000600_ledger_2_settlement_participation.sql";
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
  ledger52,
  ledger71,
  ledger71Guard,
  ledger72A,
  ledger72AGrants,
  ledger72ALineage,
  ledger72B,
  hostedParity,
  ledger8Review,
  ledger8Feed,
  ledger9Import,
  settlementParticipation,
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
  readFile(ledger52Path, "utf8"),
  readFile(ledger71Path, "utf8"),
  readFile(ledger71GuardPath, "utf8"),
  readFile(ledger72APath, "utf8"),
  readFile(ledger72AGrantsPath, "utf8"),
  readFile(ledger72ALineagePath, "utf8"),
  readFile(ledger72BPath, "utf8"),
  readFile(hostedParityPath, "utf8"),
  readFile(ledger8ReviewPath, "utf8"),
  readFile(ledger8FeedPath, "utf8"),
  readFile(ledger9ImportPath, "utf8"),
  readFile(settlementParticipationPath, "utf8"),
  readFile(seedPath, "utf8"),
  readFile("supabase/schema-manifest.json", "utf8"),
]);

const manifest = JSON.parse(manifestRaw);
// Retained 73-version chain through A1-I2C5; activation security foundation remains CLOSED.
const expected = {
  tables: 119,
  buckets: 4,
  columns: 1776,
  indexes: 370,
  checksum: "6675aef5dacbdae84baf5878ad0455f119f44bf3c1d3d3d17bc740d318825486",
  policies: 207,
  triggers: 149,
  functions: 217,
  rls_tables: 119,
  constraints: 1028,
};
const migrationNames = (await readdir("supabase/migrations"))
  .filter((name) => name.endsWith(".sql"))
  .sort();
if (
  migrationNames.length !== 73 ||
  new Set(migrationNames.map((name) => name.slice(0, 14))).size !== 73 ||
  migrationNames.at(-1) !==
    "20261005000200_trip_person_participation_activation_foundation.sql"
) {
  throw new Error("Expected exactly 73 unique migration versions through A1-I2C5.");
}
const collectionFoundation = await readFile(
  "supabase/migrations/20261005000100_trip_event_collection_foundation.sql",
  "utf8",
);
if (
  !collectionFoundation.includes("UNSAFE_TRIP_EVENT_COLLECTION_DEPENDENCY") ||
  !collectionFoundation.includes("EVENT_COLLECTION_REVISION_UNAVAILABLE_OR_OVERFLOW") ||
  !collectionFoundation.includes("roots as materialized") ||
  !collectionFoundation.includes("set extra_float_digits=3") ||
  !collectionFoundation.includes("participant_scope is distinct from 'UNASSIGNED'")
)
  throw new Error("Protected read-only collection foundation missing.");
const participationActivation = await readFile(
  "supabase/migrations/20261005000200_trip_person_participation_activation_foundation.sql",
  "utf8",
);
for (const required of [
  "PARTICIPATION_GATE_GENERATION_CONFLICT",
  "UNSAFE_PARTICIPATION_ACTIVATION_DEPENDENCY",
  "trip_person_activation_security_check(true,false)",
  "pg_advisory_xact_lock(hashtextextended('otr-trip-person-activation',0))",
  "public.trip_person_runtime_state()",
  "/*activation-inventory*/",
  "/*activation-root*/",
  "/*activation-checker*/",
  "/*activation-anchor*/",
  "UNSAFE_PARTICIPATION_ACTIVATION_ANCHOR_ROOT",
  "UNSAFE_PARTICIPATION_ACTIVATION_LIVE_ROOT",
  "UNSAFE_PARTICIPATION_ACTIVATION_INVENTORY",
  "UNSAFE_PARTICIPATION_ACTIVATION_MUTUAL_PIN",
  "UNSAFE_PARTICIPATION_ACTIVATION_OVERLOAD",
  "generation bigint not null default 0",
])
  if (!participationActivation.includes(required))
    throw new Error("Protected closed activation security foundation missing.");

// Independent installation/source anchor. Neither normalized function literals nor
// a caller-supplied root can redefine this reviewed executable anchor.
const reviewedRoot = "1f6bd2cb0fe9b6a9ddbd611d78e3c8fe33de63a6676032f6d412e228b936199a";
const reviewedAnchor = `create function public.trip_person_activation_reviewed_root() returns text
language sql immutable security invoker set search_path=pg_catalog
as $anchor$ select '${reviewedRoot}'::text $anchor$;`;
if (!participationActivation.includes(reviewedAnchor))
  throw new Error("Independent reviewed participation root anchor changed.");

const sourceCommand = await readFile(
  "supabase/migrations/20261004000500_trip_source_command_foundation.sql",
  "utf8",
);
const personCommand = await readFile(
  "supabase/migrations/20261004000600_trip_person_command_foundation.sql",
  "utf8",
);
if (
  !personCommand.includes("trip_person_gate_closed check(not enabled)") ||
  !personCommand.includes("pg_shdepend") ||
  !personCommand.includes("PARTICIPATION_ISOLATION_UNSUPPORTED")
)
  throw new Error("Protected closed participation foundation missing.");

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
      `${baseline}\n${security}\n${ledgerDomain}\n${ledgerSecurity}\n${ledger4A}\n${ledger4B}\n${ledger4C}\n${ledger51}\n${ledger51Links}\n${ledger52}\n${ledger71}\n${ledger71Guard}\n${ledger72A}\n${ledger72AGrants}\n${ledger72ALineage}\n${ledger72B}\n${hostedParity}\n${ledger8Review}\n${ledger8Feed}\n${ledger9Import}\n${settlementParticipation}\n${sourceCommand}\n${personCommand}\n${collectionFoundation}\n${participationActivation}\n${seed}`,
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
  .update("\0")
  .update(ledger52)
  .update("\0")
  .update(ledger71)
  .update("\0")
  .update(ledger71Guard)
  .update("\0")
  .update(ledger72A)
  .update("\0")
  .update(ledger72AGrants)
  .update("\0")
  .update(ledger72ALineage)
  .update("\0")
  .update(ledger72B)
  .update("\0")
  .update(hostedParity)
  .update("\0")
  .update(ledger8Review)
  .update("\0")
  .update(ledger8Feed)
  .update("\0")
  .update(ledger9Import)
  .update("\0")
  .update(settlementParticipation)
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
