import { createHash, randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  readOutboundSnapshots,
  routeOutbound,
  continuationRouteReason,
} from "./outboundRouting";
import type { RouterRequest } from "./persistence";
const h = "a".repeat(64);
const hash = async (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
function snapshot() {
  return readOutboundSnapshots([
    {
      environment: "TEST",
      environment_version: 1,
      environment_killed: false,
      runtime_enabled: false,
      integration_id: "test",
      integration_version: 7,
      integration_sha256: h,
      enabled: true,
      killed: false,
      provider_config_id: randomUUID(),
      provider_id: "neutral",
      model_id: "model",
      model_version: "v7",
      adapter_version: "1",
      config_version: 7,
      configuration_sha256: h,
      provider_class: "DETERMINISTIC",
      capabilities: ["EXTRACT"],
      modalities: ["TEXT"],
      schemas: [{ id: "flight", version: 1, dialect: "otr" }],
      schema_output: true,
      privacy: "LOCAL_ONLY",
      network_required: false,
      region: "DEVICE",
      routing_class: "INTERPRET",
      priority: 0,
      eligibility: "ELIGIBLE",
      input_byte_limit: 1048576,
      input_count_limit: 64,
      output_byte_limit: 1048576,
      max_risk: 1,
      max_complexity: 5,
      replay_support: "UNKNOWN",
      quota_admitted: true,
      rate_admitted: true,
      latency_ms: 100,
      expected_cost_nanos: "10",
      expected_currency: "USD",
      price: { id: randomUUID(), version: "schedule-7", sha256: h, currency: "USD" },
      health: "UNKNOWN",
      health_reference: null,
      health_config_version: null,
      quality_reference: null,
      quality_policy_reference: null,
      quality_policy_sha256: null,
    },
  ])[0];
}
function request(): RouterRequest & {
  environment: "TEST";
  complexity: number;
  shadow: boolean;
} {
  // Router reads only immutable policy/schema/task pins; repository owns task validation.
  return {
    task: {
      policy_snapshot: { region: "DEVICE", route: "INTERPRET" },
      policy_sha256: h,
      schema_dialect: "otr",
    } as RouterRequest["task"],
    capabilities: ["EXTRACT"],
    modalities: ["TEXT"],
    schema: { id: "flight", version: 1, sha256: h },
    privacy: "LOCAL_ONLY",
    online: true,
    networkRequired: false,
    latencyBudgetMs: null,
    risk: "NORMAL",
    budget: { currency: null, nanos: null },
    shadowEligible: false,
    environment: "TEST",
    complexity: 0,
    shadow: false,
  };
}
describe("A2 provider-neutral bounded immutable decision-only routing", () => {
  for (const [changes, status, reason] of [
    [{ killed: true }, "WAIT", "PROVIDER_UNAVAILABLE"],
    [{ enabled: false }, "WAIT", "PROVIDER_UNAVAILABLE"],
    [{ environment_killed: true }, "WAIT", "PROVIDER_UNAVAILABLE"],
    [{ environment: "DEV" }, "WAIT", "PROVIDER_UNAVAILABLE"],
    [{ eligibility: "DISABLED" }, "UNAVAILABLE", "PROVIDER_UNAVAILABLE"],
    [{ eligibility: "SHADOW_ONLY" }, "UNAVAILABLE", "PROVIDER_UNAVAILABLE"],
    [{ capabilities: [] }, "UNAVAILABLE", "CAPABILITY_UNAVAILABLE"],
    [{ modalities: ["IMAGE"] }, "UNAVAILABLE", "CAPABILITY_UNAVAILABLE"],
    [{ schemas: [] }, "UNAVAILABLE", "CAPABILITY_UNAVAILABLE"],
    [{ schema_output: false }, "UNAVAILABLE", "CAPABILITY_UNAVAILABLE"],
    [{ region: "OTHER" }, "UNAVAILABLE", "PRIVACY_POLICY"],
    [{ provider_class: "COMMERCIAL_REMOTE" }, "UNAVAILABLE", "PRIVACY_POLICY"],
    [{ quota_admitted: false }, "WAIT", "QUOTA_EXHAUSTED"],
    [{ rate_admitted: false }, "WAIT", "QUOTA_EXHAUSTED"],
    [{ max_complexity: 0 }, "UNAVAILABLE", "CAPABILITY_UNAVAILABLE"],
    [
      { health: "UNAVAILABLE", health_reference: randomUUID(), health_config_version: 7 },
      "WAIT",
      "PROVIDER_UNAVAILABLE",
    ],
  ] as const)
    it(`excludes ${JSON.stringify(changes)}`, async () => {
      const r = request();
      if ("max_complexity" in changes) r.complexity = 1;
      expect(
        await routeOutbound(
          r,
          readOutboundSnapshots([{ ...snapshot(), ...changes }]),
          hash,
        ),
      ).toEqual({ status, reason });
    });
  it("remote/offline waits; OTR_ONLY excludes commercial while self-hosted stays neutral", async () => {
    const r = { ...request(), privacy: "REMOTE_ALLOWED" as const, online: false };
    const s = {
      ...snapshot(),
      provider_class: "COMMERCIAL_REMOTE",
      privacy: "REMOTE_ALLOWED",
      network_required: true,
    };
    expect(await routeOutbound(r, readOutboundSnapshots([s]), hash)).toEqual({
      status: "WAIT",
      reason: "NETWORK_REQUIRED",
    });
    expect(
      await routeOutbound(
        { ...r, privacy: "OTR_ONLY", online: true },
        readOutboundSnapshots([s]),
        hash,
      ),
    ).toEqual({ status: "UNAVAILABLE", reason: "PRIVACY_POLICY" });
    expect(
      (
        await routeOutbound(
          { ...r, privacy: "OTR_ONLY", online: true },
          readOutboundSnapshots([
            { ...s, provider_class: "OTR_SELF_HOSTED", privacy: "OTR_ONLY" },
          ]),
          hash,
        )
      ).status,
    ).toBe("ELIGIBLE");
  });
  for (const changes of [
    { expected_cost_nanos: "11" },
    { expected_currency: "NZD" },
    { price: null },
    { expected_cost_nanos: null, expected_currency: null },
  ])
    it(`budget rejects unknown/over-budget/currency mismatch ${JSON.stringify(changes)}`, async () => {
      expect(
        await routeOutbound(
          { ...request(), budget: { currency: "USD", nanos: "10" } },
          readOutboundSnapshots([{ ...snapshot(), ...changes }]),
          hash,
        ),
      ).toEqual({ status: "UNAVAILABLE", reason: "BUDGET_POLICY" });
    });
  it("cheap price never overrides safety, schema, privacy or kill", async () => {
    const safe = snapshot(),
      cheap = {
        ...safe,
        provider_config_id: randomUUID(),
        expected_cost_nanos: "0",
        killed: true,
        capabilities: [],
      };
    const routed = await routeOutbound(
      request(),
      readOutboundSnapshots([cheap, safe]),
      hash,
    );
    expect(routed.status).toBe("ELIGIBLE");
    if (routed.status === "ELIGIBLE")
      expect(routed.pins.snapshot.provider_config_id).toBe(safe.provider_config_id);
  });
  it("ties and decision digests are stable across input order; V7 pins survive mutable V8 source", async () => {
    const a = snapshot(),
      b = { ...a, provider_config_id: randomUUID() };
    const first = await routeOutbound(request(), readOutboundSnapshots([a, b]), hash),
      second = await routeOutbound(request(), readOutboundSnapshots([b, a]), hash);
    expect(first).toEqual(second);
    const source = { ...a },
      rows = readOutboundSnapshots([source]);
    source.model_version = "v8";
    expect(rows[0].model_version).toBe("v7");
    expect(Object.isFrozen(rows[0].schemas)).toBe(true);
  });
  it("shadow policy permits isolated shadow-only candidate and can suppress it", async () => {
    const rows = readOutboundSnapshots([{ ...snapshot(), eligibility: "SHADOW_ONLY" }]);
    expect(
      (
        await routeOutbound(
          { ...request(), shadow: true, shadowEligible: true },
          rows,
          hash,
        )
      ).status,
    ).toBe("ELIGIBLE");
    expect((await routeOutbound({ ...request(), shadow: true }, rows, hash)).status).toBe(
      "UNAVAILABLE",
    );
  });
  it("new DISABLED config prevents selection of an older ELIGIBLE version", async () => {
    const old = snapshot(),
      current = {
        ...old,
        provider_config_id: randomUUID(),
        config_version: 8,
        eligibility: "DISABLED",
      };
    expect(
      await routeOutbound(request(), readOutboundSnapshots([old, current]), hash),
    ).toEqual({ status: "UNAVAILABLE", reason: "PROVIDER_UNAVAILABLE" });
  });
  it("old-config late health never rewrites current admission", async () => {
    const rows = readOutboundSnapshots([
      {
        ...snapshot(),
        health: "UNAVAILABLE",
        health_reference: randomUUID(),
        health_config_version: 6,
      },
    ]);
    expect((await routeOutbound(request(), rows, hash)).status).toBe("ELIGIBLE");
  });
  it("risk and latency qualification precede price", async () => {
    expect(
      (
        await routeOutbound(
          { ...request(), risk: "HIGH" },
          readOutboundSnapshots([{ ...snapshot(), max_risk: 0 }]),
          hash,
        )
      ).status,
    ).toBe("UNAVAILABLE");
    expect(
      (await routeOutbound({ ...request(), latencyBudgetMs: 99 }, [snapshot()], hash))
        .status,
    ).toBe("UNAVAILABLE");
  });
  it("snapshot rejects secrets, live gate, malformed values, duplicates and excess rows", () => {
    const s = snapshot();
    for (const bad of [
      { ...s, credentials: "private" },
      { ...s, runtime_enabled: true },
      { ...s, priority: -1 },
    ])
      expect(() => readOutboundSnapshots([bad])).toThrow();
    expect(() => readOutboundSnapshots([s, s])).toThrow("DUPLICATE");
    expect(() =>
      readOutboundSnapshots(
        Array.from({ length: 65 }, () => ({ ...s, provider_config_id: randomUUID() })),
      ),
    ).toThrow();
  });
  it("finite reasons map to existing C2 wait/attention contracts", () => {
    expect(
      continuationRouteReason({ status: "WAIT", reason: "NETWORK_REQUIRED" }),
    ).toEqual({ status: "WAIT", reason: "WAITING_FOR_NETWORK" });
    expect(
      continuationRouteReason({ status: "WAIT", reason: "QUOTA_EXHAUSTED" }),
    ).toEqual({ status: "WAIT", reason: "WAITING_FOR_REMOTE_INTELLIGENCE" });
    expect(
      continuationRouteReason({ status: "UNAVAILABLE", reason: "BUDGET_POLICY" }),
    ).toEqual({ status: "UNAVAILABLE", reason: "UNSUPPORTED" });
  });
});
