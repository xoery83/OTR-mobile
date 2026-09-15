import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { createSupabaseDevGateway } from "../../backend/src/supabaseGateway";
import { canonicalStage9Json, stage9Sha256 } from "../../backend/src/stage9Import";
import { targetSnapshot } from "../stage9/load-hosted-dev";

export const HOSTED_DEV_PROJECT_REF = "tuqigdxrvrerfewsxqgm";
export const UI_POLISH_JOURNEY_ID = "41076e49-0005-599f-af68-5062fd5695f8";
export const ACTIVE_REPLAY_JOURNEY_ID = "ec3ae448-3fa5-84a9-a986-655a243cf3ad";
export const RETIRED_REPLAY_JOURNEY_ID = "ae2fb30d-6e31-8ff9-8b14-f8a1b275cf65";
export const APPROVED_REPLAY_FINGERPRINT =
  "97fa314b965dd6af0f1337147301bdfb345e8a0060e1de0c56c6b421dcd83ce2";
export const FIXED_CUTOFF = "2026-09-01T00:00:00.000Z";
const APPLY_TOKEN = "CONFIRM_UI_POLISH_SETTLEMENT_V1";
const FINALIZE_KEY = "EUROPE_2026_UI_POLISH_SETTLEMENT_V1";

type Row = Record<string, unknown>;

function required(value: string | undefined, name: string) {
  if (!value) throw new Error(`${name}_MISSING`);
  return value;
}

function assert(condition: unknown, code: string): asserts condition {
  if (!condition) throw new Error(code);
}

export function assertHostedDevUrl(url: string) {
  assert(
    new URL(url).origin === `https://${HOSTED_DEV_PROJECT_REF}.supabase.co`,
    "TARGET_REJECTED_BEFORE_CLIENT",
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
  if (result.error) throw new Error(`READ_FAILED:${table}:${result.error.message}`);
  assert(result.data.length === result.count, `READ_COUNT_MISMATCH:${table}`);
  return result.data as unknown as Row[];
}

async function verifyReplay(client: SupabaseClient) {
  const replay = await targetSnapshot(client, ACTIVE_REPLAY_JOURNEY_ID);
  assert(replay.digest === APPROVED_REPLAY_FINGERPRINT, "REPLAY_FINGERPRINT_DRIFT");
  const data = replay.snapshot;
  const expenses = data.expenses as Row[];
  const valuations = data.settlement_valuation_snapshots as Row[];
  const count = (table: string) => data[table]?.length ?? 0;
  assert(count("trips") === 1, "REPLAY_JOURNEY_COUNT_DRIFT");
  assert(count("journey_members") === 8, "REPLAY_MEMBER_COUNT_DRIFT");
  assert(expenses.length === 126, "REPLAY_EXPENSE_COUNT_DRIFT");
  assert(
    expenses.filter((row) => row.business_status === "ACCEPTED").length === 126,
    "REPLAY_ACCEPTED_COUNT_DRIFT",
  );
  assert(
    expenses.filter((row) => row.settlement_participation === "INCLUDED").length === 68,
    "REPLAY_INCLUDED_COUNT_DRIFT",
  );
  assert(
    expenses.filter((row) => row.settlement_participation === "EXCLUDED").length === 58,
    "REPLAY_EXCLUDED_COUNT_DRIFT",
  );
  assert(count("expense_participants") === 531, "REPLAY_PARTICIPANT_COUNT_DRIFT");
  assert(count("expense_splits") === 531, "REPLAY_SPLIT_COUNT_DRIFT");
  assert(count("exchange_rate_snapshots") === 126, "REPLAY_RATE_COUNT_DRIFT");
  assert(
    valuations.filter((row) => row.is_active).length === 126,
    "REPLAY_VALUATION_COUNT_DRIFT",
  );
  for (const table of [
    "payment_records",
    "receipt_assets",
    "expense_audit_events",
    "settlements",
    "settlement_inputs",
    "settlement_member_balances",
    "settlement_transfers",
    "settlement_payments",
    "ledger_review_findings",
    "ledger_review_finding_actions",
  ])
    assert(count(table) === 0, `REPLAY_LIFECYCLE_DRIFT:${table}`);
  const [households, householdMembers, settlementAudits, discharges, adjustments] =
    await Promise.all([
      rows(client, "households", "journey_id", ACTIVE_REPLAY_JOURNEY_ID),
      rows(client, "household_members", "journey_id", ACTIVE_REPLAY_JOURNEY_ID),
      rows(client, "settlement_audit_events", "journey_id", ACTIVE_REPLAY_JOURNEY_ID),
      rows(
        client,
        "settlement_payment_discharges",
        "journey_id",
        ACTIVE_REPLAY_JOURNEY_ID,
      ),
      rows(
        client,
        "settlement_adjustment_deltas",
        "journey_id",
        ACTIVE_REPLAY_JOURNEY_ID,
      ),
    ]);
  assert(
    [households, householdMembers, settlementAudits, discharges, adjustments].every(
      (items) => items.length === 0,
    ),
    "REPLAY_EXTENDED_LIFECYCLE_DRIFT",
  );
  return replay.digest;
}

const sourceTables = [
  ["journey_members", "trip_id"],
  ["ledger_settings", "journey_id"],
  ["expenses", "journey_id"],
  ["expense_participants", "journey_id"],
  ["expense_splits", "journey_id"],
  ["exchange_rate_snapshots", "journey_id"],
  ["payment_records", "journey_id"],
  ["settlement_valuation_snapshots", "journey_id"],
] as const;

async function sourceDigest(client: SupabaseClient) {
  const result: Record<string, string[]> = {};
  for (const [table, column] of sourceTables) {
    result[table] = (await rows(client, table, column, UI_POLISH_JOURNEY_ID))
      .map(canonicalStage9Json)
      .sort();
  }
  return stage9Sha256(result);
}

async function verifyUiPolishBaseline(client: SupabaseClient) {
  const [expenses, participants, splits, rates, valuations, settlements, payments] =
    await Promise.all([
      rows(client, "expenses", "journey_id", UI_POLISH_JOURNEY_ID),
      rows(client, "expense_participants", "journey_id", UI_POLISH_JOURNEY_ID),
      rows(client, "expense_splits", "journey_id", UI_POLISH_JOURNEY_ID),
      rows(client, "exchange_rate_snapshots", "journey_id", UI_POLISH_JOURNEY_ID),
      rows(client, "settlement_valuation_snapshots", "journey_id", UI_POLISH_JOURNEY_ID),
      rows(client, "settlements", "journey_id", UI_POLISH_JOURNEY_ID),
      rows(client, "settlement_payments", "journey_id", UI_POLISH_JOURNEY_ID),
    ]);
  assert(expenses.length === 133, "UI_POLISH_EXPENSE_COUNT_DRIFT");
  assert(participants.length === 565 && splits.length === 565, "UI_POLISH_SPLIT_DRIFT");
  assert(rates.length === 126, "UI_POLISH_RATE_COUNT_DRIFT");
  assert(
    valuations.filter((row) => row.is_active).length === 132,
    "UI_POLISH_VALUATION_COUNT_DRIFT",
  );
  assert(
    expenses.filter((row) => row.settlement_participation === "INCLUDED").length === 72,
    "UI_POLISH_INCLUDED_COUNT_DRIFT",
  );
  assert(
    expenses.filter((row) => row.settlement_participation === "EXCLUDED").length === 61,
    "UI_POLISH_EXCLUDED_COUNT_DRIFT",
  );
  assert(settlements.length <= 1, "UI_POLISH_SETTLEMENT_DRIFT");
  if (settlements.length === 0) assert(payments.length === 0, "UI_POLISH_PAYMENT_DRIFT");
  return {
    settlements,
    payments,
    latestExpenseAt: expenses
      .map((row) => String(row.occurred_at))
      .sort()
      .at(-1),
  };
}

function paymentInput(
  transfer: { amount: { minor: number; currency: string; scale: number } },
  localId: string,
  amount: number,
  authority: "PAYER" | "ORGANIZER_OVERRIDE",
) {
  return {
    localId,
    baseTransferRevision: 1,
    payment: { ...transfer.amount, minor: amount },
    assertedDischarge: { ...transfer.amount, minor: amount },
    repaymentValuation: null,
    feeTreatment: null,
    paidAt: "2026-09-15T00:00:00.000Z",
    evidenceAssetId: null,
    notes: "Deterministic Europe UI Polish settlement fixture.",
    reportingAuthority: authority,
    reason:
      authority === "ORGANIZER_OVERRIDE"
        ? "Fixture coverage for an unlinked debtor."
        : null,
  } as const;
}

async function run() {
  const url = required(process.env.OTR_DEV_SUPABASE_URL, "OTR_DEV_SUPABASE_URL");
  const publishableKey = required(
    process.env.OTR_DEV_SUPABASE_PUBLISHABLE_KEY,
    "OTR_DEV_SUPABASE_PUBLISHABLE_KEY",
  );
  const secretKey = required(
    process.env.OTR_DEV_SUPABASE_SECRET_KEY,
    "OTR_DEV_SUPABASE_SECRET_KEY",
  );
  assertHostedDevUrl(url);
  const client = createClient(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const gateway = createSupabaseDevGateway({ url, publishableKey, secretKey });

  const replayBefore = await verifyReplay(client);
  const sourceBefore = await sourceDigest(client);
  const baseline = await verifyUiPolishBaseline(client);
  const members = await rows(
    client,
    "journey_members",
    "trip_id",
    UI_POLISH_JOURNEY_ID,
    "id,user_id,role,status",
  );
  const linkedByMember = new Map(
    members
      .filter((row) => row.status === "linked" && row.user_id)
      .map((row) => [String(row.id), String(row.user_id)]),
  );
  const organizer = members.find(
    (row) => row.status === "linked" && row.role === "owner" && row.user_id,
  );
  assert(organizer, "UI_POLISH_LINKED_ORGANIZER_MISSING");
  const organizerUserId = String(organizer.user_id);
  const preview = await gateway.previewLedgerSettlement(
    organizerUserId,
    UI_POLISH_JOURNEY_ID,
    FIXED_CUTOFF,
  );
  assert(
    baseline.latestExpenseAt &&
      Date.parse(FIXED_CUTOFF) > Date.parse(baseline.latestExpenseAt),
    `FIXED_CUTOFF_NOT_AFTER_FINAL_EXPENSE:${baseline.latestExpenseAt}`,
  );
  assert(preview.state === "PREVIEW_READY", "UI_POLISH_PREVIEW_NOT_READY");
  assert(
    preview.inputs.length === 72,
    `UI_POLISH_PREVIEW_INPUT_DRIFT:${preview.inputs.length}`,
  );
  assert(
    preview.exclusions.length === 61,
    `UI_POLISH_PREVIEW_EXCLUSION_DRIFT:${preview.exclusions.length}`,
  );
  assert(
    preview.blockers.length === 0,
    `UI_POLISH_PREVIEW_BLOCKER_DRIFT:${preview.blockers.length}`,
  );
  assert(
    preview.balances.length === 8,
    `UI_POLISH_PREVIEW_BALANCE_DRIFT:${preview.balances.length}`,
  );
  assert(
    preview.transfers.length === 7,
    `UI_POLISH_PREVIEW_TRANSFER_DRIFT:${preview.transfers.length}`,
  );

  const apply = process.env.OTR_SETTLEMENT_FIXTURE_APPLY === APPLY_TOKEN;
  if (!apply) {
    console.info(
      canonicalStage9Json({
        preflightPassed: true,
        mutationPerformed: false,
        target: "Hosted Dev",
        replayFingerprint: replayBefore,
        uiPolishSourceDigest: sourceBefore,
        previewDigest: preview.inputDigest,
        preview: { inputs: 72, exclusions: 61, blockers: 0, balances: 8, transfers: 7 },
        existingRootCount: baseline.settlements.length,
        existingPaymentCount: baseline.payments.length,
        linkedMembers: linkedByMember.size,
        productionAccess: false,
      }),
    );
    return;
  }

  const finalized = await gateway.finalizeLedgerSettlement(
    organizerUserId,
    UI_POLISH_JOURNEY_ID,
    FINALIZE_KEY,
    { throughTimestamp: FIXED_CUTOFF, inputDigest: preview.inputDigest },
  );
  assert(finalized.entity.kind === "ROOT", "UI_POLISH_ROOT_KIND_DRIFT");
  assert(finalized.entity.inputDigest === preview.inputDigest, "UI_POLISH_DIGEST_DRIFT");
  assert(finalized.entity.transfers.length === 7, "UI_POLISH_FINAL_TRANSFER_DRIFT");
  assert((await sourceDigest(client)) === sourceBefore, "UI_POLISH_SOURCE_MUTATED");
  const replayAfterFinalization = await verifyReplay(client);

  const transfers = [...finalized.entity.transfers].sort((a, b) =>
    a.id.localeCompare(b.id),
  );
  assert(
    transfers.slice(1, 5).every((item) => item.amount.minor > 1),
    "TRANSFER_TOO_SMALL",
  );
  const plans = [
    {
      slot: 1,
      id: "5af0362c-0b0b-5b62-8435-6d67a92e7f01",
      amount: transfers[1].amount.minor,
      action: "confirm",
    },
    {
      slot: 2,
      id: "5af0362c-0b0b-5b62-8435-6d67a92e7f02",
      amount: Math.floor(transfers[2].amount.minor / 2),
      action: "confirm",
    },
    {
      slot: 3,
      id: "5af0362c-0b0b-5b62-8435-6d67a92e7f03",
      amount: Math.floor(transfers[3].amount.minor / 2),
      action: null,
    },
    {
      slot: 4,
      id: "5af0362c-0b0b-5b62-8435-6d67a92e7f04",
      amount: Math.floor(transfers[4].amount.minor / 2),
      action: "dispute",
    },
  ] as const;
  const lifecycleResults = [];
  for (const plan of plans) {
    const transfer = transfers[plan.slot];
    const payerUserId = linkedByMember.get(transfer.fromMemberId);
    const actorUserId = payerUserId ?? organizerUserId;
    const reportingAuthority = payerUserId ? "PAYER" : "ORGANIZER_OVERRIDE";
    const recorded = await gateway.recordSettlementPayment(
      actorUserId,
      UI_POLISH_JOURNEY_ID,
      transfer.id,
      `EUROPE_2026_UI_POLISH_PAYMENT_V1_${plan.slot}`,
      paymentInput(transfer, plan.id, plan.amount, reportingAuthority),
    );
    let actionReplay: boolean | null = null;
    if (plan.action) {
      const recipientUserId = linkedByMember.get(transfer.toMemberId);
      const actionActor = recipientUserId ?? organizerUserId;
      const authority = recipientUserId
        ? "RECIPIENT"
        : payerUserId && plan.action === "dispute"
          ? "PAYER"
          : "ORGANIZER_OVERRIDE";
      const acted = await gateway.actOnSettlementPayment(
        actionActor,
        UI_POLISH_JOURNEY_ID,
        recorded.paymentId,
        plan.action,
        `EUROPE_2026_UI_POLISH_${plan.action.toUpperCase()}_V1_${plan.slot}`,
        {
          basePaymentRevision: 1,
          authority,
          reason:
            authority === "RECIPIENT" && plan.action === "confirm"
              ? null
              : "Deterministic fixture lifecycle coverage.",
        },
      );
      actionReplay = acted.idempotentReplay;
    }
    lifecycleResults.push({
      transferId: transfer.id,
      state: plan.action ?? "awaiting",
      paymentId: recorded.paymentId,
      actorPath: reportingAuthority,
      recordReplay: recorded.idempotentReplay,
      actionReplay,
    });
  }

  assert((await sourceDigest(client)) === sourceBefore, "UI_POLISH_SOURCE_MUTATED");
  const replayAfterLifecycle = await verifyReplay(client);
  const final = (
    await gateway.finalizeLedgerSettlement(
      organizerUserId,
      UI_POLISH_JOURNEY_ID,
      FINALIZE_KEY,
      { throughTimestamp: FIXED_CUTOFF, inputDigest: preview.inputDigest },
    )
  ).entity;
  const statusCounts = Object.fromEntries(
    ["OPEN", "SETTLED", "PARTIALLY_PAID", "AWAITING_CONFIRMATION", "DISPUTED"].map(
      (status) => [
        status,
        final.transfers.filter((item) => item.status === status).length,
      ],
    ),
  );
  assert(final.kind === "ROOT" && final.transfers.length === 7, "FINAL_ROOT_DRIFT");
  assert(statusCounts.OPEN === 3, "OPEN_TRANSFER_COUNT_DRIFT");
  assert(statusCounts.SETTLED === 1, "SETTLED_TRANSFER_COUNT_DRIFT");
  assert(statusCounts.PARTIALLY_PAID === 1, "PARTIAL_TRANSFER_COUNT_DRIFT");
  assert(statusCounts.AWAITING_CONFIRMATION === 1, "AWAITING_TRANSFER_COUNT_DRIFT");
  assert(statusCounts.DISPUTED === 1, "DISPUTED_TRANSFER_COUNT_DRIFT");
  assert(
    final.transfers.flatMap((item) => item.payments).length === 4,
    "PAYMENT_COUNT_DRIFT",
  );
  assert(
    final.transfers.flatMap((item) => item.payments).filter((item) => item.discharge)
      .length === 2,
    "DISCHARGE_COUNT_DRIFT",
  );
  const replayEnd = await verifyReplay(client);
  assert(
    [replayBefore, replayAfterFinalization, replayAfterLifecycle, replayEnd].every(
      (digest) => digest === APPROVED_REPLAY_FINGERPRINT,
    ),
    "REPLAY_CHANGED_DURING_ENABLEMENT",
  );

  console.info(
    canonicalStage9Json({
      fixtureEnabled: true,
      target: "Hosted Dev",
      journeyId: UI_POLISH_JOURNEY_ID,
      previewDigest: preview.inputDigest,
      rootSettlementId: final.id,
      rootCount: 1,
      transferCount: 7,
      statusCounts,
      lifecycleResults,
      linkedMembers: linkedByMember.size,
      payerUiPathAvailable: transfers.some((item) =>
        linkedByMember.has(item.fromMemberId),
      ),
      replayFingerprints: {
        before: replayBefore,
        afterFinalization: replayAfterFinalization,
        afterLifecycle: replayAfterLifecycle,
        end: replayEnd,
      },
      sourceDigestUnchanged: true,
      finalizationIdempotentReplay: finalized.idempotentReplay,
      productionAccess: false,
    }),
  );
}

if (process.env.VITEST !== "true") {
  void run().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "SETTLEMENT_FIXTURE_FAILED");
    process.exitCode = 1;
  });
}
