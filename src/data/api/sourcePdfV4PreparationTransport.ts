import {
  sourcePdfVerifyCommandSchema,
  sourcePdfVerifyReceiptSchema,
} from "../../domain/trip/sourcePdfRegistration";
import {
  sourcePdfV2RegistrationRequestSchema,
  sourcePdfV2SealRequestSchema,
  sourcePdfV2RegistrationReceiptSchema,
  sourcePdfV2ReceiptSchema,
} from "../../domain/trip/sourcePdfV2Contracts";
import { sourcePdfPrepareCommandSchema } from "../../domain/trip/sourcePdfPreparation";
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
  sourcePdfV4CommandObservationSchema,
  sourcePdfV4PrepareObservationSchema,
  sourcePdfV4StatusObservationSchema,
  sourcePdfV4PreparationObservationSchema,
  type SourcePdfV4PreparationIdentity,
} from "./sourcePdfV4PreparationContracts";
import { sourcePdfV2UploadCommandSchema } from "../../domain/trip/sourcePdfV2Upload";
import { canonicalCoreJson } from "../../domain/trip/tripCoreV2Json";
const observations = {
  status: "STATUS_OBSERVED",
  prepare: "PREPARE_OBSERVED",
  reserve: "RESERVATION_OBSERVED",
  finish: "FINISH_OBSERVED",
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
    action: keyof typeof observations | "verify-original" | "register-derived" | "seal",
    bytes?: Uint8Array,
    rawCommand?: unknown,
  ) {
    const identity = sourcePdfV4PreparationIdentitySchema.parse(raw);
    z.uuid().parse(context.tripId);
    const command =
      action === "prepare"
        ? sourcePdfPrepareCommandSchema.parse(rawCommand)
        : action === "reserve" || action === "finish"
          ? sourcePdfV2UploadCommandSchema.parse(rawCommand)
          : action === "verify-original"
            ? sourcePdfVerifyCommandSchema.parse(rawCommand)
            : undefined;
    const derivative =
      action === "register-derived"
        ? sourcePdfV2RegistrationRequestSchema.parse(rawCommand)
        : action === "seal"
          ? sourcePdfV2SealRequestSchema.parse(rawCommand)
          : undefined;
    if (
      derivative &&
      (derivative.sourceId !== identity.sourceId ||
        derivative.originalRepresentationId !== identity.representationId ||
        derivative.operationId !== identity.operationId ||
        derivative.derivedRepresentationId === derivative.originalRepresentationId)
    )
      throw Error("SOURCE_CAPTURE_SCOPE_INVALID");
    if (
      command &&
      (command.actor_account_id !== context.accountId ||
        command.trip_id !== context.tripId ||
        command.source_id !== identity.sourceId ||
        command.payload.representation_id !== identity.representationId ||
        command.operation_id !== identity.operationId ||
        (command.command === "UPLOAD_ORIGINAL" && command.payload.byte_count > 4194304))
    )
      throw Error("SOURCE_CAPTURE_SCOPE_INVALID");
    const commandBody = command
      ? canonicalCoreJson(command)
      : derivative
        ? canonicalCoreJson(derivative)
        : undefined;
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
      const isV2 = action === "verify-original" || derivative !== undefined;
      const path = isV2
        ? `/v2/trips/${context.tripId}/sources/pdf-v2/${action}`
        : `/v2/trips/${context.tripId}/sources/${identity.sourceId}/representations/${identity.representationId}/pdf-v4/${identity.operationId}/${action}`;
      const method = action === "status" ? "GET" : "POST";
      reserveNativeQaGet(method, path, origin.origin);
      const response = await boundary.run(async () => {
        try {
          return await (options.fetchImplementation ?? expoFetch)(origin.origin + path, {
            method,
            redirect: "error",
            signal: boundary.signal,
            headers: {
              Authorization: `Bearer ${session.token}`,
              "Accept-Encoding": "identity",
              ...(commandBody ? { "Content-Type": "application/json" } : {}),
              ...(bytes
                ? {
                    "Content-Type": "application/pdf",
                    "Content-Length": String(bytes.length),
                  }
                : {}),
            },
            ...(bytes
              ? { body: Uint8Array.from(bytes).buffer }
              : commandBody
                ? { body: commandBody }
                : {}),
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
      if (action === "verify-original") {
        const result = sourcePdfVerifyReceiptSchema.parse(
          await readBoundedJson(response, 4096, boundary),
        );
        if (
          !command ||
          result.operation_id !== command.operation_id ||
          result.operation_key !== command.operation_key ||
          result.operation_sha256 !== command.operation_sha256 ||
          result.source_id !== identity.sourceId ||
          result.representation_id !== identity.representationId
        )
          throw Error("SOURCE_RESPONSE_INVALID");
        await boundary.run(() => assertAccountRequestContext(context, getAccountId));
        return result;
      }
      if (derivative) {
        const result = (
          action === "register-derived"
            ? sourcePdfV2RegistrationReceiptSchema
            : sourcePdfV2ReceiptSchema
        ).parse(await readBoundedJson(response, 16384, boundary));
        if (
          result.operationId !== identity.operationId ||
          result.body.accountId !== context.accountId ||
          result.body.tripId !== context.tripId ||
          canonicalCoreJson(result.body.request) !== commandBody
        )
          throw Error("SOURCE_RESPONSE_INVALID");
        await boundary.run(() => assertAccountRequestContext(context, getAccountId));
        return result;
      }
      if (action === "register-derived" || action === "seal")
        throw Error("SOURCE_RESPONSE_INVALID");
      const result = (
        action === "status"
          ? sourcePdfV4StatusObservationSchema
          : action === "prepare"
            ? sourcePdfV4PrepareObservationSchema
            : command
              ? sourcePdfV4CommandObservationSchema
              : sourcePdfV4PreparationObservationSchema
      ).parse(await readBoundedJson(response, 4096, boundary));
      if (
        result.sourceId !== identity.sourceId ||
        result.representationId !== identity.representationId ||
        result.operationId !== identity.operationId ||
        result.observation !== observations[action]
      )
        throw Error("SOURCE_RESPONSE_INVALID");
      if (
        command &&
        "receipt" in result &&
        result.receipt &&
        (result.receipt.operation_id !== command.operation_id ||
          result.receipt.operation_key !== command.operation_key ||
          result.receipt.operation_sha256 !== command.operation_sha256 ||
          result.receipt.source_id !== command.source_id ||
          result.receipt.representation_id !== command.payload.representation_id)
      )
        throw Error("SOURCE_RESPONSE_INVALID");
      await boundary.run(() => assertAccountRequestContext(context, getAccountId));
      return result;
    } finally {
      boundary.close();
    }
  }
  return {
    async verifyOriginal(context: AccountRequestContext, raw: unknown) {
      const command = sourcePdfVerifyCommandSchema.parse(raw);
      return sourcePdfVerifyReceiptSchema.parse(
        await request(
          context,
          {
            sourceId: command.source_id,
            representationId: command.payload.representation_id,
            operationId: command.operation_id,
          },
          "verify-original",
          undefined,
          command,
        ),
      );
    },
    async registerDerived(context: AccountRequestContext, raw: unknown) {
      const input = sourcePdfV2RegistrationRequestSchema.parse(raw);
      return sourcePdfV2RegistrationReceiptSchema.parse(
        await request(
          context,
          {
            sourceId: input.sourceId,
            representationId: input.originalRepresentationId,
            operationId: input.operationId,
          },
          "register-derived",
          undefined,
          input,
        ),
      );
    },
    async seal(context: AccountRequestContext, raw: unknown) {
      const input = sourcePdfV2SealRequestSchema.parse(raw);
      return sourcePdfV2ReceiptSchema.parse(
        await request(
          context,
          {
            sourceId: input.sourceId,
            representationId: input.originalRepresentationId,
            operationId: input.operationId,
          },
          "seal",
          undefined,
          input,
        ),
      );
    },
    status: (context: AccountRequestContext, identity: SourcePdfV4PreparationIdentity) =>
      request(context, identity, "status"),
    prepare: (
      context: AccountRequestContext,
      identity: SourcePdfV4PreparationIdentity,
      command: unknown,
    ) => request(context, identity, "prepare", undefined, command),
    reserve: (
      context: AccountRequestContext,
      identity: SourcePdfV4PreparationIdentity,
      command: unknown,
    ) => request(context, identity, "reserve", undefined, command),
    finish: (
      context: AccountRequestContext,
      identity: SourcePdfV4PreparationIdentity,
      command: unknown,
    ) => request(context, identity, "finish", undefined, command),
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
