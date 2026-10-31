import { Buffer } from "node:buffer";
import { afterEach, expect, it, vi } from "vitest";
import { isOAuthResourceToken } from "./authResourceTokenBoundary";
import { createSupabaseDevGateway } from "./supabaseGateway";
const id = "11111111-1111-4111-8111-111111111111";
const token = (claims: unknown) =>
  `unit.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.unit`;
afterEach(() => vi.restoreAllMocks());
it.each([
  { client_id: id },
  { client_id: "" },
  { otr_scopes: [] },
  { aud: "https://api-dev.xoery.art/mcp" },
  { aud: ["authenticated", "https://api-dev.xoery.art/mcp"] },
])("rejects resource marker %j before ordinary Auth/Business access", async (claims) => {
  const fetch = vi.spyOn(globalThis, "fetch");
  const gateway = createSupabaseDevGateway({
    url: "https://tuqigdxrvrerfewsxqgm.supabase.co",
    publishableKey: "unit-public",
    secretKey: "unit-unused",
  });
  expect(isOAuthResourceToken(token(claims))).toBe(true);
  expect(await gateway.validateAccessToken(token(claims))).toBeNull();
  expect(fetch).not.toHaveBeenCalled();
});
it.each([
  null,
  [],
  "invalid",
  { aud: "authenticated", role: "authenticated" },
  { client_id: null },
])("leaves %j to existing authoritative Auth validation", async (claims) => {
  const bearer = token(claims);
  expect(isOAuthResourceToken(bearer)).toBe(false);
  const fetch = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(new Response(null, { status: 401 }));
  const gateway = createSupabaseDevGateway({
    url: "https://tuqigdxrvrerfewsxqgm.supabase.co",
    publishableKey: "unit-public",
    secretKey: "unit-unused",
  });
  expect(await gateway.validateAccessToken(bearer)).toBeNull();
  expect(fetch).toHaveBeenCalledOnce();
});
it("preserves normal getUser qualification and never accepts malformed bearer by decoding", async () => {
  const fetch = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(Response.json({ id, is_anonymous: false }));
  const gateway = createSupabaseDevGateway({
    url: "https://tuqigdxrvrerfewsxqgm.supabase.co",
    publishableKey: "unit-public",
    secretKey: "unit-unused",
  });
  expect(
    await gateway.validateAccessToken(
      token({ aud: "authenticated", role: "authenticated" }),
    ),
  ).toEqual({ id, accountClass: "NORMAL_ACCOUNT" });
  expect(fetch).toHaveBeenCalledOnce();
  expect(isOAuthResourceToken("invalid")).toBe(false);
});
