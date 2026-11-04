import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { createDevBackendHandler, type DevBackendGateway } from "./app";
import {
  isPrivateAccountProfilePath,
  type PrivateAccountProfilePort,
} from "./privateAccountProfile";
import { privateAccountProfilePath as path } from "../../src/data/api/privateAccountProfileContracts";
const accountId = randomUUID(),
  operationId = randomUUID();
const request = (suffix = "", method = "GET", token = "normal", body?: unknown) =>
  new Request("https://api-dev.xoery.art" + path + suffix, {
    method,
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
      "Idempotency-Key": operationId,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
const snapshot = {
  schemaId: "otr.auth.private-profile/1",
  accountId,
  revision: 0,
  fields: {},
};
const receipt = {
  schemaId: "otr.auth.private-profile-receipt/1",
  accountId,
  operationId,
  revision: 1,
  recordedAt: "2026-11-04T00:00:00Z",
};
function setup() {
  const gateway = {
    validateAccessToken: vi.fn(async (token: string) =>
      token === "bad"
        ? null
        : {
            id: accountId,
            accountClass:
              token === "normal"
                ? "NORMAL_ACCOUNT"
                : token === "guest"
                  ? "ANONYMOUS"
                  : "UNKNOWN",
          },
    ),
  } as unknown as DevBackendGateway;
  const port = {
    read: vi.fn().mockResolvedValue(snapshot),
    save: vi.fn().mockResolvedValue(receipt),
    receipt: vi.fn().mockResolvedValue(receipt),
  } satisfies PrivateAccountProfilePort;
  return { gateway, port, log: vi.fn() };
}
it("mounts only root, operations and valid UUID receipt/recovery routes", () => {
  for (const suffix of [
    "",
    "/operations",
    "/operations/" + operationId,
    "/operations/" + operationId + "/recovery",
  ])
    expect(isPrivateAccountProfilePath(path + suffix)).toBe(true);
  for (const suffix of [
    "/",
    "-extra",
    "/other",
    "/operations/",
    "/operations/not-a-uuid",
    "/operations/" + operationId + "/extra",
    "/operations/" + operationId + "/recovery/extra",
  ])
    expect(isPrivateAccountProfilePath(path + suffix)).toBe(false);
  expect(isPrivateAccountProfilePath("/v1/account/profile/bootstrap")).toBe(false);
});
it("keeps every mounted path closed without an injected port", async () => {
  const f = setup(),
    handle = createDevBackendHandler({ gateway: f.gateway });
  for (const suffix of [
    "",
    "/operations",
    "/operations/" + operationId,
    "/operations/" + operationId + "/recovery",
  ]) {
    const response = await handle(request(suffix));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: { code: "PROFILE_CLOSED" } });
    expect(response.headers.get("x-request-id")).toBeTruthy();
  }
});
it("uses normal Account authentication and does not call the port for invalid, Guest or unknown identity", async () => {
  const f = setup(),
    handle = createDevBackendHandler({
      gateway: f.gateway,
      privateAccountProfilePort: f.port,
    });
  for (const [token, status] of [
    ["bad", 401],
    ["guest", 403],
    ["unqualified", 403],
  ] as const)
    expect((await handle(request("", "GET", token))).status).toBe(status);
  expect(f.port.read).not.toHaveBeenCalled();
  expect(f.port.save).not.toHaveBeenCalled();
});
it("passes only server Account scope and retains normal request ID and safe route logging", async () => {
  const f = setup(),
    handle = createDevBackendHandler({
      gateway: f.gateway,
      privateAccountProfilePort: f.port,
      log: f.log,
    });
  const response = await handle(request());
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual(snapshot);
  expect(f.port.read).toHaveBeenCalledWith(
    { accountId, accessToken: "normal" },
    expect.any(AbortSignal),
  );
  expect(f.log).toHaveBeenCalledWith(
    expect.objectContaining({
      route: path,
      status: 200,
      requestId: response.headers.get("x-request-id"),
    }),
  );
  expect(JSON.stringify(f.log.mock.calls)).not.toContain(accountId);
});
it("handles explicit save/receipt/recovery and rejects caller Account fields or foreign result binding", async () => {
  const f = setup(),
    handle = createDevBackendHandler({
      gateway: f.gateway,
      privateAccountProfilePort: f.port,
    });
  const mutation = { operationId, expectedRevision: 0, changes: { displayName: null } };
  expect(
    (
      await handle(
        request("/operations", "POST", "normal", {
          ...mutation,
          accountId: randomUUID(),
        }),
      )
    ).status,
  ).toBe(400);
  expect(f.port.save).not.toHaveBeenCalled();
  expect((await handle(request("/operations", "POST", "normal", mutation))).status).toBe(
    200,
  );
  expect((await handle(request("/operations/" + operationId))).status).toBe(200);
  expect(
    await (await handle(request("/operations/" + operationId + "/recovery"))).json(),
  ).toEqual({ status: "APPLIED", receipt });
  f.port.receipt.mockResolvedValue(null);
  expect(
    await (await handle(request("/operations/" + operationId + "/recovery"))).json(),
  ).toEqual({ status: "ABSENT_UNCONFIRMED" });
  f.port.read.mockResolvedValue({ ...snapshot, accountId: randomUUID() });
  const foreign = await handle(request());
  expect(foreign.status).toBe(503);
  expect(await foreign.json()).toMatchObject({
    error: { code: "PROFILE_RESULT_BINDING" },
  });
});
it("does not intercept sibling Account paths and preserves the independent Bootstrap branch", async () => {
  const f = setup(),
    ensure = vi
      .fn()
      .mockResolvedValue({
        schemaId: "otr.auth.account-profile-bootstrap/1",
        accountId,
        ready: true,
      });
  const handle = createDevBackendHandler({
    gateway: f.gateway,
    privateAccountProfilePort: f.port,
    accountProfileBootstrapPort: { ensure },
  });
  for (const suffix of [
    "-extra",
    "/other",
    "/operations/not-a-uuid",
    "/operations/" + operationId + "/extra",
  ])
    expect((await handle(request(suffix))).status).toBe(404);
  expect(f.gateway.validateAccessToken).not.toHaveBeenCalled();
  const response = await handle(
    new Request("https://api-dev.xoery.art/v1/account/profile/bootstrap", {
      method: "POST",
      headers: { Authorization: "Bearer normal", "Content-Type": "application/json" },
      body: "{}",
    }),
  );
  expect(response.status).toBe(200);
  expect(ensure).toHaveBeenCalledTimes(1);
  expect(f.port.read).not.toHaveBeenCalled();
});
