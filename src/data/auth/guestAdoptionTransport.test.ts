import { randomUUID } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import * as authModule from "./authRepository";
import { createAuthRepository } from "./authSessionRepository";
import type { LocalSession } from "@/domain/auth/localSession";
import { getAccountGeneration, advanceAccountGeneration } from "./accountGeneration";
import { createGuestAdoptionTransport } from "./guestAdoptionTransport";
import {
  noteGuestPublicationRequested,
  hasGuestPublicationHold,
} from "./guestPublicationHold";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

async function fixture() {
  const guestId = randomUUID(),
    accountId = randomUUID(),
    adoptionId = randomUUID();
  const entries = new Map<string, string>();
  entries.set(
    "otr.mobile.launch.v1",
    JSON.stringify({ version: 1, kind: "GUEST", localId: guestId }),
  );
  const repository = createAuthRepository({
    getItem: async (key) => entries.get(key) ?? null,
    setItem: async (key, value) => {
      entries.set(key, value);
    },
    deleteItem: async (key) => {
      entries.delete(key);
    },
  });
  const binding = { sourceGuestLocalId: guestId, targetAccountId: accountId, adoptionId };
  // JWT-shaped fixtures exercise local subject pinning only, never live authentication.
  const session = (version: string, sub = accountId): LocalSession => ({
    accessToken: `e30.${btoa(JSON.stringify({ sub }))}.unit-${version}`,
    refreshToken: `unit-refresh-${version}`,
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
    identity: { userId: sub, displayName: "", email: null },
  });
  const initial = session("old"),
    updated = session("new");
  await repository.guestVerification.store(binding, initial);
  const request = {
    contractVersion: 1 as const,
    ...binding,
    inventorySha256: "a".repeat(64),
    resources: { trips: 1, people: 1, items: 1, files: 0, fileBytes: 0, liveDrafts: 0 },
  };
  const { resources: _resources, ...statusRequest } = request;
  let principal: Awaited<ReturnType<typeof repository.readCommittedLocalPrincipal>> = {
    kind: "GUEST",
    localId: guestId,
  };
  const refresh = vi.fn(async () => updated);
  const wire = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(init!.body as string);
    expect(init!.method).toBe("POST");
    expect(String(url)).toMatch(
      /^https:\/\/api.example.test\/v1\/auth\/guest-adoptions\/(preflight|status)$/,
    );
    if (String(url).endsWith("preflight")) {
      expect(init!.headers).toMatchObject({ "Idempotency-Key": adoptionId });
      return Response.json({
        ...body,
        status: "GRANTED",
        grantId: randomUUID(),
        policyVersion: "unit-no-commercial-policy",
        expiresAt: new Date(Date.now() + 60000).toISOString(),
      });
    }
    return Response.json({
      ...body,
      status: "NOT_FOUND",
      nextAction: "QUERY_SERVER_STATUS",
    });
  });
  const scope = {
    kind: "GUEST" as const,
    localId: guestId,
    generation: getAccountGeneration(),
  };
  const transport = createGuestAdoptionTransport(
    scope,
    binding,
    { baseUrl: "https://api.example.test", fetchImplementation: wire },
    {
      verification: repository.guestVerification,
      readPrincipal: async () => principal,
      refresh,
    },
  );
  return {
    guestId,
    accountId,
    binding,
    scope,
    entries,
    repository,
    request,
    statusRequest,
    initial,
    updated,
    session,
    refresh,
    wire,
    transport,
    leave() {
      principal = { kind: "ACCOUNT", accountId: guestId };
    },
    async assertGuest() {
      expect(await repository.readCommittedLocalPrincipal()).toEqual({
        kind: "GUEST",
        localId: guestId,
      });
      expect(await repository.readAdoptedLocalSession()).toBeNull();
      expect(await repository.listAccounts()).toEqual([]);
      expect(entries.has("otr.mobile.accounts.v2")).toBe(false);
    },
  };
}
it("uses only provisional bearer for strict metadata requests while launch remains Guest", async () => {
  const f = await fixture();
  expect((await f.transport.preflight(f.request, f.accountId)).targetAccountId).toBe(
    f.accountId,
  );
  expect(f.wire.mock.calls[0][1]!.headers).toMatchObject({
    Authorization: `Bearer ${f.initial.accessToken}`,
  });
  noteGuestPublicationRequested(f.guestId);
  expect((await f.transport.status(f.statusRequest)).nextAction).toBe(
    "QUERY_SERVER_STATUS",
  );
  expect(hasGuestPublicationHold(f.guestId)).toBe(true);
  expect(f.refresh).not.toHaveBeenCalled();
  await f.assertGuest();
});
it("pins constructor binding and request resources before any asynchronous work", async () => {
  const f = await fixture();
  f.binding.targetAccountId = randomUUID();
  const pending = f.transport.preflight(f.request, f.accountId);
  f.request.resources.trips = 999;
  const result = await pending;
  expect(result.targetAccountId).toBe(f.accountId);
  expect(result.resources.trips).toBe(1);
  await f.assertGuest();
});
it.each(["binding", "secret field", "same UUID Account", "generation"])(
  "refuses %s before HTTP dispatch",
  async (mode) => {
    const f = await fixture();
    if (mode === "binding") f.request.adoptionId = randomUUID();
    if (mode === "secret field")
      Object.assign(f.request, { accessToken: "unit-forbidden" });
    if (mode === "same UUID Account") f.leave();
    if (mode === "generation") advanceAccountGeneration();
    await expect(f.transport.preflight(f.request, f.accountId)).rejects.toThrow();
    expect(f.wire).not.toHaveBeenCalled();
    await f.assertGuest();
  },
);
it("discards a late response after a principal change even without generation advance", async () => {
  const f = await fixture();
  f.wire.mockImplementationOnce(async () => {
    f.leave();
    return Response.json({
      ...f.statusRequest,
      status: "NOT_FOUND",
      nextAction: "QUERY_SERVER_STATUS",
    });
  });
  await expect(f.transport.status(f.statusRequest)).rejects.toThrow(
    "GUEST_ADOPTION_SCOPE_MISMATCH",
  );
  await f.assertGuest();
});
it.each(["foreign target", "foreign hash", "wrong counts", "expired"])(
  "rejects an otherwise successful %s grant",
  async (mode) => {
    const f = await fixture();
    f.wire.mockImplementationOnce(async () =>
      Response.json({
        ...f.request,
        ...(mode === "foreign target" ? { targetAccountId: randomUUID() } : {}),
        ...(mode === "foreign hash" ? { inventorySha256: "b".repeat(64) } : {}),
        ...(mode === "wrong counts"
          ? { resources: { ...f.request.resources, trips: 2 } }
          : {}),
        status: "GRANTED",
        grantId: randomUUID(),
        policyVersion: "unit-policy",
        expiresAt: new Date(
          Date.now() + (mode === "expired" ? -60000 : 60000),
        ).toISOString(),
      }),
    );
    await expect(f.transport.preflight(f.request, f.accountId)).rejects.toThrow();
    await f.assertGuest();
  },
);
it("coalesces 401 refresh into the same provisional slot without installing an Account", async () => {
  const f = await fixture(),
    normalWire = f.wire.getMockImplementation()!;
  f.wire.mockImplementation(async (url, init) =>
    new Headers(init?.headers).get("Authorization") === `Bearer ${f.initial.accessToken}`
      ? Response.json({ error: { code: "INVALID_SESSION" } }, { status: 401 })
      : normalWire(url, init),
  );
  let release!: (session: LocalSession) => void;
  f.refresh.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  const requests = [
    f.transport.preflight(f.request, f.accountId),
    f.transport.status(f.statusRequest),
  ];
  await vi.waitFor(() => expect(f.refresh).toHaveBeenCalledOnce());
  release(f.updated);
  await Promise.all(requests);
  expect(await f.repository.guestVerification.read(f.binding)).toMatchObject({
    status: "SESSION",
    session: f.updated,
  });
  expect(f.wire).toHaveBeenCalledTimes(4);
  await f.assertGuest();
});
it.each(["foreign refresh", "stale refresh", "refresh failure"])(
  "keeps Guest safe after %s",
  async (mode) => {
    const f = await fixture();
    f.wire.mockImplementation(async () => new Response(null, { status: 401 }));
    f.refresh.mockImplementationOnce(async () => {
      if (mode === "foreign refresh") return f.session("other", randomUUID());
      if (mode === "stale refresh") advanceAccountGeneration();
      else throw Error("unit-provider-unavailable");
      return f.updated;
    });
    await expect(f.transport.status(f.statusRequest)).rejects.toThrow();
    expect(await f.repository.guestVerification.read(f.binding)).toMatchObject({
      status: "SESSION",
      session: f.initial,
    });
    await f.assertGuest();
  },
);
it("keeps missing Backend authority closed with no upload or Account adoption", async () => {
  const f = await fixture();
  f.wire.mockImplementationOnce(async () =>
    Response.json(
      { error: { code: "GUEST_ADOPTION_PREFLIGHT_CLOSED" } },
      { status: 503 },
    ),
  );
  await expect(f.transport.preflight(f.request, f.accountId)).rejects.toMatchObject({
    kind: "http",
    status: 503,
  });
  expect(f.wire).toHaveBeenCalledOnce();
  await f.assertGuest();
});

it("default refresh uses the existing Supabase refresh path with active Session persistence disabled", async () => {
  const f = await fixture(),
    normalWire = f.wire.getMockImplementation()!;
  vi.stubEnv(
    "EXPO_PUBLIC_OTR_DEV_SUPABASE_URL",
    "https://tuqigdxrvrerfewsxqgm.supabase.co",
  );
  vi.stubEnv("EXPO_PUBLIC_OTR_DEV_SUPABASE_PUBLISHABLE_KEY", "unit-public-key");
  const persist = vi
    .spyOn(authModule, "writeLocalSession")
    .mockImplementation(async () => {
      throw Error("ACTIVE_SESSION_WRITE_FORBIDDEN");
    });
  const provider = vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
    expect(String(url)).toBe(
      "https://tuqigdxrvrerfewsxqgm.supabase.co/auth/v1/token?grant_type=refresh_token",
    );
    expect(init?.method).toBe("POST");
    expect(JSON.parse(init?.body as string)).toEqual({
      refresh_token: f.initial.refreshToken,
    });
    return Response.json({
      access_token: f.updated.accessToken,
      refresh_token: f.updated.refreshToken,
      expires_in: 3600,
      user: { id: f.accountId, email: null },
    });
  });
  f.wire.mockImplementation(async (url, init) =>
    new Headers(init?.headers).get("Authorization") === `Bearer ${f.initial.accessToken}`
      ? new Response(null, { status: 401 })
      : normalWire(url, init),
  );
  const transport = createGuestAdoptionTransport(
    f.scope,
    f.binding,
    { baseUrl: "https://api.example.test", fetchImplementation: f.wire },
    {
      verification: f.repository.guestVerification,
      readPrincipal: () => f.repository.readCommittedLocalPrincipal(),
    },
  );
  expect((await transport.status(f.statusRequest)).status).toBe("NOT_FOUND");
  expect(provider).toHaveBeenCalledOnce();
  expect(persist).not.toHaveBeenCalled();
  expect(await f.repository.guestVerification.read(f.binding)).toMatchObject({
    status: "SESSION",
    session: { accessToken: f.updated.accessToken, refreshToken: f.updated.refreshToken },
  });
  await f.assertGuest();
});

async function terminalFixture() {
  const f = await fixture();
  const { coreHashValue } = await import("@/domain/trip/tripCoreV2Read");
  const { tripCoreSha256Hex } = await import("@/data/repositories/tripCoreSha256");
  const body = {
    ...f.statusRequest,
    schemaId: "otr.auth.guest-adoption-receipt/1" as const,
    receiptId: randomUUID(),
    grantId: randomUUID(),
    policyVersion: "unit-unpriced/1",
    recordedAt: "2026-10-01T00:00:00Z",
    outcome: "CANCELLED" as const,
    preparationSha256: null,
    planSha256: null,
  };
  const receipt = {
    ...body,
    receiptSha256: await coreHashValue(
      "otr-auth-guest-adoption-receipt-v1",
      body,
      tripCoreSha256Hex,
    ),
  };
  const request = {
    ...f.statusRequest,
    receiptId: receipt.receiptId,
    receiptSha256: receipt.receiptSha256,
  };
  return { ...f, receipt, receiptRequest: request };
}
it("reads the exact terminal receipt using provisional verification while retaining Guest launch", async () => {
  const f = await terminalFixture();
  f.wire.mockImplementationOnce(async (url, init) => {
    expect(String(url)).toBe("https://api.example.test/v1/auth/guest-adoptions/receipt");
    expect(JSON.parse(init!.body as string)).toEqual(f.receiptRequest);
    expect(new Headers(init!.headers).get("Authorization")).toBe(
      `Bearer ${f.initial.accessToken}`,
    );
    return Response.json(f.receipt);
  });
  expect(await f.transport.receipt(f.receiptRequest)).toEqual(f.receipt);
  await f.assertGuest();
});
it.each(["receiptId", "receiptSha256", "inventorySha256"])(
  "rejects receipt response mismatched %s",
  async (key) => {
    const f = await terminalFixture();
    f.wire.mockImplementationOnce(async () => Response.json(f.receipt));
    const request = {
      ...f.receiptRequest,
      [key]: key === "receiptId" ? randomUUID() : "b".repeat(64),
    };
    await expect(f.transport.receipt(request)).rejects.toThrow();
    await f.assertGuest();
  },
);
it("rejects tampered receipt bytes and preserves Guest state", async () => {
  const f = await terminalFixture();
  f.wire.mockImplementationOnce(async () =>
    Response.json({ ...f.receipt, policyVersion: "altered" }),
  );
  await expect(f.transport.receipt(f.receiptRequest)).rejects.toThrow("HASH_MISMATCH");
  await f.assertGuest();
});
it("does not consume a receipt after leaving the original Guest frame", async () => {
  const f = await terminalFixture();
  f.wire.mockImplementationOnce(async () => {
    f.leave();
    return Response.json(f.receipt);
  });
  await expect(f.transport.receipt(f.receiptRequest)).rejects.toThrow("SCOPE_MISMATCH");
  await f.assertGuest();
});
it("rejects another target before any receipt request", async () => {
  const f = await terminalFixture();
  await expect(
    f.transport.receipt({ ...f.receiptRequest, targetAccountId: randomUUID() }),
  ).rejects.toThrow("BINDING_MISMATCH");
  expect(f.wire).not.toHaveBeenCalled();
});

it("cancels only the bound attempt using its original idempotency key and retains Guest state", async () => {
  const f = await terminalFixture();
  f.wire.mockImplementationOnce(async (url, init) => {
    expect(String(url)).toBe("https://api.example.test/v1/auth/guest-adoptions/cancel");
    expect(JSON.parse(init!.body as string)).toEqual(f.statusRequest);
    expect(new Headers(init!.headers).get("Idempotency-Key")).toBe(f.binding.adoptionId);
    return Response.json(f.receipt);
  });
  expect(await f.transport.cancel(f.statusRequest)).toEqual(f.receipt);
  await f.assertGuest();
});
it("keeps Guest state when cancellation is UNKNOWN without creating another attempt", async () => {
  const f = await terminalFixture();
  f.wire.mockImplementationOnce(async () =>
    Response.json(
      {
        error: {
          code: "GUEST_ADOPTION_CANCEL_OUTCOME_UNKNOWN",
          message: "GUEST_ADOPTION_CANCEL_OUTCOME_UNKNOWN",
        },
      },
      { status: 503 },
    ),
  );
  await expect(f.transport.cancel(f.statusRequest)).rejects.toThrow();
  expect(f.wire).toHaveBeenCalledOnce();
  await f.assertGuest();
});

it("requires explicit target confirmation before preflight network access", async () => {
  const f = await fixture();
  await expect(f.transport.preflight(f.request, randomUUID())).rejects.toThrow(
    "CONFIRMATION_REQUIRED",
  );
  expect(f.wire).not.toHaveBeenCalled();
  await f.assertGuest();
});
it("reuses normal self-Profile bootstrap with provisional credentials without installing Account", async () => {
  const f = await fixture();
  f.wire.mockImplementationOnce(async (url) => {
    expect(String(url)).toBe("https://api.example.test/v1/account/profile/bootstrap");
    return Response.json({
      schemaId: "otr.auth.account-profile-bootstrap/1",
      accountId: f.accountId,
      ready: true,
    });
  });
  expect((await f.transport.targetReads.ensureProfile()).accountId).toBe(f.accountId);
  await f.assertGuest();
});
it("can supply the verified target getter inside the existing repository apply gate", async () => {
  const f = await fixture();
  const { withAccountApplyGate } = await import("./accountRequestContext");
  let timer: ReturnType<typeof setTimeout> | undefined;
  const result = await withAccountApplyGate(async () => {
    try {
      return await Promise.race([
        f.transport.targetReads.account(),
        new Promise<"GATE_TIMEOUT">((resolve) => {
          timer = setTimeout(() => resolve("GATE_TIMEOUT"), 100);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  });
  expect(result).toBe(f.accountId);
  await f.assertGuest();
});
it("keeps target cache and HTTP reads fenced after the source generation changes", async () => {
  const f = await fixture();
  advanceAccountGeneration();
  await expect(f.transport.targetReads.account()).rejects.toThrow();
  await expect(f.transport.targetReads.ensureProfile()).rejects.toThrow();
  expect(f.wire).not.toHaveBeenCalled();
});

it("rejects a preparation for another target before uploading its source", async () => {
  const f = await fixture();
  const { seal } =
    await import("../../../backend/src/guestAdoptionCompositePlan.fixture");
  const grant = await f.transport.preflight(f.request, f.accountId);
  f.wire.mockClear();
  const preparation = seal({
    schemaId: "otr.auth.guest-adoption-recovery/1",
    sourceKind: "GUEST",
    checkpoint: "PREPARED",
    ...f.binding,
    targetAccountId: randomUUID(),
    inventorySha256: f.request.inventorySha256,
    tripIds: [],
    drafts: [],
  });
  await expect(f.transport.stage({ grant, preparation })).rejects.toThrow(
    "BINDING_MISMATCH",
  );
  expect(f.wire).not.toHaveBeenCalled();
});
