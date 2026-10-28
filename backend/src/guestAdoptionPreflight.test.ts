import { randomUUID } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import {
  guestAdoptionPreflightBoundary,
  type GuestAdoptionPreflightPort,
} from "./guestAdoptionPreflight";
import type { GuestAdoptionPreflightRequest } from "../../src/domain/auth/guestAdoptionPreflight";

afterEach(() => vi.useRealTimers());
const path = "https://example.invalid/v1/auth/guest-adoptions/preflight";
function fixture() {
  const user = { id: randomUUID() };
  const input: GuestAdoptionPreflightRequest = {
    contractVersion: 1,
    adoptionId: randomUUID(),
    sourceGuestLocalId: randomUUID(),
    targetAccountId: user.id,
    inventorySha256: "a".repeat(64),
    resources: { trips: 1, people: 1, items: 1, files: 0, fileBytes: 0, liveDrafts: 0 },
  };
  const grant = {
    ...structuredClone(input),
    status: "GRANTED" as const,
    grantId: randomUUID(),
    policyVersion: "test-only-not-an-installed-policy",
    expiresAt: new Date(Date.now() + 60000).toISOString(),
  };
  const preflight = vi.fn(async () => grant);
  const port: GuestAdoptionPreflightPort = { preflight };
  const request = (
    body: unknown = input,
    headers: Record<string, string> = {},
    signal?: AbortSignal,
  ) =>
    new Request(path, {
      method: "POST",
      body: JSON.stringify(body),
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": input.adoptionId,
        ...headers,
      },
      signal,
    });
  return { user, input, grant, preflight, port, request };
}

it("keeps the missing adapter closed without inventing allowance", async () => {
  const f = fixture();
  const result = await guestAdoptionPreflightBoundary(f.request(), f.user);
  expect(result.status).toBe(503);
  expect(f.preflight).not.toHaveBeenCalled();
});
it("pins the authenticated actor and metadata-only request to a private noncached grant", async () => {
  const f = fixture();
  const result = await guestAdoptionPreflightBoundary(f.request(), f.user, f.port);
  expect(result.status).toBe(200);
  expect(await result.json()).toEqual(f.grant);
  expect(f.preflight).toHaveBeenCalledWith(f.user.id, f.input, expect.any(AbortSignal));
  expect(result.headers.get("Cache-Control")).toBe("private, no-store");
  expect(result.headers.get("Vary")).toBe("Authorization");
});
it("rejects another target Account before the adapter", async () => {
  const f = fixture();
  const result = await guestAdoptionPreflightBoundary(
    f.request({ ...f.input, targetAccountId: randomUUID() }),
    f.user,
    f.port,
  );
  expect(result.status).toBe(403);
  expect(f.preflight).not.toHaveBeenCalled();
});
it.each([
  "key",
  "trip title",
  "token",
  "negative count",
  "unsafe count",
  "unknown resource",
  "version",
])(
  "rejects invalid %s without collecting business contents or granting quotas",
  async (variant) => {
    const f = fixture(),
      body: Record<string, unknown> = structuredClone(f.input),
      headers: Record<string, string> = {};
    if (variant === "key") headers["Idempotency-Key"] = randomUUID();
    if (variant === "trip title") body.tripTitle = "Guest private title";
    if (variant === "token") body.accessToken = "forbidden-token-fixture";
    if (variant === "negative count")
      (body.resources as Record<string, unknown>).items = -1;
    if (variant === "unsafe count")
      (body.resources as Record<string, unknown>).fileBytes = Number.MAX_SAFE_INTEGER + 1;
    if (variant === "unknown resource")
      (body.resources as Record<string, unknown>).credits = 10;
    if (variant === "version") body.contractVersion = 2;
    expect(
      (await guestAdoptionPreflightBoundary(f.request(body, headers), f.user, f.port))
        .status,
    ).toBe(400);
    expect(f.preflight).not.toHaveBeenCalled();
  },
);
it.each([
  "actor",
  "adoption",
  "source",
  "digest",
  "counts",
  "expired",
  "extra commercial rule",
])("rejects a grant with wrong %s", async (variant) => {
  const f = fixture();
  if (variant === "actor") f.grant.targetAccountId = randomUUID();
  if (variant === "adoption") f.grant.adoptionId = randomUUID();
  if (variant === "source") f.grant.sourceGuestLocalId = randomUUID();
  if (variant === "digest") f.grant.inventorySha256 = "b".repeat(64);
  if (variant === "counts") f.grant.resources.trips++;
  if (variant === "expired")
    f.grant.expiresAt = new Date(Date.now() - 1000).toISOString();
  if (variant === "extra commercial rule")
    Object.assign(f.grant, { monthlyCredits: 100 });
  expect((await guestAdoptionPreflightBoundary(f.request(), f.user, f.port)).status).toBe(
    503,
  );
});
it("isolates request pins from adapter mutations and later caller user changes", async () => {
  const f = fixture(),
    actor = f.user.id;
  const port: GuestAdoptionPreflightPort = {
    async preflight(id, input) {
      expect(id).toBe(actor);
      input.resources.trips = 99;
      input.targetAccountId = randomUUID();
      f.user.id = randomUUID();
      return f.grant;
    },
  };
  const result = await guestAdoptionPreflightBoundary(f.request(), f.user, port);
  expect(result.status).toBe(200);
  expect((await result.json()).targetAccountId).toBe(actor);
});
it("rejects pre-cancelled requests before adapter access", async () => {
  const f = fixture(),
    controller = new AbortController();
  controller.abort();
  expect(
    (
      await guestAdoptionPreflightBoundary(
        f.request(f.input, {}, controller.signal),
        f.user,
        f.port,
      )
    ).status,
  ).toBe(499);
  expect(f.preflight).not.toHaveBeenCalled();
});
it("bounds a nonsettling adapter and keeps its private errors out of responses", async () => {
  vi.useFakeTimers();
  const f = fixture();
  let signal: AbortSignal | undefined;
  const pending = guestAdoptionPreflightBoundary(f.request(), f.user, {
    preflight: async (_id, _input, current) => {
      signal = current;
      return new Promise(() => {});
    },
  });
  await vi.advanceTimersByTimeAsync(15001);
  expect((await pending).status).toBe(504);
  expect(signal?.aborted).toBe(true);
  vi.useRealTimers();
  f.preflight.mockRejectedValueOnce(Error("private-secret-test-sentinel"));
  const failed = await guestAdoptionPreflightBoundary(f.request(), f.user, f.port);
  expect(failed.status).toBe(503);
  expect(await failed.text()).not.toContain("private-secret-test-sentinel");
});
it("rejects oversize/malformed bodies, path/query/method and absent identity without calling adapter", async () => {
  const f = fixture();
  const requests = [
    new Request(path, { method: "POST", body: " ".repeat(8193) }),
    new Request(path, { method: "POST", body: "{broken" }),
    new Request(path + "?override=true", {
      method: "POST",
      body: JSON.stringify(f.input),
    }),
    new Request(path + "/unknown", { method: "POST", body: JSON.stringify(f.input) }),
    new Request(path),
  ];
  const statuses = [];
  for (const request of requests)
    statuses.push((await guestAdoptionPreflightBoundary(request, f.user, f.port)).status);
  expect(statuses).toEqual([413, 400, 400, 404, 405]);
  expect(
    (await guestAdoptionPreflightBoundary(f.request(), { id: "" }, f.port)).status,
  ).toBe(401);
  expect(f.preflight).not.toHaveBeenCalled();
});
