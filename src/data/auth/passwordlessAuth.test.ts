import { describe, expect, it, vi } from "vitest";
import {
  authenticateSupabaseDevProvider,
  requestSupabaseDevEmailOtp,
  verifySupabaseDevEmailOtp,
  refreshSupabaseDevSession,
  revokeSupabaseDevSession,
} from "./devSupabaseAuth";

vi.mock("./authRepository", () => ({
  clearLocalSession: vi.fn(),
  readLocalSession: vi.fn(),
  writeLocalSession: vi.fn(),
}));

const identity = {
  userId: "00000000-0000-4000-8000-000000000001",
  email: "qa@example.test",
  displayName: "QA",
};
const token = {
  access_token: "access",
  refresh_token: "refresh",
  expires_in: 3600,
  user: { id: identity.userId, email: identity.email },
};
function options(response = Response.json(token)) {
  return {
    url: "https://tuqigdxrvrerfewsxqgm.supabase.co",
    publishableKey: "public-key",
    fetchImplementation: vi.fn(async () => response),
    persistSession: vi.fn(),
  };
}

describe("passwordless DEV authentication", () => {
  it.each([200, 204])(
    "revokes only the current session and accepts an empty HTTP %i response",
    async (status) => {
      const config = options(new Response(null, { status }));
      await revokeSupabaseDevSession("own-session-token", config);
      expect(config.fetchImplementation).toHaveBeenCalledWith(
        `${config.url}/auth/v1/logout?scope=local`,
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({ Authorization: "Bearer own-session-token" }),
          body: undefined,
        }),
      );
      expect(config.persistSession).not.toHaveBeenCalled();
    },
  );

  it("does not resend or clear credentials on an unknown remote logout outcome", async () => {
    const config = options();
    config.fetchImplementation.mockRejectedValueOnce(new Error("response lost"));
    await expect(
      revokeSupabaseDevSession("own-session-token", config),
    ).rejects.toMatchObject({ kind: "network" });
    expect(config.fetchImplementation).toHaveBeenCalledOnce();
    expect(config.persistSession).not.toHaveBeenCalled();
  });
  it("requests a code without a redirect, password, session install or business upload", async () => {
    const config = options(Response.json({}));
    await requestSupabaseDevEmailOtp(" qa@example.test ", config);
    expect(config.fetchImplementation).toHaveBeenCalledWith(
      `${config.url}/auth/v1/otp`,
      expect.objectContaining({
        method: "POST",
        redirect: "error",
        body: JSON.stringify({ email: identity.email, create_user: true }),
      }),
    );
    expect(config.persistSession).not.toHaveBeenCalled();
  });

  it("verifies an entered code and returns a provisional stable Account", async () => {
    const config = options();
    const session = await verifySupabaseDevEmailOtp(identity.email, " 123456 ", config);
    expect(session).toMatchObject({
      accessToken: "access",
      refreshToken: "refresh",
      identity: { userId: identity.userId, email: identity.email },
    });
    expect(config.fetchImplementation).toHaveBeenCalledWith(
      `${config.url}/auth/v1/verify`,
      expect.objectContaining({
        body: JSON.stringify({ email: identity.email, token: "123456", type: "email" }),
      }),
    );
    expect(config.persistSession).not.toHaveBeenCalled();
  });

  it.each(["123456", "12345678"])("accepts configured OTP length %s", async (code) => {
    await expect(
      verifySupabaseDevEmailOtp(identity.email, code, options()),
    ).resolves.toHaveProperty("identity.userId", identity.userId);
  });

  it.each(["", "abc123", "12345", "123456789", "https://example.test/callback"])(
    "rejects invalid code before transport: %s",
    async (code) => {
      const config = options();
      await expect(
        verifySupabaseDevEmailOtp(identity.email, code, config),
      ).rejects.toThrow();
      expect(config.fetchImplementation).not.toHaveBeenCalled();
    },
  );

  it("rejects invalid email before sending", async () => {
    const config = options();
    await expect(requestSupabaseDevEmailOtp("invalid", config)).rejects.toThrow();
    expect(config.fetchImplementation).not.toHaveBeenCalled();
  });

  it.each([
    [400, "invalid_code"],
    [401, "invalid_code"],
    [403, "invalid_code"],
    [422, "invalid_code"],
    [429, "rate_limited"],
    [503, "temporary"],
  ])(
    "classifies verify HTTP %i without echoing private server content",
    async (status, kind) => {
      const config = options(
        Response.json({ message: "private-email-and-token" }, { status: Number(status) }),
      );
      await expect(
        verifySupabaseDevEmailOtp(identity.email, "123456", config),
      ).rejects.toMatchObject({ kind, status });
      expect(config.persistSession).not.toHaveBeenCalled();
    },
  );

  it("canceled verification never returns or installs a session", async () => {
    const cancel = new AbortController();
    const config = options();
    cancel.abort();
    await expect(
      verifySupabaseDevEmailOtp(identity.email, "123456", {
        ...config,
        signal: cancel.signal,
      }),
    ).rejects.toMatchObject({ kind: "network" });
    expect(config.persistSession).not.toHaveBeenCalled();
  });

  it("bounds an unresponsive request and does not automatically resend OTP", async () => {
    vi.useFakeTimers();
    try {
      const config = options();
      config.fetchImplementation.mockImplementation(
        (_url?: unknown, init?: RequestInit) =>
          new Promise((_resolve, reject) =>
            init?.signal?.addEventListener("abort", () => reject(new Error("timeout"))),
          ),
      );
      const pending = requestSupabaseDevEmailOtp(identity.email, config);
      const assertion = expect(pending).rejects.toMatchObject({ kind: "network" });
      await vi.advanceTimersByTimeAsync(15_000);
      await assertion;
      expect(config.fetchImplementation).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it("cancellation during response body reading rejects the late verified session", async () => {
    const cancel = new AbortController();
    let finish!: (value: unknown) => void;
    const response = Response.json(token);
    response.json = () =>
      new Promise((resolve) => {
        finish = resolve;
      });
    const config = options(response);
    const pending = verifySupabaseDevEmailOtp(identity.email, "123456", {
      ...config,
      signal: cancel.signal,
    });
    await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
    cancel.abort();
    finish(token);
    await expect(pending).rejects.toMatchObject({ kind: "network" });
    expect(config.persistSession).not.toHaveBeenCalled();
  });

  it.each(["apple", "google"] as const)(
    "exchanges a verified %s credential without storing a second session",
    async (provider) => {
      const config = options();
      await authenticateSupabaseDevProvider(
        { provider, idToken: "provider-id-token", nonce: "original-raw-nonce" },
        config,
      );
      expect(config.fetchImplementation).toHaveBeenCalledWith(
        `${config.url}/auth/v1/token?grant_type=id_token`,
        expect.objectContaining({
          body: JSON.stringify({
            provider,
            id_token: "provider-id-token",
            nonce: "original-raw-nonce",
          }),
        }),
      );
      expect(config.persistSession).not.toHaveBeenCalled();
    },
  );

  it.each(["apple", "google"] as const)(
    "requires a caller nonce for %s before dispatch",
    async (provider) => {
      const config = options();
      const invalid = { provider, idToken: "provider-token" } as Parameters<
        typeof authenticateSupabaseDevProvider
      >[0];
      await expect(authenticateSupabaseDevProvider(invalid, config)).rejects.toThrow();
      expect(config.fetchImplementation).not.toHaveBeenCalled();
    },
  );

  it("does not turn a disabled provider into a fake successful login", async () => {
    await expect(
      authenticateSupabaseDevProvider(
        { provider: "apple", idToken: "id", nonce: "nonce" },
        options(Response.json({}, { status: 400 })),
      ),
    ).rejects.toMatchObject({ kind: "temporary", status: 400 });
  });

  it("rejects an Account change in a refresh response before persisting anything", async () => {
    const config = options();
    await expect(
      refreshSupabaseDevSession("old-refresh", config, {
        ...identity,
        userId: "another-account",
      }),
    ).rejects.toMatchObject({ kind: "invalid_session" });
    expect(config.persistSession).not.toHaveBeenCalled();
  });

  it("does not mistake a gateway 401 for explicit refresh-session rejection", async () => {
    await expect(
      refreshSupabaseDevSession(
        "refresh",
        options(Response.json({ message: "invalid API key" }, { status: 401 })),
        identity,
      ),
    ).rejects.toMatchObject({ kind: "temporary" });
  });

  it.each([
    "refresh_token_not_found",
    "refresh_token_already_used",
    "session_not_found",
    "session_expired",
    "user_banned",
    "user_not_found",
  ])("recognizes explicit refresh rejection %s", async (code) => {
    await expect(
      refreshSupabaseDevSession(
        "refresh",
        options(Response.json({ code }, { status: 400 })),
        identity,
      ),
    ).rejects.toMatchObject({ kind: "invalid_session" });
  });

  it("rejects token/user disagreement in a trusted Auth response without persisting it", async () => {
    const payload = btoa(JSON.stringify({ sub: "another-account" }))
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
    const config = options(
      Response.json({ ...token, access_token: `synthetic.${payload}.fixture` }),
    );
    await expect(
      verifySupabaseDevEmailOtp(identity.email, "123456", config),
    ).rejects.toMatchObject({ kind: "invalid_session" });
    expect(config.persistSession).not.toHaveBeenCalled();
  });

  it.each([
    { error_code: "refresh_token_not_found" },
    { code: 400, error_code: "refresh_token_not_found" },
  ])("recognizes the hosted Auth error_code envelope: %j", async (body) => {
    await expect(
      refreshSupabaseDevSession(
        "revoked",
        options(Response.json(body, { status: 400 })),
        identity,
      ),
    ).rejects.toMatchObject({ kind: "invalid_session" });
  });

  it.each([
    { code: 400, error_code: "validation_failed" },
    { code: "unknown_failure", error_code: "refresh_token_not_found" },
  ])(
    "preserves local continuity for unrecognized or conflicting Auth codes: %j",
    async (body) => {
      await expect(
        refreshSupabaseDevSession(
          "unavailable",
          options(Response.json(body, { status: 400 })),
          identity,
        ),
      ).rejects.toMatchObject({ kind: "temporary" });
    },
  );

  it.each([
    "http://tuqigdxrvrerfewsxqgm.supabase.co",
    "https://tuqigdxrvrerfewsxqgm.supabase.co/other",
    "https://user:password@tuqigdxrvrerfewsxqgm.supabase.co",
  ])("rejects unsafe Auth endpoint %s", async (url) => {
    const config = { ...options(), url };
    await expect(requestSupabaseDevEmailOtp(identity.email, config)).rejects.toThrow(
      "approved Supabase Dev project",
    );
    expect(config.fetchImplementation).not.toHaveBeenCalled();
  });
});
