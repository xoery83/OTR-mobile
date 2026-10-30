import { z } from "zod";
import { coreUuid } from "../../src/domain/trip/tripCoreV2";
import { parseCoreJson } from "../../src/domain/trip/tripCoreV2Json";
import { sourcePdfVerifyCommandSchema } from "../../src/domain/trip/sourcePdfRegistration";
import {
  createRequestBoundary,
  readBoundedJson,
  RequestBoundaryError,
} from "../../src/data/api/requestBoundary";
import {
  sourcePdfV2RegistrationRequestSchema,
  sourcePdfV2SealRequestSchema,
} from "./sourcePdfV2Contracts";
import type { createSourcePdfV2Registration } from "./sourcePdfV2Registration";
import type { createSourcePdfV2Authority } from "./sourcePdfV2Authority";

type PdfPort = ReturnType<typeof createSourcePdfV2Registration> &
  Pick<ReturnType<typeof createSourcePdfV2Authority>, "seal">;

// Enclosing Backend owns bearer Auth. No startup binding or PDF authority activation.
export async function sourcePdfV2Boundary(
  request: Request,
  actor: string,
  canReadTrip: (actor: string, trip: string) => Promise<boolean>,
  port?: PdfPort,
  forRequest?: () => Promise<{ port: PdfPort | undefined; close(): void } | undefined>,
) {
  const reply = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
      status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "private, no-store",
        Vary: "Authorization",
      },
    });
  const fail = (status: number, code: string) =>
    reply(status, { error: { code, message: code } });
  const url = new URL(request.url);
  const match =
    /^\/v2\/trips\/([^/]+)\/sources\/pdf-v2\/(verify-original|register-derived|seal)$/.exec(
      url.pathname,
    );
  if (!match || !coreUuid.safeParse(match[1]).success || url.search)
    return fail(400, "INVALID_SOURCE_COMMAND");
  if (request.method !== "POST") return fail(405, "METHOD_NOT_ALLOWED");
  let scoped: Awaited<ReturnType<NonNullable<typeof forRequest>>>;
  try {
    request.signal.throwIfAborted();
    coreUuid.parse(actor);
    if (!(await canReadTrip(actor, match[1]))) return fail(403, "SOURCE_ACCESS_DENIED");
    request.signal.throwIfAborted();
    if (forRequest) {
      scoped = await forRequest();
      port = scoped?.port;
      request.signal.throwIfAborted();
    }
    if (!port) return fail(503, "SOURCE_CAPABILITY_CLOSED");
    const boundary = createRequestBoundary(15000, request.signal);
    let raw: unknown;
    try {
      raw = await readBoundedJson(new Response(request.body), 2097152, boundary, (body) =>
        parseCoreJson(body, 2097152),
      );
    } finally {
      boundary.close();
    }
    if (match[2] === "verify-original") {
      const input = sourcePdfVerifyCommandSchema.parse(raw);
      if (input.actor_account_id !== actor || input.trip_id !== match[1])
        return fail(403, "SOURCE_ACCESS_DENIED");
      return reply(200, await port.verifyOriginal(actor, match[1], input));
    }
    if (match[2] === "register-derived")
      return reply(
        200,
        await port.registerDerived(
          actor,
          match[1],
          sourcePdfV2RegistrationRequestSchema.parse(raw),
        ),
      );
    return reply(
      200,
      await port.seal(actor, match[1], sourcePdfV2SealRequestSchema.parse(raw)),
    );
  } catch (error) {
    if (error instanceof RequestBoundaryError)
      return fail(error.code === "BODY_LIMIT" ? 413 : 400, "INVALID_SOURCE_COMMAND");
    if (error instanceof z.ZodError) return fail(422, "INVALID_SOURCE_COMMAND");
    const code = error instanceof Error ? error.message : "SOURCE_IO_UNAVAILABLE";
    if (["SOURCE_ACCESS_DENIED", "PDF_SCOPE_FORBIDDEN"].includes(code))
      return fail(403, "SOURCE_ACCESS_DENIED");
    if (code === "SOURCE_CAPABILITY_CLOSED") return fail(503, code);
    if (
      [
        "OPERATION_ID_REUSED",
        "OPERATION_KEY_REUSED",
        "INPUT_STALE",
        "SOURCE_CAS_CONFLICT",
      ].includes(code)
    )
      return fail(409, code);
    return fail(503, "SOURCE_IO_UNAVAILABLE");
  } finally {
    scoped?.close();
  }
}
