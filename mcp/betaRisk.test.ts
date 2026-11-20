import { unknownP5Identity } from "../src/domain/trip/p5Identity";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createBetaEvidenceRecorder } from "./betaEvidence";
import unknownP5 from "./__fixtures__/p5-rejected-call.json";
import rejectedP1 from "./__fixtures__/p1-rejected-call.json";
import { coreDateBoundary } from "../src/domain/trip/tripCoreV2Temporal";
import canonicalExpense from "./fixtures/expense-canonical.json";
import { expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { loopbackServer } from "./http";
import {
  riskRegistry,
  assessBetaRisk,
  assessRiskPlan,
  bindRiskExecutionPlan,
} from "./betaRisk";
import { createBetaMcpHandler } from "./beta";
import intent from "./__fixtures__/rename-intent.json";
const call = {
  capabilityId: "otr.trip.update",
  toolName: "update_trip",
  pathParams: { tripId: intent.tripId },
  query: {},
  request: {
    formatVersion: 3,
    operationId: intent.operationId,
    tripId: intent.tripId,
    expectedMetadataRevision: 2,
    before: intent.before,
    after: intent.after,
  },
};
function remove(id = randomUUID()) {
  return {
    capabilityId: "otr.p1.delete",
    toolName: "delete_trip_item",
    pathParams: { tripId: intent.tripId },
    query: {},
    request: {
      contractVersion: 2,
      intentVersion: 2,
      operationId: randomUUID(),
      tripId: intent.tripId,
      command: "DELETE_ITEM",
      target: { kind: "ITEM", id },
      baseVector: [{ kind: "ITEM", id, revision: 1 }],
      admission: { mode: "MANUAL", sourceIntentId: null, policyVersion: null },
      payload: { reason: "synthetic risk fixture", graphHash: "0".repeat(64) },
    },
  };
}
it("classifies all103 frozen capabilities and retains excluded authorities", () => {
  expect(riskRegistry.capabilities).toHaveLength(103);
  expect(new Set(riskRegistry.capabilities.map((c) => c.capabilityId)).size).toBe(103);
  expect(riskRegistry.capabilities.filter((c) => c.risk === "READ")).toHaveLength(46);
  expect(
    riskRegistry.capabilities.filter((c) => c.risk === "L1_NORMAL_WRITE"),
  ).toHaveLength(16);
  expect(
    riskRegistry.capabilities.filter((c) => c.risk === "L2_SENSITIVE_WRITE"),
  ).toHaveLength(39);
  expect(
    riskRegistry.capabilities.filter((c) => c.risk === "L3_HIGH_IMPACT_WRITE"),
  ).toHaveLength(2);
  expect(() => assessBetaRisk({ ...call, capabilityId: "otr.member.remove" })).toThrow(
    "OUT_OF_SCOPE",
  );
});
it("uses typed actual commands rather than model risk labels and rejects lifecycle laundering", () => {
  expect(assessBetaRisk({ ...call, risk: "READ" }).risk).toBe("L1_NORMAL_WRITE");
  const deletion = remove();
  expect(assessBetaRisk(deletion).risk).toBe("L2_SENSITIVE_WRITE");
  expect(() =>
    assessBetaRisk({
      ...deletion,
      capabilityId: "otr.p1.update",
      toolName: "update_trip_item",
    }),
  ).toThrow();
  expect(() =>
    assessBetaRisk({ ...call, request: { ...call.request, tripId: randomUUID() } }),
  ).toThrow();
});
it("evaluates whole concrete plan; ten distinct deletes escalate but duplicate target and fake confirmation do not lower risk", () => {
  const calls = Array.from({ length: 10 }, () => remove()),
    plan = {
      schemaVersion: "otr.mcp-beta.risk-plan/1.1.0",
      intentId: randomUUID(),
      steps: calls.map((call, i) => ({
        id: "s" + i,
        stage: "APPLY",
        dependsOn: i ? ["s" + (i - 1)] : [],
        call,
      })),
    };
  const result = assessRiskPlan(plan);
  expect(result.risk).toBe("L3_HIGH_IMPACT_WRITE");
  expect(result.boundApplyStepIds).toHaveLength(10);
  expect(result.approvalGranted).toBe(false);
  expect(assessRiskPlan({ ...plan, steps: plan.steps.slice(0, 9) }).risk).toBe(
    "L2_SENSITIVE_WRITE",
  );
  expect(() =>
    assessRiskPlan({ ...plan, steps: [{ ...plan.steps[0], dependsOn: ["s0"] }] }),
  ).toThrow("DEPENDENCY");
});
it("L1 uses current OAuth write scope and matching preview digest with no confirmation callback, preserving original receipt", async () => {
  let handle: ReturnType<typeof createBetaMcpHandler>;
  const host = loopbackServer((r) => handle(r));
  await new Promise<void>((resolve) => host.listen(0, "127.0.0.1", resolve));
  const a = host.address();
  if (!a || typeof a === "string") throw Error();
  const resource = `http://127.0.0.1:${a.port}/mcp`,
    confirm = vi.fn(async () => false),
    receipt = {
      ...call.request,
      actorAccountId: intent.accountId,
      resultMetadataRevision: 3,
    },
    backend = vi.fn(async () => Response.json(receipt));
  let grantExpired = false;
  let scopes = ["otr.trips.read", "otr.trips.write"];
  let captureReady = true;
  const evidence: { event: string; data: Record<string, unknown> }[] = [];
  const evidenceFile = join(
    mkdtempSync(join(tmpdir(), "otr-risk-plan-")),
    "events.jsonl",
  );
  const record = createBetaEvidenceRecorder(
    {
      accountId: intent.accountId,
      clientId: intent.clientId,
      resource,
      tripId: intent.tripId,
      operationId: intent.operationId,
      expiresAt: Date.now() + 60000,
    },
    evidenceFile,
  );
  handle = createBetaMcpHandler({
    resource,
    riskBasedWrites: true,
    requireFirstPartyL3: true,
    preserveCompletedWriteReceipt: true,
    acceptanceCaptureReady: () => captureReady,
    evidence: (event) => {
      evidence.push(event);
      record(event);
    },
    confirm,
    authorize: async () => ({
      accountId: intent.accountId,
      clientId: intent.clientId,
      resource,
      scopes,
      get expiresAt() {
        return Date.now() + (grantExpired ? -1 : 60000);
      },
      read: async () => Response.json({}),
      betaBackend: backend,
    }),
  });
  const client = new Client(
    { name: "RISK_UNIT_NOT_REAL_CONSUMER", version: "1" },
    { versionNegotiation: { mode: { pin: "2026-07-28" } } },
  );
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL(resource)));
    const plan = {
      schemaVersion: "otr.mcp-beta.risk-plan/1.1.0",
      intentId: randomUUID(),
      steps: Array.from({ length: 10 }, (_, i) => ({
        id: "delete" + i,
        stage: "APPLY",
        dependsOn: [],
        call: remove(),
      })),
    };
    const classified = await client.callTool({
      name: "validate_otr_plan",
      arguments: { plan },
    });
    expect(classified.structuredContent).toMatchObject({
      risk: "L3_HIGH_IMPACT_WRITE",
      executed: false,
      approvalGranted: false,
    });
    expect(evidence.find((e) => e.event === "PLAN_VALIDATED")?.data).toEqual({
      input: plan,
      output: classified.structuredContent,
    });
    expect(
      readFileSync(evidenceFile, "utf8")
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line))
        .find((e) => e.event === "PLAN_VALIDATED")?.data,
    ).toEqual({
      input: plan,
      output: classified.structuredContent,
    });
    expect(backend).not.toHaveBeenCalled();
    expect(confirm).not.toHaveBeenCalled();
    const guide = await client.callTool({
      name: "get_otr_operating_guide",
      arguments: { section: "OPERATING" },
    });
    expect(guide.structuredContent).toMatchObject({
      guideVersion: "otr.mcp-beta.guide/1.1.0",
    });
    const resources = await client.listResources();
    expect(resources.resources.some((r) => r.uri === "otr://guide/1.1.0")).toBe(true);
    const tools = await client.listTools();
    const update = tools.tools.find((t) => t.name === "update_trip");
    expect(update?.description).not.toContain("never execute");
    expect(update?._meta).toMatchObject({
      authorizationPolicyVersion: "otr.mcp-beta.risk/1.1.0",
    });
    const invalid = rejectedP1;
    const rejected = await client.callTool({
      name: "create_trip_item",
      arguments: {
        call: invalid,
        idempotencyKey: invalid.request.operationId,
      },
    });
    expect(rejected.isError).toBe(true);
    expect(rejected.structuredContent).toMatchObject({
      outcome: "REJECTED",
      error: {
        code: "CORE_START_LOCAL_DATE_REQUIRED",
        field: "request.payload.schedule.start.local_date",
      },
    });
    expect(backend).not.toHaveBeenCalled();
    const dated = {
      ...invalid,
      request: {
        ...invalid.request,
        payload: {
          ...invalid.request.payload,
          schedule: { start: coreDateBoundary("2026-12-01") },
        },
      },
    };
    expect(assessBetaRisk(dated).risk).toBe("L1_NORMAL_WRITE");
    const invalidP5 = unknownP5;
    const rejectedP5 = await client.callTool({
      name: "create_trip_item",
      arguments: {
        call: invalidP5,
        idempotencyKey: invalidP5.request.operationId,
      },
    });
    expect(rejectedP5.isError).toBe(true);
    expect(JSON.stringify(rejectedP5.content)).toContain("INVALID_TRANSPORT_IDENTITY");
    expect(() => assessBetaRisk(invalidP5)).toThrow("CORE_P5_SERVICE_IDENTITY_REQUIRED");
    expect(backend).not.toHaveBeenCalled();
    const knownP5 = {
      ...invalidP5,
      request: {
        ...invalidP5.request,
        payload: {
          ...invalidP5.request.payload,
          service: {
            ...invalidP5.request.payload.service,
            operator_issuer: "OTR_SYNTHETIC_QA",
            operator_value: "LAYER3_QA_BUS",
            operator_literal: "Layer3 Synthetic Bus Operator",
            service_number: "QA01",
            service_literal: "Layer3 Synthetic Bus Service QA01",
          },
        },
      },
    };
    expect(assessBetaRisk(knownP5).risk).toBe("L1_NORMAL_WRITE");
    const unresolvedP5: any = structuredClone(knownP5);
    Object.assign(unresolvedP5.request.payload.service, unknownP5Identity());
    expect(assessBetaRisk(unresolvedP5).risk).toBe("L1_NORMAL_WRITE");
    const unresolvedPreview = await client.callTool({
      name: "create_trip_item",
      arguments: {
        call: unresolvedP5,
        idempotencyKey: unresolvedP5.request.operationId,
        mode: "PREVIEW",
      },
    });
    expect(unresolvedPreview.structuredContent).toMatchObject({
      outcome: "PREVIEW",
      authorizationRisk: { risk: "L1_NORMAL_WRITE", requiresTrustedConfirmation: false },
      call: {
        request: {
          payload: {
            service: { operator_literal: null, identity_state: { version: 1 } },
          },
        },
      },
    });
    expect(backend).not.toHaveBeenCalled();
    const invalidIdentity = structuredClone(unresolvedP5);
    invalidIdentity.request.payload.service.identity_state.fields.operator_literal =
      "NOT_APPLICABLE";
    expect(() => assessBetaRisk(invalidIdentity)).toThrow(
      "CORE_P5_SERVICE_IDENTITY_REQUIRED",
    );
    const missingDescriptor = structuredClone(unresolvedP5);
    delete missingDescriptor.request.payload.service.identity_state;
    expect(() => assessBetaRisk(missingDescriptor)).toThrow(
      "CORE_P5_SERVICE_IDENTITY_REQUIRED",
    );
    const schema = await client.callTool({
      name: "get_otr_capability_schema",
      arguments: { capabilityId: "otr.p5.create" },
    });
    expect(schema.structuredContent).toMatchObject({ identityStateVersion: 1 });
    expect(JSON.stringify(schema.structuredContent)).toContain("identity_state");
    const sparseP5 = {
      ...invalidP5,
      capabilityId: "otr.p5.update",
      toolName: "update_trip_item",
      request: {
        ...invalidP5.request,
        command: "SET_TRANSPORT_DETAILS",
        baseVector: [{ kind: "ITEM", id: invalidP5.request.target.id, revision: 1 }],
        payload: { patch: { service: { operator_issuer: "  " } } },
      },
    };
    expect(() => assessBetaRisk(sparseP5)).toThrow("CORE_P5_SERVICE_IDENTITY_REQUIRED");
    const args = { call, idempotencyKey: intent.operationId };
    captureReady = false;
    const unavailable = await client.callTool({ name: "update_trip", arguments: args });
    expect(unavailable.structuredContent).toMatchObject({
      outcome: "UNAVAILABLE",
      executed: false,
      error: { code: "ACCEPTANCE_CAPTURE_NOT_READY" },
    });
    expect(backend).not.toHaveBeenCalled();
    captureReady = true;
    const preview = await client.callTool({ name: "update_trip", arguments: args });
    const p = preview.structuredContent as any;
    expect(p.authorizationRisk.risk).toBe("L1_NORMAL_WRITE");
    expect(p.approval).toBeUndefined();
    expect(backend).not.toHaveBeenCalled();
    const bad = await client.callTool({
      name: "update_trip",
      arguments: { ...args, mode: "APPLY", previewDigest: "0".repeat(64) },
    });
    expect(bad.isError).toBe(true);
    expect(backend).not.toHaveBeenCalled();
    captureReady = false;
    const expired = await client.callTool({
      name: "update_trip",
      arguments: {
        ...args,
        mode: "APPLY",
        previewDigest: p.previewDigest,
      },
    });
    expect(expired.structuredContent).toMatchObject({
      outcome: "UNAVAILABLE",
      executed: false,
    });
    expect(backend).not.toHaveBeenCalled();
    captureReady = true;
    backend.mockImplementationOnce(async () => {
      grantExpired = true;
      return Response.json(receipt);
    });
    const applied = await client.callTool({
      name: "update_trip",
      arguments: { ...args, mode: "APPLY", previewDigest: p.previewDigest },
    });
    expect(applied.structuredContent).toMatchObject({
      outcome: "SERVER_RESPONSE",
      httpStatus: 200,
      result: receipt,
    });
    expect(confirm).not.toHaveBeenCalled();
    expect(backend).toHaveBeenCalledTimes(1);
    grantExpired = false;
    scopes = ["otr.trips.read"];
    const denied = await client.callTool({
      name: "update_trip",
      arguments: { ...args, mode: "APPLY", previewDigest: p.previewDigest },
    });
    expect(denied.isError).toBe(true);
    expect(backend).toHaveBeenCalledTimes(1);
    scopes = ["otr.trips.read", "otr.trips.write"];
    const applyArgs = { ...args, mode: "APPLY", previewDigest: p.previewDigest };
    backend.mockImplementationOnce(async () => {
      grantExpired = true;
      return Response.json(
        { error: { code: "MCP_WRITE_ADMISSION_DENIED" } },
        { status: 401 },
      );
    });
    const admissionDenied = await client.callTool({
      name: "update_trip",
      arguments: applyArgs,
    });
    expect(admissionDenied.structuredContent).toMatchObject({
      outcome: "REJECTED",
      httpStatus: 401,
      error: { error: { code: "MCP_WRITE_ADMISSION_DENIED" } },
    });
    grantExpired = false;
    backend.mockImplementationOnce(async () =>
      Response.json({ error: { code: "TRIP_METADATA_CONFLICT" } }, { status: 409 }),
    );
    const conflict = await client.callTool({ name: "update_trip", arguments: applyArgs });
    expect(conflict.structuredContent).toMatchObject({
      outcome: "CONFLICT",
      httpStatus: 409,
      error: { error: { code: "TRIP_METADATA_CONFLICT" } },
      recovery: { idempotencyKey: intent.operationId },
    });
    backend.mockImplementationOnce(async () =>
      Response.json({ error: { code: "TRIP_METADATA_LEASE_BUSY" } }, { status: 503 }),
    );
    const busy = await client.callTool({ name: "update_trip", arguments: applyArgs });
    expect(busy.structuredContent).toMatchObject({
      outcome: "REJECTED",
      httpStatus: 503,
      error: { error: { code: "TRIP_METADATA_LEASE_BUSY" } },
    });
    backend.mockImplementationOnce(async () => {
      throw Error("response lost");
    });
    const beforeLost = backend.mock.calls.length;
    const unknown = await client.callTool({ name: "update_trip", arguments: applyArgs });
    expect(unknown.structuredContent).toMatchObject({
      outcome: "UNKNOWN",
      recovery: { idempotencyKey: intent.operationId },
    });
    expect(backend.mock.calls.length - beforeLost).toBe(1);
    expect(confirm).not.toHaveBeenCalled();
    const l3 = {
      capabilityId: "otr.trip.delete",
      toolName: "delete_trip",
      pathParams: { tripId: intent.tripId },
      query: {},
      request: {
        operationId: randomUUID(),
        tripId: intent.tripId,
        expectedMetadataRevision: 2,
        graphHash: "0".repeat(64),
        reason: "unit only",
        action: "DELETE",
      },
    };
    expect(assessBetaRisk(l3).risk).toBe("L3_HIGH_IMPACT_WRITE");
    const l3args = { call: l3, idempotencyKey: l3.request.operationId };
    const l3preview = await client.callTool({ name: "delete_trip", arguments: l3args });
    const beforeL3 = backend.mock.calls.length;
    const l3denied = await client.callTool({
      name: "delete_trip",
      arguments: {
        ...l3args,
        mode: "APPLY",
        previewDigest: (l3preview.structuredContent as any).previewDigest,
      },
    });
    expect(l3denied.isError).toBe(true);
    expect(JSON.stringify(l3denied)).toContain("FIRST_PARTY_APPROVAL_UNAVAILABLE");
    const currency = {
      capabilityId: "otr.trip.currency.update",
      toolName: "update_trip_currency",
      pathParams: { tripId: intent.tripId },
      query: {},
      request: { proposedCurrency: "USD", baseSettingsRevision: 2, previewDigest: "0".repeat(64) },
    };
    const currencyArgs = { call: currency, idempotencyKey: randomUUID() };
    const currencyPreview = await client.callTool({ name: currency.toolName, arguments: currencyArgs });
    expect(currencyPreview.structuredContent).toMatchObject({ outcome: "PREVIEW" });
    const currencyApply = await client.callTool({
      name: currency.toolName,
      arguments: {
        ...currencyArgs, mode: "APPLY",
        previewDigest: (currencyPreview.structuredContent as any).previewDigest,
      },
    });
    expect(currencyApply.structuredContent).toMatchObject({
      outcome: "NEEDS_CONFIRMATION", error: { code: "FIRST_PARTY_APPROVAL_UNAVAILABLE" }, executed: false,
    });
    expect(backend.mock.calls.length).toBe(beforeL3);
    expect(confirm).not.toHaveBeenCalled();
    const archive = {
      ...l3,
      capabilityId: "otr.trip.archive",
      toolName: "archive_trip",
      request: { ...l3.request, operationId: randomUUID(), action: "ARCHIVE" },
    };
    const aargs = { call: archive, idempotencyKey: archive.request.operationId };
    const apreview = await client.callTool({ name: "archive_trip", arguments: aargs });
    expect((apreview.structuredContent as any).authorizationRisk).toMatchObject({
      risk: "L2_SENSITIVE_WRITE",
      requiresImpactExplanation: true,
    });
    backend.mockImplementationOnce(async () =>
      Response.json({
        operationId: archive.request.operationId,
        tripId: intent.tripId,
        actorAccountId: intent.accountId,
        request: archive.request,
        outcome: "APPLIED",
        resultMetadataRevision: 3,
        state: "ARCHIVED",
        committedAt: new Date().toISOString(),
      }),
    );
    const archived = await client.callTool({
      name: "archive_trip",
      arguments: {
        ...aargs,
        mode: "APPLY",
        previewDigest: (apreview.structuredContent as any).previewDigest,
      },
    });
    expect(archived.structuredContent).toMatchObject({
      outcome: "SERVER_RESPONSE",
      httpStatus: 200,
    });
    expect(confirm).not.toHaveBeenCalled();
  } finally {
    await client.close();
    await new Promise<void>((resolve) => host.close(() => resolve()));
  }
});

it("ordinary Expense update is L1, actual split/payer/participation changes escalate to L2", () => {
  const id = randomUUID();
  const request = {
    auditReason: null,
    envelope: {
      commandId: id,
      intentVersion: 2,
      intentSequence: 1,
      predecessorOperationId: null,
      observedServerRevision: 1,
      observedBase: canonicalExpense,
      patchOrIntent: { type: "UPDATE", patch: { descriptive: { title: "normal" } } },
      causalBaseReceipt: null,
      boundExecutionRevision: 1,
      idempotencyKey: id,
    },
  };
  const call = {
    capabilityId: "otr.expense.update",
    toolName: "expense_update",
    pathParams: { tripId: canonicalExpense.journeyId, expenseId: canonicalExpense.id },
    query: {},
    request,
  };
  expect(assessBetaRisk(call).risk).toBe("L1_NORMAL_WRITE");
  for (const patch of [
    { financial: { payerMemberId: canonicalExpense.payerMemberId } },
    { financial: { settlementParticipation: "EXCLUDED" } },
    { participantSplit: { participants: canonicalExpense.participants } },
  ])
    expect(
      assessBetaRisk({
        ...call,
        request: {
          ...request,
          envelope: { ...request.envelope, patchOrIntent: { type: "UPDATE", patch } },
        },
      }).risk,
    ).toBe("L2_SENSITIVE_WRITE");
});

it("binds the actual Apply call and rejects target/revision/operation or fake step changes", () => {
  const current = remove();
  const plan = {
    schemaVersion: "otr.mcp-beta.risk-plan/1.1.0",
    intentId: randomUUID(),
    steps: [{ id: "apply1", stage: "APPLY", dependsOn: [], call: current }],
  };
  expect(bindRiskExecutionPlan(plan, current).operations).toEqual([
    current.request.operationId,
  ]);
  for (const patch of [
    { target: { kind: "ITEM", id: randomUUID() } },
    { baseVector: [{ ...current.request.baseVector[0], revision: 2 }] },
    { operationId: randomUUID() },
  ])
    expect(() =>
      bindRiskExecutionPlan(plan, {
        ...current,
        request: { ...current.request, ...patch },
      }),
    ).toThrow("BINDING");
  expect(() =>
    bindRiskExecutionPlan(
      { ...plan, steps: [{ ...plan.steps[0], stage: "PREVIEW" }] },
      current,
    ),
  ).toThrow("BINDING");
  expect(() =>
    bindRiskExecutionPlan(
      { ...plan, steps: [plan.steps[0], { ...plan.steps[0], id: "other" }] },
      current,
    ),
  ).toThrow("DUPLICATE_OPERATION");
});

it("blocks a declared ten-target plan before the first dispatch; omission/re-key remain fenced and Preview binds context", async () => {
  let handle: ReturnType<typeof createBetaMcpHandler>;
  const host = loopbackServer((r) => handle(r));
  await new Promise<void>((resolve) => host.listen(0, "127.0.0.1", resolve));
  const a = host.address();
  if (!a || typeof a === "string") throw Error();
  const resource = `http://127.0.0.1:${a.port}/mcp`;
  const backend = vi.fn(async () => Response.json({}));
  const confirm = vi.fn(async () => true);
  const calls = Array.from({ length: 10 }, () => remove());
  const plan = {
    schemaVersion: "otr.mcp-beta.risk-plan/1.1.0",
    intentId: randomUUID(),
    steps: calls.map((call, i) => ({
      id: "delete" + i,
      stage: "APPLY",
      dependsOn: [],
      call,
    })),
  };
  const captureFile = join(
    mkdtempSync(join(tmpdir(), "otr-plan-fence-")),
    "events.jsonl",
  );
  const capture = createBetaEvidenceRecorder(
    {
      accountId: intent.accountId,
      clientId: intent.clientId,
      resource,
      tripId: intent.tripId,
      operationId: intent.operationId,
      riskScope: { tripIds: [intent.tripId], operationIds: [intent.operationId] },
      expiresAt: Date.now() + 60000,
    },
    captureFile,
  );
  const fenced = new Set<string>();
  let failPersistence = false;
  const admission = vi.fn(async (mode: string, _approval: unknown, input: any) => {
    if (mode === "REGISTER_PLAN") {
      if (failPersistence) throw Error("DB_UNAVAILABLE");
      for (const step of input.steps) fenced.add(step.call.request.target.id);
      return { risk: "L3_HIGH_IMPACT_WRITE" as const, reserved: false };
    }
    return {
      risk: fenced.has(input.request.target.id)
        ? ("L3_HIGH_IMPACT_WRITE" as const)
        : ("L2_SENSITIVE_WRITE" as const),
      reserved: mode === "RESERVE",
    };
  });
  handle = createBetaMcpHandler({
    resource,
    riskBasedWrites: true,
    riskAdmission: admission,
    evidence: capture,
    confirm,
    authorize: async () => ({
      accountId: intent.accountId,
      clientId: intent.clientId,
      resource,
      scopes: ["otr.trips.read", "otr.trips.write"],
      expiresAt: Date.now() + 60000,
      read: async () => Response.json({}),
      betaBackend: backend,
    }),
  });
  const client = new Client(
    { name: "PLAN_FENCE_UNIT_NOT_REAL_CONSUMER", version: "1" },
    { versionNegotiation: { mode: { pin: "2026-07-28" } } },
  );
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL(resource)));
    const args = { call: calls[0], idempotencyKey: calls[0].request.operationId };
    const blocked = await client.callTool({
      name: "delete_trip_item",
      arguments: {
        ...args,
        executionPlan: plan,
        mode: "APPLY",
        previewDigest: "0".repeat(64),
      },
    });
    expect(blocked.structuredContent).toMatchObject({
      outcome: "NEEDS_CONFIRMATION",
      error: { code: "WHOLE_PLAN_TRUSTED_APPROVAL_REQUIRED" },
      executed: false,
      approvalGranted: false,
    });
    expect(fenced.size).toBe(10);
    for (const operationId of [calls[0].request.operationId, randomUUID()]) {
      const hidden = await client.callTool({
        name: "delete_trip_item",
        arguments: {
          call: { ...calls[0], request: { ...calls[0].request, operationId } },
          idempotencyKey: operationId,
          mode: "APPLY",
          previewDigest: "0".repeat(64),
        },
      });
      expect(hidden.structuredContent).toMatchObject({
        outcome: "NEEDS_CONFIRMATION",
        error: { code: "AGGREGATE_TRUSTED_APPROVAL_REQUIRED" },
      });
    }
    const persisted = readFileSync(captureFile, "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(
      persisted.find((e) => e.event === "PLAN_EXECUTION_BLOCKED")?.data.output,
    ).toEqual(blocked.structuredContent);
    expect(persisted.filter((e) => e.event === "RISK_ADMISSION_BLOCKED")).toHaveLength(2);
    failPersistence = true;
    const failed = await client.callTool({
      name: "delete_trip_item",
      arguments: { ...args, executionPlan: plan },
    });
    expect(failed.isError).toBe(true);
    const context = {
      schemaVersion: "otr.mcp-beta.risk-plan/1.1.0",
      intentId: randomUUID(),
      steps: [{ id: "update", stage: "APPLY", dependsOn: [], call }],
    };
    const before = await client.callTool({
      name: "update_trip",
      arguments: {
        call,
        idempotencyKey: call.request.operationId,
        executionPlan: context,
      },
    });
    expect(before.structuredContent).toMatchObject({ outcome: "PREVIEW" });
    for (const changed of [undefined, { ...context, intentId: randomUUID() }]) {
      const apply = await client.callTool({
        name: "update_trip",
        arguments: {
          call,
          idempotencyKey: call.request.operationId,
          mode: "APPLY",
          previewDigest: (before.structuredContent as { previewDigest: string })
            .previewDigest,
          ...(changed ? { executionPlan: changed } : {}),
        },
      });
      expect(apply.structuredContent).toMatchObject({ outcome: "NEEDS_PREVIEW" });
    }
    expect(backend).not.toHaveBeenCalled();
    expect(confirm).not.toHaveBeenCalled();
  } finally {
    await client.close();
    await new Promise<void>((resolve) => host.close(() => resolve()));
  }
});
