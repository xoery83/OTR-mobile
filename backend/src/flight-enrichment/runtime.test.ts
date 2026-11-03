import { expect, it, vi } from "vitest";
import { createFlightHttpsSend } from "../flightHttpsTransport";
import { createConfiguredFlightEnrichmentService } from "./runtime";
import { createFlightEnrichmentBoundary } from "./hostBoundary";
import { responseSchema } from "./contracts";
import type { FlightEnrichmentResponse } from "./contracts";
import type { TrustedContext, UsagePort } from "./ports";
import replay from "./evidence/advisory-replay.json";

const context: TrustedContext = {
  accountId: "a0000000-0000-4000-8000-000000000001",
  actorId: "a0000000-0000-4000-8000-000000000001",
  tripId: "a0000000-0000-4000-8000-000000000002",
  authFence: "synthetic-only",
  async assertCurrent() {},
};
const request = {
  version: "otr-flight-enrichment/1",
  requestId: "r1",
  idempotencyKey: "r1",
  mode: "CREATE",
  draft: { id: "d1", revision: 1 },
  flightNumber: "NZ101",
  departureLocalDate: "2026-11-15",
};
function setup() {
  let stored: FlightEnrichmentResponse | null = null;
  let claimed = false;
  const invoke = vi.fn(async (kind: string, command: Record<string, unknown>) => {
    if (kind === "flight_enrichment_request_claim") {
      if (stored) return { state: "TERMINAL", response: stored };
      if (claimed) return { state: "PENDING" };
      claimed = true;
      return { state: "ACQUIRED" };
    }
    stored = responseSchema.parse(command.response);
    return { state: "TERMINAL", response: stored };
  });
  const http = vi.fn<typeof fetch>(async () => new Response('{"results":[]}'));
  const usage: UsagePort = {
    admit: vi.fn(async () => ({ allowed: true, receiptId: "logical-receipt" })),
    observeStep: vi.fn(async () => {}),
    finish: vi.fn(async () => {}),
  };
  const reserve = vi.fn<
    Parameters<typeof createConfiguredFlightEnrichmentService>[0]["reserve"]
  >(async (call, ctx, digest) => ({
    callId:
      call.step.kind === "SEARCH"
        ? "a0000000-0000-4000-8000-000000000003"
        : "a0000000-0000-4000-8000-000000000004",
    receiptId:
      call.step.kind === "SEARCH" ? "search-child-receipt" : "extraction-child-receipt",
    accountId: ctx.accountId,
    actorId: ctx.actorId,
    tripId: ctx.tripId!,
    stepId: call.step.stepId,
    requestSha256: digest,
    credential: "SYNTHETIC_TEST_KEY",
    prices: {
      searchNanosPerRequest: "750000",
      inputNanosPerMillion: "300000000",
      cachedInputNanosPerMillion: "6000000",
      outputNanosPerMillion: "1200000000",
      acceptedReturnedModels: ["deepseek-flash"],
    },
    async assertCurrent() {},
    async markDispatch() {},
    async retainResponse() {},
  }));
  const gateway = vi.fn(() => ({ invoke }) as any),
    meter = vi.fn(() => usage);
  const service = createConfiguredFlightEnrichmentService({
    gateway,
    usage: meter,
    reserve,
    send: createFlightHttpsSend(http, "FLIGHT_ENRICHMENT_V1"),
  });
  return { gateway, meter, service, http, usage, reserve };
}
it("composes authenticated route→private request claim→one Search→usage→terminal replay, without public cache", async () => {
  const f = setup();
  const route = createFlightEnrichmentBoundary({
    resolve: async () => context,
    service: f.service,
    enabled: true,
  });
  const post = () =>
    route(
      new Request(
        `https://synthetic.invalid/v1/trips/${context.tripId}/flight-enrichment`,
        { method: "POST", body: JSON.stringify(request) },
      ),
    );
  const first = responseSchema.parse(await (await post())!.json());
  expect(first.status).toBe("NOT_FOUND");
  expect(first.cache).toMatchObject({
    state: "MISS",
    writes: "CLOSED_LICENSE_UNCONFIRMED",
  });
  expect(first.usage).toMatchObject({
    searchCalls: 1,
    llmCalls: 0,
    providerCostNanos: "0",
  });
  expect(responseSchema.parse(await (await post())!.json())).toEqual(first);
  expect(f.http).toHaveBeenCalledOnce();
  expect(f.reserve).toHaveBeenCalledOnce();
  expect(f.usage.admit).toHaveBeenCalledOnce();
  expect(f.usage.observeStep).toHaveBeenCalledOnce();
  expect(f.usage.finish).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ summaryOnly: true }),
  );
});
it("missing Trip or revoked normal auth cannot construct a gateway/meter or dispatch", async () => {
  const f = setup();
  await expect(f.service.enrich(request, { ...context, tripId: null })).rejects.toThrow(
    "TRIP_REQUIRED",
  );
  await expect(
    f.service.enrich(request, {
      ...context,
      async assertCurrent() {
        throw Error("AUTH_REVOKED");
      },
    }),
  ).rejects.toThrow("AUTH_REVOKED");
  expect(f.gateway).not.toHaveBeenCalled();
  expect(f.meter).not.toHaveBeenCalled();
  expect(f.http).not.toHaveBeenCalled();
});
it("runs one Search plus one Extraction for historical synthetic replay and settles only child observations", async () => {
  const f = setup();
  f.http.mockResolvedValueOnce(
    new Response(
      JSON.stringify({
        results: [
          {
            title: "Synthetic fixture NZ101",
            url: replay.result.evidence[0].url,
            content: replay.result.evidence[0].text,
          },
        ],
      }),
    ),
  );
  f.http.mockResolvedValueOnce(
    new Response(
      JSON.stringify({
        model: "deepseek-flash",
        id: "synthetic-extraction",
        usage: {
          prompt_tokens: 100,
          completion_tokens: 20,
          total_tokens: 120,
          prompt_cache_hit_tokens: 10,
        },
        choices: [
          {
            finish_reason: "stop",
            message: { content: JSON.stringify(replay.result.proposal) },
          },
        ],
      }),
    ),
  );
  const input = { ...request, departureLocalDate: replay.request.departureLocalDate };
  const first = await f.service.enrich(input, context);
  expect(first.status).toBe("PARTIAL");
  expect(first.suggestions).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ field: "departureAirport", value: "AKL" }),
    ]),
  );
  expect(first.usage).toMatchObject({
    searchCalls: 1,
    llmCalls: 1,
    providerCostNanos: "801060",
    metering: "RECORDED",
  });
  expect(await f.service.enrich(input, context)).toEqual(first);
  expect(f.http).toHaveBeenCalledTimes(2);
  expect(f.reserve).toHaveBeenCalledTimes(2);
  expect(f.usage.admit).toHaveBeenCalledOnce();
  expect(f.usage.observeStep).toHaveBeenCalledTimes(2);
  expect(f.usage.finish).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ summaryOnly: true }),
  );
});
