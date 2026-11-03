import { createHash } from "node:crypto";
import { expect, it, vi } from "vitest";
import {
  DEEPSEEK_FLIGHT_SEARCH_DESTINATION,
  createFlightHttpsSend,
} from "../flightHttpsTransport";
import { createFlightEnrichmentHostRun, type EnrichmentStepAdmission } from "./hostRun";
import { ENRICHMENT_PROFILE, createHostLookupProvider } from "./provider";
import { requestSchema } from "./contracts";
import type { StepInput, TrustedContext } from "./ports";
const context: TrustedContext = {
  accountId: "a0000000-0000-4000-8000-000000000001",
  actorId: "a0000000-0000-4000-8000-000000000001",
  tripId: "a0000000-0000-4000-8000-000000000002",
  authFence: "test-fence",
  async assertCurrent() {},
};
function setup() {
  const order: string[] = [];
  const step: StepInput = {
    kind: "SEARCH",
    stepId: "a".repeat(64),
    receiptId: "receipt1",
    signal: new AbortController().signal,
    maxRequestBytes: 24000,
    maxResponseBytes: 131072,
    request: requestSchema.parse({
      version: "otr-flight-enrichment/1",
      requestId: "req1",
      idempotencyKey: "req1",
      mode: "CREATE",
      draft: { id: "d1", revision: 1 },
      flightNumber: "NZ101",
      departureLocalDate: "2026-10-27",
    }),
  };
  const admission: EnrichmentStepAdmission = {
    callId: "a0000000-0000-4000-8000-000000000003",
    receiptId: "receipt1",
    accountId: context.accountId,
    actorId: context.actorId,
    tripId: context.tripId!,
    stepId: step.stepId,
    requestSha256: "",
    prices: {
      searchNanosPerRequest: "750000",
      inputNanosPerMillion: "300000000",
      cachedInputNanosPerMillion: "6000000",
      outputNanosPerMillion: "1200000000",
      acceptedReturnedModels: ["deepseek-flash"],
    },
    credential: "SYNTHETIC_NOT_A_KEY",
    assertCurrent: vi.fn(async () => {
      order.push("current");
    }),
    markDispatch: vi.fn(async () => {
      order.push("mark");
    }),
    retainResponse: vi.fn(async (body, _status, sha) => {
      order.push("retain");
      expect(sha).toBe(createHash("sha256").update(body).digest("hex"));
    }),
  };
  const reserve = vi.fn<Parameters<typeof createFlightEnrichmentHostRun>[0]["reserve"]>(
    async (_call, _context, hash) => {
      order.push("reserve");
      admission.requestSha256 = hash;
      return admission;
    },
  );
  const http = vi.fn<typeof fetch>(async () => {
    order.push("http");
    return new Response(
      JSON.stringify({ results: [{ url: "https://example.invalid" }] }),
    );
  });
  const host = createFlightEnrichmentHostRun({
    reserve,
    send: createFlightHttpsSend(http, "FLIGHT_ENRICHMENT_V1"),
  });
  return {
    order,
    step,
    admission,
    reserve,
    http,
    host,
    execute: () => createHostLookupProvider(host, true).execute(step, context),
  };
}
it("reserves and durably marks before exactly one HTTP call, retains before returning", async () => {
  const f = setup();
  const result = await f.execute();
  expect(f.order).toEqual(["reserve", "current", "mark", "current", "http", "retain"]);
  expect(f.http).toHaveBeenCalledOnce();
  expect(f.http.mock.calls[0][0]).toBe(DEEPSEEK_FLIGHT_SEARCH_DESTINATION);
  expect(result.observation).toMatchObject({
    cost_nanos: "750000",
    execution: "COMPLETED",
  });
});
it("mismatched owning scope cannot receive credentials or dispatch", async () => {
  const f = setup();
  f.admission.tripId = context.accountId;
  await expect(f.execute()).rejects.toMatchObject({
    reason: "POLICY_CLOSED",
    observation: { execution: "NOT_STARTED", cost_nanos: "0" },
  });
  expect(f.http).not.toHaveBeenCalled();
  expect(f.admission.markDispatch).not.toHaveBeenCalled();
});
it("admission cannot widen the registered returned-model allowlist", async () => {
  const f = setup();
  f.admission.prices.acceptedReturnedModels.push("unapproved");
  await expect(f.execute()).rejects.toMatchObject({
    reason: "POLICY_CLOSED",
    observation: { execution: "NOT_STARTED" },
  });
  expect(f.admission.markDispatch).not.toHaveBeenCalled();
  expect(f.http).not.toHaveBeenCalled();
});
it("lost dispatch acknowledgement stays uncertain and never sends/retries HTTP", async () => {
  const f = setup();
  f.admission.markDispatch = vi.fn(async () => {
    throw Error("ACK_LOST");
  });
  await expect(f.execute()).rejects.toMatchObject({
    reason: "UNKNOWN",
    observation: { execution: "MAY_HAVE_STARTED", cost_nanos: null },
  });
  expect(f.http).not.toHaveBeenCalled();
  expect(f.reserve).toHaveBeenCalledOnce();
});
it("network loss is UNKNOWN and does not retry", async () => {
  const f = setup();
  f.http.mockRejectedValue(Error("CONNECTION_LOST"));
  await expect(f.execute()).rejects.toMatchObject({
    reason: "UNKNOWN",
    observation: { billing_status: "UNKNOWN" },
  });
  expect(f.http).toHaveBeenCalledOnce();
});
it.each(["auth", "credential"])(
  "revocation of %s during mark prevents HTTP and keeps an uncertain tombstone",
  async (target) => {
    const f = setup();
    let revoked = false;
    f.admission.markDispatch = vi.fn(async () => {
      revoked = true;
    });
    const assertCurrent = async () => {
      if (revoked) throw Error("REVOKED");
    };
    if (target === "credential") f.admission.assertCurrent = assertCurrent;
    const ctx = target === "auth" ? { ...context, assertCurrent } : context;
    await expect(
      createHostLookupProvider(f.host, true).execute(f.step, ctx),
    ).rejects.toMatchObject({
      observation: { execution: "MAY_HAVE_STARTED", cost_nanos: null },
    });
    expect(f.http).not.toHaveBeenCalled();
    expect(f.reserve).toHaveBeenCalledOnce();
  },
);
it("custody failure prevents suggestions without erasing measured cost", async () => {
  const f = setup();
  f.admission.retainResponse = vi.fn(async () => {
    throw Error("CUSTODY_DOWN");
  });
  await expect(f.execute()).rejects.toMatchObject({
    observation: { execution: "COMPLETED", cost_nanos: "750000" },
  });
  expect(f.http).toHaveBeenCalledOnce();
});
it("rejects oversized streamed material while retaining uncertain charges", async () => {
  const f = setup();
  f.http.mockResolvedValue(new Response("x".repeat(131073)));
  await expect(f.execute()).rejects.toMatchObject({
    observation: { cost_nanos: null, execution: "MAY_HAVE_STARTED" },
  });
  expect(f.http).toHaveBeenCalledOnce();
});
it("refuses unapproved URLs before reserve or credentials", async () => {
  const f = setup();
  await expect(
    f.host(
      {
        url: "https://evil.invalid",
        method: "POST",
        body: "{}",
        signal: f.step.signal,
        max_response_bytes: 131072,
        profile: ENRICHMENT_PROFILE,
        step: f.step,
      },
      context,
    ),
  ).rejects.toMatchObject({ reason: "POLICY_CLOSED" });
  expect(f.reserve).not.toHaveBeenCalled();
  expect(f.http).not.toHaveBeenCalled();
});
