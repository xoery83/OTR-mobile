import {
  coreUniversalP1PublishRequestSchema,
  coreUniversalP1PublishResultSchema,
  coreSourceFinalizeV2Schema,
  coreSourceFinalizeResultV2Schema,
} from "../../src/domain/trip/tripCoreV2SourceContract";
import { z } from "zod";
import { coreTableSchemas, coreUuid } from "../../src/domain/trip/tripCoreV2";
import {
  corePayloadSchemas,
  coreClosedCapabilities,
  coreCapabilitiesSchema,
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

import {
  coreCandidatePublicationV2Schema,
  coreCandidatePublicationResultSchema,
  candidatePublicationRequestHash,
  type CoreCandidatePublicationResult,
} from "../../src/domain/trip/tripCoreV2CandidatePublication";
import { validateCoreReadCollection } from "../../src/domain/trip/tripCoreV2Read";
import type { createCorePgReader } from "./tripCoreV2PgRead";
const validationFields = new Set([
  ...Object.values(coreTableSchemas).flatMap((schema) => Object.keys(schema.shape)),
  "contractVersion",
  "intentVersion",
  "operationId",
  "tripId",
  "command",
  "target",
  "kind",
  "id",
  "baseVector",
  "revision",
  "admission",
  "mode",
  "sourceIntentId",
  "policyVersion",
  "payload",
  "receipt",
  "outcome",
  "committedAt",
  "intentSha256",
  "receiptSha256",
  "audit",
  "before",
  "after",
  "core",
  "family",
  "schedule",
  "flightNumberLiteral",
  "departureDate",
  "provenance_refs",
  "field_state",
  "sourceId",
  "sourceRevision",
  "captureVersion",
  "planId",
  "slotId",
]);
export type CoreHttpConnection = {
  publishUniversalP1?(actor: string, trip: string, input: unknown): Promise<unknown>;
  finalizeUniversalP1Operation?(
    actor: string,
    trip: string,
    input: unknown,
  ): Promise<unknown>;
  publishSourceCandidates?(
    actorAccountId: string,
    tripId: string,
    input: unknown,
  ): Promise<CoreCandidatePublicationResult>;
  read?: Pick<ReturnType<typeof createCorePgReader>, "collection" | "item"> &
    Partial<Pick<ReturnType<typeof createCorePgReader>, "capabilities">>;
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
const unsupportedVersion = (
  input: unknown,
  key: "contractVersion" | "captureVersion" | "publicationVersion",
) =>
  input !== null &&
  typeof input === "object" &&
  key in input &&
  (input as Record<string, unknown>)[key] !== 2;
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
  return {
    projection: "FULL",
    domainReceiptId: result.domainReceiptId,
    receipt: r,
  };
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
  const capabilityOperation =
    path === "capabilities" && request.method === "GET"
      ? url.searchParams.get("operationId")
      : null;
  if (
    url.search &&
    (capabilityOperation === null ||
      !coreUuid.safeParse(capabilityOperation).success ||
      [...url.searchParams.keys()].length !== 1)
  )
    return failure(400, "INVALID_PAYLOAD");
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
      return reply(
        200,
        connection?.read?.capabilities
          ? coreCapabilitiesSchema.parse(
              await (capabilityOperation === null
                ? connection.read.capabilities(actor, trip)
                : connection.read.capabilities(actor, trip, capabilityOperation)),
            )
          : coreClosedCapabilities,
      );
    if (path === "commands" && request.method === "POST") {
      const input = await body(request);
      if (unsupportedVersion(input, "contractVersion"))
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
    if (path === "source-candidates/publish" && request.method === "POST") {
      const input = await body(request);
      if (unsupportedVersion(input, "publicationVersion"))
        return failure(426, "UNSUPPORTED_CLIENT");
      const publication = coreCandidatePublicationV2Schema.parse(input);
      if (
        publication.candidates.some(
          (c) =>
            c.accountId !== actor ||
            c.tripId !== trip ||
            c.sourceId !== publication.sourceId ||
            c.sourceRevision !== publication.sourceRevision ||
            c.runId !== publication.runId,
        )
      )
        return failure(404, "NOT_VISIBLE");
      if (!connection?.publishSourceCandidates)
        return failure(503, "CORE_CAPABILITY_CLOSED");
      const result = coreCandidatePublicationResultSchema.parse(
        await connection.publishSourceCandidates(actor, trip, publication),
      );
      if (
        result.accountId !== actor ||
        result.tripId !== trip ||
        result.publicationId !== publication.publicationId ||
        result.sourceId !== publication.sourceId ||
        result.sourceRevision !== publication.sourceRevision ||
        result.runId !== publication.runId ||
        result.inputCatalogSha256 !== publication.inputCatalogSha256 ||
        result.requestSha256 !==
          (await candidatePublicationRequestHash(publication, connection.hash)) ||
        result.candidates
          .map((c) => c.candidateId)
          .sort()
          .join("\0") !==
          publication.candidates
            .map((c) => c.candidateId)
            .sort()
            .join("\0")
      )
        throw new Error("CORE_PUBLICATION_SCOPE_MISMATCH");
      return reply(200, result);
    }
    if (path === "universal-p1-candidates" && request.method === "POST") {
      const raw = await body(request);
      if (unsupportedVersion(raw, "captureVersion"))
        return failure(426, "UNSUPPORTED_CLIENT");
      const input = coreUniversalP1PublishRequestSchema.parse(raw);
      if (!connection?.publishUniversalP1) return failure(503, "CORE_CAPABILITY_CLOSED");
      const result = coreUniversalP1PublishResultSchema.parse(
        await connection.publishUniversalP1(actor, trip, input),
      );
      if (
        result.proposedPlan.sourceId !== input.sourceId ||
        result.proposedPlan.candidateIds.length !== 1 ||
        result.proposedPlan.slots.length !== 1 ||
        result.proposedPlan.mode !== "REVIEWED_SOURCE" ||
        (input.family === "P2"
          ? result.proposedPlan.slots[0].command !== "CREATE_SPARSE_FLIGHT" ||
            !corePayloadSchemas.CREATE_SPARSE_FLIGHT.safeParse(
              result.proposedPlan.slots[0].payload,
            ).success ||
            input.sourceReview?.version !== "otr.universal.p2-source-review/1" ||
            result.proposedPlan.sourceRevision !== input.sourceReview.sourceRevision ||
            (result.proposedPlan.slots[0].payload as { flightNumberLiteral?: unknown })
              .flightNumberLiteral !== input.sourceReview.flightNumberLiteral ||
            (result.proposedPlan.slots[0].payload as { departureDate?: unknown })
              .departureDate !== input.sourceReview.departureDate
          : result.proposedPlan.slots[0].command !== "CREATE_ITEM" ||
            (result.proposedPlan.slots[0].payload as { family?: string }).family !==
              (input.family ?? "P1"))
      )
        throw Error("CORE_PUBLICATION_SCOPE_MISMATCH");
      return reply(200, result);
    }
    if (path === "universal-p1-source/finalize" && request.method === "POST") {
      const raw = await body(request);
      if (unsupportedVersion(raw, "captureVersion"))
        return failure(426, "UNSUPPORTED_CLIENT");
      const input = coreSourceFinalizeV2Schema.parse(raw);
      if (!connection?.finalizeUniversalP1Operation)
        return failure(503, "CORE_CAPABILITY_CLOSED");
      const result = coreSourceFinalizeResultV2Schema.parse(
        await connection.finalizeUniversalP1Operation(actor, trip, input),
      );
      if (result.slotId !== input.slotId) throw Error("CORE_RECEIPT_SCOPE_MISMATCH");
      return reply(200, result);
    }
    const plan = /^source-plans\/([0-9a-f-]{36})(\/finalize)?$/.exec(path);
    if (path === "source-plans/prepare" && request.method === "POST") {
      const input = await body(request);
      if (unsupportedVersion(input, "captureVersion"))
        return failure(426, "UNSUPPORTED_CLIENT");
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
      const input = plan[2] ? await body(request) : undefined;
      if (unsupportedVersion(input, "captureVersion"))
        return failure(426, "UNSUPPORTED_CLIENT");
      if (!connection?.source) return failure(503, "CORE_CAPABILITY_CLOSED");
      return reply(
        200,
        plan[2]
          ? await finalizeCoreSourceSlotV2(
              connection.source,
              actor,
              trip,
              plan[1],
              input,
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
      const orderVersion = request.headers.get("X-OTR-Ordinary-Order-Version");
      if (orderVersion !== null && orderVersion !== "1")
        return failure(426, "UNSUPPORTED_CLIENT");
      const result = await connection.read.collection(
        actor,
        trip,
        orderVersion === "1" ? 1 : undefined,
      );
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
    if (error instanceof z.ZodError || error instanceof RequestBoundaryError) {
      try {
        const resource = path.split("/")[0];
        console.info(
          JSON.stringify({
            event: "core_validation_failed",
            resource: [
              "commands",
              "source-plans",
              "source-candidates",
              "universal-p1-candidates",
            ].includes(resource)
              ? resource
              : "core",
            method: request.method,
            cause: error instanceof RequestBoundaryError ? error.code : "SCHEMA",
            issues:
              error instanceof z.ZodError
                ? error.issues.slice(0, 6).map((issue) => ({
                    code: issue.code,
                    path: issue.path
                      .slice(0, 8)
                      .map((part) =>
                        typeof part === "number"
                          ? part
                          : typeof part === "string" && validationFields.has(part)
                            ? part
                            : "[field]",
                      ),
                  }))
                : [],
          }),
        );
      } catch {
        // Diagnostics cannot change the validation response or expose request values.
      }
      return failure(
        error instanceof RequestBoundaryError && error.code === "BODY_LIMIT" ? 413 : 400,
        "INVALID_PAYLOAD",
      );
    }
    const code = error instanceof Error ? error.message : "INTERNAL_ERROR";
    if (
      path === "universal-p1-candidates" &&
      [
        "OWNING_REVIEW_REQUIRED",
        "SOURCE_REVIEW_MISMATCH",
        "SOURCE_REVIEW_REPLAY_CONFLICT",
        "LIFECYCLE_QUALIFICATION_REQUIRED",
        "SOURCE_RELATION_QUALIFICATION_REQUIRED",
        "OWNING_RELATION_QUALIFICATION_REQUIRED",
        "OWNING_MATERIAL_QUALIFICATION_REQUIRED",
        "INCOMPLETE_SOURCE_EVIDENCE",
        "CONTRACT_UNSUPPORTED",
      ].includes(code)
    )
      return failure(409, "OWNING_ADMISSION_PENDING");
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
