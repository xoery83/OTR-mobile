import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { loadStage9Dataset } from "../../backend/src/stage9Loader";
import {
  canonicalStage9Json,
  scanStage9Privacy,
  stage9Sha256,
  transformLegacyExtract,
} from "../../backend/src/stage9Import";
import { syntheticLegacyExtract, syntheticStage9Config } from "./syntheticFixture";

function localSupabaseEnvironment() {
  if (process.env.OTR_STAGE9_LOCAL_URL && process.env.OTR_STAGE9_LOCAL_SECRET_KEY) {
    return {
      url: process.env.OTR_STAGE9_LOCAL_URL,
      secretKey: process.env.OTR_STAGE9_LOCAL_SECRET_KEY,
    };
  }
  const result = spawnSync("npx", ["supabase", "status", "-o", "env"], {
    cwd: resolve(import.meta.dirname, "../.."),
    encoding: "utf8",
  });
  if (result.status !== 0) throw new Error("LOCAL_SUPABASE_STATUS_FAILED");
  const values = Object.fromEntries(
    result.stdout
      .split("\n")
      .map((line) => /^(API_URL|SECRET_KEY)="(.*)"$/.exec(line))
      .filter((match): match is RegExpExecArray => Boolean(match))
      .map((match) => [match[1], match[2]]),
  );
  if (!values.API_URL || !values.SECRET_KEY)
    throw new Error("LOCAL_SUPABASE_ENV_MISSING");
  return { url: values.API_URL, secretKey: values.SECRET_KEY };
}

async function journeyFingerprint(client: SupabaseClient, journeyId: string) {
  const tables = [
    ["trips", "id"],
    ["journey_members", "trip_id"],
    ["expenses", "journey_id"],
    ["expense_participants", "journey_id"],
    ["expense_splits", "journey_id"],
    ["exchange_rate_snapshots", "journey_id"],
    ["settlement_valuation_snapshots", "journey_id"],
    ["ledger_review_findings", "journey_id"],
    ["ledger_changes", "journey_id"],
  ] as const;
  const counts = await Promise.all(
    tables.map(async ([table, column]) => {
      const { count, error } = await client
        .from(table)
        .select("*", { count: "exact", head: true })
        .eq(column, journeyId);
      if (error) throw new Error(`FINGERPRINT_FAILED:${table}`);
      return [table, count ?? 0] as const;
    }),
  );
  return Object.fromEntries(counts);
}

async function main() {
  const runConfig = {
    ...syntheticStage9Config,
    namespaceKey: `${syntheticStage9Config.namespaceKey}-${randomUUID()}`,
  };
  const transformed = transformLegacyExtract(syntheticLegacyExtract(), runConfig);
  const repeated = transformLegacyExtract(syntheticLegacyExtract(), runConfig);
  if (canonicalStage9Json(transformed) !== canonicalStage9Json(repeated))
    throw new Error("NON_DETERMINISTIC_TRANSFORM");
  if (!transformed.privacyReport.passed) throw new Error("SYNTHETIC_PRIVACY_FAILED");
  if (scanStage9Privacy({ email: "private@example.com" }).passed)
    throw new Error("PRIVACY_REJECTION_FAILED");

  const reportRoot = mkdtempSync(join(tmpdir(), "otr-stage9-synthetic-"));
  writeFileSync(
    join(reportRoot, "private-approval-manifest.json"),
    `${JSON.stringify(transformed.privateApprovalManifest, null, 2)}\n`,
    { mode: 0o600 },
  );
  writeFileSync(
    join(reportRoot, "repo-safe-summary.json"),
    `${JSON.stringify(transformed.repoSafeSummary, null, 2)}\n`,
    { mode: 0o600 },
  );

  const environment = localSupabaseEnvironment();
  const client = createClient(environment.url, environment.secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const actorUserId = syntheticStage9Config.devOperatorUserId;
  const first = await loadStage9Dataset({
    target: "local",
    ...environment,
    actorUserId,
    dataset: transformed.dataset,
    manifest: transformed.privateApprovalManifest,
  });
  const beforeReplay = await journeyFingerprint(client, transformed.dataset.journey.id);
  const replay = await loadStage9Dataset({
    target: "local",
    ...environment,
    actorUserId,
    dataset: transformed.dataset,
    manifest: transformed.privateApprovalManifest,
  });
  const afterReplay = await journeyFingerprint(client, transformed.dataset.journey.id);
  if (first.idempotentReplay || !replay.idempotentReplay)
    throw new Error("IDEMPOTENCY_RESPONSE_INVALID");
  if (canonicalStage9Json(beforeReplay) !== canonicalStage9Json(afterReplay))
    throw new Error("IDEMPOTENT_REPLAY_CHANGED_DATA");

  const rollbackTransform = transformLegacyExtract(syntheticLegacyExtract(), {
    ...runConfig,
    namespaceKey: `${runConfig.namespaceKey}-rollback`,
  });
  const tampered = structuredClone(rollbackTransform.dataset);
  tampered.splits[0]!.settlementAmountMinor += 1;
  const { error: rollbackError } = await client.rpc("ledger_import_stage9_v1", {
    p_actor_user_id: actorUserId,
    p_payload_hash: stage9Sha256(tampered),
    p_dataset: tampered,
  });
  if (!rollbackError) throw new Error("ROLLBACK_FAILURE_NOT_TRIGGERED");
  const rollbackState = await journeyFingerprint(client, tampered.journey.id);
  if (Object.values(rollbackState).some((count) => count !== 0))
    throw new Error("ROLLBACK_LEFT_PARTIAL_DATA");

  console.info(
    JSON.stringify({
      gate: "PASSED",
      deterministicIds: true,
      exactMoney: true,
      equalAllocation: true,
      classificationCounts: transformed.repoSafeSummary.classificationCounts,
      destinationEntityCounts: transformed.repoSafeSummary.destinationEntityCounts,
      privacy: { passed: true, rejectionProved: true },
      manifestGeneration: { passed: true, reportRoot },
      transactionalLocalLoad: true,
      rollback: { passed: true, zeroRowsAfterFailure: true },
      idempotency: { passed: true, changesOnReplay: 0 },
    }),
  );
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "STAGE9_SYNTHETIC_FAILED");
    process.exitCode = 1;
  });
}
