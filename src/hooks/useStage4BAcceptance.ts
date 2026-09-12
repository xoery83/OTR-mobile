import { useEffect, useState } from "react";
import { z } from "zod";

import { ApiClientError, createApiClient } from "@/data/api/client";
import { signInToSupabaseDev } from "@/data/auth/devSupabaseAuth";
import { readLocalSession } from "@/data/auth/authRepository";
import { openDatabase } from "@/data/db/database";
import { getDefaultLedgerReadRepository } from "@/data/repositories/defaultLedgerReadRepository";
import { createLedgerExpenseRepository } from "@/data/repositories/ledgerExpenseRepository";
import { createLedgerExpenseMutationTransport } from "@/data/sync/ledgerExpenseMutationTransport";
import { runLedgerExpenseSync } from "@/data/sync/ledgerExpenseDemoCoordinator";
import { createLedgerReadTransport } from "@/data/sync/ledgerReadTransport";
import { allocateEqual } from "@/domain/ledger/allocation";
import { createLocalId } from "@/domain/localId";

const journeyId = process.env.EXPO_PUBLIC_OTR_DEV_TRIP_ID ?? "";

export type Stage4BCheck = {
  name: string;
  ok: boolean;
  detail: string;
};

type Member = { id: string; displayName: string };

export function useStage4BAcceptance() {
  const [checks, setChecks] = useState<Stage4BCheck[]>([]);

  useEffect(() => {
    let cancelled = false;
    const record = (name: string, ok: boolean, detail: string) => {
      if (!cancelled) setChecks((items) => [...items, { name, ok, detail }]);
      if (!ok) throw new Error(`${name}: ${detail}`);
    };

    void Promise.resolve()
      .then(async () => {
        if (!journeyId) record("configured Journey", false, "missing trip id");
        await signInFor("creator");
        const session = await readLocalSession();
        record(
          "authenticated Dev session",
          Boolean(session?.accessToken),
          session?.accessToken ? "session available" : "missing acceptance credentials",
        );
        const bootstrap = await createLedgerReadTransport().bootstrap(journeyId);
        await (await getDefaultLedgerReadRepository()).applyBootstrap(bootstrap);
        const members = bootstrap.members.slice(0, 2);
        record("bootstrap members", members.length >= 1, `${members.length}`);

        const creator = members[0];
        const repository = createLedgerExpenseRepository(await openDatabase());
        const synced = await createSyncedExpense(repository, creator, members);
        const edited = await repository.updateExpense(
          synced.id,
          command("creator synced edit", creator, members),
          "",
        );
        await runLedgerExpenseSync({ entityId: edited.id });
        const afterEdit = await repository.getExpense(edited.id);
        record(
          "synced creator edit",
          afterEdit?.serverRevision === 2,
          `r${afterEdit?.serverRevision ?? 0}`,
        );

        await repository.tombstoneExpense(edited.id, "Stage 4B tombstone");
        await runLedgerExpenseSync({ entityId: edited.id });
        const deleted = await repository.getExpense(edited.id);
        record("tombstone", deleted?.status === "DELETED", deleted?.status ?? "missing");

        await repository.restoreExpense(edited.id, "ACCEPTED", "Stage 4B restore");
        await runLedgerExpenseSync({ entityId: edited.id });
        const restored = await repository.getExpense(edited.id);
        record(
          "restore",
          restored?.status === "ACCEPTED" && restored.serverRevision === 4,
          `${restored?.status ?? "missing"} r${restored?.serverRevision ?? 0}`,
        );

        const pending = await repository.createExpense(
          command("pending create then edit", creator, members),
        );
        await repository.updateExpense(
          pending.id,
          command("dependent edit after pending create", creator, members),
          "",
        );
        await runLedgerExpenseSync({ entityId: pending.id });
        const chained = await repository.getExpense(pending.id);
        record(
          "pending CREATE then offline EDIT",
          Boolean(chained?.serverId && chained.serverRevision === 2),
          `${chained?.serverId ?? "none"} r${chained?.serverRevision ?? 0}`,
        );

        const ambiguous = await repository.createExpense(
          command("ambiguous create then edit", creator, members),
        );
        let loseOnce = true;
        await runLedgerExpenseSync({
          entityId: ambiguous.id,
          simulateResponseLoss: () => {
            const value = loseOnce;
            loseOnce = false;
            return value;
          },
        });
        await repository.updateExpense(
          ambiguous.id,
          command("edit after ambiguous create", creator, members),
          "",
        );
        await runLedgerExpenseSync({ entityId: ambiguous.id });
        const reconciled = await repository.getExpense(ambiguous.id);
        record(
          "ambiguous CREATE then later mutation",
          Boolean(reconciled?.serverId && reconciled.serverRevision === 2),
          `${reconciled?.serverId ?? "none"} r${reconciled?.serverRevision ?? 0}`,
        );

        let staleConflict = false;
        try {
          await createLedgerExpenseMutationTransport().updateExpense({
            journeyId,
            serverId: reconciled!.serverId!,
            idempotencyKey: createLocalId("stage4b-stale"),
            baseRevision: 1,
            auditReason: null,
            expense: request(command("stale edit", creator, members)),
          });
        } catch (error) {
          staleConflict =
            error instanceof ApiClientError && error.code === "REVISION_CONFLICT";
        }
        record("stale baseRevision conflict", staleConflict, "REVISION_CONFLICT");

        const pulled = await createLedgerReadTransport().bootstrap(journeyId);
        await (await getDefaultLedgerReadRepository()).applyBootstrap(pulled);
        const auditCount = await canonicalAuditCount(reconciled!.serverId!);
        record("canonical server audit pull", auditCount >= 2, `${auditCount} events`);

        await runOrganizerChecks(repository, creator, members, record);
      })
      .catch((error) => {
        if (!cancelled) {
          setChecks((items) => [
            ...items,
            {
              name: "Stage 4B acceptance stopped",
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

async function signInFor(role: "creator" | "organizer") {
  const prefix = role === "creator" ? "CREATOR" : "ORGANIZER";
  const email =
    process.env[`EXPO_PUBLIC_OTR_STAGE4B_${prefix}_EMAIL`] ??
    process.env.EXPO_PUBLIC_OTR_STAGE3_ACCEPTANCE_EMAIL ??
    "";
  const password =
    process.env[`EXPO_PUBLIC_OTR_STAGE4B_${prefix}_PASSWORD`] ??
    process.env.EXPO_PUBLIC_OTR_STAGE3_ACCEPTANCE_PASSWORD ??
    "";
  if (email && password) await signInToSupabaseDev(email, password);
}

function command(title: string, payer: Member, members: Member[]) {
  const original = { minor: 1200, currency: "NZD", scale: 2 };
  return {
    journeyId,
    creatorMemberId: payer.id,
    payerMemberId: payer.id,
    title: `Stage 4B ${title} ${new Date().toISOString()}`,
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
      original.minor,
      members.map((member) => member.id),
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
  };
}

function request(commandValue: ReturnType<typeof command>) {
  return {
    title: commandValue.title,
    description: commandValue.description,
    category: commandValue.category,
    occurredAt: commandValue.occurredAt,
    payerMemberId: commandValue.payerMemberId,
    original: commandValue.original,
    businessStatus: commandValue.status,
    participants: commandValue.participants,
    splits: commandValue.splits,
    valuation: commandValue.valuation,
  };
}

async function createSyncedExpense(
  repository: ReturnType<typeof createLedgerExpenseRepository>,
  creator: Member,
  members: Member[],
) {
  const expense = await repository.createExpense(
    command("synced creator", creator, members),
  );
  await runLedgerExpenseSync({ entityId: expense.id });
  const synced = await repository.getExpense(expense.id);
  if (!synced?.serverId) throw new Error("create sync failed");
  return synced;
}

async function runOrganizerChecks(
  repository: ReturnType<typeof createLedgerExpenseRepository>,
  creator: Member,
  members: Member[],
  record: (name: string, ok: boolean, detail: string) => void,
) {
  const organizerEmail = process.env.EXPO_PUBLIC_OTR_STAGE4B_ORGANIZER_EMAIL ?? "";
  const organizerPassword = process.env.EXPO_PUBLIC_OTR_STAGE4B_ORGANIZER_PASSWORD ?? "";
  if (!organizerEmail || !organizerPassword) {
    record("organizer two-identity checks", false, "missing Stage 4B organizer env");
    return;
  }
  const target = await createSyncedExpense(repository, creator, members);
  await signInFor("organizer");
  const transport = createLedgerExpenseMutationTransport();
  let missingReasonRejected = false;
  try {
    await transport.updateExpense({
      journeyId,
      serverId: target.serverId!,
      idempotencyKey: createLocalId("stage4b-organizer-missing"),
      baseRevision: target.serverRevision,
      auditReason: null,
      expense: request(command("organizer missing reason", creator, members)),
    });
  } catch (error) {
    missingReasonRejected =
      error instanceof ApiClientError && error.code === "INVALID_PAYLOAD";
  }
  record(
    "organizer edit without reason rejected",
    missingReasonRejected,
    "INVALID_PAYLOAD",
  );

  const updated = await transport.updateExpense({
    journeyId,
    serverId: target.serverId!,
    idempotencyKey: createLocalId("stage4b-organizer-edit"),
    baseRevision: target.serverRevision,
    auditReason: "Stage 4B organizer edit",
    expense: request(command("organizer edit with reason", creator, members)),
  });
  record("organizer edit with reason", updated.revision === 2, `r${updated.revision}`);

  let deleteMissingReasonRejected = false;
  try {
    await transport.deleteExpense({
      journeyId,
      serverId: target.serverId!,
      idempotencyKey: createLocalId("stage4b-organizer-delete-missing"),
      baseRevision: updated.revision,
      auditReason: null,
    });
  } catch (error) {
    deleteMissingReasonRejected =
      error instanceof ApiClientError && error.code === "INVALID_PAYLOAD";
  }
  record(
    "organizer delete without reason rejected",
    deleteMissingReasonRejected,
    "INVALID_PAYLOAD",
  );

  const deleted = await transport.deleteExpense({
    journeyId,
    serverId: target.serverId!,
    idempotencyKey: createLocalId("stage4b-organizer-delete"),
    baseRevision: updated.revision,
    auditReason: "Stage 4B organizer delete",
  });
  const restored = await transport.restoreExpense({
    journeyId,
    serverId: target.serverId!,
    idempotencyKey: createLocalId("stage4b-organizer-restore"),
    baseRevision: deleted.revision,
    auditReason: "Stage 4B organizer restore",
    businessStatus: "ACCEPTED",
  });
  record(
    "organizer delete and restore with reasons",
    restored.revision === 4,
    `r${restored.revision}`,
  );

  const session = await readLocalSession();
  if (!session?.accessToken) throw new Error("missing organizer session");
  await createApiClient({ accessToken: session.accessToken }).post(
    `/v2/dev/trips/${journeyId}/expenses/${target.serverId}/finalized-guard-fixture`,
    {},
    z.object({ ok: z.literal(true) }),
  );
  const changedAfterFinalization = await transport.deleteExpense({
    journeyId,
    serverId: target.serverId!,
    idempotencyKey: createLocalId("stage4b-post-finalized-change"),
    baseRevision: restored.revision,
    auditReason: "Stage 7.2B Adjustment-required change",
  });
  record(
    "post-finalization mutation requires Adjustment",
    changedAfterFinalization.revision === 5,
    `r${changedAfterFinalization.revision}`,
  );
}

async function canonicalAuditCount(serverId: string) {
  const database = await openDatabase();
  const expense = await database.getFirstAsync<{ id: string }>(
    "SELECT id FROM ledger_expenses WHERE id = ? OR server_id = ? LIMIT 1",
    serverId,
    serverId,
  );
  if (!expense) return 0;
  const row = await database.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) AS count FROM ledger_expense_audit_events WHERE expense_id = ?",
    expense.id,
  );
  return row?.count ?? 0;
}
