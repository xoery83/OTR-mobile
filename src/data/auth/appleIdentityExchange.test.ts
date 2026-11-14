import { describe, expect, it, vi } from "vitest";
import {
  linkSupabaseDevAppleIdentity,
  saveSupabaseDevAppleName,
} from "./devSupabaseAuth";

const session = {
  accessToken: "synthetic-access-a",
  refreshToken: "synthetic-refresh-a",
  expiresAt: null,
  identity: {
    userId: "account-a",
    email: "qa@privaterelay.appleid.com",
    displayName: "Confirmed name",
  },
};
function options(body: unknown) {
  return {
    url: "https://tuqigdxrvrerfewsxqgm.supabase.co",
    publishableKey: "synthetic-public-key",
    fetchImplementation: vi.fn(
      async () => new Response(JSON.stringify(body), { status: 200 }),
    ),
  };
}
const credential = {
  provider: "apple" as const,
  idToken: "synthetic-apple-token",
  nonce: "raw-nonce",
};
describe("explicit Apple identity linking", () => {
  it("binds the existing bearer and link_identity instruction without installing a Session", async () => {
    const o = options({
      access_token: "new-access",
      refresh_token: "new-refresh",
      expires_in: 3600,
      user: { id: "account-a" },
    });
    o.fetchImplementation
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "account-a" })))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            access_token: "new-access",
            refresh_token: "new-refresh",
            expires_in: 3600,
            user: { id: "account-a" },
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ id: "account-a", identities: [{ provider: "apple" }] }),
        ),
      );
    const linked = await linkSupabaseDevAppleIdentity(credential, session, o);
    expect(linked.identity?.userId).toBe("account-a");
    expect(o.fetchImplementation).toHaveBeenCalledWith(
      expect.stringContaining("/token?grant_type=id_token"),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer synthetic-access-a" }),
        body: JSON.stringify({
          provider: "apple",
          id_token: "synthetic-apple-token",
          nonce: "raw-nonce",
          link_identity: true,
        }),
      }),
    );
  });
  it("rejects a returned different Account", async () => {
    const o = options({
      access_token: "new-access",
      refresh_token: "new-refresh",
      expires_in: 3600,
      user: { id: "account-b" },
    });
    o.fetchImplementation.mockResolvedValueOnce(
      new Response(JSON.stringify({ id: "account-a" })),
    );
    await expect(linkSupabaseDevAppleIdentity(credential, session, o)).rejects.toThrow(
      "inconsistent identity",
    );
  });
  it("rejects a missing current Session before dispatch", async () => {
    const o = options({});
    await expect(
      linkSupabaseDevAppleIdentity(credential, { ...session, accessToken: null }, o),
    ).rejects.toThrow();
    expect(o.fetchImplementation).not.toHaveBeenCalled();
  });
});
describe("optional Apple first-name metadata", () => {
  it("uses an authenticated PUT and never overwrites Display Name or document fields", async () => {
    const o = options({ id: "account-a" });
    await saveSupabaseDevAppleName(session, { givenName: "小明", familyName: "王" }, o);
    expect(o.fetchImplementation).toHaveBeenCalledWith(
      expect.stringContaining("/auth/v1/user"),
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({
          data: { apple_first_sign_in_name: { givenName: "小明", familyName: "王" } },
        }),
        headers: expect.objectContaining({ Authorization: "Bearer synthetic-access-a" }),
      }),
    );
  });
  it("rejects a mismatched user readback", async () => {
    await expect(
      saveSupabaseDevAppleName(
        session,
        { givenName: "小明" },
        options({ id: "account-b" }),
      ),
    ).rejects.toThrow("APPLE_ACCOUNT_MISMATCH");
  });
});
