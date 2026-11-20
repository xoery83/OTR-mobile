import type { RiskAdmission } from "../backend/src/mcpRiskAdmission";
import {
  assessBetaRisk,
  assessRiskPlan,
  bindRiskExecutionPlan,
  riskRegistry,
  riskPlanSchema,
  p5ServiceIdentityFields,
} from "./betaRisk";
import type { createInChatConfirmationProbe } from "./inChatConfirmation";
import type { BetaEvidence } from "./betaEvidence";
import { AsyncLocalStorage } from "node:async_hooks";
import { createBetaLegacySessions } from "./betaLegacySessions";
import { readFileSync } from "node:fs";
import { z } from "zod";
import { t } from "../src/ui/locale";
import {
  McpServer,
  createMcpHandler as createSdkMcpHandler,
  type CallToolResult,
  inputRequired,
  acceptedContent,
  inputResponse,
} from "@modelcontextprotocol/server";
import registryArtifact from "../docs/mcp/beta-contract-v1/CAPABILITY_REGISTRY_V1.json";
import descriptions from "../docs/mcp/beta-layer2/TOOL_DESCRIPTIONS.json";
import manifest from "../docs/mcp/beta-layer1/SERVER_API_MANIFEST.json";
import { callSchemas } from "../docs/mcp/beta-layer2/schema/requests";
import { createBetaConfirmationCodec } from "./betaConfirmation";
import { validateBetaPlan, resolveBetaPlanIdentities } from "./betaPlanning";
import { betaRequestSchema, betaResponseSchema } from "../backend/src/mcpBetaApiSchemas";
import {
  createRequestBoundary,
  readBoundedBytes,
  readBoundedJson,
} from "../src/data/api/requestBoundary";
import { contentDigest, type ApprovalRequest } from "./mutation";
import type { McpOptions, McpAuthorization } from "./server";
import { listTripsInput, tripInput } from "./contract";

export type BetaBackend = (
  request: {
    method: "GET" | "POST" | "PUT" | "DELETE";
    path: string;
    body?: unknown;
    headers?: Record<string, string>;
  },
  signal: AbortSignal,
) => Promise<Response>;
export const betaCapabilities = registryArtifact.capabilities;
const frozenGuide = readFileSync(
  new URL("../docs/mcp/beta-layer2/GUIDE.md", import.meta.url),
  "utf8",
);
const riskGuide = readFileSync(
  new URL("../docs/mcp/beta-contract-v1.1/GUIDE.md", import.meta.url),
  "utf8",
);
function guideSections(guide: string) {
  const sections: Record<string, string> = Object.fromEntries(
    [...guide.matchAll(/^## ([^\n]+)\n([\s\S]*?)(?=^## |$(?![\s\S]))/gm)].map((m) => [
      m[1],
      m[2],
    ]),
  );
  sections.FIELDS = Object.entries(sections)
    .filter(([name]) => name.startsWith("FIELDS."))
    .map(([name, text]) => `## ${name}\n${text}`)
    .join("\n");
  return sections;
}
export const betaGuideInput = z.strictObject({
  section: z.enum(["ALL", "OPERATING", "FIELDS", "CAPABILITIES"]).default("ALL"),
});
const keySchema = z.uuid();
const action = {
  idempotencyKey: keySchema,
  mode: z.enum(["PREVIEW", "APPLY"]).default("PREVIEW"),
  previewDigest: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
};
export type BetaCall = z.infer<(typeof callSchemas)[number]>;
export function parseBetaCall(raw: unknown) {
  const id = z.object({ capabilityId: z.string() }).parse(raw).capabilityId;
  const i = betaCapabilities.findIndex((c) => c.capabilityId === id);
  if (i < 0) throw Error("UNKNOWN_CAPABILITY");
  const c = betaCapabilities[i];
  const call = callSchemas[i].parse(raw);
  // The frozen planning validator and current owning validator must both accept concrete inputs.
  const value = betaRequestSchema(id).parse(
    c.method === "GET" ? call.query : call.request,
  );
  const parsed = { ...call, [c.method === "GET" ? "query" : "request"]: value };
  const request = parsed.request as Record<string, unknown>;
  if (
    request.tripId !== undefined &&
    request.tripId !== parsed.pathParams.tripId &&
    c.path.includes("{tripId}")
  )
    throw Error("TRIP_CONTEXT_MISMATCH");
  return { capability: c, call: parsed };
}
export function betaRequest(raw: unknown, idempotencyKey?: string) {
  const { capability: c, call } = parseBetaCall(raw);
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(call.query as Record<string, unknown>)) {
    // The Metadata Reader negotiates its version via the owning manifest header.
    if (c.capabilityId === "otr.trip.get" && k === "formatVersion") continue;
    q.set(k, String(v));
  }
  const path = c.path.replace(/\{(\w+)\}/g, (_, k: string) =>
    encodeURIComponent(call.pathParams[k]),
  );
  const row = manifest.capabilities.find((v) => v.capabilityId === c.capabilityId)!;
  const headers: Record<string, string> = {};
  for (const [name, value] of Object.entries(row.headers))
    if (name !== "Idempotency-Key") headers[name] = String(value);
  if (c.capabilityId === "otr.trip.get") headers["OTR-Metadata-Operation-Id"] = crypto.randomUUID();
  if (c.effect === "WRITE") {
    keySchema.parse(idempotencyKey);
    const body = call.request as {
      operationId?: string;
      envelope?: { idempotencyKey: string };
    };
    const bound = body.operationId ?? body.envelope?.idempotencyKey;
    if (bound !== undefined && bound !== idempotencyKey)
      throw Error("OPERATION_IDENTITY_MISMATCH");
    headers["Idempotency-Key"] = idempotencyKey!;
  } else if (idempotencyKey !== undefined) throw Error("READ_HAS_NO_MUTATION_IDENTITY");
  return {
    method: c.method as "GET" | "POST" | "PUT" | "DELETE",
    path: path + (q.size ? "?" + q.toString() : ""),
    headers,
    ...(c.method !== "GET" ? { body: call.request } : {}),
  };
}
const result = (value: Record<string, unknown>, isError = false): CallToolResult => ({
  ...(isError ? { isError: true } : {}),
  content: [{ type: "text", text: JSON.stringify(value) }],
  structuredContent: value,
});
function preview(
  auth: McpAuthorization,
  resource: string,
  call: unknown,
  key: string,
  planDigest?: string,
): ApprovalRequest {
  const parsed = parseBetaCall(call);
  const request = betaRequest(parsed.call, key);
  return Object.freeze({
    accountId: auth.accountId,
    ...(auth.managedConsent ? { managedConsent: auth.managedConsent } : {}),
    clientId: auth.clientId ?? "",
    resource,
    operationIds: Object.freeze([key]),
    summary: `${parsed.capability.capabilityId}\n${JSON.stringify(parsed.call)}`,
    digest: contentDigest({
      accountId: auth.accountId,
      clientId: auth.clientId,
      resource,
      call: parsed.call,
      request,
      ...(planDigest ? { planDigest } : {}),
    }),
  });
}
export type FirstPartyApprovalLink = {
  id: string | null;
  state: string;
  url: string | null;
  expiresAt: string | null;
  completed: boolean;
  decisionAt: string | null;
};
export type FirstPartyApprovalPort = {
  prepare(
    approval: ApprovalRequest,
    call: unknown,
    signal: AbortSignal,
  ): Promise<FirstPartyApprovalLink>;
  check(
    approval: ApprovalRequest,
    call: unknown,
    signal: AbortSignal,
  ): Promise<
    FirstPartyApprovalLink & {
      approved: boolean;
      binding: Omit<ApprovalRequest, "summary">;
    }
  >;
};
// Previously linked consumers may retain the original Trip-read tool definitions.
export function adaptLegacyTripRead(bytes: Uint8Array): Uint8Array {
  let rpc;
  try {
    rpc = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return bytes;
  }
  if (rpc?.jsonrpc !== "2.0" || rpc.method !== "tools/call") return bytes;
  const tool = rpc.params?.name;
  const args = rpc.params?.arguments;
  const get = tool === "get_trip" ? tripInput.safeParse(args) : undefined;
  const list = tool === "list_trips" ? listTripsInput.safeParse(args) : undefined;
  const call = get?.success
    ? { capabilityId: "otr.trip.get", toolName: tool, pathParams: { tripId: get.data.trip_id }, query: {}, request: {} }
    : list?.success
      ? { capabilityId: "otr.trip.list", toolName: tool, pathParams: {}, query: list.data, request: {} }
      : undefined;
  if (!call) return bytes;
  return Buffer.from(JSON.stringify({ ...rpc, params: { ...rpc.params, arguments: { call } } }));
}

type DiscoveryIdentity = Pick<McpAuthorization, "accountId" | "clientId" | "resource" | "expiresAt">;
const discoveryRequest = z.object({
  jsonrpc: z.literal("2.0"),
  method: z.enum(["initialize", "notifications/initialized", "ping", "tools/list"]),
});

export function createBetaMcpHandler(
  options: McpOptions & {
    evidence?: (event: BetaEvidence) => void;
    acceptanceCaptureReady?: (event: BetaEvidence) => boolean;
    preserveCompletedWriteReceipt?: boolean;
    legacyTripRead?: boolean;
    discoveryIdentity?: (request: Request) => DiscoveryIdentity | undefined;
    unapproved?: (request: Request, signal: AbortSignal) => Promise<Response | null>;
    riskBasedWrites?: boolean;
    requireFirstPartyL3?: boolean;
    riskAdmission?: RiskAdmission;
    operationApproval?: FirstPartyApprovalPort;
    operationApprovalCapability?: "otr.trip.update" | "otr.trip.delete";
    inChatProbe?: ReturnType<typeof createInChatConfirmationProbe>;
  },
) {
  const guide = options.riskBasedWrites ? riskGuide : frozenGuide;
  const sections = guideSections(guide);
  const confirmationCodec = createBetaConfirmationCodec();
  const confirmationSchema = z.strictObject({ approve: z.boolean() });
  const resource = new URL(options.resource);
  if (
    resource.pathname !== "/mcp" ||
    resource.search ||
    resource.hash ||
    resource.username ||
    resource.password ||
    !(
      resource.protocol === "https:" ||
      (resource.protocol === "http:" &&
        ["127.0.0.1", "localhost", "[::1]"].includes(resource.hostname))
    )
  )
    throw Error("INVALID_MCP_RESOURCE");
  const requestScope = new AsyncLocalStorage<{
    auth: NonNullable<Awaited<ReturnType<NonNullable<McpOptions["authorize"]>>>>;
    boundary: ReturnType<typeof createRequestBoundary>;
  }>();
  const legacy = createBetaLegacySessions();
  const requestContext = () => {
    const value = requestScope.getStore();
    if (!value) throw Error("MCP_REQUEST_CONTEXT_REQUIRED");
    return value;
  };
  const emit = (event: string, data: Record<string, unknown>, capabilityId?: string) => {
    if (!options.evidence) return;
    const { auth } = requestContext();
    try {
      options.evidence({
        event,
        accountId: auth.accountId,
        clientId: auth.clientId!,
        resource: auth.resource,
        capabilityId,
        data,
      });
    } catch {
      /* observation cannot change execution */
    }
  };
  const buildServer = () => {
    const active = (requireUnexpiredGrant = true) => {
      const { auth, boundary } = requestContext();
      return (
        auth.resource === options.resource &&
        !!auth.clientId &&
        (!requireUnexpiredGrant || auth.expiresAt > Date.now()) &&
        !boundary.signal.aborted &&
        auth.scopes.includes("otr.trips.read")
      );
    };
    const server = new McpServer(
      { name: "otr-mcp-beta", version: "1.0.0" },
      {
        requestState: { verify: (state) => confirmationCodec.verify(state) },
        instructions:
          "Read get_otr_operating_guide (OPERATING, FIELDS, CAPABILITIES) before planning. Plan is intent, never approval. Execute only concrete validated calls. Preserve original operations after UNKNOWN; obtain original receipts and independent readback. Settlement, Personal Payment and Personal Review are read-only.",
      },
    );
    options.inChatProbe?.register(server, () => ({
      auth: requestContext().auth,
      signal: requestContext().boundary.signal,
    }));
    server.registerTool(
      "get_otr_operating_guide",
      {
        inputSchema: betaGuideInput,
        description:
          "Read the authoritative Layer 2 Guide; ALL includes source facts, fields and capability rules.",
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
      async (input) => {
        if (!active()) return result({ error: { code: "AUTH_REQUIRED" } }, true);
        const text = input.section === "ALL" ? guide : sections[input.section];
        if (text === undefined)
          return result({ error: { code: "GUIDE_SECTION_UNAVAILABLE" } }, true);
        emit("GUIDE_READ", {
          input,
          output: {
            guideVersion: options.riskBasedWrites
              ? "otr.mcp-beta.guide/1.1.0"
              : "otr.mcp-beta.guide/1.0.0",
            section: input.section,
            text,
          },
        });
        return result({
          guideVersion: options.riskBasedWrites
            ? "otr.mcp-beta.guide/1.1.0"
            : "otr.mcp-beta.guide/1.0.0",
          section: input.section,
          text,
        });
      },
    );
    server.registerResource(
      "otr-operating-guide",
      options.riskBasedWrites ? "otr://guide/1.1.0" : "otr://guide/1.0.0",
      { mimeType: "text/markdown" },
      async (uri) => {
        if (!active()) throw Error("AUTH_REQUIRED");
        return {
          contents: [{ uri: uri.href, mimeType: "text/markdown", text: guide }],
        };
      },
    );
    server.registerTool(
      "validate_otr_plan",
      {
        inputSchema: z.strictObject({ plan: z.unknown() }),
        description:
          "Run the original Layer 2 planning validator. A static PASS or CONFIRM step grants no execution authority.",
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
      async ({ plan }) => {
        if (!active()) return result({ error: { code: "AUTH_REQUIRED" } }, true);
        try {
          const output =
            options.riskBasedWrites &&
            (plan as { schemaVersion?: string })?.schemaVersion ===
              "otr.mcp-beta.risk-plan/1.1.0"
              ? assessRiskPlan(plan)
              : validateBetaPlan(plan);
          emit("PLAN_VALIDATED", { input: plan, output });
          return result(output);
        } catch {
          return result({ error: { code: "INVALID_PLAN" }, executed: false }, true);
        }
      },
    );
    server.registerTool(
      "resolve_otr_plan_identities",
      {
        inputSchema: z.strictObject({ plan: z.unknown() }),
        description:
          "Resolve validated Plan $identity references to stable Account/intent/step UUIDs. Reuse them across Preview/Apply/recovery and process restarts. This creates no business object or approval; future $result references still need real owning responses.",
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
      async ({ plan }) => {
        if (!active()) return result({ error: { code: "AUTH_REQUIRED" } }, true);
        try {
          return result(resolveBetaPlanIdentities(plan, requestContext().auth.accountId));
        } catch {
          return result({ error: { code: "INVALID_PLAN" }, executed: false }, true);
        }
      },
    );
    server.registerTool(
      "get_otr_account_context",
      {
        inputSchema: z.strictObject({}),
        description:
          "Read the verified current Account/client/resource context; no token or permission elevation.",
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
      async () => {
        if (active())
          emit("ACCOUNT_READ", {
            input: {},
            output: {
              accountId: requestContext().auth.accountId,
              clientId: requestContext().auth.clientId,
              resource: requestContext().auth.resource,
              scopes: [...requestContext().auth.scopes],
            },
          });
        return active()
          ? result({
              accountId: requestContext().auth.accountId,
              clientId: requestContext().auth.clientId,
              resource: requestContext().auth.resource,
              scopes: [...requestContext().auth.scopes],
            })
          : result({ error: { code: "AUTH_REQUIRED" } }, true);
      },
    );
    server.registerTool(
      "get_otr_capability_schema",
      {
        inputSchema: z.strictObject({
          capabilityId: z.enum(
            betaCapabilities.map((c) => c.capabilityId) as [string, ...string[]],
          ),
        }),
        description:
          "Read current owning request/response schemas for one frozen capability, including the two explicit Layer 3 evidence deltas. Original Zod semantic validation remains mandatory.",
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
      async ({ capabilityId }) => {
        if (!active()) return result({ error: { code: "AUTH_REQUIRED" } }, true);
        return result({
          contractVersion: options.riskBasedWrites
            ? "otr.mcp-beta.contract/1.1.0"
            : "otr.mcp-beta.contract/1.0.0",
          integrationDelta: options.riskBasedWrites
            ? "otr.mcp-beta.risk/1.1.0"
            : "otr.mcp-beta.layer3-evidence/1",
          ...(options.riskBasedWrites
            ? {
                authorizationRisk: riskRegistry.capabilities.find(
                  (c) => c.capabilityId === capabilityId,
                ),
                riskPlanSchema: z.toJSONSchema(riskPlanSchema, { io: "input" }),
                planEnforcementVersion: riskRegistry.rules.planEnforcementVersion,
              }
            : {}),
          capabilityId,
          requestSchema: z.toJSONSchema(betaRequestSchema(capabilityId), {
            io: "input",
          }),
          responseSchema: z.toJSONSchema(betaResponseSchema(capabilityId), {
            io: "input",
          }),
          semanticValidation:
            "Frozen Layer 2 call schema + current owning Zod refinements; formal Backend ACL/CAS/receipts remain authoritative.",
          ...(options.riskBasedWrites && /^otr\.p5\.(create|update)$/.test(capabilityId)
            ? {
                identityStateVersion: 1,
                storedReadCompatibility:
                  "Approved legacy stored P5/NAME missing facts project as UNKNOWN without rewriting canonical rows, intents or receipts. Only an explicit new service edit versions those unavailable facts; new blank create requests remain invalid.",
                semanticRequirements: [
                  "operator_namespace",
                  ...p5ServiceIdentityFields,
                ].map((field) => ({
                  field: "request.payload.service." + field,
                  requirement:
                    "Owning P5 identity_state version 1 distinguishes KNOWN, UNKNOWN and NOT_APPLICABLE. KNOWN requires a nonempty typed fact; UNKNOWN requires null with its explicit descriptor. NOT_APPLICABLE is permitted only for an explicitly unnumbered service_number. Descriptor omission means legacy complete known facts. Never invent operator/service identity or encode unknown as blanks. Preserve omitted sparse fields and enrich the original Item/service key under current CAS; the owning final graph validates combined facts.",
                })),
              }
            : {}),
          ...(options.riskBasedWrites && /^otr\.p[1346]\.create$/.test(capabilityId)
            ? {
                semanticRequirements: [
                  {
                    field: "request.payload.schedule.start.local_date",
                    requirement:
                      "Non-null civil date required by existing Core setSchedule. Ask for a date when not supplied; do not infer it from Trip dates. Time/instant may remain unknown.",
                  },
                ],
              }
            : {}),
        });
      },
    );
    const names = [...new Set(betaCapabilities.map((c) => c.toolName))];
    for (const name of names) {
      const entries = betaCapabilities.filter((c) => c.toolName === name);
      const write = entries[0].effect === "WRITE";
      const variants = entries.map((c) => callSchemas[betaCapabilities.indexOf(c)]);
      const callSchema =
        variants.length === 1
          ? variants[0]
          : z.union(
              variants as [
                (typeof variants)[0],
                (typeof variants)[0],
                ...typeof variants,
              ],
            );
      const inputSchema = z.strictObject({
        call: callSchema,
        ...(write ? action : {}),
        ...(write && options.riskBasedWrites
          ? { executionPlan: riskPlanSchema.optional() }
          : {}),
      });
      const scopes = write ? ["otr.trips.read", "otr.trips.write"] : ["otr.trips.read"];
      const providerScopes =
        (write
          ? options.oauth?.authorizationScopes?.write
          : options.oauth?.authorizationScopes?.read) ?? scopes;
      server.registerTool(
        name,
        {
          inputSchema,
          description:
            (options.riskBasedWrites
              ? descriptions
                  .find((d) => d.toolName === name)!
                  .description.replace(
                    "Plan future write only after authorized current Base, exact preview and trusted human confirmation; never execute in Layer2.",
                    "Use formal current Base and unchanged owning validators/CAS/Receipt under risk1.1.",
                  )
              : descriptions.find((d) => d.toolName === name)!.description) +
            (options.riskBasedWrites &&
            (name === "create_trip_item" || name === "update_trip_item")
              ? " P5 identity_state v1 allows explicit UNKNOWN/null facts and explicitly unnumbered NOT_APPLICABLE service_number; do not invent operator or service facts. Enrich the same Item and opaque service key under current CAS; tentative service facts never imply Booking or Ticket confirmation."
              : "") +
            (name === "ledger_history"
              ? " Current History is discriminated by targetKind; Personal Payment events preserve original PostgreSQL snapshot JSON text, never an expenseId."
              : name === "get_ledger_operation"
                ? " Completed unresolved typed 409 returns REJECTED with original responseStatus/responseBody; it is not success or UNKNOWN."
                : "") +
            (options.riskBasedWrites
              ? " For a concrete multi-step write include the complete executionPlan on every PREVIEW/APPLY; the current call must be an actual APPLY step. A declared high-risk destructive plan registers restrictive fifteen-minute target fences and is blocked before the first business write; no bulk approval/executor is available. Risk v1.1: server registry and actual command/impact decide risk. L1/L2 use OAuth write scope and owning ACL/CAS/validation without an extra user approval click. Explain L2 lifecycle/sharing/financial side effects before executing; explanation is not authorization. L3 still needs exact trusted confirmation; never split destructive batches to lower risk. Default PREVIEW, then identical APPLY with its digest and original operation; never retry UNKNOWN."
              : " Layer 3: use call with exactly the Plan call shape; unresolved references are rejected. Writes default to PREVIEW; APPLY requires its digest and separate trusted human approval. Read owning operation and target afterward."),
          _meta: {
            securitySchemes: [{ type: "oauth2", scopes: providerScopes }],
            capabilityIds: entries.map((c) => c.capabilityId),
            ...(options.riskBasedWrites
              ? {
                  authorizationPolicyVersion: riskRegistry.version,
                  authorizationRisks: entries.map((c) =>
                    riskRegistry.capabilities.find(
                      (r) => r.capabilityId === c.capabilityId,
                    ),
                  ),
                }
              : {}),
          },
          annotations: {
            readOnlyHint: !write,
            destructiveHint: entries.some((c) =>
              /\.(delete|hide|archive)$/.test(c.capabilityId),
            ),
            idempotentHint: true,
            openWorldHint: false,
          },
        },
        async (raw: unknown, ctx) => {
          if (!active()) return result({ error: { code: "AUTH_REQUIRED" } }, true);
          const input = raw as {
            call: unknown;
            idempotencyKey?: string;
            mode?: string;
            previewDigest?: string;
            executionPlan?: unknown;
          };
          let sent = false;
          try {
            const { capability: c, call } = parseBetaCall(input.call);
            if (input.mode === "APPLY" && options.inChatProbe)
              return result(
                { outcome: "REJECTED", error: { code: "IN_CHAT_CONFIRMATION_PENDING" } },
                true,
              );
            if (c.toolName !== name) throw Error("TOOL_CAPABILITY_MISMATCH");
            if (!scopes.every((s) => requestContext().auth.scopes.includes(s)))
              return {
                ...result({ error: { code: "WRITE_SCOPE_REQUIRED" } }, true),
                _meta: {
                  "mcp/www_authenticate": [
                    `Bearer error="insufficient_scope", scope="${providerScopes.join(" ")}"`,
                  ],
                },
              };
            const captureReady = () => {
              const auth = requestContext().auth;
              return (
                !options.acceptanceCaptureReady ||
                (typeof auth.clientId === "string" &&
                  options.acceptanceCaptureReady({
                    event: "TOOL_CALL",
                    accountId: auth.accountId,
                    clientId: auth.clientId,
                    resource: auth.resource,
                    capabilityId: c.capabilityId,
                    data: {
                      call,
                      idempotencyKey: input.idempotencyKey,
                      hasExecutionPlan: input.executionPlan !== undefined,
                    },
                  }))
              );
            };
            const captureUnavailable = () =>
              result(
                {
                  outcome: "UNAVAILABLE",
                  error: { code: "ACCEPTANCE_CAPTURE_NOT_READY" },
                  executed: false,
                },
                true,
              );
            if (write && !captureReady()) return captureUnavailable();
            let risk = options.riskBasedWrites ? assessBetaRisk(call) : undefined;
            let directWrite =
              !!risk && ["L1_NORMAL_WRITE", "L2_SENSITIVE_WRITE"].includes(risk.risk);
            const operation = write ? input.idempotencyKey : undefined;
            const downstream = betaRequest(call, operation);
            const execution =
              write && input.executionPlan !== undefined
                ? bindRiskExecutionPlan(input.executionPlan, call)
                : undefined;
            emit(
              "TOOL_CALL",
              {
                toolName: name,
                call,
                mode: write ? (input.mode ?? "PREVIEW") : "READ",
                operationId: operation,
                previewDigest: input.previewDigest,
              },
              c.capabilityId,
            );
            if (write) {
              const approved = preview(
                requestContext().auth,
                options.resource,
                call,
                operation!,
                execution?.digest,
              );
              const { managedConsent: _privateConsent, ...recordableApproval } = approved;
              if (
                execution?.assessment.risk === "L3_HIGH_IMPACT_WRITE" &&
                execution.operations.length > 1
              ) {
                if (execution.assessment.multipleDestructiveTargets) {
                  if (!options.riskAdmission) throw Error("PLAN_FENCE_UNAVAILABLE");
                  const fenced = await requestContext().boundary.run(() =>
                    options.riskAdmission!(
                      "REGISTER_PLAN",
                      {
                        ...approved,
                        digest: execution.digest,
                        operationIds: execution.operations,
                      },
                      execution.plan,
                      requestContext().boundary.signal,
                    ),
                  );
                  if (fenced.risk !== "L3_HIGH_IMPACT_WRITE" || fenced.reserved)
                    throw Error("PLAN_FENCE_INVALID");
                }
                const blocked = {
                  outcome: "NEEDS_CONFIRMATION",
                  error: { code: "WHOLE_PLAN_TRUSTED_APPROVAL_REQUIRED" },
                  authorizationRisk: execution.assessment,
                  executed: false,
                  approvalGranted: false,
                };
                emit(
                  "PLAN_EXECUTION_BLOCKED",
                  {
                    call,
                    plan: execution.plan,
                    planDigest: execution.digest,
                    output: blocked,
                  },
                  c.capabilityId,
                );
                return result(blocked, true);
              }
              if (risk?.destructive && risk.risk !== "L3_HIGH_IMPACT_WRITE") {
                if (!options.riskAdmission)
                  return result(
                    {
                      outcome: "REJECTED",
                      error: { code: "DESTRUCTIVE_RISK_ADMISSION_REQUIRED" },
                    },
                    true,
                  );
                const admission = await requestContext().boundary.run(() =>
                  options.riskAdmission!(
                    "ASSESS",
                    approved,
                    call,
                    requestContext().boundary.signal,
                  ),
                );
                if (admission.risk === "L3_HIGH_IMPACT_WRITE") {
                  risk = {
                    ...risk,
                    risk: "L3_HIGH_IMPACT_WRITE",
                    requiresTrustedConfirmation: true,
                    reasons: [
                      ...risk.reasons,
                      "Aggregate destructive targets require trusted approval",
                    ],
                  };
                  directWrite = false;
                  if (input.mode === "APPLY") {
                    const blocked = {
                      outcome: "NEEDS_CONFIRMATION",
                      authorizationRisk: risk,
                      error: { code: "AGGREGATE_TRUSTED_APPROVAL_REQUIRED" },
                      executed: false,
                      approvalGranted: false,
                    };
                    emit(
                      "RISK_ADMISSION_BLOCKED",
                      { call, phase: "ASSESS", output: blocked },
                      c.capabilityId,
                    );
                    return result(blocked, true);
                  }
                }
              }
              const firstParty =
                !directWrite &&
                c.capabilityId ===
                  (options.operationApprovalCapability ?? "otr.trip.update")
                  ? options.operationApproval
                  : undefined;
              if (options.requireFirstPartyL3 && risk?.risk === "L3_HIGH_IMPACT_WRITE" &&
                  !firstParty && input.mode === "APPLY")
                return result({
                  outcome: "NEEDS_CONFIRMATION",
                  capabilityId: c.capabilityId,
                  error: { code: "FIRST_PARTY_APPROVAL_UNAVAILABLE" },
                  executed: false,
                }, true);
              if (input.mode !== "APPLY") {
                const approvalLink = firstParty
                  ? await requestContext().boundary.run(() =>
                      firstParty.prepare(
                        approved,
                        call,
                        requestContext().boundary.signal,
                      ),
                    )
                  : undefined;
                emit(
                  "PREVIEW",
                  {
                    call,
                    approval: recordableApproval,
                    verifiedGrantExpiresAt: requestContext().auth.expiresAt,
                    verifiedGrantScopes: requestContext().auth.scopes,
                    ...(approvalLink ? { firstParty: approvalLink } : {}),
                  },
                  c.capabilityId,
                );
                return result({
                  outcome: "PREVIEW",
                  ...(risk ? { authorizationRisk: risk } : {}),
                  capabilityId: c.capabilityId,
                  previewDigest: approved.digest,
                  summary: approved.summary,
                  operationIds: approved.operationIds,
                  call,
                  ...(approvalLink
                    ? { approval: approvalLink, confirmationChannel: "OTR_FIRST_PARTY" }
                    : {}),
                });
              }
              if (input.previewDigest !== approved.digest)
                return result(
                  {
                    outcome: directWrite ? "NEEDS_PREVIEW" : "NEEDS_CONFIRMATION",
                    capabilityId: c.capabilityId,
                  },
                  true,
                );
              if (risk?.destructive && directWrite) {
                const admission = await requestContext().boundary.run(() =>
                  options.riskAdmission!(
                    "RESERVE",
                    approved,
                    call,
                    requestContext().boundary.signal,
                  ),
                );
                if (admission.risk !== "L2_SENSITIVE_WRITE" || !admission.reserved) {
                  const blocked = {
                    outcome: "NEEDS_CONFIRMATION",
                    error: { code: "AGGREGATE_TRUSTED_APPROVAL_REQUIRED" },
                    executed: false,
                    approvalGranted: false,
                  };
                  emit(
                    "RISK_ADMISSION_BLOCKED",
                    { call, phase: "RESERVE", output: blocked },
                    c.capabilityId,
                  );
                  return result(blocked, true);
                }
              }
              let allowed: boolean;
              if (directWrite) {
                allowed = true;
                emit(
                  "RISK_WRITE_AUTHORIZED",
                  {
                    call,
                    authorizationRisk: risk,
                    authorizationBasis:
                      "CURRENT_OAUTH_WRITE_SCOPE_AND_OWNING_ACL_CAS_VALIDATION",
                  },
                  c.capabilityId,
                );
              } else if (firstParty) {
                const checked = await requestContext().boundary.run(() =>
                  firstParty.check(approved, call, requestContext().boundary.signal),
                );
                const matches =
                  checked.binding.accountId === approved.accountId &&
                  checked.binding.clientId === approved.clientId &&
                  checked.binding.resource === approved.resource &&
                  checked.binding.digest === approved.digest &&
                  JSON.stringify(checked.binding.operationIds) ===
                    JSON.stringify(approved.operationIds);
                if (
                  !checked.approved ||
                  checked.state !== "APPROVED" ||
                  !checked.decisionAt ||
                  !matches ||
                  !checked.id ||
                  !(Date.parse(checked.expiresAt ?? "") > Date.now())
                )
                  return result(
                    {
                      outcome: "NEEDS_CONFIRMATION",
                      capabilityId: c.capabilityId,
                      error: { code: "FIRST_PARTY_APPROVAL_REQUIRED" },
                      approval: checked,
                    },
                    true,
                  );
                allowed = true;
                emit(
                  "CONFIRM_BOUND_ACCEPTED",
                  {
                    call,
                    approval: recordableApproval,
                    verifiedBinding: checked.binding,
                    approvalId: checked.id,
                    decisionAt: checked.decisionAt,
                    expiresAt: checked.expiresAt,
                    protocol: "FIRST_PARTY_OPERATION_APPROVAL",
                  },
                  c.capabilityId,
                );
              } else if (options.confirm)
                allowed = await requestContext().boundary.run(() =>
                  options.confirm!(approved, requestContext().boundary.signal),
                );
              else {
                if (!ctx.mcpReq.envelope && !ctx.sessionId)
                  return result(
                    {
                      outcome: "REJECTED",
                      error: {
                        code: "CONFIRMATION_PROTOCOL_REQUIRED",
                        supportedProtocol: "2026-07-28",
                      },
                    },
                    true,
                  );
                const state =
                  ctx.mcpReq.requestState<ReturnType<typeof confirmationCodec.verify>>();
                if (
                  state &&
                  (state.digest !== approved.digest ||
                    state.accountId !== approved.accountId ||
                    state.clientId !== approved.clientId ||
                    state.resource !== approved.resource ||
                    JSON.stringify(state.operationIds) !==
                      JSON.stringify(approved.operationIds))
                )
                  return result(
                    {
                      outcome: "REJECTED",
                      error: { code: "CONFIRMATION_BINDING_MISMATCH" },
                    },
                    true,
                  );
                const response = inputResponse(
                  ctx.mcpReq.inputResponses,
                  "approveMutation",
                );
                if (state && response.kind === "elicit" && response.action !== "accept")
                  return result(
                    { outcome: "REJECTED", error: { code: "USER_DECLINED" } },
                    true,
                  );
                const answer = acceptedContent(
                  ctx.mcpReq.inputResponses,
                  "approveMutation",
                  confirmationSchema,
                );
                if (!state || !answer) {
                  emit(
                    "CONFIRM_REQUESTED",
                    { call, approval: recordableApproval, protocol: "STANDARD_MCP_ELICITATION" },
                    c.capabilityId,
                  );
                  return inputRequired({
                    requestState: confirmationCodec.mint(
                      approved,
                      Math.min(requestContext().auth.expiresAt, Date.now() + 300000),
                    ),
                    inputRequests: {
                      approveMutation: inputRequired.elicit({
                        message: approved.summary,
                        requestedSchema: {
                          type: "object",
                          properties: {
                            approve: {
                              type: "boolean",
                              title: t("mcp.confirmExactChanges"),
                            },
                          },
                          required: ["approve"],
                        },
                      }),
                    },
                  });
                }
                allowed = answer.approve === true;
                if (allowed)
                  emit(
                    "CONFIRM_BOUND_ACCEPTED",
                    {
                      call,
                      approval: recordableApproval,
                      verifiedBinding: state,
                      protocol: "STANDARD_MCP_ELICITATION",
                    },
                    c.capabilityId,
                  );
              }
              if (!allowed)
                return result(
                  { outcome: "REJECTED", error: { code: "USER_DECLINED" } },
                  true,
                );
            }
            if (!active()) return result({ error: { code: "AUTH_REQUIRED" } }, true);
            if (!requestContext().auth.betaBackend)
              return result(
                { error: { code: "ACCOUNT_BOUND_BACKEND_UNAVAILABLE" } },
                true,
              );
            if (write)
              emit(
                "APPLY_DISPATCHED",
                { call, operationId: operation, downstream },
                c.capabilityId,
              );
            if (write && !captureReady()) return captureUnavailable();
            sent = write;
            const response = await requestContext().boundary.run(() =>
              requestContext().auth.betaBackend!(
                downstream,
                requestContext().boundary.signal,
              ),
            );
            const body = await readBoundedJson(
              response,
              8388608,
              requestContext().boundary,
            );
            emit(
              "SERVER_RESPONSE",
              {
                call,
                operationId: operation,
                httpStatus: response.status,
                originalBody: body,
              },
              c.capabilityId,
            );
            const recovery = {
              capabilityId: c.capabilityId,
              idempotencyKey: operation ?? null,
              call,
            };
            const metadataLeaseBusy =
              write && options.preserveCompletedWriteReceipt &&
              c.capabilityId === "otr.trip.update" && response.status === 503 &&
              z.object({ error: z.object({ code: z.literal("TRIP_METADATA_LEASE_BUSY") }) })
                .safeParse(body).success;
            const owningDecision =
              write &&
              options.preserveCompletedWriteReceipt &&
              (response.ok || metadataLeaseBusy ||
                (response.status === 401 &&
                  z
                    .object({
                      error: z.object({ code: z.literal("MCP_WRITE_ADMISSION_DENIED") }),
                    })
                    .safeParse(body).success));
            if (!active(!owningDecision))
              return result(
                {
                  outcome: write ? "UNKNOWN" : "UNAVAILABLE",
                  error: { code: "AUTH_REQUIRED" },
                  ...(write ? { recovery } : {}),
                },
                true,
              );
            if (!response.ok)
              return result(
                {
                  outcome:
                    write && response.status >= 500 && !metadataLeaseBusy
                      ? "UNKNOWN"
                      : response.status === 409
                        ? "CONFLICT"
                        : "REJECTED",
                  httpStatus: response.status,
                  error: body,
                  ...(write ? { recovery } : {}),
                },
                true,
              );
            // Validate without replacing the original owning receipt with a parsed/model result.
            betaResponseSchema(c.capabilityId).parse(body);
            return result({
              outcome: "SERVER_RESPONSE",
              capabilityId: c.capabilityId,
              httpStatus: response.status,
              result: body,
            });
          } catch (error) {
            const missingStartDate =
              !sent &&
              error instanceof Error &&
              error.message === "CORE_START_LOCAL_DATE_REQUIRED";
            const missingServiceIdentity =
              !sent &&
              error instanceof Error &&
              (error.message === "CORE_P5_SERVICE_IDENTITY_REQUIRED" ||
                (error instanceof z.ZodError &&
                  error.issues.some(
                    (issue) => issue.message === "INVALID_TRANSPORT_IDENTITY",
                  )));
            return result(
              {
                outcome: sent ? "UNKNOWN" : "REJECTED",
                error: {
                  code: missingServiceIdentity
                    ? "CORE_P5_SERVICE_IDENTITY_REQUIRED"
                    : missingStartDate
                      ? "CORE_START_LOCAL_DATE_REQUIRED"
                      : sent
                        ? "QUERY_ORIGINAL_OPERATION"
                        : "INVALID_OR_UNAVAILABLE_CALL",
                  ...(missingStartDate
                    ? { field: "request.payload.schedule.start.local_date" }
                    : {}),
                  ...(missingServiceIdentity
                    ? {
                        fields: p5ServiceIdentityFields.map(
                          (field) => "request.payload.service." + field,
                        ),
                      }
                    : {}),
                },
                ...(sent
                  ? {
                      recovery: {
                        call: input.call,
                        idempotencyKey: input.idempotencyKey,
                      },
                    }
                  : {}),
              },
              true,
            );
          }
        },
      );
    }
    return server;
  };
  const handler = async (request: Request): Promise<Response> => {
    const meta = options.oauth?.handle(request);
    if (meta) return meta;
    const reply = (status: number, code: string) =>
      Response.json(
        { error: { code } },
        {
          status,
          headers: {
            "Cache-Control": "private, no-store",
            Vary: "Authorization",
            ...(status === 401
              ? { "WWW-Authenticate": options.oauth?.challenge ?? "Bearer" }
              : {}),
          },
        },
      );
    if (request.url !== options.resource) return reply(404, "NOT_FOUND");
    if (!["POST", "GET", "DELETE"].includes(request.method))
      return reply(405, "METHOD_NOT_ALLOWED");
    const boundary = createRequestBoundary(55000, request.signal);
    let server: McpServer | undefined;
    let retainedBoundary = false;
    try {
      const verified = await boundary.run(async () => options.authorize?.(request));
      const auth = verified &&
        verified.resource === options.resource &&
        verified.clientId &&
        verified.expiresAt > Date.now() &&
        verified.scopes.includes("otr.trips.read") ? verified : undefined;
      const discovery = !auth && request.method === "POST" ? options.discoveryIdentity?.(request) : undefined;
      const transportIdentity = auth ?? (
        discovery?.resource === options.resource && discovery.clientId && discovery.expiresAt > Date.now() &&
        discoveryRequest.safeParse(await readBoundedJson(new Response(request.clone().body), 16384, boundary)
          .catch(() => undefined)).success ? discovery : undefined
      );
      if (!transportIdentity)
        return (await options.unapproved?.(request, boundary.signal)) ?? reply(401, "AUTH_REQUIRED");
      const bytes =
        request.method === "POST"
          ? await readBoundedBytes(request, 1048576, boundary)
          : undefined;
      const wireBytes = bytes && options.legacyTripRead ? adaptLegacyTripRead(bytes) : bytes;
      const headers = new Headers(request.headers);
      if (wireBytes && wireBytes !== bytes) headers.set("content-length", String(wireBytes.byteLength));
      const wireRequest = new Request(request.url, {
        method: request.method,
        headers,
        ...(wireBytes ? { body: Buffer.from(wireBytes) } : {}),
        signal: boundary.signal,
      });
      const dispatch = async () => {
        if (auth && options.evidence && bytes) {
          try {
            const rpc = JSON.parse(new TextDecoder().decode(bytes));
            const meta = rpc?.params?._meta;
            const modern = meta?.["io.modelcontextprotocol/clientCapabilities"];
            const declared =
              modern ??
              (rpc?.method === "initialize" ? rpc?.params?.capabilities : undefined);
            const elicitation = declared?.elicitation;
            emit("CLIENT_CAPABILITIES", {
              source:
                modern !== undefined
                  ? "MODERN_REQUEST_META"
                  : declared !== undefined
                    ? "INITIALIZE"
                    : "ABSENT_ON_THIS_REQUEST",
              protocol: String(
                meta?.["io.modelcontextprotocol/protocolVersion"] ??
                  rpc?.params?.protocolVersion ??
                  wireRequest.headers.get("MCP-Protocol-Version") ??
                  "",
              ).slice(0, 64),
              declarationFound: declared !== undefined,
              uiExtension: declared?.extensions?.["io.modelcontextprotocol/ui"] ?? null,
              elicitationPresent: !!elicitation && typeof elicitation === "object",
              formExplicit: !!elicitation?.form && typeof elicitation.form === "object",
              formImplicit:
                !!elicitation &&
                typeof elicitation === "object" &&
                Object.keys(elicitation).length === 0,
              urlExplicit: !!elicitation?.url && typeof elicitation.url === "object",
            });
          } catch {
            /* malformed negotiation evidence cannot change request handling */
          }
        }
        const legacyResponse = await legacy.handle(wireRequest, transportIdentity, buildServer);
        if (legacyResponse) {
          retainedBoundary = true;
          const reader = legacyResponse.body?.getReader();
          if (!reader) {
            boundary.close();
            return legacyResponse;
          }
          const body = new ReadableStream<Uint8Array>({
            async pull(controller) {
              try {
                const next = await boundary.run(() => reader.read());
                if (next.done) {
                  controller.close();
                  boundary.close();
                } else controller.enqueue(next.value);
              } catch (error) {
                controller.error(error);
                boundary.close();
                await reader.cancel().catch(() => undefined);
              }
            },
            async cancel(reason) {
              boundary.close();
              await reader.cancel(reason);
            },
          });
          return new Response(body, {
            status: legacyResponse.status,
            headers: {
              ...Object.fromEntries(legacyResponse.headers),
              "Cache-Control": "private, no-store",
              Vary: "Authorization",
            },
          });
        }
        if (request.method !== "POST") return reply(405, "METHOD_NOT_ALLOWED");
        server = buildServer();
        const sdkHandler = createSdkMcpHandler(() => server!, {
          responseMode: "auto",
          maxRequestBodySize: 1048576,
        });
        const response = await boundary.run(() => sdkHandler.fetch(wireRequest));
        const body = await boundary.run(() => response.arrayBuffer());
        return new Response(body, {
          status: response.status,
          headers: {
            ...Object.fromEntries(response.headers),
            "Cache-Control": "private, no-store",
            Vary: "Authorization",
          },
        });
      };
      // A verified pending session can load descriptors. It has no business-call context.
      return await (auth ? requestScope.run({ auth, boundary }, dispatch) : dispatch());
    } catch {
      return reply(boundary.signal.aborted ? 504 : 503, "MCP_REQUEST_UNAVAILABLE");
    } finally {
      await server?.close();
      if (!retainedBoundary) boundary.close();
    }
  };
  return Object.assign(handler, { close: () => legacy.close() });
}
