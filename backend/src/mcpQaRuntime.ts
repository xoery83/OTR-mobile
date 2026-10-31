import { readFile } from "node:fs/promises";
import { z } from "zod";
import { createMcpAccountReadBinding } from "./mcpAccountReadBinding";
import { createSupabaseDevMcpGrantVerifier } from "./mcpOAuthGrantVerifier";
import { createMcpConsentPage } from "./mcpConsentPage";
import { isSupabaseDevPublicKey } from "@/data/auth/devSupabasePublicKey";
import type { DevBackendGateway } from "./app";
import type { CoreHttpConnection } from "./tripCoreV2Http";
import { mcpIngressBodyLimit } from "./mcpIngress";

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
type ModulePort = {
  createReadRuntime(options: {
    issuer: string;
    resource: string;
    isGrantActive: ReturnType<typeof createSupabaseDevMcpGrantVerifier>;
    bindBackend: ReturnType<typeof createMcpAccountReadBinding>;
    log?: (event: unknown) => void;
  }): (request: Request) => Promise<Response>;
};
const requestLogSchema = z.object({
  requestId: z.uuid(),
  status: z.number().int().min(100).max(599),
  durationMs: z.number().min(0).max(120000),
  tool: z.enum(["list_trips", "get_trip", "list_trip_items", "get_trip_item"]).optional(),
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
  if (env.OTR_DEV_MCP_READ_QA_CONFIG === undefined) return undefined;
  const config = configSchema.parse(JSON.parse(env.OTR_DEV_MCP_READ_QA_CONFIG));
  const publicKey = env.OTR_DEV_SUPABASE_PUBLISHABLE_KEY ?? "";
  if (
    env.OTR_DEV_SUPABASE_URL !== issuer.replace(/\/auth\/v1$/, "") ||
    !isSupabaseDevPublicKey(publicKey) ||
    !gateway.discoverTrips ||
    !core?.read ||
    config.expiresAt <= Date.now() ||
    config.expiresAt > Date.now() + 1800000
  )
    throw Error("MCP_QA_RUNTIME_CLOSED");
  const [library, script] = await Promise.all([files.module(), files.asset()]);
  if (script.byteLength === 0 || script.byteLength > 2097152)
    throw Error("MCP_QA_ASSET_INVALID");
  const active = createSupabaseDevMcpGrantVerifier({
    clientId: config.clientId,
    publishableKey: publicKey,
  });
  const bindBackend = createMcpAccountReadBinding({
    discovery: { discoverTrips: gateway.discoverTrips.bind(gateway) },
    canReadTrip: gateway.canReadTrip.bind(gateway),
    core,
  });
  const mcp = library.createReadRuntime({
    issuer,
    resource,
    bindBackend,
    log: (event) => {
      const safe = requestLogSchema.safeParse(event);
      if (safe.success) console.info("MCP_QA_REQUEST", JSON.stringify(safe.data));
    },
    isGrantActive: (grant, signal, evidence) =>
      grant.accountId === qaAccount && Date.now() < config.expiresAt
        ? active(grant, signal, evidence)
        : Promise.resolve(false),
  });
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
