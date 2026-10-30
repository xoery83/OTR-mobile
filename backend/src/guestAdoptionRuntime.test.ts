import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createGuestAdoptionHttpPorts } from "./guestAdoptionHttp";
import { loadDevGuestAdoptionRuntime } from "./guestAdoptionRuntime";
vi.mock("./guestAdoptionHttp", () => ({ createGuestAdoptionHttpPorts: vi.fn() }));
const instant = Date.parse("2026-10-31T00:00:00Z");
const scope = {
  accountId: randomUUID(),
  sourceGuestLocalId: randomUUID(),
  expiresAt: new Date(instant + 20 * 60_000).toISOString(),
};
const environment = {
  OTR_DEV_AUTH_GUEST_ADOPTION: "1",
  OTR_DEV_BACKEND_NETWORK_MODE: "host",
  OTR_DEV_SUPABASE_URL: "https://tuqigdxrvrerfewsxqgm.supabase.co",
  OTR_DEV_AUTH_GUEST_ADOPTION_SCOPE: JSON.stringify(scope),
};
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(instant);
  vi.mocked(createGuestAdoptionHttpPorts).mockReset();
});
afterEach(() => vi.useRealTimers());
it("stays closed by default without creating ports or acquiring a lease", () => {
  const withLease = vi.fn();
  expect(loadDevGuestAdoptionRuntime({}, { withLease })).toBeUndefined();
  expect(
    loadDevGuestAdoptionRuntime(
      { ...environment, OTR_DEV_AUTH_GUEST_ADOPTION: "0" },
      { withLease },
    ),
  ).toBeUndefined();
  expect(createGuestAdoptionHttpPorts).not.toHaveBeenCalled();
  expect(withLease).not.toHaveBeenCalled();
});
it.each([
  { ...environment, OTR_DEV_AUTH_GUEST_ADOPTION: "true" },
  { ...environment, OTR_DEV_BACKEND_NETWORK_MODE: "bridge" },
  { ...environment, OTR_DEV_SUPABASE_URL: "https://other-project.example.test" },
  { ...environment, OTR_DEV_AUTH_GUEST_ADOPTION_SCOPE: undefined },
  { ...environment, OTR_DEV_AUTH_GUEST_ADOPTION_SCOPE: "{}" },
  {
    ...environment,
    OTR_DEV_AUTH_GUEST_ADOPTION_SCOPE: JSON.stringify({
      ...scope,
      expiresAt: new Date(instant + 31 * 60_000).toISOString(),
    }),
  },
])("requires an exact finite DEV QA scope", (env) => {
  const withLease = vi.fn();
  expect(() => loadDevGuestAdoptionRuntime(env, { withLease })).toThrow(
    "RUNTIME_UNAVAILABLE",
  );
  expect(createGuestAdoptionHttpPorts).not.toHaveBeenCalled();
  expect(withLease).not.toHaveBeenCalled();
});
it("requires the existing Core connection rather than constructing a fallback driver", () => {
  expect(() => loadDevGuestAdoptionRuntime(environment)).toThrow("RUNTIME_UNAVAILABLE");
});
it("pins the principal/Guest and stops new mutations at expiry while preserving bound recovery", async () => {
  const base = {
    preflight: vi.fn(async () => ({})),
    readStatus: vi.fn(async () => ({})),
    cancel: vi.fn(async () => ({})),
    readReceipt: vi.fn(),
    stage: vi.fn(),
    publish: vi.fn(),
  };
  vi.mocked(createGuestAdoptionHttpPorts).mockReturnValue(base as never);
  const connection = { withLease: vi.fn() },
    runtime = loadDevGuestAdoptionRuntime(environment, connection)!;
  expect(createGuestAdoptionHttpPorts).toHaveBeenCalledWith(connection);
  expect(connection.withLease).not.toHaveBeenCalled();
  const request = {
    contractVersion: 1 as const,
    adoptionId: randomUUID(),
    sourceGuestLocalId: scope.sourceGuestLocalId,
    targetAccountId: scope.accountId,
    inventorySha256: "a".repeat(64),
  };
  const signal = new AbortController().signal;
  await runtime.ports.preflight(
    scope.accountId,
    {
      ...request,
      resources: { trips: 1, people: 1, items: 1, files: 0, fileBytes: 0, liveDrafts: 0 },
    },
    signal,
  );
  expect(base.preflight).toHaveBeenCalledOnce();
  expect(() => runtime.ports.readStatus(randomUUID(), request, signal)).toThrow(
    "SCOPE_CLOSED",
  );
  expect(() =>
    runtime.ports.readStatus(
      scope.accountId,
      { ...request, sourceGuestLocalId: randomUUID() },
      signal,
    ),
  ).toThrow("SCOPE_CLOSED");
  vi.setSystemTime(instant + 20 * 60_000);
  expect(() =>
    runtime.ports.publish(
      { id: scope.accountId, accountClass: "NORMAL_ACCOUNT" },
      { ...request, planSha256: "b".repeat(64) },
      signal,
    ),
  ).toThrow("SCOPE_CLOSED");
  await runtime.ports.readStatus(scope.accountId, request, signal);
  await runtime.ports.cancel(scope.accountId, request, signal);
  expect(base.readStatus).toHaveBeenCalledOnce();
  expect(base.cancel).toHaveBeenCalledOnce();
  expect(base.publish).not.toHaveBeenCalled();
});

it("reloads an expired scope for bound recovery without reopening any mutation", async () => {
  const base = {
    preflight: vi.fn(),
    stage: vi.fn(),
    publish: vi.fn(),
    readStatus: vi.fn(),
    readReceipt: vi.fn(),
    cancel: vi.fn(),
  };
  vi.mocked(createGuestAdoptionHttpPorts).mockReturnValue(base as never);
  const connection = { withLease: vi.fn() };
  const runtime = loadDevGuestAdoptionRuntime(
    {
      ...environment,
      OTR_DEV_AUTH_GUEST_ADOPTION_SCOPE: JSON.stringify({
        ...scope,
        expiresAt: new Date(instant - 60000).toISOString(),
      }),
    },
    connection,
  )!;
  expect(connection.withLease).not.toHaveBeenCalled();
  const request = {
    targetAccountId: scope.accountId,
    sourceGuestLocalId: scope.sourceGuestLocalId,
  } as never;
  const user = { id: scope.accountId, accountClass: "NORMAL_ACCOUNT" as const },
    signal = new AbortController().signal;
  expect(() => runtime.ports.preflight(user.id, request, signal)).toThrow("SCOPE_CLOSED");
  expect(() => runtime.ports.stage(user, { grant: request } as never, signal)).toThrow(
    "SCOPE_CLOSED",
  );
  expect(() => runtime.ports.publish(user, request, signal)).toThrow("SCOPE_CLOSED");
  await runtime.ports.readStatus(user.id, request, signal);
  await runtime.ports.readReceipt(user.id, request, signal);
  await runtime.ports.cancel(user.id, request, signal);
  expect(base.preflight).not.toHaveBeenCalled();
  expect(base.stage).not.toHaveBeenCalled();
  expect(base.publish).not.toHaveBeenCalled();
  expect(base.readStatus).toHaveBeenCalledOnce();
  expect(base.readReceipt).toHaveBeenCalledOnce();
  expect(base.cancel).toHaveBeenCalledOnce();
});
