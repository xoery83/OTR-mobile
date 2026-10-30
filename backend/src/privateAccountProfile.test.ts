import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import {
  privateAccountProfileBoundary,
  PrivateAccountProfileError,
} from "./privateAccountProfile";
import { privateAccountProfilePath as path } from "../../src/data/api/privateAccountProfileContracts";

function fixture() {
  const user = { id: randomUUID(), accountClass: "NORMAL_ACCOUNT" as const };
  const input = {
    operationId: randomUUID(),
    expectedRevision: 0,
    changes: {
      displayName: "",
      travelDocumentName: { mode: "UNSPLIT" as const, fullName: "林 QA" },
    },
  };
  const snapshot = {
    schemaId: "otr.auth.private-profile/1",
    accountId: user.id,
    revision: 0,
    fields: {},
  };
  const receipt = {
    schemaId: "otr.auth.private-profile-receipt/1",
    accountId: user.id,
    operationId: input.operationId,
    revision: 1,
    recordedAt: "2026-10-31T00:00:00Z",
  };
  const port = {
    read: vi.fn(async () => snapshot),
    save: vi.fn(async () => receipt),
    receipt: vi.fn(async () => receipt),
  };
  const get = (suffix = "") =>
    new Request("https://api.example.test" + path + suffix, {
      headers: { Authorization: "Bearer unit-only" },
    });
  const post = (body: unknown = input, key = input.operationId) =>
    new Request("https://api.example.test" + path + "/operations", {
      method: "POST",
      headers: { Authorization: "Bearer unit-only", "Idempotency-Key": key },
      body: JSON.stringify(body),
    });
  return { user, input, snapshot, receipt, port, get, post };
}

it("keeps storage optional and allows an empty private profile without creating a registration gate", async () => {
  const f = fixture();
  expect((await privateAccountProfileBoundary(f.get(), f.user)).status).toBe(503);
  const result = await privateAccountProfileBoundary(f.get(), f.user, f.port);
  expect(result.status).toBe(200);
  expect(result.headers.get("Cache-Control")).toBe("private, no-store");
  expect(await result.json()).toEqual(f.snapshot);
  expect(f.port.save).not.toHaveBeenCalled();
});

it("binds private mutation and receipt lookup to normal authenticated Account and stable operation", async () => {
  const f = fixture();
  const result = await privateAccountProfileBoundary(f.post(), f.user, f.port);
  expect(result.status).toBe(200);
  expect(await result.json()).toEqual(f.receipt);
  expect(f.port.save).toHaveBeenCalledWith(
    { accountId: f.user.id, accessToken: "unit-only" },
    f.input,
    expect.any(AbortSignal),
  );
  const lookup = await privateAccountProfileBoundary(
    f.get("/operations/" + f.input.operationId),
    f.user,
    f.port,
  );
  expect(await lookup.json()).toEqual(f.receipt);
  expect(f.port.receipt).toHaveBeenCalledWith(
    { accountId: f.user.id, accessToken: "unit-only" },
    f.input.operationId,
    expect.any(AbortSignal),
  );
});

it.each(["identity", "empty", "version", "key", "name"] as const)(
  "rejects an invalid private mutation before the owning port: %s",
  async (kind) => {
    const f = fixture();
    const body =
      kind === "identity"
        ? { ...f.input, accountId: randomUUID() }
        : kind === "empty"
          ? { ...f.input, changes: {} }
          : kind === "version"
            ? { ...f.input, expectedRevision: -1 }
            : kind === "name"
              ? { ...f.input, changes: { displayName: "QA\0" } }
              : f.input;
    const result = await privateAccountProfileBoundary(
      f.post(body, kind === "key" ? randomUUID() : f.input.operationId),
      f.user,
      f.port,
    );
    expect(result.status).toBe(400);
    expect(f.port.save).not.toHaveBeenCalled();
  },
);

it("rejects Guest/anonymous identity and missing bearer before private data access", async () => {
  const f = fixture();
  expect(
    (
      await privateAccountProfileBoundary(
        f.get(),
        {
          ...f.user,
          accountClass: "ANONYMOUS_ACCOUNT" as never,
        },
        f.port,
      )
    ).status,
  ).toBe(403);
  expect(
    (
      await privateAccountProfileBoundary(
        new Request("https://api.example.test" + path),
        f.user,
        f.port,
      )
    ).status,
  ).toBe(401);
  expect(f.port.read).not.toHaveBeenCalled();
});

it("never returns another Account's private names or mutation receipt", async () => {
  const f = fixture();
  f.port.read.mockResolvedValueOnce({
    ...f.snapshot,
    accountId: randomUUID(),
    fields: { displayName: "FOREIGN_PRIVATE" },
  } as never);
  const read = await privateAccountProfileBoundary(f.get(), f.user, f.port);
  expect(read.status).toBe(503);
  expect(await read.text()).not.toContain("FOREIGN_PRIVATE");
  f.port.save.mockResolvedValueOnce({ ...f.receipt, accountId: randomUUID() });
  expect((await privateAccountProfileBoundary(f.post(), f.user, f.port)).status).toBe(
    503,
  );
  f.port.receipt.mockResolvedValueOnce({ ...f.receipt, operationId: randomUUID() });
  expect(
    (
      await privateAccountProfileBoundary(
        f.get("/operations/" + f.input.operationId),
        f.user,
        f.port,
      )
    ).status,
  ).toBe(503);
});

it("rejects an unproven revision and distinguishes missing receipt, conflict and unavailable storage", async () => {
  const f = fixture();
  f.port.save.mockResolvedValueOnce({ ...f.receipt, revision: 9 });
  expect((await privateAccountProfileBoundary(f.post(), f.user, f.port)).status).toBe(
    503,
  );
  f.port.receipt.mockResolvedValueOnce(null as never);
  expect(
    (
      await privateAccountProfileBoundary(
        f.get("/operations/" + f.input.operationId),
        f.user,
        f.port,
      )
    ).status,
  ).toBe(404);
  f.port.save.mockRejectedValueOnce(
    new PrivateAccountProfileError(409, "PROFILE_CONFLICT"),
  );
  expect((await privateAccountProfileBoundary(f.post(), f.user, f.port)).status).toBe(
    409,
  );
  f.port.save.mockRejectedValueOnce(Error("DO_NOT_EXPOSE_INTERNAL_DETAILS"));
  const unavailable = await privateAccountProfileBoundary(f.post(), f.user, f.port);
  expect(unavailable.status).toBe(503);
  expect(await unavailable.text()).not.toContain("DO_NOT_EXPOSE_INTERNAL_DETAILS");
});
