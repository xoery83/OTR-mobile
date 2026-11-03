import { expect, it, vi } from "vitest";
import { commandDigest } from "../externalIntegrationPersistence";
import { appendFlightEnrichmentUsage, type EnrichmentUsageReceipt } from "./usageWriter";
import { measureFlightEnrichmentResponse } from "./metering";
import type { ProviderObservation } from "./contracts";
const id = (n: number) => `a0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const prices = {
  searchNanosPerRequest: "750000",
  inputNanosPerMillion: "300000000",
  cachedInputNanosPerMillion: "6000000",
  outputNanosPerMillion: "1200000000",
  acceptedReturnedModels: ["deepseek-flash"],
};
function fixture(empty = false) {
  const receipt: EnrichmentUsageReceipt = {
    accountId: id(1),
    actorId: id(1),
    tripId: id(2),
    requestId: "r1",
    idempotencyKey: "r1",
    requestDigest: "a".repeat(64),
    usageReceiptId: "logical1",
    stepReceiptId: "child1",
    stepId: "b".repeat(64),
    kind: "SEARCH",
    callId: id(3),
    priceScheduleId: id(4),
    rowRevision: 2,
    publicationFence: 1,
    dispatchState: "MAY_HAVE_STARTED",
    observationId: id(5),
    observedAt: "2026-10-27T00:00:00Z",
    responseSha256: "c".repeat(64),
    httpStatus: 200,
    inputCeiling: 0,
    outputCeiling: 0,
    maxCostNanos: "1000000",
  };
  const observation = measureFlightEnrichmentResponse(
    "SEARCH",
    Buffer.from(JSON.stringify({ results: empty ? [] : [{}] })),
    200,
    prices,
  ).observation;
  const event = {
    feature: "FLIGHT_ENRICHMENT" as const,
    accountId: receipt.accountId,
    actorId: receipt.actorId,
    tripId: receipt.tripId,
    requestId: receipt.requestId,
    idempotencyKey: receipt.idempotencyKey,
    requestDigest: receipt.requestDigest,
    usageReceiptId: receipt.usageReceiptId,
    stepId: receipt.stepId,
    kind: receipt.kind,
    stepReceiptId: receipt.stepReceiptId,
    observation,
    late: false,
  };
  const invoke = vi.fn(async (_kind: string, command: Record<string, unknown>) => {
    expect(command.request_sha256).toBe(commandDigest(command));
    return {};
  });
  return { receipt, event, gateway: { invoke } as any, invoke };
}
it("records physical Search count separately from its billable successful-search quantity", async () => {
  const f = fixture();
  expect(await appendFlightEnrichmentUsage(f.gateway, f.event, f.receipt)).toBe(
    "RECORDED",
  );
  expect(f.invoke.mock.calls[0][0]).toBe("external_integration_usage_append");
  expect(f.invoke.mock.calls[0][1].row).toMatchObject({
    call_count: 1,
    other_units: { successful_search_requests: 1 },
    cost_nanos: "750000",
  });
  expect(f.invoke.mock.calls[1][1]).toMatchObject({
    dispatch_state: "TERMINAL",
    execution_certainty: "TERMINAL",
  });
});
it("an empty Search still records one physical call and zero billable units", async () => {
  const f = fixture(true);
  await appendFlightEnrichmentUsage(f.gateway, f.event, f.receipt);
  expect(f.invoke.mock.calls[0][1].row).toMatchObject({
    call_count: 1,
    other_units: { successful_search_requests: 0 },
    cost_nanos: "0",
    cost_quality: "ACTUAL_REPORTED",
  });
});
it("repeated delivery uses the exact immutable ledger row, including timestamp and observation ID", async () => {
  const f = fixture();
  await appendFlightEnrichmentUsage(f.gateway, f.event, f.receipt);
  await appendFlightEnrichmentUsage(
    f.gateway,
    { ...f.event, late: true },
    { ...f.receipt, dispatchState: "TERMINAL" },
  );
  expect(
    f.invoke.mock.calls
      .filter(([kind]) => kind === "external_integration_usage_append")
      .map(([, command]) => command.row),
  ).toEqual([f.invoke.mock.calls[0][1].row, f.invoke.mock.calls[0][1].row]);
  expect(
    f.invoke.mock.calls.filter(([kind]) => kind === "external_integration_observe_call"),
  ).toHaveLength(1);
});
it("mismatched Trip/Actor/request never reaches the primary meter", async () => {
  for (const changes of [
    { tripId: id(9) },
    { actorId: id(9) },
    { requestDigest: "d".repeat(64) },
  ]) {
    const f = fixture();
    await expect(
      appendFlightEnrichmentUsage(f.gateway, { ...f.event, ...changes }, f.receipt),
    ).rejects.toThrow("METER_SCOPE");
    expect(f.invoke).not.toHaveBeenCalled();
  }
});
it("late actual measurement appends new cumulative coverage without resolving UNKNOWN or superseding NULL coverage", async () => {
  const f = fixture();
  const result = await appendFlightEnrichmentUsage(
    f.gateway,
    { ...f.event, late: true },
    {
      ...f.receipt,
      dispatchState: "UNKNOWN",
      observationId: id(6),
      observedAt: "2026-10-27T00:00:01Z",
    },
  );
  expect(result).toBe("RECOVERY_REQUIRED");
  expect(f.invoke).toHaveBeenCalledOnce();
  expect(f.invoke.mock.calls[0][1].row).toMatchObject({
    supersedes_observation_id: null,
    observation_version: 1,
    cost_nanos: "750000",
  });
});
it("out-of-budget usage is retained before marking UNKNOWN and refusing normal settlement", async () => {
  const f = fixture();
  await expect(
    appendFlightEnrichmentUsage(f.gateway, f.event, { ...f.receipt, maxCostNanos: "10" }),
  ).rejects.toThrow("USAGE_BOUND_RECORDED");
  expect(f.invoke.mock.calls[0][1].row).toMatchObject({ cost_nanos: "750000" });
  expect(f.invoke.mock.calls[1][1]).toMatchObject({
    dispatch_state: "UNKNOWN",
    safe_reason: "ENRICHMENT_USAGE_BOUND",
  });
});
it("without an admitted child, only a verified NOT_STARTED zero observation can be omitted", async () => {
  const f = fixture();
  await expect(appendFlightEnrichmentUsage(f.gateway, f.event, null)).rejects.toThrow(
    "RECEIPT_REQUIRED",
  );
  const noCall: ProviderObservation = {
    ...f.event.observation,
    execution: "NOT_STARTED",
    cost_nanos: "0",
    cost_quality: "ACTUAL",
    billing_status: "NOT_BILLED",
  };
  expect(
    await appendFlightEnrichmentUsage(
      f.gateway,
      { ...f.event, observation: noCall },
      null,
    ),
  ).toBe("NO_PROVIDER_CALL");
  expect(f.invoke).not.toHaveBeenCalled();
});
it("a completed call cannot be created from a merely RESERVED receipt", async () => {
  const f = fixture();
  await expect(
    appendFlightEnrichmentUsage(f.gateway, f.event, {
      ...f.receipt,
      dispatchState: "RESERVED",
    }),
  ).rejects.toThrow("WITHOUT_DISPATCH");
  expect(f.invoke).not.toHaveBeenCalled();
});
it("uncertain Search records no invented billable quantity and preserves UNKNOWN cost", async () => {
  const f = fixture();
  const observation = measureFlightEnrichmentResponse(
    "SEARCH",
    Buffer.from("malformed"),
    200,
    prices,
  ).observation;
  await appendFlightEnrichmentUsage(f.gateway, { ...f.event, observation }, f.receipt);
  expect(f.invoke.mock.calls[0][1].row).toMatchObject({
    call_count: 1,
    other_units: {},
    cost_nanos: null,
  });
  expect(f.invoke.mock.calls[0][1].row).toMatchObject({
    unit_quality: {},
    provider_request_id: null,
  });
});
it("does not borrow the Import-only provider request ID permission", async () => {
  const f = fixture();
  await appendFlightEnrichmentUsage(
    f.gateway,
    {
      ...f.event,
      observation: {
        ...f.event.observation,
        providerRequestId: "synthetic-provider-request",
      },
    },
    f.receipt,
  );
  expect(f.invoke.mock.calls[0][1].row).toMatchObject({
    provider_request_id: null,
    cost_nanos: "750000",
  });
});
