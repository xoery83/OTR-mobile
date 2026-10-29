import { fetch as expoFetch } from "expo/fetch";
import { z } from "zod";
import { sessionAccessToken } from "../auth/sessionAccessToken";
import {
  assertAccountRequestContext,
  assertAccountRequestGeneration,
  type AccountRequestContext,
} from "../auth/accountRequestContext";
import {
  assertCaptureCustodyBytes,
  captureMaterialBindingSchema,
  type CaptureMaterialBinding,
} from "@/domain/capture/captureCustody";
import { createRequestBoundary, readBoundedJson } from "./requestBoundary";
import { reserveNativeQaGet } from "./nativeQaReadBudget";
import {
  sourcePdfV4PreparationIdentitySchema,
  sourcePdfV4PreparationObservationSchema,
  type SourcePdfV4PreparationIdentity,
} from "./sourcePdfV4PreparationContracts";
const observations = {
  stage: "STAGED",
  dispatch: "DISPATCH_OBSERVED",
  "observe-retained": "READ_OBSERVED",
} as const;

// Explicit owning lifecycle only; no default caller, new IDs or automatic write retry.
export function createSourcePdfV4PreparationTransport(
  getAccountId: () => Promise<string>,
  options: {
    baseUrl: string;
    fetchImplementation?: typeof fetch;
    tokenProvider?: typeof sessionAccessToken;
    signal?: AbortSignal;
    assertRequestCurrent?: () => void;
  },
) {
  const origin = new URL(options.baseUrl);
  if (
    origin.origin !== options.baseUrl ||
    origin.protocol !== "https:" ||
    origin.username ||
    origin.password
  )
    throw Error("SOURCE_ORIGIN_INVALID");
  async function request(
    context: AccountRequestContext,
    raw: SourcePdfV4PreparationIdentity,
    action: keyof typeof observations,
    bytes?: Uint8Array,
  ) {
    const identity = sourcePdfV4PreparationIdentitySchema.parse(raw);
    z.uuid().parse(context.tripId);
    const boundary = createRequestBoundary(90000, options.signal, () => {
      options.assertRequestCurrent?.();
      assertAccountRequestGeneration(context);
    });
    try {
      await boundary.run(() => assertAccountRequestContext(context, getAccountId));
      const session = await boundary.run(() =>
        (options.tokenProvider ?? sessionAccessToken)({
          expectedUserId: context.accountId,
        }),
      );
      if (session.userId !== context.accountId) throw Error("SOURCE_ACCOUNT_CHANGED");
      await boundary.run(() => assertAccountRequestContext(context, getAccountId));
      const path = `/v2/trips/${context.tripId}/sources/${identity.sourceId}/representations/${identity.representationId}/pdf-v4/${identity.operationId}/${action}`;
      reserveNativeQaGet("POST", path, origin.origin);
      const response = await boundary.run(async () => {
        try {
          return await (options.fetchImplementation ?? expoFetch)(origin.origin + path, {
            method: "POST",
            redirect: "error",
            signal: boundary.signal,
            headers: {
              Authorization: `Bearer ${session.token}`,
              "Accept-Encoding": "identity",
              ...(bytes
                ? {
                    "Content-Type": "application/pdf",
                    "Content-Length": String(bytes.length),
                  }
                : {}),
            },
            ...(bytes ? { body: Uint8Array.from(bytes).buffer } : {}),
          });
        } catch {
          throw Error("SOURCE_REQUEST_UNCONFIRMED");
        }
      });
      if (response.status !== 200) {
        if (response.status === 503) {
          let closed = false;
          try {
            if (
              response.headers.get("Content-Type") === "application/json" &&
              !response.headers.has("Content-Encoding")
            ) {
              const body = await readBoundedJson(response, 4096, boundary);
              closed = z
                .object({
                  error: z.object({ code: z.literal("SOURCE_CAPABILITY_CLOSED") }),
                })
                .safeParse(body).success;
            }
          } catch {
            /* An uncertain response never proves that dispatch did not happen. */
          }
          void response.body?.cancel().catch(() => {});
          throw Error(closed ? "SOURCE_CAPABILITY_CLOSED" : "SOURCE_REQUEST_UNCONFIRMED");
        }
        void response.body?.cancel().catch(() => {});
        throw Error(
          response.status === 401 ? "SOURCE_AUTH_REQUIRED" : "SOURCE_HTTP_REJECTED",
        );
      }
      if (
        response.headers.get("Content-Type") !== "application/json" ||
        response.headers.has("Content-Encoding") ||
        !response.headers.get("Cache-Control")?.includes("no-store") ||
        response.headers.get("Vary") !== "Authorization"
      )
        throw Error("SOURCE_RESPONSE_INVALID");
      const result = sourcePdfV4PreparationObservationSchema.parse(
        await readBoundedJson(response, 4096, boundary),
      );
      if (
        result.sourceId !== identity.sourceId ||
        result.representationId !== identity.representationId ||
        result.operationId !== identity.operationId ||
        result.observation !== observations[action]
      )
        throw Error("SOURCE_RESPONSE_INVALID");
      await boundary.run(() => assertAccountRequestContext(context, getAccountId));
      return result;
    } finally {
      boundary.close();
    }
  }
  return {
    async stage(
      context: AccountRequestContext,
      identity: SourcePdfV4PreparationIdentity,
      raw: CaptureMaterialBinding,
      bytes: Uint8Array,
    ) {
      const binding = captureMaterialBindingSchema.parse(raw);
      if (
        binding.accountId !== context.accountId ||
        binding.mediaType !== "application/pdf"
      )
        throw Error("SOURCE_CAPTURE_SCOPE_INVALID");
      assertCaptureCustodyBytes(binding, bytes);
      return request(context, identity, "stage", Uint8Array.from(bytes));
    },
    dispatch: (
      context: AccountRequestContext,
      identity: SourcePdfV4PreparationIdentity,
    ) => request(context, identity, "dispatch"),
    observeRetained: (
      context: AccountRequestContext,
      identity: SourcePdfV4PreparationIdentity,
    ) => request(context, identity, "observe-retained"),
  };
}
