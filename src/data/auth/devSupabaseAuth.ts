import { z } from "zod";

import { clearLocalSession, readLocalSession, writeLocalSession } from "./authRepository";
import {
  identityFromAccessToken,
  type AccountIdentity,
  type LocalSession,
} from "@/domain/auth/localSession";

const approvedDevProjectRef = "tuqigdxrvrerfewsxqgm";
const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  expires_in: z.number().int().positive(),
  user: z
    .object({
      id: z.string().min(1),
      email: z.string().nullable().optional(),
      user_metadata: z.record(z.string(), z.unknown()).optional(),
    })
    .optional(),
});

export type DevAuthOptions = {
  url?: string;
  publishableKey?: string;
  fetchImplementation?: typeof fetch;
  persistSession?: typeof writeLocalSession;
  readSession?: typeof readLocalSession;
  signal?: AbortSignal;
};

export class SupabaseDevAuthError extends Error {
  constructor(
    message: string,
    public readonly kind:
      "network" | "temporary" | "invalid_session" | "invalid_code" | "rate_limited",
    public readonly status?: number,
  ) {
    super(message);
  }
}

function configuration(options: DevAuthOptions) {
  const url = z.url().parse(options.url ?? process.env.EXPO_PUBLIC_OTR_DEV_SUPABASE_URL);
  const target = new URL(url);
  if (
    target.origin !== `https://${approvedDevProjectRef}.supabase.co` ||
    target.pathname !== "/" ||
    target.search ||
    target.hash ||
    target.username ||
    target.password
  ) {
    throw new Error("Dev Auth may connect only to the approved Supabase Dev project.");
  }

  return {
    url: url.replace(/\/$/, ""),
    publishableKey: z
      .string()
      .min(1)
      .parse(
        options.publishableKey ??
          process.env.EXPO_PUBLIC_OTR_DEV_SUPABASE_PUBLISHABLE_KEY,
      ),
    fetchImplementation: options.fetchImplementation ?? fetch,
  };
}

async function tokenRequest(
  grantType: "password" | "refresh_token",
  body: Record<string, string>,
  options: DevAuthOptions,
  fallbackIdentity?: AccountIdentity,
): Promise<LocalSession> {
  const token = await authRequest(
    `/token?grant_type=${grantType}`,
    body,
    options,
    grantType === "refresh_token",
  );
  const session = sessionFromToken(token, fallbackIdentity);
  await (options.persistSession ?? writeLocalSession)(session);
  return session;
}

async function authRequest(
  path: string,
  body: Record<string, unknown>,
  options: DevAuthOptions,
  refreshing = false,
) {
  const config = configuration(options);
  const controller = new AbortController();
  const canceled = new Promise<never>((_resolve, reject) => {
    controller.signal.addEventListener(
      "abort",
      () => reject(new Error("AUTH_REQUEST_ABORTED")),
      { once: true },
    );
  });
  const cancel = () => controller.abort();
  options.signal?.addEventListener("abort", cancel, { once: true });
  if (options.signal?.aborted) controller.abort();
  const timer = setTimeout(cancel, 15_000);
  let response: Response;
  try {
    response = await Promise.race([
      config.fetchImplementation(`${config.url}/auth/v1${path}`, {
        method: "POST",
        headers: {
          apikey: config.publishableKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      }),
      canceled,
    ]);
    if (controller.signal.aborted) throw new Error("AUTH_REQUEST_ABORTED");
    if (!response.ok) {
      const failure: unknown = await Promise.race([
        response.json().catch(() => null),
        canceled,
      ]);
      const code = z.object({ code: z.string() }).safeParse(failure);
      const rejectedRefresh =
        code.success &&
        [
          "refresh_token_not_found",
          "refresh_token_already_used",
          "session_not_found",
          "session_expired",
          "user_banned",
          "user_not_found",
        ].includes(code.data.code);
      throw new SupabaseDevAuthError(
        "Supabase Dev authentication failed.",
        response.status === 429
          ? "rate_limited"
          : refreshing && [400, 401, 403].includes(response.status) && rejectedRefresh
            ? "invalid_session"
            : path === "/verify" && [400, 401, 403, 422].includes(response.status)
              ? "invalid_code"
              : "temporary",
        response.status,
      );
    }
    const value: unknown = await Promise.race([response.json(), canceled]);
    if (controller.signal.aborted) throw new Error("AUTH_REQUEST_ABORTED");
    return value;
  } catch (error) {
    if (error instanceof SupabaseDevAuthError) throw error;
    throw new SupabaseDevAuthError(
      "Supabase Dev authentication is unavailable.",
      "network",
    );
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", cancel);
  }
}

function sessionFromToken(
  value: unknown,
  fallbackIdentity?: AccountIdentity,
): LocalSession {
  const token = tokenResponseSchema.parse(value);
  const expiresAt = new Date(Date.now() + token.expires_in * 1000).toISOString();
  const identity = identityFromToken(token, fallbackIdentity);
  const claims = identityFromAccessToken(token.access_token);
  if (
    !identity ||
    (fallbackIdentity && identity.userId !== fallbackIdentity.userId) ||
    (claims && claims.userId !== identity.userId)
  )
    throw new SupabaseDevAuthError(
      "Supabase Dev authentication returned an inconsistent identity.",
      "invalid_session",
    );
  return {
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    expiresAt,
    identity,
  };
}

// Verification is provisional: only the account/adoption boundary installs a session.
export async function requestSupabaseDevEmailOtp(
  email: string,
  options: DevAuthOptions = {},
) {
  await authRequest(
    "/otp",
    { email: z.email().parse(email.trim()), create_user: true },
    options,
  );
}

export async function verifySupabaseDevEmailOtp(
  email: string,
  code: string,
  options: DevAuthOptions = {},
) {
  const value = await authRequest(
    "/verify",
    {
      email: z.email().parse(email.trim()),
      token: z
        .string()
        .regex(/^\d{6,8}$/)
        .parse(code.trim()),
      type: "email",
    },
    options,
  );
  return sessionFromToken(value);
}

export async function authenticateSupabaseDevProvider(
  input: { provider: "apple" | "google"; idToken: string; nonce: string },
  options: DevAuthOptions = {},
) {
  const credential = z
    .strictObject({
      provider: z.enum(["apple", "google"]),
      idToken: z.string().min(1),
      nonce: z.string().min(1),
    })
    .parse(input);
  return sessionFromToken(
    await authRequest(
      "/token?grant_type=id_token",
      {
        provider: credential.provider,
        id_token: credential.idToken,
        nonce: credential.nonce,
      },
      options,
    ),
  );
}

export function signInToSupabaseDev(
  email: string,
  password: string,
  options: DevAuthOptions = {},
) {
  return tokenRequest("password", { email, password }, options);
}

export function authenticateToSupabaseDev(
  email: string,
  password: string,
  options: DevAuthOptions = {},
) {
  return tokenRequest(
    "password",
    { email, password },
    {
      ...options,
      persistSession: async () => undefined,
    },
  );
}

export function refreshSupabaseDevSession(
  refreshToken: string,
  options: DevAuthOptions = {},
  fallbackIdentity?: AccountIdentity,
) {
  return tokenRequest(
    "refresh_token",
    { refresh_token: refreshToken },
    options,
    fallbackIdentity,
  );
}

export async function revalidateStoredSupabaseDevSession(options: DevAuthOptions = {}) {
  const session = await (options.readSession ?? readLocalSession)();
  if (!session?.refreshToken) return false;

  await refreshSupabaseDevSession(session.refreshToken, options, session.identity);
  return true;
}

export const signOutOfSupabaseDev = clearLocalSession;

function identityFromToken(
  token: z.infer<typeof tokenResponseSchema>,
  fallback?: AccountIdentity,
) {
  const metadata = token.user?.user_metadata;
  const displayName = [metadata?.display_name, metadata?.full_name, metadata?.name].find(
    (value): value is string => typeof value === "string" && Boolean(value.trim()),
  );
  if (token.user)
    return {
      userId: token.user.id,
      email: token.user.email ?? null,
      displayName:
        displayName?.trim() ||
        token.user.email?.split("@")[0] ||
        fallback?.displayName ||
        "Account",
    };
  return identityFromAccessToken(token.access_token) ?? fallback ?? null;
}
