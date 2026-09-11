import { useEffect, useState } from "react";

import { ApiClientError, createApiClient } from "@/data/api/client";
import {
  ledgerExpenseMutationResponseSchema,
  type CreateLedgerExpenseRequest,
} from "@/data/api/ledgerMutationContracts";
import { signInToSupabaseDev } from "@/data/auth/devSupabaseAuth";
import { openDatabase } from "@/data/db/database";
import { createLedgerExpenseRepository } from "@/data/repositories/ledgerExpenseRepository";
import { getDefaultLedgerReadRepository } from "@/data/repositories/defaultLedgerReadRepository";
import { createLedgerExpenseMutationTransport } from "@/data/sync/ledgerExpenseMutationTransport";
import { runLedgerExpenseCreateSync } from "@/data/sync/ledgerExpenseDemoCoordinator";
import { createLedgerReadTransport } from "@/data/sync/ledgerReadTransport";
import { readLocalSession } from "@/data/auth/authRepository";
import { allocateEqual, allocateEqualHousehold } from "@/domain/ledger/allocation";
import { createLocalId } from "@/domain/localId";

const journeyId = process.env.EXPO_PUBLIC_OTR_DEV_TRIP_ID ?? "";

export type Stage4ACheck = {
  name: string;
  ok: boolean;
  detail: string;
};

export function useStage4AAcceptance() {
  const [checks, setChecks] = useState<Stage4ACheck[]>([]);

  useEffect(() => {
    let cancelled = false;
    const record = (name: string, ok: boolean, detail: string) => {
      if (!cancelled) setChecks((items) => [...items, { name, ok, detail }]);
      if (!ok) throw new Error(`${name}: ${detail}`);
    };

    void Promise.resolve()
      .then(async () => {
        if (!journeyId) record("configured Journey", false, "missing trip id");
        const email = process.env.EXPO_PUBLIC_OTR_STAGE3_ACCEPTANCE_EMAIL ?? "";
        const password = process.env.EXPO_PUBLIC_OTR_STAGE3_ACCEPTANCE_PASSWORD ?? "";
        if (email && password) {
          await signInToSupabaseDev(email, password);
          record("authenticated Dev session", true, "signed in");
        } else {
          record("authenticated Dev session", true, "using existing local session");
        }

        const bootstrap = await createLedgerReadTransport().bootstrap(journeyId);
        await (await getDefaultLedgerReadRepository()).applyBootstrap(bootstrap);
        record(
          "bootstrap members",
          bootstrap.members.length > 0,
          `${bootstrap.members.length}`,
        );

        const equalPerson = allocateEqual(1200, null, ["a1", "a2", "b1"]);
        const equalHousehold = allocateEqualHousehold(1200, null, [
          { memberId: "a1", householdId: "h1" },
          { memberId: "a2", householdId: "h1" },
          { memberId: "b1", householdId: "h2" },
        ]);
        record(
          "equal-household differs from equal-person",
          equalPerson.map((split) => split.originalMinor).join(",") === "400,400,400" &&
            equalHousehold.map((split) => split.originalMinor).join(",") ===
              "300,300,600",
          "1200 -> equal person 400/400/400, household 300/300/600",
        );

        const members = bootstrap.members.slice(0, 2);
        const original = { minor: 1200, currency: "NZD", scale: 2 };
        const request: CreateLedgerExpenseRequest = {
          localId: createLocalId("stage4a"),
          title: `Stage 4A acceptance ${new Date().toISOString()}`,
          description: null,
          category: "food",
          occurredAt: new Date().toISOString(),
          payerMemberId: members[0].id,
          original,
          businessStatus: "ACCEPTED",
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
            policy: "SAME_CURRENCY",
            original,
            settlement: original,
            rateSnapshotId: null,
            paymentRecordId: null,
            reason: null,
          },
        };
        const repository = createLedgerExpenseRepository(await openDatabase());
        const local = await repository.createExpense({
          journeyId,
          creatorMemberId: members[0].id,
          payerMemberId: request.payerMemberId,
          title: request.title,
          description: request.description,
          category: request.category,
          occurredAt: request.occurredAt,
          original,
          participants: request.participants,
          splits: request.splits,
          valuation: {
            id: createLocalId("ledger-valuation"),
            ...request.valuation!,
          },
          status: "ACCEPTED",
        });
        record("local-first create", local.syncStatus === "PENDING_CREATE", local.id);

        const restarted = await createLedgerExpenseRepository(
          await openDatabase(),
        ).getExpense(local.id);
        record(
          "restart-safe local read",
          restarted?.syncStatus === "PENDING_CREATE",
          restarted?.id ?? "missing",
        );

        let loseOnce = true;
        await runLedgerExpenseCreateSync({
          entityId: local.id,
          simulateResponseLoss: () => {
            const value = loseOnce;
            loseOnce = false;
            return value;
          },
        });
        const afterLoss = await repository.getExpense(local.id);
        record(
          "ambiguous response loss keeps local row",
          afterLoss?.syncStatus === "FAILED",
          afterLoss?.syncStatus ?? "missing",
        );

        await runLedgerExpenseCreateSync({ entityId: local.id });
        const synced = await repository.getExpense(local.id);
        record(
          "retry reconciles canonical server id",
          Boolean(synced?.serverId && synced.serverRevision === 1),
          `${synced?.serverId ?? "none"} r${synced?.serverRevision ?? 0}`,
        );
        const session = await readLocalSession();
        if (!session?.accessToken) {
          record("duplicate idempotent replay", false, "missing session");
          return;
        }
        const operation = await (
          await openDatabase()
        ).getFirstAsync<{
          idempotencyKey: string;
          payloadJson: string;
        }>(
          `SELECT idempotency_key AS idempotencyKey, payload_json AS payloadJson
           FROM sync_operations
           WHERE entity_type = ? AND entity_id = ? AND operation_type = ?`,
          "ledger_expense",
          local.id,
          "LEDGER_CREATE_EXPENSE",
        );
        const payload = JSON.parse(operation!.payloadJson) as {
          expense: Omit<CreateLedgerExpenseRequest, "localId">;
        };
        const replayRequest: CreateLedgerExpenseRequest = {
          localId: local.id,
          ...payload.expense,
        };
        const replay = await createLedgerExpenseMutationTransport({
          readSession: async () => session,
        }).createExpense({
          journeyId,
          idempotencyKey: operation!.idempotencyKey,
          expense: replayRequest,
        });
        record(
          "duplicate idempotent replay",
          replay.serverId === synced?.serverId && replay.idempotentReplay,
          `${replay.serverId} replay=${replay.idempotentReplay}`,
        );

        let conflict = false;
        try {
          await createApiClient({ accessToken: session.accessToken }).post(
            `/v2/trips/${journeyId}/expenses`,
            { ...replayRequest, title: `${request.title} changed` },
            ledgerExpenseMutationResponseSchema,
            { "Idempotency-Key": operation!.idempotencyKey },
          );
        } catch (error) {
          conflict =
            error instanceof ApiClientError
              ? error.status === 409
              : error instanceof Error && error.message.includes("409");
        }
        record("same key different payload rejected", conflict, "409 expected");
      })
      .catch((error) => {
        if (!cancelled) {
          setChecks((items) => [
            ...items,
            {
              name: "Stage 4A acceptance stopped",
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
