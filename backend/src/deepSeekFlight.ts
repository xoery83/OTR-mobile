import { z } from "zod";
import { flightRemoteOutputSchema } from "../../src/domain/intelligence/remoteFlightText";
import { verifiedCallContextSchema } from "./externalIntegrationPersistence";
import type { FlightRemoteEnvelope } from "../../src/domain/intelligence/remoteFlightText";
export const DEEPSEEK_FLIGHT_DESTINATION =
  "https://api.deepseek.com/chat/completions" as const;
const secretReference = "vault:otr/dev/deepseek/flight-import-v1" as const;
const safeId = (v: unknown) =>
  typeof v === "string" && /^[A-Za-z0-9._:-]{1,128}$/.test(v) ? v : null;
export type FlightProviderError =
  | "INVALID_REQUEST"
  | "AUTH_FAILED"
  | "BALANCE_EXHAUSTED"
  | "RATE_LIMITED"
  | "PROVIDER_UNAVAILABLE"
  | "TIMEOUT"
  | "RESPONSE_LOST"
  | "MALFORMED_OUTPUT"
  | "SEMANTIC_INVALID"
  | "POLICY_BLOCKED"
  | "CANCELED"
  | "UNKNOWN";
export type FlightProviderUsage = ReturnType<typeof mapDeepSeekFlightUsage>;
export function mapDeepSeekFlightUsage(raw: unknown) {
  const u = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const n = (v: unknown) =>
    typeof v === "number" && Number.isSafeInteger(v) && v >= 0 ? v : null;
  const detail = (k: string) =>
    u[k] && typeof u[k] === "object" ? (u[k] as Record<string, unknown>) : {};
  let input = n(u.prompt_tokens),
    output = n(u.completion_tokens),
    total = n(u.total_tokens);
  const cached = n(detail("prompt_tokens_details").cached_tokens),
    hit = n(u.prompt_cache_hit_tokens);
  let cached_input = hit ?? cached,
    reasoning = n(detail("completion_tokens_details").reasoning_tokens),
    miss = n(u.prompt_cache_miss_tokens);
  const inconsistent =
    (hit !== null && cached !== null && hit !== cached) ||
    (input !== null && cached_input !== null && cached_input > input) ||
    (output !== null && reasoning !== null && reasoning > output) ||
    (input !== null && output !== null && total !== null && input + output !== total) ||
    (input !== null &&
      miss !== null &&
      cached_input !== null &&
      miss + cached_input !== input);
  if (inconsistent) input = output = total = cached_input = reasoning = miss = null;
  return {
    input_tokens: input,
    output_tokens: output,
    total_tokens: total,
    cached_input_tokens: cached_input,
    reasoning_tokens: reasoning,
    provider_extension: miss === null ? {} : { prompt_cache_miss_tokens: miss },
    usage_quality:
      inconsistent || input === null || output === null || total === null
        ? ("UNKNOWN" as const)
        : ("ACTUAL_REPORTED" as const),
  };
}
// Backend-private boundary: no real resolver or host credential lookup is supplied.
export type FlightSecretResolver = {
  resolve(input: {
    environment: "DEV";
    provider: "DeepSeek";
    reference: typeof secretReference;
    host: z.infer<typeof verifiedCallContextSchema>;
  }): Promise<{ value: string; assertCurrent(): Promise<void> } | null>;
};
export type FlightFixtureTransport = {
  kind: "NETWORK_DISABLED_FIXTURE";
  send(request: {
    url: typeof DEEPSEEK_FLIGHT_DESTINATION;
    method: "POST";
    redirect: "error";
    headers: { Authorization: string; "Content-Type": "application/json" };
    body: string;
    signal: AbortSignal;
    max_response_bytes: number;
  }): Promise<{ status: number; redirected: boolean; body: AsyncIterable<Uint8Array> }>;
};
const completionSchema = z.object({
  id: z.unknown().optional(),
  choices: z
    .array(
      z.object({
        finish_reason: z.literal("stop"),
        message: z.object({
          role: z.literal("assistant").optional(),
          content: z.string().min(1).max(131072),
          tool_calls: z.never().optional(),
          function_call: z.never().optional(),
        }),
      }),
    )
    .length(1),
  usage: z.unknown().optional(),
});
export type FlightProviderResult =
  | {
      status: "SUCCEEDED";
      output: unknown;
      usage: FlightProviderUsage;
      provider_request_id: string | null;
      latency_ms: number | null;
    }
  | {
      status: "FAILED" | "UNKNOWN";
      error: FlightProviderError;
      usage: FlightProviderUsage;
      provider_request_id: string | null;
      latency_ms: number | null;
    };
export async function prepareDeepSeekFlight(
  deps: {
    resolver: FlightSecretResolver;
    transport: FlightFixtureTransport;
    monotonic(): number;
  },
  envelope: FlightRemoteEnvelope,
  rawHost: unknown,
  signal: AbortSignal,
  deadline: number,
) {
  const verified = verifiedCallContextSchema.safeParse(structuredClone(rawHost));
  if (!verified.success) throw new Error("POLICY_BLOCKED");
  const host = verified.data;
  if (
    deps.transport.kind !== "NETWORK_DISABLED_FIXTURE" ||
    host.verified_environment !== "DEV" ||
    host.principal_kind !== "TRUSTED_WORKLOAD" ||
    host.gateway_identity !== "otr_external_integration_call_gateway" ||
    host.revoked ||
    Date.parse(host.expires_at) <= Date.now() ||
    host.verified_account_id !== envelope.binding.account_id ||
    host.verified_actor_id !== envelope.binding.account_id ||
    envelope.binding.descriptor.boundary_version !== "otr-flight-remote-v2"
  )
    throw new Error("POLICY_BLOCKED");
  if (signal.aborted || deps.monotonic() >= deadline) throw new Error("CANCELED");
  let secret: Awaited<ReturnType<FlightSecretResolver["resolve"]>>;
  try {
    secret = await deps.resolver.resolve({
      environment: "DEV",
      provider: "DeepSeek",
      reference: secretReference,
      host,
    });
  } catch {
    throw new Error("AUTH_FAILED");
  }
  if (
    !secret ||
    typeof secret.value !== "string" ||
    !secret.value ||
    /[\r\n\0]/.test(secret.value) ||
    secret.value.length > 8192
  )
    throw new Error("AUTH_FAILED");
  // Closure custody: credential never enters an envelope, retained result or telemetry.
  const pins = envelope.binding.descriptor.remote;
  let consumed = false;
  return {
    async assertReady() {
      if (signal.aborted || deps.monotonic() >= deadline) throw new Error("CANCELED");
      try {
        await secret.assertCurrent();
      } catch {
        throw new Error("AUTH_FAILED");
      }
    },
    async execute(ack: {
      call_id: string;
      dispatch_state: string;
      execution_certainty: string;
      request_sha256: string;
      row_revision: number;
    }): Promise<FlightProviderResult> {
      if (
        consumed ||
        ack.call_id !== pins.call_id ||
        ack.request_sha256 !== pins.request_sha256 ||
        ack.dispatch_state !== "MAY_HAVE_STARTED" ||
        ack.execution_certainty !== "RUNNING" ||
        ack.row_revision < 2
      )
        throw new Error("POLICY_BLOCKED");
      consumed = true;
      const start = deps.monotonic();
      let reportedUsage = mapDeepSeekFlightUsage(null);
      let requestID: string | null = null;
      const failure = (
        error: FlightProviderError,
        status: "FAILED" | "UNKNOWN" = "UNKNOWN",
      ): FlightProviderResult => ({
        status,
        error,
        usage: reportedUsage,
        provider_request_id: requestID,
        latency_ms: Math.max(0, Math.floor(deps.monotonic() - start)),
      });
      if (signal.aborted) return failure("CANCELED");
      if (start >= deadline) return failure("TIMEOUT");
      const abort = new AbortController();
      const cancel = () => abort.abort();
      signal.addEventListener("abort", cancel, { once: true });
      let timer: ReturnType<typeof setTimeout> | undefined;
      const remaining = Math.max(1, deadline - start);
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          abort.abort();
          reject(new Error("TIMEOUT"));
        }, remaining);
      });
      const work = (async () => {
        const response = await deps.transport.send({
          url: DEEPSEEK_FLIGHT_DESTINATION,
          method: "POST",
          redirect: "error",
          headers: {
            Authorization: `Bearer ${secret.value}`,
            "Content-Type": "application/json",
          },
          body: envelope.provider_body,
          signal: abort.signal,
          max_response_bytes: 131072,
        });
        if (response.redirected || (response.status >= 300 && response.status < 400))
          return failure("POLICY_BLOCKED", "FAILED");
        const statuses: Record<number, FlightProviderError> = {
          400: "INVALID_REQUEST",
          401: "AUTH_FAILED",
          402: "BALANCE_EXHAUSTED",
          429: "RATE_LIMITED",
          500: "PROVIDER_UNAVAILABLE",
          503: "PROVIDER_UNAVAILABLE",
        };
        if (response.status !== 200)
          return failure(statuses[response.status] ?? "PROVIDER_UNAVAILABLE", "FAILED");
        const chunks: Uint8Array[] = [];
        let bytes = 0;
        for await (const chunk of response.body) {
          if (signal.aborted) return failure("CANCELED");
          if (deps.monotonic() >= deadline) return failure("TIMEOUT");
          if (chunks.length >= 1024) return failure("MALFORMED_OUTPUT", "FAILED");
          bytes += chunk.length;
          if (bytes > 131072) return failure("MALFORMED_OUTPUT", "FAILED");
          chunks.push(chunk);
        }
        if (signal.aborted) return failure("CANCELED");
        const joined = new Uint8Array(bytes);
        let offset = 0;
        for (const chunk of chunks) {
          joined.set(chunk, offset);
          offset += chunk.length;
        }
        let raw: unknown;
        try {
          raw = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(joined));
        } catch {
          return failure("MALFORMED_OUTPUT", "FAILED");
        }
        if (raw && typeof raw === "object" && !Array.isArray(raw))
          reportedUsage = mapDeepSeekFlightUsage((raw as Record<string, unknown>).usage);
        const parsed = completionSchema.safeParse(raw);
        if (!parsed.success) return failure("MALFORMED_OUTPUT", "FAILED");
        requestID = safeId(parsed.data.id);
        let output: unknown;
        try {
          output = JSON.parse(parsed.data.choices[0].message.content.trim());
        } catch {
          return failure("MALFORMED_OUTPUT", "FAILED");
        }
        const wire = flightRemoteOutputSchema.safeParse(output);
        if (!wire.success) return failure("SEMANTIC_INVALID", "FAILED");
        return {
          status: "SUCCEEDED" as const,
          output: wire.data,
          usage: reportedUsage,
          provider_request_id: requestID,
          latency_ms: Math.max(0, Math.floor(deps.monotonic() - start)),
        };
      })();
      try {
        return await Promise.race([work, timeout]);
      } catch {
        return failure(
          signal.aborted
            ? "CANCELED"
            : deps.monotonic() >= deadline
              ? "TIMEOUT"
              : "RESPONSE_LOST",
        );
      } finally {
        if (timer) clearTimeout(timer);
        signal.removeEventListener("abort", cancel);
      }
    },
  };
}
