import { createHash } from "node:crypto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { createSupabaseDevGateway } from "../../backend/src/supabaseGateway";
import { canonicalStage9Json, stage9Sha256 } from "../../backend/src/stage9Import";
import {
  buildUiPolishDataset,
  UI_POLISH_JOURNEY_NAME,
  UI_POLISH_SOURCE_JOURNEY_ID,
  UI_POLISH_TARGET_PROJECT_REF,
  uiPolishFixtureStats,
  type UiPolishDataset,
  type UiPolishSource,
} from "../../backend/src/uiPolishFixture";

type Row = Record<string, unknown>;

function required(value: string | undefined, name: string) {
  if (!value) throw new Error(`${name}_MISSING`);
  return value;
}

function assert(condition: unknown, code: string): asserts condition {
  if (!condition) throw new Error(code);
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
  if (result.error) throw new Error(`READ_FAILED:${table}:${result.error.message}`);
  assert(result.count === result.data.length, `READ_COUNT_MISMATCH:${table}`);
  return result.data as unknown as Row[];
}

async function sourceData(client: SupabaseClient): Promise<UiPolishSource> {
  const [journey, settings, members, expenses, participants, splits, rates, valuations] =
    await Promise.all([
      rows(
        client,
        "trips",
        "id",
        UI_POLISH_SOURCE_JOURNEY_ID,
        "id,name,start_date,end_date,created_by",
      ),
      rows(
        client,
        "ledger_settings",
        "journey_id",
        UI_POLISH_SOURCE_JOURNEY_ID,
        "journey_id,settlement_currency,settlement_scale,valuation_policy",
      ),
      rows(
        client,
        "journey_members",
        "trip_id",
        UI_POLISH_SOURCE_JOURNEY_ID,
        "id,user_id,display_name,role,status",
      ),
      rows(
        client,
        "expenses",
        "journey_id",
        UI_POLISH_SOURCE_JOURNEY_ID,
        "id,payer_member_id,category,occurred_at,original_amount_minor,original_currency,original_currency_scale,business_status,settlement_participation",
      ),
      rows(
        client,
        "expense_participants",
        "journey_id",
        UI_POLISH_SOURCE_JOURNEY_ID,
        "expense_id,member_id,display_order",
      ),
      rows(
        client,
        "expense_splits",
        "journey_id",
        UI_POLISH_SOURCE_JOURNEY_ID,
        "expense_id,member_id,split_method,original_amount_minor,settlement_amount_minor,weight_units,percentage_units,rounding_adjustment_minor",
      ),
      rows(
        client,
        "exchange_rate_snapshots",
        "journey_id",
        UI_POLISH_SOURCE_JOURNEY_ID,
        "id,expense_id,base_currency,quote_currency,decimal_rate,effective_date",
      ),
      rows(
        client,
        "settlement_valuation_snapshots",
        "journey_id",
        UI_POLISH_SOURCE_JOURNEY_ID,
        "id,expense_id,policy,original_amount_minor,original_currency,original_scale,settlement_amount_minor,settlement_currency,settlement_scale,rate_snapshot_id,effective_at",
      ),
    ]);
  assert(journey.length === 1 && settings.length === 1, "SOURCE_ROOT_REJECTED");
  return {
    journey: journey[0],
    settings: settings[0],
    members,
    expenses,
    participants,
    splits,
    rateSnapshots: rates,
    valuations,
  };
}

const protectedTables = [
  ["trips", "id"],
  ["journey_members", "trip_id"],
  ["ledger_settings", "journey_id"],
  ["expenses", "journey_id"],
  ["expense_participants", "journey_id"],
  ["expense_splits", "journey_id"],
  ["exchange_rate_snapshots", "journey_id"],
  ["payment_records", "journey_id"],
  ["settlement_valuation_snapshots", "journey_id"],
  ["receipt_assets", "journey_id"],
  ["expense_links", "journey_id"],
  ["expense_audit_events", "journey_id"],
  ["expense_correction_requests", "journey_id"],
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

async function protectedSnapshot(client: SupabaseClient, excludedJourneyId: string) {
  const snapshot: Record<string, Row[]> = {};
  for (const [table, column] of protectedTables) {
    const result = await client
      .from(table)
      .select("*", { count: "exact" })
      .neq(column, excludedJourneyId)
      .range(0, 999);
    if (result.error) throw new Error(`SNAPSHOT_FAILED:${table}`);
    assert(result.count === result.data.length, `SNAPSHOT_PAGE_LIMIT:${table}`);
    snapshot[table] = result.data as Row[];
  }
  return stage9Sha256(snapshot);
}

async function targetSnapshot(client: SupabaseClient, journeyId: string) {
  const snapshot: Record<string, Row[]> = {};
  for (const [table, column] of protectedTables)
    snapshot[table] = await rows(client, table, column, journeyId);
  return { rows: snapshot, digest: stage9Sha256(snapshot) };
}

function expectedRows(dataset: UiPolishDataset) {
  return {
    members: dataset.members.length,
    expenses: dataset.expenses.length,
    participants: dataset.participants.length,
    splits: dataset.splits.length,
    rateSnapshots: dataset.rateSnapshots.length,
    valuations: dataset.valuations.length,
  };
}

async function verifyTarget(client: SupabaseClient, dataset: UiPolishDataset) {
  const journeyId = dataset.journey.id;
  const [trips, members, expenses, participants, splits, rates, valuations, receipts] =
    await Promise.all([
      rows(client, "trips", "id", journeyId, "id,name,created_by"),
      rows(client, "journey_members", "trip_id", journeyId),
      rows(client, "expenses", "journey_id", journeyId),
      rows(client, "expense_participants", "journey_id", journeyId),
      rows(client, "expense_splits", "journey_id", journeyId),
      rows(client, "exchange_rate_snapshots", "journey_id", journeyId),
      rows(client, "settlement_valuation_snapshots", "journey_id", journeyId),
      rows(client, "receipt_assets", "journey_id", journeyId),
    ]);
  const expected = expectedRows(dataset);
  const activeValuations = valuations.filter((valuation) => valuation.is_active);
  assert(
    trips.length === 1 && trips[0].name === UI_POLISH_JOURNEY_NAME,
    "TARGET_TRIP_REJECTED",
  );
  assert(members.length === expected.members, "TARGET_MEMBERS_REJECTED");
  assert(expenses.length === expected.expenses, "TARGET_EXPENSES_REJECTED");
  assert(participants.length === expected.participants, "TARGET_PARTICIPANTS_REJECTED");
  assert(splits.length === expected.splits, "TARGET_SPLITS_REJECTED");
  assert(rates.length === expected.rateSnapshots, "TARGET_RATES_REJECTED");
  assert(activeValuations.length === expected.valuations, "TARGET_VALUATIONS_REJECTED");
  assert(receipts.length <= 1, "UNEXPECTED_RECEIPT_FIXTURE");
  assert(
    expenses.every(
      (expense) =>
        !String(expense.title).startsWith("Imported ") &&
        String(expense.title).length > 0,
    ),
    "TARGET_TEXT_REJECTED",
  );
  const hostedById = new Map(expenses.map((expense) => [String(expense.id), expense]));
  for (const expectedExpense of dataset.expenses) {
    const hosted = hostedById.get(expectedExpense.id);
    assert(hosted, "TARGET_EXPENSE_MISSING");
    assert(
      hosted.title === expectedExpense.title &&
        (hosted.description ?? null) === expectedExpense.description &&
        hosted.category === expectedExpense.category &&
        hosted.business_status === expectedExpense.businessStatus &&
        hosted.settlement_participation === expectedExpense.settlementParticipation,
      "TARGET_EXPENSE_MISMATCH",
    );
  }
  const acceptedIds = new Set(
    expenses
      .filter((expense) => expense.business_status === "ACCEPTED")
      .map((expense) => String(expense.id)),
  );
  assert(
    activeValuations.length === acceptedIds.size,
    "TARGET_ACCEPTED_VALUATION_REJECTED",
  );
  for (const expenseId of acceptedIds) {
    const expense = expenses.find((row) => row.id === expenseId)!;
    const valuation = activeValuations.find((row) => row.expense_id === expenseId)!;
    const expenseSplits = splits.filter((row) => row.expense_id === expenseId);
    assert(
      expenseSplits.reduce((sum, row) => sum + Number(row.original_amount_minor), 0) ===
        Number(expense.original_amount_minor),
      "HOSTED_ORIGINAL_SPLIT_MISMATCH",
    );
    assert(
      expenseSplits.reduce((sum, row) => sum + Number(row.settlement_amount_minor), 0) ===
        Number(valuation.settlement_amount_minor),
      "HOSTED_SETTLEMENT_SPLIT_MISMATCH",
    );
  }
  return expected;
}

export async function createUiPolishJourney() {
  const url = required(process.env.OTR_DEV_SUPABASE_URL, "OTR_DEV_SUPABASE_URL");
  const publishableKey = required(
    process.env.OTR_DEV_SUPABASE_PUBLISHABLE_KEY,
    "OTR_DEV_SUPABASE_PUBLISHABLE_KEY",
  );
  const secretKey = required(
    process.env.OTR_DEV_SUPABASE_SECRET_KEY,
    "OTR_DEV_SUPABASE_SECRET_KEY",
  );
  assert(
    new URL(url).origin === `https://${UI_POLISH_TARGET_PROJECT_REF}.supabase.co`,
    "DEV_TARGET_REJECTED",
  );
  const client = createClient(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const source = await sourceData(client);
  const dataset = buildUiPolishDataset(source);
  const sourceBefore = (await targetSnapshot(client, UI_POLISH_SOURCE_JOURNEY_ID)).digest;
  const othersBefore = await protectedSnapshot(client, dataset.journey.id);
  const existing = await client
    .from("trips")
    .select("id", { count: "exact" })
    .eq("name", UI_POLISH_JOURNEY_NAME);
  if (existing.error) throw new Error("TARGET_LOOKUP_FAILED");
  assert((existing.count ?? 0) <= 1, "MULTIPLE_UI_POLISH_JOURNEYS");

  const apply = process.env.OTR_UI_POLISH_APPLY === "1";
  let loadResult: unknown = { verificationOnly: !apply };
  if (apply) {
    if (existing.count === 0) {
      const result = await client.rpc("ledger_create_ui_polish_fixture_v1", {
        p_actor_user_id: dataset.journey.createdByUserId,
        p_payload_hash: stage9Sha256(dataset),
        p_dataset: dataset,
      });
      if (result.error) throw new Error(`FIXTURE_LOAD_FAILED:${result.error.message}`);
      loadResult = result.data;
    } else {
      loadResult = { existingTargetVerified: true };
    }
  } else if (existing.count === 0) {
    console.info(
      JSON.stringify({
        preflightPassed: true,
        mutationPerformed: false,
        journeyId: dataset.journey.id,
        stats: uiPolishFixtureStats(dataset),
      }),
    );
    return;
  }

  const gateway = createSupabaseDevGateway({ url, publishableKey, secretKey });
  const actor = dataset.journey.createdByUserId!;
  let bootstrap = await gateway.bootstrapLedger(actor, dataset.journey.id);
  if (process.env.OTR_UI_POLISH_REPAIR_RATE === "1") {
    const rateRequired = bootstrap.expenses.find(
      (expense) => expense.title === "Faroe weather detour — rate needed",
    );
    assert(rateRequired, "RATE_REQUIRED_FIXTURE_MISSING");
    assert(rateRequired.businessStatus === "RATE_REQUIRED", "RATE_REQUIRED_STATE_DRIFT");
    if (rateRequired.settlementParticipation !== "EXCLUDED") {
      await gateway.updateLedgerExpense(
        actor,
        dataset.journey.id,
        rateRequired.id,
        "UI_POLISH_RATE_REQUIRED_EXCLUDED_V1",
        {
          title: rateRequired.title,
          description: rateRequired.description,
          category: rateRequired.category,
          occurredAt: rateRequired.occurredAt,
          payerMemberId: rateRequired.payerMemberId,
          original: rateRequired.original,
          businessStatus: rateRequired.businessStatus,
          settlementParticipation: "EXCLUDED",
          participants: rateRequired.participants,
          splits: rateRequired.splits,
          valuation: null,
          baseRevision: rateRequired.revision,
          auditReason:
            "Keep the Dev-only RATE_REQUIRED visual fixture out of settlement.",
        },
      );
      bootstrap = await gateway.bootstrapLedger(actor, dataset.journey.id);
    }
  }
  let receiptLinked = false;
  if (process.env.OTR_UI_POLISH_ADD_RECEIPT === "1") {
    const receiptExpense = bootstrap.expenses.find(
      (expense) => expense.title === "Bakery receipt ready 📎",
    );
    assert(receiptExpense, "RECEIPT_FIXTURE_EXPENSE_MISSING");
    const receiptId = "e1932ee5-60e4-588f-b869-bb8b15e514cb";
    const bytes = Uint8Array.from(
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
        "base64",
      ),
    );
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const created = await gateway.createReceipt(actor, dataset.journey.id, receiptId, {
      localId: "ui-polish-receipt-v1",
      mimeType: "image/png",
      sizeBytes: bytes.byteLength,
      sha256,
    });
    await gateway.uploadReceiptContent(
      actor,
      dataset.journey.id,
      receiptId,
      bytes,
      "image/png",
    );
    await gateway.completeReceipt(
      actor,
      dataset.journey.id,
      receiptId,
      "UI_POLISH_COMPLETE_RECEIPT_V1",
      {
        objectPath: created.entity.objectPath,
        sizeBytes: bytes.byteLength,
        sha256,
      },
    );
    await gateway.linkReceipt(
      actor,
      dataset.journey.id,
      receiptId,
      "UI_POLISH_LINK_RECEIPT_V1",
      receiptExpense.id,
    );
    receiptLinked = true;
  }
  const counts = await verifyTarget(client, dataset);
  const sourceAfter = (await targetSnapshot(client, UI_POLISH_SOURCE_JOURNEY_ID)).digest;
  const othersAfter = await protectedSnapshot(client, dataset.journey.id);
  assert(sourceBefore === sourceAfter, "EUROPE_REPLAY_CHANGED");
  assert(othersBefore === othersAfter, "EXISTING_JOURNEYS_CHANGED");
  const reporting = await gateway.readLedgerAnalysis(
    actor,
    dataset.journey.id,
    {},
    "GROUP",
    "CATEGORY",
  );
  const settlement = await gateway.previewLedgerSettlement(
    actor,
    dataset.journey.id,
    "2026-07-26T00:00:00.000Z",
  );
  assert(
    bootstrap.expenses.length === dataset.expenses.length,
    "BACKEND_BOOTSTRAP_REJECTED",
  );
  assert(reporting.summary.totalMinor > 0, "BACKEND_REPORTING_REJECTED");
  assert(settlement.state !== "PREVIEW_BLOCKED", "BACKEND_SETTLEMENT_REJECTED");

  const nameCheck = await client
    .from("trips")
    .select("id", { count: "exact" })
    .eq("name", UI_POLISH_JOURNEY_NAME);
  assert(!nameCheck.error && nameCheck.count === 1, "TARGET_UNIQUENESS_REJECTED");
  console.info(
    canonicalStage9Json({
      target: "Hosted Dev",
      journeyId: dataset.journey.id,
      loadResult,
      counts,
      stats: uiPolishFixtureStats(dataset),
      backendPath: {
        bootstrapExpenses: bootstrap.expenses.length,
        analysisTotalPositive: true,
        settlementState: settlement.state,
        receiptLinked,
      },
      europeReplayUnchanged: true,
      existingJourneysUnchanged: true,
      exactlyOneTargetJourney: true,
      targetSnapshotSha256: (await targetSnapshot(client, dataset.journey.id)).digest,
      sourceSnapshotSha256: sourceAfter,
    }),
  );
}

void createUiPolishJourney().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "UI_POLISH_FIXTURE_FAILED");
  process.exitCode = 1;
});
