import { readFile } from "node:fs/promises";
import { z } from "zod";
import {
  createMcpAccountReadBinding,
  type McpReadStageDiagnostic,
} from "./mcpAccountReadBinding";
import {
  createMcpAccountWriteBinding,
  type CommandRequest,
} from "./mcpAccountWriteBinding";
import {
  createSupabaseDevMcpGrantVerifier,
  createSupabaseDevMcpWriteGrantVerifier,
  type McpVerifiedGrant,
} from "./mcpOAuthGrantVerifier";
import { createMcpConsentPage } from "./mcpConsentPage";
import { isSupabaseDevPublicKey } from "@/data/auth/devSupabasePublicKey";
import type { DevBackendGateway } from "./app";
import type { CoreHttpConnection } from "./tripCoreV2Http";
import { mcpIngressBodyLimit } from "./mcpIngress";
import { canonicalCoreJson, type Json } from "@/domain/trip/tripCoreV2Json";
import slice1Cases from "../mcp/slice1-qa-cases.json";

const qaAccount = "1f3d7935-1bdc-4952-8d7f-0f72077368c1";
const issuer = "https://tuqigdxrvrerfewsxqgm.supabase.co/auth/v1";
const resource = "https://api-dev.xoery.art/mcp";
const configSchema = z
  .strictObject({
    version: z.literal(1),
    clientId: z.uuid(),
    redirectUris: z.union([
      z.tuple([
        z.literal("https://chatgpt.com/connector/oauth/CYUxrs56rSrW"),
        z.literal("http://127.0.0.1:18764/callback"),
      ]),
      z.tuple([z.literal("https://claude.ai/api/mcp/auth_callback")]),
    ]),
    expiresAt: z.number().int().positive(),
  })
  .refine(
    (config) =>
      config.redirectUris.length !== 1 ||
      config.clientId !== "83504d3f-59d4-43fd-99b1-bebc54c40f7d",
  );
const writeConfigSchema = z.strictObject({
  version: z.literal(3),
  clientId: z.literal("d2b8167f-ee42-4ac1-b5ef-4dc003c0d141"),
  redirectUris: z.tuple([z.literal("https://claude.ai/api/mcp/auth_callback")]),
  expiresAt: configSchema.shape.expiresAt,
  businessAccess: z.literal("READ_WRITE"),
  consentNotBefore: z.number().int().positive(),
  confirmations: z.tuple([
    z.strictObject({
      operationId: z.literal("bb0cb010-0cb4-432b-8995-670aaec95b3d"),
      previewDigest: z.literal(
        "ec151a254b010eba45d83e5dc0e9416d7aa356bd5b0cbdd27824afea7069b4e7",
      ),
    }),
  ]),
});
const slice1Clients = [
  {
    clientId: "d2b8167f-ee42-4ac1-b5ef-4dc003c0d141",
    callback: "https://claude.ai/api/mcp/auth_callback",
    qa: slice1Cases.cases[0],
  },
  {
    clientId: "83504d3f-59d4-43fd-99b1-bebc54c40f7d",
    callback: "https://chatgpt.com/connector/oauth/CYUxrs56rSrW",
    qa: slice1Cases.cases[1],
  },
] as const;
const slice1WriteConfigSchema = z
  .strictObject({
    version: z.literal(4),
    toolProfile: z.literal("SLICE1_NOTES_EDIT"),
    clientId: z.enum([slice1Clients[0].clientId, slice1Clients[1].clientId]),
    redirectUris: z.tuple([z.string()]),
    expiresAt: configSchema.shape.expiresAt,
    businessAccess: z.literal("READ_WRITE"),
    consentNotBefore: z.number().int().positive(),
    confirmations: z
      .array(
        z.strictObject({
          operationId: z.uuid(),
          previewDigest: z.string().regex(/^[a-f0-9]{64}$/),
        }),
      )
      .max(1),
  })
  .refine((config) => {
    const selected = slice1Clients.find((client) => client.clientId === config.clientId)!;
    return (
      config.redirectUris[0] === selected.callback &&
      config.confirmations.every(
        (entry) =>
          entry.operationId === selected.qa.command.operationId &&
          entry.previewDigest === selected.qa.identity.preview_digest,
      )
    );
  });
type Confirmation = Readonly<{
  accountId: string;
  clientId: string;
  resource: string;
  digest: string;
  operationIds: readonly string[];
}>;
const confirmationSchema = z.object({
  accountId: z.uuid(),
  clientId: z.uuid(),
  resource: z.literal(resource),
  digest: z.string().regex(/^[0-9a-f]{64}$/),
  operationIds: z.tuple([z.uuid()]),
});
type RuntimeOptions = {
  toolProfile?: "SLICE1_NOTES_EDIT";
  issuer: string;
  resource: string;
  isGrantActive: ReturnType<typeof createSupabaseDevMcpGrantVerifier>;
  bindBackend(
    grant: McpVerifiedGrant,
    signal: AbortSignal,
    evidence?: Readonly<{ accessToken: string }>,
  ): Promise<{
    read(path: string, signal: AbortSignal): Promise<Response>;
    backend?(input: CommandRequest, signal: AbortSignal): Promise<Response>;
  }>;
  confirm?(request: Confirmation, signal: AbortSignal): Promise<boolean>;
  log?: (event: unknown) => void;
};
type ModulePort = {
  createReadRuntime(options: RuntimeOptions): (request: Request) => Promise<Response>;
  createWriteRuntime?(options: RuntimeOptions): (request: Request) => Promise<Response>;
};
const writeStageLogSchema = z.object({
  diagnosticId: z.uuid(),
  stage: z.enum(["PRECHECK", "CORE_BOUNDARY_ENTERED", "CORE_RETURNED", "POSTCHECK"]),
  elapsedMs: z.number().min(0).max(120000),
  failure: z
    .enum(["EXPIRED", "CANCELED", "TIMEOUT", "GRANT_NOT_CURRENT", "UNCLASSIFIED"])
    .optional(),
});
const readStageLogSchema = z.object({
  diagnosticId: z.uuid(),
  resource: z.enum(["DISCOVERY", "COLLECTION", "ITEM"]),
  stage: z.enum(["PRECHECK", "OWNING_ENTERED", "OWNING_RETURNED", "POSTCHECK"]),
  elapsedMs: z.number().min(0).max(120000),
  remainingMs: z.number().min(0).max(60000),
  owningResponseStatus: z.number().int().min(100).max(599).optional(),
  failure: z.enum(["EXPIRED", "CANCELED", "TIMEOUT", "UNCLASSIFIED"]).optional(),
});
const requestLogSchema = z.object({
  requestId: z.uuid(),
  status: z.number().int().min(100).max(599),
  durationMs: z.number().min(0).max(120000),
  tool: z
    .enum([
      "get_otr_operating_guide",
      "get_trip_item_edit_base",
      "list_trips",
      "get_trip",
      "list_trip_items",
      "get_trip_item",
      "create_trip",
      "create_trip_item",
      "update_trip_item",
      "preview_trip_changes",
      "apply_trip_changes",
      "get_operation_status",
    ])
    .optional(),
  errorCode: z
    .enum([
      "NOT_VISIBLE",
      "BACKEND_UNAVAILABLE",
      "BACKEND_TIMEOUT",
      "INVALID_INPUT",
      "STALE_CURSOR",
      "READ_LIMIT",
      "AUTH_REQUIRED",
    ])
    .optional(),
  authFailureSource: z
    .enum(["EXPIRED_BEFORE_BACKEND", "EXPIRED_AFTER_BACKEND", "BACKEND_401"])
    .optional(),
});
type RuntimeIo = {
  module(): Promise<ModulePort>;
  asset(): Promise<Uint8Array>;
};
const io: RuntimeIo = {
  module: () => import(new URL("./mcp/runtime.mjs", import.meta.url).href),
  asset: () => readFile(new URL("./auth-consent/app.js", import.meta.url)),
};

// No module/asset/network IO when absent. The one public config needs the Owner's exact Gate.
export async function loadMcpQaRuntime(
  env: Record<string, string | undefined>,
  gateway: Pick<DevBackendGateway, "discoverTrips" | "canReadTrip">,
  core?: CoreHttpConnection,
  files: RuntimeIo = io,
) {
  const readRaw = env.OTR_DEV_MCP_READ_QA_CONFIG;
  const writeRaw = env.OTR_DEV_MCP_WRITE_QA_CONFIG;
  if (readRaw === undefined && writeRaw === undefined) return undefined;
  if (readRaw !== undefined && writeRaw !== undefined)
    throw Error("MCP_QA_CONFIG_CONFLICT");
  const config =
    writeRaw === undefined
      ? configSchema.parse(JSON.parse(readRaw!))
      : z.union([writeConfigSchema, slice1WriteConfigSchema]).parse(JSON.parse(writeRaw));
  const write = config.version === 3 || config.version === 4 ? config : undefined;
  const slice1 =
    write?.version === 4
      ? slice1Clients.find((client) => client.clientId === write.clientId)!
      : undefined;
  const publicKey = env.OTR_DEV_SUPABASE_PUBLISHABLE_KEY ?? "";
  if (
    env.OTR_DEV_SUPABASE_URL !== issuer.replace(/\/auth\/v1$/, "") ||
    !isSupabaseDevPublicKey(publicKey) ||
    !gateway.discoverTrips ||
    !core?.read ||
    config.expiresAt <= Date.now() ||
    config.expiresAt > Date.now() + 1800000 ||
    (write &&
      (write.consentNotBefore > Date.now() ||
        write.expiresAt <= write.consentNotBefore ||
        write.expiresAt > write.consentNotBefore + 1800000 ||
        !core?.commands?.withLockedCommand))
  )
    throw Error("MCP_QA_RUNTIME_CLOSED");
  const [library, script] = await Promise.all([files.module(), files.asset()]);
  if (script.byteLength === 0 || script.byteLength > 2097152)
    throw Error("MCP_QA_ASSET_INVALID");
  const readActive = createSupabaseDevMcpGrantVerifier({
    clientId: config.clientId,
    publishableKey: publicKey,
  });
  const active = write
    ? createSupabaseDevMcpWriteGrantVerifier({
        clientId: config.clientId,
        publishableKey: publicKey,
        consentNotBefore: write.consentNotBefore,
      })
    : readActive;
  const ports = {
    readDiagnostic: (event: McpReadStageDiagnostic) => {
      const safe = readStageLogSchema.safeParse(event);
      if (safe.success) console.info("MCP_QA_READ_STAGE", JSON.stringify(safe.data));
    },
    discovery: { discoverTrips: gateway.discoverTrips.bind(gateway) },
    canReadTrip: gateway.canReadTrip.bind(gateway),
    core,
  };
  const readBinding = createMcpAccountReadBinding(ports);
  const options: RuntimeOptions = {
    ...(slice1 ? { toolProfile: "SLICE1_NOTES_EDIT" as const } : {}),
    issuer,
    resource,
    bindBackend: write
      ? async (grant, signal, evidence) => {
          if (!evidence) throw Error("MCP_WRITE_EVIDENCE_CLOSED");
          const accessToken = evidence.accessToken;
          const bound = await createMcpAccountWriteBinding({
            ...ports,
            diagnostic: (event) => {
              const safe = writeStageLogSchema.safeParse(event);
              if (safe.success)
                console.info("MCP_QA_WRITE_STAGE", JSON.stringify(safe.data));
            },
            isWriteGrantCurrent: (current, checkSignal) =>
              current.accountId === qaAccount && Date.now() < config.expiresAt
                ? active(current, checkSignal, { accessToken })
                : Promise.resolve(false),
          })(grant, signal);
          if (!slice1) return bound;
          return {
            ...bound,
            backend: async (input: CommandRequest, requestSignal: AbortSignal) => {
              const path = `/v2/trips/${slice1.qa.command.tripId}/core/`;
              let allowed =
                input.method === "GET" &&
                input.path === path + "operations/" + slice1.qa.command.operationId;
              if (input.method === "POST" && input.path === path + "commands") {
                try {
                  allowed =
                    canonicalCoreJson(input.body as Json) ===
                    canonicalCoreJson(slice1.qa.command as Json);
                } catch {
                  allowed = false;
                }
              }
              if (
                input.method === "POST" &&
                !write.confirmations.some(
                  (entry) =>
                    entry.operationId === slice1.qa.command.operationId &&
                    entry.previewDigest === slice1.qa.identity.preview_digest,
                )
              )
                allowed = false;
              if (!allowed)
                return Response.json(
                  { error: { code: "NOT_VISIBLE" } },
                  { status: 404, headers: { "Cache-Control": "private, no-store" } },
                );
              return bound.backend(input, requestSignal);
            },
          };
        }
      : readBinding,
    ...(write
      ? {
          confirm: async (request: Confirmation, signal: AbortSignal) => {
            signal.throwIfAborted();
            const parsed = confirmationSchema.safeParse(request);
            if (!parsed.success) return false;
            const confirmed = parsed.data;
            return (
              Date.now() < config.expiresAt &&
              confirmed.accountId === qaAccount &&
              confirmed.clientId === config.clientId &&
              write.confirmations.some(
                (entry) =>
                  entry.operationId === confirmed.operationIds[0] &&
                  entry.previewDigest === confirmed.digest,
              )
            );
          },
        }
      : {}),
    log: (event) => {
      const safe = requestLogSchema.safeParse(event);
      if (safe.success) console.info("MCP_QA_REQUEST", JSON.stringify(safe.data));
    },
    isGrantActive: (grant, signal, evidence) =>
      grant.accountId === qaAccount && Date.now() < config.expiresAt
        ? active(grant, signal, evidence)
        : Promise.resolve(false),
  };
  if (write && !library.createWriteRuntime) throw Error("MCP_WRITE_RUNTIME_CLOSED");
  const mcp = write
    ? library.createWriteRuntime!(options)
    : library.createReadRuntime(options);
  const page = createMcpConsentPage(
    {
      ...config,
      publishableKey: publicKey,
      accountIds: [qaAccount],
      qaEmail: "otr-qa-fde969f2-2dc5-4a33-83a1-268ac5fd6424@eldouzileu.resend.app",
    },
    script,
  );
  return async (request: Request): Promise<Response | null> => {
    const url = new URL(request.url);
    const relevant = mcpIngressBodyLimit(url.pathname, request.method) !== null;
    if (!relevant) return null;
    if (url.host !== "api-dev.xoery.art") return new Response(null, { status: 404 });
    if (Date.now() >= config.expiresAt)
      return Response.json({ error: "MCP_QA_CLOSED" }, { status: 503 });
    // Existing private backend hop is HTTP. Gate must qualify Caddy TLS and private port binding.
    // Never derive authority/origin from arbitrary Forwarded/X-Forwarded-* headers.
    const external = new Request(new URL(url.pathname + url.search, resource), request);
    return page(external) ?? mcp(external);
  };
}
