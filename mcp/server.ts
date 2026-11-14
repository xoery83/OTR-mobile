import {
  createMutationTools,
  mutationIdentity,
  contentDigest,
  prepareCreate,
  prepareUpdate,
  prepareTrip,
  type PreparedMutation,
  type BackendMutation,
  type ConfirmChanges,
} from "./mutation";
import { createBatchTools } from "./batch";
import { assistantInstructions, guideInput, guideOutput, readGuide } from "./guide";
import { materialReviewInput, materialReviewOutput, reviewWithReads } from "./reconcile";
import { guardSourcePreservation } from "./preservation";
import { registerTaskDomainTools, type BindTaskDomains } from "./domainToolRegistry";
import {
  fieldCreateInput,
  fieldUpdateInput,
  prepareFieldCreate,
  prepareFieldUpdate,
  assistantChangesInput,
  assistantApplyInput,
  assistantBatchOutput,
  prepareAssistantChange,
} from "./fieldAdapter";
import {
  createItemInput,
  updateItemInput,
  createTripInput,
  operationInput,
  operationOutput,
  mutationOutput,
  previewChangesInput,
  applyChangesInput,
  batchOutput,
  type MutationResult,
} from "./mutationContract";
import { randomUUID } from "node:crypto";
import {
  type CallToolResult,
  McpServer,
  WebStandardStreamableHTTPServerTransport,
} from "@modelcontextprotocol/server";
import { z } from "zod";
import {
  createRequestBoundary,
  readBoundedBytes,
  RequestBoundaryError,
} from "../src/data/api/requestBoundary";
import {
  createReadTools,
  ReadError,
  type BackendRead,
  type ReadAuthFailureSource,
} from "./read";
import {
  listTripsInput,
  tripInput,
  listItemsInput,
  itemInput,
  tripsOutput,
  tripOutput,
  itemsOutput,
  itemOutput,
  itemEditBaseOutput,
} from "./contract";

function expiredApplyRecovery(accountId: string, name: string, args: unknown) {
  const unknown = (prepared: PreparedMutation): MutationResult => ({
    ...mutationIdentity(accountId, prepared),
    summary: "",
    outcome: "UNKNOWN",
    error_code: "AUTH_REQUIRED_QUERY_SAME_OPERATION",
  });
  // Derive only from validated caller input, never from an expired business result.
  try {
    if (name === "create_trip") {
      const q = createTripInput.parse(args);
      return q.mode === "APPLY" ? unknown(prepareTrip(accountId, q)) : null;
    }
    if (name === "create_trip_item") {
      const q = createItemInput.parse(args);
      return q.mode === "APPLY" ? unknown(prepareCreate(accountId, q)) : null;
    }
    if (name === "create_trip_item_fields") {
      const q = fieldCreateInput.parse(args);
      return q.mode === "APPLY" ? unknown(prepareFieldCreate(accountId, q)) : null;
    }
    if (name === "update_trip_item_fields") {
      const q = fieldUpdateInput.parse(args);
      return q.mode === "APPLY" ? unknown(prepareFieldUpdate(q)) : null;
    }
    if (name === "update_trip_item") {
      const q = updateItemInput.parse(args);
      return q.mode === "APPLY" ? unknown(prepareUpdate(accountId, q)) : null;
    }
    if (name === "apply_trip_changes") {
      const q = assistantApplyInput.parse(args);
      return assistantBatchOutput.parse({
        version: "otr.mcp.batch/1",
        trip_id: q.trip_id,
        preview_digest: q.preview_digest,
        outcome: "UNKNOWN",
        operations: q.changes.map((change) => {
          const { kind, ...rest } = change;
          return unknown(
            prepareAssistantChange(accountId, q.trip_id, change) ??
              (kind === "CREATE"
                ? prepareCreate(accountId, { ...rest, trip_id: q.trip_id })
                : prepareUpdate(accountId, { ...rest, trip_id: q.trip_id })),
          );
        }),
        review_basis: "CURRENT_VISIBLE_COLLECTION_AND_UPDATE_DETAILS",
        review: [],
        warnings: ["AUTH_REQUIRED_QUERY_SAME_OPERATION"],
      });
    }
  } catch {
    // Invalid input has no qualified recovery identity.
  }
  return null;
}

// Auth owner verifies issuer/signature/resource/expiry/revocation/client consent before returning this context.
export type McpAuthorization = {
  accountId: string;
  resource: string;
  scopes: readonly string[];
  expiresAt: number;
  read: BackendRead;
  clientId?: string;
  backend?: BackendMutation;
};
export type McpLogEvent = {
  requestId: string;
  status: number;
  durationMs: number;
  tool?: string;
  errorCode?: string;
  authFailureSource?: ReadAuthFailureSource;
  responseProof?: {
    version: "otr.mcp.response-proof/1";
    kind: "EDIT_BASE" | "PREVIEW";
    inputSHA256: string;
    outputSHA256: string;
    previewDigest?: string;
  };
};
export type McpOptions = {
  resource: string;
  // Independent Phase4 candidate. Owning host must explicitly enable after review.
  taskAssistant?: boolean;
  toolProfile?: "SLICE1_NOTES_EDIT" | "P3_STAY_QA";
  bindTaskDomains?: BindTaskDomains;
  authorize?: (request: Request) => Promise<McpAuthorization | null>;
  confirm?: ConfirmChanges;
  oauth?: {
    metadataUrl: string;
    authorizationScopes?: { read: readonly string[]; write?: readonly string[] };
    challenge: string;
    handle(request: Request): Response | null;
  };
  log?: (event: McpLogEvent) => void;
};
export function createMcpHandler(options: McpOptions) {
  const notesOnly = options.toolProfile === "SLICE1_NOTES_EDIT";
  const p3Only = options.toolProfile === "P3_STAY_QA";
  const assistantEnabled = notesOnly || p3Only || options.taskAssistant === true;
  const stayCreateInput = p3Only
    ? createItemInput.safeExtend({
        item: createItemInput.shape.item.safeExtend({ family: z.literal("P3") }),
      })
    : createItemInput;
  const editInput = notesOnly
    ? updateItemInput.safeExtend({
        change: z.strictObject({
          kind: z.literal("TEXT"),
          notes: z
            .string()
            .min(1)
            .max(5000)
            .refine((value) => value.trim().length > 0, "Notes cannot be cleared"),
        }),
      })
    : p3Only
      ? updateItemInput.safeExtend({
          change: z.discriminatedUnion("kind", [
            updateItemInput.shape.change.options[0],
            updateItemInput.shape.change.options[1],
            updateItemInput.shape.change.options[2],
          ]),
        })
      : updateItemInput;
  const resource = new URL(options.resource);
  if (
    (resource.protocol !== "https:" &&
      !(
        resource.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(resource.hostname)
      )) ||
    resource.pathname !== "/mcp" ||
    resource.search ||
    resource.hash ||
    resource.username ||
    resource.password
  )
    throw Error("INVALID_MCP_RESOURCE");
  const readScopes = options.oauth?.authorizationScopes?.read ?? ["otr.trips.read"];
  const writeScopes = options.oauth?.authorizationScopes?.write ?? [
    "otr.trips.read",
    "otr.trips.write",
  ];
  const writesEnabled =
    !options.oauth?.authorizationScopes || !!options.oauth.authorizationScopes.write;
  const authError = (scopes: readonly string[], expired = false): CallToolResult => ({
    isError: true,
    content: [{ type: "text", text: expired ? "AUTH_REQUIRED" : "WRITE_SCOPE_REQUIRED" }],
    _meta: {
      "mcp/www_authenticate": [
        `Bearer ${options.oauth ? `resource_metadata="${options.oauth.metadataUrl}", ` : ""}error="${expired ? "invalid_token" : "insufficient_scope"}", error_description="${expired ? "Authorization expired; reconnect OTR" : "Authorize the requested OTR tool scopes"}", scope="${(scopes.includes("otr.trips.write") ? writeScopes : readScopes).join(" ")}"`,
      ],
    },
  });
  return async (request: Request): Promise<Response> => {
    const metadata = options.oauth?.handle(request);
    if (metadata) return metadata;
    const started = Date.now(),
      requestId = randomUUID();
    const boundary = createRequestBoundary(60000, request.signal);
    let mutationBoundary: ReturnType<typeof createRequestBoundary> | undefined;
    let status = 503;
    let invokedTool: string | undefined;
    let toolError: string | undefined;
    let authFailureSource: ReadAuthFailureSource | undefined;
    let responseProof: McpLogEvent["responseProof"];
    let singleReadAuthRequired = false;
    const reply = (code: number, error: string) =>
      new Response(JSON.stringify({ error }), { status: code });
    try {
      const url = new URL(request.url);
      let response: Response;
      if (url.origin !== resource.origin || url.pathname !== "/mcp" || url.search)
        response = reply(404, "NOT_FOUND");
      else if (
        request.headers.has("origin") &&
        request.headers.get("origin") !== resource.origin
      )
        response = reply(403, "ORIGIN_DENIED");
      else if (request.method !== "POST") response = reply(405, "METHOD_NOT_ALLOWED");
      else {
        const auth = await boundary.run(
          async () =>
            options.authorize?.(
              new Request(request.url, {
                method: request.method,
                headers: request.headers,
                signal: boundary.signal,
              }),
            ) ?? null,
        );
        if (
          !auth ||
          !z.uuid().safeParse(auth.accountId).success ||
          auth.resource !== options.resource ||
          !Number.isFinite(auth.expiresAt) ||
          auth.expiresAt <= Date.now()
        )
          response = reply(401, "AUTH_REQUIRED");
        else if (!auth.scopes.includes("otr.trips.read")) {
          response = reply(403, "INSUFFICIENT_SCOPE");
          response.headers.set(
            "WWW-Authenticate",
            `${options.oauth?.challenge ?? "Bearer"}, error="insufficient_scope", error_description="OTR Trip Read grant required"`,
          );
        } else {
          const bytes = await readBoundedBytes(
            { body: request.body },
            assistantEnabled ? 131072 : 16384,
            boundary,
          );
          const tools = createReadTools(auth.accountId, auth.read, boundary.signal);
          const server = new McpServer(
            { name: "otr", version: "0.4.0" },
            assistantEnabled ? { instructions: assistantInstructions } : {},
          );
          const domains =
            assistantEnabled && !notesOnly && !p3Only && options.bindTaskDomains
              ? await registerTaskDomainTools(
                  server,
                  {
                    accountId: auth.accountId,
                    clientId: auth.clientId ?? "",
                    resource: options.resource,
                    scopes: auth.scopes,
                    expiresAt: auth.expiresAt,
                  },
                  options.bindTaskDomains,
                  boundary.signal,
                  { read: readScopes, ...(writesEnabled ? { write: writeScopes } : {}) },
                  options.confirm,
                  (readOnly) =>
                    authError(readOnly ? ["otr.trips.read"] : ["otr.trips.write"], true),
                )
              : { names: [] as string[] };
          if (assistantEnabled)
            server.registerTool(
              "get_otr_operating_guide",
              {
                inputSchema: guideInput,
                outputSchema: guideOutput,
                description:
                  "Start here before organizing travel attachments. Read OPERATING, FIELDS and CAPABILITIES to learn OTR semantics, reconciliation, legal tools and recovery. Read-only; no business writes.",
                _meta: { securitySchemes: [{ type: "oauth2", scopes: readScopes }] },
                annotations: {
                  readOnlyHint: true,
                  destructiveHint: false,
                  idempotentHint: true,
                  openWorldHint: false,
                },
              },
              async (args: unknown): Promise<CallToolResult> => {
                invokedTool = "get_otr_operating_guide";
                if (auth.expiresAt <= Date.now())
                  return authError(["otr.trips.read"], true);
                const output = readGuide(args, {
                  writes:
                    !!auth.backend &&
                    writesEnabled &&
                    !!auth.clientId &&
                    auth.scopes.includes("otr.trips.write"),
                  receipts: !!auth.backend,
                  domains: domains.names,
                  notesOnly,
                  p3Only,
                });
                return {
                  content: [{ type: "text", text: JSON.stringify(output) }],
                  structuredContent: output,
                };
              },
            );
          if (assistantEnabled && !notesOnly)
            server.registerTool(
              "review_travel_materials",
              {
                inputSchema: materialReviewInput,
                outputSchema: materialReviewOutput,
                description:
                  "Read existing OTR Items and review source-linked candidate facts extracted by your client. Inventory, amendments, conflicts, field coverage and create/update suggestions only; no evidence Admission or writes. Read get_otr_operating_guide first. People/Expense review uses only currently authorized connected readers.",
                _meta: { securitySchemes: [{ type: "oauth2", scopes: readScopes }] },
                annotations: {
                  readOnlyHint: true,
                  destructiveHint: false,
                  idempotentHint: true,
                  openWorldHint: false,
                },
              },
              async (args: unknown): Promise<CallToolResult> => {
                invokedTool = "review_travel_materials";
                try {
                  if (auth.expiresAt <= Date.now())
                    return authError(["otr.trips.read"], true);
                  const output = await boundary.run(() =>
                    reviewWithReads(args, tools, {
                      accountId: auth.accountId,
                      readExpenses: domains.readExpenses,
                      readRoster: domains.readRoster,
                    }),
                  );
                  if (auth.expiresAt <= Date.now())
                    return authError(["otr.trips.read"], true);
                  return {
                    content: [{ type: "text", text: JSON.stringify(output) }],
                    structuredContent: output,
                  };
                } catch (error) {
                  if (
                    auth.expiresAt <= Date.now() ||
                    (error instanceof ReadError && error.code === "AUTH_REQUIRED")
                  )
                    return authError(["otr.trips.read"], true);
                  return {
                    isError: true,
                    content: [
                      {
                        type: "text",
                        text:
                          error instanceof ReadError
                            ? error.code
                            : "INVALID_MATERIAL_REVIEW",
                      },
                    ],
                  };
                }
              },
            );
          const definitions = [
            ...(assistantEnabled
              ? [
                  [
                    "get_trip_item_edit_base",
                    itemInput,
                    itemEditBaseOutput,
                    "Read the complete lawful Item record and children/field_state from the existing verified Core collection, plus current Item DTO. Full Details canEdit is object-management eligibility, not runtime, Consent or command authorization; legacy closed projections are not a fresh permission result. Preserve returned flags and read the Operating Guide. Redacted evidence is not absent evidence. Do not modify this read base or assume any preservation mutation is available.",
                  ] as const,
                ]
              : []),
            [
              "list_trips",
              listTripsInput,
              tripsOutput,
              "List authorized server-confirmed Trips; UUID cursor order.",
            ],
            [
              "get_trip",
              tripInput,
              tripOutput,
              "Read authorized Trip basic information.",
            ],
            [
              "list_trip_items",
              listItemsInput,
              itemsOutput,
              "List accepted P1–P6 Items by inclusive local-date overlap; UUID order, not Day Feed order.",
            ],
            [
              "get_trip_item",
              itemInput,
              itemOutput,
              "Read an authorized accepted Item, retaining its type and temporal semantics.",
            ],
          ] as const;
          let singleReadCall = false;
          try {
            const message = JSON.parse(Buffer.from(bytes).toString("utf8"));
            singleReadCall =
              !Array.isArray(message) &&
              message?.jsonrpc === "2.0" &&
              (typeof message.id === "string" || typeof message.id === "number") &&
              message.method === "tools/call" &&
              definitions.some(([name]) => message.params?.name === name);
          } catch {
            /* The SDK retains malformed-request validation. */
          }
          for (const [name, inputSchema, outputSchema, description] of definitions) {
            server.registerTool(
              name,
              {
                inputSchema,
                outputSchema,
                description,
                _meta: {
                  securitySchemes: [{ type: "oauth2", scopes: readScopes }],
                },
                annotations: {
                  readOnlyHint: true,
                  destructiveHint: false,
                  idempotentHint: true,
                  openWorldHint: false,
                },
              },
              async (args: unknown): Promise<CallToolResult> => {
                invokedTool = name;
                try {
                  if (auth.expiresAt <= Date.now())
                    throw new ReadError("AUTH_REQUIRED", "EXPIRED_BEFORE_BACKEND");
                  const output = await boundary.run(async () => await tools[name](args));
                  if (auth.expiresAt <= Date.now())
                    throw new ReadError("AUTH_REQUIRED", "EXPIRED_AFTER_BACKEND");
                  return {
                    content: [{ type: "text", text: JSON.stringify(output) }],
                    structuredContent: output,
                  };
                } catch (error) {
                  const code =
                    error instanceof ReadError ? error.code : "BACKEND_UNAVAILABLE";
                  toolError = code;
                  if (error instanceof ReadError)
                    authFailureSource = error.authFailureSource;
                  if (code === "AUTH_REQUIRED") {
                    singleReadAuthRequired = singleReadCall;
                    return authError(["otr.trips.read"], true);
                  }
                  return {
                    isError: true,
                    content: [
                      {
                        type: "text",
                        text: JSON.stringify({
                          version: "otr.mcp.read/1",
                          error: { code },
                        }),
                      },
                    ],
                  };
                }
              },
            );
          }
          if (auth.backend) {
            // Leave time to return partial receipts before the outer HTTP deadline.
            mutationBoundary = createRequestBoundary(
              Math.max(1, 50000 - (Date.now() - started)),
              boundary.signal,
            );
            const context = {
              accountId: auth.accountId,
              clientId: auth.clientId ?? "",
              resource: options.resource,
              backend: auth.backend,
              read: auth.read,
              signal: AbortSignal.any([
                mutationBoundary.signal,
                AbortSignal.timeout(Math.max(1, auth.expiresAt - Date.now())),
              ]),
              confirm: options.confirm,
              assistant: assistantEnabled,
              ...(assistantEnabled
                ? {
                    preservationGuard: async (prepared: PreparedMutation) => {
                      if (
                        p3Only &&
                        prepared.kind === "ITEM" &&
                        prepared.command.command !== "CREATE_ITEM"
                      ) {
                        const base = await tools.get_trip_item_edit_base({
                          trip_id: prepared.command.tripId,
                          item_id: prepared.command.target.id,
                        });
                        if (base.item.family !== "P3") return "P3_PROFILE_REQUIRED";
                      }
                      return guardSourcePreservation(prepared, tools);
                    },
                  }
                : {}),
            };
            const writes = createMutationTools(context),
              batch = createBatchTools(
                context,
                writes,
                createReadTools(auth.accountId, auth.read, context.signal),
              );
            const definitions = [
              ...(assistantEnabled && !notesOnly && !p3Only
                ? ([
                    [
                      "create_trip_item_fields",
                      fieldCreateInput,
                      mutationOutput,
                      "Preview/create a typed Item with explicit participation and P6 activity fields. Private visibility; participation grants no access. Trusted confirmation required.",
                      async (args: unknown) => {
                        const q = fieldCreateInput.parse(args);
                        return writes.execute(
                          prepareFieldCreate(auth.accountId, q),
                          q.mode,
                          q.preview_digest,
                        );
                      },
                    ],
                    [
                      "update_trip_item_fields",
                      fieldUpdateInput,
                      mutationOutput,
                      "Preview/edit place, participation, Stay, Rental, Activity or Transport fields using the unchanged get_trip_item base_item and revision. Preserve omitted fields. For STRUCTURED_PLACE or P4 RENTAL_PLACE (role PICKUP/RETURN), read get_trip_item_edit_base and retain the entire unchanged result in change.base, matching base_item/revision; patch only authored fields. Retain this exact base for original-ID recovery; never silently rebase. Qualified/provider/source facts may be blocked.",
                      async (args: unknown) => {
                        const q = fieldUpdateInput.parse(args);
                        return writes.execute(
                          prepareFieldUpdate(q),
                          q.mode,
                          q.preview_digest,
                        );
                      },
                    ],
                  ] as const)
                : []),
              [
                "create_trip",
                createTripInput,
                mutationOutput,
                "Preview or create one Trip with structured destinations.",
                async (args: unknown) => {
                  const q = createTripInput.parse(args);
                  return writes.execute(writes.prepareTrip(q), q.mode, q.preview_digest);
                },
              ],
              [
                "create_trip_item",
                stayCreateInput,
                mutationOutput,
                "Preview or create one Manual typed Item. Trusted user approval required for APPLY.",
                async (args: unknown) => {
                  const q = stayCreateInput.parse(args);
                  return writes.execute(
                    writes.prepareCreate(q),
                    q.mode,
                    q.preview_digest,
                  );
                },
              ],
              [
                "update_trip_item",
                editInput,
                mutationOutput,
                notesOnly
                  ? "Preview/Apply a Notes-only TEXT edit at the current Item revision. Read the current Notes first and show exact Before/After. Do not provide title, dates, clear or other fields. Trusted exact user confirmation and owning receipt required."
                  : "Preview or edit text OR a supported complete civil schedule at an explicit revision; qualified/transport time edits need their owning adapter.",
                async (args: unknown) => {
                  const q = editInput.parse(args);
                  return writes.execute(
                    writes.prepareUpdate(q),
                    q.mode,
                    q.preview_digest,
                  );
                },
              ],
              [
                "preview_trip_changes",
                assistantEnabled ? assistantChangesInput : previewChangesInput,
                assistantEnabled ? assistantBatchOutput : batchOutput,
                "Preview up to12 explicit changes; identify possible duplicates. No write.",
                batch.preview_trip_changes,
              ],
              [
                "apply_trip_changes",
                assistantEnabled ? assistantApplyInput : applyChangesInput,
                assistantEnabled ? assistantBatchOutput : batchOutput,
                "Apply an exact preview after trusted user confirmation; report partial receipts, no batch atomicity.",
                batch.apply_trip_changes,
              ],
            ] as const;
            for (const [
              name,
              inputSchema,
              outputSchema,
              description,
              run,
            ] of writesEnabled
              ? definitions.filter(([name]) =>
                  notesOnly
                    ? name === "update_trip_item"
                    : p3Only
                      ? ["create_trip_item", "update_trip_item"].includes(name)
                      : true,
                )
              : [])
              server.registerTool(
                name,
                {
                  inputSchema,
                  outputSchema,
                  description,
                  _meta: {
                    securitySchemes: [{ type: "oauth2", scopes: writeScopes }],
                  },
                  annotations: {
                    readOnlyHint: name === "preview_trip_changes",
                    destructiveHint: false,
                    idempotentHint: true,
                    openWorldHint: false,
                  },
                },
                async (args: unknown): Promise<CallToolResult> => {
                  invokedTool = name;
                  try {
                    if (auth.expiresAt <= Date.now() || !auth.clientId)
                      return authError(["otr.trips.read", "otr.trips.write"], true);
                    if (!auth.scopes.includes("otr.trips.write"))
                      return authError(["otr.trips.read", "otr.trips.write"]);
                    const result = await boundary.run(async () => await run(args));
                    if (auth.expiresAt <= Date.now()) throw Error("AUTH_REQUIRED");
                    return {
                      content: [{ type: "text", text: JSON.stringify(result) }],
                      structuredContent: result,
                    };
                  } catch {
                    if (auth.expiresAt <= Date.now()) {
                      const error = authError(
                        ["otr.trips.read", "otr.trips.write"],
                        true,
                      );
                      const recovery = expiredApplyRecovery(auth.accountId, name, args);
                      return recovery
                        ? {
                            ...error,
                            content: [{ type: "text", text: JSON.stringify(recovery) }],
                            structuredContent: recovery,
                          }
                        : error;
                    }
                    toolError = "MUTATION_UNAVAILABLE_QUERY_OPERATION";
                    return {
                      isError: true,
                      content: [{ type: "text", text: toolError }],
                    };
                  }
                },
              );
            server.registerTool(
              "get_operation_status",
              {
                inputSchema: operationInput,
                outputSchema: operationOutput,
                description:
                  "Read owning exact operation receipt. UNKNOWN is not failed or absent.",
                _meta: {
                  securitySchemes: [{ type: "oauth2", scopes: readScopes }],
                },
                annotations: {
                  readOnlyHint: true,
                  idempotentHint: true,
                  destructiveHint: false,
                },
              },
              async (args: unknown): Promise<CallToolResult> => {
                try {
                  if (auth.expiresAt <= Date.now())
                    return authError(["otr.trips.read"], true);
                  const result = await boundary.run(() =>
                    writes.get_operation_status(args),
                  );
                  if (auth.expiresAt <= Date.now())
                    return authError(["otr.trips.read"], true);
                  return {
                    content: [{ type: "text", text: JSON.stringify(result) }],
                    structuredContent: result,
                  };
                } catch {
                  if (auth.expiresAt <= Date.now())
                    return authError(["otr.trips.read"], true);
                  return {
                    isError: true,
                    content: [{ type: "text", text: "OPERATION_UNAVAILABLE" }],
                  };
                }
              },
            );
          }
          const transport = new WebStandardStreamableHTTPServerTransport({
            sessionIdGenerator: undefined,
            enableJsonResponse: true,
          });
          await server.connect(transport);
          try {
            const protocol = await boundary.run(() =>
              transport.handleRequest(
                new Request(request.url, {
                  method: "POST",
                  headers: request.headers,
                  body: Buffer.from(bytes),
                  signal: boundary.signal,
                }),
              ),
            );
            const body = await boundary.run(() => protocol.arrayBuffer());
            // Never replay a batch that may already have performed a write.
            response = singleReadAuthRequired
              ? reply(401, "AUTH_REQUIRED")
              : new Response(body, {
                  status: protocol.status,
                  headers: protocol.headers,
                });
            // Hash the final SDK tool result, never an intermediate owning response.
            if (
              (notesOnly || p3Only) &&
              !singleReadAuthRequired &&
              protocol.status === 200 &&
              auth.expiresAt > Date.now()
            ) {
              try {
                const call = JSON.parse(Buffer.from(bytes).toString("utf8"));
                const sent = JSON.parse(Buffer.from(body).toString("utf8"));
                if (
                  !Array.isArray(call) &&
                  call.jsonrpc === "2.0" &&
                  call.method === "tools/call" &&
                  ["string", "number"].includes(typeof call.id) &&
                  sent.jsonrpc === "2.0" &&
                  sent.id === call.id &&
                  !sent.error &&
                  sent.result &&
                  !sent.result.isError
                ) {
                  const input = call.params?.arguments;
                  const output = sent.result.structuredContent;
                  const base =
                    call.params?.name === "get_trip_item_edit_base" &&
                    itemInput.safeParse(input).success &&
                    itemEditBaseOutput.safeParse(output).success &&
                    output.state === "SERVER_CONFIRMED";
                  const preview =
                    ((call.params?.name === "update_trip_item" &&
                      editInput.safeParse(input).success) ||
                      (p3Only &&
                        call.params?.name === "create_trip_item" &&
                        stayCreateInput.safeParse(input).success)) &&
                    (input.mode === undefined || input.mode === "PREVIEW") &&
                    mutationOutput.safeParse(output).success &&
                    output.outcome === "PREVIEW" &&
                    /^[0-9a-f]{64}$/.test(output.preview_digest);
                  if (base || preview)
                    responseProof = {
                      version: "otr.mcp.response-proof/1",
                      kind: base ? "EDIT_BASE" : "PREVIEW",
                      inputSHA256: contentDigest(input),
                      outputSHA256: contentDigest(output),
                      ...(preview ? { previewDigest: output.preview_digest } : {}),
                    };
                }
              } catch {
                /* Diagnostics cannot change the response or infer a successful result. */
              }
            }
          } finally {
            await server.close();
            if (auth.expiresAt <= Date.now()) responseProof = undefined;
          }
        }
      }
      status = response.status;
      response.headers.set("Content-Type", "application/json");
      response.headers.set("Cache-Control", "private, no-store");
      response.headers.set("Vary", "Authorization");
      if (status === 405) response.headers.set("Allow", "POST");
      if (status === 401) {
        const challenge = options.oauth?.challenge ?? "Bearer";
        response.headers.set(
          "WWW-Authenticate",
          singleReadAuthRequired
            ? `${challenge}${options.oauth ? ", " : " "}error="invalid_token"`
            : challenge,
        );
      }
      return response;
    } catch (error) {
      status =
        error instanceof RequestBoundaryError && error.code === "BODY_LIMIT"
          ? 413
          : boundary.signal.aborted
            ? 504
            : 503;
      return new Response(
        JSON.stringify({
          error:
            status === 413
              ? "BODY_LIMIT"
              : status === 504
                ? "REQUEST_TIMEOUT"
                : "REQUEST_UNAVAILABLE",
        }),
        {
          status,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "private, no-store",
          },
        },
      );
    } finally {
      mutationBoundary?.close();
      boundary.close();
      try {
        options.log?.({
          requestId,
          status,
          durationMs: Date.now() - started,
          ...(invokedTool ? { tool: invokedTool } : {}),
          ...(toolError ? { errorCode: toolError } : {}),
          ...(authFailureSource ? { authFailureSource } : {}),
          ...(responseProof && status === 200 && !toolError && !authFailureSource
            ? { responseProof }
            : {}),
        });
      } catch {
        /* Logging cannot change the response. */
      }
    }
  };
}
