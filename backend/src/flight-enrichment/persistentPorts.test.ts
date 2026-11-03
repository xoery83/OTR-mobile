import { createHash, randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import {
  createPersistentFlightEnrichmentPorts,
  flightEnrichmentInputVerifier,
} from "./persistentPorts";
import { createConfiguredFlightEnrichmentService } from "./runtime";
import { createFlightHttpsSend } from "../flightHttpsTransport";
import { registeredFlightEnrichmentProfile as profile } from "./registeredProfile";
import type { TrustedContext } from "./ports";
import type { createClosedPersistenceGateway } from "../externalIntegrationPersistence";

const context: TrustedContext = {
  accountId: randomUUID(),
  actorId: "",
  tripId: randomUUID(),
  authFence: "synthetic",
  assertCurrent: async () => {},
};
const ctx = { ...context, actorId: context.accountId };
const now = () => "2026-10-27T00:00:00.000Z";
const hash = (v: Uint8Array) => createHash("sha256").update(v).digest("hex");
function setup() {
  const logicalId = randomUUID();
  const scopeId = randomUUID();
  const materials = new Map<
    string,
    { sha256: string; byteCount: number; bytes: Uint8Array }
  >();
  const raw = new Map<string, any>();
  const children = new Map<string, any>();
  const rows: any[] = [];
  let response: unknown = null;
  let claimed = false;
  let revoked = false;
  let credentialRevoked = false;
  let revokeAtMark = false;
  let loseMarkAck = false;
  let failResponseRetention = false;
  const invoke = vi.fn(async (kind: string, c: any) => {
    if (kind === "flight_enrichment_request_claim") {
      if (response) return { state: "TERMINAL", response };
      if (claimed) return { state: "PENDING" };
      claimed = true;
      return { state: "ACQUIRED" };
    }
    if (kind === "flight_enrichment_request_finish") {
      response = c.response;
      return c.response ? { state: "TERMINAL", response } : { state: "UNKNOWN" };
    }
    if (kind === "flight_enrichment_runtime_scope") {
      if (revoked) throw Error("ACCOUNT_CLOSED");
      return {
        scope: { scope_id: scopeId, revision: 1, scope_sha256: "a".repeat(64) },
        grant_revision: 1,
        logical_request_id: c.idempotency_key ? logicalId : null,
        search_nanos_per_request: "1000",
        price_units: ["input_tokens", "cached_input_tokens", "output_tokens"].map(
          (unit) => ({
            unit,
            quantity: 1000,
            price: "0.000001",
            definition: { relationship: "DISJOINT", billable: true },
          }),
        ),
      };
    }
    if (kind === "flight_enrichment_reserve_step") {
      expect(materials.get(c.call_id)?.sha256).toBe(c.input_sha256);
      if (children.has(c.kind)) throw Error("DUPLICATE");
      const call = {
        call_id: c.call_id,
        account_id: ctx.accountId,
        user_id: ctx.actorId,
        trip_id: ctx.tripId,
        task_id: logicalId,
        input_sha256: c.input_sha256,
        price_schedule_id: randomUUID(),
        row_revision: 1,
        publication_fence: 1,
        dispatch_state: "RESERVED",
      };
      const hold = {
        input_ceiling: c.kind === "SEARCH" ? 0 : 24000,
        output_ceiling: c.kind === "SEARCH" ? 0 : 1200,
        worst_cost_nanos: "10000000",
      };
      children.set(c.kind, { call, hold });
      return { call, hold_nanos: hold.worst_cost_nanos };
    }
    if (kind === "flight_enrichment_mark_dispatch") {
      const child = [...children.values()].find((v) => v.call.call_id === c.call_id)!;
      if (child.call.dispatch_state !== "RESERVED") throw Error("FENCE");
      child.call = { ...child.call, row_revision: 2, dispatch_state: "MAY_HAVE_STARTED" };
      if (revokeAtMark) credentialRevoked = true;
      if (loseMarkAck) throw Error("LOST_ACK");
      return child.call;
    }
    if (kind === "flight_enrichment_step_receipt") return children.get(c.kind) ?? null;
    if (kind === "external_integration_usage_append") {
      rows.push(c.row);
      return c.row;
    }
    if (kind === "external_integration_observe_call") {
      const child = [...children.values()].find((v) => v.call.call_id === c.call_id)!;
      child.call = {
        ...child.call,
        row_revision: child.call.row_revision + 1,
        dispatch_state: c.dispatch_state,
      };
      return child.call;
    }
    throw Error(`Unexpected ${kind}`);
  });
  const stores = {
    custody: {
      async put(p: any) {
        if (hash(p.bytes) !== p.sha256) throw Error("HASH");
        materials.set(p.reservationId, p);
        return { reference: p.reservationId };
      },
      async read(p: any) {
        const stored = materials.get(p.reference)!;
        if (stored.sha256 !== p.sha256 || stored.byteCount !== p.byteCount)
          throw Error("CUSTODY");
        return stored.bytes;
      },
      async verify(p: any) {
        return materials.get(p.reference)?.sha256 === p.sha256;
      },
    },
    async readRaw(_account: string, call: string) {
      const value = raw.get(call);
      if (!value) throw Object.assign(Error("Missing"), { code: "ENOENT" });
      return structuredClone(value);
    },
    async retainRaw(_account: string, call: string, pin: any, binding: unknown) {
      if (
        failResponseRetention &&
        children.has("SEARCH") &&
        children.get("SEARCH").call.call_id === call
      )
        throw Error("RAW_DISK_UNAVAILABLE");
      if (raw.has(call)) throw Error("IMMUTABLE");
      raw.set(call, { version: 1, pin, binding });
    },
  };
  const gateway = () =>
    ({ invoke }) as unknown as ReturnType<typeof createClosedPersistenceGateway>;
  const credential = vi.fn(async () => ({
    reference: profile.credential_reference,
    value: "SYNTHETIC_NOT_A_REAL_KEY",
    async assertCurrent() {
      if (credentialRevoked) throw Error("CREDENTIAL_REVOKED");
    },
  }));
  const ports = createPersistentFlightEnrichmentPorts({
    gateway,
    stores,
    resolveCredential: credential,
    now,
  });
  const http = vi.fn<typeof fetch>(async () => new Response('{"results":[]}'));
  const service = createConfiguredFlightEnrichmentService({
    gateway,
    ...ports,
    send: createFlightHttpsSend(http, "FLIGHT_ENRICHMENT_V1"),
  });
  const request = {
    version: "otr-flight-enrichment/1",
    requestId: "r1",
    idempotencyKey: "r1",
    mode: "CREATE",
    draft: { id: "d1", revision: 1 },
    flightNumber: "NZ101",
    departureLocalDate: "2026-10-27",
    knownFields: {},
  };
  return {
    service,
    ports,
    http,
    invoke,
    rows,
    raw,
    credential,
    request,
    revoke() {
      revoked = true;
    },
    revokeCredentialAtMark() {
      revokeAtMark = true;
    },
    loseMarkAcknowledgement() {
      loseMarkAck = true;
    },
    failRawResponse() {
      failResponseRetention = true;
    },
  };
}

it("retains private input and raw result, writes the existing meter, then replays without a second charge", async () => {
  const f = setup();
  const first = await f.service.enrich(f.request, ctx);
  expect(first.status).toBe("NOT_FOUND");
  expect(first.cache.state).toBe("MISS");
  expect(f.rows).toHaveLength(1);
  expect(f.rows[0]).toMatchObject({
    call_count: 1,
    other_units: { successful_search_requests: 0 },
    cost_nanos: "0",
    provider_request_id: null,
  });
  expect(f.raw.size).toBe(2);
  expect(await f.service.enrich(f.request, ctx)).toEqual(first);
  expect(f.http).toHaveBeenCalledOnce();
  expect(f.credential).toHaveBeenCalledOnce();
});
it("records a nonempty Search and one Extraction separately without public cache or business writes", async () => {
  const f = setup();
  f.http.mockResolvedValueOnce(
    new Response(
      JSON.stringify({
        results: [
          {
            title: "Synthetic NZ101",
            url: "https://example.com",
            content: "Synthetic flight evidence",
          },
        ],
      }),
    ),
  );
  f.http.mockResolvedValueOnce(
    new Response(
      JSON.stringify({
        model: "deepseek-flash",
        usage: {
          prompt_tokens: 100,
          completion_tokens: 20,
          total_tokens: 120,
          prompt_cache_hit_tokens: 10,
        },
        choices: [
          {
            finish_reason: "stop",
            message: {
              content: JSON.stringify({
                status: "NOT_FOUND",
                fields: {},
                candidates: [],
              }),
            },
          },
        ],
      }),
    ),
  );
  await f.service.enrich(f.request, ctx);
  expect(f.http).toHaveBeenCalledTimes(2);
  expect(f.rows.map((v) => v.cost_nanos)).toEqual(["1000", "120"]);
  expect(f.rows[1]).toMatchObject({
    input_tokens: 100,
    cached_input_tokens: 10,
    output_tokens: 20,
    call_count: 1,
  });
  expect(f.invoke.mock.calls.some(([kind]) => kind.includes("core"))).toBe(false);
});
it("closes availability and provider dispatch when the protected grant is revoked", async () => {
  const f = setup();
  f.revoke();
  expect(await f.ports.available(ctx)).toBe(false);
  const result = await f.service.enrich(f.request, ctx);
  expect(result.status).not.toBe("SUCCESS");
  expect(f.http).not.toHaveBeenCalled();
  expect(f.credential).not.toHaveBeenCalled();
});
it("rechecks independent credential custody after durable mark and never sends a revoked secret", async () => {
  const f = setup();
  f.revokeCredentialAtMark();
  const response = await f.service.enrich(f.request, ctx);
  expect(response.status).not.toBe("SUCCESS");
  expect(f.http).not.toHaveBeenCalled();
  expect(f.rows[0]).toMatchObject({ cost_nanos: null, status: "UNKNOWN" });
});

it("verifies real private input pins only within the gateway Account binding", async () => {
  const custody = { verify: vi.fn(async () => true) };
  const verify = flightEnrichmentInputVerifier(custody);
  const context = { verified_account_id: ctx.accountId } as Parameters<typeof verify>[0];
  const callId = randomUUID();
  const material = {
    accountId: ctx.accountId,
    tripId: ctx.tripId!,
    callId,
    reference: callId,
    sha256: "a".repeat(64),
    byteCount: 12,
    stepId: "b".repeat(64),
    kind: "SEARCH" as const,
  };
  expect(await verify(context, material)).toBe(true);
  expect(await verify(context, { ...material, accountId: randomUUID() })).toBe(false);
  expect(await verify(context, { ...material, reference: randomUUID() })).toBe(false);
  expect(custody.verify).toHaveBeenCalledOnce();
});

it("does not send or reacquire after a durable mark acknowledgement is lost", async () => {
  const f = setup();
  f.loseMarkAcknowledgement();
  const first = await f.service.enrich(f.request, ctx);
  expect(await f.service.enrich(f.request, ctx)).toEqual(first);
  expect(f.http).not.toHaveBeenCalled();
  expect(
    f.invoke.mock.calls.filter(([kind]) => kind === "flight_enrichment_mark_dispatch"),
  ).toHaveLength(1);
  expect(f.rows[0]).toMatchObject({ cost_nanos: null, status: "UNKNOWN" });
});

it("retains measured Search cost even when retaining the raw response fails", async () => {
  const f = setup();
  f.failRawResponse();
  f.http.mockResolvedValueOnce(
    new Response('{"results":[{"title":"Synthetic NZ101","url":"https://example.com"}]}'),
  );
  const result = await f.service.enrich(f.request, ctx);
  expect(result.status).not.toBe("SUCCESS");
  expect(f.rows[0]).toMatchObject({ call_count: 1, cost_nanos: "1000" });
  expect(f.http).toHaveBeenCalledOnce();
});

it("availability remains closed and diagnoses gateway versus scope-parse failure without raw values", async () => {
  const log = vi.spyOn(console, "info").mockImplementation(() => {});
  const secret = "synthetic-private-diagnostic-marker";
  try {
    const f = setup();
    f.invoke.mockRejectedValueOnce(
      Object.assign(Error(secret), { code: "42702", detail: secret, stack: secret }),
    );
    expect(await f.ports.available(ctx)).toBe(false);
    expect(log).toHaveBeenCalledWith(
      "FLIGHT_ENRICHMENT_DIAGNOSTIC:SCOPE_GATEWAY:STATE_42702",
    );
    f.invoke.mockResolvedValueOnce({ scope: { private: secret } });
    expect(await f.ports.available(ctx)).toBe(false);
    expect(log).toHaveBeenCalledWith(
      "FLIGHT_ENRICHMENT_DIAGNOSTIC:SCOPE_PARSE:SCHEMA_REJECTED",
    );
    expect(
      await f.ports.available({
        ...ctx,
        assertCurrent: async () => {
          throw Error(secret);
        },
      }),
    ).toBe(false);
    expect(log).toHaveBeenCalledWith(
      "FLIGHT_ENRICHMENT_DIAGNOSTIC:SCOPE_AUTH:UNCLASSIFIED",
    );
    expect(JSON.stringify(log.mock.calls)).not.toContain(secret);
    expect(f.http).not.toHaveBeenCalled();
  } finally {
    log.mockRestore();
  }
});
