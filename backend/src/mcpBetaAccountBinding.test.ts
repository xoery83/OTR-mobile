import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { createMcpBetaAccountBinding } from "./mcpBetaAccountBinding";
import type { AuthenticatedUser, BackendDependencies } from "./app";
import type { OAuthGrant } from "../../mcp/oauth";
// Synthetic Layer 1 contract fixture for this binding test.
const expense = {
  id: "7f97eb3f-3530-59a8-8454-d9c64fef75b2",
  journeyId: "654150f2-c0fd-48fc-9309-ad34748e8f57",
  creatorMemberId: "549dd418-b0e1-4e05-9242-ae54c0ca6122",
  payerMemberId: "549dd418-b0e1-4e05-9242-ae54c0ca6122",
  title: "Layer 1 Expense",
  description: "Preserve description",
  category: "food",
  occurredAt: "2026-12-01T09:00:00Z",
  economicDate: "2026-12-01",
  original: {
    minor: 100,
    currency: "NZD",
    scale: 2
  },
  businessStatus: "DRAFT",
  settlementParticipation: "INCLUDED",
  revision: 1,
  deletedAt: null,
  createdAt: "2026-11-15T22:08:57.886Z",
  updatedAt: "2026-11-15T22:08:57.886Z",
  participants: [
    {
      memberId: "549dd418-b0e1-4e05-9242-ae54c0ca6122",
      displayNameSnapshot: "Layer 1 synthetic 0",
      householdIdSnapshot: null
    }
  ],
  splits: [
    {
      memberId: "549dd418-b0e1-4e05-9242-ae54c0ca6122",
      method: "EQUAL_PERSON",
      originalMinor: 100,
      settlementMinor: null,
      weightUnits: null,
      percentageUnits: null,
      roundingAdjustmentMinor: 0
    }
  ],
  valuation: null,
  paymentRecords: [],
  auditEvents: [
    {
      id: "5492f697-706e-4742-87bc-63df98aae5b3",
      expenseId: "7f97eb3f-3530-59a8-8454-d9c64fef75b2",
      actorUserId: "e57ec61a-676c-4383-8341-13c3c9eadb98",
      actorMemberId: null,
      eventType: "CREATED",
      reason: null,
      changedGroups: [
        "FINANCIAL_CORE",
        "DESCRIPTIVE"
      ],
      revision: 1,
      createdAt: "2026-11-15T22:08:57.886Z"
    }
  ]
};
function fixture() {
  const grant: OAuthGrant = {
    accountId: randomUUID(),
    clientId: randomUUID(),
    tokenId: randomUUID(),
    sessionId: randomUUID(),
    resource: "https://synthetic.example.invalid/mcp",
    scopes: ["otr.trips.read", "otr.trips.write"],
    expiresAt: Date.now() + 60000,
  };
  const verify = vi.fn(async (): Promise<AuthenticatedUser | null> => ({
    id: grant.accountId,
    accountClass: "NORMAL_ACCOUNT" as const,
  }));
  const trip = expense.journeyId;
  const canReadTrip = vi.fn(async () => false);
  const dependencies = {
    gateway: { validateAccessToken: vi.fn(), canReadTrip },
  } as unknown as BackendDependencies;
  return {
    grant,
    verify,
    trip,
    expense,
    canReadTrip,
    dependencies,
    bind: createMcpBetaAccountBinding(dependencies, verify),
  };
}
it("routes denied reads through the formal Backend ACL with the verified account", async () => {
  const f = fixture();
  const ports = await f.bind(f.grant, new AbortController().signal, {
    accessToken: "signed-token-evidence",
  });
  f.verify.mockClear();
  const r = await ports.betaBackend(
    { method: "GET", path: `/v2/trips/${f.trip}/expenses/${f.expense.id}` },
    new AbortController().signal,
  );
  expect(r.status).toBe(403);
  expect(f.canReadTrip).toHaveBeenCalledWith(f.grant.accountId, f.trip);
  expect(f.verify).toHaveBeenCalledTimes(2);
});
it("serves exact Trip metadata and withholds it if authorization changes during a later read", async () => {
  const f = fixture();
  const signal = new AbortController().signal;
  const data = {
    formatVersion: 3 as const, actorAccountId: f.grant.accountId,
    tripId: f.trip, metadataRevision: 1,
    metadata: { name: "Synthetic Trip", destination: null, destinations: [], startDate: null, endDate: null },
  };
  const snapshot = vi.fn(async () => data);
  const bind = createMcpBetaAccountBinding({
    ...f.dependencies,
    tripMetadataV2Port: { snapshot, receipt: vi.fn(), update: vi.fn() },
  }, f.verify);
  const ports = await bind(f.grant, signal, { accessToken: "signed-token-evidence" });
  const id = randomUUID();
  const read = () => ports.betaBackend({
    method: "GET",
    path: `/v2/trips/${f.trip}/metadata`,
    headers: { "OTR-Trip-Metadata-Version": "3", "OTR-Metadata-Operation-Id": id },
  }, signal);

  f.verify.mockClear();
  const current = await read();
  expect(current.status).toBe(200);
  expect(await current.json()).toEqual(data);
  expect(f.verify).toHaveBeenCalledTimes(2);
  expect(snapshot).toHaveBeenCalledWith(f.grant.accountId, f.trip, id);

  const repeat = await read();
  expect(repeat.status).toBe(200);
  expect(await repeat.json()).toEqual(data);
  expect(f.verify).toHaveBeenCalledTimes(4);

  f.verify.mockRejectedValueOnce(Error("MCP_CONSENT_STORE_UNAVAILABLE"));
  const unavailable = await read();
  expect(unavailable.status).toBe(503);
  expect(await unavailable.json()).toEqual({ error: { code: "MCP_REQUEST_UNAVAILABLE" } });
  expect(snapshot).toHaveBeenCalledTimes(2);

  snapshot.mockImplementationOnce(async () => {
    f.verify.mockResolvedValue(null);
    return data;
  });
  const response = await read();
  expect(response.status).toBe(401);
  expect(await response.json()).toEqual({ error: { code: "MCP_AUTH_REQUIRED" } });
});
it("rejects foreign origins, forbidden payment writes, injected headers, missing scopes and changed accounts", async () => {
  const f = fixture(),
    signal = new AbortController().signal;
  const ports = await f.bind(f.grant, signal, { accessToken: "same-signed-evidence" });
  expect(
    (
      await ports.betaBackend(
        { method: "GET", path: "https://foreign.invalid/v2/trips" },
        signal,
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await ports.betaBackend(
        {
          method: "POST",
          path: `/v2/trips/${f.trip}/ledger/personal-payments`,
          body: {},
        },
        signal,
      )
    ).status,
  ).toBe(404);
  expect(
    (
      await ports.betaBackend(
        { method: "GET", path: "/v2/trips", headers: { Authorization: "forged" } },
        signal,
      )
    ).status,
  ).toBe(400);
  const readOnly = await f.bind({ ...f.grant, scopes: ["otr.trips.read"] }, signal, {
    accessToken: "same-signed-evidence",
  });
  expect(
    (
      await readOnly.betaBackend(
        {
          method: "DELETE",
          path: `/v2/trips/${f.trip}/expenses/${f.expense.id}`,
          body: {},
        },
        signal,
      )
    ).status,
  ).toBe(403);
  f.verify.mockResolvedValue({ id: randomUUID(), accountClass: "NORMAL_ACCOUNT" });
  expect(
    (await ports.betaBackend({ method: "GET", path: "/v2/trips" }, signal)).status,
  ).toBe(401);
});

it("does not dispatch a Managed write without the owning admission interface", async () => {
  const f = fixture();
  const owner = vi.fn<typeof import("./app").createDevBackendHandler>();
  const bind = createMcpBetaAccountBinding(
    f.dependencies,
    f.verify,
    undefined,
    undefined,
    undefined,
    owner,
    true,
  );
  const signal = new AbortController().signal;
  const { betaBackend } = await bind(f.grant, signal, { accessToken: "signed-evidence" });
  const response = await betaBackend(
    { method: "POST", path: `/v2/trips/${f.trip}/metadata`, body: {} },
    signal,
  );
  expect(response.status).toBe(403);
  expect(await response.json()).toEqual({
    error: { code: "MCP_WRITE_ADMISSION_CLOSED" },
  });
  expect(owner).not.toHaveBeenCalled();
});

it.each([
  { name: "legacy response loss", managed: false, loseResponse: true, status: 503 },
  {
    name: "Managed DEV completed write",
    managed: true,
    loseResponse: false,
    status: 200,
  },
  { name: "Managed DEV response loss", managed: true, loseResponse: true, status: 503 },
])(
  "$name preserves the original operation outcome",
  async ({ managed, loseResponse, status }) => {
    const f = fixture();
    const permitWrite = vi.fn(() => true);
    const operationId = randomUUID();
    const before = { name: "Before", destination: null, startDate: null, endDate: null };
    const request = {
      formatVersion: 2,
      operationId,
      tripId: f.trip,
      expectedMetadataRevision: 0,
      before,
      after: { ...before, name: "After" },
    };
    const receipt = {
      ...request,
      actorAccountId: f.grant.accountId,
      resultMetadataRevision: 1,
    };
    const update = vi.fn(async () => {
      if (managed) f.verify.mockResolvedValue(null);
      return receipt;
    });
    const loss = vi.fn(async (_grant, _input, response: Response) => {
      if (!response.ok) return;
      expect(await response.clone().json()).toEqual(receipt);
      if (loseResponse) throw Error("ISOLATED_POST_COMMIT_RESPONSE_LOSS");
    });
    const bind = createMcpBetaAccountBinding(
      {
        ...f.dependencies,
        ...(managed ? { managedWriteAdmissionVersion: 1 as const } : {}),
        tripMetadataV2Port: { update } as unknown as NonNullable<
          BackendDependencies["tripMetadataV2Port"]
        >,
      },
      f.verify,
      undefined,
      undefined,
      loss,
      managed
        ? (
              deps: BackendDependencies & {
                managedWriteAdmission?: (
                  actor: string,
                  actual: typeof request,
                ) => Promise<boolean>;
              },
            ) =>
            async (input: Request) => {
              const caller = await deps.gateway.validateAccessToken(
                input.headers.get("authorization")!.slice(7),
              );
              if (!caller) return new Response(null, { status: 401 });
              const operation = await input.json();
              expect(
                await deps.managedWriteAdmission!(caller.id, {
                  ...operation,
                  after: { ...operation.after, name: "Changed input" },
                }),
              ).toBe(false);
              if (!(await deps.managedWriteAdmission!(caller.id, operation)))
                return Response.json({ error: { code: "MCP_WRITE_ADMISSION_DENIED" } }, { status: 401 });
              return Response.json(await update());
            }
        : undefined,
      managed,
      permitWrite,
    );
    const signal = new AbortController().signal;
    const ports = await bind(f.grant, signal, { accessToken: "same-signed-evidence" });
    const send = () =>
      ports.betaBackend(
        {
          method: "POST",
          path: `/v2/trips/${f.trip}/metadata`,
          headers: { "Idempotency-Key": operationId, "OTR-Trip-Metadata-Version": "2" },
          body: request,
        },
        signal,
      );
    if (managed) {
      f.verify.mockClear();
      f.verify
        .mockResolvedValueOnce({ id: f.grant.accountId, accountClass: "NORMAL_ACCOUNT" })
        .mockResolvedValueOnce(null);
      const denied = await send();
      expect(denied.status).toBe(401);
      expect(await denied.json()).toEqual({ error: { code: "MCP_WRITE_ADMISSION_DENIED" } });
      expect(f.verify).toHaveBeenCalledTimes(2);
      expect(update).not.toHaveBeenCalled();
      loss.mockClear();
      permitWrite
        .mockReturnValueOnce(true)
        .mockReturnValueOnce(true)
        .mockReturnValueOnce(false);
      expect((await send()).status).toBe(401);
      expect(update).not.toHaveBeenCalled();
      loss.mockClear();
    }
    f.verify.mockClear();
    const response = await send();
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual(
      loseResponse
        ? { error: { code: "MCP_WRITE_UNAVAILABLE_QUERY_ORIGINAL" } }
        : receipt,
    );
    expect(update).toHaveBeenCalledTimes(1);
    expect(loss).toHaveBeenCalledTimes(1);
    if (managed) {
      expect(f.verify).toHaveBeenCalledTimes(2);
      expect((await send()).status).toBe(401);
      expect((await ports.read("/v2/trips", signal)).status).toBe(401);
      expect(update).toHaveBeenCalledTimes(1);
    }
  },
);

it("admits an Expense only with the same actor, Trip, operation and original Ledger body", async () => {
  const f = fixture();
  const signal = new AbortController().signal;
  const operationId = randomUUID();
  const body = { envelope: { idempotencyKey: operationId, patchOrIntent: { type: "DELETE" } } };
  const command = { tripId: f.trip, operationId };
  const owner: typeof import("./app").createDevBackendHandler = (dependencies) => async () => {
    const admission = (dependencies as BackendDependencies & {
      managedWriteAdmission: (actor: string, operation: typeof command, wireBody: unknown) => Promise<boolean>;
    }).managedWriteAdmission;
    expect(await admission(randomUUID(), command, body)).toBe(false);
    expect(await admission(f.grant.accountId, { ...command, operationId: randomUUID() }, body)).toBe(false);
    expect(await admission(f.grant.accountId, command, { envelope: {} })).toBe(false);
    expect(await admission(f.grant.accountId, command, body)).toBe(true);
    f.verify.mockResolvedValue(null);
    expect(await admission(f.grant.accountId, command, body)).toBe(false);
    return new Response(null, { status: 204 });
  };
  const request = {
    method: "DELETE" as const,
    path: `/v2/trips/${f.trip}/expenses/${f.expense.id}`,
    headers: { "Idempotency-Key": operationId },
    body,
  };
  for (const version of [1, 2] as const) {
    const bind = createMcpBetaAccountBinding(
      { ...f.dependencies, managedWriteAdmissionVersion: version },
      f.verify, undefined, undefined, undefined, owner, true,
    );
    const { betaBackend } = await bind(f.grant, signal, { accessToken: "signed-evidence" });
    expect((await betaBackend(request, signal)).status).toBe(version === 2 ? 204 : 403);
  }
});
