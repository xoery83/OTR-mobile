import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { coreUuid } from "../../src/domain/trip/tripCoreV2";
import { createCoreV2Transport } from "../../src/data/api/tripCoreV2Transport";
import { ApiClientError } from "../../src/data/api/client";
import { getAccountGeneration } from "../../src/data/auth/accountGeneration";
import type { AccountRequestContext } from "../../src/data/auth/accountRequestContext";

type Version = { actorAccountId: string; tripId: string; token: string };

// Reuse the existing fetch seam; keep only server-generated correlation and durations.
export function createHostedVersionFetchTiming(fetchImplementation: typeof fetch = fetch) {
  let last: { requestId: string | null; headersMs: number; headersAt: number } | undefined;
  const timedFetch: typeof fetch = async (input, init) => {
    last = undefined;
    const started = performance.now();
    const response = await fetchImplementation(input, init);
    const id = response.headers.get("X-Request-Id");
    last = {
      requestId: id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) ? id : null,
      headersMs: +(performance.now() - started).toFixed(2),
      headersAt: performance.now(),
    };
    return response;
  };
  return {
    fetch: timedFetch,
    sample: () => last ? {
      requestId: last.requestId,
      httpToHeadersMs: last.headersMs,
      afterHeadersMs: +(performance.now() - last.headersAt).toFixed(2),
    } : undefined,
  };
}

// Timing only; no stored token, new Auth path, or connection-pool reset.
export async function measureHostedVersion(
  context: AccountRequestContext,
  read: (context: AccountRequestContext) => Promise<Version>,
  readTiming?: ReturnType<typeof createHostedVersionFetchTiming>["sample"],
) {
  const samples = [];
  let previous: string | undefined;
  for (const label of ["first_request", "repeat_1", "repeat_2"]) {
    const startedAt = new Date().toISOString(),
      started = performance.now();
    const result = await read(context);
    if (result.actorAccountId !== context.accountId || result.tripId !== context.tripId)
      throw Error("CORE_VERSION_SCOPE_MISMATCH");
    samples.push({
      label,
      startedAt,
      ...readTiming?.(),
      milliseconds: +(performance.now() - started).toFixed(2),
      decodedBodyBytes: Buffer.byteLength(JSON.stringify(result)),
      unchangedFromPrevious: previous === undefined ? null : previous === result.token,
    });
    previous = result.token;
  }
  return {
    qualification: "NORMAL_AUTHORIZED_VERSION_GET_ONLY",
    samples,
    limits:
      "First/repeated HTTP requests, not proved cold/warm PG connections; correlate existing server phase telemetry. No mutation, subscription, Provider, Supabase readback or cross-device PASS.",
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv[2] !== "--run-dev") throw Error("EXPLICIT_DEV_RUN_REQUIRED");
    // Feed only a fresh normal QA Login result over stdin, never a device Session copy.
    const raw = readFileSync(0);
    if (raw.byteLength > 16_384) throw Error("QA_INPUT_LIMIT");
    const input = z
      .strictObject({
        accountId: coreUuid,
        tripId: coreUuid,
        accessToken: z.string().min(1).max(8192),
      })
      .parse(JSON.parse(raw.toString("utf8")));
    const context = {
      accountId: input.accountId,
      tripId: input.tripId,
      generation: getAccountGeneration(),
    };
    const timing = createHostedVersionFetchTiming();
    const transport = createCoreV2Transport(
      async () => input.accountId,
      async (bytes) => createHash("sha256").update(bytes).digest("hex"),
      { baseUrl: "https://api-dev.xoery.art", timeoutMs: 20_000, fetchImplementation: timing.fetch },
      async (request) => {
        if (request?.forceRefresh) throw Error("FRESH_NORMAL_LOGIN_REQUIRED");
        return { userId: input.accountId, token: input.accessToken };
      },
    );
    const result = await measureHostedVersion(context, (ctx) =>
      transport.authorizedVersion(ctx), timing.sample,
    );
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    // Never print raw Auth/provider errors or stdin material.
    console.error(
      JSON.stringify({
        status: "NOT_PASS",
        kind: error instanceof ApiClientError ? error.kind : "QA_FAILED",
        httpStatus: error instanceof ApiClientError ? error.status : undefined,
      }),
    );
    process.exitCode = 1;
  }
}
