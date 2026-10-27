import { test } from "vitest";
import assert from "node:assert/strict";
import {
  VERSION,
  requestSchema,
  canApplySuggestions,
  createFlightEnrichmentService,
  InMemoryFlightCache,
  buildCacheEntry,
  freshUntil,
  matchCache,
  projectFlightSuggestions,
  createHostLookupProvider,
  createOtrEnrichmentHandler,
  decodeSearch,
  decodeExtraction,
  DEFAULT_PLAN,
  summarizeUsage,
  type FlightEnrichmentResponse,
  type IdempotencyPort,
  type ProviderObservation,
  type RawResult,
  type ServiceDependencies,
  type TrustedContext,
} from "./index";
const now = Date.parse("2026-10-27T00:00:00Z");
export const query = () =>
  requestSchema.parse({
    version: VERSION,
    requestId: "r1",
    idempotencyKey: "k1",
    mode: "CREATE",
    draft: { id: "d1", revision: 1 },
    flightNumber: "NZ101",
    departureLocalDate: "2026-11-15",
  });
const context: TrustedContext = {
  accountId: "account-fixture",
  actorId: "actor-fixture",
  tripId: null,
  authFence: "generation1",
  async assertCurrent() {},
};
const observation = (model = false): ProviderObservation => ({
  providerId: "deepseek",
  modelId: model ? "deepseek-flash" : null,
  providerRequestId: null,
  input_tokens: model ? 100 : 0,
  output_tokens: model ? 20 : 0,
  cached_input_tokens: model ? 10 : 0,
  total_tokens: model ? 120 : 0,
  usage_quality: "ACTUAL_REPORTED",
  cost_nanos: model ? "200000" : "750000",
  cost_quality: "ESTIMATED",
  billing_status: "UNRECONCILED",
  execution: "COMPLETED",
});
export function fixture(): RawResult {
  return {
    evidence: [
      {
        id: "S1",
        url: "https://example.com/synthetic-fixture",
        observedAt: new Date(now).toISOString(),
        text: "NZ101 AKL SYD 2026-11-15 06:50 Pacific/Auckland",
      },
    ],
    proposal: {
      status: "PARTIAL",
      candidates: [],
      fields: Object.fromEntries(
        Object.entries({
          flightNumber: "NZ101",
          departureAirport: "AKL",
          arrivalAirport: "SYD",
          departureLocalDate: "2026-11-15",
          departureLocalTime: "06:50",
          departureTimezone: "Pacific/Auckland",
        }).map(([k, v]) => [
          k,
          {
            value: v,
            evidenceId: "S1",
            quote: v,
            applicableFrom: "2026-11-15",
            applicableTo: "2026-11-15",
            dateEvidenceQuote: "2026-11-15",
          },
        ]),
      ),
    },
  };
}
class MemoryIdem implements IdempotencyPort {
  rows = new Map<
    string,
    { digest: string; promise: Promise<FlightEnrichmentResponse> }
  >();
  execute(
    s: Parameters<IdempotencyPort["execute"]>[0],
    action: () => Promise<FlightEnrichmentResponse>,
  ) {
    const k = [s.accountId, s.actorId, s.key].join(":");
    const prior = this.rows.get(k);
    if (prior) {
      if (prior.digest !== s.digest) return Promise.reject(Error("IDEMPOTENCY_CONFLICT"));
      return prior.promise;
    }
    const promise = action();
    this.rows.set(k, { digest: s.digest, promise });
    return promise;
  }
}
function setup(overrides: Partial<ServiceDependencies> = {}) {
  const calls: string[] = [],
    events: any[] = [];
  const raw = fixture();
  const deps: ServiceDependencies = {
    now: () => now,
    cache: new InMemoryFlightCache(),
    idempotency: new MemoryIdem(),
    usage: {
      async admit(i, p) {
        events.push({ i, p });
        return { allowed: true, receiptId: "usage1" };
      },
      async observeStep(e) {
        events.push(e);
      },
      async finish(e) {
        events.push(e);
      },
    },
    provider: {
      providerId: "deepseek",
      modelId: "deepseek-flash",
      async execute(s) {
        calls.push(s.kind);
        return {
          body: Buffer.from(
            JSON.stringify(
              s.kind === "SEARCH"
                ? {
                    results: raw.evidence.map((e) => ({
                      url: e.url,
                      content: e.text,
                    })),
                  }
                : {
                    choices: [
                      {
                        finish_reason: "stop",
                        message: { content: JSON.stringify(raw.proposal) },
                      },
                    ],
                  },
            ),
          ),
          observation: observation(s.kind === "EXTRACTION"),
          receiptId: s.kind,
          httpStatus: 200,
        };
      },
    },
    ...overrides,
  };
  return {
    service: createFlightEnrichmentService(deps),
    deps,
    calls,
    events,
    raw,
  };
}
const grant = {
  licenseReference: "SYNTHETIC-TEST-ONLY",
  licenseUntil: "2026-12-01T00:00:00Z",
  maxRetentionMs: 30 * 86400000,
  identity: {
    instanceId: "fixture1",
    flightNumber: "NZ101",
    departureLocalDate: "2026-11-15",
    departureAirport: "AKL",
    arrivalAirport: "SYD",
    departureTimezone: "Pacific/Auckland",
    departureInstant: "2026-11-14T17:50:00Z",
    uniqueDesignatorOnDate: true,
  },
};
test("cold query has exactly Search + Extraction and partial advisory", async () => {
  const s = setup(),
    r = await s.service.enrich(query(), context);
  assert.deepEqual(s.calls, ["SEARCH", "EXTRACTION"]);
  assert.equal(r.status, "PARTIAL");
  assert.equal(r.cache.writes, "CLOSED_LICENSE_UNCONFIRMED");
  assert.equal(r.usage.providerCostNanos, "950000");
  assert.equal(r.usage.total_tokens, 120);
  assert.equal(r.usage.cached_input_tokens, 10);
  assert.equal(s.events.at(-1).summaryOnly, true);
});
test("cache hit has no new provider fees or calls", async () => {
  const s = setup();
  await s.deps.cache.put(
    buildCacheEntry(query(), fixture(), grant, "deepseek", "deepseek-flash", now)!,
    AbortSignal.timeout(100),
  );
  const r = await s.service.enrich(query(), context);
  assert.equal(r.cache.state, "HIT");
  assert.equal(r.usage.providerCostNanos, "0");
  assert.equal(s.calls.length, 0);
});
test("licensed test cache writes are opt-in", async () => {
  const s = setup({ authorizeCacheWrite: async () => grant });
  const r = await s.service.enrich(query(), context);
  assert.equal(r.cache.writes, "WRITTEN");
});
test("concurrent duplicate submits share one result and usage", async () => {
  const s = setup();
  const r = await Promise.all([
    s.service.enrich(query(), context),
    s.service.enrich(query(), context),
  ]);
  assert.deepEqual(r[0], r[1]);
  assert.equal(s.calls.length, 2);
});
test("changed payload with same key is rejected", async () => {
  const s = setup();
  await s.service.enrich(query(), context);
  await assert.rejects(
    s.service.enrich({ ...query(), draft: { id: "d1", revision: 2 } }, context),
    /IDEMPOTENCY/,
  );
});
test("account scope never shares idempotent result", async () => {
  const s = setup();
  await s.service.enrich(query(), context);
  await s.service.enrich(query(), { ...context, accountId: "other" });
  assert.equal(s.calls.length, 4);
});
test("empty search does not trigger extraction", async () => {
  const s = setup();
  s.deps.provider.execute = async () => ({
    body: Buffer.from('{"results":[]}'),
    observation: observation(),
    receiptId: "search",
    httpStatus: 200,
  });
  const r = await s.service.enrich(query(), context);
  assert.equal(r.status, "NOT_FOUND");
  assert.equal(r.usage.searchCalls, 1);
  assert.equal(r.usage.llmCalls, 0);
});
test("budget denial never dispatches", async () => {
  const s = setup();
  s.deps.usage.admit = async () => ({ allowed: false, receiptId: "denied" });
  assert.equal(
    (await s.service.enrich(query(), context)).failureReason,
    "BUDGET_REJECTED",
  );
  assert.equal(s.calls.length, 0);
});
test("invalid estimate plan fails construction", () =>
  assert.throws(
    () => setup({ plan: { ...DEFAULT_PLAN, extractionEstimateNanos: "10000000" } }),
    /BUDGET/,
  ));
test("denied entitlement never dispatches", async () => {
  const s = setup({
    entitlement: {
      async check() {
        return "DENIED";
      },
    },
  });
  assert.equal(
    (await s.service.enrich(query(), context)).failureReason,
    "ENTITLEMENT_DENIED",
  );
  assert.equal(s.calls.length, 0);
});
test("multi-leg never selects a leg", () => {
  const raw = fixture();
  raw.proposal.candidates = [
    { departureAirport: "SIN", arrivalAirport: "FRA" },
    { departureAirport: "FRA", arrivalAirport: "JFK" },
  ];
  const r = projectFlightSuggestions(query(), raw);
  assert.equal(r.status, "AMBIGUOUS");
  assert.equal(r.suggestions.length, 0);
});
test("missing applicable date is reference-only", () => {
  const raw = fixture();
  for (const f of Object.values(raw.proposal.fields)) if (f) delete f.dateEvidenceQuote;
  const r = projectFlightSuggestions(query(), raw);
  assert.equal(r.status, "REFERENCE_ONLY");
});
test("different date fences every field", () => {
  const raw = fixture();
  raw.proposal.fields.departureLocalDate!.value = "2026-11-16";
  assert.equal(projectFlightSuggestions(query(), raw).suggestions.length, 0);
});
test("airport conflict preserves original input", () => {
  const q = query();
  q.knownFields.departureAirport = "CHC";
  const before = structuredClone(q),
    r = projectFlightSuggestions(q, fixture());
  assert.deepEqual(q, before);
  assert.equal(
    r.references.find((s) => s.field === "departureAirport")?.reason,
    "EXISTING_VALUE_CONFLICT",
  );
});
test("time updates offer explicit keep/replace", () => {
  const q = query();
  q.knownFields.departureLocalTime = "06:45";
  assert.equal(
    projectFlightSuggestions(q, fixture()).suggestions.find(
      (s) => s.field === "departureLocalTime",
    )?.eligibility,
    "KEEP_OR_REPLACE",
  );
});
test("unquoted values cannot become suggestions", () => {
  const raw = fixture();
  raw.proposal.fields.departureAirport!.quote = "made up";
  assert.ok(
    !projectFlightSuggestions(query(), raw).suggestions.some(
      (s) => s.field === "departureAirport",
    ),
  );
});
test("old draft revision cannot apply", async () => {
  const s = setup(),
    q = query(),
    r = await s.service.enrich(q, context);
  assert.equal(canApplySuggestions(r, q), true);
  assert.equal(
    canApplySuggestions(r, { ...q, draft: { ...q.draft, revision: 2 } }),
    false,
  );
});
test("client cannot claim account/actor authority", () =>
  assert.equal(
    requestSchema.safeParse({ ...query(), accountId: "admin" }).success,
    false,
  ));
test("TTL far, 72-hour boundary and final day", () => {
  const h = 3600000;
  assert.equal(
    freshUntil(now, now + 100 * h, now, now + 1000 * h, 30 * 24 * h),
    now + 28 * h,
  );
  assert.equal(
    freshUntil(now, now + 72 * h, now, now + 1000 * h, 30 * 24 * h),
    now + 24 * h,
  );
  assert.equal(
    freshUntil(now, now + 24 * h, now, now + 1000 * h, 30 * 24 * h),
    now + 3 * h,
  );
});
test("TTL obeys license and never refreshes itself", () => {
  assert.equal(freshUntil(now, now + 100 * 3600000, now, now + 1000, 100000), now + 1000);
  const c = new InMemoryFlightCache();
  assert.ok(c);
});
test("ambiguous flight identity misses cache", () => {
  const e = buildCacheEntry(
    query(),
    fixture(),
    grant,
    "deepseek",
    "deepseek-flash",
    now,
  )!;
  e.grant.identity.uniqueDesignatorOnDate = false;
  assert.equal(matchCache(e, query(), now), null);
});
test("expired cache and other dates miss", () => {
  const e = buildCacheEntry(
    query(),
    fixture(),
    grant,
    "deepseek",
    "deepseek-flash",
    now,
  )!;
  assert.equal(matchCache(e, query(), now + 30 * 86400000), null);
  assert.equal(
    matchCache(e, { ...query(), departureLocalDate: "2026-11-16" }, now),
    null,
  );
});
test("saved item independent of cache refresh", async () => {
  const saved = Object.freeze({ departureAirport: "CHC" }),
    before = JSON.stringify(saved),
    s = setup({ authorizeCacheWrite: async () => grant });
  await s.service.enrich(query(), context);
  assert.equal(JSON.stringify(saved), before);
  assert.ok(!("save" in s.service));
});
test("closed provider profile cannot dispatch", async () => {
  let calls = 0;
  const s = setup({
    provider: createHostLookupProvider(async () => {
      calls++;
      throw Error();
    }),
  });
  assert.equal((await s.service.enrich(query(), context)).failureReason, "POLICY_CLOSED");
  assert.equal(calls, 0);
});
test("closed route never invokes auth or service", async () => {
  const s = setup(),
    handler = createOtrEnrichmentHandler(s.service, async () => {
      throw Error();
    });
  assert.equal(
    (await handler(new Request("http://localhost", { method: "POST" }))).status,
    503,
  );
});
test("malformed extraction fails safely", () =>
  assert.throws(() => decodeExtraction(Buffer.from('{"choices":[]}')), /MALFORMED/));
test("response size bound", () =>
  assert.throws(
    () => decodeSearch(new Uint8Array(131073), new Date(now).toISOString()),
    /RESPONSE_BOUND/,
  ));
test("timeout returns while late paid result still settles", async () => {
  const s = setup({ searchTimeoutMs: 5 });
  s.deps.provider.execute = async () => {
    await new Promise((r) => setTimeout(r, 30));
    return {
      body: Buffer.from('{"results":[]}'),
      observation: observation(),
      receiptId: "late1",
      httpStatus: 200,
    };
  };
  const r = await s.service.enrich(query(), context);
  assert.equal(r.failureReason, "TIMEOUT");
  assert.equal(r.usage.providerCostNanos, null);
  await new Promise((r) => setTimeout(r, 40));
  assert.ok(s.events.some((e) => e.late && e.observation.cost_nanos === "750000"));
  assert.equal(r.usage.llmCalls, 0);
});
test("canceled query does not dispatch", async () => {
  const s = setup(),
    c = new AbortController();
  c.abort();
  assert.equal(
    (await s.service.enrich(query(), context, c.signal)).status,
    "UNAVAILABLE",
  );
  assert.equal(s.calls.length, 0);
});
test("meter summary failure yields manual fallback", async () => {
  const s = setup();
  s.deps.usage.finish = async () => {
    throw Error();
  };
  const r = await s.service.enrich(query(), context);
  assert.equal(r.usage.metering, "PENDING");
  assert.equal(r.suggestions.length, 0);
});
test("unknown dispatch cost remains unknown, never zero", () => {
  const r = summarizeUsage(
    "r",
    "deepseek",
    "deepseek-flash",
    {},
    ["SEARCH"],
    "POLICY_UNFROZEN",
    false,
    [],
  );
  assert.equal(r.providerCostNanos, null);
  assert.equal(r.knownCostNanos, "0");
});
test("revoked account is rejected before provider dispatch", async () => {
  const s = setup();
  await assert.rejects(
    s.service.enrich(query(), {
      ...context,
      async assertCurrent() {
        throw Error("AUTH_CHANGED");
      },
    }),
  );
  assert.equal(s.calls.length, 0);
});
test("quote cannot justify a different airport value", () => {
  const raw = fixture();
  raw.proposal.fields.departureAirport!.value = "CHC";
  assert.ok(
    !projectFlightSuggestions(query(), raw).suggestions.some(
      (s) => s.field === "departureAirport",
    ),
  );
});
test("same year alone cannot prove a requested day", () => {
  const raw = fixture();
  raw.evidence[0].text += " 2026-11-01";
  for (const f of Object.values(raw.proposal.fields))
    if (f) f.dateEvidenceQuote = "2026-11-01";
  assert.equal(projectFlightSuggestions(query(), raw).suggestions.length, 0);
});
test("cache UTC instant must agree with local departure date", () => {
  const bad = structuredClone(grant);
  bad.identity.departureInstant = "2026-11-16T17:50:00Z";
  assert.equal(
    buildCacheEntry(query(), fixture(), bad, "deepseek", "deepseek-flash", now),
    null,
  );
});
test("closed profile reports zero HTTP and zero paid cost", async () => {
  const s = setup({
    provider: createHostLookupProvider(async () => {
      throw Error();
    }),
  });
  const r = await s.service.enrich(query(), context);
  assert.equal(r.usage.searchCalls, 0);
  assert.equal(r.usage.providerCostNanos, "0");
});
test("failed per-step metering stays pending even if summary succeeds", async () => {
  const s = setup();
  s.deps.usage.observeStep = async () => {
    throw Error();
  };
  const r = await s.service.enrich(query(), context);
  assert.equal(r.usage.metering, "PENDING");
  assert.equal(r.failureReason, "METERING_UNAVAILABLE");
  assert.equal(r.usage.llmCalls, 0);
});
test("observation token invariants reject invalid counts", async () => {
  const { observationSchema } = await import("./contracts");
  assert.equal(
    observationSchema.safeParse({
      ...observation(true),
      cached_input_tokens: 101,
    }).success,
    false,
  );
  assert.equal(
    observationSchema.safeParse({ ...observation(true), total_tokens: 999 }).success,
    false,
  );
});
test("identity token cannot match a longer airport or flight number", () => {
  const raw = fixture();
  raw.proposal.fields.flightNumber!.value = "NZ10";
  assert.ok(
    !projectFlightSuggestions({ ...query(), flightNumber: "NZ10" }, raw).suggestions.some(
      (s) => s.field === "flightNumber",
    ),
  );
});
test("request-bound rejection records NOT_STARTED", async () => {
  let called = 0;
  const provider = createHostLookupProvider(async () => {
    called++;
    throw Error();
  }, true);
  await assert.rejects(
    provider.execute(
      {
        kind: "EXTRACTION",
        stepId: "s",
        receiptId: "u",
        signal: AbortSignal.timeout(100),
        maxResponseBytes: 131072,
        maxRequestBytes: 24000,
        request: query(),
        evidence: [{ ...fixture().evidence[0], text: "x".repeat(25000) }],
      },
      context,
    ),
    (e: any) => e.reason === "INPUT_BOUND" && e.observation.execution === "NOT_STARTED",
  );
  assert.equal(called, 0);
});
test("persisted summary reflects prior step metering failure", async () => {
  const s = setup();
  s.deps.usage.observeStep = async () => {
    throw Error();
  };
  await s.service.enrich(query(), context);
  assert.equal(s.events.at(-1).usage.metering, "PENDING");
});
test("historical minimal evidence replay remains partial and advisory", async () => {
  const { readFileSync } = await import("node:fs");
  const x = JSON.parse(
    readFileSync(new URL("./evidence/advisory-replay.json", import.meta.url), "utf8"),
  );
  const r = projectFlightSuggestions(requestSchema.parse(x.request), x.result);
  assert.equal(r.status, "PARTIAL");
  assert.equal(r.suggestions.find((s) => s.field === "departureAirport")?.value, "AKL");
});
test("enabled Host adapter delegates bounded search without secrets", async () => {
  let captured: any;
  const provider = createHostLookupProvider(async (call) => {
    captured = call;
    return {
      body: Buffer.from('{"results":[]}'),
      observation: observation(),
      receiptId: "s",
      httpStatus: 200,
    };
  }, true);
  await provider.execute(
    {
      kind: "SEARCH",
      stepId: "s",
      receiptId: "u",
      signal: AbortSignal.timeout(100),
      maxResponseBytes: 131072,
      maxRequestBytes: 24000,
      request: query(),
    },
    context,
  );
  assert.equal(captured.url, "https://api.deepseek.com/v1/tools/search");
  assert.equal(JSON.parse(captured.body).count, 5);
  assert.equal(JSON.parse(captured.body).need_content, true);
  assert.ok(!captured.body.includes(context.accountId));
});
