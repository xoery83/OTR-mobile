import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { createDevBackendHandler, type DevBackendGateway } from "./app";
import { accountProfileBootstrapPath } from "@/data/api/accountProfileContracts";
const actor = randomUUID();
const request = (token = "normal-user-token", body: unknown = {}) =>
  new Request("https://api-dev.xoery.art" + accountProfileBootstrapPath, {
    method: "POST",
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
it("requires normal Backend authentication and a configured self-profile port", async () => {
  const ensure = vi.fn(async () => ({
    schemaId: "otr.auth.account-profile-bootstrap/1" as const,
    accountId: actor,
    ready: true as const,
  }));
  const gateway = {
    validateAccessToken: vi.fn(async (t: string) =>
      t === "normal-user-token"
        ? { id: actor, accountClass: "NORMAL_ACCOUNT" as const }
        : null,
    ),
  } as unknown as DevBackendGateway;
  expect(
    (
      await createDevBackendHandler({ gateway, accountProfileBootstrapPort: { ensure } })(
        request("bad"),
      )
    ).status,
  ).toBe(401);
  expect(ensure).not.toHaveBeenCalled();
  expect((await createDevBackendHandler({ gateway })(request())).status).toBe(503);
  const response = await createDevBackendHandler({
    gateway,
    accountProfileBootstrapPort: { ensure },
  })(request());
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ accountId: actor, ready: true });
  expect(ensure).toHaveBeenCalledWith(
    actor,
    "normal-user-token",
    expect.any(AbortSignal),
  );
});
it("rejects a caller-supplied Account before the self-profile port", async () => {
  const ensure = vi.fn();
  const gateway = {
    validateAccessToken: async () => ({
      id: actor,
      accountClass: "NORMAL_ACCOUNT" as const,
    }),
  } as unknown as DevBackendGateway;
  expect(
    (
      await createDevBackendHandler({ gateway, accountProfileBootstrapPort: { ensure } })(
        request("normal-user-token", { accountId: randomUUID() }),
      )
    ).status,
  ).toBe(400);
  expect(ensure).not.toHaveBeenCalled();
});
