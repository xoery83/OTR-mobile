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
    readMyLedger: vi.fn(async () => ({
      reportingCurrency: "NZD",
      journeys: [],
      serverTime: "2026-09-11T00:00:00.000Z",
    })),
    readLedgerRateQuotes: vi.fn(async () => []),
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
});
