import * as FileSystem from "expo-file-system/legacy";
import { useEffect, useRef, useState } from "react";

import type { LedgerExpenseDto } from "@/data/api/ledgerReadContracts";
import { signInToSupabaseDev } from "@/data/auth/devSupabaseAuth";
import { openDatabase } from "@/data/db/database";
import { getSchemaVersion } from "@/data/db/migrationRunner";
import { getDefaultLedgerReadRepository } from "@/data/repositories/defaultLedgerReadRepository";
import { createLedgerCollaborationRepository } from "@/data/repositories/ledgerCollaborationRepository";
import {
  createLedgerExpenseRepository,
  type LedgerExpense,
  type LedgerExpenseCommand,
} from "@/data/repositories/ledgerExpenseRepository";
import { runLedgerExpenseSync } from "@/data/sync/ledgerExpenseDemoCoordinator";
import { createLedgerExpenseMutationTransport } from "@/data/sync/ledgerExpenseMutationTransport";
import { createLedgerReadTransport } from "@/data/sync/ledgerReadTransport";
import { allocateEqual } from "@/domain/ledger/allocation";
import { createLocalId } from "@/domain/localId";

const journeyId = process.env.EXPO_PUBLIC_OTR_DEV_TRIP_ID ?? "";
const conflictPrefix = "Stage 4C physical conflict";
const correctionPrefix = "Stage 4C physical correction";
const outputFile = `${FileSystem.documentDirectory}stage4c-physical-smoke.json`;

export type Stage4CPhysicalCheck = { name: string; ok: boolean; detail: string };
type RecordCheck = (name: string, ok: boolean, detail: string) => void;
type Role = "creator" | "organizer";
type Member = { id: string; displayName: string };

export function useStage4CPhysicalSmoke(action?: string) {
  const [checks, setChecks] = useState<Stage4CPhysicalCheck[]>([]);
  const [running, setRunning] = useState(false);
  const started = useRef<string | null>(null);

  useEffect(() => {
    if (!action || started.current === action) return;
    started.current = action;
    const results: Stage4CPhysicalCheck[] = [];
    const record: RecordCheck = (name, ok, detail) => {
      const check = { name, ok, detail };
      results.push(check);
      console.info("[Stage4CPhysicalSmoke]", ok ? "PASS" : "FAIL", name, detail);
      setChecks([...results]);
      if (!ok) throw new Error(`${name}: ${detail}`);
    };

    setRunning(true);
    void FileSystem.writeAsStringAsync(
      outputFile,
      JSON.stringify({ action, checks: [], running: true }, null, 2),
    );
    void runAction(action, record)
      .catch((error) => {
        results.push({
          name: "physical smoke stopped",
          ok: false,
          detail: error instanceof Error ? error.message : "unknown failure",
        });
        setChecks([...results]);
      })
      .finally(async () => {
        setRunning(false);
        await FileSystem.writeAsStringAsync(
          outputFile,
          JSON.stringify(
            {
              action,
              checks: results,
              running: false,
              updatedAt: new Date().toISOString(),
            },
            null,
            2,
          ),
        );
      });
  }, [action]);

  return { checks, running };
}

async function runAction(action: string, record: RecordCheck) {
  const actions: Record<string, () => Promise<void>> = {
    "phone-prepare-conflict": () => prepareConflict(record),
    "sim-bootstrap-conflict": () => bootstrapConflict(record),
    "phone-offline-edit": () => offlineConflictEdit(record),
    "phone-check-offline-restart": () => checkOfflineConflictRestart(record),
    "sim-advance-conflict": () => advanceConflict(record),
    "phone-reconnect-conflict": () => reconnectConflict(record),
    "phone-check-conflict-restart": () => checkConflictRestart(record),
    "phone-resolve-conflict": () => resolveConflict(record),
    "sim-check-conflict-converged": () => checkConflictConvergence(record),
    "sim-prepare-correction": () => prepareCorrection(record),
    "phone-bootstrap-correction": () => bootstrapCorrection(record),
    "phone-offline-correction": () => createOfflineCorrection(record),
    "phone-check-correction-restart": () => checkCorrectionRestart(record),
    "phone-reconnect-correction": () => reconnectCorrection(record),
    "sim-accept-correction": () => acceptCorrection(record),
    "phone-final": () => checkFinalPhone(record),
    "sim-final": () => checkFinalSimulator(record),
  };
  const run = actions[action];
  if (!run) throw new Error(`Unknown Stage 4C physical action: ${action}`);
  await run();
}

async function prepareConflict(record: RecordCheck) {
  const { actor, members } = await bootstrap("creator", true);
  const repository = createLedgerExpenseRepository(await openDatabase());
  const local = await repository.createExpense(
    command(`${conflictPrefix} seed`, actor, members, 1200),
  );
  await runLedgerExpenseSync({ entityId: local.id });
  const synced = await requireExpense(repository, local.id);
  record(
    "same Expense bootstrap seed synced",
    Boolean(synced.serverId) &&
      synced.serverRevision === 1 &&
      synced.syncStatus === "SYNCED",
    `${synced.serverId ?? "missing"} r${synced.serverRevision}`,
  );
}

async function bootstrapConflict(record: RecordCheck) {
  const { response } = await bootstrap("organizer", true);
  const target = newestServerExpense(response.expenses, conflictPrefix);
  record(
    "same synced Expense bootstrapped on Simulator",
    target.revision === 1 && target.original.minor === 1200,
    `${target.id} r${target.revision}`,
  );
}

async function offlineConflictEdit(record: RecordCheck) {
  const repository = createLedgerExpenseRepository(await openDatabase());
  const target = await latestExpense(repository, conflictPrefix);
  await repository.updateExpense(
    target.id,
    editCommand(target, `${conflictPrefix} mine`, 1300),
    "Physical offline conflict edit",
  );
  await runLedgerExpenseSync({ entityId: target.id });
  const local = await requireExpense(repository, target.id);
  const operation = await latestOperation(target.id, "LEDGER_UPDATE_EXPENSE");
  record(
    "offline mutation persisted",
    local.original.minor === 1300 &&
      local.serverRevision === 1 &&
      local.syncStatus === "FAILED" &&
      operation?.status === "RETRYABLE",
    `${local.syncStatus} / ${operation?.status ?? "missing"} / r${local.serverRevision}`,
  );
}

async function checkOfflineConflictRestart(record: RecordCheck) {
  const repository = createLedgerExpenseRepository(await openDatabase());
  const target = await latestExpense(repository, conflictPrefix);
  const operation = await latestOperation(target.id, "LEDGER_UPDATE_EXPENSE");
  record(
    "offline mutation survives cold relaunch",
    target.original.minor === 1300 &&
      target.serverRevision === 1 &&
      target.syncStatus === "FAILED" &&
      operation?.status === "RETRYABLE",
    `${target.title} / ${operation?.status ?? "missing"}`,
  );
}

async function advanceConflict(record: RecordCheck) {
  const { response } = await bootstrap("organizer", true);
  const target = newestServerExpense(response.expenses, conflictPrefix);
  const local = await latestExpense(
    createLedgerExpenseRepository(await openDatabase()),
    conflictPrefix,
  );
  const remote = await createLedgerExpenseMutationTransport().updateExpense({
    journeyId,
    serverId: target.id,
    idempotencyKey: createLocalId("stage4c-physical-remote"),
    baseRevision: 1,
    auditReason: "Physical two-client concurrent edit",
    expense: editableCommand(editCommand(local, `${conflictPrefix} Journey`, 1400)),
  });
  record(
    "Simulator advanced canonical Expense",
    remote.revision === 2 && remote.entity.original.minor === 1400,
    `${remote.serverId} r${remote.revision}`,
  );
}

async function reconnectConflict(record: RecordCheck) {
  await signInFor("creator");
  const repository = createLedgerExpenseRepository(await openDatabase());
  const collaboration = createLedgerCollaborationRepository(await openDatabase());
  const target = await latestExpense(repository, conflictPrefix);
  await runLedgerExpenseSync({ entityId: target.id });
  const local = await requireExpense(repository, target.id);
  const conflict = await collaboration.getOpenConflict(target.id);
  const submitted = conflict ? JSON.parse(conflict.submittedSnapshotJson) : null;
  const canonical = conflict ? JSON.parse(conflict.canonicalSnapshotJson) : null;
  const remote = newestServerExpense(
    (await createLedgerReadTransport().bootstrap(journeyId)).expenses,
    conflictPrefix,
  );
  record(
    "explicit REVISION_CONFLICT",
    local.syncStatus === "CONFLICT" &&
      Boolean(conflict) &&
      JSON.parse(conflict!.changedGroupsJson).includes("FINANCIAL_CORE"),
    conflict?.conflictId ?? "missing",
  );
  record(
    "submitted and canonical snapshots preserved",
    submitted?.original?.minor === 1300 &&
      canonical?.original?.minor === 1400 &&
      conflict?.baseRevision === 1 &&
      conflict.currentRevision === 2,
    `base r${conflict?.baseRevision ?? 0}, submitted 1300, canonical r${conflict?.currentRevision ?? 0}`,
  );
  record(
    "canonical Expense not silently overwritten",
    local.original.minor === 1300 &&
      remote.original.minor === 1400 &&
      remote.revision === 2,
    `local ${local.original.minor}, server ${remote.original.minor} r${remote.revision}`,
  );
}

async function checkConflictRestart(record: RecordCheck) {
  const repository = createLedgerExpenseRepository(await openDatabase());
  const collaboration = createLedgerCollaborationRepository(await openDatabase());
  const target = await latestExpense(repository, conflictPrefix);
  const conflict = await collaboration.getOpenConflict(target.id);
  const base = conflict ? JSON.parse(conflict.baseSnapshotJson) : null;
  const submitted = conflict ? JSON.parse(conflict.submittedSnapshotJson) : null;
  const canonical = conflict ? JSON.parse(conflict.canonicalSnapshotJson) : null;
  record(
    "immutable conflict envelope survives cold relaunch",
    target.syncStatus === "CONFLICT" &&
      base?.original?.minor === 1200 &&
      submitted?.original?.minor === 1300 &&
      canonical?.original?.minor === 1400,
    `${conflict?.conflictId ?? "missing"} / 1200 -> 1300 | 1400`,
  );
}

async function resolveConflict(record: RecordCheck) {
  await signInFor("creator");
  const database = await openDatabase();
  const repository = createLedgerExpenseRepository(database);
  const collaboration = createLedgerCollaborationRepository(database);
  const target = await latestExpense(repository, conflictPrefix);
  const conflict = await collaboration.getOpenConflict(target.id);
  if (!conflict) throw new Error("Open physical conflict is missing.");
  await collaboration.queueConflictResolution(target.id, journeyId, {
    conflictId: conflict.conflictId,
    currentRevision: conflict.currentRevision,
    resolution: "KEEP_MINE",
    resolvedExpense: JSON.parse(conflict.submittedSnapshotJson),
    selectedSources: sources("SUBMITTED"),
    reason: "Physical-device creator kept submitted aggregate",
  });
  await runLedgerExpenseSync({ entityId: target.id });
  const resolved = await requireExpense(repository, target.id);
  const row = await database.getFirstAsync<{ status: string }>(
    "SELECT status FROM ledger_expense_conflicts WHERE conflict_id = ?",
    conflict.conflictId,
  );
  record(
    "authorized Keep Mine resolution",
    resolved.syncStatus === "SYNCED" &&
      resolved.serverRevision === 3 &&
      resolved.original.minor === 1300 &&
      row?.status === "RESOLVED",
    `${row?.status ?? "missing"} / r${resolved.serverRevision}`,
  );
}

async function checkConflictConvergence(record: RecordCheck) {
  const { response } = await bootstrap("organizer", true);
  const target = newestServerExpense(response.expenses, conflictPrefix);
  record(
    "both clients converge after pull",
    target.revision === 3 &&
      target.original.minor === 1300 &&
      target.auditEvents.some((event) => event.eventType === "CONFLICT_RESOLVED"),
    `${target.title} / r${target.revision}`,
  );
}

async function prepareCorrection(record: RecordCheck) {
  const { actor, members } = await bootstrap("organizer", true);
  const repository = createLedgerExpenseRepository(await openDatabase());
  const local = await repository.createExpense(
    command(`${correctionPrefix} seed`, actor, members, 2100),
  );
  await runLedgerExpenseSync({ entityId: local.id });
  const synced = await requireExpense(repository, local.id);
  record(
    "organizer correction target synced",
    Boolean(synced.serverId) && synced.serverRevision === 1,
    `${synced.serverId ?? "missing"} r${synced.serverRevision}`,
  );
}

async function bootstrapCorrection(record: RecordCheck) {
  const { response } = await bootstrap("creator", true);
  const target = newestServerExpense(response.expenses, correctionPrefix);
  record(
    "ordinary member phone bootstrapped correction target",
    target.revision === 1 && target.original.minor === 2100,
    `${target.id} r${target.revision}`,
  );
}

async function createOfflineCorrection(record: RecordCheck) {
  const database = await openDatabase();
  const expenses = createLedgerExpenseRepository(database);
  const collaboration = createLedgerCollaborationRepository(database);
  const target = await latestExpense(expenses, correctionPrefix);
  const actor = await database.getFirstAsync<{ memberId: string | null }>(
    "SELECT member_id AS memberId FROM ledger_actor_context WHERE journey_id = ?",
    journeyId,
  );
  if (!actor?.memberId) throw new Error("Cached ordinary-member context is missing.");
  const correctionId = await collaboration.createCorrection({
    journeyId,
    expenseId: target.id,
    expenseServerId: target.serverId!,
    baseRevision: target.serverRevision,
    proposedExpense: editableCommand(
      editCommand(target, `${correctionPrefix} proposed`, 2300),
    ),
    reason: "Physical offline ordinary-member correction",
    requestedByMemberId: actor.memberId,
  });
  await runLedgerExpenseSync({ entityId: correctionId });
  const [correction] = await collaboration.listCorrections(target.id);
  const operation = await latestOperation(
    correctionId,
    "LEDGER_PROPOSE_EXPENSE_CORRECTION",
  );
  record(
    "offline correction persisted",
    correction?.syncStatus === "PENDING_CREATE" && operation?.status === "RETRYABLE",
    `${correction?.syncStatus ?? "missing"} / ${operation?.status ?? "missing"}`,
  );
}

async function checkCorrectionRestart(record: RecordCheck) {
  const database = await openDatabase();
  const expenses = createLedgerExpenseRepository(database);
  const collaboration = createLedgerCollaborationRepository(database);
  const target = await latestExpense(expenses, correctionPrefix);
  const [correction] = await collaboration.listCorrections(target.id);
  const operation = correction
    ? await latestOperation(correction.id, "LEDGER_PROPOSE_EXPENSE_CORRECTION")
    : null;
  record(
    "offline correction survives cold relaunch",
    correction?.status === "OPEN" &&
      correction.syncStatus === "PENDING_CREATE" &&
      operation?.status === "RETRYABLE",
    `${correction?.status ?? "missing"} / ${correction?.syncStatus ?? "missing"}`,
  );
}

async function reconnectCorrection(record: RecordCheck) {
  await signInFor("creator");
  const database = await openDatabase();
  const expenses = createLedgerExpenseRepository(database);
  const collaboration = createLedgerCollaborationRepository(database);
  const target = await latestExpense(expenses, correctionPrefix);
  const [pending] = await collaboration.listCorrections(target.id);
  if (!pending) throw new Error("Physical correction is missing.");
  await runLedgerExpenseSync({ entityId: pending.id });
  const [synced] = await collaboration.listCorrections(target.id);
  record(
    "offline correction reconnects as OPEN",
    synced?.status === "OPEN" &&
      synced.syncStatus === "SYNCED" &&
      Boolean(synced.serverId),
    `${synced?.serverId ?? "missing"} / ${synced?.status ?? "missing"}`,
  );
}

async function acceptCorrection(record: RecordCheck) {
  await bootstrap("organizer", true);
  const database = await openDatabase();
  const expenses = createLedgerExpenseRepository(database);
  const collaboration = createLedgerCollaborationRepository(database);
  const target = await latestExpense(expenses, correctionPrefix);
  const correction = (await collaboration.listCorrections(target.id)).find(
    (item) => item.status === "OPEN",
  );
  if (!correction) throw new Error("Open physical correction is missing on Simulator.");
  await collaboration.queueCorrectionAction(correction.id, journeyId, "accept", {
    baseRequestRevision: correction.serverRevision,
    resolutionReason: "Physical organizer accepted correction",
  });
  await runLedgerExpenseSync({ entityId: correction.id });
  const accepted = (await collaboration.listCorrections(target.id)).find(
    (item) => item.id === correction.id,
  );
  const updated = await requireExpense(expenses, target.id);
  record(
    "Simulator accepted ordinary-member correction",
    accepted?.status === "ACCEPTED" &&
      updated.serverRevision === 2 &&
      updated.original.minor === 2300 &&
      (await auditCount(updated.id, "CORRECTION_ACCEPTED")) === 1,
    `${accepted?.status ?? "missing"} / r${updated.serverRevision}`,
  );
}

async function checkFinalPhone(record: RecordCheck) {
  await bootstrap("creator", true);
  const database = await openDatabase();
  const expenses = createLedgerExpenseRepository(database);
  const collaboration = createLedgerCollaborationRepository(database);
  const conflictTarget = await latestExpense(expenses, conflictPrefix);
  const correctionTarget = await latestExpense(expenses, correctionPrefix);
  const [correction] = await collaboration.listCorrections(correctionTarget.id);
  record(
    "phone pulled accepted correction and canonical audit",
    correctionTarget.serverRevision === 2 &&
      correctionTarget.original.minor === 2300 &&
      correction?.status === "ACCEPTED" &&
      (await auditCount(correctionTarget.id, "CORRECTION_ACCEPTED")) === 1,
    `${correction?.status ?? "missing"} / r${correctionTarget.serverRevision}`,
  );
  await sqliteSanity(record, conflictTarget.id, correctionTarget.id);
}

async function checkFinalSimulator(record: RecordCheck) {
  const { response } = await bootstrap("organizer", true);
  const conflict = newestServerExpense(response.expenses, conflictPrefix);
  const correction = newestServerExpense(response.expenses, correctionPrefix);
  record(
    "Simulator final canonical convergence",
    conflict.revision === 3 &&
      conflict.original.minor === 1300 &&
      correction.revision === 2 &&
      correction.original.minor === 2300 &&
      response.corrections.some(
        (item) => item.expenseId === correction.id && item.status === "ACCEPTED",
      ),
    `conflict r${conflict.revision}, correction r${correction.revision}`,
  );
}

async function bootstrap(role: Role, apply: boolean) {
  if (!journeyId) throw new Error("Missing configured Journey.");
  await signInFor(role);
  const response = await createLedgerReadTransport().bootstrap(journeyId);
  if (apply) await (await getDefaultLedgerReadRepository()).applyBootstrap(response);
  const actor = member(response.actor.memberId, response.members);
  const members = response.members.slice(0, 2);
  if (members.length < 1) throw new Error("Journey members are missing.");
  return { actor, members, response };
}

async function signInFor(role: Role) {
  const email =
    role === "creator"
      ? (process.env.EXPO_PUBLIC_OTR_STAGE4C_CREATOR_EMAIL ??
        process.env.EXPO_PUBLIC_OTR_STAGE4B_CREATOR_EMAIL)
      : (process.env.EXPO_PUBLIC_OTR_STAGE4C_ORGANIZER_EMAIL ??
        process.env.EXPO_PUBLIC_OTR_STAGE4B_ORGANIZER_EMAIL);
  const password =
    role === "creator"
      ? (process.env.EXPO_PUBLIC_OTR_STAGE4C_CREATOR_PASSWORD ??
        process.env.EXPO_PUBLIC_OTR_STAGE4B_CREATOR_PASSWORD)
      : (process.env.EXPO_PUBLIC_OTR_STAGE4C_ORGANIZER_PASSWORD ??
        process.env.EXPO_PUBLIC_OTR_STAGE4B_ORGANIZER_PASSWORD);
  if (!email || !password) throw new Error(`Missing Stage 4C ${role} credentials.`);
  await signInToSupabaseDev(email, password);
}

function command(title: string, payer: Member, members: Member[], minor: number) {
  const original = { minor, currency: "NZD", scale: 2 };
  const participants = members.map((item) => ({
    memberId: item.id,
    displayNameSnapshot: item.displayName,
    householdIdSnapshot: null,
  }));
  return {
    journeyId,
    creatorMemberId: payer.id,
    payerMemberId: payer.id,
    title: `${title} ${new Date().toISOString()}`,
    description: null,
    category: "food",
    occurredAt: new Date().toISOString(),
    original,
    participants,
    splits: allocateEqual(
      minor,
      minor,
      participants.map((item) => item.memberId),
    ),
    valuation: {
      id: createLocalId("ledger-valuation"),
      policy: "SAME_CURRENCY" as const,
      original,
      settlement: original,
      rateSnapshotId: null,
      paymentRecordId: null,
      reason: null,
    },
    status: "ACCEPTED" as const,
  } satisfies LedgerExpenseCommand;
}

function editCommand(expense: LedgerExpense, title: string, minor: number) {
  const original = { ...expense.original, minor };
  return {
    journeyId: expense.journeyId,
    creatorMemberId: expense.creatorMemberId,
    payerMemberId: expense.payerMemberId,
    title: `${title} ${new Date().toISOString()}`,
    description: expense.description,
    category: expense.category,
    occurredAt: expense.occurredAt,
    original,
    participants: expense.participants,
    splits: allocateEqual(
      minor,
      minor,
      expense.participants.map((item) => item.memberId),
    ),
    valuation: expense.valuation
      ? { ...expense.valuation, original, settlement: original }
      : null,
    status: "ACCEPTED" as const,
  } satisfies LedgerExpenseCommand;
}

function editableCommand(value: LedgerExpenseCommand) {
  return {
    title: value.title,
    description: value.description ?? null,
    category: value.category,
    occurredAt: value.occurredAt,
    payerMemberId: value.payerMemberId,
    original: value.original,
    businessStatus: value.status,
    participants: value.participants,
    splits: value.splits,
    valuation: value.valuation
      ? {
          policy: value.valuation.policy,
          original: value.valuation.original,
          settlement: value.valuation.settlement,
          rateSnapshotId: value.valuation.rateSnapshotId,
          paymentRecordId: value.valuation.paymentRecordId,
          reason: value.valuation.reason,
        }
      : null,
  };
}

function sources(value: "SUBMITTED" | "JOURNEY") {
  return {
    FINANCIAL_CORE: value,
    DESCRIPTIVE: value,
    LINKS: value,
    EVIDENCE: value,
    LIFECYCLE: value,
  } as const;
}

function member(id: string | null, members: Member[], fallback?: Member) {
  if (!id) {
    if (fallback) return fallback;
    throw new Error("Actor member is missing.");
  }
  const found = members.find((item) => item.id === id);
  if (!found) throw new Error("Journey member is missing.");
  return found;
}

async function latestExpense(
  repository: ReturnType<typeof createLedgerExpenseRepository>,
  prefix: string,
) {
  const target = (await repository.listExpensesForJourney(journeyId, true)).find((item) =>
    item.title.startsWith(prefix),
  );
  if (!target) throw new Error(`${prefix} target is missing.`);
  return target;
}

function newestServerExpense(expenses: LedgerExpenseDto[], prefix: string) {
  const target = expenses
    .filter((item) => item.title.startsWith(prefix))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
  if (!target) throw new Error(`${prefix} server target is missing.`);
  return target;
}

async function requireExpense(
  repository: ReturnType<typeof createLedgerExpenseRepository>,
  id: string,
) {
  const expense = await repository.getExpense(id);
  if (!expense) throw new Error("Physical Expense is missing.");
  return expense;
}

async function latestOperation(entityId: string, operationType: string) {
  return (await openDatabase()).getFirstAsync<{ status: string; id: string }>(
    `SELECT id, status FROM sync_operations
     WHERE entity_id = ? AND operation_type = ? ORDER BY created_at DESC LIMIT 1`,
    entityId,
    operationType,
  );
}

async function auditCount(expenseId: string, eventType: string) {
  const row = await (
    await openDatabase()
  ).getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) AS count FROM ledger_expense_audit_events WHERE expense_id = ? AND event_type = ?",
    expenseId,
    eventType,
  );
  return row?.count ?? 0;
}

async function sqliteSanity(
  record: RecordCheck,
  conflictExpenseId: string,
  correctionExpenseId: string,
) {
  const database = await openDatabase();
  const [
    integrity,
    version,
    lifecycle,
    duplicateExpenses,
    duplicateAudits,
    duplicateQueue,
    pending,
  ] = await Promise.all([
    database.getFirstAsync<{ integrity_check: string }>("PRAGMA integrity_check"),
    getSchemaVersion(database),
    database.getFirstAsync<{ conflicts: number; corrections: number }>(
      `SELECT
          (SELECT COUNT(*) FROM ledger_expense_conflicts WHERE expense_id = ? AND status = 'RESOLVED') AS conflicts,
          (SELECT COUNT(*) FROM ledger_correction_requests WHERE expense_id = ? AND status = 'ACCEPTED') AS corrections`,
      conflictExpenseId,
      correctionExpenseId,
    ),
    database.getFirstAsync<{ count: number }>(
      `SELECT COUNT(*) AS count FROM (
          SELECT server_id FROM ledger_expenses
          WHERE id IN (?, ?) AND server_id IS NOT NULL
          GROUP BY server_id HAVING COUNT(*) > 1
        )`,
      conflictExpenseId,
      correctionExpenseId,
    ),
    database.getFirstAsync<{ count: number }>(
      `SELECT COUNT(*) AS count FROM (
          SELECT server_id FROM ledger_expense_audit_events
          WHERE expense_id IN (?, ?) AND server_id IS NOT NULL
          GROUP BY server_id HAVING COUNT(*) > 1
        )`,
      conflictExpenseId,
      correctionExpenseId,
    ),
    database.getFirstAsync<{ count: number }>(
      `SELECT COUNT(*) AS count FROM (
          SELECT idempotency_key FROM sync_operations
          WHERE entity_id IN (?, ?) GROUP BY idempotency_key HAVING COUNT(*) > 1
        )`,
      conflictExpenseId,
      correctionExpenseId,
    ),
    database.getFirstAsync<{ count: number }>(
      "SELECT COUNT(*) AS count FROM sync_operations WHERE status IN ('PENDING', 'PROCESSING', 'RETRYABLE')",
    ),
  ]);
  record(
    "SQLite integrity_check",
    integrity?.integrity_check === "ok",
    integrity?.integrity_check ?? "missing",
  );
  record("SQLite schema version", version === 8, String(version));
  record(
    "expected conflict/correction lifecycle rows",
    (lifecycle?.conflicts ?? 0) >= 1 && lifecycle?.corrections === 1,
    `${lifecycle?.conflicts ?? 0} RESOLVED / ${lifecycle?.corrections ?? 0} ACCEPTED`,
  );
  record(
    "no duplicate Expense/audit/queue rows",
    duplicateExpenses?.count === 0 &&
      duplicateAudits?.count === 0 &&
      duplicateQueue?.count === 0,
    `${duplicateExpenses?.count ?? -1}/${duplicateAudits?.count ?? -1}/${duplicateQueue?.count ?? -1}`,
  );
  record(
    "no unexpected pending/retryable operations",
    pending?.count === 0,
    String(pending?.count ?? -1),
  );
}
