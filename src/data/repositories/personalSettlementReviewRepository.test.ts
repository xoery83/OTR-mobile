import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";

import type { PersonalSettlementReviewResponse } from "@/data/api/ledgerSettlementContracts";
import { migrations } from "@/data/db/migrations";

import { createPersonalSettlementReviewRepository } from "./personalSettlementReviewRepository";

const journeyId = "20000000-0000-4000-8000-000000000001";
const userA = "40000000-0000-4000-8000-000000000001";
const userB = "40000000-0000-4000-8000-000000000002";

function database() {
  const db = new DatabaseSync(":memory:");
  for (const migration of migrations) db.exec(migration.sql);
  return {
    db,
    api: {
      async withTransactionAsync(task: () => Promise<void>) {
        await task();
      },
      async runAsync(sql: string, ...args: unknown[]) {
        return db.prepare(sql).run(...(args as never[]));
      },
      async getFirstAsync<T>(sql: string, ...args: unknown[]) {
        return (db.prepare(sql).get(...(args as never[])) ?? null) as T | null;
      },
    },
  };
}

function response(fingerprint = "a".repeat(64)): PersonalSettlementReviewResponse {
  return {
    statement: {
      journeyId,
      memberId: "50000000-0000-4000-8000-000000000001",
      currency: "NZD",
      scale: 2,
      settingsRevision: 1,
      algorithmVersion: "ledger-settlement-greedy-v1",
      settlementId: null,
      settlementRevision: null,
      settlementInputDigest: null,
      paidMinor: 100,
      shareMinor: 50,
      balanceMinor: 50,
      contributions: [],
    },
    statementFingerprint: fingerprint,
    checkpoint: null,
    delta: null,
    coverage: [
      {
        memberId: "50000000-0000-4000-8000-000000000001",
        displayName: "Member A",
        reviewedAt: null,
        reviewState: "NOT_REVIEWED",
      },
    ],
  };
}

describe("personal Settlement review SQLite", () => {
  it("queues an account-isolated offline checkpoint and preserves it across refresh", async () => {
    const { db, api } = database();
    const a = createPersonalSettlementReviewRepository(api as never, async () => userA);
    const b = createPersonalSettlementReviewRepository(api as never, async () => userB);
    await a.applyRemote(journeyId, response());
    await b.applyRemote(journeyId, response("b".repeat(64)));
    const operationId = await a.checkpoint(journeyId, "STILL_CHECKING");
    await a.applyRemote(journeyId, response("c".repeat(64)));
    expect(await a.get(journeyId)).toMatchObject({
      syncStatus: "PENDING",
      pendingOperationId: operationId,
      pendingReviewState: "STILL_CHECKING",
      statementFingerprint: "c".repeat(64),
      coverage: [expect.objectContaining({ reviewState: "STILL_CHECKING" })],
    });
    expect(await b.get(journeyId)).toMatchObject({
      syncStatus: "SYNCED",
      statementFingerprint: "b".repeat(64),
    });
    expect(
      db
        .prepare(
          "SELECT owner_user_id AS owner, operation_type AS operation FROM sync_operations WHERE id=?",
        )
        .get(operationId),
    ).toEqual({
      owner: userA,
      operation: "CREATE_SETTLEMENT_REVIEW_CHECKPOINT",
    });
    expect(
      JSON.parse(
        String(
          db
            .prepare("SELECT payload_json AS payload FROM sync_operations WHERE id=?")
            .get(operationId)?.payload,
        ),
      ),
    ).toMatchObject({ reviewState: "STILL_CHECKING" });
    await a.markRejected(journeyId, "STALE_REVIEW_CHECKPOINT");
    expect(await a.get(journeyId)).toMatchObject({
      syncStatus: "CONFLICT",
      lastErrorCode: "STALE_REVIEW_CHECKPOINT",
    });
  });
});
