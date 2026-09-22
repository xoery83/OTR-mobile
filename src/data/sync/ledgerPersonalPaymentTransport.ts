import { ApiClientError, createApiClient } from "@/data/api/client";
import {
  createPersonalSettlementPaymentRequestSchema,
  deletePersonalSettlementPaymentRequestSchema,
  personalSettlementPaymentListResponseSchema,
  personalSettlementPaymentMutationResponseSchema,
  updatePersonalSettlementPaymentRequestSchema,
  type CreatePersonalSettlementPaymentRequest,
  type DeletePersonalSettlementPaymentRequest,
  type UpdatePersonalSettlementPaymentRequest,
} from "@/data/api/ledgerSettlementContracts";
import { ledgerChangesResponseSchema } from "@/data/api/ledgerReadContracts";
import { readLocalSession } from "@/data/auth/authRepository";

type Dependencies = {
  readSession?: typeof readLocalSession;
  createClient?: (accessToken: string) => ReturnType<typeof createApiClient>;
};

async function client(dependencies: Dependencies) {
  const session = await (dependencies.readSession ?? readLocalSession)();
  if (!session?.accessToken)
    throw new ApiClientError(
      "Authentication is unavailable.",
      "http",
      401,
      "AUTH_REQUIRED",
    );
  return (
    dependencies.createClient ?? ((token) => createApiClient({ accessToken: token }))
  )(session.accessToken);
}

export function createLedgerPersonalPaymentTransport(dependencies: Dependencies = {}) {
  return {
    async create(
      journeyId: string,
      input: CreatePersonalSettlementPaymentRequest,
      idempotencyKey: string,
    ) {
      return (await client(dependencies)).post(
        `/v2/trips/${journeyId}/ledger/personal-payments`,
        createPersonalSettlementPaymentRequestSchema.parse(input),
        personalSettlementPaymentMutationResponseSchema,
        { "Idempotency-Key": idempotencyKey },
      );
    },
    async update(
      journeyId: string,
      id: string,
      input: UpdatePersonalSettlementPaymentRequest,
      idempotencyKey: string,
    ) {
      return (await client(dependencies)).patch(
        `/v2/trips/${journeyId}/ledger/personal-payments/${id}`,
        updatePersonalSettlementPaymentRequestSchema.parse(input),
        personalSettlementPaymentMutationResponseSchema,
        { "Idempotency-Key": idempotencyKey },
      );
    },
    async remove(
      journeyId: string,
      id: string,
      input: DeletePersonalSettlementPaymentRequest,
      idempotencyKey: string,
    ) {
      return (await client(dependencies)).delete(
        `/v2/trips/${journeyId}/ledger/personal-payments/${id}`,
        deletePersonalSettlementPaymentRequestSchema.parse(input),
        personalSettlementPaymentMutationResponseSchema,
        { "Idempotency-Key": idempotencyKey },
      );
    },
    async list(journeyId: string, includeDeleted = true) {
      return (await client(dependencies)).get(
        `/v2/trips/${journeyId}/ledger/personal-payments?includeDeleted=${includeDeleted}`,
        personalSettlementPaymentListResponseSchema,
      );
    },
    async changes(journeyId: string, cursor: string | null) {
      const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
      return (await client(dependencies)).get(
        `/v2/trips/${journeyId}/ledger/personal-payments/changes${query}`,
        ledgerChangesResponseSchema,
      );
    },
  };
}
