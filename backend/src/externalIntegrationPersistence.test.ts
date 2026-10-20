import { createHash, randomUUID } from "node:crypto";
import { describe, it, expect } from "vitest";
import {
  createClosedPersistenceGateway,
  commandDigest,
  persistenceDigest,
  verifyCallCorrelation,
  calculateScheduledCost,
  assertCustodyPayload,
  type VerifiedCallContextV1,
} from "./externalIntegrationPersistence";
const actor = randomUUID(),
  client = randomUUID(),
  now = "2026-10-06T01:00:00.000Z";
function fixture(overrides: Partial<VerifiedCallContextV1> = {}, missing = false) {
  const raw = {
    version: 1,
    environment: "TEST",
    request_id: randomUUID(),
    actor_id: actor,
  };
  const body = { ...raw, request_sha256: commandDigest(raw) };
  let calls = 0;
  const gateway = createClosedPersistenceGateway({
    gatewayIdentity: "otr_external_integration_admin_gateway",
    now: () => now,
    async verify(r) {
      return missing
        ? null
        : {
            version: 1,
            principal_kind: "OTR_ADMIN",
            verified_actor_id: actor,
            verified_account_id: actor,
            verified_client_identity: client,
            verified_external_subject: null,
            verified_environment: "TEST",
            auth_source: "TEST_ONLY_VERIFIER",
            auth_config_version: 1,
            auth_session_reference: null,
            verified_at: now,
            expires_at: "2026-10-07T00:00:00.000Z",
            revoked: false,
            request_id: r.requestId,
            request_sha256: r.requestSha256,
            command_kind: r.command,
            gateway_identity: "otr_external_integration_admin_gateway",
            ...overrides,
          };
    },
    async execute() {
      calls++;
      return { admitted: true };
    },
  });
  return { body, gateway, count: () => calls };
}
describe("CP14 injectable host boundary (not a production verifier)", () => {
  it("binds verified actor/request/environment and exact command", async () => {
    const f = fixture();
    expect(await f.gateway.invoke("external_integration_configure", f.body)).toEqual({
      admitted: true,
    });
    expect(f.count()).toBe(1);
  });
  it("without verified context fails closed", async () => {
    const f = fixture({}, true);
    await expect(
      f.gateway.invoke("external_integration_configure", f.body),
    ).rejects.toThrow("VERIFIER_UNAVAILABLE");
    expect(f.count()).toBe(0);
  });
  for (const [name, overrides] of [
    ["wrong gateway", { gateway_identity: "otr_external_integration_call_gateway" }],
    ["wrong actor", { verified_actor_id: randomUUID() }],
    ["wrong environment", { verified_environment: "DEV" }],
    ["expired", { expires_at: now }],
    ["revoked", { revoked: true }],
    ["wrong command", { command_kind: "inbound_ai_status" }],
    ["wrong request", { request_id: randomUUID() }],
  ] as const)
    it(name, async () => {
      const f = fixture(overrides as Partial<VerifiedCallContextV1>);
      await expect(
        f.gateway.invoke("external_integration_configure", f.body),
      ).rejects.toThrow();
      expect(f.count()).toBe(0);
    });
  for (const field of [
    "verified",
    "trusted",
    "verified_actor_id",
    "verified_client_identity",
    "gateway_identity",
    "context",
    "auth_result",
  ])
    it(`rejects caller auth ${field}`, async () => {
      const f = fixture();
      await expect(
        f.gateway.invoke("external_integration_configure", { ...f.body, [field]: true }),
      ).rejects.toThrow("CALLER_AUTH_FORBIDDEN");
    });
  it("wrong Account/client reject", async () => {
    const f = fixture();
    for (const field of ["account_id", "client_identity_id"]) {
      const raw = { ...f.body, [field]: randomUUID() };
      await expect(
        f.gateway.invoke("external_integration_configure", {
          ...raw,
          request_sha256: commandDigest(raw),
        }),
      ).rejects.toThrow("SCOPE_FORBIDDEN");
    }
  });
  it("changed request digest rejects before SQL", async () => {
    const f = fixture();
    await expect(
      f.gateway.invoke("external_integration_configure", {
        ...f.body,
        actor_id: randomUUID(),
      }),
    ).rejects.toThrow("REQUEST_DIGEST");
  });
  it("single-round rational cost and nullable independent units", () => {
    expect(
      calculateScheduledCost([
        {
          quantity: 1n,
          quantityPerRate: 3n,
          rate: "1",
          relationship: "DISJOINT",
          billable: true,
        },
        {
          quantity: 1n,
          quantityPerRate: 3n,
          rate: "1",
          relationship: "DISJOINT",
          billable: true,
        },
      ]),
    ).toBe("1");
    expect(
      calculateScheduledCost([
        {
          quantity: null,
          quantityPerRate: 1n,
          rate: "1",
          relationship: "DISJOINT",
          billable: true,
        },
      ]),
    ).toBeNull();
    expect(
      calculateScheduledCost([
        {
          quantity: 0n,
          quantityPerRate: 1n,
          rate: "1",
          relationship: "AMBIGUOUS",
          billable: true,
        },
      ]),
    ).toBeNull();
    expect(
      calculateScheduledCost([
        {
          quantity: 1n,
          quantityPerRate: 9007199254740991n,
          rate: "0.000000000000000001",
          relationship: "DISJOINT",
          billable: true,
        },
      ]),
    ).toBe("1");
  });
  it("exact correlation rejects rebinding call/request/Account", () => {
    const server = {
      account_id: actor,
      task_id: randomUUID(),
      attempt_id: randomUUID(),
      attempt_sequence: 1,
      call_id: randomUUID(),
      integration_id: "test-provider",
      request_id: randomUUID(),
      request_sha256: "a".repeat(64),
      configuration_sha256: "b".repeat(64),
      config_version: 1,
      provider_config_id: randomUUID(),
      input_sha256: "c".repeat(64),
      schema_sha256: "d".repeat(64),
      publication_fence: 1,
      fallback_chain_id: randomUUID(),
      shadow: false,
      shadow_of_call_id: null,
    };
    const local = {
      ...server,
      config_version: String(server.config_version),
      usage_correlation_id: server.call_id,
    };
    expect(verifyCallCorrelation(local, server)).toEqual(server);
    expect(() =>
      verifyCallCorrelation({ ...local, usage_correlation_id: randomUUID() }, server),
    ).toThrow("CALL_MISMATCH");
    expect(() =>
      verifyCallCorrelation({ ...local, request_id: randomUUID() }, server),
    ).toThrow("CORRELATION_MISMATCH");
  });
  it("material attachment requires independent trusted custody admission before SQL", async () => {
    const fields = {
      version: 1,
      environment: "TEST",
      request_id: randomUUID(),
      account_id: actor,
      client_identity_id: client,
      package_id: randomUUID(),
      reservation_id: randomUUID(),
      material_reference: randomUUID(),
      material_sha256: "a".repeat(64),
      material_admission_sha256: "b".repeat(64),
    };
    const body = { ...fields, request_sha256: commandDigest(fields) };
    let admitted = false,
      executed = 0;
    const gateway = createClosedPersistenceGateway({
      gatewayIdentity: "otr_external_integration_inbound_gateway",
      now: () => now,
      async verify(r) {
        return {
          version: 1,
          principal_kind: "EXTERNAL_CLIENT",
          verified_actor_id: actor,
          verified_client_identity: client,
          verified_external_subject: {
            issuer_namespace: "synthetic",
            subject_digest: "c".repeat(64),
          },
          verified_account_id: actor,
          verified_environment: "TEST",
          auth_source: "TEST_ONLY_VERIFIER",
          auth_config_version: 1,
          auth_session_reference: null,
          verified_at: now,
          expires_at: "2026-10-07T00:00:00.000Z",
          revoked: false,
          request_id: r.requestId,
          request_sha256: r.requestSha256,
          command_kind: r.command,
          gateway_identity: "otr_external_integration_inbound_gateway",
        };
      },
      async verifyCustody(context, material) {
        expect(context.verified_account_id).toBe(actor);
        expect(material.reference).toBe(fields.material_reference);
        expect(material.sha256).toBe(fields.material_sha256);
        return admitted;
      },
      async execute() {
        executed++;
        return {};
      },
    });
    await expect(gateway.invoke("inbound_ai_attach_material", body)).rejects.toThrow(
      "CUSTODY_UNAVAILABLE",
    );
    expect(executed).toBe(0);
    admitted = true;
    await gateway.invoke("inbound_ai_attach_material", body);
    expect(executed).toBe(1);
  });
  it("custody boundary enforces exact bytes/hash/size without a material store", () => {
    const bytes = new TextEncoder().encode("synthetic material"),
      pin = {
        accountId: actor,
        reservationId: randomUUID(),
        byteCount: bytes.length,
        sha256: createHash("sha256").update(bytes).digest("hex"),
      };
    expect(assertCustodyPayload(pin, bytes)).toEqual(pin);
    expect(() => assertCustodyPayload({ ...pin, byteCount: 4194305 }, bytes)).toThrow();
    expect(() => assertCustodyPayload({ ...pin, sha256: "f".repeat(64) }, bytes)).toThrow(
      "CUSTODY_INTEGRITY",
    );
    expect(() => assertCustodyPayload(pin, new Uint8Array())).toThrow(
      "CUSTODY_INTEGRITY",
    );
  });
  it("canonical digest key order neutral", () =>
    expect(persistenceDigest({ a: 1, b: 2 })).toBe(persistenceDigest({ b: 2, a: 1 })));
});
