import { randomUUID } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { createSupabaseDevGateway } from "./supabaseGateway";
import { authenticate } from "./app";
import { classifySupabaseAuthAccount, isNormalAccount } from "./authAccountQualification";

afterEach(() => vi.restoreAllMocks());
it("retains explicit normal Account qualification from actual Auth getUser response", async () => {
  const id = randomUUID();
  const wire = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const request = new Request(input, init);
    expect(request.url).toBe("https://tuqigdxrvrerfewsxqgm.supabase.co/auth/v1/user");
    expect(request.headers.get("Authorization")).toBe("Bearer unit-normal-token");
    return Response.json({ id, is_anonymous: false });
  });
  const gateway = createSupabaseDevGateway({
    url: "https://tuqigdxrvrerfewsxqgm.supabase.co",
    publishableKey: "unit-public-key",
    secretKey: "unit-unused-secret-key",
  });
  expect(await gateway.validateAccessToken("unit-normal-token")).toEqual({
    id,
    accountClass: "NORMAL_ACCOUNT",
  });
  expect(wire).toHaveBeenCalledOnce();
});

it.each([
  [false, "NORMAL_ACCOUNT", true],
  [true, "ANONYMOUS", false],
  [undefined, "UNKNOWN", false],
  [null, "UNKNOWN", false],
  ["false", "UNKNOWN", false],
  [0, "UNKNOWN", false],
] as const)(
  "classifies explicit Auth flag %s without coercion",
  (flag, expected, allowed) => {
    const user = {
      id: randomUUID(),
      is_anonymous: flag,
      email: "same@example.invalid",
      role: "authenticated",
      app_metadata: { provider: "google" },
      user_metadata: { name: "Same name", is_anonymous: false },
    };
    const classified = classifySupabaseAuthAccount(user)!;
    expect(classified.accountClass).toBe(expected);
    expect(isNormalAccount(classified)).toBe(allowed);
    expect(Object.isFrozen(classified)).toBe(true);
  },
);

it("does not qualify legacy id-only or malformed identities", () => {
  expect(isNormalAccount({ id: randomUUID() })).toBe(false);
  expect(isNormalAccount({ id: randomUUID(), accountClass: "UNKNOWN" })).toBe(false);
  expect(isNormalAccount({ id: "invalid", accountClass: "NORMAL_ACCOUNT" })).toBe(false);
  expect(classifySupabaseAuthAccount({ id: "invalid", is_anonymous: false })).toBeNull();
});

it.each([true, undefined] as const)(
  "preserves global authentication for verified flag %s while normal predicate refuses it",
  async (flag) => {
    const id = randomUUID();
    const wire = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json({ id, is_anonymous: flag }));
    const gateway = createSupabaseDevGateway({
      url: "https://tuqigdxrvrerfewsxqgm.supabase.co",
      publishableKey: "unit-public-key",
      secretKey: "unit-unused-secret-key",
    });
    const result = await authenticate(
      new Request("https://api.example.test/guest-eligible", {
        headers: { Authorization: "Bearer unit-verified-token" },
      }),
      gateway,
    );
    expect(result.id).toBe(id);
    expect(isNormalAccount(result)).toBe(false);
    expect(wire).toHaveBeenCalledOnce();
  },
);

it("returns explicit normal identity without treating it as a Trip role or entitlement", async () => {
  const id = randomUUID();
  vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
    Response.json({
      id,
      is_anonymous: false,
      app_metadata: { role: "admin" },
      user_metadata: { tripRole: "owner" },
    }),
  );
  const gateway = createSupabaseDevGateway({
    url: "https://tuqigdxrvrerfewsxqgm.supabase.co",
    publishableKey: "unit-public-key",
    secretKey: "unit-unused-secret-key",
  });
  const identity = await gateway.validateAccessToken("unit-verified-token");
  expect(identity).toEqual({ id, accountClass: "NORMAL_ACCOUNT" });
  expect(isNormalAccount(identity!)).toBe(true);
  expect(identity).not.toHaveProperty("role");
  expect(identity).not.toHaveProperty("entitlement");
});

it.each(["rejected", "invalid UUID"])("does not authenticate %s user", async (mode) => {
  vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
    mode === "rejected"
      ? Response.json({ code: "bad_jwt", message: "unit rejection" }, { status: 401 })
      : Response.json({ id: "invalid", is_anonymous: false }),
  );
  const gateway = createSupabaseDevGateway({
    url: "https://tuqigdxrvrerfewsxqgm.supabase.co",
    publishableKey: "unit-public-key",
    secretKey: "unit-unused-secret-key",
  });
  expect(await gateway.validateAccessToken("unit-token")).toBeNull();
});

it.each(["ANONYMOUS", "UNKNOWN", undefined] as const)(
  "rejects non-normal class %s before any normal business port",
  async (accountClass) => {
    const { createDevBackendHandler, authenticateNormalAccount } = await import("./app");
    const id = randomUUID();
    const gateway = {
      validateAccessToken: vi.fn(async () => ({ id, accountClass })),
    } as unknown as import("./app").DevBackendGateway;
    const handle = createDevBackendHandler({ gateway });
    const trip = randomUUID(),
      op = randomUUID();
    for (const path of [
      "/v1/account/profile/bootstrap",
      "/v2/trips",
      `/v2/trips/${trip}/people`,
      `/v2/trips/${trip}/person-create-operations/${op}`,
      `/v2/trips/${trip}/metadata`,
      `/v2/trip-metadata-operations/${op}`,
      `/v2/trip-create-operations/${op}`,
      `/v2/trips/${trip}/core/capabilities`,
    ]) {
      const response = await handle(
        new Request("https://dev.invalid" + path, {
          headers: { Authorization: "Bearer verified-token" },
        }),
      );
      expect(response.status, path).toBe(403);
      expect(await response.json()).toMatchObject({
        error: { code: "NORMAL_ACCOUNT_REQUIRED" },
      });
    }
    const mutation = vi.fn();
    const writer = createDevBackendHandler({
      gateway,
      tripCreatePort: { create: mutation, receipt: mutation },
    });
    for (const path of ["/v2/trips", `/v2/trips/${trip}/core/commands`]) {
      const response = await writer(
        new Request("https://dev.invalid" + path, {
          method: "POST",
          headers: {
            Authorization: "Bearer verified-token",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ accountClass: "NORMAL_ACCOUNT", actorAccountId: id }),
        }),
      );
      expect(response.status, path).toBe(403);
      expect(await response.json()).toMatchObject({
        error: { code: "NORMAL_ACCOUNT_REQUIRED" },
      });
    }
    expect(mutation).not.toHaveBeenCalled();
    await expect(
      authenticateNormalAccount(
        new Request("https://dev.invalid", {
          headers: { Authorization: "Bearer verified-token" },
        }),
        gateway,
      ),
    ).rejects.toThrow();
  },
);
