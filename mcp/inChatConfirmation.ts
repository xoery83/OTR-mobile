import { createRequestBoundary, readBoundedJson } from "../src/data/api/requestBoundary";
import { randomBytes, randomUUID, createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { McpServer, CallToolResult } from "@modelcontextprotocol/server";
import type { McpAuthorization } from "./server";
import { contentDigest } from "./mutation";
import { tripMetadataRevisionedSnapshotSchema } from "../src/domain/trip/tripMetadataV2Contract";
export const IN_CHAT_URI = "ui://otr/operation-confirmation-probe-v1.html";
export const IN_CHAT_RENDER = "preview_otr_in_chat_confirmation";
export const IN_CHAT_DECIDE = "otr_in_chat_confirmation_decide";
const decisionSchema = z.strictObject({
  handle: z.string().regex(/^[a-f0-9]{64}$/),
  operationId: z.uuid(),
  previewDigest: z.string().regex(/^[a-f0-9]{64}$/),
  decision: z.enum(["APPROVE", "DECLINE"]),
});
const hash = (value: string) => createHash("sha256").update(value).digest();
export function createInChatConfirmationProbe(options: {
  accountId: string;
  clientId: string;
  resource: string;
  tripId: string;
  html: string;
  audit(event: Record<string, unknown>): void;
  now?: () => number;
}) {
  const now = options.now ?? Date.now;
  type Pending = {
    preview: Record<string, unknown>;
    digest: string;
    nonceHash: Buffer;
    expiresAt: number;
    before: unknown;
    decision?: "APPROVE" | "DECLINE";
  };
  // Diagnostic only: bounded, process-private, restart fails closed; never used by a business writer.
  const pending = new Map<string, Pending>();
  function principal(auth: McpAuthorization) {
    if (
      auth.accountId !== options.accountId ||
      auth.clientId !== options.clientId ||
      auth.resource !== options.resource ||
      auth.expiresAt <= now() ||
      !["otr.trips.read", "otr.trips.write"].every((s) => auth.scopes.includes(s))
    )
      throw Error("IN_CHAT_AUTH_REQUIRED");
  }
  async function snapshot(auth: McpAuthorization, signal: AbortSignal) {
    principal(auth);
    signal.throwIfAborted();
    if (!auth.betaBackend) throw Error("IN_CHAT_BACKEND_REQUIRED");
    const response = await auth.betaBackend(
      {
        method: "GET",
        path: "/v2/trips/" + options.tripId + "/metadata",
        headers: { "OTR-Trip-Metadata-Version": "3" },
      },
      signal,
    );
    if (response.status !== 200) {
      await response.body?.cancel();
      throw Error("IN_CHAT_READ_REJECTED");
    }
    const boundary = createRequestBoundary(10000, signal);
    let value;
    try {
      value = tripMetadataRevisionedSnapshotSchema.parse(
        await readBoundedJson(response, 262144, boundary),
      );
    } finally {
      boundary.close();
    }
    signal.throwIfAborted();
    principal(auth);
    if (value.actorAccountId !== auth.accountId || value.tripId !== options.tripId)
      throw Error("IN_CHAT_READ_BINDING");
    return value;
  }
  async function prepare(
    auth: McpAuthorization,
    signal: AbortSignal,
  ): Promise<CallToolResult> {
    const current = await snapshot(auth, signal);
    if (pending.size >= 32) throw Error("IN_CHAT_PROBE_LIMIT_RESTART_REQUIRED");
    const operationId = randomUUID(),
      handle = randomBytes(32).toString("hex"),
      expiresAt = now() + 15 * 60 * 1000;
    const preview = {
      accountId: auth.accountId,
      clientId: auth.clientId,
      resource: auth.resource,
      tripId: options.tripId,
      operationId,
      idempotencyKey: operationId,
      expectedMetadataRevision: current.metadataRevision,
      before: current.metadata,
      after: { ...current.metadata, name: "Layer3 In-chat 01" },
      expiresAt: new Date(expiresAt).toISOString(),
      scope: "TRIP_NAME_ONLY_NO_BUSINESS_WRITE_PROTOTYPE",
    };
    const digest = contentDigest(preview);
    pending.set(operationId, {
      preview,
      digest,
      nonceHash: hash(handle),
      expiresAt,
      before: current,
    });
    options.audit({ event: "IN_CHAT_PREVIEW", preview, previewDigest: digest });
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            outcome: "IN_CHAT_CONFIRMATION_PROTOTYPE",
            preview,
            previewDigest: digest,
            businessWriterEnabled: false,
          }),
        },
      ],
      structuredContent: { preview, previewDigest: digest, businessWriterEnabled: false },
      _meta: { "otr/confirmation": { handle, preview, previewDigest: digest } },
    };
  }
  async function decide(
    auth: McpAuthorization,
    raw: unknown,
    signal: AbortSignal,
  ): Promise<CallToolResult> {
    principal(auth);
    const input = decisionSchema.parse(raw),
      row = pending.get(input.operationId);
    if (
      !row ||
      !timingSafeEqual(row.nonceHash, hash(input.handle)) ||
      row.digest !== input.previewDigest ||
      row.expiresAt <= now()
    )
      throw Error("IN_CHAT_APPROVAL_INVALID_OR_EXPIRED");
    if (row.decision && row.decision !== input.decision)
      throw Error("IN_CHAT_DECISION_FINAL");
    const current = await snapshot(auth, signal);
    if (contentDigest(current) !== contentDigest(row.before))
      throw Error("IN_CHAT_STALE_REVISION");
    if (row.decision && row.decision !== input.decision)
      throw Error("IN_CHAT_DECISION_FINAL");
    if (!row.decision) {
      // No await between final recheck and once-only diagnostic transition.
      if (row.expiresAt <= now()) throw Error("IN_CHAT_APPROVAL_INVALID_OR_EXPIRED");
      options.audit({
        event: "IN_CHAT_DECISION",
        operationId: input.operationId,
        previewDigest: row.digest,
        decision: input.decision,
        accountId: auth.accountId,
        clientId: auth.clientId,
        resource: auth.resource,
        businessWrite: false,
      });
      row.decision = input.decision;
    }
    const result = {
      outcome:
        row.decision === "APPROVE"
          ? "PROTOTYPE_APPROVED_NOT_APPLIED"
          : "PROTOTYPE_DECLINED",
      operationId: input.operationId,
      previewDigest: row.digest,
      businessWriterEnabled: false,
    };
    return {
      content: [{ type: "text", text: JSON.stringify(result) }],
      structuredContent: result,
    };
  }
  function register(
    server: McpServer,
    get: () => { auth: McpAuthorization; signal: AbortSignal },
  ) {
    server.registerResource(
      "otr-in-chat-confirmation",
      IN_CHAT_URI,
      { mimeType: "text/html;profile=mcp-app" },
      async (uri) => {
        principal(get().auth);
        options.audit({ event: "IN_CHAT_RESOURCE_READ", uri: uri.href });
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "text/html;profile=mcp-app",
              text: options.html,
              _meta: {
                ui: {
                  prefersBorder: true,
                  csp: { connectDomains: [], resourceDomains: [] },
                },
                "openai/widgetCSP": { connect_domains: [], resource_domains: [] },
              },
            },
          ],
        };
      },
    );
    const wrap = (work: () => Promise<CallToolResult>) =>
      work().catch(() => ({
        isError: true,
        content: [{ type: "text" as const, text: "IN_CHAT_CONFIRMATION_REJECTED" }],
      }));
    server.registerTool(
      IN_CHAT_RENDER,
      {
        description:
          "Display the OTR inline confirmation prototype inside this ChatGPT conversation. Reads the fixed synthetic Trip and prepares a trusted name-change preview; clicking Approve or Decline records only a diagnostic decision. No business writer or external page. Do not use update_trip APPLY in this prototype.",
        inputSchema: z.strictObject({}),
        annotations: { readOnlyHint: true, openWorldHint: false },
        _meta: { ui: { resourceUri: IN_CHAT_URI }, "openai/outputTemplate": IN_CHAT_URI },
      },
      async () => wrap(() => prepare(get().auth, get().signal)),
    );
    server.registerTool(
      IN_CHAT_DECIDE,
      {
        description:
          "Component-only exact diagnostic decision; unavailable to model; never writes Trip.",
        inputSchema: decisionSchema,
        annotations: {
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
        _meta: {
          ui: { visibility: ["app"] },
          "openai/visibility": "private",
          "openai/widgetAccessible": true,
        },
      },
      async (input) => wrap(() => decide(get().auth, input, get().signal)),
    );
  }
  return { prepare, decide, register };
}
