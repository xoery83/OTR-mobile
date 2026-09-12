import { describe, expect, it, vi } from "vitest";

import type { FinalizedSettlementDto } from "@/data/api/ledgerSettlementContracts";

import { createLedgerSettlementRepository } from "./ledgerSettlementRepository";

const settlement: FinalizedSettlementDto = {
  id: "70000000-0000-4000-8000-000000000001",
  journeyId: "10000000-0000-4000-8000-000000000001",
  status: "FINALIZED",
  throughTimestamp: "2026-09-12T00:00:00.000Z",
  settlementCurrency: "NZD",
  settlementScale: 2,
  settingsRevision: 1,
  algorithmVersion: "ledger-settlement-greedy-v1",
  inputDigest: "a".repeat(64),
  revision: 1,
  finalizedBy: "20000000-0000-4000-8000-000000000001",
  finalizedAt: "2026-09-12T00:00:00.000Z",
  inputs: [],
  balances: [
    {
      memberId: "30000000-0000-4000-8000-000000000001",
      displayNameSnapshot: "Member",
      paidMinor: 0,
      owedMinor: 0,
      transferredMinor: 0,
      netMinor: 0,
      currency: "NZD",
      scale: 2,
    },
  ],
  transfers: [],
  auditEvents: [
    {
      id: "71000000-0000-4000-8000-000000000001",
      eventType: "FINALIZED",
      actorUserId: "20000000-0000-4000-8000-000000000001",
      actorMemberId: "30000000-0000-4000-8000-000000000001",
      reason: null,
      revision: 1,
      createdAt: "2026-09-12T00:00:00.000Z",
    },
  ],
};

describe("Stage 7.1 Settlement repository", () => {
  it("stores one immutable aggregate transaction and checks the financial queue", async () => {
    const statements: string[] = [];
    const database = {
      getAllAsync: vi.fn(async () => []),
      getFirstAsync: vi.fn(async (sql: string) =>
        sql.includes("COUNT(*)") ? { count: 1 } : null,
      ),
      runAsync: vi.fn(async (sql: string) => {
        statements.push(sql);
        return {} as never;
      }),
      withTransactionAsync: vi.fn(async (task: () => Promise<void>) => task()),
    };
    const repository = createLedgerSettlementRepository(database);
    await repository.applyFinalized(settlement);

    expect(database.withTransactionAsync).toHaveBeenCalledOnce();
    expect(statements.some((sql) => sql.includes("ledger_settlements"))).toBe(true);
    expect(
      statements.some((sql) => sql.includes("ledger_settlement_member_balances")),
    ).toBe(true);
    expect(statements.some((sql) => sql.includes("ledger_settlement_audit_events"))).toBe(
      true,
    );
    expect(await repository.hasPendingFinancialOperations(settlement.journeyId)).toBe(
      true,
    );
  });

  it("reads the same digest, balances and transfers written by Backend", async () => {
    const entity: FinalizedSettlementDto = {
      ...settlement,
      transfers: [
        {
          id: "72000000-0000-4000-8000-000000000001",
          fromMemberId: "30000000-0000-4000-8000-000000000001",
          toMemberId: "30000000-0000-4000-8000-000000000002",
          amount: { minor: 125, currency: "NZD", scale: 2 },
          status: "OPEN",
          revision: 1,
        },
      ],
    };
    const database = {
      getAllAsync: vi.fn(async (sql: string) => {
        if (sql.startsWith("SELECT id FROM ledger_settlements"))
          return [{ id: entity.id }];
        if (sql.includes("normalized_snapshot_json")) return [];
        if (sql.includes("ledger_settlement_member_balances")) return entity.balances;
        if (sql.includes("ledger_settlement_transfers"))
          return entity.transfers.map((transfer) => ({
            ...transfer,
            minor: transfer.amount.minor,
            currency: transfer.amount.currency,
            scale: transfer.amount.scale,
          }));
        if (sql.includes("ledger_settlement_audit_events")) return entity.auditEvents;
        return [];
      }),
      getFirstAsync: vi.fn(async (sql: string) =>
        sql.includes("FROM ledger_settlements WHERE id")
          ? {
              id: entity.id,
              journeyId: entity.journeyId,
              status: entity.status,
              throughTimestamp: entity.throughTimestamp,
              settlementCurrency: entity.settlementCurrency,
              settlementScale: entity.settlementScale,
              settingsRevision: entity.settingsRevision,
              algorithmVersion: entity.algorithmVersion,
              inputDigest: entity.inputDigest,
              revision: entity.revision,
              finalizedBy: entity.finalizedBy,
              finalizedAt: entity.finalizedAt,
            }
          : null,
      ),
      runAsync: vi.fn(),
      withTransactionAsync: vi.fn(),
    };

    const [local] = await createLedgerSettlementRepository(database).listFinalized(
      entity.journeyId,
    );
    expect(local.inputDigest).toBe(entity.inputDigest);
    expect(local.balances).toEqual(entity.balances);
    expect(local.transfers).toEqual(entity.transfers);
  });
});
