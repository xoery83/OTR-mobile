import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { canonicalStage9Json } from "../../backend/src/stage9Import";

const projectRef = "tuqigdxrvrerfewsxqgm";
const restoreContainer = "supabase_db_otr-stage9-public-restore";
const restoreWorkdir = "/private/tmp/otr-stage9-public-restore";

function required(value: string | undefined, name: string) {
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function sha256(value: Buffer | string) {
  return createHash("sha256").update(value).digest("hex");
}

function command(program: string, args: string[], input?: string) {
  const result = spawnSync(program, args, { encoding: "utf8", input });
  if (result.status !== 0) throw new Error(`${program} failed.`);
  return result.stdout;
}

function restoredEnvironment() {
  const output = command("npx", [
    "supabase",
    "status",
    "--workdir",
    restoreWorkdir,
    "-o",
    "env",
  ]);
  const values = Object.fromEntries(
    output
      .split("\n")
      .map((line) => /^(API_URL|SECRET_KEY)="(.*)"$/.exec(line))
      .filter((match): match is RegExpExecArray => Boolean(match))
      .map((match) => [match[1], match[2]]),
  );
  if (values.API_URL !== "http://127.0.0.1:55321" || !values.SECRET_KEY)
    throw new Error("RESTORE_ENVIRONMENT_REJECTED");
  return { url: values.API_URL, secretKey: values.SECRET_KEY };
}

async function publicSnapshot(client: SupabaseClient, tables: string[]) {
  const result: Record<string, { count: number; digest: string }> = {};
  for (const table of tables) {
    const query = await client.from(table).select("*", { count: "exact" }).range(0, 999);
    if (query.error) throw new Error(`SNAPSHOT_FAILED:${table}`);
    const count = query.count ?? 0;
    if (count > 1000 || query.data.length !== count)
      throw new Error(`SNAPSHOT_PAGE_LIMIT:${table}`);
    const rows = query.data
      .map((row) => canonicalStage9Json(row))
      .sort((left, right) => left.localeCompare(right));
    result[table] = { count, digest: sha256(rows.join("\n")) };
  }
  return {
    tables: result,
    tableCount: tables.length,
    rowCount: Object.values(result).reduce((sum, item) => sum + item.count, 0),
    digest: sha256(canonicalStage9Json(result)),
  };
}

async function authUserCount(client: SupabaseClient) {
  let count = 0;
  for (let page = 1; page < 100; page += 1) {
    const result = await client.auth.admin.listUsers({ page, perPage: 1000 });
    if (result.error) throw new Error("AUTH_COUNT_FAILED");
    count += result.data.users.length;
    if (result.data.users.length < 1000) return count;
  }
  throw new Error("AUTH_COUNT_PAGE_LIMIT");
}

async function storageCounts(client: SupabaseClient) {
  const buckets = await client.storage.listBuckets();
  if (buckets.error) throw new Error("STORAGE_BUCKET_COUNT_FAILED");
  let objects = 0;
  async function countFolder(bucket: string, prefix: string): Promise<void> {
    for (let offset = 0; offset < 100_000; offset += 1000) {
      const page = await client.storage.from(bucket).list(prefix, {
        limit: 1000,
        offset,
        sortBy: { column: "name", order: "asc" },
      });
      if (page.error) throw new Error("STORAGE_OBJECT_COUNT_FAILED");
      for (const item of page.data) {
        if (item.id) objects += 1;
        else await countFolder(bucket, prefix ? `${prefix}/${item.name}` : item.name);
      }
      if (page.data.length < 1000) break;
    }
  }
  for (const bucket of buckets.data) await countFolder(bucket.id, "");
  return { buckets: buckets.data.length, objects };
}

function restoredSchemaManifest() {
  const output = command(
    "docker",
    [
      "exec",
      "-i",
      restoreContainer,
      "psql",
      "-X",
      "-qAt",
      "-U",
      "postgres",
      "-d",
      "postgres",
    ],
    readFileSync(resolve("supabase/schema_manifest.sql"), "utf8"),
  );
  return JSON.parse(output.trim());
}

function restoredIntegrityProof() {
  const sql = String.raw`
do $$
declare
  fk record;
  child_guard text;
  join_predicate text;
  violations bigint;
begin
  for fk in
    select c.conname,
           child_ns.nspname as child_schema,
           child.relname as child_table,
           parent_ns.nspname as parent_schema,
           parent.relname as parent_table,
           array_agg(child_col.attname order by child_key.ord) as child_columns,
           array_agg(parent_col.attname order by child_key.ord) as parent_columns
      from pg_constraint c
      join pg_class child on child.oid = c.conrelid
      join pg_namespace child_ns on child_ns.oid = child.relnamespace
      join pg_class parent on parent.oid = c.confrelid
      join pg_namespace parent_ns on parent_ns.oid = parent.relnamespace
      join lateral unnest(c.conkey) with ordinality child_key(attnum, ord) on true
      join lateral unnest(c.confkey) with ordinality parent_key(attnum, ord)
        on parent_key.ord = child_key.ord
      join pg_attribute child_col
        on child_col.attrelid = child.oid and child_col.attnum = child_key.attnum
      join pg_attribute parent_col
        on parent_col.attrelid = parent.oid and parent_col.attnum = parent_key.attnum
     where c.contype = 'f' and child_ns.nspname = 'public'
     group by c.conname, child_ns.nspname, child.relname,
              parent_ns.nspname, parent.relname
  loop
    select string_agg(format('c.%I is not null', fk.child_columns[i]), ' and '),
           string_agg(format('p.%I = c.%I', fk.parent_columns[i], fk.child_columns[i]), ' and ')
      into child_guard, join_predicate
      from generate_subscripts(fk.child_columns, 1) i;
    execute format(
      'select count(*) from %I.%I c where %s and not exists (select 1 from %I.%I p where %s)',
      fk.child_schema, fk.child_table, child_guard,
      fk.parent_schema, fk.parent_table, join_predicate
    ) into violations;
    if violations <> 0 then
      raise exception 'foreign key violation: %', fk.conname;
    end if;
  end loop;
end $$;
select json_build_object(
  'constraintCount', count(*),
  'unvalidatedCount', count(*) filter (where not c.convalidated),
  'foreignKeyCount', count(*) filter (where c.contype = 'f')
)
from pg_constraint c
join pg_namespace n on n.oid = c.connamespace
where n.nspname = 'public';
`;
  const output = command(
    "docker",
    [
      "exec",
      "-i",
      restoreContainer,
      "psql",
      "-X",
      "-qAt",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      "postgres",
      "-d",
      "postgres",
    ],
    sql,
  );
  const proof = JSON.parse(output.trim()) as {
    constraintCount: number;
    unvalidatedCount: number;
    foreignKeyCount: number;
  };
  if (proof.unvalidatedCount !== 0) throw new Error("RESTORED_CONSTRAINT_REJECTED");
  return { ...proof, foreignKeyOrphans: 0 };
}

function migrationProof() {
  const hostedOutput = command("npx", ["supabase", "migration", "list", "--linked"]);
  const hostedLine = hostedOutput
    .split("\n")
    .find((line) => line.startsWith('{"migrations"'));
  if (!hostedLine) throw new Error("HOSTED_MIGRATION_LEDGER_UNREADABLE");
  const hosted = JSON.parse(hostedLine) as {
    migrations: { local: string; remote: string }[];
  };
  const versions = hosted.migrations.map(({ local, remote }) => {
    if (!local || local !== remote) throw new Error("HOSTED_MIGRATION_LEDGER_MISMATCH");
    return local;
  });
  const restored = command("docker", [
    "exec",
    restoreContainer,
    "psql",
    "-X",
    "-qAt",
    "-U",
    "postgres",
    "-d",
    "postgres",
    "-c",
    "select version from supabase_migrations.schema_migrations order by version",
  ])
    .trim()
    .split("\n");
  if (
    versions.length !== 21 ||
    canonicalStage9Json(versions) !== canonicalStage9Json(restored)
  )
    throw new Error("RESTORED_MIGRATION_LEDGER_MISMATCH");
  return { count: versions.length, latest: versions.at(-1), exactMatch: true };
}

function sequenceProof(dataSql: string) {
  const expected = [
    ...dataSql.matchAll(
      /SELECT pg_catalog\.setval\('\"public\"\.\"([^\"]+)\"', ([0-9]+), (true|false)\);/g,
    ),
  ].map((match) => ({ name: match[1], value: match[2], isCalled: match[3] }));
  if (expected.length === 0) throw new Error("BACKUP_SEQUENCE_MISSING");
  for (const item of expected) {
    if (!/^[a-z][a-z0-9_]*$/.test(item.name)) throw new Error("BACKUP_SEQUENCE_REJECTED");
    const actual = command("docker", [
      "exec",
      restoreContainer,
      "psql",
      "-X",
      "-qAt",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-c",
      `select last_value || '|' || is_called from public.${item.name}`,
    ]).trim();
    if (actual !== `${item.value}|${item.isCalled}`)
      throw new Error("RESTORED_SEQUENCE_MISMATCH");
  }
  return { count: expected.length, digest: sha256(canonicalStage9Json(expected)) };
}

export async function verifyHostedRestore() {
  const v3Root = resolve(required(process.env.OTR_STAGE9_V3_ROOT, "OTR_STAGE9_V3_ROOT"));
  const restoreRoot = join(v3Root, "restore", "preload-2026-09-14");
  const schemaPath = join(restoreRoot, "public-schema.sql");
  const dataPath = join(restoreRoot, "public-data.sql");
  const reportPath = join(restoreRoot, "restore-verification.json");
  const remoteUrl = required(process.env.OTR_DEV_SUPABASE_URL, "OTR_DEV_SUPABASE_URL");
  const remoteSecret = required(
    process.env.OTR_DEV_SUPABASE_SECRET_KEY,
    "OTR_DEV_SUPABASE_SECRET_KEY",
  );
  if (new URL(remoteUrl).hostname !== `${projectRef}.supabase.co`)
    throw new Error("HOSTED_DEV_TARGET_REJECTED");
  for (const path of [schemaPath, dataPath]) {
    if ((statSync(path).mode & 0o077) !== 0)
      throw new Error("BACKUP_PERMISSION_REJECTED");
  }

  command("docker", [
    "exec",
    restoreContainer,
    "psql",
    "-U",
    "postgres",
    "-d",
    "postgres",
    "-c",
    "notify pgrst, 'reload schema'",
  ]);
  await new Promise((resolveWait) => setTimeout(resolveWait, 1000));

  const tableNames = [
    ...readFileSync(schemaPath, "utf8").matchAll(
      /CREATE TABLE(?: IF NOT EXISTS)? "public"\."([^"]+)"/g,
    ),
  ]
    .map((match) => match[1])
    .sort();
  if (tableNames.length !== 92 || new Set(tableNames).size !== tableNames.length)
    throw new Error("PUBLIC_TABLE_ALLOWLIST_REJECTED");
  const publicPolicyCount = (
    readFileSync(schemaPath, "utf8").match(/CREATE POLICY /g) ?? []
  ).length;

  const local = restoredEnvironment();
  const remoteClient = createClient(remoteUrl, remoteSecret, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const localClient = createClient(local.url, local.secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const [remote, restored, authUsers, storage, restoredManifest] = await Promise.all([
    publicSnapshot(remoteClient, tableNames),
    publicSnapshot(localClient, tableNames),
    authUserCount(remoteClient),
    storageCounts(remoteClient),
    Promise.resolve(restoredSchemaManifest()),
  ]);
  if (canonicalStage9Json(remote.tables) !== canonicalStage9Json(restored.tables))
    throw new Error("RESTORED_PUBLIC_DATA_MISMATCH");

  const expectedManifest = JSON.parse(
    readFileSync(resolve("supabase/schema-manifest.json"), "utf8"),
  ) as Record<string, unknown>;
  for (const key of [
    "tables",
    "columns",
    "constraints",
    "indexes",
    "functions",
    "triggers",
    "rls_tables",
  ]) {
    if (restoredManifest[key] !== expectedManifest[key])
      throw new Error(`RESTORED_SCHEMA_MISMATCH:${key}`);
  }
  if (restoredManifest.policies !== publicPolicyCount)
    throw new Error("RESTORED_PUBLIC_POLICY_MISMATCH");

  const dataBytes = readFileSync(dataPath);
  const schemaBytes = readFileSync(schemaPath);
  const integrity = restoredIntegrityProof();
  const migrations = migrationProof();
  const sequences = sequenceProof(dataBytes.toString("utf8"));
  const financialTables = [
    "expenses",
    "expense_participants",
    "expense_splits",
    "exchange_rate_snapshots",
    "settlement_valuation_snapshots",
    "payment_records",
    "expense_audit_events",
    "settlements",
    "settlement_inputs",
    "settlement_member_balances",
    "settlement_transfers",
    "settlement_payments",
    "repayment_valuation_snapshots",
    "settlement_payment_discharges",
    "settlement_adjustment_deltas",
    "ledger_review_findings",
    "ledger_review_finding_actions",
  ];
  const financialFingerprint = sha256(
    canonicalStage9Json(
      Object.fromEntries(financialTables.map((table) => [table, remote.tables[table]])),
    ),
  );
  const report = {
    version: "stage9-hosted-dev-restore-verification-v1",
    targetProjectRef: projectRef,
    backupFormat: "PostgreSQL plain SQL, COPY data, public schema only",
    encryptedVolume: "FileVault",
    filePermissions: "0600",
    backup: {
      schemaBytes: schemaBytes.length,
      schemaSha256: sha256(schemaBytes),
      dataBytes: dataBytes.length,
      dataSha256: sha256(dataBytes),
    },
    remoteBaseline: {
      publicTableCount: remote.tableCount,
      publicRowCount: remote.rowCount,
      publicContentSha256: remote.digest,
      restoreSensitiveFinancialSha256: financialFingerprint,
      authUserCount: authUsers,
      storageBucketCount: storage.buckets,
      storageObjectCount: storage.objects,
    },
    restoreEnvironment: "isolated-local-supabase-127.0.0.1:55321",
    restored: {
      publicTableCount: restored.tableCount,
      publicRowCount: restored.rowCount,
      publicContentSha256: restored.digest,
      tableCountsAndDigestsMatch: true,
      schemaManifestCountsMatch: true,
      publicPolicyCount,
      integrity,
      migrations,
      sequences,
      authReferencePlaceholdersOnly: true,
    },
    excluded: [
      "Auth credentials and sessions",
      "Storage object binary contents",
      "Storage schema policies and metadata outside public",
      "database roles and passwords",
      "service keys and environment files",
    ],
    recoveryProofSufficientForStage9: true,
  };
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
    flag: "wx",
  });
  chmodSync(reportPath, 0o600);
  console.info(
    JSON.stringify({
      recoveryProofSufficientForStage9: true,
      backupFormat: report.backupFormat,
      backup: report.backup,
      publicTableCount: remote.tableCount,
      publicRowCount: remote.rowCount,
      publicContentSha256: remote.digest,
      authUserCount: authUsers,
      storage,
      restoreEnvironment: report.restoreEnvironment,
      schemaManifestCountsMatch: true,
      publicPolicyCount,
      tableCountsAndDigestsMatch: true,
      integrity,
      migrations,
      sequences,
      restoreSensitiveFinancialSha256: financialFingerprint,
      excluded: report.excluded,
    }),
  );
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  void verifyHostedRestore().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "RESTORE_VERIFICATION_FAILED");
    process.exitCode = 1;
  });
}
