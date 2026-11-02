import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createSupabaseDevGateway } from "./supabaseGateway";
import { createDevBackendHandler, type DevBackendGateway } from "./app";
import {
  memberClaimIntentDigest,
  type MemberClaimAuthorityPort,
  type MemberClaimTransaction,
  type MemberClaimCommand,
} from "./tripMemberClaimAuthority";

describe("integrated default-closed Member Claim routes", () => {
  const handler = createDevBackendHandler;
  afterEach(() => vi.restoreAllMocks());

  function fixture() {
    const accountId = randomUUID();
    const command = {
      kind: "CLAIM_PERSON",
      tripId: randomUUID(),
      personId: randomUUID(),
      inviteId: randomUUID(),
      operationId: randomUUID(),
      explicitConsent: true,
    };
    const atomic = vi.fn(async () => ({
      status: "LINKED",
      personId: command.personId,
      inviteId: command.inviteId,
      currentAccess: "READ",
    }));
    const port = { atomic } as unknown as MemberClaimAuthorityPort;
    const gateway = {
      validateAccessToken: vi.fn(async () => ({
        id: accountId,
        accountClass: "NORMAL_ACCOUNT",
      })),
      canReadTrip: vi.fn(async () => false),
    } as unknown as DevBackendGateway;
    const request = (
      body: unknown = command,
      token = "unit-normal-bearer",
      suffix = "",
    ) =>
      new Request(
        `https://api-dev.xoery.art/v2/trips/${command.tripId}/member-claim-operations${suffix}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Idempotency-Key": command.operationId,
          },
          body: JSON.stringify(body),
        },
      );
    return { accountId, command, port, atomic, gateway, request };
  }

  it("keeps other methods closed without entering the owning port", async () => {
    const f = fixture();
    const response = await handler({ gateway: f.gateway, memberClaimPort: f.port })(
      new Request(f.request().url, { method: "GET", headers: f.request().headers }),
    );
    expect(response.status).toBe(405);
    expect(f.atomic).not.toHaveBeenCalled();
    expect(f.gateway.canReadTrip).not.toHaveBeenCalled();
  });

  it("keeps a missing port closed even for an authenticated normal Account", async () => {
    const f = fixture();
    const response = await handler({ gateway: f.gateway })(f.request());
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      error: { code: "MEMBER_CLAIM_CLOSED" },
    });
    expect(f.atomic).not.toHaveBeenCalled();
    expect(f.gateway.canReadTrip).not.toHaveBeenCalled();
  });

  it("uses authenticated B without a preexisting Trip Reader grant", async () => {
    const f = fixture();
    const response = await handler({ gateway: f.gateway, memberClaimPort: f.port })(
      f.request(),
    );
    expect(response.status).toBe(200);
    expect(f.gateway.validateAccessToken).toHaveBeenCalledWith("unit-normal-bearer");
    expect(f.atomic).toHaveBeenCalledWith(
      { tripId: f.command.tripId, actorAccountId: f.accountId },
      expect.any(Function),
    );
    expect(f.gateway.canReadTrip).not.toHaveBeenCalled();
  });

  it("routes original-operation recovery to reads without relinking or restoring access", async () => {
    const f = fixture();
    const receipt = {
      tripId: f.command.tripId,
      actorAccountId: f.accountId,
      operationId: f.command.operationId,
      personId: f.command.personId,
      inviteId: f.command.inviteId,
      intentDigest: memberClaimIntentDigest(f.command as MemberClaimCommand),
      outcome: "LINKED",
    };
    const tx = {
      currentEffectiveAccess: vi.fn(async () => "NONE"),
      receipt: vi.fn(async () => receipt),
      issue: vi.fn(),
      link: vi.fn(),
      revokeUnclaimed: vi.fn(),
      saveReceipt: vi.fn(),
    } as unknown as MemberClaimTransaction;
    const port: MemberClaimAuthorityPort = { atomic: async (_scope, work) => work(tx) };
    const response = await handler({ gateway: f.gateway, memberClaimPort: port })(
      f.request(f.command, "unit-normal-bearer", "/recovery"),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: "LINKED",
      currentAccess: "NONE",
    });
    for (const method of [tx.issue, tx.link, tx.revokeUnclaimed, tx.saveReceipt])
      expect(method).not.toHaveBeenCalled();
    expect(f.gateway.canReadTrip).not.toHaveBeenCalled();
  });

  it.each(["ANONYMOUS", "UNKNOWN", "invalid"])(
    "rejects %s before the owning port",
    async (kind) => {
      const f = fixture();
      vi.mocked(f.gateway.validateAccessToken).mockResolvedValueOnce(
        kind === "invalid"
          ? null
          : { id: f.accountId, accountClass: kind as "ANONYMOUS" | "UNKNOWN" },
      );
      const response = await handler({ gateway: f.gateway, memberClaimPort: f.port })(
        f.request(),
      );
      expect(response.status).toBe(kind === "invalid" ? 401 : 403);
      expect(f.atomic).not.toHaveBeenCalled();
    },
  );

  it("retains ordinary Supabase getUser qualification and rejects resource tokens before IO", async () => {
    const f = fixture();
    const wire = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(Response.json({ id: f.accountId, is_anonymous: false }));
    const gateway = createSupabaseDevGateway({
      url: "https://tuqigdxrvrerfewsxqgm.supabase.co",
      publishableKey: "unit-public",
      secretKey: "unit-unused",
    });
    const app = handler({ gateway, memberClaimPort: f.port });
    expect((await app(f.request())).status).toBe(200);
    expect(wire).toHaveBeenCalledTimes(1);
    expect(new URL(String(wire.mock.calls[0][0])).pathname).toBe("/auth/v1/user");
    wire.mockClear();
    f.atomic.mockClear();
    for (const claims of [
      { client_id: randomUUID() },
      { otr_scopes: ["otr.trips.write"] },
      { aud: "https://api-dev.xoery.art/mcp" },
    ]) {
      const token =
        "unit." +
        Buffer.from(JSON.stringify(claims)).toString("base64url") +
        ".not-a-signature";
      expect((await app(f.request(f.command, token))).status).toBe(401);
    }
    expect(wire).not.toHaveBeenCalled();
    expect(f.atomic).not.toHaveBeenCalled();
  });

  it("rejects caller identity and wrong idempotency keys without entering the port", async () => {
    const f = fixture();
    const app = handler({ gateway: f.gateway, memberClaimPort: f.port });
    expect(
      (await app(f.request({ ...f.command, actorAccountId: randomUUID() }))).status,
    ).toBe(400);
    const wrongKey = f.request();
    wrongKey.headers.set("Idempotency-Key", randomUUID());
    expect((await app(wrongKey)).status).toBe(400);
    expect(f.atomic).not.toHaveBeenCalled();
  });
});
