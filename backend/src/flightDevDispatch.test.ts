import { randomUUID } from "node:crypto";
import { describe, it, expect } from "vitest";
import { flightUsageCommand, flightOperationalFacts } from "./flightUsage";
import { persistenceDigest, commandDigest } from "./externalIntegrationPersistence";
import { captureAccountRequestContext } from "../../src/data/auth/accountRequestContext";
import { flightExecutorFixture as fixture } from "./__fixtures__/flightExecutor";
const h = "a".repeat(64),
  at = "2026-10-07T00:00:00Z";
describe("CP15B dispatch responsibility on existing C2 seam", () => {
  it("local COMMIT/release → protected ACK → one transport → private retain → meter", async () => {
    const f = await fixture();
    await f.factory.executor(f.context).prepareUsage(f.a);
    const report = await f.factory.executor(f.context).execute(f.a);
    expect(report).toMatchObject({
      execution_observation: "TERMINAL",
      execution_outcome: "SUCCEEDED",
      metering_disposition: "COMPLETE",
    });
    expect(f.send).toHaveBeenCalledTimes(1);
    expect(f.order).toEqual([
      "reserve",
      "local-COMMIT-release",
      "mark",
      "transport",
      "retain",
      "meter",
    ]);
    const recovered = await f.factory.recover(f.context, f.a.attempt_id);
    expect(recovered.report.response_sha256).toBe(report.response_sha256);
    expect(recovered.descriptor).toEqual(f.a.descriptor_snapshot);
  });
  it.each([
    "lost-ack",
    "account-aba",
    "secret-revoke",
    "kill",
    "grant",
    "budget",
    "config",
    "scope",
    "trip",
  ])(
    "%s after local handoff retains UNKNOWN with zero fetch and no replay",
    async (mode) => {
      const f = await fixture(mode);
      const report = await f.factory.executor(f.context).execute(f.a);
      expect(report.execution_observation).toBe("UNKNOWN");
      expect(f.send).not.toHaveBeenCalled();
      await expect(f.factory.executor(f.context).execute(f.a)).rejects.toThrow();
      expect(f.send).not.toHaveBeenCalled();
      if (mode === "account-aba")
        await expect(f.factory.recover(f.context, f.a.attempt_id)).rejects.toThrow();
      const fresh = await captureAccountRequestContext("", async () => f.a.account_id);
      const stored = await f.factory.recover(fresh, f.a.attempt_id);
      expect(stored.report.execution_observation).toBe("UNKNOWN");
    },
  );
  it.each([
    "prompt_sha256",
    "envelope_sha256",
    "minimizer_sha256",
    "privacy_sha256",
    "policy_sha256",
    "adapter_version",
    "output_schema_sha256",
    "provider_config_sha256",
    "price_sha256",
    "envelope_version",
    "minimizer_version",
    "privacy_profile",
  ] as const)(
    "F3 changed command executing pin %s is denied before any transport",
    async (key) => {
      const f = await fixture();
      f.command.execution_pins[key] = "wrong";
      f.command.execution_pins_sha256 = persistenceDigest(f.command.execution_pins);
      f.command.request_sha256 = commandDigest(f.command);
      await expect(f.factory.executor(f.context).execute(f.a)).rejects.toThrow(
        "POLICY_BLOCKED",
      );
      expect(f.send).not.toHaveBeenCalled();
    },
  );
  it("concurrent local/remote CAS loser executes zero, winner once", async () => {
    const f = await fixture();
    const ex = f.factory.executor(f.context);
    const reports = await Promise.allSettled([ex.execute(f.a), ex.execute(f.a)]);
    expect(reports.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(f.send).toHaveBeenCalledTimes(1);
  });
  it("missing secret denies before reserve/hold", async () => {
    const f = await fixture("missing-secret");
    await expect(f.factory.executor(f.context).prepareUsage(f.a)).rejects.toThrow(
      "AUTH_FAILED",
    );
    expect(f.order).toEqual([]);
    expect(f.send).not.toHaveBeenCalled();
  });
  it("meter loss preserves recoverable result without redispatch", async () => {
    const f = await fixture("meter-loss");
    const report = await f.factory.executor(f.context).execute(f.a);
    expect(report.metering_disposition).toBe("COMPLETION_PENDING");
    expect(report.execution_outcome).toBe("SUCCEEDED");
    expect(
      (await f.factory.recover(f.context, f.a.attempt_id)).report.response_sha256,
    ).toBe(report.response_sha256);
    await expect(f.factory.executor(f.context).execute(f.a)).rejects.toThrow();
    expect(f.send).toHaveBeenCalledTimes(1);
  });
  it("semantic invalid payload is discarded; measured usage survives", async () => {
    const f = await fixture("malformed");
    const report = await f.factory.executor(f.context).execute(f.a);
    expect(report.execution_outcome).toBe("FAILED");
    expect(report.reported_usage_summary?.input_tokens).toBe(100);
    const retained = await f.factory.recover(f.context, f.a.attempt_id);
    expect(JSON.stringify(retained)).not.toContain("PRIVATE_DO_NOT_RETAIN");
  });
  it("changed retained envelope cannot dispatch", async () => {
    const f = await fixture();
    f.envelope.spans[0].raw = "invented";
    await expect(f.factory.executor(f.context).execute(f.a)).rejects.toThrow(
      "POLICY_BLOCKED",
    );
    expect(f.send).not.toHaveBeenCalled();
  });
  it("immutable rational nanos: cache slices disjoint, reasoning included, unknown never zero", async () => {
    const f = await fixture();
    const report = await f.factory.executor(f.context).execute(f.a);
    const result = {
      status: "SUCCEEDED" as const,
      output: {},
      provider_request_id: "safe-id",
      latency_ms: 5,
      usage: {
        input_tokens: 20,
        output_tokens: 10,
        total_tokens: 30,
        cached_input_tokens: 5,
        reasoning_tokens: 2,
        provider_extension: { prompt_cache_miss_tokens: 15 },
        usage_quality: "ACTUAL_REPORTED" as const,
      },
    };
    const schedule = {
      id: f.descriptor.remote.price_schedule_id,
      sha256: h,
      currency: "USD",
      units: [
        {
          measurement_unit: "input_tokens" as const,
          unit_quantity: 1000,
          price_per_quantity: "1",
          relationship: "DISJOINT" as const,
          billable: true,
        },
        {
          measurement_unit: "cached_input_tokens" as const,
          unit_quantity: 1000,
          price_per_quantity: "0.5",
          relationship: "DISJOINT" as const,
          billable: true,
        },
        {
          measurement_unit: "output_tokens" as const,
          unit_quantity: 1000,
          price_per_quantity: "2",
          relationship: "DISJOINT" as const,
          billable: true,
        },
        {
          measurement_unit: "reasoning_tokens" as const,
          unit_quantity: 1000,
          price_per_quantity: "2",
          relationship: "INCLUDED" as const,
          billable: false,
        },
      ],
    };
    const c = flightUsageCommand(f.a, result, report, schedule, {
      id: randomUUID(),
      request_id: randomUUID(),
      at,
    });
    expect(c.row.cost_nanos).toBe("37500000");
    expect(c.row.cost_quality).toBe("ESTIMATED");
    expect(c.row.usage_quality).toBe("ACTUAL_REPORTED");
    expect(
      flightUsageCommand(
        f.a,
        result,
        report,
        { ...schedule, billing_applicability: "UNRESOLVED" },
        { id: randomUUID(), request_id: randomUUID(), at },
      ).row,
    ).toMatchObject({
      cost_nanos: null,
      cost_quality: "UNKNOWN",
      usage_quality: "ACTUAL_REPORTED",
    });
    expect(c.row.input_tokens).toBe(20);
    expect(c.row.output_tokens).toBe(10);
    expect(c.row.provider_request_id).toBe("safe-id");
    expect(c.row.currency).toBe("USD");
    const replay = { id: randomUUID(), request_id: randomUUID(), at };
    expect(flightUsageCommand(f.a, result, report, schedule, replay)).toEqual(
      flightUsageCommand(f.a, result, report, schedule, replay),
    );
    expect(
      flightUsageCommand(
        f.a,
        { ...result, status: "FAILED", error: "SEMANTIC_INVALID" },
        report,
        schedule,
        replay,
      ).row,
    ).toMatchObject({
      cost_nanos: "37500000",
      cost_quality: "ESTIMATED",
      usage_quality: "ACTUAL_REPORTED",
      status: "FAILED",
    });
    expect(() =>
      flightUsageCommand(f.a, result, report, { ...schedule, id: randomUUID() }, replay),
    ).toThrow("POLICY_BLOCKED");

    expect(
      flightUsageCommand(
        f.a,
        {
          ...result,
          usage: { ...result.usage, usage_quality: "UNKNOWN", input_tokens: null },
        },
        report,
        schedule,
        { id: randomUUID(), request_id: randomUUID(), at },
      ).row,
    ).toMatchObject({ cost_nanos: null, cost_quality: "UNKNOWN", input_tokens: null });
    const facts = flightOperationalFacts(
      f.descriptor,
      result,
      { fields: 4, supported: 2, missing: 1, contradictory: 1 },
      { changes: 2, decision: "DEFER", cp13a: "PENDING" },
    );
    expect(JSON.stringify(facts)).not.toContain("output");
    expect(JSON.stringify(facts)).not.toContain(f.a.account_id);
    expect(persistenceDigest(facts)).toMatch(/^[a-f0-9]{64}$/);
  });
});
