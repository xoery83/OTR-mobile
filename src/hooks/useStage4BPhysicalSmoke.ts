import * as FileSystem from "expo-file-system/legacy";
import { useEffect, useState } from "react";

import { signInToSupabaseDev } from "@/data/auth/devSupabaseAuth";
import { openDatabase } from "@/data/db/database";
import { getDefaultLedgerReadRepository } from "@/data/repositories/defaultLedgerReadRepository";
import type { LedgerExpense } from "@/data/repositories/ledgerExpenseRepository";
import { createLedgerExpenseRepository } from "@/data/repositories/ledgerExpenseRepository";
import { createLedgerReadTransport } from "@/data/sync/ledgerReadTransport";
import { runLedgerExpenseSync } from "@/data/sync/ledgerExpenseDemoCoordinator";
import { allocateEqual } from "@/domain/ledger/allocation";
import { createLocalId } from "@/domain/localId";

const journeyId = process.env.EXPO_PUBLIC_OTR_DEV_TRIP_ID ?? "";
const titlePrefix = "Stage 4B physical";
const outputFile = `${FileSystem.documentDirectory}stage4b-physical-smoke.json`;

export type PhysicalSmokeCheck = {
  name: string;
  ok: boolean;
  detail: string;
};

type Member = { id: string; displayName: string };

export function useStage4BPhysicalSmoke() {
  const [checks, setChecks] = useState<PhysicalSmokeCheck[]>([]);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    void FileSystem.writeAsStringAsync(
      outputFile,
      JSON.stringify({ checks, running, updatedAt: new Date().toISOString() }, null, 2),
    );
  }, [checks, running]);

  const record = (name: string, ok: boolean, detail: string) => {
    console.info("[Stage4BPhysicalSmoke]", ok ? "PASS" : "FAIL", name, detail);
    setChecks((items) => [...items, { name, ok, detail }]);
    if (!ok) throw new Error(`${name}: ${detail}`);
  };

  const runStep = async (step: () => Promise<void>) => {
    setRunning(true);
    try {
      await step();
    } catch (error) {
      setChecks((items) => [
        ...items,
        {
          name: "physical smoke stopped",
          ok: false,
          detail: error instanceof Error ? error.message : "unknown failure",
        },
      ]);
    } finally {
      setRunning(false);
    }
  };

  return {
    checks,
    running,
    reset: () => setChecks([]),
    runOnlineSmoke: () =>
      runStep(async () => {
        const { creator, members } = await bootstrap(record);
        const repository = createLedgerExpenseRepository(await openDatabase());

        const synced = await createSyncedExpense(repository, creator, members, "online");
        await repository.updateExpense(
          synced.id,
          command("creator edit", creator, members),
          "",
        );
        await runLedgerExpenseSync({ entityId: synced.id });
        const edited = await repository.getExpense(synced.id);
        record("creator edit of synced expense", edited?.serverRevision === 2, `r${edited?.serverRevision ?? 0}`);

        await repository.tombstoneExpense(synced.id, "Physical smoke tombstone");
        await runLedgerExpenseSync({ entityId: synced.id });
        const deleted = await repository.getExpense(synced.id);
        record("tombstone/delete sync", deleted?.status === "DELETED", deleted?.status ?? "missing");

        await repository.restoreExpense(synced.id, "ACCEPTED", "Physical smoke restore");
        await runLedgerExpenseSync({ entityId: synced.id });
        const restored = await repository.getExpense(synced.id);
        record("restore sync", restored?.status === "ACCEPTED" && restored.serverRevision === 4, `${restored?.status ?? "missing"} r${restored?.serverRevision ?? 0}`);

        await (await getDefaultLedgerReadRepository()).applyBootstrap(
          await createLedgerReadTransport().bootstrap(journeyId),
        );
        const auditCount = await localAuditCount(restored!.serverId!);
        record("canonical audit after pull", auditCount >= 1, `${auditCount} events`);

        const created = await createSyncedExpense(repository, creator, members, "stage4a-create");
        record("Stage 4A create still works", created.serverRevision === 1, `r${created.serverRevision}`);

        await organizerSmoke(repository, creator, members, record);
        await sqliteIntegrity(record);
      }),
    prepareOfflineTarget: () =>
      runStep(async () => {
        const { creator, members } = await bootstrap(record);
        const repository = createLedgerExpenseRepository(await openDatabase());
        const target = await createSyncedExpense(
          repository,
          creator,
          members,
          "offline target",
        );
        record("offline target prepared", Boolean(target.serverId), target.id);
      }),
    runOfflineEditAttempt: () =>
      runStep(async () => {
        const repository = createLedgerExpenseRepository(await openDatabase());
        const target = await findOfflineTarget(repository);
        await repository.updateExpense(
          target.id,
          commandFromExpense(target, "offline edited"),
          "",
        );
        await runLedgerExpenseSync({ entityId: target.id });
        const local = await repository.getExpense(target.id);
        record(
          "offline edit persisted locally",
          local?.syncStatus === "FAILED" || local?.syncStatus === "PENDING_UPDATE",
          `${local?.syncStatus ?? "missing"} r${local?.serverRevision ?? 0}`,
        );
      }),
    reconnectOfflineEdit: () =>
      runStep(async () => {
        await bootstrap(record);
        const repository = createLedgerExpenseRepository(await openDatabase());
        const target = await findOfflineTarget(repository);
        await runLedgerExpenseSync({ entityId: target.id });
        const synced = await repository.getExpense(target.id);
        record(
          "cold launch reconnect ordered sync",
          synced?.syncStatus === "SYNCED" && synced.serverRevision === 2,
          `${synced?.syncStatus ?? "missing"} r${synced?.serverRevision ?? 0}`,
        );
        await sqliteIntegrity(record);
      }),
  };
}

async function bootstrap(record: (name: string, ok: boolean, detail: string) => void) {
  if (!journeyId) record("configured Journey", false, "missing trip id");
  await signInFor("creator");
  const bootstrap = await createLedgerReadTransport().bootstrap(journeyId);
  const members = bootstrap.members.slice(0, 2);
  record("authenticated /v2 bootstrap", members.length >= 1, `${members.length} members`);
  return { creator: members[0], members };
}

async function signInFor(role: "creator" | "organizer") {
  const email =
    role === "creator"
      ? process.env.EXPO_PUBLIC_OTR_STAGE4B_CREATOR_EMAIL
      : process.env.EXPO_PUBLIC_OTR_STAGE4B_ORGANIZER_EMAIL;
  const password =
    role === "creator"
      ? process.env.EXPO_PUBLIC_OTR_STAGE4B_CREATOR_PASSWORD
      : process.env.EXPO_PUBLIC_OTR_STAGE4B_ORGANIZER_PASSWORD;
  if (email && password) await signInToSupabaseDev(email, password);
}

function command(label: string, payer: Member, members: Member[]) {
  const original = { minor: 1200, currency: "NZD", scale: 2 };
  return {
    journeyId,
    creatorMemberId: payer.id,
    payerMemberId: payer.id,
    title: `${titlePrefix} ${label} ${new Date().toISOString()}`,
    description: null,
    category: "food",
    occurredAt: new Date().toISOString(),
    original,
    participants: members.map((member) => ({
      memberId: member.id,
      displayNameSnapshot: member.displayName,
      householdIdSnapshot: null,
    })),
    splits: allocateEqual(original.minor, original.minor, members.map((member) => member.id)),
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
  };
}

async function createSyncedExpense(
  repository: ReturnType<typeof createLedgerExpenseRepository>,
  creator: Member,
  members: Member[],
  label: string,
) {
  const expense = await repository.createExpense(command(label, creator, members));
  await runLedgerExpenseSync({ entityId: expense.id });
  const synced = await repository.getExpense(expense.id);
  if (!synced?.serverId) throw new Error("create sync failed");
  return synced;
}

async function findOfflineTarget(
  repository: ReturnType<typeof createLedgerExpenseRepository>,
) {
  const rows = await repository.listExpensesForJourney(journeyId, true);
  const target = rows.find((expense) => expense.title.includes("offline"));
  if (!target) throw new Error("offline target missing");
  return target;
}

function commandFromExpense(expense: LedgerExpense, label: string) {
  return {
    journeyId: expense.journeyId,
    creatorMemberId: expense.creatorMemberId,
    payerMemberId: expense.payerMemberId,
    title: `${titlePrefix} ${label} ${new Date().toISOString()}`,
    description: expense.description,
    category: expense.category,
    occurredAt: expense.occurredAt,
    original: expense.original,
    participants: expense.participants,
    splits: expense.splits,
    valuation: expense.valuation,
    status: "ACCEPTED" as const,
  };
}

async function localAuditCount(serverId: string) {
  const database = await openDatabase();
  const row = await database.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) AS count FROM ledger_expense_audit_events WHERE expense_id = ?",
    serverId,
  );
  return row?.count ?? 0;
}

async function organizerSmoke(
  repository: ReturnType<typeof createLedgerExpenseRepository>,
  creator: Member,
  members: Member[],
  record: (name: string, ok: boolean, detail: string) => void,
) {
  if (!process.env.EXPO_PUBLIC_OTR_STAGE4B_ORGANIZER_EMAIL) return;
  const target = await createSyncedExpense(repository, creator, members, "organizer");
  await signInFor("organizer");
  await repository.updateExpense(
    target.id,
    command("organizer override", creator, members),
    "Physical smoke organizer override",
  );
  await runLedgerExpenseSync({ entityId: target.id });
  const updated = await repository.getExpense(target.id);
  record("organizer override smoke", updated?.serverRevision === 2, `r${updated?.serverRevision ?? 0}`);
  await signInFor("creator");
}

async function sqliteIntegrity(
  record: (name: string, ok: boolean, detail: string) => void,
) {
  const database = await openDatabase();
  const row = await database.getFirstAsync<{ integrity_check: string }>(
    "PRAGMA integrity_check",
  );
  record("SQLite integrity", row?.integrity_check === "ok", row?.integrity_check ?? "missing");
}
