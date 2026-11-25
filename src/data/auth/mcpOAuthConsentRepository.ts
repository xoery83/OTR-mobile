import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  mcpProviderCallbackPath,
  mcpIdentityProviderState,
  mcpIdentityStatusPath,
  isMcpProviderAuthorizeUrl,
  type McpBrowserProvider,
  type McpProviderInteraction,
} from "./mcpBrowserProvider";
import {
  createRequestBoundary,
  readBoundedBytes,
  readBoundedJson,
} from "../api/requestBoundary";
import { isSupabaseDevPublicKey } from "./devSupabasePublicKey";

import {
  mcpConsentPolicyPinSchema,
  mcpConsentDetailsSchema,
  isMcpOidcScopeSet,
  matchesConsentPolicy,
  matchesConsentScopes,
  type McpConsentDetails,
} from "./mcpOAuthConsentContract";

const devOrigin = "https://tuqigdxrvrerfewsxqgm.supabase.co";
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
export const mcpBetaConsentConfigSchema = z
  .strictObject({
    authOrigin: z.url().refine((value) => {
      const u = new URL(value);
      return (
        u.protocol === "https:" &&
        u.pathname === "/" &&
        !u.username &&
        !u.password &&
        !u.search &&
        !u.hash &&
        (!u.hostname.endsWith("supabase.co") || u.origin === devOrigin)
      );
    }),
    publishableKey: z
      .string()
      .min(31)
      .max(4096)
      .refine((key) => {
        if (isSupabaseDevPublicKey(key)) return true;
        try {
          return (
            JSON.parse(atob(key.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")))
              .role === "anon"
          );
        } catch {
          return false;
        }
      }),
    expiresAt: z.number().int().positive(),
    businessAccess: z.literal("BETA_READ_WRITE"),
    managedNativeOAuth: z.literal(true).optional(),
    managedDev: z
      .strictObject({
        clientId: z.uuid(),
        accountId: z.uuid().nullable(),
        redirectUri: z.url().refine((value) => {
          const u = new URL(value);
          return (
            u.origin === "https://chatgpt.com" &&
            /^\/connector\/oauth\/[a-zA-Z0-9_-]+$/.test(u.pathname) &&
            !u.username &&
            !u.password &&
            !u.search &&
            !u.hash
          );
        }),
      })
      .optional(),
    consentPolicy: mcpConsentPolicyPinSchema.optional(),
    identityLinkEnabled: z.literal(true).optional(),
    browserProviders: z
      .array(z.enum(["google", "apple"]))
      .min(1)
      .max(2)
      .refine((v) => new Set(v).size === v.length)
      .optional(),
  })
  .refine(
    (v) =>
      (!v.managedNativeOAuth || !!v.managedDev) &&
      (!v.browserProviders || !!v.consentPolicy) &&
      (!v.identityLinkEnabled || !!v.browserProviders) &&
      (v.managedDev
        ? new URL(v.authOrigin).origin === devOrigin &&
          v.consentPolicy?.policy.resource === "https://api-dev.xoery.art/mcp" &&
          isSupabaseDevPublicKey(v.publishableKey) &&
          !v.identityLinkEnabled
        : new URL(v.authOrigin).origin !== devOrigin &&
          !v.publishableKey.startsWith("sb_publishable_") &&
          (!v.consentPolicy ||
            v.consentPolicy.policy.resource === new URL(v.authOrigin).origin + "/mcp")),
  );
export type McpBetaConsentConfig = z.infer<typeof mcpBetaConsentConfigSchema>;

export class McpConsentError extends Error {
  constructor(
    public readonly code:
      | "CLOSED"
      | "BUSY"
      | "UNAVAILABLE"
      | "OTP_FAILED"
      | "RATE_LIMIT"
      | "REQUEST_CHANGED"
      | "LINK_UNRESOLVED"
      | "DECISION_UNKNOWN",
  ) {
    super(code);
  }
}
export type McpConsentView =
  | Readonly<{
      kind: "CONSENT";
      accountId: string;
      clientName: string;
      businessAccess?: "READ_WRITE" | "BETA_READ_WRITE" | "MANAGED_READ";
      managedPolicy?: { policyId: string; policyVersion: string; policyHash: string };
      managedRename?: { beforeName: string; afterName: string };
      linkableProviders?: readonly McpBrowserProvider[];
    }>
  | Readonly<{ kind: "REDIRECT"; url: string }>
  | Readonly<{ kind: "DECIDED"; decision: "APPROVED" | "DENIED" }>;

// Browser-only facade over the SAME Supabase Auth SDK, with its normal OTP/session.
// Memory-only SDK storage; no token is returned to UI or another backend audience.
export function createMcpOAuthConsentRepository(
  input: McpConsentConfig | McpBetaConsentConfig,
  authorizationId: string,
  suppliedClient?: SupabaseClient,
  request: typeof fetch = fetch,
  postExchange = false,
) {
  const beta = "authOrigin" in input ? mcpBetaConsentConfigSchema.parse(input) : null;
  const legacy = beta ? null : mcpConsentConfigSchema.parse(input);
  const config = (beta ?? legacy)!;
  const consentPin = beta?.managedNativeOAuth ? undefined : beta?.consentPolicy;
  const managedPin =
    postExchange && beta?.managedNativeOAuth ? beta.consentPolicy : undefined;
  if (postExchange && (!managedPin || !z.uuid().safeParse(authorizationId).success))
    throw new McpConsentError("CLOSED");
  let presentedConsent: McpConsentDetails | undefined;
  let loadedConsent: McpConsentDetails | undefined;
  const origin = beta?.authOrigin.replace(/\/$/, "") ?? devOrigin;
  z.string()
    .regex(/^[A-Za-z0-9_-]{1,256}$/)
    .parse(authorizationId);
  const lifetime = new AbortController();
  let providerAttempt: AbortController | undefined;
  const linkAttempts = new Set<McpBrowserProvider>();
  let busy = false,
    closed = false;
  let closeTask: Promise<void> | undefined;
  let activeTask: Promise<unknown> | undefined;
  let expectedRedirect = beta?.managedDev?.redirectUri;
  let expectedClient = beta?.managedDev?.clientId;
  let presentedWriteAccount: string | undefined;
  let managedVerifiedEmail: string | undefined;
  let managedDecisionPending = false;
  const write = beta !== null || legacy?.businessAccess === "READ_WRITE";
  const current = () => {
    if (closed || Date.now() >= config.expiresAt) throw new McpConsentError("CLOSED");
  };
  const providerFetch: typeof fetch = async (url, init) => {
    const target = new URL(
      typeof url === "string" ? url : url instanceof URL ? url.href : url.url,
    );
    if (target.origin !== origin || !target.pathname.startsWith("/auth/v1/"))
      throw new McpConsentError("REQUEST_CHANGED");
    const headers = new Headers(
      init?.headers ?? (url instanceof Request ? url.headers : undefined),
    );
    if (
      consentPin &&
      [
        `/auth/v1/oauth/authorizations/${authorizationId}`,
        `/auth/v1/oauth/authorizations/${authorizationId}/consent`,
      ].includes(target.pathname)
    )
      headers.set("X-OTR-Consent-Version", "1");
    const logout = target.pathname === "/auth/v1/logout";
    const sessionResponse = ["/auth/v1/verify", "/auth/v1/token"].includes(
      target.pathname,
    );
    if (!logout) current();
    const boundary = createRequestBoundary(10000, lifetime.signal);
    try {
      const response = await boundary.run(() =>
        request(url, {
          ...init,
          headers,
          redirect: "error",
          credentials: "omit",
          signal: boundary.signal,
        }),
      );
      const bytes =
        response.status === 204 || response.status === 205 || response.body === null
          ? null
          : await readBoundedBytes(response, 65536, boundary);
      // Let an already-sent session response reach the SDK so close can revoke it.
      if (!logout && !sessionResponse) current();
      return new Response(bytes ? new Uint8Array(bytes).buffer : null, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    } finally {
      boundary.close();
    }
  };
  const client =
    suppliedClient ??
    createClient(origin, config.publishableKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
        ...(beta?.browserProviders ? { flowType: "pkce" as const } : {}),
      },
      global: { fetch: providerFetch },
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
  function validBetaRedirect(value: string) {
    try {
      const u = new URL(value);
      return (
        !u.username &&
        !u.password &&
        !u.hash &&
        !u.search &&
        (u.protocol === "https:" ||
          (u.protocol === "http:" &&
            u.hostname === "127.0.0.1" &&
            u.pathname === "/callback"))
      );
    } catch {
      return false;
    }
  }
  function redirect(raw: string) {
    if (raw.length > 8192) throw new McpConsentError("REQUEST_CHANGED");
    const actual = new URL(raw);
    const matching = (
      legacy?.redirectUris ?? (expectedRedirect ? [expectedRedirect] : [])
    ).find((value) => {
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
  async function details(includeLinkOptions = false): Promise<McpConsentView> {
    if (managedPin) return managedDetails();
    current();
    const { data: identity, error: identityError } = await client.auth.getUser();
    current();
    if (
      identityError ||
      !identity.user ||
      identity.user.is_anonymous !== false ||
      (beta?.managedDev?.accountId != null && identity.user.id !== beta.managedDev.accountId) ||
      (legacy !== null && !legacy.accountIds.includes(identity.user.id))
    )
      throw new McpConsentError("CLOSED");
    const { data, error } =
      await client.auth.oauth.getAuthorizationDetails(authorizationId);
    current();
    if (error || !data) throw new McpConsentError("UNAVAILABLE");
    if (consentPin) {
      const parsed = mcpConsentDetailsSchema.safeParse(data);
      if (!parsed.success) throw new McpConsentError("REQUEST_CHANGED");
      const d = parsed.data;
      if (
        d.authorization_id !== authorizationId ||
        d.user.id !== identity.user.id ||
        d.resource !== consentPin.policy.resource ||
        !matchesConsentPolicy(d.policy, d.policy_hash, consentPin) ||
        d.consent.policy_version !== consentPin.policy.version ||
        !matchesConsentScopes(d.scope, consentPin) ||
        Date.parse(d.expires_at) <= Date.now() ||
        !validBetaRedirect(d.redirect_uri) ||
        (expectedClient !== undefined && d.client.id !== expectedClient) ||
        (expectedRedirect !== undefined && d.redirect_uri !== expectedRedirect)
      )
        throw new McpConsentError("REQUEST_CHANGED");
      expectedClient = d.client.id;
      expectedRedirect = d.redirect_uri;
      loadedConsent = d;
      if (d.consent.decision === "SATISFIED") {
        if (!consentPin.policy.allow_reuse) throw new McpConsentError("REQUEST_CHANGED");
        const target = new URL(d.redirect_url!);
        if (!target.searchParams.has("code") || target.searchParams.has("error"))
          throw new McpConsentError("REQUEST_CHANGED");
        return redirect(d.redirect_url!);
      }
      const identities = identity.user.identities;
      const linkableProviders =
        includeLinkOptions && beta?.identityLinkEnabled && identities
          ? beta.browserProviders?.filter(
              (provider) =>
                !identities.some((identity) => identity.provider === provider),
            )
          : undefined;
      return Object.freeze({
        kind: "CONSENT",
        accountId: d.user.id,
        clientName: d.client.name,
        businessAccess: "BETA_READ_WRITE",
        ...(linkableProviders?.length ? { linkableProviders } : {}),
      });
    }
    if ("redirect_url" in data) {
      // Managed Supabase may already have a native OAuth grant. OTR Consent is checked after exchange.
      if (write && !beta?.managedNativeOAuth) throw new McpConsentError("REQUEST_CHANGED");
      return redirect(data.redirect_url);
    }
    if (
      data.authorization_id !== authorizationId ||
      (legacy !== null && data.client.id !== legacy.clientId) ||
      (beta !== null &&
        (!z.uuid().safeParse(data.client.id).success ||
          (expectedClient !== undefined && data.client.id !== expectedClient))) ||
      data.user.id !== identity.user.id ||
      (legacy !== null
        ? !legacy.redirectUris.includes(data.redirect_uri)
        : !validBetaRedirect(data.redirect_uri)) ||
      (expectedRedirect !== undefined && data.redirect_uri !== expectedRedirect) ||
      !isMcpOidcScopeSet(data.scope)
    )
      throw new McpConsentError("REQUEST_CHANGED");
    expectedRedirect = data.redirect_uri;
    expectedClient = data.client.id;
    return Object.freeze({
      kind: "CONSENT",
      accountId: identity.user.id,
      clientName: z.string().min(1).max(200).parse(data.client.name),
      ...(beta?.managedNativeOAuth
        ? { businessAccess: "MANAGED_READ" as const }
        : write
          ? {
              businessAccess: beta
                ? ("BETA_READ_WRITE" as const)
                : ("READ_WRITE" as const),
            }
          : {}),
    });
  }
  async function managedRequest(
    input: { action: "inspect" } | { action: "decide"; allow: boolean },
  ) {
    if (!managedPin) throw new McpConsentError("CLOSED");
    const { data, error } = await client.auth.getSession();
    current();
    if (error || !data.session) throw new McpConsentError("CLOSED");
    const token = data.session.access_token;
    const boundary = createRequestBoundary(20000, lifetime.signal);
    try {
      const send = () => boundary.run(() =>
        request(new URL("/oauth/consent", managedPin.policy.resource), {
          method: "POST",
          body: JSON.stringify({ ...input, id: authorizationId }),
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          credentials: "omit",
          redirect: "error",
          cache: "no-store",
          signal: boundary.signal,
        }),
      );
      let response = await send();
      if (input.action === "inspect" && response.status === 503) {
        await response.body?.cancel();
        response = await send();
      }
      if (!response.ok) {
        await response.body?.cancel();
        throw new McpConsentError("UNAVAILABLE");
      }
      return { body: await readBoundedJson(response, 4096, boundary), accountId: data.session.user?.id };
    } finally {
      boundary.close();
    }
  }
  async function managedDetails(): Promise<McpConsentView> {
    const { body, accountId } = await managedRequest({ action: "inspect" }).catch((error) => {
      if (managedDecisionPending) throw new McpConsentError("DECISION_UNKNOWN");
      throw error;
    });
    const parsed = z
      .object({
        id: z.uuid(),
        accountId: z.uuid(),
        state: z.enum(["PENDING", "APPROVED", "DENIED"]),
        policy: z.object({
          policyId: z.string(),
          policyVersion: z.string(),
          policyHash: z.string(),
        }),
        rename: z
          .object({ beforeName: z.string().max(256), afterName: z.string().max(256) })
          .optional(),
        managedWrite: z.literal(true).optional(),
      })
      .safeParse(body);
    if (!parsed.success)
      throw new McpConsentError(managedDecisionPending ? "DECISION_UNKNOWN" : "UNAVAILABLE");
    const view = parsed.data;
    if (
      !managedPin ||
      view.id !== authorizationId ||
      (beta?.managedDev?.accountId === null
        ? view.accountId !== accountId
        : view.accountId !== beta?.managedDev?.accountId) ||
      view.policy.policyId !== managedPin.policy.id ||
      view.policy.policyVersion !== managedPin.policy.version ||
      view.policy.policyHash !== managedPin.policyHash
    )
      throw new McpConsentError("REQUEST_CHANGED");
    if (view.state !== "PENDING") {
      managedDecisionPending = false;
      presentedWriteAccount = undefined;
      return { kind: "DECIDED", decision: view.state };
    }
    // A pending read can race an in-flight decision; it is not proof of rollback.
    if (managedDecisionPending) throw new McpConsentError("DECISION_UNKNOWN");
    return {
      kind: "CONSENT",
      accountId: view.accountId,
      clientName: "ChatGPT",
      businessAccess: view.managedWrite ? "BETA_READ_WRITE" : "MANAGED_READ",
      managedPolicy: view.policy,
      ...(view.rename ? { managedRename: view.rename } : {}),
    };
  }
  async function presentedDetails(includeLinkOptions = false): Promise<McpConsentView> {
    const view = await details(includeLinkOptions);
    if (write && view.kind === "CONSENT") {
      presentedWriteAccount = view.accountId;
      presentedConsent = loadedConsent;
    }
    return view;
  }
  function close() {
    if (closeTask) return closeTask;
    closed = true;
    providerAttempt?.abort();
    presentedConsent = undefined;
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
  return Object.freeze({
    browserProviders: Object.freeze(beta?.browserProviders ?? []),
    identityLinkEnabled: beta?.identityLinkEnabled === true,
    async linkProvider(
      provider: McpBrowserProvider,
      accountId: string,
      interaction: McpProviderInteraction,
    ): Promise<void> {
      let attempt: AbortController | undefined;
      try {
        await run(async () => {
          if (
            !beta?.identityLinkEnabled ||
            !beta.browserProviders?.includes(provider) ||
            !presentedConsent ||
            presentedConsent.user.id !== accountId
          )
            throw new McpConsentError("REQUEST_CHANGED");
          if (linkAttempts.has(provider)) throw new McpConsentError("LINK_UNRESOLVED");
          const verifyAccount = async () => {
            const { data, error } = await client.auth.getUser();
            current();
            if (error || data.user?.id !== accountId || data.user.is_anonymous !== false)
              throw new McpConsentError("REQUEST_CHANGED");
          };
          await verifyAccount();
          linkAttempts.add(provider);
          attempt = providerAttempt = new AbortController();
          const { data, error } = await client.auth.linkIdentity({
            provider,
            options: {
              redirectTo: origin + mcpProviderCallbackPath,
              skipBrowserRedirect: true,
              queryParams: {
                otr_link_confirmed: "true",
                otr_link_account_id: accountId,
              },
            },
          });
          current();
          if (
            error ||
            !data.url ||
            !data.flowId ||
            !/^[A-Za-z0-9_-]{8,64}$/.test(data.flowId)
          )
            throw new McpConsentError("LINK_UNRESOLVED");
          const flowId = mcpIdentityProviderState(new URL(data.url), origin, provider);
          if (!flowId) throw new McpConsentError("REQUEST_CHANGED");
          try {
            const code = await interaction.receive(data.url, attempt.signal);
            current();
            if (!/^[A-Za-z0-9_-]{1,2048}$/.test(code))
              throw new McpConsentError("REQUEST_CHANGED");
            await client.auth.exchangeCodeForSession(code, { flowId: data.flowId });
          } catch {
            current();
          }
          // A callback or code exchange can be lost after the owning transaction commits.
          await verifyAccount();
          const { data: session, error: sessionError } = await client.auth.getSession();
          if (sessionError || session.session?.user.id !== accountId)
            throw new McpConsentError("REQUEST_CHANGED");
          const receipt = await providerFetch(
            origin + mcpIdentityStatusPath + "?flow_id=" + flowId,
            {
              method: "GET",
              headers: {
                apikey: config.publishableKey,
                Authorization: `Bearer ${session.session.access_token}`,
              },
            },
          );
          if (!receipt.ok) throw new McpConsentError("LINK_UNRESOLVED");
          const proof = z
            .strictObject({
              status: z.literal("LINKED"),
              flow_id: z.literal(flowId),
              account_id: z.literal(accountId),
              identity_id: z.uuid(),
              provider: z.literal(provider),
              audit_event_id: z.uuid(),
            })
            .safeParse(await receipt.json());
          current();
          if (!proof.success) throw new McpConsentError("LINK_UNRESOLVED");
        });
      } finally {
        if (providerAttempt === attempt) providerAttempt = undefined;
        interaction.close();
      }
    },
    async signInProvider(
      provider: McpBrowserProvider,
      interaction: McpProviderInteraction,
    ): Promise<McpConsentView> {
      let attempt: AbortController | undefined;
      try {
        return await run(async () => {
          if (!beta?.browserProviders?.includes(provider) || !beta.consentPolicy)
            throw new McpConsentError("CLOSED");
          presentedConsent = undefined;
          presentedWriteAccount = undefined;
          attempt = providerAttempt = new AbortController();
          const callbackOrigin = beta.managedDev
            ? new URL(beta.consentPolicy.policy.resource).origin
            : origin;
          const returnUrl = callbackOrigin + mcpProviderCallbackPath;
          const { data, error } = await client.auth.signInWithOAuth({
            provider,
            options: { redirectTo: returnUrl, skipBrowserRedirect: true },
          });
          current();
          if (
            error ||
            !data.url ||
            !data.flowId ||
            !/^[A-Za-z0-9_-]{8,64}$/.test(data.flowId)
          )
            throw new McpConsentError("UNAVAILABLE");
          const url = new URL(data.url);
          if (!isMcpProviderAuthorizeUrl(url, origin, [provider], callbackOrigin))
            throw new McpConsentError("REQUEST_CHANGED");
          const code = await interaction.receive(url.href, providerAttempt.signal);
          current();
          if (!/^[A-Za-z0-9_-]{1,2048}$/.test(code))
            throw new McpConsentError("REQUEST_CHANGED");
          const exchanged = await client.auth.exchangeCodeForSession(code, {
            flowId: data.flowId,
          });
          current();
          if (exchanged.error) throw new McpConsentError("UNAVAILABLE");
          return presentedDetails();
        });
      } finally {
        if (providerAttempt === attempt) providerAttempt = undefined;
        interaction.close();
      }
    },
    requestCode(email: string) {
      return run(async () => {
        if (legacy && email.toLowerCase() !== legacy.qaEmail.toLowerCase())
          throw new McpConsentError("CLOSED");
        presentedWriteAccount = undefined;
        presentedConsent = undefined;
        managedVerifiedEmail = undefined;
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
        presentedConsent = undefined;
        if (legacy && email.toLowerCase() !== legacy.qaEmail.toLowerCase())
          throw new McpConsentError("CLOSED");
        const recipient = z.email().parse(email);
        const token = z.string().regex(/^\d{8}$/).parse(code);
        if (recipient !== managedVerifiedEmail) {
          const { error } = await client.auth.verifyOtp({ email: recipient, token, type: "email" });
          if (error) otpFailure(error.status);
          // Retrying an inspection must not resubmit an already consumed OTP.
          if (managedPin) managedVerifiedEmail = recipient;
        }
        return presentedDetails(true);
      });
    },
    load() {
      return run(presentedDetails);
    },
    decide(allow: boolean) {
      return run(async () => {
        const shownAccount = presentedWriteAccount;
        if (managedPin) {
          if (managedDecisionPending) return managedDetails();
          if (!shownAccount) throw new McpConsentError("REQUEST_CHANGED");
          const expected = allow ? "APPROVED" : "DENIED";
          managedDecisionPending = true;
          try {
            const response = (await managedRequest({ action: "decide", allow })).body;
            const result = z
              .object({ id: z.uuid(), decision: z.enum(["APPROVED", "DENIED"]) })
              .parse(response);
            if (result.id !== authorizationId || result.decision !== expected)
              throw new McpConsentError("REQUEST_CHANGED");
            managedDecisionPending = false;
            presentedWriteAccount = undefined;
            return { kind: "DECIDED" as const, decision: result.decision };
          } catch (error) {
            // Recover this request read-only; never resend or reverse an uncertain decision.
            const current = await managedDetails().catch(() => null);
            if (current?.kind === "DECIDED") return current;
            if (error instanceof McpConsentError && error.code === "REQUEST_CHANGED") throw error;
            throw new McpConsentError("DECISION_UNKNOWN");
          }
        }
        if (consentPin) {
          const shown = presentedConsent;
          if (
            !shown ||
            shown.consent.decision !== "REQUIRED" ||
            Date.parse(shown.expires_at) <= Date.now()
          )
            throw new McpConsentError("REQUEST_CHANGED");
          const { data: identity, error: identityError } = await client.auth.getUser();
          current();
          if (
            identityError ||
            identity.user?.id !== shown.user.id ||
            identity.user?.is_anonymous !== false
          )
            throw new McpConsentError("REQUEST_CHANGED");
          const { data: session, error: sessionError } = await client.auth.getSession();
          current();
          if (sessionError || !session.session) throw new McpConsentError("CLOSED");
          const token = z
            .string()
            .max(8192)
            .regex(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/)
            .parse(session.session.access_token);
          // Do not re-read details: SATISFIED GET can issue a code before a user's Deny.
          presentedConsent = undefined;
          presentedWriteAccount = undefined;
          const response = await providerFetch(
            origin + `/auth/v1/oauth/authorizations/${authorizationId}/consent`,
            {
              method: "POST",
              headers: {
                apikey: config.publishableKey,
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                action: allow ? "approve" : "deny",
                decision_id: shown.consent.decision_id,
              }),
            },
          );
          if (response.status === 409) throw new McpConsentError("REQUEST_CHANGED");
          if (!response.ok) throw new McpConsentError("UNAVAILABLE");
          const result = z
            .strictObject({ redirect_url: z.url() })
            .parse(await response.json());
          const target = new URL(result.redirect_url);
          if (
            allow
              ? !target.searchParams.has("code") || target.searchParams.has("error")
              : target.searchParams.get("error") !== "access_denied" ||
                target.searchParams.has("code")
          )
            throw new McpConsentError("REQUEST_CHANGED");
          return redirect(result.redirect_url);
        }
        if (write && allow && !shownAccount) throw new McpConsentError("REQUEST_CHANGED");
        const snapshot = await details();
        if (snapshot.kind === "REDIRECT") return snapshot;
        if (snapshot.kind !== "CONSENT") throw new McpConsentError("REQUEST_CHANGED");
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
  });
}
