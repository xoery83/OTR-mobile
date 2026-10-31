import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { createRequestBoundary, readBoundedBytes } from "../api/requestBoundary";
import { isSupabaseDevPublicKey } from "./devSupabasePublicKey";

const origin = "https://tuqigdxrvrerfewsxqgm.supabase.co";
export const mcpConsentConfigSchema = z.object({
  clientId: z.uuid(),
  redirectUri: z.url().refine((value) => {
    const u = new URL(value);
    return u.protocol === "https:" && !u.username && !u.password && !u.search && !u.hash;
  }),
  publishableKey: z.string().refine(isSupabaseDevPublicKey, "PUBLIC_DEV_KEY_REQUIRED"),
  accountIds: z.array(z.uuid()).min(1).max(2),
  expiresAt: z.number().int().positive(),
});
export type McpConsentConfig = z.infer<typeof mcpConsentConfigSchema>;
export class McpConsentError extends Error {
  constructor(
    public readonly code:
      "CLOSED" | "BUSY" | "UNAVAILABLE" | "OTP_FAILED" | "RATE_LIMIT" | "REQUEST_CHANGED",
  ) {
    super(code);
  }
}
export type McpConsentView =
  | Readonly<{ kind: "CONSENT"; accountId: string; clientName: string }>
  | Readonly<{ kind: "REDIRECT"; url: string }>;

// Browser-only facade over the SAME Supabase Auth SDK, with its normal OTP/session.
// Memory-only SDK storage; no token is returned to UI or another backend audience.
export function createMcpOAuthConsentRepository(
  input: McpConsentConfig,
  authorizationId: string,
  suppliedClient?: SupabaseClient,
) {
  const config = mcpConsentConfigSchema.parse(input);
  z.string()
    .regex(/^[A-Za-z0-9_-]{1,256}$/)
    .parse(authorizationId);
  const lifetime = new AbortController();
  let busy = false,
    closed = false;
  let closeTask: Promise<void> | undefined;
  const current = () => {
    if (closed || Date.now() >= config.expiresAt) throw new McpConsentError("CLOSED");
  };
  const client =
    suppliedClient ??
    createClient(origin, config.publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: {
        fetch: async (url, init) => {
          const target = new URL(
            typeof url === "string" ? url : url instanceof URL ? url.href : url.url,
          );
          if (target.origin !== origin || !target.pathname.startsWith("/auth/v1/"))
            throw new McpConsentError("REQUEST_CHANGED");
          const logout = target.pathname === "/auth/v1/logout";
          if (!logout) current();
          const boundary = createRequestBoundary(10000, lifetime.signal);
          try {
            const response = await boundary.run(() =>
              fetch(url, {
                ...init,
                redirect: "error",
                credentials: "omit",
                signal: boundary.signal,
              }),
            );
            const bytes =
              response.status === 204 || response.status === 205
                ? null
                : await readBoundedBytes(response, 65536, boundary);
            if (!logout) current();
            return new Response(bytes ? new Uint8Array(bytes).buffer : null, {
              status: response.status,
              statusText: response.statusText,
              headers: response.headers,
            });
          } finally {
            boundary.close();
          }
        },
      },
    });
  async function run<T>(work: () => Promise<T>): Promise<T> {
    current();
    if (busy) throw new McpConsentError("BUSY");
    busy = true;
    try {
      const result = await work();
      current();
      return result;
    } catch (error) {
      if (error instanceof McpConsentError) throw error;
      throw new McpConsentError("UNAVAILABLE");
    } finally {
      busy = false;
    }
  }
  function redirect(raw: string) {
    if (raw.length > 8192) throw new McpConsentError("REQUEST_CHANGED");
    const actual = new URL(raw),
      expected = new URL(config.redirectUri);
    if (
      actual.origin !== expected.origin ||
      actual.pathname !== expected.pathname ||
      actual.username ||
      actual.password ||
      actual.hash
    )
      throw new McpConsentError("REQUEST_CHANGED");
    if (
      [...actual.searchParams.keys()].some(
        (key) =>
          !["code", "state", "error", "error_description"].includes(key) ||
          actual.searchParams.getAll(key).length !== 1,
      ) ||
      actual.searchParams.has("code") === actual.searchParams.has("error")
    )
      throw new McpConsentError("REQUEST_CHANGED");
    return Object.freeze({ kind: "REDIRECT" as const, url: actual.href });
  }
  async function details(): Promise<McpConsentView> {
    const { data: identity, error: identityError } = await client.auth.getUser();
    current();
    if (
      identityError ||
      !identity.user ||
      identity.user.is_anonymous !== false ||
      !config.accountIds.includes(identity.user.id)
    )
      throw new McpConsentError("CLOSED");
    const { data, error } =
      await client.auth.oauth.getAuthorizationDetails(authorizationId);
    current();
    if (error || !data) throw new McpConsentError("UNAVAILABLE");
    if ("redirect_url" in data) return redirect(data.redirect_url);
    if (
      data.authorization_id !== authorizationId ||
      data.client.id !== config.clientId ||
      data.user.id !== identity.user.id ||
      data.redirect_uri !== config.redirectUri ||
      data.scope !== "openid"
    )
      throw new McpConsentError("REQUEST_CHANGED");
    return Object.freeze({
      kind: "CONSENT",
      accountId: identity.user.id,
      clientName: z.string().min(1).max(200).parse(data.client.name),
    });
  }
  return Object.freeze({
    requestCode(email: string) {
      return run(async () => {
        const { error } = await client.auth.signInWithOtp({
          email: z.email().parse(email),
          options: { shouldCreateUser: false },
        });
        if (error)
          throw new McpConsentError(error.status === 429 ? "RATE_LIMIT" : "OTP_FAILED");
      });
    },
    verifyCode(email: string, code: string) {
      return run(async () => {
        const { error } = await client.auth.verifyOtp({
          email: z.email().parse(email),
          token: z
            .string()
            .regex(/^\d{8}$/)
            .parse(code),
          type: "email",
        });
        if (error)
          throw new McpConsentError(error.status === 429 ? "RATE_LIMIT" : "OTP_FAILED");
        return details();
      });
    },
    load() {
      return run(details);
    },
    decide(allow: boolean) {
      return run(async () => {
        const snapshot = await details();
        if (snapshot.kind === "REDIRECT") return snapshot;
        const options = { skipBrowserRedirect: true };
        const { data, error } = allow
          ? await client.auth.oauth.approveAuthorization(authorizationId, options)
          : await client.auth.oauth.denyAuthorization(authorizationId, options);
        current();
        if (error || !data) throw new McpConsentError("UNAVAILABLE");
        return redirect(data.redirect_url);
      });
    },
    close() {
      if (closeTask) return closeTask;
      closed = true;
      closeTask = (async () => {
        try {
          const { error } = await client.auth.signOut({ scope: "local" });
          if (error) throw new McpConsentError("UNAVAILABLE");
        } catch {
          throw new McpConsentError("UNAVAILABLE");
        } finally {
          lifetime.abort();
        }
      })();
      return closeTask;
    },
  });
}
