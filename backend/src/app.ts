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
  LedgerAnalysisResponse,
  LedgerBootstrapResponse,
  LedgerChangesResponse,
  LedgerExpenseListResponse,
  LedgerRateQuoteDto,
  LedgerPaymentRecordDto,
  MyLedgerPeriod,
  MyLedgerResponse,
} from "../../src/data/api/ledgerReadContracts";
import {
  journeyCurrencyCommitRequestSchema,
  journeyCurrencyPreviewRequestSchema,
  type JourneyCurrencyCommit,
  type JourneyCurrencyPreview,
} from "../../src/data/api/ledgerCurrencyContracts";
import {
  correctSettlementPaymentRequestSchema,
  recordSettlementPaymentRequestSchema,
  settlementAdjustmentFinalizeRequestSchema,
  settlementPaymentActionRequestSchema,
  settlementFinalizeRequestSchema,
  settlementPreviewRequestSchema,
  type CorrectSettlementPaymentRequest,
  type RecordSettlementPaymentRequest,
  type SettlementAdjustmentFinalizeRequest,
  type SettlementAdjustmentMutationResponse,
  type SettlementAdjustmentPreviewResponse,
  type SettlementFinalizeResponse,
  type SettlementPaymentActionRequest,
  type SettlementPaymentMutationResponse,
  type SettlementPreviewResponse,
} from "../../src/data/api/ledgerSettlementContracts";
import type {
  ReportingDimension,
  ReportingFilters,
  ReportingScope,
} from "../../src/domain/ledger/reporting";
import {
  completeReceiptRequestSchema,
  createReceiptRequestSchema,
  linkReceiptRequestSchema,
  type CompleteReceiptRequest,
  type CreateReceiptRequest,
  type ReceiptDto,
} from "../../src/data/api/ledgerReceiptContracts";
import {
  ledgerReviewActionRequestSchema,
  type LedgerReviewActionDto,
  type LedgerReviewActionRequest,
  type LedgerReviewFindingDto,
} from "../../src/data/api/ledgerReviewContracts";

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
  canFinalizeSettlement(userId: string, tripId: string): Promise<boolean>;
  bootstrapLedger(userId: string, tripId: string): Promise<LedgerBootstrapResponse>;
  pullLedgerChanges(
    userId: string,
    tripId: string,
    cursor: string | null,
  ): Promise<LedgerChangesResponse>;
  readLedgerExpenses(
    userId: string,
    tripId: string,
    filters: ReportingFilters,
    limit: number,
    offset: number,
  ): Promise<LedgerExpenseListResponse>;
  readLedgerAnalysis(
    userId: string,
    tripId: string,
    filters: ReportingFilters,
    scope: ReportingScope,
    dimension: ReportingDimension,
  ): Promise<LedgerAnalysisResponse>;
  readMyLedger(
    userId: string,
    period: MyLedgerPeriod,
    from: string | null,
    to: string | null,
  ): Promise<MyLedgerResponse>;
  readLedgerRateQuotes(
    userId: string,
    tripId: string,
    quoteCurrency: string | null,
    baseCurrency: string | null,
  ): Promise<LedgerRateQuoteDto[]>;
  previewJourneyCurrency(
    userId: string,
    tripId: string,
    proposedCurrency: string,
  ): Promise<JourneyCurrencyPreview>;
  commitJourneyCurrency(
    userId: string,
    tripId: string,
    idempotencyKey: string,
    input: {
      proposedCurrency: string;
      baseSettingsRevision: number;
      previewDigest: string;
    },
  ): Promise<JourneyCurrencyCommit>;
  acquirePendingRateQuotes?(): Promise<number>;
  readLedgerReview(
    userId: string,
    tripId: string,
  ): Promise<{
    findings: LedgerReviewFindingDto[];
    actions: LedgerReviewActionDto[];
  }>;
  refreshLedgerReview(
    userId: string,
    tripId: string,
  ): Promise<{
    findings: LedgerReviewFindingDto[];
    actions: LedgerReviewActionDto[];
  }>;
  actOnLedgerReviewFinding(
    userId: string,
    tripId: string,
    findingId: string,
    idempotencyKey: string,
    input: LedgerReviewActionRequest,
  ): Promise<{
    finding: LedgerReviewFindingDto;
    action: LedgerReviewActionDto;
    idempotentReplay: boolean;
  }>;
  previewLedgerSettlement(
    userId: string,
    tripId: string,
    throughTimestamp: string,
  ): Promise<SettlementPreviewResponse>;
  finalizeLedgerSettlement(
    userId: string,
    tripId: string,
    idempotencyKey: string,
    input: { throughTimestamp: string; inputDigest: string },
  ): Promise<SettlementFinalizeResponse>;
  previewSettlementAdjustment(
    userId: string,
    tripId: string,
    rootSettlementId: string,
  ): Promise<SettlementAdjustmentPreviewResponse>;
  finalizeSettlementAdjustment(
    userId: string,
    tripId: string,
    rootSettlementId: string,
    idempotencyKey: string,
    input: SettlementAdjustmentFinalizeRequest,
  ): Promise<SettlementAdjustmentMutationResponse>;
  recordSettlementPayment(
    userId: string,
    tripId: string,
    transferId: string,
    idempotencyKey: string,
    input: RecordSettlementPaymentRequest,
  ): Promise<SettlementPaymentMutationResponse>;
  actOnSettlementPayment(
    userId: string,
    tripId: string,
    paymentId: string,
    action: "confirm" | "reject" | "dispute",
    idempotencyKey: string,
    input: SettlementPaymentActionRequest,
  ): Promise<SettlementPaymentMutationResponse>;
  correctSettlementPayment(
    userId: string,
    tripId: string,
    paymentId: string,
    idempotencyKey: string,
    input: CorrectSettlementPaymentRequest,
  ): Promise<SettlementPaymentMutationResponse>;
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
  createReceipt(
    userId: string,
    tripId: string,
    receiptId: string,
    input: CreateReceiptRequest,
  ): Promise<{ entity: ReceiptDto; idempotentReplay: boolean }>;
  uploadReceiptContent(
    userId: string,
    tripId: string,
    receiptId: string,
    bytes: Uint8Array,
    mimeType: string,
  ): Promise<{ entity: ReceiptDto; idempotentReplay: boolean }>;
  downloadReceiptContent(
    userId: string,
    tripId: string,
    receiptId: string,
  ): Promise<{ bytes: Uint8Array; mimeType: string }>;
  completeReceipt(
    userId: string,
    tripId: string,
    receiptId: string,
    key: string,
    input: CompleteReceiptRequest,
  ): Promise<{ entity: ReceiptDto; idempotentReplay: boolean }>;
  linkReceipt(
    userId: string,
    tripId: string,
    receiptId: string,
    key: string,
    expenseId: string,
  ): Promise<{ entity: ReceiptDto; idempotentReplay: boolean }>;
  ocrReceipt(
    userId: string,
    tripId: string,
    receiptId: string,
    key: string,
  ): Promise<{ entity: ReceiptDto; idempotentReplay: boolean }>;
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

export function redactLogRoute(pathname: string) {
  return pathname
    .split("/")
    .map((part) => (uuidPattern.test(part) ? ":id" : part))
    .join("/");
}

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

async function mutateJourneyCurrency(request: Request, gateway: DevBackendGateway) {
  const match = new URL(request.url).pathname.match(
    /^\/v2\/trips\/([^/]+)\/ledger\/journey-currency\/(preview|commit)$/,
  );
  if (!match) throw new HttpError(404, "NOT_FOUND", "The endpoint does not exist.");
  const [, tripId, action] = match;
  assertTripId(tripId);
  const user = await authenticate(request, gateway);
  if (!(await gateway.canFinalizeSettlement(user.id, tripId)))
    throw new HttpError(403, "TRIP_WRITE_FORBIDDEN", "Journey owner access is required.");
  const body = await parseBody(request);
  if (action === "preview") {
    const parsed = journeyCurrencyPreviewRequestSchema.safeParse(body);
    if (!parsed.success)
      throw new HttpError(400, "INVALID_PAYLOAD", "The request payload is invalid.");
    return json(
      200,
      await gateway.previewJourneyCurrency(user.id, tripId, parsed.data.proposedCurrency),
    );
  }
  const parsed = journeyCurrencyCommitRequestSchema.safeParse(body);
  if (!parsed.success)
    throw new HttpError(400, "INVALID_PAYLOAD", "The request payload is invalid.");
  return json(
    200,
    await gateway.commitJourneyCurrency(
      user.id,
      tripId,
      getIdempotencyKey(request),
      parsed.data,
    ),
  );
}

async function mutateReceipt(request: Request, gateway: DevBackendGateway) {
  const match = new URL(request.url).pathname.match(
    /^\/v2\/trips\/([^/]+)\/receipts(?:\/([^/]+)(?:\/(content|upload-complete|links|ocr))?)?$/,
  );
  if (!match) throw new HttpError(404, "NOT_FOUND", "The endpoint does not exist.");
  const [, tripId, receiptId, action] = match;
  assertTripId(tripId);
  const user = await authenticate(request, gateway);
  if (!(await gateway.canWriteTrip(user.id, tripId)))
    throw new HttpError(403, "TRIP_WRITE_FORBIDDEN", "Trip write access is required.");
  if (!receiptId) {
    const parsed = createReceiptRequestSchema.safeParse(await parseBody(request));
    if (!parsed.success)
      throw new HttpError(400, "INVALID_PAYLOAD", "The request payload is invalid.");
    const response = await gateway.createReceipt(
      user.id,
      tripId,
      deriveServerId(user.id, "receipt", getIdempotencyKey(request)),
      parsed.data,
    );
    return json(response.idempotentReplay ? 200 : 201, response);
  }
  if (!uuidPattern.test(receiptId))
    throw new HttpError(400, "INVALID_RECEIPT_ID", "The receipt id is invalid.");
  if (action === "content" && request.method === "PUT") {
    const length = Number(request.headers.get("content-length") ?? "0");
    if (length > 15 * 1024 * 1024)
      throw new HttpError(413, "PAYLOAD_TOO_LARGE", "The receipt is too large.");
    return json(
      200,
      await gateway.uploadReceiptContent(
        user.id,
        tripId,
        receiptId,
        new Uint8Array(await request.arrayBuffer()),
        request.headers.get("content-type") ?? "application/octet-stream",
      ),
    );
  }
  const key = getIdempotencyKey(request);
  if (action === "upload-complete") {
    const parsed = completeReceiptRequestSchema.safeParse(await parseBody(request));
    if (!parsed.success)
      throw new HttpError(400, "INVALID_PAYLOAD", "The request payload is invalid.");
    return json(
      200,
      await gateway.completeReceipt(user.id, tripId, receiptId, key, parsed.data),
    );
  }
  if (action === "links") {
    const parsed = linkReceiptRequestSchema.safeParse(await parseBody(request));
    if (!parsed.success)
      throw new HttpError(400, "INVALID_PAYLOAD", "The request payload is invalid.");
    return json(
      200,
      await gateway.linkReceipt(user.id, tripId, receiptId, key, parsed.data.expenseId),
    );
  }
  if (action === "ocr")
    return json(200, await gateway.ocrReceipt(user.id, tripId, receiptId, key));
  throw new HttpError(404, "NOT_FOUND", "The endpoint does not exist.");
}

async function readReceiptContent(request: Request, gateway: DevBackendGateway) {
  const match = new URL(request.url).pathname.match(
    /^\/v2\/trips\/([^/]+)\/receipts\/([^/]+)\/content$/,
  );
  if (!match) throw new HttpError(404, "NOT_FOUND", "The endpoint does not exist.");
  const [, tripId, receiptId] = match;
  const user = await authorizeRead(request, gateway, tripId);
  if (!uuidPattern.test(receiptId))
    throw new HttpError(400, "INVALID_RECEIPT_ID", "The receipt id is invalid.");
  const content = await gateway.downloadReceiptContent(user.id, tripId, receiptId);
  return new Response(content.bytes as BodyInit, {
    status: 200,
    headers: { "Cache-Control": "no-store", "Content-Type": content.mimeType },
  });
}

async function mutateLedgerReview(request: Request, gateway: DevBackendGateway) {
  requireReviewProtocol(request);
  const refresh = new URL(request.url).pathname.match(
    /^\/v2\/trips\/([^/]+)\/ledger\/review\/refresh$/,
  );
  if (refresh) {
    const user = await authorizeRead(request, gateway, refresh[1]);
    return json(200, {
      ...(await gateway.refreshLedgerReview(user.id, refresh[1])),
      reviewProtocol: 2,
    });
  }
  const match = new URL(request.url).pathname.match(
    /^\/v2\/trips\/([^/]+)\/review-findings\/([^/]+)\/actions$/,
  );
  if (!match) throw new HttpError(404, "NOT_FOUND", "The endpoint does not exist.");
  const [, tripId, findingId] = match;
  assertTripId(tripId);
  if (!uuidPattern.test(findingId))
    throw new HttpError(400, "INVALID_FINDING_ID", "The finding id is invalid.");
  const user = await authenticate(request, gateway);
  if (!(await gateway.canReadTrip(user.id, tripId)))
    throw new HttpError(403, "TRIP_READ_FORBIDDEN", "Trip read access is required.");
  const parsed = ledgerReviewActionRequestSchema.safeParse(await parseBody(request));
  if (!parsed.success)
    throw new HttpError(400, "INVALID_PAYLOAD", "The request payload is invalid.");
  return json(200, {
    ...(await gateway.actOnLedgerReviewFinding(
      user.id,
      tripId,
      findingId,
      getIdempotencyKey(request),
      parsed.data,
    )),
    reviewProtocol: 2,
  });
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

async function mutateLedgerSettlement(request: Request, gateway: DevBackendGateway) {
  const match = new URL(request.url).pathname.match(
    /^\/v2\/trips\/([^/]+)\/settlements(?:\/(preview))?$/,
  );
  if (!match) throw new HttpError(404, "NOT_FOUND", "The endpoint does not exist.");
  const [, tripId, action] = match;
  assertTripId(tripId);
  const user = await authenticate(request, gateway);
  if (!(await gateway.canFinalizeSettlement(user.id, tripId))) {
    throw new HttpError(
      403,
      "TRIP_WRITE_FORBIDDEN",
      "Organizer settlement access is required.",
    );
  }
  const body = await parseBody(request);
  if (action === "preview") {
    const parsed = settlementPreviewRequestSchema.safeParse(body);
    if (!parsed.success)
      throw new HttpError(400, "INVALID_PAYLOAD", "The request payload is invalid.");
    return json(
      200,
      await gateway.previewLedgerSettlement(
        user.id,
        tripId,
        parsed.data.throughTimestamp,
      ),
    );
  }
  const parsed = settlementFinalizeRequestSchema.safeParse(body);
  if (!parsed.success)
    throw new HttpError(400, "INVALID_PAYLOAD", "The request payload is invalid.");
  const response = await gateway.finalizeLedgerSettlement(
    user.id,
    tripId,
    getIdempotencyKey(request),
    parsed.data,
  );
  return json(response.idempotentReplay ? 200 : 201, response);
}

async function mutateSettlementPayment(request: Request, gateway: DevBackendGateway) {
  const pathname = new URL(request.url).pathname;
  const record = pathname.match(/^\/v2\/trips\/([^/]+)\/transfers\/([^/]+)\/payments$/);
  const action = pathname.match(
    /^\/v2\/trips\/([^/]+)\/transfer-payments\/([^/]+)\/(confirm|reject|dispute|correct)$/,
  );
  if (!record && !action)
    throw new HttpError(404, "NOT_FOUND", "The endpoint does not exist.");
  const tripId = (record ?? action)![1];
  assertTripId(tripId);
  const user = await authenticate(request, gateway);
  const body = await parseBody(request);
  const idempotencyKey = getIdempotencyKey(request);

  if (record) {
    const parsed = recordSettlementPaymentRequestSchema.safeParse(body);
    if (!parsed.success)
      throw new HttpError(400, "INVALID_PAYLOAD", "The request payload is invalid.");
    const response = await gateway.recordSettlementPayment(
      user.id,
      tripId,
      record[2],
      idempotencyKey,
      parsed.data,
    );
    return json(response.idempotentReplay ? 200 : 201, response);
  }

  if (action![3] === "correct") {
    const parsed = correctSettlementPaymentRequestSchema.safeParse(body);
    if (!parsed.success)
      throw new HttpError(400, "INVALID_PAYLOAD", "The request payload is invalid.");
    const response = await gateway.correctSettlementPayment(
      user.id,
      tripId,
      action![2],
      idempotencyKey,
      parsed.data,
    );
    return json(response.idempotentReplay ? 200 : 201, response);
  }

  const parsed = settlementPaymentActionRequestSchema.safeParse(body);
  if (!parsed.success)
    throw new HttpError(400, "INVALID_PAYLOAD", "The request payload is invalid.");
  return json(
    200,
    await gateway.actOnSettlementPayment(
      user.id,
      tripId,
      action![2],
      action![3] as "confirm" | "reject" | "dispute",
      idempotencyKey,
      parsed.data,
    ),
  );
}

async function mutateSettlementAdjustment(request: Request, gateway: DevBackendGateway) {
  const match = new URL(request.url).pathname.match(
    /^\/v2\/trips\/([^/]+)\/settlements\/([^/]+)\/adjustments(?:\/(preview))?$/,
  );
  if (!match) throw new HttpError(404, "NOT_FOUND", "The endpoint does not exist.");
  const [, tripId, rootSettlementId, action] = match;
  assertTripId(tripId);
  assertTripId(rootSettlementId);
  const user = await authenticate(request, gateway);
  if (!(await gateway.canReadTrip(user.id, tripId))) {
    throw new HttpError(403, "TRIP_READ_FORBIDDEN", "Trip read access is required.");
  }
  const body = await parseBody(request);
  if (action === "preview") {
    return json(
      200,
      await gateway.previewSettlementAdjustment(user.id, tripId, rootSettlementId),
    );
  }
  const parsed = settlementAdjustmentFinalizeRequestSchema.safeParse(body);
  if (!parsed.success)
    throw new HttpError(400, "INVALID_PAYLOAD", "The request payload is invalid.");
  const response = await gateway.finalizeSettlementAdjustment(
    user.id,
    tripId,
    rootSettlementId,
    getIdempotencyKey(request),
    parsed.data,
  );
  return json(response.idempotentReplay ? 200 : 201, response);
}

async function readEntity(request: Request, gateway: DevBackendGateway) {
  const url = new URL(request.url);
  if (url.pathname === "/v2/me/ledger") {
    const user = await authenticate(request, gateway);
    if (url.searchParams.has("reportingCurrency")) {
      throw new HttpError(
        422,
        "REPORTING_CURRENCY_UNSUPPORTED",
        "Stage 6 does not convert across Journey currencies.",
      );
    }
    const period = url.searchParams.get("period") as MyLedgerPeriod | null;
    if (!period || !["30D", "YEAR", "ALL"].includes(period)) {
      throw new HttpError(400, "INVALID_PERIOD", "A valid My Ledger period is required.");
    }
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    if (period !== "ALL" && (!validDate(from) || !validDate(to))) {
      throw new HttpError(400, "INVALID_PERIOD", "Bounded periods need UTC from/to.");
    }
    return json(
      200,
      await gateway.readMyLedger(
        user.id,
        period,
        period === "ALL" ? null : from,
        period === "ALL" ? null : to,
      ),
    );
  }

  const review = url.pathname.match(/^\/v2\/trips\/([^/]+)\/ledger\/review$/);
  if (review) {
    requireReviewProtocol(request);
    const user = await authorizeRead(request, gateway, review[1]);
    return json(200, {
      ...(await gateway.readLedgerReview(user.id, review[1])),
      reviewProtocol: 2,
    });
  }

  const expenses = url.pathname.match(/^\/v2\/trips\/([^/]+)\/expenses$/);
  if (expenses) {
    const [, tripId] = expenses;
    const user = await authorizeRead(request, gateway, tripId);
    const requestedLimit = Number(url.searchParams.get("limit") ?? 50);
    if (!Number.isInteger(requestedLimit) || requestedLimit < 1) {
      throw new HttpError(400, "INVALID_LIMIT", "The page limit is invalid.");
    }
    return json(
      200,
      await gateway.readLedgerExpenses(
        user.id,
        tripId,
        reportingFilters(url),
        Math.min(requestedLimit, 100),
        decodePageCursor(url.searchParams.get("cursor")),
      ),
    );
  }

  const analysis = url.pathname.match(/^\/v2\/trips\/([^/]+)\/ledger\/analysis$/);
  if (analysis) {
    const [, tripId] = analysis;
    const user = await authorizeRead(request, gateway, tripId);
    const scope = url.searchParams.get("scope") as ReportingScope | null;
    const dimension = url.searchParams.get("dimension") as ReportingDimension | null;
    if (!scope || !["MINE", "GROUP"].includes(scope)) {
      throw new HttpError(400, "INVALID_SCOPE", "The reporting scope is invalid.");
    }
    if (
      !dimension ||
      !["CATEGORY", "DAY", "PAYER", "PARTICIPANT", "CURRENCY"].includes(dimension)
    ) {
      throw new HttpError(400, "INVALID_DIMENSION", "The analysis dimension is invalid.");
    }
    return json(
      200,
      await gateway.readLedgerAnalysis(
        user.id,
        tripId,
        reportingFilters(url),
        scope,
        dimension,
      ),
    );
  }

  const match = url.pathname.match(
    /^\/v2\/trips\/([^/]+)\/ledger\/(bootstrap|changes|rate-quotes)$/,
  );
  if (!match) throw new HttpError(404, "NOT_FOUND", "The endpoint does not exist.");

  const [, tripId, resource] = match;
  const user = await authorizeRead(request, gateway, tripId);
  if (resource === "bootstrap") {
    const response = await gateway.bootstrapLedger(user.id, tripId);
    if (!supportsReviewProtocol(request)) {
      const { reviewFindings: _findings, reviewActions: _actions, ...safe } = response;
      return json(200, safe);
    }
    return json(200, { ...response, reviewProtocol: 2 });
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
  const response = await gateway.pullLedgerChanges(
    user.id,
    tripId,
    url.searchParams.get("cursor"),
  );
  if (!supportsReviewProtocol(request)) {
    const { reviewFindings: _findings, reviewActions: _actions, ...safe } = response;
    return json(200, {
      ...safe,
      changes: response.changes.filter(
        (change) => change.entityType !== "REVIEW_FINDING",
      ),
    });
  }
  return json(200, { ...response, reviewProtocol: 2 });
}

function supportsReviewProtocol(request: Request) {
  return request.headers.get("X-Review-Protocol") === "2";
}

function requireReviewProtocol(request: Request) {
  if (!supportsReviewProtocol(request))
    throw new HttpError(
      426,
      "REVIEW_PROTOCOL_UPGRADE_REQUIRED",
      "Update the app to use Review 2.0.",
    );
}

function validDate(value: string | null): value is string {
  return Boolean(value && Number.isFinite(Date.parse(value)));
}

function decodePageCursor(cursor: string | null) {
  if (!cursor) return 0;
  try {
    const value = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as {
      sequence?: unknown;
    };
    if (typeof value.sequence !== "number" || value.sequence < 0) throw new Error();
    return value.sequence;
  } catch {
    throw new HttpError(400, "INVALID_CURSOR", "The page cursor is invalid.");
  }
}

function reportingFilters(url: URL): ReportingFilters {
  const value = (name: string) => url.searchParams.get(name) || undefined;
  const from = value("from");
  const to = value("to");
  const query = value("query");
  const category = value("category");
  const payerMemberId = value("payerMemberId");
  const participantMemberId = value("participantMemberId");
  const currency = value("currency");
  const businessStatus = value("businessStatus");
  const syncStatus = value("syncStatus");
  const conflict = value("conflict");
  const valuation = value("valuation");
  const receipt = value("receipt");
  if ((from && !validDate(from)) || (to && !validDate(to)) || (from && to && from >= to))
    throw new HttpError(400, "INVALID_FILTER", "The date filter is invalid.");
  if (query && query.length > 200)
    throw new HttpError(400, "INVALID_FILTER", "The search query is too long.");
  if (category && category.length > 100)
    throw new HttpError(400, "INVALID_FILTER", "The category filter is too long.");
  if (
    (payerMemberId && !uuidPattern.test(payerMemberId)) ||
    (participantMemberId && !uuidPattern.test(participantMemberId))
  )
    throw new HttpError(400, "INVALID_FILTER", "The member filter is invalid.");
  if (currency && !/^[A-Z]{3}$/.test(currency))
    throw new HttpError(400, "INVALID_FILTER", "The currency filter is invalid.");
  if (
    businessStatus &&
    !["DRAFT", "ACCEPTED", "RATE_REQUIRED", "DELETED"].includes(businessStatus)
  )
    throw new HttpError(400, "INVALID_FILTER", "The business status filter is invalid.");
  if (
    syncStatus &&
    ![
      "SYNCED",
      "PENDING_CREATE",
      "PENDING_UPDATE",
      "PENDING_DELETE",
      "FAILED",
      "CONFLICT",
    ].includes(syncStatus)
  )
    throw new HttpError(400, "INVALID_FILTER", "The sync status filter is invalid.");
  if (conflict && !["OPEN", "NONE"].includes(conflict))
    throw new HttpError(400, "INVALID_FILTER", "The conflict filter is invalid.");
  if (valuation && !["VALUED", "RATE_REQUIRED"].includes(valuation))
    throw new HttpError(400, "INVALID_FILTER", "The valuation filter is invalid.");
  if (receipt && !["HAS", "HAS_NOT"].includes(receipt))
    throw new HttpError(400, "INVALID_FILTER", "The receipt filter is invalid.");
  return {
    from,
    to,
    query,
    category,
    payerMemberId,
    participantMemberId,
    currency,
    businessStatus,
    syncStatus,
    conflict: conflict as ReportingFilters["conflict"],
    valuation: valuation as ReportingFilters["valuation"],
    receipt: receipt as ReportingFilters["receipt"],
  };
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
      } else if (
        request.method === "GET" &&
        /\/v2\/trips\/[^/]+\/receipts\/[^/]+\/content$/.test(url.pathname)
      ) {
        route = "/v2/trips/:tripId/receipts/:receiptId/content";
        response = await readReceiptContent(request, gateway);
      } else if (request.method === "GET" && url.pathname.startsWith("/v2/")) {
        route = redactLogRoute(url.pathname);
        response = await readEntity(request, gateway);
      } else if (
        request.method === "POST" &&
        /^\/v2\/trips\/[^/]+\/ledger\/journey-currency\/(preview|commit)$/.test(
          url.pathname,
        )
      ) {
        route = "/v2/trips/:tripId/ledger/journey-currency/:action";
        response = await mutateJourneyCurrency(request, gateway);
      } else if (
        request.method === "POST" &&
        (/\/v2\/trips\/[^/]+\/review-findings\/[^/]+\/actions$/.test(url.pathname) ||
          /\/v2\/trips\/[^/]+\/ledger\/review\/refresh$/.test(url.pathname))
      ) {
        route = "/v2/trips/:tripId/review-findings/:findingId/actions";
        response = await mutateLedgerReview(request, gateway);
      } else if (
        ["POST", "PUT"].includes(request.method) &&
        /\/v2\/trips\/[^/]+\/receipts/.test(url.pathname)
      ) {
        route = "/v2/trips/:tripId/receipts";
        response = await mutateReceipt(request, gateway);
      } else if (
        request.method === "POST" &&
        /^\/v2\/trips\/[^/]+\/settlements(?:\/preview)?$/.test(url.pathname)
      ) {
        route = "/v2/trips/:tripId/settlements";
        response = await mutateLedgerSettlement(request, gateway);
      } else if (
        request.method === "POST" &&
        /^\/v2\/trips\/[^/]+\/settlements\/[^/]+\/adjustments(?:\/preview)?$/.test(
          url.pathname,
        )
      ) {
        route = "/v2/trips/:tripId/settlements/:rootId/adjustments";
        response = await mutateSettlementAdjustment(request, gateway);
      } else if (
        request.method === "POST" &&
        (/^\/v2\/trips\/[^/]+\/transfers\/[^/]+\/payments$/.test(url.pathname) ||
          /^\/v2\/trips\/[^/]+\/transfer-payments\/[^/]+\/(confirm|reject|dispute|correct)$/.test(
            url.pathname,
          ))
      ) {
        route = "/v2/trips/:tripId/transfer-payments";
        response = await mutateSettlementPayment(request, gateway);
      } else if (
        request.method === "POST" &&
        /^\/v2\/trips\/[^/]+\/settlements\/[^/]+\/reopen$/.test(url.pathname)
      ) {
        route = "/v2/trips/:tripId/settlements/:id/reopen";
        throw new HttpError(
          409,
          "SETTLEMENT_REOPEN_NOT_ALLOWED",
          "Finalized Settlements are never reopened.",
        );
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
