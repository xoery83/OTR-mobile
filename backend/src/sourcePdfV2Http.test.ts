import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { sourcePdfV2Boundary } from "./sourcePdfV2Http";
function fixture() {
  const actor = randomUUID(),
    trip = randomUUID();
  const seal = {
    derivativeVersion: 2,
    operationId: randomUUID(),
    sourceId: randomUUID(),
    sourceRevision: 1,
    sourceRowRevision: 1,
    originalRepresentationId: randomUUID(),
    originalRowRevision: 1,
    derivedRepresentationId: randomUUID(),
  };
  const register = {
    ...seal,
    verificationOperationId: randomUUID(),
    verificationResultSha256: "a".repeat(64),
  };
  const verify = {
    contract_version: 1,
    command: "VERIFY_REPRESENTATION",
    operation_id: randomUUID(),
    operation_key: randomUUID(),
    actor_account_id: actor,
    trip_id: trip,
    source_id: seal.sourceId,
    operation_sha256: "b".repeat(64),
    payload: {
      material_revision: 1,
      expected_source_row_revision: 1,
      expected_source_state: { lifecycle: "ACTIVE", retention_state: "RETAINED" },
      representation_id: seal.originalRepresentationId,
      expected_representation_row_revision: 1,
      expected_representation_state: {
        remote_state: "PENDING",
        retention_state: "RETAINED",
      },
    },
  };
  const port = { verifyOriginal: vi.fn(), registerDerived: vi.fn(), seal: vi.fn() };
  const request = (action: string, body: unknown) =>
    new Request(`https://dev.example.invalid/v2/trips/${trip}/sources/pdf-v2/${action}`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  return { actor, trip, seal, register, verify, port, request };
}
it("keeps an omitted PDF port closed without reading material or starting workers", async () => {
  const f = fixture();
  const response = await sourcePdfV2Boundary(
    f.request("seal", f.seal),
    f.actor,
    async () => true,
  );
  expect(response.status).toBe(503);
  expect(await response.json()).toMatchObject({
    error: { code: "SOURCE_CAPABILITY_CLOSED" },
  });
  expect(response.headers.get("cache-control")).toBe("private, no-store");
});
it.each(["verify-original", "register-derived", "seal"])(
  "denied Trip never reaches %s authority",
  async (action) => {
    const f = fixture();
    expect(
      (
        await sourcePdfV2Boundary(
          f.request(action, f.register),
          f.actor,
          async () => false,
          f.port as never,
        )
      ).status,
    ).toBe(403);
    for (const method of Object.values(f.port)) expect(method).not.toHaveBeenCalled();
  },
);
it.each([
  ["verify-original", "verifyOriginal", "verify"],
  ["register-derived", "registerDerived", "register"],
  ["seal", "seal", "seal"],
] as const)(
  "delegates %s only through the owning typed port and authenticated Actor/Trip",
  async (action, method, body) => {
    const f = fixture();
    // HTTP delegation only: this sentinel is not a PDF verification/seal receipt.
    f.port[method].mockResolvedValue({ testOnlyPortResult: true });
    const response = await sourcePdfV2Boundary(
      f.request(action, f[body]),
      f.actor,
      async () => true,
      f.port as never,
    );
    expect(response.status).toBe(200);
    expect(f.port[method]).toHaveBeenCalledExactlyOnceWith(f.actor, f.trip, f[body]);
    expect(response.headers.get("vary")).toBe("Authorization");
  },
);
it.each(["actor_account_id", "trip_id"])(
  "rejects a claimed foreign %s before original verification",
  async (field) => {
    const f = fixture();
    const response = await sourcePdfV2Boundary(
      f.request("verify-original", { ...f.verify, [field]: randomUUID() }),
      f.actor,
      async () => true,
      f.port as never,
    );
    expect(response.status).toBe(403);
    expect(f.port.verifyOriginal).not.toHaveBeenCalled();
  },
);
it("does not accept /1 producer requests or raw worker paths and URLs", async () => {
  const f = fixture();
  for (const body of [
    { ...f.seal, derivativeVersion: 1 },
    { ...f.seal, executable: "/bin/sh" },
    { ...f.seal, url: "https://untrusted.invalid/file.pdf" },
  ]) {
    expect(
      (
        await sourcePdfV2Boundary(
          f.request("seal", body),
          f.actor,
          async () => true,
          f.port as never,
        )
      ).status,
    ).toBe(422);
  }
  expect(f.port.seal).not.toHaveBeenCalled();
});
it("retains uncertain storage as unavailable and never returns private error details", async () => {
  const f = fixture();
  f.port.seal.mockRejectedValue(Error("PRIVATE_CUSTODY_TOKEN_AND_PATH"));
  const response = await sourcePdfV2Boundary(
    f.request("seal", f.seal),
    f.actor,
    async () => true,
    f.port as never,
  );
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain("PRIVATE_CUSTODY_TOKEN_AND_PATH");
});
it("caps actual JSON bytes before invoking an owning mutation", async () => {
  const f = fixture();
  const response = await sourcePdfV2Boundary(
    f.request("seal", { ...f.seal, padding: "x".repeat(2097152) }),
    f.actor,
    async () => true,
    f.port as never,
  );
  expect(response.status).toBe(413);
  expect(f.port.seal).not.toHaveBeenCalled();
});
