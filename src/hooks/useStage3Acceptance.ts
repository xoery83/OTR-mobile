import * as FileSystem from "expo-file-system/legacy";
import { useEffect, useState } from "react";

import { signInToSupabaseDev } from "@/data/auth/devSupabaseAuth";
import { openDatabase } from "@/data/db/database";
import { getSchemaVersion, type MigrationDatabase } from "@/data/db/migrationRunner";
import { getDefaultLedgerExpenseRepository } from "@/data/repositories/defaultLedgerExpenseRepository";
import type { LedgerExpenseCommand } from "@/data/repositories/ledgerExpenseRepository";
import { getDefaultLedgerReadRepository } from "@/data/repositories/defaultLedgerReadRepository";
import type { LedgerReadDatabase } from "@/data/repositories/ledgerReadRepository";
import { createLedgerReadTransport } from "@/data/sync/ledgerReadTransport";

export type Stage3AcceptanceCheck = { name: string; ok: boolean; detail: string };

const outputFile = `${FileSystem.documentDirectory}stage3-acceptance.json`;
const enabled = process.env.EXPO_PUBLIC_OTR_STAGE3_ACCEPTANCE === "1";
const journeyId = process.env.EXPO_PUBLIC_OTR_DEV_TRIP_ID ?? "";
const memberId = process.env.EXPO_PUBLIC_OTR_STAGE3_MEMBER_ID ?? "";
const unauthorizedJourneyId =
  process.env.EXPO_PUBLIC_OTR_STAGE3_UNAUTHORIZED_TRIP_ID ?? "";

export function useStage3Acceptance(mode: string) {
  const [checks, setChecks] = useState<Stage3AcceptanceCheck[]>([]);

  useEffect(() => {
    void runAcceptance(mode).then(setChecks);
  }, [mode]);

  return checks;
}

async function runAcceptance(mode: string) {
  const checks: Stage3AcceptanceCheck[] = [];
  const record = (name: string, ok: boolean, detail: string) =>
    checks.push({ name, ok, detail });

  if (!enabled) {
    record("enabled", false, "EXPO_PUBLIC_OTR_STAGE3_ACCEPTANCE is not enabled.");
    await writeChecks(mode, checks);
    return checks;
  }

  try {
    const email = process.env.EXPO_PUBLIC_OTR_STAGE3_ACCEPTANCE_EMAIL ?? "";
    const password = process.env.EXPO_PUBLIC_OTR_STAGE3_ACCEPTANCE_PASSWORD ?? "";
    const readRepository = await getDefaultLedgerReadRepository();
    const transport = createLedgerReadTransport();

    if (mode !== "inspect") {
      await signInToSupabaseDev(email, password);
      record("authenticated Dev backend reads", true, "signed in");
    }

    if (mode === "unauthorized") {
      try {
        await transport.bootstrap(unauthorizedJourneyId);
        record("unauthorized Journey rejection", false, "request unexpectedly succeeded");
      } catch {
        record("unauthorized Journey rejection", true, "rejected");
      }
      await writeChecks(mode, checks);
      return checks;
    }

    if (mode === "inspect") {
      await inspectSqlite(record);
      record(
        "offline cold start from SQLite",
        true,
        "app launched and read SQLite cache",
      );
      await writeChecks(mode, checks);
      return checks;
    }

    const bootstrap = await transport.bootstrap(journeyId);
    if (mode === "bootstrap") {
      await readRepository.applyBootstrap(bootstrap);
      record(
        "fresh-device bootstrap",
        bootstrap.journey.id === journeyId,
        `${bootstrap.expenses.length} expenses`,
      );
      const hydrated = await journeyHydrationCount();
      record(
        "Journey Ledger SQLite hydration",
        hydrated > 0,
        `${hydrated} journey/member rows`,
      );

      const myLedger = await transport.myLedger();
      await readRepository.cacheMyLedger(myLedger);
      const summaries = await readRepository.listMyLedgerSummaries();
      record("My Ledger cache", summaries.length > 0, `${summaries.length} summaries`);
    }

    const beforeCursor = (await readRepository.getCursor(journeyId))?.cursor ?? null;
    const pull = await transport.pull(journeyId, beforeCursor);
    await readRepository.applyChanges(journeyId, pull);
    const afterCursor = (await readRepository.getCursor(journeyId))?.cursor ?? null;
    record(
      "incremental pull and opaque cursor persistence",
      Boolean(afterCursor),
      `${beforeCursor ?? "none"} -> ${afterCursor ?? "none"}`,
    );

    if (mode === "defer") {
      await createPendingLocalAggregate();
      const deferredCount = await deferredServerChangeCount();
      record(
        "pending local aggregate protection",
        deferredCount > 0,
        `${deferredCount} deferred changes`,
      );
    }

    await inspectSqlite(record);
  } catch (error) {
    record("acceptance run", false, error instanceof Error ? error.message : "unknown");
  }

  await writeChecks(mode, checks);
  return checks;
}

async function inspectSqlite(
  record: (name: string, ok: boolean, detail: string) => void,
) {
  const database = await openDatabase();
  const integrity = await (database as unknown as LedgerReadDatabase).getFirstAsync<{
    integrity_check: string;
  }>("PRAGMA integrity_check");
  const schemaVersion = await getSchemaVersion(database as unknown as MigrationDatabase);
  const readRepository = await getDefaultLedgerReadRepository();
  const cursor = await readRepository.getCursor(journeyId);
  const summaries = await readRepository.listMyLedgerSummaries();
  record(
    "SQLite integrity/schema/cursor/cache state",
    integrity?.integrity_check === "ok" &&
      schemaVersion >= 6 &&
      Boolean(cursor?.cursor) &&
      summaries.length > 0,
    `integrity=${integrity?.integrity_check ?? "unknown"} schema=${schemaVersion} summaries=${summaries.length}`,
  );
}

async function createPendingLocalAggregate() {
  const repository = await getDefaultLedgerExpenseRepository();
  const readRepository = await getDefaultLedgerReadRepository();
  const currentCursor = (await readRepository.getCursor(journeyId))?.cursor;
  const now = Date.now();
  const command: LedgerExpenseCommand = {
    journeyId,
    creatorMemberId: memberId,
    payerMemberId: memberId,
    title: "Stage 3 local pending protection",
    description: null,
    category: "transport",
    occurredAt: new Date().toISOString(),
    original: { minor: 4321, currency: "NZD", scale: 2 },
    participants: [
      { memberId, displayNameSnapshot: "Stage 3 Member", householdIdSnapshot: null },
    ],
    splits: [
      {
        memberId,
        method: "EQUAL_PERSON",
        originalMinor: 4321,
        settlementMinor: 4321,
        weightUnits: null,
        percentageUnits: null,
        roundingAdjustmentMinor: 0,
      },
    ],
    valuation: {
      id: `stage3-valuation-${now}`,
      policy: "SAME_CURRENCY",
      original: { minor: 4321, currency: "NZD", scale: 2 },
      settlement: { minor: 4321, currency: "NZD", scale: 2 },
      rateSnapshotId: null,
      paymentRecordId: null,
      reason: "Stage 3 acceptance",
    },
    paymentRecords: [],
    status: "ACCEPTED",
  };
  const created = await repository.createExpense(command);
  const serverId = "50000000-0000-4000-8000-000000000001";
  await repository.markExpenseSynced(created.id, serverId, 1);
  await repository.updateExpense(
    created.id,
    { ...command, title: "Stage 3 local pending protection edited" },
    "Stage 3 deferred check",
  );
  await readRepository.applyChanges(journeyId, {
    cursor: currentCursor ?? `stage3-deferred-${now}`,
    serverTime: new Date().toISOString(),
    changes: [
      {
        entityType: "EXPENSE",
        entityId: serverId,
        revision: 2,
        isTombstone: false,
        aggregate: {
          id: serverId,
          journeyId,
          creatorMemberId: memberId,
          payerMemberId: memberId,
          title: "Stage 3 canonical server revision",
          description: null,
          category: "transport",
          occurredAt: command.occurredAt,
          original: command.original,
          businessStatus: "ACCEPTED",
          revision: 2,
          deletedAt: null,
          createdAt: command.occurredAt,
          updatedAt: new Date().toISOString(),
          participants: command.participants,
          splits: command.splits,
          valuation: command.valuation,
          paymentRecords: [],
          auditEvents: [],
        },
      },
    ],
  });
}

async function deferredServerChangeCount() {
  const database = await openDatabase();
  const row = await (database as unknown as LedgerReadDatabase).getFirstAsync<{
    count: number;
  }>("SELECT COUNT(*) AS count FROM ledger_deferred_server_changes");
  return row?.count ?? 0;
}

async function journeyHydrationCount() {
  const database = await openDatabase();
  const journey = await (database as unknown as LedgerReadDatabase).getFirstAsync<{
    count: number;
  }>("SELECT COUNT(*) AS count FROM ledger_journeys WHERE journey_id = ?", journeyId);
  const members = await (database as unknown as LedgerReadDatabase).getFirstAsync<{
    count: number;
  }>("SELECT COUNT(*) AS count FROM ledger_members WHERE journey_id = ?", journeyId);
  return (journey?.count ?? 0) + (members?.count ?? 0);
}

async function writeChecks(mode: string, checks: Stage3AcceptanceCheck[]) {
  await FileSystem.writeAsStringAsync(
    outputFile,
    JSON.stringify({ mode, createdAt: new Date().toISOString(), checks }, null, 2),
  );
}
