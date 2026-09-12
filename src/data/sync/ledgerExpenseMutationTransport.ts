import { createApiClient } from "@/data/api/client";
import {
  createLedgerCorrectionRequestSchema,
  createLedgerPaymentRecordRequestSchema,
  applyLedgerValuationRequestSchema,
  ledgerCorrectionActionRequestSchema,
  ledgerCorrectionMutationResponseSchema,
  ledgerPaymentRecordMutationResponseSchema,
  ledgerExpenseMutationResponseSchema,
  resolveLedgerExpenseConflictRequestSchema,
  type CreateLedgerCorrectionRequest,
  type CreateLedgerExpenseRequest,
  type CreateLedgerPaymentRecordRequest,
  type ApplyLedgerValuationRequest,
  type LifecycleLedgerExpenseRequest,
  type UpdateLedgerExpenseRequest,
  type LedgerCorrectionActionRequest,
  type ResolveLedgerExpenseConflictRequest,
} from "@/data/api/ledgerMutationContracts";
import { readLocalSession } from "@/data/auth/authRepository";

type Dependencies = {
  readSession?: typeof readLocalSession;
  createClient?: (accessToken: string) => ReturnType<typeof createApiClient>;
  simulateResponseLoss?: () => boolean;
};

let responseLossConsumed = false;

function configuredResponseLoss() {
  if (
    process.env.EXPO_PUBLIC_OTR_DEV_SIMULATE_RESPONSE_LOSS_ONCE !== "ledger_expense" ||
    responseLossConsumed
  ) {
    return false;
  }
  responseLossConsumed = true;
  return true;
}

async function client(dependencies: Dependencies) {
  const session = await (dependencies.readSession ?? readLocalSession)();
  if (!session?.accessToken) throw new Error("A Supabase Dev session is required.");
  return (
    dependencies.createClient ?? ((token) => createApiClient({ accessToken: token }))
  )(session.accessToken);
}

export function createLedgerExpenseMutationTransport(dependencies: Dependencies = {}) {
  return {
    async createExpense(input: {
      journeyId: string;
      idempotencyKey: string;
      expense: CreateLedgerExpenseRequest;
    }) {
      const response = await (
        await client(dependencies)
      ).post(
        `/v2/trips/${input.journeyId}/expenses`,
        input.expense,
        ledgerExpenseMutationResponseSchema,
        { "Idempotency-Key": input.idempotencyKey },
      );
      if ((dependencies.simulateResponseLoss ?? configuredResponseLoss)()) {
        throw new Error("Simulated ambiguous response loss after Ledger create.");
      }
      return response;
    },
    async updateExpense(input: {
      journeyId: string;
      serverId: string;
      idempotencyKey: string;
      baseRevision: number;
      auditReason: string | null;
      expense: Omit<UpdateLedgerExpenseRequest, "baseRevision" | "auditReason">;
    }) {
      return (await client(dependencies)).put(
        `/v2/trips/${input.journeyId}/expenses/${input.serverId}`,
        {
          ...input.expense,
          baseRevision: input.baseRevision,
          auditReason: input.auditReason,
        } satisfies UpdateLedgerExpenseRequest,
        ledgerExpenseMutationResponseSchema,
        { "Idempotency-Key": input.idempotencyKey },
      );
    },
    async deleteExpense(input: {
      journeyId: string;
      serverId: string;
      idempotencyKey: string;
      baseRevision: number;
      auditReason: string | null;
    }) {
      return (await client(dependencies)).delete(
        `/v2/trips/${input.journeyId}/expenses/${input.serverId}`,
        {
          baseRevision: input.baseRevision,
          auditReason: input.auditReason,
        } satisfies LifecycleLedgerExpenseRequest,
        ledgerExpenseMutationResponseSchema,
        { "Idempotency-Key": input.idempotencyKey },
      );
    },
    async restoreExpense(input: {
      journeyId: string;
      serverId: string;
      idempotencyKey: string;
      baseRevision: number;
      auditReason: string | null;
      businessStatus: "DRAFT" | "ACCEPTED" | "RATE_REQUIRED";
    }) {
      return (await client(dependencies)).post(
        `/v2/trips/${input.journeyId}/expenses/${input.serverId}/restore`,
        {
          baseRevision: input.baseRevision,
          auditReason: input.auditReason,
          businessStatus: input.businessStatus,
        } satisfies LifecycleLedgerExpenseRequest,
        ledgerExpenseMutationResponseSchema,
        { "Idempotency-Key": input.idempotencyKey },
      );
    },
    async resolveConflict(input: {
      journeyId: string;
      serverId: string;
      idempotencyKey: string;
      resolution: ResolveLedgerExpenseConflictRequest;
    }) {
      return (await client(dependencies)).post(
        `/v2/trips/${input.journeyId}/expenses/${input.serverId}/conflict-resolution`,
        resolveLedgerExpenseConflictRequestSchema.parse(input.resolution),
        ledgerExpenseMutationResponseSchema,
        { "Idempotency-Key": input.idempotencyKey },
      );
    },
    async createCorrection(input: {
      journeyId: string;
      expenseServerId: string;
      idempotencyKey: string;
      correction: CreateLedgerCorrectionRequest;
    }) {
      return (await client(dependencies)).post(
        `/v2/trips/${input.journeyId}/expenses/${input.expenseServerId}/corrections`,
        createLedgerCorrectionRequestSchema.parse(input.correction),
        ledgerCorrectionMutationResponseSchema,
        { "Idempotency-Key": input.idempotencyKey },
      );
    },
    async actOnCorrection(input: {
      journeyId: string;
      correctionServerId: string;
      action: "accept" | "reject" | "withdraw";
      idempotencyKey: string;
      request: LedgerCorrectionActionRequest;
    }) {
      return (await client(dependencies)).post(
        `/v2/trips/${input.journeyId}/corrections/${input.correctionServerId}/${input.action}`,
        ledgerCorrectionActionRequestSchema.parse(input.request),
        ledgerCorrectionMutationResponseSchema,
        { "Idempotency-Key": input.idempotencyKey },
      );
    },
    async addPaymentRecord(input: {
      journeyId: string;
      expenseServerId: string;
      idempotencyKey: string;
      payment: CreateLedgerPaymentRecordRequest;
    }) {
      return (await client(dependencies)).post(
        `/v2/trips/${input.journeyId}/expenses/${input.expenseServerId}/payment-records`,
        createLedgerPaymentRecordRequestSchema.parse(input.payment),
        ledgerPaymentRecordMutationResponseSchema,
        { "Idempotency-Key": input.idempotencyKey },
      );
    },
    async applyValuation(input: {
      journeyId: string;
      expenseServerId: string;
      idempotencyKey: string;
      valuation: ApplyLedgerValuationRequest;
    }) {
      return (await client(dependencies)).post(
        `/v2/trips/${input.journeyId}/expenses/${input.expenseServerId}/valuations`,
        applyLedgerValuationRequestSchema.parse(input.valuation),
        ledgerExpenseMutationResponseSchema,
        { "Idempotency-Key": input.idempotencyKey },
      );
    },
  };
}
