import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  createRequestBoundary,
  readBoundedBytes,
  readBoundedJson,
} from "../api/requestBoundary";
import { isSupabaseDevPublicKey } from "./devSupabasePublicKey";

const origin = "https://tuqigdxrvrerfewsxqgm.supabase.co";
export const mcpConsentConfigSchema = z.object({
  clientId: z.uuid(),
  redirectUris: z
    .array(
      z.url().refine((value) => {
        const u = new URL(value);
        return (
          (u.protocol === "https:" || value === "http://127.0.0.1:18764/callback") &&
          !u.username &&
          !u.password &&
          !u.search &&
          !u.hash
        );
      }),
    )
    .min(1)
    .max(2)
    .refine((values) => new Set(values).size === values.length),
  qaEmail: z.email(),
  publishableKey: z.string().refine(isSupabaseDevPublicKey, "PUBLIC_DEV_KEY_REQUIRED"),
  accountIds: z.array(z.uuid()).min(1).max(2),
  expiresAt: z.number().int().positive(),
  businessAccess: z.literal("READ_WRITE").optional(),
});
export type McpConsentConfig = z.infer<typeof mcpConsentConfigSchema>;
export class McpConsentError extends Error {
  constructor(
    public readonly code:
      | "CLOSED"
      | "BUSY"
      | "UNAVAILABLE"
      | "OTP_FAILED"
      | "RATE_LIMIT"
      | "REQUEST_CHANGED"
      | "CLEANUP_UNPROVEN",
  ) {
    super(code);
  }
}
export type McpConsentView =
  | Readonly<{
      kind: "CONSENT";
      accountId: string;
      clientName: string;
      businessAccess?: "READ_WRITE";
    }>
  | Readonly<{ kind: "REDIRECT"; url: string }>;

export const mcpVerifiedCloseBindingSchema = z.strictObject({
  runId: z.uuid(),
  accountId: z.uuid(),
  requestedAt: z.iso.datetime(),
});
export type McpVerifiedCloseBinding = z.infer<typeof mcpVerifiedCloseBindingSchema>;
export type McpVerifiedCloseResult = Readonly<{
  kind: "BROWSER_LOCAL_CLEANUP_VERIFIED";
  binding: Readonly<McpVerifiedCloseBinding>;
  localLogout: "COMPLETED";
  refresh: "SERVER_REJECTED";
  hostUnlockAuthorized: false;
}>;

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
  let verifiedCloseTask: Promise<McpVerifiedCloseResult> | undefined;
  let verifiedCloseBinding: McpVerifiedCloseBinding | undefined;
  let activeTask: Promise<unknown> | undefined;
  let verifiedLogoutAccessToken: string | undefined;
  let verifiedLogoutObserved = false;
  let verifiedRefresh:
    | { token: string; attempted: boolean; rejected: boolean; accepted: boolean }
    | undefined;
  let expectedRedirect: string | undefined;
  let presentedWriteAccount: string | undefined;
  const write = config.businessAccess === "READ_WRITE";
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
          const sessionResponse = ["/auth/v1/verify", "/auth/v1/token"].includes(
            target.pathname,
          );
          const cleanupRefresh = Boolean(
            verifiedRefresh &&
            target.pathname === "/auth/v1/token" &&
            target.search === "?grant_type=refresh_token",
          );
          if (cleanupRefresh) {
            const body = z
              .strictObject({ refresh_token: z.literal(verifiedRefresh!.token) })
              .safeParse(JSON.parse(String(init?.body)));
            if (verifiedRefresh!.attempted || init?.method !== "POST" || !body.success)
              return Response.json({ code: "qa_cleanup_unproven" }, { status: 400 });
            verifiedRefresh!.attempted = true;
          } else if (!logout) current();
          if (
            logout &&
            verifiedLogoutAccessToken &&
            (target.search !== "?scope=local" ||
              init?.method !== "POST" ||
              new Headers(init.headers).get("Authorization") !==
                `Bearer ${verifiedLogoutAccessToken}`)
          )
            throw new McpConsentError("CLEANUP_UNPROVEN");
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
            if (logout && verifiedLogoutAccessToken && response.status === 204)
              verifiedLogoutObserved = true;
            if (cleanupRefresh && verifiedRefresh) {
              verifiedRefresh.accepted = response.status === 200;
              try {
                const error = z
                  .object({
                    code: z.string().optional(),
                    error_code: z.string().optional(),
                  })
                  .parse(JSON.parse(new TextDecoder().decode(bytes ?? new Uint8Array())));
                const codes = [error.code, error.error_code].filter(
                  (v): v is string => v !== undefined,
                );
                verifiedRefresh.rejected =
                  [400, 401, 403].includes(response.status) &&
                  codes.length > 0 &&
                  codes.every((code) =>
                    ["refresh_token_not_found", "session_not_found"].includes(code),
                  );
              } catch {
                /* A malformed response cannot establish revocation. */
              }
            }
            // Let an already-sent session response reach the SDK so close can revoke it.
            if (!logout && !sessionResponse) current();
            return new Response(bytes ? new Uint8Array(bytes).buffer : null, {
              status: response.status,
              statusText: response.statusText,
              headers: response.headers,
            });
          } catch (error) {
            // SDK retries thrown fetch errors. This internal marker stops retry, never proves revocation.
            if (cleanupRefresh)
              return Response.json({ code: "qa_cleanup_unproven" }, { status: 400 });
            throw error;
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
    const task = Promise.resolve().then(async () => {
      current();
      const result = await work();
      current();
      return result;
    });
    activeTask = task;
    try {
      return await task;
    } catch (error) {
      if (closed || Date.now() >= config.expiresAt) throw new McpConsentError("CLOSED");
      if (error instanceof McpConsentError) throw error;
      throw new McpConsentError("UNAVAILABLE");
    } finally {
      busy = false;
      if (activeTask === task) activeTask = undefined;
      if (!closed && Date.now() >= config.expiresAt) void close().catch(() => undefined);
    }
  }
  function redirect(raw: string) {
    if (raw.length > 8192) throw new McpConsentError("REQUEST_CHANGED");
    const actual = new URL(raw);
    const matching = config.redirectUris.find((value) => {
      const expected = new URL(value);
      return expected.origin === actual.origin && expected.pathname === actual.pathname;
    });
    if (
      !matching ||
      (expectedRedirect !== undefined && matching !== expectedRedirect) ||
      actual.username ||
      actual.password ||
      actual.hash
    )
      throw new McpConsentError("REQUEST_CHANGED");
    expectedRedirect = matching;
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
  function otpFailure(status?: number): never {
    throw new McpConsentError(
      status === 429
        ? "RATE_LIMIT"
        : status !== undefined && [400, 401, 403, 422].includes(status)
          ? "OTP_FAILED"
          : "UNAVAILABLE",
    );
  }
  async function details(): Promise<McpConsentView> {
    current();
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
    if ("redirect_url" in data) {
      if (write) throw new McpConsentError("REQUEST_CHANGED");
      return redirect(data.redirect_url);
    }
    if (
      data.authorization_id !== authorizationId ||
      data.client.id !== config.clientId ||
      data.user.id !== identity.user.id ||
      !config.redirectUris.includes(data.redirect_uri) ||
      (expectedRedirect !== undefined && data.redirect_uri !== expectedRedirect) ||
      !["openid", "openid offline_access", "offline_access openid"].includes(data.scope)
    )
      throw new McpConsentError("REQUEST_CHANGED");
    expectedRedirect = data.redirect_uri;
    return Object.freeze({
      kind: "CONSENT",
      accountId: identity.user.id,
      clientName: z.string().min(1).max(200).parse(data.client.name),
      ...(write ? { businessAccess: "READ_WRITE" as const } : {}),
    });
  }
  async function presentedDetails(): Promise<McpConsentView> {
    const view = await details();
    if (write && view.kind === "CONSENT") presentedWriteAccount = view.accountId;
    return view;
  }
  function close() {
    if (verifiedCloseTask) return verifiedCloseTask.then(() => undefined);
    if (closeTask) return closeTask;
    closed = true;
    const pending = activeTask;
    closeTask = (async () => {
      try {
        // verifyOtp may install the SDK session after a network response settles.
        await pending?.catch(() => undefined);
        const { error } = await client.auth.signOut({ scope: "local" });
        if (error) throw new McpConsentError("UNAVAILABLE");
      } catch {
        throw new McpConsentError("UNAVAILABLE");
      } finally {
        lifetime.abort();
      }
    })();
    return closeTask;
  }
  // QA-only opt-in; result is local observation, not a Host-verifiable receipt.
  function closeVerified(
    input: McpVerifiedCloseBinding,
  ): Promise<McpVerifiedCloseResult> {
    const binding = mcpVerifiedCloseBindingSchema.parse(input);
    if (verifiedCloseTask) {
      if (JSON.stringify(binding) !== JSON.stringify(verifiedCloseBinding))
        return Promise.reject(new McpConsentError("REQUEST_CHANGED"));
      return verifiedCloseTask;
    }
    current();
    if (closeTask || !config.accountIds.includes(binding.accountId))
      return Promise.reject(new McpConsentError("CLEANUP_UNPROVEN"));
    verifiedCloseBinding = Object.freeze({ ...binding });
    closed = true;
    const pending = activeTask;
    verifiedCloseTask = (async () => {
      let logoutAttempted = false;
      try {
        await pending?.catch(() => undefined);
        const { data, error } = await client.auth.getSession();
        const captured = z
          .object({
            access_token: z.string().min(1),
            refresh_token: z.string().min(1),
            user: z.object({ id: z.literal(binding.accountId) }),
          })
          .safeParse(data.session);
        if (error || !captured.success) throw new McpConsentError("CLEANUP_UNPROVEN");
        const ownSession = captured.data;
        // Narrow cleanup requests bypass CLOSED, never reopen normal repository work.
        const identityBoundary = createRequestBoundary(10000, lifetime.signal);
        let identity: { status: number; body: unknown };
        try {
          const response = await identityBoundary.run(() =>
            fetch(origin + "/auth/v1/user", {
              method: "GET",
              credentials: "omit",
              redirect: "error",
              signal: identityBoundary.signal,
              headers: {
                apikey: config.publishableKey,
                Authorization: `Bearer ${ownSession.access_token}`,
              },
            }),
          );
          identity = {
            status: response.status,
            body: await readBoundedJson(response, 65536, identityBoundary),
          };
        } finally {
          identityBoundary.close();
        }
        const own = z
          .object({
            id: z.literal(binding.accountId),
            is_anonymous: z.literal(false),
            email: z.email(),
          })
          .safeParse(identity.body);
        if (
          identity.status !== 200 ||
          !own.success ||
          own.data.email.toLowerCase() !== config.qaEmail.toLowerCase()
        )
          throw new McpConsentError("CLEANUP_UNPROVEN");
        verifiedLogoutAccessToken = ownSession.access_token;
        logoutAttempted = true;
        const { error: logoutError } = await client.auth.signOut({ scope: "local" });
        verifiedLogoutAccessToken = undefined;
        if (logoutError || !verifiedLogoutObserved)
          throw new McpConsentError("CLEANUP_UNPROVEN");
        const refreshObservation = {
          token: ownSession.refresh_token,
          attempted: false,
          rejected: false,
          accepted: false,
        };
        verifiedRefresh = refreshObservation;
        const refreshed = await client.auth.refreshSession({
          refresh_token: ownSession.refresh_token,
        });
        verifiedRefresh = undefined;
        if (refreshObservation.accepted) {
          // SDK retains an unexpected successful refresh; clean only that new own Session once.
          const unexpected = refreshed.data.session;
          if (unexpected?.user.id === binding.accountId) {
            verifiedLogoutAccessToken = unexpected.access_token;
            await client.auth.signOut({ scope: "local" }).catch(() => undefined);
            verifiedLogoutAccessToken = undefined;
          }
          throw new McpConsentError("CLEANUP_UNPROVEN");
        }
        if (!refreshObservation.rejected || !refreshed.error)
          throw new McpConsentError("CLEANUP_UNPROVEN");
        return Object.freeze({
          kind: "BROWSER_LOCAL_CLEANUP_VERIFIED" as const,
          binding: verifiedCloseBinding!,
          localLogout: "COMPLETED" as const,
          refresh: "SERVER_REJECTED" as const,
          hostUnlockAuthorized: false as const,
        });
      } catch {
        throw new McpConsentError("CLEANUP_UNPROVEN");
      } finally {
        verifiedRefresh = undefined;
        verifiedLogoutAccessToken = undefined;
        // Proof failure must not suppress the original close's best-effort own cleanup.
        if (!logoutAttempted) {
          logoutAttempted = true;
          await client.auth.signOut({ scope: "local" }).catch(() => undefined);
        }
        lifetime.abort();
      }
    })();
    return verifiedCloseTask;
  }
  return Object.freeze({
    requestCode(email: string) {
      return run(async () => {
        if (email.toLowerCase() !== config.qaEmail.toLowerCase())
          throw new McpConsentError("CLOSED");
        presentedWriteAccount = undefined;
        const { error } = await client.auth.signInWithOtp({
          email: z.email().parse(email),
          options: { shouldCreateUser: false },
        });
        if (error) otpFailure(error.status);
      });
    },
    verifyCode(email: string, code: string) {
      return run(async () => {
        presentedWriteAccount = undefined;
        if (email.toLowerCase() !== config.qaEmail.toLowerCase())
          throw new McpConsentError("CLOSED");
        const { error } = await client.auth.verifyOtp({
          email: z.email().parse(email),
          token: z
            .string()
            .regex(/^\d{8}$/)
            .parse(code),
          type: "email",
        });
        if (error) otpFailure(error.status);
        return presentedDetails();
      });
    },
    load() {
      return run(presentedDetails);
    },
    decide(allow: boolean) {
      return run(async () => {
        const shownAccount = presentedWriteAccount;
        if (write && allow && !shownAccount) throw new McpConsentError("REQUEST_CHANGED");
        const snapshot = await details();
        if (snapshot.kind === "REDIRECT") return snapshot;
        if (write && allow && snapshot.accountId !== shownAccount) {
          presentedWriteAccount = undefined;
          throw new McpConsentError("REQUEST_CHANGED");
        }
        const options = { skipBrowserRedirect: true };
        const { data, error } = allow
          ? await client.auth.oauth.approveAuthorization(authorizationId, options)
          : await client.auth.oauth.denyAuthorization(authorizationId, options);
        current();
        if (error || !data) throw new McpConsentError("UNAVAILABLE");
        presentedWriteAccount = undefined;
        return redirect(data.redirect_url);
      });
    },
    close,
    closeVerified,
  });
}
