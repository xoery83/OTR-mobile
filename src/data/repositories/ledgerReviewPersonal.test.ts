import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";

import { migrations } from "@/data/db/migrations";
import type { LedgerReviewFindingDto } from "@/data/api/ledgerReviewContracts";
import {
  createLedgerReviewRepository,
  notifyLedgerReviewExpenseSaved,
  subscribeLedgerReview,
} from "./ledgerReviewRepository";

const journeyId = "20000000-0000-4000-8000-000000000001";
const findingId = "10000000-0000-4000-8000-000000000001";
const userA = "40000000-0000-4000-8000-000000000001";
const userB = "40000000-0000-4000-8000-000000000002";

function database() {
  const db = new DatabaseSync(":memory:");
  for (const migration of migrations) db.exec(migration.sql);
  const api = {
    async withTransactionAsync(task: () => Promise<void>) {
      await task();
    },
    async runAsync(sql: string, ...args: unknown[]) {
      return db
        .prepare(sql)
        .run(...(args as Parameters<ReturnType<typeof db.prepare>["run"]>));
    },
    async getFirstAsync<T>(sql: string, ...args: unknown[]) {
      return (db
        .prepare(sql)
        .get(...(args as Parameters<ReturnType<typeof db.prepare>["get"]>)) ??
        null) as T | null;
    },
    async getAllAsync<T>(sql: string, ...args: unknown[]) {
      return db
        .prepare(sql)
        .all(...(args as Parameters<ReturnType<typeof db.prepare>["all"]>)) as T[];
    },
  };
  for (const [user, member] of [
    [userA, "member-a"],
    [userB, "member-b"],
  ]) {
    db.prepare(
      `INSERT INTO ledger_actor_context
      (user_id,journey_id,member_id,role,capabilities_json,updated_at)
      VALUES (?,?,?,'group_member','{}','2026-09-17T00:00:00Z')`,
    ).run(user, journeyId, member);
  }
  return { db, api };
}

const finding: LedgerReviewFindingDto = {
  id: findingId,
  journeyId,
  expenseId: "30000000-0000-4000-8000-000000000001",
  settlementId: null,
  layer: "HEURISTIC",
  findingType: "POSSIBLE_DUPLICATE",
  severity: "WARNING",
  confidence: 0.8,
  evidenceCodes: ["TEST"],
  status: "OPEN",
  rulesetVersion: "ledger-review-v2",
  entityRevision: 1,
  revision: 1,
  createdAt: "2026-09-17T00:00:00Z",
  updatedAt: "2026-09-17T00:00:00Z",
  ruleId: "POSSIBLE_DUPLICATE",
  lifecycle: "ACTIVE",
  personalDecision: "NEEDS_REVIEW",
  decisionRevision: 0,
};

describe("Review personal SQLite projection", () => {
  it("creates an offline human Finding without leaking it across accounts", async () => {
    const { db, api } = database();
    const a = createLedgerReviewRepository(api as never, async () => userA);
    const b = createLedgerReviewRepository(api as never, async () => userB);
    const id = await a.raise(journeyId, {
      targetType: "EXPENSE",
      expenseId: "30000000-0000-4000-8000-000000000001",
      targetMemberId: null,
      personalPaymentId: null,
      settlementId: null,
      sourceRevision: 1,
      note: "Wrong amount",
      targetTitle: "Dinner",
    });
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect((await a.list(journeyId))[0]).toMatchObject({
      id,
      origin: "HUMAN",
      humanNote: "Wrong amount",
      targetType: "EXPENSE",
    });
    expect(await b.list(journeyId)).toEqual([]);
    expect(
      db
        .prepare(
          "SELECT owner_user_id AS owner, operation_type AS operation FROM sync_operations WHERE id=?",
        )
        .get(id),
    ).toEqual({ owner: userA, operation: "RAISE_LEDGER_REVIEW_FINDING" });
    await a.apply(journeyId, [], []);
    expect((await a.list(journeyId))[0].id).toBe(id);
  });

  it("isolates ACK, offline count and account switching", async () => {
    const { api } = database();
    const a = createLedgerReviewRepository(api as never, async () => userA);
    const b = createLedgerReviewRepository(api as never, async () => userB);
    await a.apply(journeyId, [finding], []);
    await b.apply(journeyId, [finding], []);
    await a.act(findingId, "ACKNOWLEDGED");
    expect((await a.list(journeyId))[0].personalDecision).toBe("ACKNOWLEDGED");
    expect((await b.list(journeyId))[0].personalDecision).toBe("NEEDS_REVIEW");
    expect(await a.counts(journeyId)).toEqual({ pending: 0, reviewed: 1 });
    expect(await b.counts(journeyId)).toEqual({ pending: 1, reviewed: 0 });
  });

  it("notifies the mounted inbox after a committed local decision", async () => {
    const { api } = database();
    const repository = createLedgerReviewRepository(api as never, async () => userA);
    await repository.apply(journeyId, [finding], []);
    let complete!: (pending: number) => void;
    const notified = new Promise<number>((resolve) => {
      complete = resolve;
    });
    const unsubscribe = subscribeLedgerReview((id) => {
      if (id === journeyId)
        void repository.counts(id).then(({ pending }) => complete(pending));
    });
    await repository.act(findingId, "ACKNOWLEDGED");
    expect(await notified).toBe(0);
    unsubscribe();
  });

  it("marks an Expense save for Review recheck without changing the projection", async () => {
    const { api } = database();
    const repository = createLedgerReviewRepository(api as never, async () => userA);
    await repository.apply(journeyId, [finding], []);
    const changes: string[] = [];
    const unsubscribe = subscribeLedgerReview((id, change) => {
      if (id === journeyId) changes.push(change);
    });
    notifyLedgerReviewExpenseSaved(journeyId);
    expect(changes).toEqual(["expense_saved"]);
    expect(await repository.counts(journeyId)).toEqual({ pending: 1, reviewed: 0 });
    unsubscribe();
  });

  it("does not queue repeated taps on the same personal decision", async () => {
    const { db, api } = database();
    const a = createLedgerReviewRepository(api as never, async () => userA);
    await a.apply(journeyId, [finding], []);
    const first = await a.act(findingId, "ACKNOWLEDGED");
    expect(await a.act(findingId, "ACKNOWLEDGED")).toBe(first);
    expect(
      db
        .prepare(
          "SELECT count(*) AS count FROM sync_operations WHERE entity_type='ledger_review'",
        )
        .get(),
    ).toEqual({ count: 1 });
    expect(
      db
        .prepare(
          "SELECT revision FROM ledger_review_decisions WHERE user_id=? AND finding_id=?",
        )
        .get(userA, findingId),
    ).toEqual({ revision: 1 });
  });

  it("removes eligibility and excludes resolved history from active counts", async () => {
    const { api } = database();
    const a = createLedgerReviewRepository(api as never, async () => userA);
    await a.apply(journeyId, [finding], []);
    await a.apply(
      journeyId,
      [{ ...finding, lifecycle: "RESOLVED_BY_EXPENSE_UPDATE", status: "STALE" }],
      [],
    );
    expect(await a.counts(journeyId)).toEqual({ pending: 0, reviewed: 0 });
    await a.apply(journeyId, [], []);
    expect(await a.list(journeyId)).toEqual([]);
  });

  it("keeps offline optimism until terminal rejection, then accepts server state", async () => {
    const { db, api } = database();
    const a = createLedgerReviewRepository(api as never, async () => userA);
    await a.apply(journeyId, [finding], []);
    await a.act(findingId, "ACKNOWLEDGED");
    await a.apply(journeyId, [finding], []);
    expect(await a.counts(journeyId)).toEqual({ pending: 0, reviewed: 1 });
    db.exec(
      "UPDATE sync_operations SET status='FAILED' WHERE entity_type='ledger_review'",
    );
    await a.apply(journeyId, [finding], []);
    expect(await a.counts(journeyId)).toEqual({ pending: 1, reviewed: 0 });
  });

  it("does not overwrite a newer queued decision when an older ACK completes", async () => {
    const { db, api } = database();
    const a = createLedgerReviewRepository(api as never, async () => userA);
    await a.apply(journeyId, [finding], []);
    const first = await a.act(findingId, "ACKNOWLEDGED");
    await a.act(findingId, "DISMISSED");
    const expectedRevisions = db
      .prepare(
        "SELECT payload_json FROM sync_operations WHERE entity_type='ledger_review' ORDER BY created_at, rowid",
      )
      .all()
      .map((row) => JSON.parse(String(row.payload_json)).decisionRevision);
    expect(expectedRevisions).toEqual([0, 1]);
    await a.markActionSynced(
      first,
      {
        ...finding,
        personalDecision: "ACKNOWLEDGED",
        decisionRevision: 1,
      },
      {
        id: "60000000-0000-4000-8000-000000000001",
        findingId,
        action: "ACKNOWLEDGED",
        actorUserId: userA,
        actorMemberId: "member-a",
        actorRole: "group_member",
        reason: null,
        findingRevision: 1,
        entityRevision: 1,
        rulesetVersion: finding.rulesetVersion,
        operationId: first,
        createdAt: "2026-09-17T00:00:00Z",
      },
    );
    expect((await a.list(journeyId))[0].personalDecision).toBe("DISMISSED");
  });

  it("invalidates a removed member's local Review projection", async () => {
    const { api } = database();
    const a = createLedgerReviewRepository(api as never, async () => userA);
    const b = createLedgerReviewRepository(api as never, async () => userB);
    await a.apply(journeyId, [finding], []);
    await b.apply(journeyId, [finding], []);
    await a.invalidate(journeyId);
    expect(await a.list(journeyId)).toEqual([]);
    expect(await b.counts(journeyId)).toEqual({ pending: 1, reviewed: 0 });
  });
});
