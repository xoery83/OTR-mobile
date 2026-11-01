import { FLIGHT_MODEL_CONFORMANCE } from "./flightHostProtocol";
import { createHash } from "node:crypto";
import { z } from "zod";
import { DEEPSEEK_FLIGHT_DESTINATION, mapDeepSeekFlightUsage } from "./deepSeekFlight";
import { createFlightHttpsSend } from "./flightHttpsTransport";
import { calculateScheduledCost } from "./externalIntegrationPersistence";
import { buildUniversalDeepSeekRequest } from "./universalProviderRequest";
import type { UniversalProvider } from "./universalImport";

type Input = Parameters<UniversalProvider["interpret"]>[0];
export type UniversalProviderCustody = {
  // Existing trusted Backend host must supply a scoped, expiring credential and permission.
  acquire(input: {
    actorId: string;
    accountId: string;
    tripId: string;
    batchId: string;
    taskId: string;
    requestSha256: string;
  }): Promise<{
    secret: string;
    assertCurrent(): Promise<void>;
  } | null>;
  retainResponse(input: {
    accountId: string;
    taskId: string;
    requestSha256: string;
    httpStatus: number;
    responseSha256: string;
    bytes: Uint8Array;
  }): Promise<void>;
  settle(input: {
    accountId: string;
    taskId: string;
    requestSha256: string;
    responseSha256: string;
    providerRequestId: string;
    usage: ReturnType<typeof mapDeepSeekFlightUsage>;
    costNanos: string | null;
  }): Promise<void>;
};
export type UniversalPriceSchedule = {
  currency: "USD";
  inputNanosPerMillion: string;
  cachedInputNanosPerMillion: string;
  outputNanosPerMillion: string;
};
type Send = ReturnType<typeof createFlightHttpsSend>;
const sha = (v: Uint8Array | string) => createHash("sha256").update(v).digest("hex");
const completion = z.object({
  id: z.string().min(1).max(200),
  model: z.string().min(1).max(200),
  choices: z
    .array(
      z.object({
        finish_reason: z.literal("stop"),
        message: z.object({ content: z.string().min(1).max(131072) }),
      }),
    )
    .length(1),
  usage: z.unknown(),
});
export function decodeUniversalDeepSeekResponse(
  bytes: Uint8Array,
  priceSchedule?: UniversalPriceSchedule,
) {
  const buffer = Buffer.from(bytes);
  if (buffer.byteLength > 131072) throw Error("UNIVERSAL_RESPONSE_BOUND");
  let raw: unknown;
  try {
    raw = JSON.parse(buffer.toString("utf8"));
  } catch {
    throw new Error("UNIVERSAL_PROVIDER_JSON_INVALID");
  }
  const parsed = completion.safeParse(raw);
  if (!parsed.success) throw new Error("UNIVERSAL_PROVIDER_COMPLETION_INVALID");
  if (
    !(FLIGHT_MODEL_CONFORMANCE.accepted_returned_models as readonly string[]).includes(
      parsed.data.model,
    )
  )
    throw new Error("UNIVERSAL_PROVIDER_MODEL_UNRESOLVED");
  const usage = mapDeepSeekFlightUsage(parsed.data.usage);
  let output: unknown;
  try {
    output = JSON.parse(parsed.data.choices[0].message.content);
  } catch {
    throw new Error("UNIVERSAL_PROVIDER_OUTPUT_INVALID");
  }
  const schedule = priceSchedule;
  const n = (value: string) => (/^\d+$/.test(value) ? value : null);
  const costNanos =
    schedule &&
    n(schedule.inputNanosPerMillion) !== null &&
    n(schedule.cachedInputNanosPerMillion) !== null &&
    n(schedule.outputNanosPerMillion) !== null &&
    usage.usage_quality === "ACTUAL_REPORTED" &&
    usage.cached_input_tokens !== null &&
    usage.input_tokens !== null &&
    usage.output_tokens !== null
      ? calculateScheduledCost([
          {
            quantity: BigInt(usage.input_tokens - usage.cached_input_tokens),
            quantityPerRate: 1000000n,
            rate: schedule.inputNanosPerMillion,
            relationship: "DISJOINT",
            billable: true,
          },
          {
            quantity: BigInt(usage.cached_input_tokens),
            quantityPerRate: 1000000n,
            rate: schedule.cachedInputNanosPerMillion,
            relationship: "DISJOINT",
            billable: true,
          },
          {
            quantity: BigInt(usage.output_tokens),
            quantityPerRate: 1000000n,
            rate: schedule.outputNanosPerMillion,
            relationship: "DISJOINT",
            billable: true,
          },
        ])
      : null;
  return { output, usage, costNanos, providerRequestId: parsed.data.id };
}

export function createUniversalDeepSeekProvider(deps: {
  custody: UniversalProviderCustody;
  send: Send;
  priceSchedule?: UniversalPriceSchedule;
}): UniversalProvider {
  return {
    mode: "HOSTED",
    async interpret(input: Input) {
      let phase = "ACQUIRE", boundary = "REQUEST";
      try {
        const request = buildUniversalDeepSeekRequest(input);
        boundary = "CUSTODY";
        const credential = await deps.custody.acquire({
          actorId: input.actorId,
          accountId: input.accountId,
          tripId: input.tripId,
          batchId: input.batchId,
          taskId: input.taskId,
          requestSha256: request.requestSha256,
        });
        if (!credential) throw new Error("UNIVERSAL_PROVIDER_CLOSED");
        boundary = "CREDENTIAL";
        if (
          !credential.secret ||
          credential.secret.trim() !== credential.secret ||
          !/^[\x21-\x7e]{1,8192}$/.test(credential.secret)
        )
          throw new Error("UNIVERSAL_PROVIDER_CREDENTIAL_INVALID");
        boundary = "CURRENT";
        await credential.assertCurrent();
        const signal = AbortSignal.timeout(60000);
        phase = "SEND";
        const response = await deps.send({
          url: DEEPSEEK_FLIGHT_DESTINATION,
          method: "POST",
          redirect: "error",
          headers: {
            Authorization: `Bearer ${credential.secret}`,
            "Content-Type": "application/json",
          },
          body: request.body,
          signal,
          max_response_bytes: 131072,
        });
        phase = "BODY";
        const chunks: Uint8Array[] = [];
        let length = 0;
        for await (const chunk of response.body) {
          length += chunk.byteLength;
          if (length > 131072) throw new Error("UNIVERSAL_RESPONSE_BOUND");
          chunks.push(chunk);
        }
        const bytes = Buffer.concat(chunks);
        phase = "RETAIN";
        await credential.assertCurrent();
        await deps.custody.retainResponse({
          accountId: input.accountId,
          taskId: input.taskId,
          requestSha256: request.requestSha256,
          httpStatus: response.status,
          responseSha256: sha(bytes),
          bytes,
        });
        await credential.assertCurrent();
        if (response.status !== 200 || response.redirected)
          throw new Error("UNIVERSAL_PROVIDER_HTTP_FAILURE");
        phase = "DECODE";
        const { output, usage, costNanos, providerRequestId } =
          decodeUniversalDeepSeekResponse(bytes, deps.priceSchedule);
        await credential.assertCurrent();
        phase = "SETTLE";
        await deps.custody.settle({
          accountId: input.accountId,
          taskId: input.taskId,
          requestSha256: request.requestSha256,
          responseSha256: sha(bytes),
          providerRequestId,
          usage,
          costNanos,
        });
        await credential.assertCurrent();
        phase = "COMPLETE";
        return {
          output,
          providerReceipt: {
            outcome: "SETTLED" as const,
            requestId: providerRequestId,
            requestSha256: request.requestSha256,
            responseSha256: sha(bytes),
            usage,
            costNanos,
          },
        };
      } catch (error) {
        const failure =
          error instanceof Error ? error : new Error("UNIVERSAL_PROVIDER_FAILURE");
        const kind =
          failure.name === "TimeoutError"
            ? "TIMEOUT"
            : failure.name === "AbortError"
              ? "ABORTED"
              : "FAILED";
        try {
          const errors = error instanceof AggregateError ? error.errors.slice(0, 4) : [error];
          const codes = errors.map((value: unknown) =>
            value instanceof Error && "code" in value ? value.code : undefined,
          );
          const origin = error && typeof error === "object" ? error as { name?: unknown; stack?: unknown } : undefined;
          const frame = typeof origin?.stack === "string"
            ? origin.stack.split("\n").slice(1).map((line) =>
                /^\s+at .*\/app\/server-capture\.mjs:(\d{1,7}):(\d{1,7})\)?$/.exec(line),
              ).find(Boolean) : undefined;
          console.info(JSON.stringify({
            event: "universal_provider_phase_failed",
            phase,
            boundary: phase === "ACQUIRE" ? boundary : undefined,
            backendFrame: frame ? { line: Number(frame[1]), column: Number(frame[2]) } : undefined,
            kind: origin?.name === "ZodError" || origin?.name === "$ZodError" ? "SCHEMA"
              : error instanceof AggregateError ? "AGGREGATE"
              : error instanceof TypeError ? "TYPE"
                : error instanceof SyntaxError ? "SYNTAX"
                  : kind === "TIMEOUT" || kind === "ABORTED" ? kind : "OTHER",
            code: ["ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "ENETUNREACH",
              "EHOSTUNREACH", "EAI_AGAIN", "ENOTFOUND", "42501", "53300", "57014",
              "57P01", "08006", "INVALID_SESSION", "CORE_CONNECTION_TIMEOUT",
              "UNIVERSAL_AUTH_REJECTED", "UNIVERSAL_PROVIDER_SCOPE_CHANGED",
              "UNIVERSAL_DURABLE_START_UNAVAILABLE", "UNIVERSAL_PROVIDER_CLOSED",
              "UNIVERSAL_PROVIDER_CREDENTIAL_INVALID", "CORE_CONNECTION_BUSY",
              "CORE_CONNECTION_RETIRED", "CORE_TRANSACTION_UNFINISHED",
              "UNIVERSAL_SOURCE_CHANGED", "UNIVERSAL_SOURCE_MATERIAL_INVALID",
              "UNIVERSAL_SOURCE_IMAGE_UNQUALIFIED", "UNIVERSAL_TASK_SCOPE_CHANGED",
              "PDF_CUSTODY_ORIGINAL_UNCONFIRMED", "INTELLIGENCE_STALE_SOURCE",
              "INTELLIGENCE_STALE_CAPTURE", "INTELLIGENCE_STALE_INPUT", "INTELLIGENCE_STALE_RUN",
              "INTELLIGENCE_DIGEST", "CORE_PRINCIPAL_UNAVAILABLE",
              "CP14_CORRELATION_MISMATCH", "CP14_CONFIG_CORRELATION", "CP14_CALL_MISMATCH",
              "UNIVERSAL_TASK_RECEIPT_BINDING_INVALID", "UNIVERSAL_MODEL_TASK_BINDING",
              "UNIVERSAL_MODEL_TASK_BINDING_INVALID", "MODEL_TASK_READ_FORBIDDEN",
              "UNIVERSAL_SOURCE_CLOSED", "UNIVERSAL_TASK_DEADLINE", "28P01", "28000", "P0001",
            ].find((code) => codes.includes(code) || failure.message === code) ?? "UNCLASSIFIED",
          }));
        } catch {
          // Diagnostics must preserve the owning failure and never trigger another send.
        }
        // Queue diagnostics retain a fixed stage code, never provider messages or material.
        throw Object.assign(new Error(failure.message, { cause: error }), {
          name: failure.name,
          code: `UNIVERSAL_PROVIDER_${phase}_${kind}`,
        });
      }
    },
  };
}
