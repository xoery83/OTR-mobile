import { useEffect, useState } from "react";

import { ApiClientError } from "@/data/api/client";
import type { LedgerExpenseDto } from "@/data/api/ledgerReadContracts";
import { signInToSupabaseDev } from "@/data/auth/devSupabaseAuth";
import { openDatabase } from "@/data/db/database";
import { createLedgerCollaborationRepository } from "@/data/repositories/ledgerCollaborationRepository";
import {
  createLedgerExpenseRepository,
  type LedgerExpense,
  type LedgerExpenseCommand,
} from "@/data/repositories/ledgerExpenseRepository";
import { getDefaultLedgerReadRepository } from "@/data/repositories/defaultLedgerReadRepository";
import { createLedgerExpenseMutationTransport } from "@/data/sync/ledgerExpenseMutationTransport";
import { runLedgerExpenseSync } from "@/data/sync/ledgerExpenseDemoCoordinator";
import { createLedgerReadTransport } from "@/data/sync/ledgerReadTransport";
import { allocateEqual } from "@/domain/ledger/allocation";
import { createLocalId } from "@/domain/localId";

const journeyId = process.env.EXPO_PUBLIC_OTR_DEV_TRIP_ID ?? "";

export type Stage4CCheck = { name: string; ok: boolean; detail: string };
type Member = { id: string; displayName: string };

export function useStage4CAcceptance() {
  const [checks, setChecks] = useState<Stage4CCheck[]>([]);

  useEffect(() => {
    let cancelled = false;
    const record = (name: string, ok: boolean, detail: string) => {
      if (!cancelled) setChecks((current) => [...current, { name, ok, detail }]);
      if (!ok) throw new Error(`${name}: ${detail}`);
    };

    void runAcceptance(record).catch((error) => {
      if (!cancelled) {
        setChecks((current) => [
          ...current,
          {
            name: "Stage 4C acceptance stopped",
            ok: false,
            detail: error instanceof Error ? error.message : "unknown failure",
          },
        ]);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return checks;
}

async function runAcceptance(
  record: (name: string, ok: boolean, detail: string) => void,
) {
  if (!journeyId) record("configured Journey", false, "missing trip id");
  await signInFor("creator");
  const bootstrap = await createLedgerReadTransport().bootstrap(journeyId);
  await (await getDefaultLedgerReadRepository()).applyBootstrap(bootstrap);
  const creatorId = bootstrap.actor.memberId;
  const organizer = bootstrap.members.find((member) => member.role === "owner");
  const members = bootstrap.members.slice(0, 2);
  if (!creatorId || !organizer || members.length < 1) {
    record("two authenticated clients", false, "creator or organizer missing");
  }
  record("two authenticated clients", true, "creator + organizer");

  const database = await openDatabase();
  const expenses = createLedgerExpenseRepository(database);
  const collaboration = createLedgerCollaborationRepository(database);
  const transport = createLedgerExpenseMutationTransport();

  const local = await expenses.createExpense(
    command("conflict seed", member(creatorId!, bootstrap.members), members, 1200),
  );
  await runLedgerExpenseSync({ entityId: local.id });
  const synced = await requireExpense(expenses, local.id);
  await expenses.updateExpense(
    local.id,
    command("client mine r2", member(creatorId!, bootstrap.members), members, 1300),
    "offline creator edit",
  );

  await signInFor("organizer");
  const remote = await transport.updateExpense({
    journeyId,
    serverId: synced.serverId!,
    idempotencyKey: createLocalId("stage4c-remote"),
    baseRevision: 1,
    auditReason: "Concurrent organizer edit",
    expense: editableCommand(
      command("client Journey r2", member(creatorId!, bootstrap.members), members, 1400),
    ),
  });
  await signInFor("creator");
  await runLedgerExpenseSync({ entityId: local.id });
  const firstConflict = await collaboration.getOpenConflict(local.id);
  record(
    "financial conflict is explicit",
    Boolean(
      firstConflict &&
      JSON.parse(firstConflict.changedGroupsJson).includes("FINANCIAL_CORE") &&
      (await requireExpense(expenses, local.id)).syncStatus === "CONFLICT",
    ),
    `server r${remote.revision}`,
  );

  const restarted = createLedgerCollaborationRepository(await openDatabase());
  const afterRestart = await restarted.getOpenConflict(local.id);
  record(
    "immutable envelope survives repository restart",
    afterRestart?.submittedSnapshotJson === firstConflict?.submittedSnapshotJson &&
      afterRestart?.canonicalSnapshotJson === firstConflict?.canonicalSnapshotJson,
    afterRestart?.conflictId ?? "missing",
  );

  const canonical = JSON.parse(firstConflict!.canonicalSnapshotJson) as LedgerExpenseDto;
  await collaboration.queueConflictResolution(local.id, journeyId, {
    conflictId: firstConflict!.conflictId,
    currentRevision: firstConflict!.currentRevision,
    resolution: "KEEP_JOURNEY",
    resolvedExpense: editableDto(canonical),
    selectedSources: sources("JOURNEY"),
    reason: "Keep current Journey aggregate",
  });
  await runLedgerExpenseSync({ entityId: local.id });
  const keptJourney = await requireExpense(expenses, local.id);
  record(
    "Keep Journey audits without revision",
    keptJourney.serverRevision === 2 && keptJourney.original.minor === 1400,
    `r${keptJourney.serverRevision}`,
  );

  await expenses.updateExpense(
    local.id,
    command("client mine r3", member(creatorId!, bootstrap.members), members, 1500),
    "second offline edit",
  );
  await signInFor("organizer");
  const remote3 = await transport.updateExpense({
    journeyId,
    serverId: synced.serverId!,
    idempotencyKey: createLocalId("stage4c-remote"),
    baseRevision: 2,
    auditReason: "Second concurrent organizer edit",
    expense: editableCommand(
      command("client Journey r3", member(creatorId!, bootstrap.members), members, 1600),
    ),
  });
  await signInFor("creator");
  await runLedgerExpenseSync({ entityId: local.id });
  const mineConflict = await collaboration.getOpenConflict(local.id);
  const submitted = JSON.parse(mineConflict!.submittedSnapshotJson);
  await collaboration.queueConflictResolution(local.id, journeyId, {
    conflictId: mineConflict!.conflictId,
    currentRevision: remote3.revision,
    resolution: "KEEP_MINE",
    resolvedExpense: submitted,
    selectedSources: sources("SUBMITTED"),
    reason: "Keep creator financial aggregate",
  });
  await runLedgerExpenseSync({ entityId: local.id });
  const keptMine = await requireExpense(expenses, local.id);
  record(
    "Keep Mine creates one revision",
    keptMine.serverRevision === 4 && keptMine.original.minor === 1500,
    `r${keptMine.serverRevision}`,
  );

  await verifySupersession(
    expenses,
    collaboration,
    transport,
    local.id,
    synced.serverId!,
    member(creatorId!, bootstrap.members),
    members,
    record,
  );
  await verifyCorrections(
    expenses,
    collaboration,
    transport,
    member(creatorId!, bootstrap.members),
    organizer!,
    members,
    record,
  );
}

async function verifySupersession(
  expenses: ReturnType<typeof createLedgerExpenseRepository>,
  collaboration: ReturnType<typeof createLedgerCollaborationRepository>,
  transport: ReturnType<typeof createLedgerExpenseMutationTransport>,
  localId: string,
  serverId: string,
  creator: Member,
  members: Member[],
  record: (name: string, ok: boolean, detail: string) => void,
) {
  await expenses.updateExpense(
    localId,
    command("supersession mine", creator, members, 1700),
    "third offline edit",
  );
  await signInFor("organizer");
  const remote5 = await transport.updateExpense({
    journeyId,
    serverId,
    idempotencyKey: createLocalId("stage4c-remote"),
    baseRevision: 4,
    auditReason: "Create resolution race",
    expense: editableCommand(command("Journey r5", creator, members, 1800)),
  });
  await signInFor("creator");
  await runLedgerExpenseSync({ entityId: localId });
  const old = await collaboration.getOpenConflict(localId);
  await signInFor("organizer");
  const remote6 = await transport.updateExpense({
    journeyId,
    serverId,
    idempotencyKey: createLocalId("stage4c-remote"),
    baseRevision: remote5.revision,
    auditReason: "Advance during conflict resolution",
    expense: editableCommand(command("Journey r6", creator, members, 1900)),
  });
  await signInFor("creator");
  await collaboration.queueConflictResolution(localId, journeyId, {
    conflictId: old!.conflictId,
    currentRevision: remote5.revision,
    resolution: "KEEP_MINE",
    resolvedExpense: JSON.parse(old!.submittedSnapshotJson),
    selectedSources: sources("SUBMITTED"),
    reason: "Resolution that races another revision",
  });
  await runLedgerExpenseSync({ entityId: localId });
  const next = await collaboration.getOpenConflict(localId);
  const previous = await (
    await openDatabase()
  ).getFirstAsync<{ status: string }>(
    "SELECT status FROM ledger_expense_conflicts WHERE conflict_id = ?",
    old!.conflictId,
  );
  record(
    "resolution race supersedes immutable envelope",
    previous?.status === "SUPERSEDED" &&
      next?.conflictId !== old?.conflictId &&
      next?.currentRevision === remote6.revision,
    `${previous?.status ?? "missing"} -> r${next?.currentRevision ?? 0}`,
  );
  const current = JSON.parse(next!.canonicalSnapshotJson) as LedgerExpenseDto;
  await collaboration.queueConflictResolution(localId, journeyId, {
    conflictId: next!.conflictId,
    currentRevision: next!.currentRevision,
    resolution: "KEEP_JOURNEY",
    resolvedExpense: editableDto(current),
    selectedSources: sources("JOURNEY"),
    reason: "Resolve replacement envelope",
  });
  await runLedgerExpenseSync({ entityId: localId });
}

async function verifyCorrections(
  expenses: ReturnType<typeof createLedgerExpenseRepository>,
  collaboration: ReturnType<typeof createLedgerCollaborationRepository>,
  transport: ReturnType<typeof createLedgerExpenseMutationTransport>,
  creator: Member,
  organizer: Member,
  members: Member[],
  record: (name: string, ok: boolean, detail: string) => void,
) {
  await signInFor("organizer");
  const local = await expenses.createExpense(
    command("correction seed", organizer, members),
  );
  await runLedgerExpenseSync({ entityId: local.id });
  const target = await requireExpense(expenses, local.id);
  await signInFor("creator");
  let directMutationRejected = false;
  try {
    await transport.updateExpense({
      journeyId,
      serverId: target.serverId!,
      idempotencyKey: createLocalId("stage4c-forbidden"),
      baseRevision: 1,
      auditReason: null,
      expense: editableCommand(command("forbidden direct edit", organizer, members)),
    });
  } catch (error) {
    directMutationRejected =
      error instanceof ApiClientError && error.code === "TRIP_WRITE_FORBIDDEN";
  }
  record("ordinary member direct mutation rejected", directMutationRejected, "403");

  const proposed = editableCommand(command("accepted correction", organizer, members));
  const acceptedId = await collaboration.createCorrection({
    journeyId,
    expenseId: local.id,
    expenseServerId: target.serverId!,
    baseRevision: 1,
    proposedExpense: proposed,
    reason: "Please correct the title",
    requestedByMemberId: creator.id,
  });
  await runLedgerExpenseSync({ entityId: acceptedId });
  const reopened = createLedgerCollaborationRepository(await openDatabase());
  const [open] = await reopened.listCorrections(local.id);
  record(
    "offline correction proposal survives repository restart",
    open?.status === "OPEN" && Boolean(open.serverId),
    open?.status ?? "missing",
  );
  await signInFor("organizer");
  await reopened.queueCorrectionAction(acceptedId, journeyId, "accept", {
    baseRequestRevision: open.serverRevision,
    resolutionReason: "Accepted after review",
  });
  await runLedgerExpenseSync({ entityId: acceptedId });
  const accepted = (await reopened.listCorrections(local.id)).find(
    (item) => item.id === acceptedId,
  );
  const corrected = await requireExpense(expenses, local.id);
  record(
    "correction acceptance is atomic and audited",
    accepted?.status === "ACCEPTED" &&
      corrected.serverRevision === 2 &&
      corrected.title === proposed.title,
    `${accepted?.status ?? "missing"} r${corrected.serverRevision}`,
  );

  await signInFor("creator");
  const withdrawnId = await createAndSyncCorrection(
    collaboration,
    local.id,
    target.serverId!,
    2,
    { ...proposed, title: `${proposed.title} withdrawn` },
    creator.id,
  );
  const withdrawn = (await collaboration.listCorrections(local.id)).find(
    (item) => item.id === withdrawnId,
  )!;
  await collaboration.queueCorrectionAction(withdrawnId, journeyId, "withdraw", {
    baseRequestRevision: withdrawn.serverRevision,
    resolutionReason: null,
  });
  await runLedgerExpenseSync({ entityId: withdrawnId });

  const rejectedId = await createAndSyncCorrection(
    collaboration,
    local.id,
    target.serverId!,
    2,
    { ...proposed, title: `${proposed.title} rejected` },
    creator.id,
  );
  const rejected = (await collaboration.listCorrections(local.id)).find(
    (item) => item.id === rejectedId,
  )!;
  await signInFor("organizer");
  await collaboration.queueCorrectionAction(rejectedId, journeyId, "reject", {
    baseRequestRevision: rejected.serverRevision,
    resolutionReason: "Not accurate",
  });
  await runLedgerExpenseSync({ entityId: rejectedId });
  const lifecycle = await collaboration.listCorrections(local.id);
  record(
    "withdraw and reject are first-wins terminal states",
    lifecycle.find((item) => item.id === withdrawnId)?.status === "WITHDRAWN" &&
      lifecycle.find((item) => item.id === rejectedId)?.status === "REJECTED",
    "WITHDRAWN + REJECTED",
  );

  await signInFor("creator");
  const staleId = await collaboration.createCorrection({
    journeyId,
    expenseId: local.id,
    expenseServerId: target.serverId!,
    baseRevision: 2,
    proposedExpense: { ...proposed, title: `${proposed.title} stale` },
    reason: "Queued while offline",
    requestedByMemberId: creator.id,
  });
  await signInFor("organizer");
  await transport.updateExpense({
    journeyId,
    serverId: target.serverId!,
    idempotencyKey: createLocalId("stage4c-correction-stale"),
    baseRevision: 2,
    auditReason: "Advance before correction upload",
    expense: { ...proposed, title: `${proposed.title} Journey r3` },
  });
  await signInFor("creator");
  await runLedgerExpenseSync({ entityId: staleId });
  const stale = (await collaboration.listCorrections(local.id)).find(
    (item) => item.id === staleId,
  );
  record("stale offline correction is preserved", stale?.status === "STALE", "STALE");
}

async function createAndSyncCorrection(
  repository: ReturnType<typeof createLedgerCollaborationRepository>,
  expenseId: string,
  expenseServerId: string,
  baseRevision: number,
  proposedExpense: ReturnType<typeof editableCommand>,
  requestedByMemberId: string,
) {
  const id = await repository.createCorrection({
    journeyId,
    expenseId,
    expenseServerId,
    baseRevision,
    proposedExpense,
    reason: "Lifecycle acceptance",
    requestedByMemberId,
  });
  await runLedgerExpenseSync({ entityId: id });
  return id;
}

function command(
  title: string,
  payer: Member,
  members: Member[],
  minor = 1200,
): LedgerExpenseCommand {
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
    title: `Stage 4C ${title} ${new Date().toISOString()}`,
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
      policy: "SAME_CURRENCY",
      original,
      settlement: original,
      rateSnapshotId: null,
      paymentRecordId: null,
      reason: null,
    },
    status: "ACCEPTED",
  };
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

function editableDto(value: LedgerExpenseDto) {
  return {
    ...editableCommand({
      ...value,
      creatorMemberId: value.creatorMemberId,
      status: value.businessStatus === "DELETED" ? "ACCEPTED" : value.businessStatus,
    }),
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

function member(id: string, members: Member[]) {
  const found = members.find((item) => item.id === id);
  if (!found) throw new Error("Acceptance actor member is missing.");
  return found;
}

async function requireExpense(
  repository: ReturnType<typeof createLedgerExpenseRepository>,
  id: string,
): Promise<LedgerExpense> {
  const expense = await repository.getExpense(id);
  if (!expense) throw new Error("Acceptance expense is missing.");
  return expense;
}

async function signInFor(role: "creator" | "organizer") {
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
