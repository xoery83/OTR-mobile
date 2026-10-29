import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import {
  accountProfileBootstrapBoundary,
  createAccountProfileBootstrapPort,
} from "./accountProfileBootstrap";
import { accountProfileBootstrapPath } from "@/data/api/accountProfileContracts";

const origin = "https://tuqigdxrvrerfewsxqgm.supabase.co";
function fixture(mode = "new") {
  const accountId = randomUUID();
  let exists = ["existing", "foreign profile"].includes(mode);
  const calls: Request[] = [];
  const wire: typeof fetch = async (input, init) => {
    const request = new Request(input, init),
      url = new URL(request.url);
    calls.push(request);
    expect(url.origin).toBe(origin);
    expect(request.headers.get("Authorization")).toBe("Bearer fixture-normal-session");
    expect(request.headers.get("apikey")).toBe("fixture-public-key");
    if (url.pathname === "/auth/v1/user")
      return Response.json({
        id: mode === "foreign identity" ? randomUUID() : accountId,
        email: "fixture@example.invalid",
        is_anonymous: mode === "anonymous identity",
      });
    expect(url.pathname).toBe("/rest/v1/profiles");
    if (request.method === "GET") {
      expect([...url.searchParams.entries()].sort()).toEqual([
        ["id", `eq.${accountId}`],
        ["select", "id"],
      ]);
      return Response.json(
        exists ? [{ id: mode === "foreign profile" ? randomUUID() : accountId }] : [],
      );
    }
    expect(request.method).toBe("POST");
    expect(url.search).toBe("");
    expect(request.headers.get("Prefer") ?? "").not.toContain("resolution=");
    expect(await request.json()).toEqual({ id: accountId, display_name: "" });
    if (mode === "denied")
      return Response.json(
        { code: "42501", message: "private diagnostic" },
        { status: 403 },
      );
    if (mode !== "missing readback") exists = true;
    if (mode === "race")
      return Response.json(
        { code: "23505", message: "private diagnostic" },
        { status: 409 },
      );
    return new Response(null, { status: 201 });
  };
  return {
    accountId,
    calls,
    port: createAccountProfileBootstrapPort({
      url: origin,
      publishableKey: "fixture-public-key",
      fetchImplementation: wire,
    }),
  };
}
it.each(["new", "existing", "race"])(
  "initializes only its own absent profile with normal JWT and verifies %s",
  async (mode) => {
    const f = fixture(mode),
      signal = new AbortController().signal;
    const result = await f.port.ensure(f.accountId, "fixture-normal-session", signal);
    expect(result).toEqual({
      schemaId: "otr.auth.account-profile-bootstrap/1",
      accountId: f.accountId,
      ready: true,
    });
    expect(f.calls.map((request) => request.method)).toEqual(
      mode === "existing" ? ["GET", "GET"] : ["GET", "GET", "POST", "GET"],
    );
    await f.port.ensure(f.accountId, "fixture-normal-session", signal);
    expect(f.calls.filter((request) => request.method === "POST")).toHaveLength(
      mode === "existing" ? 0 : 1,
    );
  },
);
it.each([
  "foreign identity",
  "anonymous identity",
  "foreign profile",
  "missing readback",
  "denied",
])("refuses %s without claiming bootstrap ready", async (mode) => {
  const f = fixture(mode);
  await expect(
    f.port.ensure(f.accountId, "fixture-normal-session", new AbortController().signal),
  ).rejects.toThrow();
  if (mode.startsWith("foreign") || mode === "anonymous identity")
    expect(f.calls.some((request) => request.method === "POST")).toBe(false);
});
it("rejects Production/config redirection and aborted requests without dispatch", async () => {
  for (const url of [
    "https://other.supabase.co",
    origin + "/rest/v1",
    origin + "?next=other",
    origin + "@example.invalid",
  ])
    expect(() =>
      createAccountProfileBootstrapPort({ url, publishableKey: "fixture-public-key" }),
    ).toThrow("ACCOUNT_PROFILE_DEV_CONFIG_REQUIRED");
  const f = fixture(),
    controller = new AbortController();
  controller.abort();
  await expect(
    f.port.ensure(f.accountId, "fixture-normal-session", controller.signal),
  ).rejects.toThrow();
  expect(f.calls).toEqual([]);
});
function request(
  body: unknown = {},
  options: { token?: boolean; query?: string; method?: string } = {},
) {
  return new Request(
    "http://localhost" + accountProfileBootstrapPath + (options.query ?? ""),
    {
      method: options.method ?? "POST",
      headers:
        options.token === false ? {} : { Authorization: "Bearer fixture-normal-session" },
      ...(options.method === "GET" ? {} : { body: JSON.stringify(body) }),
    },
  );
}
it("uses the middleware Actor and empty input only; bounds output and disables caching", async () => {
  const accountId = randomUUID(),
    ensure = vi.fn(async () => ({
      schemaId: "otr.auth.account-profile-bootstrap/1" as const,
      accountId,
      ready: true as const,
    }));
  const response = await accountProfileBootstrapBoundary(
    request(),
    { id: accountId },
    { ensure },
  );
  expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  expect(ensure.mock.calls[0]).toEqual([
    accountId,
    "fixture-normal-session",
    expect.any(AbortSignal),
  ]);
});
const invalidRequests: [
  { body?: unknown; token?: boolean; query?: string; method?: string },
  number,
][] = [
  [{ body: { accountId: randomUUID() } }, 400],
  [{ token: false }, 401],
  [{ query: "?accountId=other" }, 400],
  [{ method: "GET" }, 405],
];
it.each(invalidRequests)(
  "rejects caller-controlled account/invalid request %j",
  async (options, status) => {
    const ensure = vi.fn(),
      { body = {}, ...rest } = options;
    expect(
      (
        await accountProfileBootstrapBoundary(
          request(body, rest),
          { id: randomUUID() },
          { ensure },
        )
      ).status,
    ).toBe(status);
    expect(ensure).not.toHaveBeenCalled();
  },
);
it("keeps absent adapters closed and suppresses private failures or foreign output", async () => {
  const user = { id: randomUUID() };
  expect((await accountProfileBootstrapBoundary(request(), user)).status).toBe(503);
  const failure = await accountProfileBootstrapBoundary(request(), user, {
    ensure: async () => {
      throw Error("fixture-private-value");
    },
  });
  expect(failure.status).toBe(503);
  expect(await failure.text()).not.toContain("fixture-private-value");
  const foreign = await accountProfileBootstrapBoundary(request(), user, {
    ensure: async () => ({
      schemaId: "otr.auth.account-profile-bootstrap/1",
      accountId: randomUUID(),
      ready: true,
    }),
  });
  expect(foreign.status).toBe(503);
});

it.each([
  ["{", 400],
  [JSON.stringify({ padding: "x".repeat(300) }), 413],
] as const)(
  "bounds invalid JSON input without calling the adapter",
  async (body, status) => {
    const ensure = vi.fn();
    const req = new Request("http://localhost" + accountProfileBootstrapPath, {
      method: "POST",
      headers: { Authorization: "Bearer fixture-normal-session" },
      body,
    });
    expect(
      (await accountProfileBootstrapBoundary(req, { id: randomUUID() }, { ensure }))
        .status,
    ).toBe(status);
    expect(ensure).not.toHaveBeenCalled();
  },
);
