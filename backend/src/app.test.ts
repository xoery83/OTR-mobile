import { describe, expect, it, vi } from "vitest";

import {
  BackendError,
  createDevBackendHandler,
  type DevBackendGateway,
  type StoredCreate,
} from "./app";

const tripId = "10000000-0000-4000-8000-000000000001";
const userId = "20000000-0000-4000-8000-000000000001";
const memberA = "30000000-0000-4000-8000-000000000001";
const memberB = "30000000-0000-4000-8000-000000000002";

function createGateway(options: { authorized?: boolean } = {}) {
  const expenses = new Map<string, StoredCreate>();
  const ledgerCreates = new Map<string, { hash: string; response: unknown }>();
  const ledgerExpenses = new Map<
    string,
    typeof ledgerExpenseBody & { revision: number }
  >();
  const itineraryItems = new Map<string, StoredCreate>();
  const gateway: DevBackendGateway = {
    validateAccessToken: vi.fn(async (token) =>
      token === "valid-token" ? { id: userId } : null,
    ),
    canReadTrip: vi.fn(async () => options.authorized ?? true),
    canWriteTrip: vi.fn(async () => options.authorized ?? true),
    canFinalizeSettlement: vi.fn(async () => options.authorized ?? true),
    previewLedgerSettlement: vi.fn(async (_userId, requestedTripId, cutoff) => ({
      state: "PREVIEW_READY" as const,
      journeyId: requestedTripId,
      throughTimestamp: cutoff,
      settlementCurrency: "NZD",
      settlementScale: 2,
      settingsRevision: 1,
      algorithmVersion: "ledger-settlement-greedy-v1" as const,
      members: [],
      inputs: [],
      blockers: [],
      exclusions: [],
      balances: [],
      transfers: [],
      inputDigest: "a".repeat(64),
    })),
    finalizeLedgerSettlement: vi.fn(async (_userId, requestedTripId, _key, input) => ({
      entity: {
        id: "70000000-0000-4000-8000-000000000001",
        journeyId: requestedTripId,
        status: "FINALIZED" as const,
        throughTimestamp: input.throughTimestamp,
        settlementCurrency: "NZD",
        settlementScale: 2,
        settingsRevision: 1,
        algorithmVersion: "ledger-settlement-greedy-v1" as const,
        inputDigest: input.inputDigest,
        revision: 1,
        finalizedBy: userId,
        finalizedAt: "2026-09-12T00:00:00.000Z",
        inputs: [],
        balances: [],
        transfers: [],
        auditEvents: [
          {
            id: "71000000-0000-4000-8000-000000000001",
            eventType: "FINALIZED" as const,
            actorUserId: userId,
            actorMemberId: memberA,
            reason: null,
            transferId: null,
            paymentId: null,
            dischargeId: null,
            authority: null,
            revision: 1,
            createdAt: "2026-09-12T00:00:00.000Z",
          },
        ],
      },
      idempotentReplay: false,
    })),
    previewSettlementAdjustment: vi.fn(async (_userId, _tripId, rootSettlementId) => ({
      state: "PREVIEW_UNCHANGED" as const,
      rootSettlementId,
      expectedHeadId: null,
      priorInputDigest: "a".repeat(64),
      inputDigest: "a".repeat(64),
      zeroTransfer: true,
      inputs: [],
      balances: [],
      transfers: [],
      blockers: [],
      exclusions: [],
      changedExpenses: [],
    })),
    finalizeSettlementAdjustment: vi.fn(async () => {
      throw new Error("not used");
    }),
    recordSettlementPayment: vi.fn(async () => {
      throw new Error("not used");
    }),
    actOnSettlementPayment: vi.fn(async () => {
      throw new Error("not used");
    }),
    correctSettlementPayment: vi.fn(async () => {
      throw new Error("not used");
    }),
    createReceipt: vi.fn(async (_userId, requestedTripId, receiptId, input) => ({
      entity: {
        id: receiptId,
        localId: input.localId,
        journeyId: requestedTripId,
        expenseId: null,
        objectPath: `${requestedTripId}/${receiptId}/original`,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        sha256: input.sha256,
        uploadStatus: "PENDING" as const,
        ocrStatus: "PENDING" as const,
        ocrSuggestion: null,
        createdAt: "2026-09-12T00:00:00.000Z",
        updatedAt: "2026-09-12T00:00:00.000Z",
      },
      idempotentReplay: false,
    })),
    uploadReceiptContent: vi.fn(async (_userId, requestedTripId, receiptId) => ({
      entity: {
        id: receiptId,
        localId: "local-receipt",
        journeyId: requestedTripId,
        expenseId: null,
        objectPath: `${requestedTripId}/${receiptId}/original`,
        mimeType: "image/jpeg" as const,
        sizeBytes: 3,
        sha256: "a".repeat(64),
        uploadStatus: "PENDING" as const,
        ocrStatus: "PENDING" as const,
        ocrSuggestion: null,
        createdAt: "2026-09-12T00:00:00.000Z",
        updatedAt: "2026-09-12T00:00:00.000Z",
      },
      idempotentReplay: false,
    })),
    downloadReceiptContent: vi.fn(async () => ({
      bytes: new Uint8Array([1, 2, 3]),
      mimeType: "image/jpeg",
    })),
    completeReceipt: vi.fn(async () => {
      throw new Error("not used");
    }),
    linkReceipt: vi.fn(async () => {
      throw new Error("not used");
    }),
    ocrReceipt: vi.fn(async () => {
      throw new Error("not used");
    }),
    bootstrapLedger: vi.fn(async () => ({
      journey: {
        id: tripId,
        title: "Europe",
        startDate: "2026-09-01",
        endDate: "2026-09-30",
        settlementCurrency: "NZD",
        settlementScale: 2,
        valuationPolicy: "REFERENCE_RATE",
        updatedAt: "2026-09-11T00:00:00.000Z",
      },
      members: [],
      households: [],
      expenses: [],
      corrections: [],
      rateQuotes: [],
      actor: {
        memberId: memberA,
        role: "group_member",
        capabilities: {
          canRead: true,
          canCreateExpense: true,
          canEditOwnExpense: true,
          canCorrectAnyExpense: false,
          canSuggestCorrection: true,
          canResolveOwnExpenseConflict: true,
          canAddOwnPaymentEvidence: true,
          canManageExpenseValuation: true,
          canManageLedgerValuationPolicy: false,
        },
      },
      cursor: "cursor-1",
      serverTime: "2026-09-11T00:00:00.000Z",
    })),
    pullLedgerChanges: vi.fn(async (_userId, _tripId, cursor) => ({
      changes: [],
      cursor: cursor === "cursor-1" ? "cursor-2" : "cursor-1",
      serverTime: "2026-09-11T00:00:00.000Z",
    })),
    readLedgerExpenses: vi.fn(async () => ({ expenses: [], nextCursor: null })),
    readLedgerAnalysis: vi.fn(async (_userId, _tripId, _filters, scope, dimension) => ({
      scope,
      dimension,
      currency: "NZD",
      summary: {
        totalMinor: 0,
        expenseCount: 0,
        includedExpenseIds: [],
        unresolvedRateCount: 0,
        openConflictCount: 0,
      },
      buckets: [],
    })),
    readMyLedger: vi.fn(async (_userId, period, from, to) => ({
      period,
      from,
      to,
      journeys: [],
      serverTime: "2026-09-11T00:00:00.000Z",
    })),
    readLedgerRateQuotes: vi.fn(async () => []),
    readLedgerReview: vi.fn(async () => ({ findings: [], actions: [] })),
    refreshLedgerReview: vi.fn(async () => ({ findings: [], actions: [] })),
    actOnLedgerReviewFinding: vi.fn(async () => {
      throw new Error("not used");
    }),
    addLedgerPaymentRecord: vi.fn(async (_userId, _tripId, _expenseId, _key, input) => ({
      entity: {
        id: "53000000-0000-4000-8000-000000000001",
        expenseRevision: 1,
        payerMemberId: memberA,
        instrumentLabel: input.instrumentLabel,
        authorization: input.authorization,
        posted: input.posted,
        authorizedAt: input.authorizedAt,
        postedAt: input.postedAt,
        fee: input.fee,
        bankFxRate: input.bankFxRate,
        source: input.source,
        notes: input.notes,
        supersedesPaymentRecordId: input.supersedesPaymentRecordId,
      },
      serverId: "53000000-0000-4000-8000-000000000001",
      revision: 1 as const,
      updatedAt: "2026-09-12T01:00:00.000Z",
      idempotentReplay: false,
    })),
    applyLedgerValuation: vi.fn(async () => {
      throw new BackendError(409, "REVISION_CONFLICT", "stale");
    }),
    createLedgerExpense: vi.fn(async (_userId, requestedTripId, key, input) => {
      const hash = JSON.stringify(input);
      const existing = ledgerCreates.get(key);
      if (existing) {
        if (existing.hash !== hash) {
          throw new BackendError(
            409,
            "IDEMPOTENCY_CONFLICT",
            "The idempotency key conflicts.",
          );
        }
        return { ...(existing.response as object), idempotentReplay: true } as never;
      }
      const response = {
        entity: {
          id: "40000000-0000-4000-8000-000000000001",
          journeyId: requestedTripId,
          creatorMemberId: memberA,
          payerMemberId: input.payerMemberId,
          title: input.title,
          description: input.description,
          category: input.category,
          occurredAt: input.occurredAt,
          original: input.original,
          businessStatus: input.businessStatus,
          revision: 1,
          deletedAt: null,
          createdAt: "2026-09-10T00:00:00.000Z",
          updatedAt: "2026-09-10T00:00:00.000Z",
          participants: input.participants,
          splits: input.splits,
          valuation: input.valuation
            ? {
                id: "50000000-0000-4000-8000-000000000001",
                ...input.valuation,
              }
            : null,
          paymentRecords: [],
          auditEvents: [
            {
              id: "60000000-0000-4000-8000-000000000001",
              expenseId: "40000000-0000-4000-8000-000000000001",
              actorUserId: userId,
              actorMemberId: memberA,
              eventType: "CREATED",
              reason: null,
              changedGroups: ["FINANCIAL_CORE", "DESCRIPTIVE"],
              revision: 1,
              createdAt: "2026-09-10T00:00:00.000Z",
            },
          ],
        },
        serverId: "40000000-0000-4000-8000-000000000001",
        revision: 1,
        updatedAt: "2026-09-10T00:00:00.000Z",
        idempotentReplay: false,
      };
      ledgerCreates.set(key, { hash, response });
      ledgerExpenses.set(response.serverId, { ...input, revision: 1 });
      return response;
    }),
    updateLedgerExpense: vi.fn(
      async (_userId, requestedTripId, expenseId, _key, input) => {
        if (!input.auditReason && input.title.includes("Organizer")) {
          throw new BackendError(
            400,
            "INVALID_PAYLOAD",
            "An organizer override reason is required.",
          );
        }
        const current = ledgerExpenses.get(expenseId);
        if (!current) throw new BackendError(404, "ENTITY_NOT_FOUND", "missing");
        if (current.revision !== input.baseRevision) {
          throw new BackendError(409, "REVISION_CONFLICT", "stale");
        }
        const revision = input.baseRevision + 1;
        ledgerExpenses.set(expenseId, { ...input, revision });
        return {
          entity: {
            id: expenseId,
            journeyId: requestedTripId,
            creatorMemberId: memberA,
            payerMemberId: input.payerMemberId,
            title: input.title,
            description: input.description,
            category: input.category,
            occurredAt: input.occurredAt,
            original: input.original,
            businessStatus: input.businessStatus,
            revision,
            deletedAt: null,
            createdAt: "2026-09-10T00:00:00.000Z",
            updatedAt: "2026-09-10T00:01:00.000Z",
            participants: input.participants,
            splits: input.splits,
            valuation: input.valuation
              ? { id: "50000000-0000-4000-8000-000000000002", ...input.valuation }
              : null,
            paymentRecords: [],
            auditEvents: [
              {
                id: "60000000-0000-4000-8000-000000000002",
                expenseId,
                actorUserId: userId,
                actorMemberId: memberA,
                eventType: "EDITED",
                reason: input.auditReason,
                changedGroups: ["FINANCIAL_CORE", "DESCRIPTIVE"],
                revision,
                createdAt: "2026-09-10T00:01:00.000Z",
              },
            ],
          },
          serverId: expenseId,
          revision,
          updatedAt: "2026-09-10T00:01:00.000Z",
          idempotentReplay: false,
        };
      },
    ),
    deleteLedgerExpense: vi.fn(async () => {
      throw new BackendError(404, "ENTITY_NOT_FOUND", "missing");
    }),
    restoreLedgerExpense: vi.fn(async () => {
      throw new BackendError(404, "ENTITY_NOT_FOUND", "missing");
    }),
    resolveLedgerExpenseConflict: vi.fn(async () => {
      throw new BackendError(404, "ENTITY_NOT_FOUND", "missing");
    }),
    createLedgerCorrection: vi.fn(async () => {
      throw new BackendError(404, "ENTITY_NOT_FOUND", "missing");
    }),
    actOnLedgerCorrection: vi.fn(async () => {
      throw new BackendError(404, "ENTITY_NOT_FOUND", "missing");
    }),
    createFinalizedSettlementGuardFixture: vi.fn(async () => ({ ok: true as const })),
    findExpense: vi.fn(async (id) => expenses.get(id) ?? null),
    createExpense: vi.fn(async (id, requestedTripId, requestedUserId) => {
      const row = {
        id,
        tripId: requestedTripId,
        createdByUserId: requestedUserId,
        updatedAt: "2026-09-10T00:00:00.000Z",
      };
      expenses.set(id, row);
      return row;
    }),
    findItineraryItem: vi.fn(async (id) => itineraryItems.get(id) ?? null),
    createItineraryItem: vi.fn(async (id, requestedTripId, requestedUserId) => {
      const row = {
        id,
        tripId: requestedTripId,
        createdByUserId: requestedUserId,
        updatedAt: "2026-09-10T00:00:00.000Z",
      };
      itineraryItems.set(id, row);
      return row;
    }),
  };

  return { gateway, expenses, itineraryItems, ledgerCreates };
}

function post(
  resource: "expenses" | "itinerary-items",
  body: unknown,
  token = "valid-token",
) {
  return new Request(`http://localhost/v1/trips/${tripId}/${resource}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "Idempotency-Key": "operation-1",
    },
    body: JSON.stringify(body),
  });
}

const expenseBody = {
  localId: "expense-local-1",
  title: "Train",
  amountMinor: 2500,
  currencyCode: "NZD",
  paidByMemberId: null,
  occurredAt: null,
};

const itineraryBody = {
  localId: "itinerary-local-1",
  title: "Museum",
  scheduledDate: "2026-09-11",
  startTime: null,
  location: null,
  notes: null,
};

const ledgerExpenseBody = {
  localId: "ledger-expense-local-1",
  title: "Dinner",
  description: null,
  category: "food",
  occurredAt: "2026-09-11T19:00:00.000Z",
  payerMemberId: memberA,
  original: { minor: 1200, currency: "NZD", scale: 2 },
  businessStatus: "ACCEPTED" as const,
  participants: [
    { memberId: memberA, displayNameSnapshot: "Alex", householdIdSnapshot: null },
    { memberId: memberB, displayNameSnapshot: "Bea", householdIdSnapshot: null },
  ],
  splits: [
    {
      memberId: memberA,
      method: "EQUAL_PERSON" as const,
      originalMinor: 600,
      settlementMinor: 600,
      weightUnits: null,
      percentageUnits: null,
      roundingAdjustmentMinor: 0,
    },
    {
      memberId: memberB,
      method: "EQUAL_PERSON" as const,
      originalMinor: 600,
      settlementMinor: 600,
      weightUnits: null,
      percentageUnits: null,
      roundingAdjustmentMinor: 0,
    },
  ],
  valuation: {
    policy: "SAME_CURRENCY" as const,
    original: { minor: 1200, currency: "NZD", scale: 2 },
    settlement: { minor: 1200, currency: "NZD", scale: 2 },
    rateSnapshotId: null,
    paymentRecordId: null,
    reason: null,
  },
};

describe("OTR Dev Backend", () => {
  it("authenticates and creates both approved entity types", async () => {
    const { gateway } = createGateway();
    const handle = createDevBackendHandler({ gateway });

    const expense = await handle(post("expenses", expenseBody));
    const itinerary = await handle(post("itinerary-items", itineraryBody));

    expect(expense.status).toBe(201);
    expect(await expense.json()).toMatchObject({ version: 1, idempotentReplay: false });
    expect(itinerary.status).toBe(201);
    expect(gateway.createExpense).toHaveBeenCalledOnce();
    expect(gateway.createItineraryItem).toHaveBeenCalledOnce();
  });

  it("rejects invalid sessions and unauthorized trips before writing", async () => {
    const { gateway } = createGateway({ authorized: false });
    const handle = createDevBackendHandler({ gateway });

    const invalidSession = await handle(post("expenses", expenseBody, "invalid"));
    const forbidden = await handle(post("expenses", expenseBody));

    expect(invalidSession.status).toBe(401);
    expect(forbidden.status).toBe(403);
    expect(gateway.createExpense).not.toHaveBeenCalled();
  });

  it("rejects invalid payloads before authorization or writes", async () => {
    const { gateway } = createGateway();
    const response = await createDevBackendHandler({ gateway })(
      post("expenses", { ...expenseBody, amountMinor: -1 }),
    );

    expect(response.status).toBe(400);
    expect(gateway.canWriteTrip).not.toHaveBeenCalled();
    expect(gateway.createExpense).not.toHaveBeenCalled();
  });

  it("returns the original entity for an idempotent retry", async () => {
    const { gateway, expenses } = createGateway();
    const handle = createDevBackendHandler({ gateway });

    const first = await handle(post("expenses", expenseBody));
    const retried = await handle(post("expenses", expenseBody));
    const firstBody = (await first.json()) as { serverId: string };

    expect(await retried.json()).toMatchObject({
      serverId: firstBody.serverId,
      idempotentReplay: true,
    });
    expect(expenses).toHaveLength(1);
    expect(gateway.createExpense).toHaveBeenCalledOnce();
  });

  it("logs metadata without tokens or request content", async () => {
    const { gateway } = createGateway();
    const log = vi.fn();
    await createDevBackendHandler({ gateway, log })(post("expenses", expenseBody));

    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({ route: "expenses", status: 201 }),
    );
    expect(JSON.stringify(log.mock.calls)).not.toContain("valid-token");
    expect(JSON.stringify(log.mock.calls)).not.toContain("Train");
  });

  it("serves authorized Ledger bootstrap and incremental pull reads", async () => {
    const { gateway } = createGateway();
    const handle = createDevBackendHandler({ gateway });

    const bootstrap = await handle(
      new Request(`http://localhost/v2/trips/${tripId}/ledger/bootstrap`, {
        headers: { Authorization: "Bearer valid-token" },
      }),
    );
    const changes = await handle(
      new Request(`http://localhost/v2/trips/${tripId}/ledger/changes?cursor=cursor-1`, {
        headers: { Authorization: "Bearer valid-token" },
      }),
    );

    expect(bootstrap.status).toBe(200);
    expect(await bootstrap.json()).toMatchObject({ cursor: "cursor-1" });
    expect(changes.status).toBe(200);
    expect(gateway.pullLedgerChanges).toHaveBeenCalledWith(userId, tripId, "cursor-1");
  });

  it("keeps preview non-persistent and finalizes with the preview digest", async () => {
    const { gateway } = createGateway();
    const handle = createDevBackendHandler({ gateway });
    const throughTimestamp = "2026-09-12T00:00:00+00:00";
    const headers = {
      Authorization: "Bearer valid-token",
      "Content-Type": "application/json",
    };
    const preview = await handle(
      new Request(`http://localhost/v2/trips/${tripId}/settlements/preview`, {
        method: "POST",
        headers,
        body: JSON.stringify({ throughTimestamp }),
      }),
    );
    const previewBody = (await preview.json()) as { inputDigest: string };
    const finalized = await handle(
      new Request(`http://localhost/v2/trips/${tripId}/settlements`, {
        method: "POST",
        headers: { ...headers, "Idempotency-Key": "settlement-finalize" },
        body: JSON.stringify({
          throughTimestamp,
          inputDigest: previewBody.inputDigest,
        }),
      }),
    );

    expect(preview.status).toBe(200);
    expect(gateway.previewLedgerSettlement).toHaveBeenCalledOnce();
    expect(finalized.status).toBe(201);
    expect(await finalized.json()).toMatchObject({
      entity: { status: "FINALIZED", inputDigest: "a".repeat(64) },
    });
  });

  it("requires organizer capability for settlement preview", async () => {
    const { gateway } = createGateway({ authorized: false });
    const response = await createDevBackendHandler({ gateway })(
      new Request(`http://localhost/v2/trips/${tripId}/settlements/preview`, {
        method: "POST",
        headers: {
          Authorization: "Bearer valid-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ throughTimestamp: "2026-09-12T00:00:00.000Z" }),
      }),
    );
    expect(response.status).toBe(403);
    expect(gateway.previewLedgerSettlement).not.toHaveBeenCalled();
  });

  it("allows Adjustment preview to readers and requires a reason to finalize", async () => {
    const { gateway } = createGateway();
    const rootId = "70000000-0000-4000-8000-000000000001";
    const root = await gateway.finalizeLedgerSettlement(userId, tripId, "fixture", {
      throughTimestamp: "2026-09-12T00:00:00.000Z",
      inputDigest: "a".repeat(64),
    });
    gateway.finalizeSettlementAdjustment = vi.fn(async () => ({
      entity: { ...root.entity, id: "70000000-0000-4000-8000-000000000002" },
      idempotentReplay: false,
    }));
    const handle = createDevBackendHandler({ gateway });
    const url = `http://localhost/v2/trips/${tripId}/settlements/${rootId}/adjustments`;
    const headers = {
      Authorization: "Bearer valid-token",
      "Content-Type": "application/json",
      "Idempotency-Key": "adjustment-key",
    };
    const preview = await handle(
      new Request(`${url}/preview`, {
        method: "POST",
        headers,
        body: "{}",
      }),
    );
    const missingReason = await handle(
      new Request(url, {
        method: "POST",
        headers,
        body: JSON.stringify({
          expectedHeadId: null,
          inputDigest: "a".repeat(64),
          reason: "",
          allowZeroTransfer: false,
        }),
      }),
    );
    const finalized = await handle(
      new Request(url, {
        method: "POST",
        headers,
        body: JSON.stringify({
          expectedHeadId: null,
          inputDigest: "a".repeat(64),
          reason: "Corrected expense",
          allowZeroTransfer: false,
        }),
      }),
    );

    expect(preview.status).toBe(200);
    expect(gateway.previewSettlementAdjustment).toHaveBeenCalledWith(
      userId,
      tripId,
      rootId,
    );
    expect(missingReason.status).toBe(400);
    expect(finalized.status).toBe(201);
    expect(gateway.finalizeSettlementAdjustment).toHaveBeenCalledOnce();
  });

  it("routes typed Paid and Received commands separately", async () => {
    const { gateway } = createGateway();
    const base = await gateway.finalizeLedgerSettlement(userId, tripId, "fixture", {
      throughTimestamp: "2026-09-12T00:00:00.000Z",
      inputDigest: "a".repeat(64),
    });
    gateway.recordSettlementPayment = vi.fn(async () => ({
      entity: base.entity,
      paymentId: "73000000-0000-4000-8000-000000000001",
      idempotentReplay: false,
    }));
    gateway.actOnSettlementPayment = vi.fn(async () => ({
      entity: base.entity,
      paymentId: "73000000-0000-4000-8000-000000000001",
      idempotentReplay: false,
    }));
    const headers = {
      Authorization: "Bearer valid-token",
      "Content-Type": "application/json",
      "Idempotency-Key": "payment-key",
    };
    const paid = await createDevBackendHandler({ gateway })(
      new Request(
        `http://localhost/v2/trips/${tripId}/transfers/72000000-0000-4000-8000-000000000001/payments`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            localId: "73000000-0000-4000-8000-000000000001",
            baseTransferRevision: 1,
            payment: { minor: 500, currency: "NZD", scale: 2 },
            assertedDischarge: { minor: 500, currency: "NZD", scale: 2 },
            repaymentValuation: null,
            feeTreatment: null,
            paidAt: "2026-09-12T01:00:00.000Z",
            evidenceAssetId: null,
            notes: null,
            reportingAuthority: "PAYER",
            reason: null,
          }),
        },
      ),
    );
    const received = await createDevBackendHandler({ gateway })(
      new Request(
        `http://localhost/v2/trips/${tripId}/transfer-payments/73000000-0000-4000-8000-000000000001/confirm`,
        {
          method: "POST",
          headers: { ...headers, "Idempotency-Key": "received-key" },
          body: JSON.stringify({
            basePaymentRevision: 1,
            authority: "RECIPIENT",
            reason: null,
          }),
        },
      ),
    );

    expect(paid.status).toBe(201);
    expect(received.status).toBe(200);
    expect(gateway.recordSettlementPayment).toHaveBeenCalledOnce();
    expect(gateway.actOnSettlementPayment).toHaveBeenCalledWith(
      userId,
      tripId,
      "73000000-0000-4000-8000-000000000001",
      "confirm",
      "received-key",
      { basePaymentRevision: 1, authority: "RECIPIENT", reason: null },
    );
  });

  it("rejects reopen with one stable lifecycle error", async () => {
    const { gateway } = createGateway();
    const response = await createDevBackendHandler({ gateway })(
      new Request(
        `http://localhost/v2/trips/${tripId}/settlements/70000000-0000-4000-8000-000000000001/reopen`,
        { method: "POST", headers: { Authorization: "Bearer valid-token" } },
      ),
    );
    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe("SETTLEMENT_REOPEN_NOT_ALLOWED");
  });

  it("validates and authorizes Stage 6 reporting reads", async () => {
    const { gateway } = createGateway();
    const handle = createDevBackendHandler({ gateway });
    const headers = { Authorization: "Bearer valid-token" };
    const list = await handle(
      new Request(`http://localhost/v2/trips/${tripId}/expenses?receipt=HAS&limit=25`, {
        headers,
      }),
    );
    const analysis = await handle(
      new Request(
        `http://localhost/v2/trips/${tripId}/ledger/analysis?scope=GROUP&dimension=CATEGORY&valuation=VALUED`,
        { headers },
      ),
    );
    const myLedger = await handle(
      new Request("http://localhost/v2/me/ledger?period=ALL", { headers }),
    );

    expect(list.status).toBe(200);
    expect(analysis.status).toBe(200);
    expect(myLedger.status).toBe(200);
    expect(gateway.readLedgerExpenses).toHaveBeenCalledWith(
      userId,
      tripId,
      expect.objectContaining({ receipt: "HAS" }),
      25,
      0,
    );
    expect(gateway.readLedgerAnalysis).toHaveBeenCalledWith(
      userId,
      tripId,
      expect.objectContaining({ valuation: "VALUED" }),
      "GROUP",
      "CATEGORY",
    );
    expect(gateway.readMyLedger).toHaveBeenCalledWith(userId, "ALL", null, null);
  });

  it("rejects unsupported reporting conversion and invalid filters", async () => {
    const { gateway } = createGateway();
    const handle = createDevBackendHandler({ gateway });
    const headers = { Authorization: "Bearer valid-token" };
    const conversion = await handle(
      new Request("http://localhost/v2/me/ledger?period=ALL&reportingCurrency=NZD", {
        headers,
      }),
    );
    const filter = await handle(
      new Request(`http://localhost/v2/trips/${tripId}/expenses?receipt=MAYBE`, {
        headers,
      }),
    );
    expect(conversion.status).toBe(422);
    expect(filter.status).toBe(400);
    expect(gateway.readMyLedger).not.toHaveBeenCalled();
    expect(gateway.readLedgerExpenses).not.toHaveBeenCalled();
  });

  it("keeps receipt metadata and authenticated binary upload on dedicated routes", async () => {
    const { gateway } = createGateway();
    const handle = createDevBackendHandler({ gateway });
    const created = await handle(
      new Request(`http://localhost/v2/trips/${tripId}/receipts`, {
        method: "POST",
        headers: {
          Authorization: "Bearer valid-token",
          "Content-Type": "application/json",
          "Idempotency-Key": "receipt-create",
        },
        body: JSON.stringify({
          localId: "local-receipt",
          mimeType: "image/jpeg",
          sizeBytes: 3,
          sha256: "a".repeat(64),
        }),
      }),
    );
    const receipt = (await created.json()) as { entity: { id: string } };
    expect(created.status).toBe(201);

    const uploaded = await handle(
      new Request(
        `http://localhost/v2/trips/${tripId}/receipts/${receipt.entity.id}/content`,
        {
          method: "PUT",
          headers: { Authorization: "Bearer valid-token", "Content-Type": "image/jpeg" },
          body: new Uint8Array([1, 2, 3]),
        },
      ),
    );
    expect(uploaded.status).toBe(200);
    expect(gateway.uploadReceiptContent).toHaveBeenCalledWith(
      userId,
      tripId,
      receipt.entity.id,
      new Uint8Array([1, 2, 3]),
      "image/jpeg",
    );
  });

  it("creates Ledger 2.0 expenses through the v2 idempotent aggregate route", async () => {
    const { gateway, ledgerCreates } = createGateway();
    const handle = createDevBackendHandler({ gateway });
    const request = () =>
      new Request(`http://localhost/v2/trips/${tripId}/expenses`, {
        method: "POST",
        headers: {
          Authorization: "Bearer valid-token",
          "Content-Type": "application/json",
          "Idempotency-Key": "ledger-operation-1",
        },
        body: JSON.stringify(ledgerExpenseBody),
      });

    const first = await handle(request());
    const retried = await handle(request());
    const body = (await first.json()) as { serverId: string };

    expect(first.status).toBe(201);
    expect(retried.status).toBe(200);
    expect(await retried.json()).toMatchObject({
      serverId: body.serverId,
      revision: 1,
      idempotentReplay: true,
    });
    expect(gateway.createLedgerExpense).toHaveBeenCalledTimes(2);
    expect(ledgerCreates).toHaveLength(1);
  });

  it("rejects Ledger create idempotency key reuse with a different payload", async () => {
    const { gateway } = createGateway();
    const handle = createDevBackendHandler({ gateway });
    const request = (title: string) =>
      new Request(`http://localhost/v2/trips/${tripId}/expenses`, {
        method: "POST",
        headers: {
          Authorization: "Bearer valid-token",
          "Content-Type": "application/json",
          "Idempotency-Key": "ledger-operation-1",
        },
        body: JSON.stringify({ ...ledgerExpenseBody, title }),
      });

    await handle(request("Dinner"));
    const conflict = await handle(request("Different dinner"));

    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toMatchObject({
      error: { code: "IDEMPOTENCY_CONFLICT" },
    });
  });

  it("accepts RATE_REQUIRED as synchronized business state and rejects invented value", async () => {
    const { gateway } = createGateway();
    const handle = createDevBackendHandler({ gateway });
    const request = (body: unknown) =>
      new Request(`http://localhost/v2/trips/${tripId}/expenses`, {
        method: "POST",
        headers: {
          Authorization: "Bearer valid-token",
          "Content-Type": "application/json",
          "Idempotency-Key": "rate-required",
        },
        body: JSON.stringify(body),
      });
    const unresolved = {
      ...ledgerExpenseBody,
      original: { minor: 10_000, currency: "EUR", scale: 2 },
      businessStatus: "RATE_REQUIRED",
      splits: ledgerExpenseBody.splits.map((split) => ({
        ...split,
        originalMinor: 5_000,
        settlementMinor: null,
      })),
      valuation: null,
    };

    expect((await handle(request(unresolved))).status).toBe(201);
    expect(
      (await handle(request({ ...unresolved, valuation: ledgerExpenseBody.valuation })))
        .status,
    ).toBe(400);
  });

  it("routes payment evidence independently and requires manual valuation reason", async () => {
    const { gateway } = createGateway();
    const handle = createDevBackendHandler({ gateway });
    const headers = {
      Authorization: "Bearer valid-token",
      "Content-Type": "application/json",
      "Idempotency-Key": "financial-evidence",
    };
    const payment = await handle(
      new Request(
        `http://localhost/v2/trips/${tripId}/expenses/40000000-0000-4000-8000-000000000001/payment-records`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            localId: "payment-local-1",
            instrumentLabel: "Visa NZ",
            authorization: null,
            posted: { minor: 19_943, currency: "NZD", scale: 2 },
            postedAt: "2026-09-12T01:00:00.000Z",
            fee: { minor: 200, currency: "NZD", scale: 2 },
            source: "manual",
            notes: null,
            supersedesPaymentRecordId: null,
          }),
        },
      ),
    );
    const manualWithoutReason = await handle(
      new Request(
        `http://localhost/v2/trips/${tripId}/expenses/40000000-0000-4000-8000-000000000001/valuations`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            localValuationId: "valuation-local-1",
            localRateSnapshotId: "rate-local-1",
            baseRevision: 1,
            policy: "MANUAL_AGREED",
            rateQuoteId: null,
            paymentRecordId: null,
            manualRate: "1.95",
            reason: null,
            previewSettlement: { minor: 19_500, currency: "NZD", scale: 2 },
          }),
        },
      ),
    );

    expect(payment.status).toBe(201);
    expect(await payment.json()).toMatchObject({
      entity: {
        posted: { minor: 19_943, currency: "NZD" },
        authorizedAt: null,
        bankFxRate: null,
      },
    });
    expect(gateway.addLedgerPaymentRecord).toHaveBeenCalledOnce();
    expect(manualWithoutReason.status).toBe(400);
    expect(gateway.applyLedgerValuation).not.toHaveBeenCalled();
  });

  it("updates Ledger expenses through the v2 aggregate route", async () => {
    const { gateway } = createGateway();
    const handle = createDevBackendHandler({ gateway });
    const created = await handle(
      new Request(`http://localhost/v2/trips/${tripId}/expenses`, {
        method: "POST",
        headers: {
          Authorization: "Bearer valid-token",
          "Content-Type": "application/json",
          "Idempotency-Key": "ledger-operation-1",
        },
        body: JSON.stringify(ledgerExpenseBody),
      }),
    );
    const { serverId } = (await created.json()) as { serverId: string };
    const updated = await handle(
      new Request(`http://localhost/v2/trips/${tripId}/expenses/${serverId}`, {
        method: "PUT",
        headers: {
          Authorization: "Bearer valid-token",
          "Content-Type": "application/json",
          "Idempotency-Key": "ledger-operation-2",
        },
        body: JSON.stringify({
          ...ledgerExpenseBody,
          title: "Dinner corrected",
          baseRevision: 1,
          auditReason: null,
        }),
      }),
    );

    expect(updated.status).toBe(200);
    expect(await updated.json()).toMatchObject({
      serverId,
      revision: 2,
      entity: { title: "Dinner corrected" },
    });
  });

  it("keeps organizer reason and stale revision failures distinct", async () => {
    const { gateway } = createGateway();
    const handle = createDevBackendHandler({ gateway });
    const created = await handle(
      new Request(`http://localhost/v2/trips/${tripId}/expenses`, {
        method: "POST",
        headers: {
          Authorization: "Bearer valid-token",
          "Content-Type": "application/json",
          "Idempotency-Key": "ledger-operation-1",
        },
        body: JSON.stringify(ledgerExpenseBody),
      }),
    );
    const { serverId } = (await created.json()) as { serverId: string };
    const request = (body: unknown) =>
      new Request(`http://localhost/v2/trips/${tripId}/expenses/${serverId}`, {
        method: "PUT",
        headers: {
          Authorization: "Bearer valid-token",
          "Content-Type": "application/json",
          "Idempotency-Key": "ledger-operation-x",
        },
        body: JSON.stringify(body),
      });

    const missingReason = await handle(
      request({
        ...ledgerExpenseBody,
        title: "Organizer correction",
        baseRevision: 1,
        auditReason: null,
      }),
    );
    const stale = await handle(
      request({
        ...ledgerExpenseBody,
        title: "Dinner stale",
        baseRevision: 99,
        auditReason: null,
      }),
    );

    expect(missingReason.status).toBe(400);
    expect(await missingReason.json()).toMatchObject({
      error: { code: "INVALID_PAYLOAD" },
    });
    expect(stale.status).toBe(409);
    expect(await stale.json()).toMatchObject({
      error: { code: "REVISION_CONFLICT" },
    });
  });

  it("preserves the structured conflict envelope in a stale response", async () => {
    const { gateway } = createGateway();
    const current = await gateway.createLedgerExpense(
      userId,
      tripId,
      "seed-conflict",
      ledgerExpenseBody,
    );
    const submitted = { ...ledgerExpenseBody, localId: undefined };
    vi.mocked(gateway.updateLedgerExpense).mockRejectedValueOnce(
      new BackendError(409, "REVISION_CONFLICT", "stale", {
        error: {
          code: "REVISION_CONFLICT",
          conflictId: "70000000-0000-4000-8000-000000000001",
          expenseId: current.serverId,
          baseRevision: 1,
          currentRevision: 2,
          submitted,
          current: current.entity,
          changedGroups: ["FINANCIAL_CORE"],
          auditSummaries: current.entity.auditEvents,
        },
      }),
    );
    const response = await createDevBackendHandler({ gateway })(
      new Request(`http://localhost/v2/trips/${tripId}/expenses/${current.serverId}`, {
        method: "PUT",
        headers: {
          Authorization: "Bearer valid-token",
          "Content-Type": "application/json",
          "Idempotency-Key": "conflict-key",
        },
        body: JSON.stringify({
          ...ledgerExpenseBody,
          baseRevision: 1,
          auditReason: null,
        }),
      }),
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: {
        code: "REVISION_CONFLICT",
        conflictId: "70000000-0000-4000-8000-000000000001",
        currentRevision: 2,
        changedGroups: ["FINANCIAL_CORE"],
      },
    });
  });

  it("routes explicit conflict resolution and separate correction commands", async () => {
    const { gateway } = createGateway();
    const current = await gateway.createLedgerExpense(
      userId,
      tripId,
      "seed-collaboration",
      ledgerExpenseBody,
    );
    vi.mocked(gateway.resolveLedgerExpenseConflict).mockResolvedValueOnce(current);
    vi.mocked(gateway.createLedgerCorrection).mockResolvedValueOnce({
      correction: {
        id: "71000000-0000-4000-8000-000000000001",
        journeyId: tripId,
        expenseId: current.serverId,
        baseExpenseRevision: 1,
        proposedExpense: ledgerExpenseBody,
        reason: "Wrong payer",
        status: "OPEN",
        requestedByUserId: userId,
        requestedByMemberId: memberB,
        resolvedByUserId: null,
        resolvedByMemberId: null,
        resolutionReason: null,
        resultingExpenseRevision: null,
        revision: 1,
        createdAt: "2026-09-12T00:00:00.000Z",
        updatedAt: "2026-09-12T00:00:00.000Z",
        resolvedAt: null,
      },
      expense: null,
      idempotentReplay: false,
    });
    const editable = { ...ledgerExpenseBody };
    delete (editable as Partial<typeof ledgerExpenseBody>).localId;
    const selectedSources = {
      FINANCIAL_CORE: "JOURNEY",
      DESCRIPTIVE: "JOURNEY",
      LINKS: "JOURNEY",
      EVIDENCE: "JOURNEY",
      LIFECYCLE: "JOURNEY",
    };

    const resolved = await createDevBackendHandler({ gateway })(
      new Request(
        `http://localhost/v2/trips/${tripId}/expenses/${current.serverId}/conflict-resolution`,
        {
          method: "POST",
          headers: {
            Authorization: "Bearer valid-token",
            "Content-Type": "application/json",
            "Idempotency-Key": "resolution-key",
          },
          body: JSON.stringify({
            conflictId: "70000000-0000-4000-8000-000000000001",
            currentRevision: 1,
            resolution: "KEEP_JOURNEY",
            resolvedExpense: editable,
            selectedSources,
            reason: "Reviewed both versions",
          }),
        },
      ),
    );
    const proposed = await createDevBackendHandler({ gateway })(
      new Request(
        `http://localhost/v2/trips/${tripId}/expenses/${current.serverId}/corrections`,
        {
          method: "POST",
          headers: {
            Authorization: "Bearer valid-token",
            "Content-Type": "application/json",
            "Idempotency-Key": "correction-key",
          },
          body: JSON.stringify({
            localId: "local-correction",
            baseRevision: 1,
            proposedExpense: editable,
            reason: "Wrong payer",
          }),
        },
      ),
    );

    expect(resolved.status).toBe(200);
    expect(proposed.status).toBe(201);
    expect(gateway.resolveLedgerExpenseConflict).toHaveBeenCalledOnce();
    expect(gateway.createLedgerCorrection).toHaveBeenCalledOnce();
  });

  it("rejects unauthorized Ledger reads before returning data", async () => {
    const { gateway } = createGateway({ authorized: false });
    const response = await createDevBackendHandler({ gateway })(
      new Request(`http://localhost/v2/trips/${tripId}/ledger/bootstrap`, {
        headers: { Authorization: "Bearer valid-token" },
      }),
    );

    expect(response.status).toBe(403);
    expect(gateway.bootstrapLedger).not.toHaveBeenCalled();
  });

  it("authorizes Review refresh/actions and receipt re-download", async () => {
    const { gateway } = createGateway();
    const findingId = "60000000-0000-4000-8000-000000000001";
    const actionId = "60000000-0000-4000-8000-000000000002";
    vi.mocked(gateway.actOnLedgerReviewFinding).mockResolvedValue({
      finding: {
        id: findingId,
        journeyId: tripId,
        expenseId: "60000000-0000-4000-8000-000000000003",
        settlementId: null,
        layer: "HEURISTIC",
        findingType: "POSSIBLE_DUPLICATE",
        severity: "WARNING",
        confidence: 0.9,
        evidenceCodes: ["SAME_PAYER_AMOUNT_CURRENCY_TITLE"],
        status: "DISMISSED",
        rulesetVersion: "ledger-review-v1",
        entityRevision: 1,
        revision: 2,
        createdAt: "2026-09-13T00:00:00.000Z",
        updatedAt: "2026-09-13T00:00:01.000Z",
      },
      action: {
        id: actionId,
        findingId,
        action: "DISMISSED",
        actorUserId: userId,
        actorMemberId: memberA,
        actorRole: "owner",
        reason: "False positive",
        findingRevision: 1,
        entityRevision: 1,
        rulesetVersion: "ledger-review-v1",
        operationId: actionId,
        createdAt: "2026-09-13T00:00:01.000Z",
      },
      idempotentReplay: false,
    });
    const handle = createDevBackendHandler({ gateway });
    const refresh = await handle(
      new Request(`http://localhost/v2/trips/${tripId}/ledger/review/refresh`, {
        method: "POST",
        headers: { Authorization: "Bearer valid-token" },
      }),
    );
    const action = await handle(
      new Request(
        `http://localhost/v2/trips/${tripId}/review-findings/${findingId}/actions`,
        {
          method: "POST",
          headers: {
            Authorization: "Bearer valid-token",
            "Content-Type": "application/json",
            "Idempotency-Key": actionId,
          },
          body: JSON.stringify({
            action: "DISMISSED",
            baseRevision: 1,
            reason: "False positive",
            operationId: actionId,
          }),
        },
      ),
    );
    const content = await handle(
      new Request(`http://localhost/v2/trips/${tripId}/receipts/${findingId}/content`, {
        headers: { Authorization: "Bearer valid-token" },
      }),
    );

    expect([refresh.status, action.status, content.status]).toEqual([200, 200, 200]);
    expect(await content.arrayBuffer()).toEqual(new Uint8Array([1, 2, 3]).buffer);
  });
});
