import { createHash } from "node:crypto";
import { chmodSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import {
  canonicalStage9Json,
  scanStage9Privacy,
  stage9DatasetSchema,
  stage9Sha256,
  STAGE9_ALLOCATION_VERSION,
  STAGE9_MAPPING_VERSION,
  STAGE9_NORMALIZATION_VERSION,
  STAGE9_TARGET_PROJECT_REF,
  STAGE9_TRANSFORM_VERSION,
  type Stage9Dataset,
  type Stage9PrivateApprovalManifest,
} from "../../backend/src/stage9Import";
import { loadStage9Dataset } from "../../backend/src/stage9Loader";
import { readCommittedStage9Raw } from "./transform-private";

const expectedDatasetSha256 =
  "be1fce8c0a4a681e2f520484401317a9ba3611cab1d0636f1c07bee754268a49";
const expectedRawSha256 =
  "7376dbac22830d05689c3ea1626395c03b4857ba2877d1360c600d5e7ef0f578";
const expectedCounts = {
  members: 8,
  expenses: 126,
  participants: 531,
  splits: 531,
  rateSnapshots: 126,
  valuations: 126,
  reviewFindings: 0,
} as const;

type Row = Record<string, unknown>;

function required(value: string | undefined, name: string) {
  if (!value) throw new Error(`${name}_MISSING`);
  return value;
}

function sha256(value: Buffer | string) {
  return createHash("sha256").update(value).digest("hex");
}

function assert(condition: unknown, code: string): asserts condition {
  if (!condition) throw new Error(code);
}

function sortedRows(rows: unknown[]) {
  return rows.map(canonicalStage9Json).sort();
}

function assertRows(actual: unknown[], expected: unknown[], code: string) {
  assert(
    canonicalStage9Json(sortedRows(actual)) === canonicalStage9Json(sortedRows(expected)),
    code,
  );
}

async function rows(
  client: SupabaseClient,
  table: string,
  column: string,
  value: string,
  select = "*",
) {
  const result = await client
    .from(table)
    .select(select, { count: "exact" })
    .eq(column, value)
    .range(0, 999);
  if (result.error) throw new Error(`READ_FAILED:${table}`);
  assert((result.count ?? 0) <= 1000, `READ_PAGE_LIMIT:${table}`);
  assert(result.data.length === result.count, `READ_COUNT_MISMATCH:${table}`);
  return result.data as unknown as Row[];
}

const snapshotTables = [
  ["trips", "id"],
  ["journey_members", "trip_id"],
  ["ledger_settings", "journey_id"],
  ["expenses", "journey_id"],
  ["expense_participants", "journey_id"],
  ["expense_splits", "journey_id"],
  ["exchange_rate_snapshots", "journey_id"],
  ["payment_records", "journey_id"],
  ["settlement_valuation_snapshots", "journey_id"],
  ["expense_links", "journey_id"],
  ["expense_audit_events", "journey_id"],
  ["expense_correction_requests", "journey_id"],
  ["households", "journey_id"],
  ["household_members", "journey_id"],
  ["settlements", "journey_id"],
  ["settlement_inputs", "journey_id"],
  ["settlement_member_balances", "journey_id"],
  ["settlement_transfers", "journey_id"],
  ["settlement_payments", "journey_id"],
  ["ledger_review_findings", "journey_id"],
  ["ledger_review_finding_actions", "journey_id"],
  ["ledger_idempotency_keys", "journey_id"],
  ["ledger_changes", "journey_id"],
] as const;

async function targetSnapshot(client: SupabaseClient, journeyId: string) {
  const snapshot: Record<string, unknown[]> = {};
  for (const [table, column] of snapshotTables)
    snapshot[table] = await rows(client, table, column, journeyId);
  return { snapshot, digest: stage9Sha256(snapshot) };
}

function verifyPayload(dataset: Stage9Dataset, manifest: Stage9PrivateApprovalManifest) {
  assert(stage9Sha256(dataset) === expectedDatasetSha256, "DATASET_DIGEST_REJECTED");
  assert(
    manifest.transformedDatasetSha256 === expectedDatasetSha256,
    "MANIFEST_DIGEST_REJECTED",
  );
  assert(manifest.state === "PRELOAD_VALIDATED", "MANIFEST_STATE_REJECTED");
  assert(
    manifest.target.projectRef === STAGE9_TARGET_PROJECT_REF,
    "MANIFEST_TARGET_REJECTED",
  );
  assert(manifest.target.journeyId === dataset.journey.id, "MANIFEST_JOURNEY_REJECTED");
  assert(
    manifest.versions.transform === STAGE9_TRANSFORM_VERSION,
    "TRANSFORM_VERSION_REJECTED",
  );
  assert(
    manifest.versions.mapping === STAGE9_MAPPING_VERSION,
    "MAPPING_VERSION_REJECTED",
  );
  assert(
    manifest.versions.allocation === STAGE9_ALLOCATION_VERSION,
    "ALLOCATION_VERSION_REJECTED",
  );
  assert(
    manifest.versions.normalization === STAGE9_NORMALIZATION_VERSION,
    "NORMALIZATION_VERSION_REJECTED",
  );
  assert(manifest.classificationCounts.accepted === 126, "ACCEPTED_COUNT_REJECTED");
  assert(
    manifest.classificationCounts.settlementIncluded === 68 &&
      manifest.classificationCounts.settlementExcluded === 58,
    "PARTICIPATION_COUNTS_REJECTED",
  );
  assert(
    manifest.classificationCounts.needsReviewLoaded === 0 &&
      manifest.classificationCounts.needsReviewUnloaded === 1 &&
      manifest.classificationCounts.excluded === 0,
    "REVIEW_COUNTS_REJECTED",
  );
  assert(manifest.legacyEqualRoundingNormalizedCount === 69, "NORMALIZED_COUNT_REJECTED");
  assert(scanStage9Privacy(dataset).passed, "DATASET_PRIVACY_REJECTED");
  for (const [key, count] of Object.entries(expectedCounts))
    assert(
      dataset[key as keyof typeof expectedCounts].length === count,
      `COUNT_REJECTED:${key}`,
    );
  assert(
    dataset.expenses.every((expense) => expense.businessStatus === "ACCEPTED"),
    "DRAFT_REJECTED",
  );
  assert(
    dataset.expenses.filter((expense) => expense.settlementParticipation === "INCLUDED")
      .length === 68 &&
      dataset.expenses.filter((expense) => expense.settlementParticipation === "EXCLUDED")
        .length === 58,
    "DATASET_PARTICIPATION_REJECTED",
  );
  assert(
    dataset.expenses.filter(
      (expense) => expense.importProvenance.legacyEqualRoundingNormalization,
    ).length === 69,
    "DATASET_NORMALIZATION_REJECTED",
  );

  const valuations = new Map(
    dataset.valuations.map((valuation) => [valuation.expenseId, valuation]),
  );
  const originalSums = new Map<string, bigint>();
  const settlementSums = new Map<string, bigint>();
  for (const split of dataset.splits) {
    originalSums.set(
      split.expenseId,
      (originalSums.get(split.expenseId) ?? 0n) + BigInt(split.originalAmountMinor),
    );
    settlementSums.set(
      split.expenseId,
      (settlementSums.get(split.expenseId) ?? 0n) + BigInt(split.settlementAmountMinor),
    );
  }
  const net = new Map<string, bigint>();
  for (const expense of dataset.expenses) {
    const valuation = valuations.get(expense.id);
    assert(valuation, "VALUATION_MISSING");
    assert(
      originalSums.get(expense.id) === BigInt(expense.originalAmountMinor),
      "ORIGINAL_SPLIT_MISMATCH",
    );
    assert(
      settlementSums.get(expense.id) === BigInt(valuation.settlementAmountMinor),
      "SETTLEMENT_SPLIT_MISMATCH",
    );
    if (expense.settlementParticipation === "EXCLUDED") continue;
    net.set(
      expense.payerMemberId,
      (net.get(expense.payerMemberId) ?? 0n) + BigInt(valuation.settlementAmountMinor),
    );
    for (const split of dataset.splits.filter((item) => item.expenseId === expense.id))
      net.set(
        split.memberId,
        (net.get(split.memberId) ?? 0n) - BigInt(split.settlementAmountMinor),
      );
  }
  assert(
    [...net.values()].reduce((sum, value) => sum + value, 0n) === 0n,
    "NET_NOT_ZERO",
  );
}

async function verifyHostedRows(client: SupabaseClient, dataset: Stage9Dataset) {
  const journeyId = dataset.journey.id;
  const [trips, members, settings, expenses, participants, splits, rates, valuations] =
    await Promise.all([
      rows(client, "trips", "id", journeyId, "id,name,start_date,end_date,created_by"),
      rows(
        client,
        "journey_members",
        "trip_id",
        journeyId,
        "id,user_id,display_name,role,status",
      ),
      rows(
        client,
        "ledger_settings",
        "journey_id",
        journeyId,
        "journey_id,settlement_currency,settlement_scale,valuation_policy,revision,updated_by",
      ),
      rows(
        client,
        "expenses",
        "journey_id",
        journeyId,
        "id,payer_member_id,title,category,occurred_at,original_amount_minor,original_currency,original_currency_scale,business_status,settlement_participation,import_provenance,revision",
      ),
      rows(
        client,
        "expense_participants",
        "journey_id",
        journeyId,
        "expense_id,member_id,display_name_snapshot,display_order",
      ),
      rows(
        client,
        "expense_splits",
        "journey_id",
        journeyId,
        "expense_id,member_id,split_method,original_amount_minor,settlement_amount_minor,rounding_adjustment_minor",
      ),
      rows(
        client,
        "exchange_rate_snapshots",
        "journey_id",
        journeyId,
        "id,expense_id,expense_revision,base_currency,quote_currency,decimal_rate,effective_date,source,provenance,staleness_state",
      ),
      rows(
        client,
        "settlement_valuation_snapshots",
        "journey_id",
        journeyId,
        "id,expense_id,expense_revision,policy,original_amount_minor,original_currency,original_scale,settlement_amount_minor,settlement_currency,settlement_scale,rate_snapshot_id,decimal_rate,rounding_mode,effective_at,is_active",
      ),
    ]);

  assertRows(
    trips,
    [
      {
        id: dataset.journey.id,
        name: dataset.journey.name,
        start_date: dataset.journey.startDate,
        end_date: dataset.journey.endDate,
        created_by: dataset.journey.createdByUserId,
      },
    ],
    "JOURNEY_MISMATCH",
  );
  assertRows(
    members,
    dataset.members.map((member) => ({
      id: member.id,
      user_id: member.userId,
      display_name: member.displayName,
      role: member.role,
      status: member.status,
    })),
    "MEMBER_MISMATCH",
  );
  assertRows(
    settings,
    [
      {
        journey_id: journeyId,
        settlement_currency: dataset.settings.settlementCurrency,
        settlement_scale: dataset.settings.settlementScale,
        valuation_policy: dataset.settings.valuationPolicy,
        revision: 1,
        updated_by: dataset.journey.createdByUserId,
      },
    ],
    "SETTINGS_MISMATCH",
  );
  assertRows(
    expenses.map((expense) => ({
      ...expense,
      occurred_at: new Date(String(expense.occurred_at)).toISOString(),
    })),
    dataset.expenses.map((expense) => ({
      id: expense.id,
      payer_member_id: expense.payerMemberId,
      title: expense.title,
      category: expense.category,
      occurred_at: expense.occurredAt,
      original_amount_minor: expense.originalAmountMinor,
      original_currency: expense.originalCurrency,
      original_currency_scale: expense.originalScale,
      business_status: expense.businessStatus,
      settlement_participation: expense.settlementParticipation,
      import_provenance: expense.importProvenance,
      revision: 1,
    })),
    "EXPENSE_MISMATCH",
  );
  assertRows(
    participants,
    dataset.participants.map((participant) => ({
      expense_id: participant.expenseId,
      member_id: participant.memberId,
      display_name_snapshot: participant.displayNameSnapshot,
      display_order: participant.displayOrder,
    })),
    "PARTICIPANT_MISMATCH",
  );
  assertRows(
    splits,
    dataset.splits.map((split) => ({
      expense_id: split.expenseId,
      member_id: split.memberId,
      split_method: split.method,
      original_amount_minor: split.originalAmountMinor,
      settlement_amount_minor: split.settlementAmountMinor,
      rounding_adjustment_minor: split.roundingAdjustmentMinor,
    })),
    "SPLIT_MISMATCH",
  );
  assertRows(
    rates.map((rate) => ({ ...rate, decimal_rate: Number(rate.decimal_rate) })),
    dataset.rateSnapshots.map((rate) => ({
      id: rate.id,
      expense_id: rate.expenseId,
      expense_revision: 1,
      base_currency: rate.baseCurrency,
      quote_currency: rate.quoteCurrency,
      decimal_rate: Number(rate.decimalRate),
      effective_date: rate.effectiveDate,
      source: "LEGACY_IMPORTED",
      provenance: { sourceRefHmac: rate.sourceRefHmac },
      staleness_state: "STALE_ACCEPTED",
    })),
    "RATE_MISMATCH",
  );
  assertRows(
    valuations.map((valuation) => ({
      ...valuation,
      effective_at: new Date(String(valuation.effective_at)).toISOString(),
    })),
    dataset.valuations.map((valuation) => ({
      id: valuation.id,
      expense_id: valuation.expenseId,
      expense_revision: 1,
      policy: "LEGACY_IMPORTED",
      original_amount_minor: valuation.originalAmountMinor,
      original_currency: valuation.originalCurrency,
      original_scale: valuation.originalScale,
      settlement_amount_minor: valuation.settlementAmountMinor,
      settlement_currency: valuation.settlementCurrency,
      settlement_scale: valuation.settlementScale,
      rate_snapshot_id: valuation.rateSnapshotId,
      decimal_rate: null,
      rounding_mode: "HALF_UP",
      effective_at: valuation.effectiveAt,
      is_active: true,
    })),
    "VALUATION_MISMATCH",
  );

  const zeroTables = [
    "payment_records",
    "receipt_assets",
    "households",
    "household_members",
    "settlements",
    "settlement_inputs",
    "settlement_member_balances",
    "settlement_transfers",
    "settlement_payments",
    "expense_links",
    "expense_audit_events",
    "expense_correction_requests",
    "ledger_review_findings",
    "ledger_review_finding_actions",
  ] as const;
  for (const table of zeroTables)
    assert(
      (await rows(client, table, "journey_id", journeyId)).length === 0,
      `UNEXPECTED:${table}`,
    );

  const receipts = await rows(
    client,
    "ledger_idempotency_keys",
    "journey_id",
    journeyId,
    "actor_user_id,command_type,idempotency_key,payload_hash,response_status,response_body",
  );
  assert(receipts.length === 1, "IMPORT_RECEIPT_COUNT_REJECTED");
  assert(
    receipts[0].actor_user_id === dataset.journey.createdByUserId &&
      receipts[0].command_type === "STAGE9_IMPORT_V1" &&
      receipts[0].payload_hash === expectedDatasetSha256 &&
      receipts[0].response_status === 201,
    "IMPORT_RECEIPT_REJECTED",
  );
  const changes = await rows(client, "ledger_changes", "journey_id", journeyId);
  assert(
    changes.length === 126 &&
      changes.every(
        (change) =>
          change.entity_type === "EXPENSE" &&
          dataset.expenses.some((expense) => expense.id === change.entity_id),
      ),
    "CHANGE_FEED_REJECTED",
  );

  return {
    journey: trips.length,
    members: members.length,
    expenses: expenses.length,
    included: expenses.filter(
      (expense) => expense.settlement_participation === "INCLUDED",
    ).length,
    excluded: expenses.filter(
      (expense) => expense.settlement_participation === "EXCLUDED",
    ).length,
    participants: participants.length,
    splits: splits.length,
    rateSnapshots: rates.length,
    valuations: valuations.length,
    reviewFindings: 0,
    normalized: expenses.filter(
      (expense) =>
        (expense.import_provenance as Row).legacyEqualRoundingNormalization !== null,
    ).length,
    changes: changes.length,
    importReceipts: receipts.length,
  };
}

export async function loadHostedDev() {
  const v3Root = resolve(required(process.env.OTR_STAGE9_V3_ROOT, "OTR_STAGE9_V3_ROOT"));
  const datasetPath = join(v3Root, "transformed", "stage9-dataset.json");
  const manifestPath = join(v3Root, "reports-private", "approval-manifest.json");
  const restorePath = join(
    v3Root,
    "restore",
    "preload-2026-09-14",
    "restore-verification.json",
  );
  const rawPath = join(dirname(v3Root), "raw", "legacy-extract.json");
  const receiptPath = join(v3Root, "reports-private", "hosted-dev-load-receipt.json");
  const url = required(process.env.OTR_DEV_SUPABASE_URL, "OTR_DEV_SUPABASE_URL");
  const secretKey = required(
    process.env.OTR_DEV_SUPABASE_SECRET_KEY,
    "OTR_DEV_SUPABASE_SECRET_KEY",
  );
  assert(
    new URL(url).origin === `https://${STAGE9_TARGET_PROJECT_REF}.supabase.co`,
    "TARGET_REJECTED",
  );
  assert(
    (statSync(dirname(receiptPath)).mode & 0o077) === 0,
    "PRIVATE_ROOT_PERMISSION_REJECTED",
  );

  const restore = JSON.parse(readFileSync(restorePath, "utf8")) as Row;
  assert(restore.recoveryProofSufficientForStage9 === true, "RECOVERY_PROOF_REJECTED");
  const dataset = stage9DatasetSchema.parse(
    JSON.parse(readFileSync(datasetPath, "utf8")),
  );
  const manifest = JSON.parse(
    readFileSync(manifestPath, "utf8"),
  ) as Stage9PrivateApprovalManifest;
  verifyPayload(dataset, manifest);
  assert(
    sha256(readCommittedStage9Raw(rawPath)) === expectedRawSha256,
    "RAW_DIGEST_REJECTED",
  );

  const config = JSON.parse(
    readFileSync("/Users/xoery/Private/otr-stage9/stage9-private-config.json", "utf8"),
  ) as Row;
  assert(
    config.devOperatorUserId === dataset.journey.createdByUserId,
    "ACTOR_MAPPING_REJECTED",
  );
  assert(
    dataset.members.filter((member) => member.userId === dataset.journey.createdByUserId)
      .length === 1,
    "OWNER_MAPPING_REJECTED",
  );

  const health = await fetch("http://127.0.0.1:8787/health", { redirect: "error" });
  assert(
    health.ok && ((await health.json()) as Row).status === "ok",
    "BACKEND_HEALTH_REJECTED",
  );
  const client = createClient(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  if (process.env.OTR_STAGE9_VERIFY_ONLY === "1") {
    const counts = await verifyHostedRows(client, dataset);
    console.info(JSON.stringify({ verificationPassed: true, counts }));
    return;
  }
  const actor = await client
    .from("profiles")
    .select("id", { count: "exact" })
    .eq("id", dataset.journey.createdByUserId);
  assert(!actor.error && actor.count === 1, "ACTOR_PROFILE_REJECTED");
  const postCommitReplay = process.env.OTR_STAGE9_POST_COMMIT_REPLAY === "1";
  if (!postCommitReplay) {
    assert(
      (await rows(client, "trips", "id", dataset.journey.id)).length === 0,
      "TARGET_NOT_EMPTY",
    );
    assert(
      (await rows(client, "ledger_idempotency_keys", "journey_id", dataset.journey.id))
        .length === 0,
      "IMPORT_IDENTITY_NOT_EMPTY",
    );
    if (process.env.OTR_STAGE9_PREFLIGHT_ONLY === "1") {
      console.info(JSON.stringify({ preflightPassed: true, mutationPerformed: false }));
      return;
    }

    const first = await loadStage9Dataset({
      target: "hosted-dev",
      url,
      secretKey,
      actorUserId: dataset.journey.createdByUserId,
      dataset,
      manifest,
    });
    assert(first.idempotentReplay === false, "FIRST_LOAD_NOT_NEW");
    assert(
      canonicalStage9Json(first.counts) === canonicalStage9Json(expectedCounts),
      "FIRST_LOAD_COUNTS_REJECTED",
    );
  }

  const counts = await verifyHostedRows(client, dataset);
  assert(counts.normalized === 69, "HOSTED_NORMALIZATION_REJECTED");
  const beforeReplay = await targetSnapshot(client, dataset.journey.id);

  const second = await loadStage9Dataset({
    target: "hosted-dev",
    url,
    secretKey,
    actorUserId: dataset.journey.createdByUserId,
    dataset,
    manifest,
  });
  assert(second.idempotentReplay === true, "SECOND_LOAD_NOT_IDEMPOTENT");
  assert(
    canonicalStage9Json(second.counts) === canonicalStage9Json(expectedCounts),
    "SECOND_LOAD_COUNTS_REJECTED",
  );
  const afterReplay = await targetSnapshot(client, dataset.journey.id);
  assert(beforeReplay.digest === afterReplay.digest, "IDEMPOTENT_REPLAY_CHANGED_ROWS");
  const repeatedCounts = await verifyHostedRows(client, dataset);
  assert(
    canonicalStage9Json(counts) === canonicalStage9Json(repeatedCounts),
    "REPLAY_COUNT_DRIFT",
  );

  const report = {
    version: "stage9-hosted-dev-load-receipt-v1",
    targetProjectRef: STAGE9_TARGET_PROJECT_REF,
    datasetSha256: expectedDatasetSha256,
    rawSha256: expectedRawSha256,
    recoveryProofSha256: sha256(readFileSync(restorePath)),
    counts,
    acceptedSplitReconciliationPassed: true,
    includedSettlementNetZero: true,
    excludedSettlementObligationRows: 0,
    deterministicIdsAndMappingsPassed: true,
    duplicateDetectionPassed: true,
    privacyPassed: true,
    firstLoadTransactionCommitted: true,
    idempotentReplay: {
      zeroNewRows: true,
      zeroUpdates: true,
      zeroRevisionChanges: true,
      zeroExtraChangeFeedEffects: true,
      identicalFinancialFingerprint: true,
      targetSnapshotSha256: afterReplay.digest,
    },
  };
  writeFileSync(receiptPath, `${JSON.stringify(report, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
    flag: "wx",
  });
  chmodSync(receiptPath, 0o600);
  console.info(
    JSON.stringify({
      target: "Hosted Dev",
      datasetSha256: expectedDatasetSha256,
      counts,
      acceptedSplitReconciliationPassed: true,
      includedSettlementNetZero: true,
      privacyPassed: true,
      idempotentReplay: report.idempotentReplay,
      privateReceiptWritten: true,
    }),
  );
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename))
  void loadHostedDev().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "STAGE9_HOSTED_LOAD_FAILED");
    process.exitCode = 1;
  });
