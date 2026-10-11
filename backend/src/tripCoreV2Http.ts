import { z } from "zod";
import { coreUuid } from "../../src/domain/trip/tripCoreV2";
import {
  coreClosedCapabilities,
  validateCoreCommand,
} from "../../src/domain/trip/tripCoreV2Commands";
import { parseCoreJson } from "../../src/domain/trip/tripCoreV2Json";
import { validateCoreReceipt } from "../../src/domain/trip/tripCoreV2Receipt";
import {
  createRequestBoundary,
  readBoundedJson,
  RequestBoundaryError,
} from "../../src/data/api/requestBoundary";
import type { ImportHash } from "../../src/domain/trip/flightImportReview";
import {
  executeCoreCommandV2,
  type CoreCommandStorage,
  type CoreReceiptProjection,
} from "./tripCoreV2Commands";
import {
  prepareCoreSourcePlanV2,
  readCoreSourcePlanV2,
  finalizeCoreSourceSlotV2,
  type CoreSourcePlanStorageV2,
} from "./tripCoreV2Source";

import { validateCoreReadCollection } from "../../src/domain/trip/tripCoreV2Read";
import type { createCorePgReader } from "./tripCoreV2PgRead";
export type CoreHttpConnection = {
  read?: ReturnType<typeof createCorePgReader>;
  commands: CoreCommandStorage;
  source?: CoreSourcePlanStorageV2;
  hash: ImportHash;
  readOperation(
    actorAccountId: string,
    tripId: string,
    operationId: string,
  ): Promise<CoreReceiptProjection | null>;
};
const statusReceipt = z.strictObject({
  projection: z.literal("STATUS_ONLY"),
  domainReceiptId: coreUuid,
  receiptSha256: z.string().regex(/^[0-9a-f]{64}$/),
  operationId: coreUuid,
  outcome: z.enum(["APPLIED", "NO_CHANGE", "REJECTED", "CONFLICT"]),
  targetRevision: z.null(),
});
const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "private, no-store",
      Vary: "Authorization",
    },
  });
const failure = (status: number, code: string) =>
  reply(status, { error: { code, message: code } });
async function body(request: Request) {
  const boundary = createRequestBoundary(15000, request.signal);
  try {
    return await readBoundedJson(
      new Response(request.body),
      32768,
      boundary,
      parseCoreJson,
    );
  } finally {
    boundary.close();
  }
}
async function receipt(
  result: CoreReceiptProjection,
  actor: string,
  trip: string,
  operation: string,
  hash: ImportHash,
) {
  if (result.projection === "STATUS_ONLY") {
    const parsed = statusReceipt.parse(result);
    if (parsed.operationId !== operation) throw new Error("CORE_RECEIPT_SCOPE_MISMATCH");
    return parsed;
  }
  coreUuid.parse(result.domainReceiptId);
  const r = await validateCoreReceipt(result.receipt, hash);
  if (r.actorAccountId !== actor || r.tripId !== trip || r.operationId !== operation)
    throw new Error("CORE_RECEIPT_SCOPE_MISMATCH");
  return { projection: "FULL", domainReceiptId: result.domainReceiptId, receipt: r };
}
// Existing API authenticates once; this port has no credentials, direct database or actor override.
export async function coreHttpBoundary(
  request: Request,
  actor: string,
  canReadTrip: (actor: string, trip: string) => Promise<boolean>,
  connection?: CoreHttpConnection,
) {
  const url = new URL(request.url),
    match = /^\/v2\/trips\/([^/]+)\/core\/(.+)$/.exec(url.pathname);
  if (
    !match ||
    !coreUuid.safeParse(match[1]).success ||
    !coreUuid.safeParse(actor).success
  )
    return failure(400, "INVALID_PAYLOAD");
  const trip = match[1],
    path = match[2];
  if (url.search) return failure(400, "INVALID_PAYLOAD");
  const version = request.headers.get("X-OTR-Core-Contract-Version");
  if (version !== null && version !== "2") return failure(426, "UNSUPPORTED_CLIENT");
  try {
    const operation = /^operations\/([0-9a-f-]{36})$/.exec(path);
    // Replay authenticates but does not require current Trip access: owning lookup may redact it.
    if (operation && request.method === "GET") {
      coreUuid.parse(operation[1]);
      if (!connection) return failure(503, "CORE_REPLAY_UNAVAILABLE");
      const r = await connection.readOperation(actor, trip, operation[1]);
      return r
        ? reply(200, await receipt(r, actor, trip, operation[1], connection.hash))
        : failure(404, "NOT_VISIBLE");
    }
    if (!(await canReadTrip(actor, trip))) return failure(404, "NOT_VISIBLE");
    if (path === "capabilities" && request.method === "GET")
      return reply(200, coreClosedCapabilities);
    if (path === "commands" && request.method === "POST") {
      const input = await body(request);
      if (
        input &&
        typeof input === "object" &&
        "contractVersion" in input &&
        input.contractVersion !== 2
      )
        return failure(426, "UNSUPPORTED_CLIENT");
      const q = validateCoreCommand(input);
      if (q.tripId !== trip) return failure(404, "NOT_VISIBLE");
      if (!connection) return failure(503, "CORE_CAPABILITY_CLOSED");
      const result = await executeCoreCommandV2(
        connection.commands,
        actor,
        trip,
        q,
        connection.hash,
      );
      return reply(
        200,
        await receipt(result, actor, trip, q.operationId, connection.hash),
      );
    }
    const plan = /^source-plans\/([0-9a-f-]{36})(\/finalize)?$/.exec(path);
    if (path === "source-plans/prepare" && request.method === "POST") {
      const input = await body(request);
      if (!connection?.source) return failure(503, "CORE_CAPABILITY_CLOSED");
      return reply(
        200,
        await prepareCoreSourcePlanV2(
          connection.source,
          actor,
          trip,
          input,
          connection.hash,
        ),
      );
    }
    if (
      plan &&
      ((request.method === "GET" && !plan[2]) || (request.method === "POST" && plan[2]))
    ) {
      coreUuid.parse(plan[1]);
      if (!connection?.source) return failure(503, "CORE_CAPABILITY_CLOSED");
      return reply(
        200,
        plan[2]
          ? await finalizeCoreSourceSlotV2(
              connection.source,
              actor,
              trip,
              plan[1],
              await body(request),
              connection.hash,
            )
          : await readCoreSourcePlanV2(
              connection.source,
              actor,
              trip,
              plan[1],
              connection.hash,
            ),
      );
    }
    if (path === "collection" && request.method === "GET") {
      if (!connection?.read) return failure(503, "CORE_READ_UNAVAILABLE");
      const result = await connection.read.collection(actor, trip);
      await validateCoreReadCollection(
        result.manifest,
        result.pages,
        actor,
        trip,
        connection.hash,
      );
      return reply(200, result);
    }
    const item = /^objects\/ITEM\/([0-9a-f-]{36})$/.exec(path);
    if (item && request.method === "GET") {
      coreUuid.parse(item[1]);
      if (!connection?.read) return failure(503, "CORE_READ_UNAVAILABLE");
      const result = await connection.read.item(actor, trip, item[1]);
      return result ? reply(200, result) : failure(404, "NOT_VISIBLE");
    }
    if (
      path === "collection" ||
      path.startsWith("objects/") ||
      path.startsWith("documents/")
    )
      return failure(503, "CORE_READ_UNAVAILABLE");
    return failure(405, "METHOD_NOT_ALLOWED");
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof RequestBoundaryError)
      return failure(
        error instanceof RequestBoundaryError && error.code === "BODY_LIMIT" ? 413 : 400,
        "INVALID_PAYLOAD",
      );
    const code = error instanceof Error ? error.message : "INTERNAL_ERROR";
    if (["CORE_CAPABILITY_CLOSED", "CAPABILITY_CLOSED"].includes(code))
      return failure(503, "CORE_CAPABILITY_CLOSED");
    if (["NOT_VISIBLE", "TRIP_NOT_AUTHORIZED"].includes(code))
      return failure(404, "NOT_VISIBLE");
    if (["OPERATION_REUSE_MISMATCH", "REVISION_CONFLICT", "GRAPH_CHANGED"].includes(code))
      return failure(409, code);
    if (["INVALID_BASE_VECTOR", "INVALID_TARGET_KIND"].includes(code))
      return failure(400, code);
    return failure(503, "CORE_EXECUTION_UNAVAILABLE");
  }
}
