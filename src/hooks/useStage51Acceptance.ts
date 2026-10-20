import { useEffect, useState } from "react";
import { useLocalSearchParams } from "expo-router";

import { signInToSupabaseDev } from "@/data/auth/devSupabaseAuth";
import { openDatabase } from "@/data/db/database";
import { createLedgerCollaborationRepository } from "@/data/repositories/ledgerCollaborationRepository";
import {
  createLedgerExpenseRepository,
  type LedgerExpense,
} from "@/data/repositories/ledgerExpenseRepository";
import { getDefaultLedgerReadRepository } from "@/data/repositories/defaultLedgerReadRepository";
import { createLedgerExpenseMutationTransport } from "@/data/sync/ledgerExpenseMutationTransport";
import { runLedgerExpenseSync } from "@/data/sync/ledgerExpenseDemoCoordinator";
import { createLedgerReadTransport } from "@/data/sync/ledgerReadTransport";
import { allocateEqual } from "@/domain/ledger/allocation";
import { createLocalId } from "@/domain/localId";
import type { LedgerExpenseDto } from "@/data/api/ledgerReadContracts";

const journeyId = process.env.EXPO_PUBLIC_OTR_DEV_TRIP_ID ?? "";
const restartTitle = "Stage 5.1 offline restart fixture";

export type Stage51Check = { name: string; ok: boolean; detail: string };

export function useStage51Acceptance() {
  const [checks, setChecks] = useState<Stage51Check[]>([]);
  const { phase } = useLocalSearchParams<{ phase?: string }>();

  useEffect(() => {
    let cancelled = false;
    const record = (name: string, ok: boolean, detail: string) => {
      if (!cancelled) setChecks((current) => [...current, { name, ok, detail }]);
      if (!ok) throw new Error(`${name}: ${detail}`);
    };
    void runAcceptance(phase, record).catch((error) => {
      if (!cancelled)
        setChecks((current) => [
          ...current,
          {
            name: "Stage 5.1 acceptance stopped",
            ok: false,
            detail: error instanceof Error ? error.message : "unknown failure",
          },
        ]);
    });
    return () => {
      cancelled = true;
    };
  }, [phase]);

  return checks;
}

async function runAcceptance(
  phase: string | undefined,
  record: (name: string, ok: boolean, detail: string) => void,
) {
  if (!journeyId) record("configured Journey", false, "missing trip id");
  await signInFor("creator");
  const bootstrap = await createLedgerReadTransport().bootstrap(journeyId);
  await (await getDefaultLedgerReadRepository()).applyBootstrap(bootstrap);
  const creatorId = bootstrap.actor.memberId;
  const organizer = bootstrap.members.find((member) => member.role === "owner");
  const members = bootstrap.members.slice(0, 2);
  if (!creatorId || !organizer || members.length < 2)
    record("acceptance identities", false, "creator/organizer/members missing");
  record(
    "financial capabilities",
    bootstrap.actor.capabilities.canAddOwnPaymentEvidence &&
      bootstrap.actor.capabilities.canManageExpenseValuation &&
      !bootstrap.actor.capabilities.canManageLedgerValuationPolicy,
    "creator evidence + valuation, policy owner-only",
  );

  const database = await openDatabase();
  const repository = createLedgerExpenseRepository(database);
  let expense = (await repository.listExpensesForJourney(journeyId, true)).find(
    (item) => item.title === restartTitle && item.syncStatus === "PENDING_CREATE",
  );
  if (!expense)
    expense = await createRateRequiredExpense(repository, creatorId!, members);
  const reopened = await createLedgerExpenseRepository(await openDatabase()).getExpense(
    expense.id,
  );
  record(
    "offline RATE_REQUIRED survives restart",
    reopened?.status === "RATE_REQUIRED" &&
      reopened.syncStatus === "PENDING_CREATE" &&
      reopened.valuation === null,
    reopened ? `${reopened.status}/${reopened.syncStatus}` : "missing",
  );
  if (phase === "offline") {
    record("cold restart checkpoint", true, expense.id);
    return;
  }

  await runLedgerExpenseSync({ entityId: expense.id });
  expense = await requireExpense(repository, expense.id);
  record(
    "RATE_REQUIRED sync is successful",
    expense.syncStatus === "SYNCED" && expense.serverRevision === 1,
    `${expense.status}/${expense.syncStatus}/r${expense.serverRevision}`,
  );

  const payment = await repository.addPaymentRecord(expense.id, {
    instrumentLabel: "Visa NZ",
    authorization: { minor: 19_900, currency: "NZD", scale: 2 },
    posted: { minor: 19_943, currency: "NZD", scale: 2 },
    authorizedAt: new Date().toISOString(),
    postedAt: new Date().toISOString(),
    fee: { minor: 200, currency: "NZD", scale: 2 },
    bankFxRate: "1.9943",
    source: "manual",
    notes: null,
    supersedesPaymentRecordId: null,
  });
  await runLedgerExpenseSync({ entityId: expense.id });
  expense = await requireExpense(repository, expense.id);
  record(
    "PaymentRecord never silently revalues",
    expense.serverRevision === 1 &&
      expense.status === "RATE_REQUIRED" &&
      expense.valuation === null &&
      Boolean(await repository.getPaymentRecordServerId(payment.id)),
    `EUR ${expense.original.minor}, posted NZD ${payment.posted!.minor}, group unresolved`,
  );

  await repository.applyValuation(expense.id, {
    policy: "MANUAL_AGREED",
    manualRate: "1.978",
    reason: "Stage 5.1 agreed group value",
  });
  await runLedgerExpenseSync({ entityId: expense.id });
  expense = await requireExpense(repository, expense.id);
  const manualAudit = await database.getFirstAsync<{ reason: string | null }>(
    `SELECT reason FROM ledger_expense_audit_events
     WHERE expense_id = ? AND event_type = 'VALUATION_APPLIED'
     ORDER BY created_at DESC LIMIT 1`,
    expense.id,
  );
  record(
    "three independent financial facts",
    expense.original.minor === 10_000 &&
      payment.posted?.minor === 19_943 &&
      expense.valuation?.settlement.minor === 19_780,
    "EUR 100.00 / NZD 199.43 / NZD 197.80",
  );
  record(
    "manual valuation reason and audit",
    manualAudit?.reason === "Stage 5.1 agreed group value",
    manualAudit?.reason ?? "missing",
  );
  record(
    "settlement readiness only",
    expense.status === "ACCEPTED" && Boolean(expense.valuation),
    "ready; no settlement created",
  );

  const corrected = await repository.addPaymentRecord(expense.id, {
    instrumentLabel: "Visa NZ corrected",
    authorization: null,
    posted: { minor: 20_000, currency: "NZD", scale: 2 },
    postedAt: new Date().toISOString(),
    fee: null,
    source: "manual",
    notes: "Statement correction",
    supersedesPaymentRecordId: payment.id,
  });
  await runLedgerExpenseSync({ entityId: expense.id });
  expense = await requireExpense(repository, expense.id);
  record(
    "PaymentRecord supersession is append-only",
    expense.paymentRecords.length >= 2 &&
      Boolean(await repository.getPaymentRecordServerId(corrected.id)) &&
      expense.valuation?.settlement.minor === 19_780 &&
      expense.serverRevision === 2,
    `${expense.paymentRecords.length} records, group NZD ${expense.valuation?.settlement.minor}`,
  );

  await repository.applyValuation(expense.id, {
    policy: "MANUAL_AGREED",
    manualRate: "1.95",
    reason: "Creator concurrent valuation",
  });
  await signInFor("organizer");
  const remote = await createLedgerExpenseMutationTransport().applyValuation({
    journeyId,
    expenseServerId: expense.serverId!,
    idempotencyKey: createLocalId("stage5-valuation-organizer"),
    valuation: {
      localValuationId: createLocalId("stage5-valuation"),
      localRateSnapshotId: createLocalId("stage5-rate"),
      baseRevision: 2,
      policy: "MANUAL_AGREED",
      rateQuoteId: null,
      paymentRecordId: null,
      manualRate: "2",
      reason: "Organizer concurrent valuation",
      previewSettlement: { minor: 20_000, currency: "NZD", scale: 2 },
    },
  });
  await signInFor("creator");
  await runLedgerExpenseSync({ entityId: expense.id });
  const collaboration = createLedgerCollaborationRepository(database);
  const conflict = await collaboration.getOpenConflict(expense.id);
  record(
    "two-client valuation conflict uses Stage 4C",
    Boolean(
      conflict &&
      JSON.parse(conflict.changedGroupsJson).includes("FINANCIAL_CORE") &&
      (await requireExpense(repository, expense.id)).syncStatus === "CONFLICT",
    ),
    `Journey r${remote.revision}, conflict ${conflict?.conflictId ?? "missing"}`,
  );
  const canonical = JSON.parse(conflict!.canonicalSnapshotJson) as LedgerExpenseDto;
  await collaboration.queueConflictResolution(expense.id, journeyId, {
    conflictId: conflict!.conflictId,
    currentRevision: conflict!.currentRevision,
    resolution: "KEEP_JOURNEY",
    resolvedExpense: editable(canonical),
    selectedSources: {
      FINANCIAL_CORE: "JOURNEY",
      DESCRIPTIVE: "JOURNEY",
      LINKS: "JOURNEY",
      EVIDENCE: "JOURNEY",
      LIFECYCLE: "JOURNEY",
    },
    reason: "Keep canonical organizer valuation",
  });
  await runLedgerExpenseSync({ entityId: expense.id });
  expense = await requireExpense(repository, expense.id);
  record(
    "conflict resolution converges",
    expense.serverRevision === 3 && expense.valuation?.settlement.minor === 20_000,
    `r${expense.serverRevision} NZD ${expense.valuation?.settlement.minor}`,
  );
}

async function createRateRequiredExpense(
  repository: ReturnType<typeof createLedgerExpenseRepository>,
  creatorMemberId: string,
  members: { id: string; displayName: string }[],
) {
  const original = { minor: 10_000, currency: "EUR", scale: 2 };
  return repository.createExpense({
    journeyId,
    creatorMemberId,
    payerMemberId: creatorMemberId,
    title: restartTitle,
    description: null,
    category: "food",
    occurredAt: new Date().toISOString(),
    original,
    participants: members.map((member) => ({
      memberId: member.id,
      displayNameSnapshot: member.displayName,
      householdIdSnapshot: null,
    })),
    splits: allocateEqual(
      original.minor,
      null,
      members.map((member) => member.id),
    ),
    valuation: null,
    status: "RATE_REQUIRED",
  });
}

function editable(expense: LedgerExpenseDto) {
  return {
    title: expense.title,
    description: expense.description,
    category: expense.category,
    occurredAt: expense.occurredAt,
    payerMemberId: expense.payerMemberId,
    original: expense.original,
    businessStatus:
      expense.businessStatus === "DELETED"
        ? ("ACCEPTED" as const)
        : expense.businessStatus,
    participants: expense.participants,
    splits: expense.splits,
    valuation: expense.valuation
      ? {
          policy: expense.valuation.policy,
          original: expense.valuation.original,
          settlement: expense.valuation.settlement,
          rateSnapshotId: expense.valuation.rateSnapshotId,
          paymentRecordId: expense.valuation.paymentRecordId,
          reason: expense.valuation.reason,
        }
      : null,
  };
}

async function requireExpense(
  repository: ReturnType<typeof createLedgerExpenseRepository>,
  id: string,
): Promise<LedgerExpense> {
  const expense = await repository.getExpense(id);
  if (!expense) throw new Error("Stage 5.1 Expense is missing.");
  return expense;
}

async function signInFor(role: "creator" | "organizer") {
  const email =
    role === "creator"
      ? (process.env.EXPO_PUBLIC_OTR_STAGE5_CREATOR_EMAIL ??
        process.env.EXPO_PUBLIC_OTR_STAGE4C_CREATOR_EMAIL ??
        process.env.EXPO_PUBLIC_OTR_STAGE4B_CREATOR_EMAIL ??
        "")
      : (process.env.EXPO_PUBLIC_OTR_STAGE5_ORGANIZER_EMAIL ??
        process.env.EXPO_PUBLIC_OTR_STAGE4C_ORGANIZER_EMAIL ??
        process.env.EXPO_PUBLIC_OTR_STAGE4B_ORGANIZER_EMAIL ??
        "");
  const password =
    role === "creator"
      ? (process.env.EXPO_PUBLIC_OTR_STAGE5_CREATOR_PASSWORD ??
        process.env.EXPO_PUBLIC_OTR_STAGE4C_CREATOR_PASSWORD ??
        process.env.EXPO_PUBLIC_OTR_STAGE4B_CREATOR_PASSWORD ??
        "")
      : (process.env.EXPO_PUBLIC_OTR_STAGE5_ORGANIZER_PASSWORD ??
        process.env.EXPO_PUBLIC_OTR_STAGE4C_ORGANIZER_PASSWORD ??
        process.env.EXPO_PUBLIC_OTR_STAGE4B_ORGANIZER_PASSWORD ??
        "");
  if (!email || !password) throw new Error(`Missing Stage 5.1 ${role} credentials.`);
  await signInToSupabaseDev(email, password);
}
