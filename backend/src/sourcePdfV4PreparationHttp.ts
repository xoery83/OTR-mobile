import {
  sourcePdfUploadStatusSchema,
  sourcePdfPrepareCommandSchema,
  sourcePdfPrepareReceiptSchema,
} from "../../src/domain/trip/sourcePdfPreparation";
import { z } from "zod";
import {
  createRequestBoundary,
  readBoundedJson,
  RequestBoundaryError,
} from "../../src/data/api/requestBoundary";
import { parseCoreJson, canonicalCoreJson } from "../../src/domain/trip/tripCoreV2Json";
import type { createSourcePdfV4Reservation } from "./sourcePdfV4Reservation";
import { sourcePdfV2UploadCommandSchema } from "../../src/domain/trip/sourcePdfV2Upload";
import { sourcePdfUploadReceiptSchema } from "../../src/domain/trip/sourcePdfUploadAuthority";
import { coreUuid } from "../../src/domain/trip/tripCoreV2";
import type { createSourcePdfV2BackendPreparation } from "./sourcePdfBackendPreparation";
import type { PdfCausalOwner } from "./sourcePdfCausalAuthority";

export type VerifiedPdfAdvance = Readonly<{
  request: Request;
  actorId: string;
  tripId: string;
}>;

type PreparationPort = {
  owner: Pick<PdfCausalOwner, "accountGeneration">;
  reservation?: ReturnType<typeof createSourcePdfV4Reservation>;
  preparation: ReturnType<typeof createSourcePdfV2BackendPreparation>;
};

// Unbound: parent owns bearer Auth; existing preparation owns journal/bytes/dispatch.
export async function sourcePdfV4PreparationBoundary(
  request: Request,
  actor: string,
  canReadTrip: (actor: string, trip: string) => Promise<boolean>,
  port?: PreparationPort,
  prepareForRequest?: (
    verifiedAdvance?: VerifiedPdfAdvance,
  ) => Promise<
    | { port: PreparationPort | undefined; initialGeneration?: number; close(): void }
    | undefined
  >,
) {
  const reply = (status: number, body: unknown, headers?: Record<string, string>) =>
    new Response(JSON.stringify(body), {
      status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "private, no-store",
        Vary: "Authorization",
        ...headers,
      },
    });
  const fail = (status: number, code: string) =>
    reply(status, { error: { code, message: code } });
  const url = new URL(request.url);
  const route =
    /^\/v2\/trips\/([^/]+)\/sources\/([^/]+)\/representations\/([^/]+)\/pdf-v4\/([^/]+)\/(prepare|reserve|finish|stage|dispatch|observe-retained|advance|status)$/.exec(
      url.pathname,
    );
  if (
    !route ||
    url.search ||
    route.slice(1, 5).some((id) => !coreUuid.safeParse(id).success)
  )
    return fail(400, "INVALID_SOURCE_COMMAND");
  if (request.method !== (route[5] === "status" ? "GET" : "POST"))
    return fail(405, "METHOD_NOT_ALLOWED");
  let scoped: Awaited<ReturnType<NonNullable<typeof prepareForRequest>>>;
  try {
    request.signal.throwIfAborted();
    coreUuid.parse(actor);
    if (!(await canReadTrip(actor, route[1]))) return fail(403, "SOURCE_ACCESS_DENIED");
    request.signal.throwIfAborted();
    if (prepareForRequest) {
      scoped = await prepareForRequest(
        route[5] === "advance"
          ? { request, actorId: actor, tripId: route[1] }
          : undefined,
      );
      port = scoped?.port;
      request.signal.throwIfAborted();
    }
    if (!port) return fail(503, "SOURCE_CAPABILITY_CLOSED");
    const commandAction =
      route[5] === "prepare" || route[5] === "reserve" || route[5] === "finish";
    if (
      (commandAction || route[5] === "status" ||
        (route[5] === "advance" && !port.preparation.advance)) && !port.reservation
    )
      return fail(503, "SOURCE_CAPABILITY_CLOSED");
    if (!commandAction && route[5] !== "stage" && request.body !== null)
      return fail(422, "INVALID_SOURCE_COMMAND");
    // The request-scoped factory just proved this fence. Each owning step still rechecks it.
    const generation =
      scoped?.initialGeneration ?? (await port.owner.accountGeneration(actor));
    request.signal.throwIfAborted();
    if (!Number.isSafeInteger(generation) || generation < 1)
      return fail(403, "SOURCE_ACCESS_DENIED");
    const identity = {
      tripId: route[1],
      sourceId: route[2],
      representationId: route[3],
      operationId: route[4],
      accountGeneration: generation,
    };
    if (route[5] === "status") {
      const status = sourcePdfUploadStatusSchema.parse(
        await port.reservation!.status(actor, identity),
      );
      return reply(
        200,
        {
          sourceId: identity.sourceId,
          representationId: identity.representationId,
          operationId: identity.operationId,
          observation: "STATUS_OBSERVED",
          status,
        },
        { "OTR-Source-PDF-Advance": "1" },
      );
    }
    if (commandAction) {
      const boundary = createRequestBoundary(15000, request.signal);
      let raw: string;
      try {
        raw = canonicalCoreJson(
          (route[5] === "prepare"
            ? sourcePdfPrepareCommandSchema
            : sourcePdfV2UploadCommandSchema
          ).parse(
            await readBoundedJson(new Response(request.body), 16384, boundary, (body) =>
              parseCoreJson(body, 16384),
            ),
          ),
        );
      } finally {
        boundary.close();
      }
      request.signal.throwIfAborted();
      let receipt: unknown;
      if (route[5] === "prepare") {
        receipt = await port.reservation!.prepare(actor, raw, identity);
      } else if (route[5] === "reserve") {
        receipt = (await port.reservation!.reserve(actor, raw, identity)).receipt;
      } else {
        receipt = await port.reservation!.finish(actor, raw, identity);
      }
      return reply(200, {
        sourceId: identity.sourceId,
        representationId: identity.representationId,
        operationId: identity.operationId,
        observation:
          route[5] === "prepare"
            ? "PREPARE_OBSERVED"
            : route[5] === "reserve"
              ? "RESERVATION_OBSERVED"
              : "FINISH_OBSERVED",
        ...(receipt === undefined
          ? {}
          : {
              receipt: (route[5] === "prepare"
                ? sourcePdfPrepareReceiptSchema
                : sourcePdfUploadReceiptSchema
              ).parse(receipt),
            }),
      });
    }
    let observation: "STAGED" | "DISPATCH_OBSERVED" | "READ_OBSERVED";
    if (route[5] === "stage") {
      await port.preparation.ingress(request, identity);
      observation = "STAGED";
    } else if (route[5] === "dispatch") {
      await port.preparation.upload(request, identity, request.signal);
      observation = "DISPATCH_OBSERVED";
    } else if (route[5] === "advance") {
      // A fresh owning projection can resume an ACK without sending another PUT.
      if (port.preparation.advance) {
        if (!(await port.preparation.advance(request, identity)))
          return fail(409, "SOURCE_OUTCOME_UNKNOWN");
      } else {
        const status = sourcePdfUploadStatusSchema.parse(
          await port.reservation!.status(actor, identity),
        );
        request.signal.throwIfAborted();
        if (status === "STAGED") {
          const sent = await port.preparation.upload(request, identity, request.signal);
          if (sent.kind !== "COMPLETE_ACK") return fail(409, "SOURCE_OUTCOME_UNKNOWN");
        } else if (status !== "ACK_OBSERVED" && status !== "READ_OBSERVED") {
          return fail(409, "SOURCE_OUTCOME_UNKNOWN");
        }
        if (status !== "READ_OBSERVED") {
          request.signal.throwIfAborted();
          const observed = await port.preparation.observeRetained(request, identity);
          if (observed.kind !== "MATCH" && observed.kind !== "PERSISTED_GET")
            return fail(409, "SOURCE_OUTCOME_UNKNOWN");
        }
      }
      observation = "READ_OBSERVED";
    } else {
      await port.preparation.observeRetained(request, identity);
      observation = "READ_OBSERVED";
    }
    // Internal bindings carry resource/run capabilities and must never reach Native.
    return reply(200, {
      sourceId: identity.sourceId,
      representationId: identity.representationId,
      operationId: identity.operationId,
      observation,
    });
  } catch (error) {
    if (error instanceof RequestBoundaryError)
      return fail(error.code === "BODY_LIMIT" ? 413 : 400, "INVALID_SOURCE_COMMAND");
    if (error instanceof SyntaxError) return fail(422, "INVALID_SOURCE_COMMAND");
    if (error instanceof z.ZodError) return fail(422, "INVALID_SOURCE_COMMAND");
    if (error instanceof Error && "status" in error && error.status === 401)
      return fail(401, "AUTH_REQUIRED");
    const code = error instanceof Error ? error.message : "";
    if (code === "SOURCE_CAPABILITY_CLOSED") return fail(503, code);
    if (code === "PDF_TOO_LARGE") return fail(413, "INVALID_SOURCE_COMMAND");
    if (
      [
        "PDF_INGRESS_UNSUPPORTED",
        "PDF_LENGTH_MISMATCH",
        "PDF_INGRESS_INTEGRITY_MISMATCH",
      ].includes(code)
    )
      return fail(422, "INVALID_SOURCE_COMMAND");
    if (["PDF_SCOPE_FORBIDDEN", "SOURCE_ACCESS_DENIED"].includes(code))
      return fail(403, "SOURCE_ACCESS_DENIED");
    if (["PDF_DUPLICATE_DISPATCH", "PDF_PROVIDER_BINDING_CONFLICT"].includes(code))
      return fail(409, "SOURCE_CAS_CONFLICT");
    return fail(503, "SOURCE_IO_UNAVAILABLE");
  } finally {
    scoped?.close();
  }
}
