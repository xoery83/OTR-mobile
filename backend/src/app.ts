import { randomUUID } from "node:crypto";

import {
  createExpenseRequestSchema,
  createItineraryItemRequestSchema,
  type CreateExpenseRequest,
  type CreateItineraryItemRequest,
  type CreateSyncResponse,
} from "../../src/data/api/devSyncContracts";
import {
  createLedgerCorrectionRequestSchema,
  createLedgerPaymentRecordRequestSchema,
  applyLedgerValuationRequestSchema,
  createLedgerExpenseRequestSchema,
  ledgerCorrectionActionRequestSchema,
  lifecycleLedgerExpenseRequestSchema,
  resolveLedgerExpenseConflictRequestSchema,
  type CreateLedgerCorrectionRequest,
  type CreateLedgerExpenseRequest,
  type CreateLedgerPaymentRecordRequest,
  type ApplyLedgerValuationRequest,
  type LedgerCorrectionActionRequest,
  type LedgerCorrectionMutationResponse,
  type LifecycleLedgerExpenseRequest,
  type LedgerExpenseMutationResponse,
  type ResolveLedgerExpenseConflictRequest,
  type UpdateLedgerExpenseRequest,
  updateLedgerExpenseRequestSchema,
} from "../../src/data/api/ledgerMutationContracts";
import type {
  LedgerBootstrapResponse,
  LedgerChangesResponse,
  LedgerRateQuoteDto,
  LedgerPaymentRecordDto,
  MyLedgerResponse,
} from "../../src/data/api/ledgerReadContracts";

import { deriveServerId, type SyncEntityType } from "./serverId";

export type AuthenticatedUser = { id: string };

export type StoredCreate = {
  id: string;
  tripId: string;
  createdByUserId: string;
  updatedAt: string;
};

export type DevBackendGateway = {
  validateAccessToken(token: string): Promise<AuthenticatedUser | null>;
  canReadTrip(userId: string, tripId: string): Promise<boolean>;
  canWriteTrip(userId: string, tripId: string): Promise<boolean>;
  bootstrapLedger(userId: string, tripId: string): Promise<LedgerBootstrapResponse>;
  pullLedgerChanges(
    userId: string,
    tripId: string,
    cursor: string | null,
  ): Promise<LedgerChangesResponse>;
  readMyLedger(userId: string): Promise<MyLedgerResponse>;
  readLedgerRateQuotes(
    userId: string,
    tripId: string,
    quoteCurrency: string | null,
    baseCurrency: string | null,
  ): Promise<LedgerRateQuoteDto[]>;
  createLedgerExpense(
    userId: string,
    tripId: string,
    idempotencyKey: string,
    input: CreateLedgerExpenseRequest,
  ): Promise<LedgerExpenseMutationResponse>;
  updateLedgerExpense(
    userId: string,
    tripId: string,
    expenseId: string,
    idempotencyKey: string,
    input: UpdateLedgerExpenseRequest,
  ): Promise<LedgerExpenseMutationResponse>;
  deleteLedgerExpense(
    userId: string,
    tripId: string,
    expenseId: string,
    idempotencyKey: string,
    input: LifecycleLedgerExpenseRequest,
  ): Promise<LedgerExpenseMutationResponse>;
  restoreLedgerExpense(
    userId: string,
    tripId: string,
    expenseId: string,
    idempotencyKey: string,
    input: LifecycleLedgerExpenseRequest,
  ): Promise<LedgerExpenseMutationResponse>;
  resolveLedgerExpenseConflict(
    userId: string,
    tripId: string,
    expenseId: string,
    idempotencyKey: string,
    input: ResolveLedgerExpenseConflictRequest,
  ): Promise<LedgerExpenseMutationResponse>;
  createLedgerCorrection(
    userId: string,
    tripId: string,
    expenseId: string,
    idempotencyKey: string,
    input: CreateLedgerCorrectionRequest,
  ): Promise<LedgerCorrectionMutationResponse>;
  actOnLedgerCorrection(
    userId: string,
    tripId: string,
    correctionId: string,
    action: "accept" | "reject" | "withdraw",
    idempotencyKey: string,
    input: LedgerCorrectionActionRequest,
  ): Promise<LedgerCorrectionMutationResponse>;
  addLedgerPaymentRecord(
    userId: string,
    tripId: string,
    expenseId: string,
    idempotencyKey: string,
    input: CreateLedgerPaymentRecordRequest,
  ): Promise<{
    entity: LedgerPaymentRecordDto;
    serverId: string;
    revision: 1;
    updatedAt: string;
    idempotentReplay: boolean;
  }>;
  applyLedgerValuation(
    userId: string,
    tripId: string,
    expenseId: string,
    idempotencyKey: string,
    input: ApplyLedgerValuationRequest,
  ): Promise<LedgerExpenseMutationResponse>;
  createFinalizedSettlementGuardFixture(
    userId: string,
    tripId: string,
    expenseId: string,
  ): Promise<{ ok: true }>;
  findExpense(id: string): Promise<StoredCreate | null>;
  createExpense(
    id: string,
    tripId: string,
    userId: string,
    input: CreateExpenseRequest,
  ): Promise<StoredCreate>;
  findItineraryItem(id: string): Promise<StoredCreate | null>;
  createItineraryItem(
    id: string,
    tripId: string,
    userId: string,
    input: CreateItineraryItemRequest,
  ): Promise<StoredCreate>;
};

export type SafeLogEvent = {
  requestId: string;
  route: string;
  status: number;
  durationMs: number;
};

export type BackendDependencies = {
  gateway: DevBackendGateway;
  log?: (event: SafeLogEvent) => void;
  now?: () => number;
};

class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export class BackendError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

const idempotencyKeyPattern = /^[A-Za-z0-9._:-]{1,200}$/;
const routePattern = /^\/v1\/trips\/([^/]+)\/(expenses|itinerary-items)$/;
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function json(status: number, body: unknown) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function getBearerToken(request: Request) {
  const header = request.headers.get("authorization");
  const match = header?.match(/^Bearer ([^\s]+)$/);
  if (!match) throw new HttpError(401, "AUTH_REQUIRED", "Authentication is required.");
  return match[1];
}

function getIdempotencyKey(request: Request) {
  const value = request.headers.get("idempotency-key") ?? "";
  if (!idempotencyKeyPattern.test(value)) {
    throw new HttpError(
      400,
      "INVALID_IDEMPOTENCY_KEY",
      "A valid Idempotency-Key header is required.",
    );
  }
  return value;
}

async function parseBody(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > 32_768) {
    throw new HttpError(413, "PAYLOAD_TOO_LARGE", "The request body is too large.");
  }

  const text = await request.text();
  if (text.length > 32_768) {
    throw new HttpError(413, "PAYLOAD_TOO_LARGE", "The request body is too large.");
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new HttpError(400, "INVALID_JSON", "The request body must be valid JSON.");
  }
}

function assertOriginalCreate(stored: StoredCreate, tripId: string, userId: string) {
  if (stored.tripId !== tripId || stored.createdByUserId !== userId) {
    throw new HttpError(409, "IDEMPOTENCY_CONFLICT", "The idempotency key conflicts.");
  }
}

function createResponse(stored: StoredCreate, idempotentReplay: boolean) {
  return {
    serverId: stored.id,
    version: 1,
    updatedAt: stored.updatedAt,
    idempotentReplay,
  } satisfies CreateSyncResponse;
}

async function authenticate(request: Request, gateway: DevBackendGateway) {
  const user = await gateway.validateAccessToken(getBearerToken(request));
  if (!user) throw new HttpError(401, "INVALID_SESSION", "The session is invalid.");
  return user;
}

function assertTripId(tripId: string) {
  if (!uuidPattern.test(tripId)) {
    throw new HttpError(400, "INVALID_TRIP_ID", "The trip id is invalid.");
  }
}

async function authorizeRead(
  request: Request,
  gateway: DevBackendGateway,
  tripId: string,
) {
  assertTripId(tripId);
  const user = await authenticate(request, gateway);
  if (!(await gateway.canReadTrip(user.id, tripId))) {
    throw new HttpError(403, "TRIP_READ_FORBIDDEN", "Trip read access is required.");
  }
  return user;
}

async function createEntity(
  request: Request,
  gateway: DevBackendGateway,
  entityType: SyncEntityType,
  tripId: string,
) {
  const user = await authenticate(request, gateway);
  const input = await parseBody(request);
  const parsed =
    entityType === "expense"
      ? createExpenseRequestSchema.safeParse(input)
      : createItineraryItemRequestSchema.safeParse(input);

  if (!parsed.success) {
    throw new HttpError(400, "INVALID_PAYLOAD", "The request payload is invalid.");
  }
  assertTripId(tripId);
  if (!(await gateway.canWriteTrip(user.id, tripId))) {
    throw new HttpError(403, "TRIP_WRITE_FORBIDDEN", "Trip write access is required.");
  }

  const idempotencyKey = getIdempotencyKey(request);
  const serverId = deriveServerId(user.id, entityType, idempotencyKey);
  const existing =
    entityType === "expense"
      ? await gateway.findExpense(serverId)
      : await gateway.findItineraryItem(serverId);

  if (existing) {
    assertOriginalCreate(existing, tripId, user.id);
    return json(200, createResponse(existing, true));
  }

  const stored =
    entityType === "expense"
      ? await gateway.createExpense(
          serverId,
          tripId,
          user.id,
          parsed.data as CreateExpenseRequest,
        )
      : await gateway.createItineraryItem(
          serverId,
          tripId,
          user.id,
          parsed.data as CreateItineraryItemRequest,
        );

  return json(201, createResponse(stored, false));
}

async function createLedgerExpense(request: Request, gateway: DevBackendGateway) {
  const url = new URL(request.url);
  const match = url.pathname.match(/^\/v2\/trips\/([^/]+)\/expenses$/);
  if (!match) throw new HttpError(404, "NOT_FOUND", "The endpoint does not exist.");

  const [, tripId] = match;
  const user = await authenticate(request, gateway);
  const input = await parseBody(request);
  const parsed = createLedgerExpenseRequestSchema.safeParse(input);
  if (!parsed.success) {
    throw new HttpError(400, "INVALID_PAYLOAD", "The request payload is invalid.");
  }
  assertTripId(tripId);
  if (!(await gateway.canWriteTrip(user.id, tripId))) {
    throw new HttpError(403, "TRIP_WRITE_FORBIDDEN", "Trip write access is required.");
  }

  const response = await gateway.createLedgerExpense(
    user.id,
    tripId,
    getIdempotencyKey(request),
    parsed.data,
  );
  return json(response.idempotentReplay ? 200 : 201, response);
}

async function mutateLedgerExpense(request: Request, gateway: DevBackendGateway) {
  const url = new URL(request.url);
  const match = url.pathname.match(
    /^\/v2\/trips\/([^/]+)\/expenses\/([^/]+)(?:\/(restore))?$/,
  );
  if (!match) throw new HttpError(404, "NOT_FOUND", "The endpoint does not exist.");

  const [, tripId, expenseId, action] = match;
  assertTripId(tripId);
  if (!uuidPattern.test(expenseId)) {
    throw new HttpError(400, "INVALID_EXPENSE_ID", "The expense id is invalid.");
  }

  const input = await parseBody(request);
  const parsed =
    request.method === "PUT"
      ? updateLedgerExpenseRequestSchema.safeParse(input)
      : lifecycleLedgerExpenseRequestSchema.safeParse(input);
  if (!parsed.success) {
    throw new HttpError(400, "INVALID_PAYLOAD", "The request payload is invalid.");
  }

  const user = await authenticate(request, gateway);
  if (!(await gateway.canWriteTrip(user.id, tripId))) {
    throw new HttpError(403, "TRIP_WRITE_FORBIDDEN", "Trip write access is required.");
  }

  const idempotencyKey = getIdempotencyKey(request);
  if (request.method === "PUT") {
    return json(
      200,
      await gateway.updateLedgerExpense(
        user.id,
        tripId,
        expenseId,
        idempotencyKey,
        parsed.data as UpdateLedgerExpenseRequest,
      ),
    );
  }
  if (request.method === "DELETE") {
    return json(
      200,
      await gateway.deleteLedgerExpense(
        user.id,
        tripId,
        expenseId,
        idempotencyKey,
        parsed.data as LifecycleLedgerExpenseRequest,
      ),
    );
  }
  if (request.method === "POST" && action === "restore") {
    return json(
      200,
      await gateway.restoreLedgerExpense(
        user.id,
        tripId,
        expenseId,
        idempotencyKey,
        parsed.data as LifecycleLedgerExpenseRequest,
      ),
    );
  }
  throw new HttpError(404, "NOT_FOUND", "The endpoint does not exist.");
}

async function resolveLedgerExpenseConflict(
  request: Request,
  gateway: DevBackendGateway,
) {
  const match = new URL(request.url).pathname.match(
    /^\/v2\/trips\/([^/]+)\/expenses\/([^/]+)\/conflict-resolution$/,
  );
  if (!match) throw new HttpError(404, "NOT_FOUND", "The endpoint does not exist.");
  const [, tripId, expenseId] = match;
  assertTripId(tripId);
  if (!uuidPattern.test(expenseId)) {
    throw new HttpError(400, "INVALID_EXPENSE_ID", "The expense id is invalid.");
  }
  const parsed = resolveLedgerExpenseConflictRequestSchema.safeParse(
    await parseBody(request),
  );
  if (!parsed.success) {
    throw new HttpError(400, "INVALID_PAYLOAD", "The request payload is invalid.");
  }
  const user = await authenticate(request, gateway);
  if (!(await gateway.canWriteTrip(user.id, tripId))) {
    throw new HttpError(403, "TRIP_WRITE_FORBIDDEN", "Trip write access is required.");
  }
  return json(
    200,
    await gateway.resolveLedgerExpenseConflict(
      user.id,
      tripId,
      expenseId,
      getIdempotencyKey(request),
      parsed.data,
    ),
  );
}

async function mutateLedgerCorrection(request: Request, gateway: DevBackendGateway) {
  const path = new URL(request.url).pathname;
  const createMatch = path.match(
    /^\/v2\/trips\/([^/]+)\/expenses\/([^/]+)\/corrections$/,
  );
  const actionMatch = path.match(
    /^\/v2\/trips\/([^/]+)\/corrections\/([^/]+)\/(accept|reject|withdraw)$/,
  );
  if (!createMatch && !actionMatch) {
    throw new HttpError(404, "NOT_FOUND", "The endpoint does not exist.");
  }
  const tripId = (createMatch ?? actionMatch)![1];
  const targetId = (createMatch ?? actionMatch)![2];
  assertTripId(tripId);
  if (!uuidPattern.test(targetId)) {
    throw new HttpError(400, "INVALID_ENTITY_ID", "The entity id is invalid.");
  }
  const user = await authenticate(request, gateway);
  if (!(await gateway.canWriteTrip(user.id, tripId))) {
    throw new HttpError(403, "TRIP_WRITE_FORBIDDEN", "Trip write access is required.");
  }
  const idempotencyKey = getIdempotencyKey(request);
  if (createMatch) {
    const parsed = createLedgerCorrectionRequestSchema.safeParse(
      await parseBody(request),
    );
    if (!parsed.success) {
      throw new HttpError(400, "INVALID_PAYLOAD", "The request payload is invalid.");
    }
    return json(
      201,
      await gateway.createLedgerCorrection(
        user.id,
        tripId,
        targetId,
        idempotencyKey,
        parsed.data,
      ),
    );
  }
  const parsed = ledgerCorrectionActionRequestSchema.safeParse(await parseBody(request));
  if (!parsed.success) {
    throw new HttpError(400, "INVALID_PAYLOAD", "The request payload is invalid.");
  }
  return json(
    200,
    await gateway.actOnLedgerCorrection(
      user.id,
      tripId,
      targetId,
      actionMatch![3] as "accept" | "reject" | "withdraw",
      idempotencyKey,
      parsed.data,
    ),
  );
}

async function createFinalizedGuardFixture(request: Request, gateway: DevBackendGateway) {
  const url = new URL(request.url);
  const match = url.pathname.match(
    /^\/v2\/dev\/trips\/([^/]+)\/expenses\/([^/]+)\/finalized-guard-fixture$/,
  );
  if (!match) throw new HttpError(404, "NOT_FOUND", "The endpoint does not exist.");
  const [, tripId, expenseId] = match;
  assertTripId(tripId);
  if (!uuidPattern.test(expenseId)) {
    throw new HttpError(400, "INVALID_EXPENSE_ID", "The expense id is invalid.");
  }
  const user = await authenticate(request, gateway);
  if (!(await gateway.canWriteTrip(user.id, tripId))) {
    throw new HttpError(403, "TRIP_WRITE_FORBIDDEN", "Trip write access is required.");
  }
  return json(
    200,
    await gateway.createFinalizedSettlementGuardFixture(user.id, tripId, expenseId),
  );
}

async function createLedgerEvidence(request: Request, gateway: DevBackendGateway) {
  const match = new URL(request.url).pathname.match(
    /^\/v2\/trips\/([^/]+)\/expenses\/([^/]+)\/(payment-records|valuations)$/,
  );
  if (!match) throw new HttpError(404, "NOT_FOUND", "The endpoint does not exist.");
  const [, tripId, expenseId, resource] = match;
  assertTripId(tripId);
  if (!uuidPattern.test(expenseId))
    throw new HttpError(400, "INVALID_EXPENSE_ID", "The expense id is invalid.");
  const user = await authenticate(request, gateway);
  if (!(await gateway.canWriteTrip(user.id, tripId)))
    throw new HttpError(403, "TRIP_WRITE_FORBIDDEN", "Trip write access is required.");
  const body = await parseBody(request);
  const idempotencyKey = getIdempotencyKey(request);
  if (resource === "payment-records") {
    const parsed = createLedgerPaymentRecordRequestSchema.safeParse(body);
    if (!parsed.success)
      throw new HttpError(400, "INVALID_PAYLOAD", "The request payload is invalid.");
    const response = await gateway.addLedgerPaymentRecord(
      user.id,
      tripId,
      expenseId,
      idempotencyKey,
      parsed.data,
    );
    return json(response.idempotentReplay ? 200 : 201, response);
  }
  const parsed = applyLedgerValuationRequestSchema.safeParse(body);
  if (!parsed.success)
    throw new HttpError(400, "INVALID_PAYLOAD", "The request payload is invalid.");
  return json(
    200,
    await gateway.applyLedgerValuation(
      user.id,
      tripId,
      expenseId,
      idempotencyKey,
      parsed.data,
    ),
  );
}

async function readEntity(request: Request, gateway: DevBackendGateway) {
  const url = new URL(request.url);
  if (url.pathname === "/v2/me/ledger") {
    const user = await authenticate(request, gateway);
    return json(200, await gateway.readMyLedger(user.id));
  }

  const match = url.pathname.match(
    /^\/v2\/trips\/([^/]+)\/ledger\/(bootstrap|changes|rate-quotes)$/,
  );
  if (!match) throw new HttpError(404, "NOT_FOUND", "The endpoint does not exist.");

  const [, tripId, resource] = match;
  const user = await authorizeRead(request, gateway, tripId);
  if (resource === "bootstrap") {
    return json(200, await gateway.bootstrapLedger(user.id, tripId));
  }
  if (resource === "rate-quotes") {
    return json(
      200,
      await gateway.readLedgerRateQuotes(
        user.id,
        tripId,
        url.searchParams.get("quoteCurrency"),
        url.searchParams.get("baseCurrency"),
      ),
    );
  }
  return json(
    200,
    await gateway.pullLedgerChanges(user.id, tripId, url.searchParams.get("cursor")),
  );
}

export function createDevBackendHandler({
  gateway,
  log,
  now = Date.now,
}: BackendDependencies) {
  return async function handle(request: Request) {
    const startedAt = now();
    const requestId = randomUUID();
    let route = "unknown";
    let response: Response;

    try {
      const url = new URL(request.url);
      if (request.method === "GET" && url.pathname === "/health") {
        route = "health";
        response = json(200, { status: "ok", environment: "development" });
      } else if (request.method === "GET" && url.pathname.startsWith("/v2/")) {
        route = url.pathname;
        response = await readEntity(request, gateway);
      } else if (request.method === "POST" && url.pathname.startsWith("/v2/dev/")) {
        route = "/v2/dev/trips/:tripId/expenses/:expenseId/finalized-guard-fixture";
        response = await createFinalizedGuardFixture(request, gateway);
      } else if (
        request.method === "POST" &&
        /\/expenses\/[^/]+\/(payment-records|valuations)$/.test(url.pathname)
      ) {
        route = "/v2/trips/:tripId/expenses/:expenseId/evidence";
        response = await createLedgerEvidence(request, gateway);
      } else if (
        request.method === "POST" &&
        url.pathname.endsWith("/conflict-resolution")
      ) {
        route = "/v2/trips/:tripId/expenses/:expenseId/conflict-resolution";
        response = await resolveLedgerExpenseConflict(request, gateway);
      } else if (
        request.method === "POST" &&
        (url.pathname.endsWith("/corrections") ||
          /\/corrections\/[^/]+\/(accept|reject|withdraw)$/.test(url.pathname))
      ) {
        route = "/v2/trips/:tripId/corrections";
        response = await mutateLedgerCorrection(request, gateway);
      } else if (
        ["PUT", "DELETE"].includes(request.method) ||
        (request.method === "POST" && /\/expenses\/[^/]+\/restore$/.test(url.pathname))
      ) {
        route = "/v2/trips/:tripId/expenses/:expenseId";
        response = await mutateLedgerExpense(request, gateway);
      } else if (request.method === "POST" && url.pathname.startsWith("/v2/")) {
        route = "/v2/trips/:tripId/expenses";
        response = await createLedgerExpense(request, gateway);
      } else {
        const match = url.pathname.match(routePattern);
        if (request.method !== "POST" || !match) {
          throw new HttpError(404, "NOT_FOUND", "The endpoint does not exist.");
        }

        const [, tripId, resource] = match;
        route = resource;
        response = await createEntity(
          request,
          gateway,
          resource === "expenses" ? "expense" : "itinerary",
          tripId,
        );
      }
    } catch (error) {
      const normalized =
        error instanceof HttpError
          ? error
          : error instanceof BackendError
            ? new HttpError(error.status, error.code, error.message, error.details)
            : new HttpError(503, "BACKEND_UNAVAILABLE", "The backend is unavailable.");
      response = json(normalized.status, {
        error: {
          code: normalized.code,
          message: normalized.message,
          requestId,
          ...(normalized.details &&
          typeof normalized.details === "object" &&
          "error" in normalized.details
            ? ((normalized.details as { error: Record<string, unknown> }).error ?? {})
            : {}),
        },
      });
    }

    response.headers.set("X-Request-Id", requestId);
    log?.({ requestId, route, status: response.status, durationMs: now() - startedAt });
    return response;
  };
}
