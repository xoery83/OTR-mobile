import { z } from "zod";

import { clearLocalSession, readLocalSession, writeLocalSession } from "./authRepository";

const approvedDevProjectRef = "tuqigdxrvrerfewsxqgm";
const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  expires_in: z.number().int().positive(),
});

type DevAuthOptions = {
  url?: string;
  publishableKey?: string;
  fetchImplementation?: typeof fetch;
  persistSession?: typeof writeLocalSession;
  readSession?: typeof readLocalSession;
};

function configuration(options: DevAuthOptions) {
  const url = z.url().parse(options.url ?? process.env.EXPO_PUBLIC_OTR_DEV_SUPABASE_URL);
  if (new URL(url).hostname !== `${approvedDevProjectRef}.supabase.co`) {
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
) {
  const config = configuration(options);
  const response = await config.fetchImplementation(
    `${config.url}/auth/v1/token?grant_type=${grantType}`,
    {
      method: "POST",
      headers: {
        apikey: config.publishableKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );

  if (!response.ok) throw new Error("Supabase Dev authentication failed.");
  const token = tokenResponseSchema.parse(await response.json());
  const expiresAt = new Date(Date.now() + token.expires_in * 1000).toISOString();
  await (options.persistSession ?? writeLocalSession)({
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    expiresAt,
  });
}

export function signInToSupabaseDev(
  email: string,
  password: string,
  options: DevAuthOptions = {},
) {
  return tokenRequest("password", { email, password }, options);
}

export function refreshSupabaseDevSession(
  refreshToken: string,
  options: DevAuthOptions = {},
) {
  return tokenRequest("refresh_token", { refresh_token: refreshToken }, options);
}

export async function revalidateStoredSupabaseDevSession(options: DevAuthOptions = {}) {
  const session = await (options.readSession ?? readLocalSession)();
  if (!session?.refreshToken) return false;

  await refreshSupabaseDevSession(session.refreshToken, options);
  return true;
}

export const signOutOfSupabaseDev = clearLocalSession;
