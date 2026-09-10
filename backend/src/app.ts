import { randomUUID } from "node:crypto";

import {
  createExpenseRequestSchema,
  createItineraryItemRequestSchema,
  type CreateExpenseRequest,
  type CreateItineraryItemRequest,
  type CreateSyncResponse,
} from "../../src/data/api/devSyncContracts";

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
  canWriteTrip(userId: string, tripId: string): Promise<boolean>;
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
  ) {
    super(message);
  }
}

const idempotencyKeyPattern = /^[A-Za-z0-9._:-]{1,200}$/;
const routePattern = /^\/v1\/trips\/([^/]+)\/(expenses|itinerary-items)$/;

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
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      tripId,
    )
  ) {
    throw new HttpError(400, "INVALID_TRIP_ID", "The trip id is invalid.");
  }
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
          : new HttpError(503, "BACKEND_UNAVAILABLE", "The backend is unavailable.");
      response = json(normalized.status, {
        error: {
          code: normalized.code,
          message: normalized.message,
          requestId,
        },
      });
    }

    response.headers.set("X-Request-Id", requestId);
    log?.({ requestId, route, status: response.status, durationMs: now() - startedAt });
    return response;
  };
}
