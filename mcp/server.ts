import {
  createMutationTools,
  type BackendMutation,
  type ConfirmChanges,
} from "./mutation";
import { createBatchTools } from "./batch";
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
import { createReadTools, ReadError, type BackendRead } from "./read";
import {
  listTripsInput,
  tripInput,
  listItemsInput,
  itemInput,
  tripsOutput,
  tripOutput,
  itemsOutput,
  itemOutput,
} from "./contract";

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
export type McpOptions = {
  resource: string;
  authorize?: (request: Request) => Promise<McpAuthorization | null>;
  confirm?: ConfirmChanges;
  oauth?: {
    metadataUrl: string;
    challenge: string;
    handle(request: Request): Response | null;
  };
  log?: (event: {
    requestId: string;
    status: number;
    durationMs: number;
    tool?: string;
    errorCode?: string;
  }) => void;
};
export function createMcpHandler(options: McpOptions) {
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
  return async (request: Request): Promise<Response> => {
    const metadata = options.oauth?.handle(request);
    if (metadata) return metadata;
    const started = Date.now(),
      requestId = randomUUID();
    const boundary = createRequestBoundary(60000, request.signal);
    let status = 503;
    let invokedTool: string | undefined;
    let toolError: string | undefined;
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
        else if (!auth.scopes.includes("otr.trips.read"))
          response = reply(403, "INSUFFICIENT_SCOPE");
        else {
          const bytes = await readBoundedBytes({ body: request.body }, 16384, boundary);
          const tools = createReadTools(auth.accountId, auth.read, boundary.signal);
          const server = new McpServer({ name: "otr", version: "0.2.0" });
          const definitions = [
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
          for (const [name, inputSchema, outputSchema, description] of definitions) {
            server.registerTool(
              name,
              {
                inputSchema,
                outputSchema,
                description,
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
                  if (auth.expiresAt <= Date.now()) throw new ReadError("AUTH_REQUIRED");
                  const output = await boundary.run(async () => await tools[name](args));
                  if (auth.expiresAt <= Date.now()) throw new ReadError("AUTH_REQUIRED");
                  return {
                    content: [{ type: "text", text: JSON.stringify(output) }],
                    structuredContent: output,
                  };
                } catch (error) {
                  const code =
                    error instanceof ReadError ? error.code : "BACKEND_UNAVAILABLE";
                  toolError = code;
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
            const context = {
              accountId: auth.accountId,
              clientId: auth.clientId ?? "",
              resource: options.resource,
              backend: auth.backend,
              read: auth.read,
              signal: AbortSignal.any([
                boundary.signal,
                AbortSignal.timeout(Math.max(1, auth.expiresAt - Date.now())),
              ]),
              confirm: options.confirm,
            };
            const writes = createMutationTools(context),
              batch = createBatchTools(context, writes, tools);
            const definitions = [
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
                createItemInput,
                mutationOutput,
                "Preview or create one Manual typed Item. Trusted user approval required for APPLY.",
                async (args: unknown) => {
                  const q = createItemInput.parse(args);
                  return writes.execute(
                    writes.prepareCreate(q),
                    q.mode,
                    q.preview_digest,
                  );
                },
              ],
              [
                "update_trip_item",
                updateItemInput,
                mutationOutput,
                "Preview or edit text OR dates at an explicit expected revision; never overwrite silently.",
                async (args: unknown) => {
                  const q = updateItemInput.parse(args);
                  return writes.execute(
                    writes.prepareUpdate(q),
                    q.mode,
                    q.preview_digest,
                  );
                },
              ],
              [
                "preview_trip_changes",
                previewChangesInput,
                batchOutput,
                "Preview up to12 explicit changes; identify possible duplicates. No write.",
                batch.preview_trip_changes,
              ],
              [
                "apply_trip_changes",
                applyChangesInput,
                batchOutput,
                "Apply an exact preview after trusted user confirmation; report partial receipts, no batch atomicity.",
                batch.apply_trip_changes,
              ],
            ] as const;
            for (const [name, inputSchema, outputSchema, description, run] of definitions)
              server.registerTool(
                name,
                {
                  inputSchema,
                  outputSchema,
                  description,
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
                    if (
                      !auth.clientId ||
                      auth.expiresAt <= Date.now() ||
                      !auth.scopes.includes("otr.trips.write")
                    )
                      throw Error("WRITE_SCOPE_REQUIRED");
                    const result = await boundary.run(async () => await run(args));
                    if (auth.expiresAt <= Date.now()) throw Error("AUTH_REQUIRED");
                    return {
                      content: [{ type: "text", text: JSON.stringify(result) }],
                      structuredContent: result,
                    };
                  } catch {
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
                annotations: {
                  readOnlyHint: true,
                  idempotentHint: true,
                  destructiveHint: false,
                },
              },
              async (args: unknown): Promise<CallToolResult> => {
                try {
                  const result = await boundary.run(() =>
                    writes.get_operation_status(args),
                  );
                  return {
                    content: [{ type: "text", text: JSON.stringify(result) }],
                    structuredContent: result,
                  };
                } catch {
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
            response = new Response(body, {
              status: protocol.status,
              headers: protocol.headers,
            });
          } finally {
            await server.close();
          }
        }
      }
      status = response.status;
      response.headers.set("Content-Type", "application/json");
      response.headers.set("Cache-Control", "private, no-store");
      response.headers.set("Vary", "Authorization");
      if (status === 405) response.headers.set("Allow", "POST");
      if (status === 401)
        response.headers.set("WWW-Authenticate", options.oauth?.challenge ?? "Bearer");
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
      boundary.close();
      try {
        options.log?.({
          requestId,
          status,
          durationMs: Date.now() - started,
          ...(invokedTool ? { tool: invokedTool } : {}),
          ...(toolError ? { errorCode: toolError } : {}),
        });
      } catch {
        /* Logging cannot change the response. */
      }
    }
  };
}
