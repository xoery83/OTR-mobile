import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { captureAccountRequestContext } from "../auth/accountRequestContext";
import { advanceAccountGeneration } from "../auth/accountGeneration";
import { createTripAuthorizedVersionTransport } from "./tripAuthorizedVersionTransport";

async function fixture() {
  const actor = randomUUID(),
    trip = randomUUID();
  const body = {
    version: "otr.core.authorized-trip-version/1",
    actorAccountId: actor,
    tripId: trip,
    token: "a".repeat(64),
  };
  const fetchImplementation = vi.fn(
    async (_input: string | URL | Request, _init?: RequestInit) =>
      new Response(JSON.stringify(body)),
  );
  const transport = createTripAuthorizedVersionTransport(
    async () => actor,
    {
      baseUrl: "https://core.local",
      fetchImplementation,
    },
    async () => ({ token: "synthetic-test-only", userId: actor }),
  );
  const context = await captureAccountRequestContext(trip, async () => actor);
  return { body, transport, context, fetchImplementation };
}

it("uses normal Auth and strict Actor/Trip DTO without accepting a raw Trip revision", async () => {
  const f = await fixture();
  expect(await f.transport.read(f.context)).toEqual(f.body);
  const [url, init] = f.fetchImplementation.mock.calls[0];
  expect(String(url)).toBe(
    `https://core.local/v2/trips/${f.context.tripId}/core/authorized-version`,
  );
  const headers = new Headers(init?.headers);
  expect(headers.get("authorization")).toBe("Bearer synthetic-test-only");
  expect(headers.get("x-otr-core-contract-version")).toBe("2");
  f.fetchImplementation.mockResolvedValueOnce(
    new Response(JSON.stringify({ ...f.body, revision: 100 })),
  );
  await expect(f.transport.read(f.context)).rejects.toThrow();
});

it.each(["actorAccountId", "tripId"] as const)("rejects mismatched %s", async (key) => {
  const f = await fixture();
  f.fetchImplementation.mockResolvedValueOnce(
    new Response(JSON.stringify({ ...f.body, [key]: randomUUID() })),
  );
  await expect(f.transport.read(f.context)).rejects.toThrow(
    "CORE_VERSION_SCOPE_MISMATCH",
  );
});

it.each([404, 503])(
  "never treats status %s as an unchanged version or revocation",
  async (status) => {
    const f = await fixture();
    f.fetchImplementation.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { code: "NOT_AVAILABLE" } }), { status }),
    );
    await expect(f.transport.read(f.context)).rejects.toMatchObject({ status });
    expect(f.fetchImplementation).toHaveBeenCalledOnce();
  },
);

it("rejects an old generation response before returning its token", async () => {
  const f = await fixture();
  f.fetchImplementation.mockImplementationOnce(async () => {
    advanceAccountGeneration();
    return new Response(JSON.stringify(f.body));
  });
  await expect(f.transport.read(f.context)).rejects.toThrow();
});
