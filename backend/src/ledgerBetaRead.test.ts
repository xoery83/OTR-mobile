import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import {
  ledgerBetaReadBoundary,
  ledgerHistoryPageSchema,
  isLedgerBetaReadPath,
} from "./ledgerBetaRead";
import type { LedgerBootstrapResponse } from "../../src/data/api/ledgerReadContracts";
const trip = randomUUID(),
  actor = randomUUID(),
  id = randomUUID(),
  member = randomUUID();
const expense = {
  id,
  journeyId: trip,
  creatorMemberId: member,
  payerMemberId: member,
  title: "Retained",
  description: "Original",
  category: "food",
  occurredAt: "2026-11-01T00:00:00Z",
  original: { minor: 100, currency: "NZD", scale: 2 },
  businessStatus: "DRAFT",
  settlementParticipation: "INCLUDED",
  revision: 1,
  deletedAt: null,
  createdAt: "2026-11-01T00:00:00Z",
  updatedAt: "2026-11-01T00:00:00Z",
  participants: [],
  splits: [],
  valuation: null,
  paymentRecords: [],
  auditEvents: [],
};
function fixture(settlements: NonNullable<LedgerBootstrapResponse["settlements"]> = []) {
  const data = {
    journey: {
      id: trip,
      title: "Trip",
      startDate: null,
      endDate: null,
      settlementCurrency: "NZD",
      settlementScale: 2,
      valuationPolicy: "REFERENCE_RATE",
      updatedAt: "2026-11-01T00:00:00Z",
    },
    members: [],
    households: [],
    expenses: [expense, { ...expense, id: randomUUID() }],
    corrections: [],
    settlements,
    personalPayments: [],
    actor: {
      userId: actor,
      memberId: member,
      role: "owner",
      capabilities: {
        canRead: true,
        canCreateExpense: true,
        canEditOwnExpense: true,
        canCorrectAnyExpense: true,
        canSuggestCorrection: true,
        canResolveOwnExpenseConflict: true,
      },
    },
    cursor: null,
    serverTime: "2026-11-01T00:00:00Z",
  };
  return {
    data,
    gateway: {
      canReadTrip: vi.fn().mockResolvedValue(true),
      bootstrapLedger: vi.fn().mockImplementation(async () => data),
    },
  };
}
const request = (resource: string) =>
  new Request(`https://local.test/v2/trips/${trip}/${resource}`);
it("honors includeDeleted and binds Expense pagination to actor/filter/current authorized facts", async () => {
  const f = fixture();
  Object.assign(f.data.expenses[1], {
    businessStatus: "DELETED",
    deletedAt: "2026-11-02T00:00:00Z",
  });
  const normal = await ledgerBetaReadBoundary(request("expenses"), actor, f.gateway);
  expect((await normal.json()).expenses).toHaveLength(1);
  const first = await ledgerBetaReadBoundary(
    request("expenses?includeDeleted=true&limit=1"),
    actor,
    f.gateway,
  );
  const page = await first.json();
  expect(page.expenses).toHaveLength(1);
  expect(page.nextCursor).toBeTruthy();
  expect(
    (
      await ledgerBetaReadBoundary(
        request("expenses?includeDeleted=false&limit=1&cursor=" + page.nextCursor),
        actor,
        f.gateway,
      )
    ).status,
  ).toBe(409);
  expect(
    (await ledgerBetaReadBoundary(request("expenses?includeDeleted=1"), actor, f.gateway))
      .status,
  ).toBe(400);
  expect(
    (await ledgerBetaReadBoundary(request("expenses?from=2026-02-30"), actor, f.gateway))
      .status,
  ).toBe(400);
  expect(
    (await ledgerBetaReadBoundary(request("expenses?unknown=true"), actor, f.gateway))
      .status,
  ).toBe(400);
  expect(
    isLedgerBetaReadPath(
      `/v2/trips/${trip}/expenses`,
      new URLSearchParams("category=food"),
    ),
  ).toBe(false);
  expect(
    isLedgerBetaReadPath(
      `/v2/trips/${trip}/expenses`,
      new URLSearchParams("unknown=true"),
    ),
  ).toBe(true);
});
it("reuses formal Settlement audit events in a targetKind union without an Expense identity", async () => {
  const settlement = randomUUID(),
    event = {
      id: randomUUID(),
      eventType: "FINALIZED" as const,
      actorUserId: actor,
      actorMemberId: member,
      reason: null,
      transferId: null,
      paymentId: null,
      dischargeId: null,
      authority: null,
      revision: 1,
      createdAt: "2026-11-01T00:00:00Z",
    };
  const f = fixture([
    {
      id: settlement,
      journeyId: trip,
      status: "FINALIZED",
      throughTimestamp: event.createdAt,
      settlementCurrency: "NZD",
      settlementScale: 2,
      settingsRevision: 1,
      algorithmVersion: "ledger-settlement-greedy-v1",
      inputDigest: "a".repeat(64),
      revision: 1,
      finalizedBy: actor,
      finalizedAt: event.createdAt,
      inputs: [],
      balances: [],
      transfers: [],
      auditEvents: [event],
    },
  ]);
  const r = await ledgerBetaReadBoundary(
      request(`ledger/history?targetKind=SETTLEMENT&targetId=${settlement}`),
      actor,
      f.gateway,
    ),
    body = await r.json();
  expect(r.status).toBe(200);
  expect(body.targetKind).toBe("SETTLEMENT");
  expect(body.events).toEqual([event]);
  expect(body.events[0]).not.toHaveProperty("expenseId");
  expect(
    ledgerHistoryPageSchema.safeParse({ ...body, targetKind: "EXPENSE" }).success,
  ).toBe(false);
});
it("reads the complete authorized Expense and denies unknown targets", async () => {
  const f = fixture(),
    r = await ledgerBetaReadBoundary(request(`expenses/${id}`), actor, f.gateway);
  expect(r.status).toBe(200);
  expect((await r.json()).description).toBe("Original");
  expect(
    (await ledgerBetaReadBoundary(request(`expenses/${randomUUID()}`), actor, f.gateway))
      .status,
  ).toBe(404);
  f.gateway.canReadTrip.mockResolvedValue(false);
  expect(
    (await ledgerBetaReadBoundary(request(`expenses/${id}`), actor, f.gateway)).status,
  ).toBe(403);
});
it("rejects query duplication and unknown fields before reading owning data", async () => {
  const f = fixture();
  for (const path of [
    `expenses/${id}?actor=forged`,
    `ledger/export?scope=EXPENSES&format=JSON&limit=1&limit=2`,
    `settlements?limit=101`,
    `ledger/export?scope=SETTLEMENT&format=JSON`,
  ])
    expect((await ledgerBetaReadBoundary(request(path), actor, f.gateway)).status).toBe(
      400,
    );
  expect(f.gateway.bootstrapLedger).not.toHaveBeenCalled();
});
it("binds an export cursor to exact actor, filters and current authorized facts", async () => {
  const f = fixture(),
    prefix = "ledger/export?scope=EXPENSES&format=JSON&limit=1",
    r = await ledgerBetaReadBoundary(request(prefix), actor, f.gateway),
    page = await r.json();
  expect(r.status).toBe(200);
  expect(page.rows).toHaveLength(1);
  expect(page.nextCursor).toBeTruthy();
  const cursor = encodeURIComponent(page.nextCursor);
  const second = await ledgerBetaReadBoundary(
    request(prefix + "&cursor=" + cursor),
    actor,
    f.gateway,
  );
  expect(second.status).toBe(200);
  expect((await second.json()).rows[0].id).not.toBe(page.rows[0].id);
  f.data.expenses[0] = { ...expense, revision: 2 };
  expect(
    (
      await ledgerBetaReadBoundary(
        request(prefix + "&cursor=" + cursor),
        actor,
        f.gateway,
      )
    ).status,
  ).toBe(409);
  expect(
    (
      await ledgerBetaReadBoundary(
        request(
          "ledger/export?scope=PERSONAL_PAYMENTS&format=JSON&limit=1&cursor=" + cursor,
        ),
        actor,
        f.gateway,
      )
    ).status,
  ).toBe(409);
});
it("produces typed empty authorized read projections and does not invent history events", async () => {
  const f = fixture();
  const list = await ledgerBetaReadBoundary(request("settlements"), actor, f.gateway);
  expect(list.status).toBe(200);
  expect((await list.json()).items).toEqual([]);
  const history = await ledgerBetaReadBoundary(
    request(`ledger/history?targetKind=EXPENSE&targetId=${id}`),
    actor,
    f.gateway,
  );
  expect(history.status).toBe(200);
  expect((await history.json()).events).toEqual([]);
  expect(
    (
      await ledgerBetaReadBoundary(
        request(`ledger/history?targetKind=SETTLEMENT&targetId=${randomUUID()}`),
        actor,
        f.gateway,
      )
    ).status,
  ).toBe(404);
});

it("reads typed Personal Payment history with exact decimal evidence and rejects mismatched scope", async () => {
  const f = fixture();
  const payment = {
    id: randomUUID(),
    journeyId: trip,
    ownerUserId: actor,
    ownerMemberId: member,
    counterpartyMemberId: randomUUID(),
    direction: "PAID" as const,
    amountMinor: 100,
    currency: "NZD",
    scale: 2,
    occurredAt: "2026-11-16T00:00:00Z",
    revision: 1,
    createdAt: "2026-11-16T00:00:00Z",
    updatedAt: "2026-11-16T00:00:00Z",
    deletedAt: null,
  };
  (f.data as unknown as LedgerBootstrapResponse).personalPayments = [payment];
  const op = randomUUID();
  const snapshot =
    JSON.stringify({
      id: payment.id,
      journey_id: trip,
      revision: 1,
      last_operation_id: op,
    }).slice(0, -1) + ',"reference_rate_decimal":1.123456789012345678}';
  const event = {
    id: randomUUID(),
    recordId: payment.id,
    journeyId: trip,
    priorRevision: null,
    revision: 1,
    eventType: "CREATED",
    actorUserId: actor,
    actorMemberId: member,
    operationId: op,
    reason: null,
    changedFields: ["amount"],
    recordSnapshotJson: snapshot,
    createdAt: "2026-11-16T00:00:00Z",
  };
  const reader = vi.fn().mockResolvedValue([event]);
  const gateway = { ...f.gateway, readPersonalPaymentAudit: reader };
  const path = `ledger/history?targetKind=PERSONAL_PAYMENT&targetId=${payment.id}`;
  const result = await ledgerBetaReadBoundary(request(path), actor, gateway);
  expect(result.status).toBe(200);
  const body = await result.json();
  expect(body.events).toEqual([event]);
  expect(body.events[0].recordSnapshotJson).toContain("1.123456789012345678");
  expect(body.events[0]).not.toHaveProperty("expenseId");
  expect(reader).toHaveBeenCalledWith(actor, trip, payment.id);
  reader.mockResolvedValue([{ ...event, journeyId: randomUUID() }]);
  expect((await ledgerBetaReadBoundary(request(path), actor, gateway)).status).toBe(503);
  reader.mockClear();
  expect(
    (
      await ledgerBetaReadBoundary(
        request(path.replace(payment.id, randomUUID())),
        actor,
        gateway,
      )
    ).status,
  ).toBe(404);
  expect(reader).not.toHaveBeenCalled();
  f.gateway.canReadTrip.mockResolvedValue(false);
  expect((await ledgerBetaReadBoundary(request(path), actor, gateway)).status).toBe(403);
  expect(reader).not.toHaveBeenCalled();
});
