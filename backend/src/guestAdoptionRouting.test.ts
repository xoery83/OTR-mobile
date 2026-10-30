import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { createDevBackendHandler, type DevBackendGateway } from "./app";
import type { GuestAdoptionDevRuntime } from "./guestAdoptionRuntime";

it("authenticates before exposing only the configured normal QA principal's ports", async () => {
  const accountId = randomUUID(),
    otherId = randomUUID();
  const readStatus = vi.fn(async (_actor: string) => {
    throw Error("test reached owning port");
  });
  const runtime: GuestAdoptionDevRuntime = {
    scope: {
      accountId,
      sourceGuestLocalId: randomUUID(),
      expiresAt: new Date().toISOString(),
    },
    ports: { readStatus } as never,
  };
  const validateAccessToken = vi.fn(async (token: string) =>
    token === "qa"
      ? { id: accountId, accountClass: "NORMAL_ACCOUNT" as const }
      : token === "other"
        ? { id: otherId, accountClass: "NORMAL_ACCOUNT" as const }
        : token === "guest"
          ? { id: accountId, accountClass: "ANONYMOUS" as const }
          : null,
  );
  const gateway = { validateAccessToken } as unknown as DevBackendGateway;
  const request = (token: string) =>
    new Request("https://backend.test/v1/auth/guest-adoptions/status", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        contractVersion: 1,
        adoptionId: randomUUID(),
        sourceGuestLocalId: runtime.scope.sourceGuestLocalId,
        targetAccountId: accountId,
        inventorySha256: "a".repeat(64),
      }),
    });
  const handle = createDevBackendHandler({ gateway, guestAdoptionRuntime: runtime });
  expect((await handle(request("invalid"))).status).toBe(401);
  expect((await handle(request("guest"))).status).toBe(403);
  const denied = await handle(request("other"));
  expect(denied.status).toBe(503);
  expect(await denied.text()).toContain("GUEST_ADOPTION_STATUS_CLOSED");
  expect(readStatus).not.toHaveBeenCalled();
  const dormant = await createDevBackendHandler({ gateway })(request("qa"));
  expect(dormant.status).toBe(503);
  expect(readStatus).not.toHaveBeenCalled();
  await handle(request("qa"));
  expect(readStatus).toHaveBeenCalledOnce();
  expect(readStatus.mock.calls[0]?.[0]).toBe(accountId);
});
