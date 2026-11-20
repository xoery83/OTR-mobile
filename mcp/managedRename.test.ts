import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { canonicalCoreJson } from "../src/domain/trip/tripCoreV2Json";
import { betaCapabilities, betaRequest, parseBetaCall } from "./beta";
import { createManagedDevConfiguredHost } from "./managedDevBeta";
import type { BackendDependencies } from "../backend/src/app";
import { managedDevBetaResource as resource } from "./betaOAuth";
import type { BetaEvidence } from "./betaEvidence";
import type { McpConsentPolicyPin } from "../src/data/auth/mcpOAuthConsentContract";
import { createManagedRenameGate } from "./managedRename";

const principal = {
  accountId: "11111111-1111-4111-8111-111111111111",
  clientId: "22222222-2222-4222-8222-222222222222",
};
const tripId = "33333333-3333-4333-8333-333333333333";
const operationId = "44444444-4444-4444-8444-444444444444";
const before = {
  name: "Fixture",
  destination: null,
  destinations: [],
  startDate: null,
  endDate: null,
};
const request = {
  formatVersion: 3,
  tripId,
  operationId,
  expectedMetadataRevision: 2,
  before,
  after: { ...before, name: "Fixture renamed" },
};
const call = {
  capabilityId: "otr.trip.update",
  toolName: "update_trip",
  pathParams: { tripId },
  query: {},
  request,
};
function fixture() {
  const now = Date.now();
  const pin = { ...principal, expiresAt: now + 10000, request };
  const digest = createHash("sha256").update(canonicalCoreJson(pin)).digest("hex");
  const consent: McpConsentPolicyPin = {
    contractVersion: 1,
    identityScopes: ["openid"],
    policyHash: "a".repeat(64),
    policy: {
      id: "qa",
      version: `v1:managed-rename:${digest}`,
      resource,
      permissions: ["otr.trip.update"],
      business_scopes: ["otr.trips.read", "otr.trips.write"],
      allow_reuse: false,
      grant_ttl_seconds: 60,
    },
  };
  return { now, pin, consent, closesAt: now + 20000 };
}
afterEach(() => vi.restoreAllMocks());

it("rejects partial, non-title-only, unmatched and read-policy configurations", () => {
  const { pin, consent, closesAt } = fixture();
  const readOnly = { ...consent, policy: { ...consent.policy, version: "v1" } };
  expect(
    createManagedRenameGate(undefined, principal, closesAt, readOnly),
  ).toBeUndefined();
  for (const input of [
    undefined,
    {},
    { ...pin, clientId: tripId },
    { ...pin, expiresAt: closesAt + 1 },
    {
      ...pin,
      request: { ...request, after: { ...request.after, startDate: "2026-12-02" } },
    },
    { ...pin, request: { ...request, expectedMetadataRevision: 1 } },
  ]) {
    expect(() => createManagedRenameGate(input, principal, closesAt, consent)).toThrow();
  }
  expect(() => createManagedRenameGate(pin, principal, closesAt, readOnly)).toThrow();
  const differentFields = {
    ...pin,
    request: { ...request, after: { ...request.after, startDate: "2026-12-02" } },
  };
  const digest = createHash("sha256")
    .update(canonicalCoreJson(differentFields))
    .digest("hex");
  const matchingVersion = {
    ...consent,
    policy: { ...consent.policy, version: `v1:managed-rename:${digest}` },
  };
  expect(() =>
    createManagedRenameGate(differentFields, principal, closesAt, matchingVersion),
  ).toThrow();
});

it("pins the concrete capability, Trip, operation, body, metadata version and deadline at both gates", () => {
  const { pin, consent, now, closesAt } = fixture();
  const directory = mkdtempSync(join(tmpdir(), "otr-one-rename-"));
  const capture = join(directory, "events.jsonl");
  try {
    const gate = createManagedRenameGate(pin, principal, closesAt, consent, capture)!;
    const event: BetaEvidence = {
      event: "TOOL_CALL",
      ...principal,
      resource,
      capabilityId: "otr.trip.update",
      data: {
        call: parseBetaCall(call).call,
        idempotencyKey: operationId,
        hasExecutionPlan: false,
      },
    };
    const input = betaRequest(call, operationId);
    const grant = {
      ...principal,
      resource,
      tokenId: operationId,
      sessionId: tripId,
      expiresAt: closesAt,
      scopes: ["otr.trips.read", "otr.trips.write"],
    };
    expect(gate.captureReady(event)).toBe(true);
    gate.evidence(event);
    expect(gate.allowWrite(input, grant)).toBe(true);
    for (const data of [
      { ...event.data, idempotencyKey: tripId },
      { ...event.data, hasExecutionPlan: true },
      { ...event.data, call: { ...call, pathParams: { tripId: operationId } } },
      {
        ...event.data,
        call: { ...call, request: { ...request, expectedMetadataRevision: 3 } },
      },
    ])
      expect(gate.captureReady({ ...event, data })).toBe(false);
    expect(gate.captureReady({ ...event, capabilityId: "otr.trip.delete" })).toBe(false);
    expect(gate.allowWrite(input, { ...grant, accountId: tripId })).toBe(false);
    expect(gate.allowWrite(input, { ...grant, clientId: tripId })).toBe(false);
    expect(
      gate.allowWrite({ ...input, path: `/v2/trips/${tripId}/core/commands` }, grant),
    ).toBe(false);
    expect(
      gate.allowWrite(
        { ...input, headers: { ...input.headers, "Idempotency-Key": tripId } },
        grant,
      ),
    ).toBe(false);
    expect(
      gate.allowWrite(
        { ...input, headers: { ...input.headers, "OTR-Trip-Metadata-Version": "2" } },
        grant,
      ),
    ).toBe(false);
    expect(
      gate.allowWrite(
        {
          ...input,
          body: { ...request, after: { ...request.after, name: "Different" } },
        },
        grant,
      ),
    ).toBe(false);
    vi.spyOn(Date, "now").mockReturnValueOnce(now + 10000);
    expect(gate.captureReady(event)).toBe(false);
    vi.spyOn(Date, "now").mockReturnValueOnce(now + 10000);
    expect(gate.allowWrite(input, grant)).toBe(false);
    writeFileSync(capture + ".error", "synthetic capture failure");
    expect(gate.captureReady(event)).toBe(false);
    expect(gate.allowWrite(input, grant)).toBe(false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

it("mounts the private one-rename pin independently from the public page configuration", async () => {
  const { pin, consent, closesAt } = fixture();
  const host = createManagedDevConfiguredHost(
    JSON.stringify({
      expiresAt: closesAt,
      managedDev: {
        ...principal,
        redirectUri: "https://chatgpt.com/connector/oauth/synthetic",
      },
      consentPolicy: {
        ...consent,
        policy: {
          ...consent.policy,
          permissions: betaCapabilities.map((c) => c.capabilityId),
        },
      },
      oneRename: pin,
    }),
    "sb_publishable_synthetic_managed_dev_test_only",
    {} as BackendDependencies,
    vi.fn(() => vi.fn()),
    new Uint8Array([1]),
    {
      version: "managed-api-v1",
      getOrCreateChallenge: vi.fn(),
      readBinding: vi.fn(),
      inspectById: vi.fn(),
      decideById: vi.fn(),
    },
  );
  const response = await host(
    new Request("https://api-dev.xoery.art/oauth/consent/config"),
  );
  expect(response?.status).toBe(200);
  const publicConfig = await response!.text();
  expect(publicConfig).not.toContain("oneRename");
  expect(publicConfig).not.toContain(operationId);
  expect(publicConfig).not.toContain(request.after.name);
});
