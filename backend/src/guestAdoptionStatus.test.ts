import { randomUUID } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import {
  guestAdoptionStatusBoundary,
  type GuestAdoptionStatusPort,
} from "./guestAdoptionStatus";
import type { GuestAdoptionStatusRequest } from "../../src/domain/auth/guestAdoptionStatus";

afterEach(() => vi.useRealTimers());
const path = "https://example.invalid/v1/auth/guest-adoptions/status";
function fixture() {
  const user = { id: randomUUID() };
  const input: GuestAdoptionStatusRequest = {
    contractVersion: 1,
    adoptionId: randomUUID(),
    sourceGuestLocalId: randomUUID(),
    targetAccountId: user.id,
    inventorySha256: "a".repeat(64),
  };
  const result = { ...input, status: "IN_PROGRESS", nextAction: "QUERY_SERVER_STATUS" };
  const readStatus = vi.fn(async () => result);
  const port: GuestAdoptionStatusPort = { readStatus };
  const request = (body: unknown = input, signal?: AbortSignal) =>
    new Request(path, { method: "POST", body: JSON.stringify(body), signal });
  return { user, input, result, readStatus, port, request };
}
it("keeps missing owning reader closed", async () => {
  const f = fixture();
  expect((await guestAdoptionStatusBoundary(f.request(), f.user)).status).toBe(503);
});
it.each(["IN_PROGRESS", "NOT_FOUND"])(
  "keeps %s in authoritative recovery instead of unlocking locally",
  async (status) => {
    const f = fixture();
    f.result.status = status;
    const response = await guestAdoptionStatusBoundary(f.request(), f.user, f.port);
    expect(response.status).toBe(200);
    expect((await response.json()).nextAction).toBe("QUERY_SERVER_STATUS");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("Vary")).toBe("Authorization");
    expect(f.readStatus).toHaveBeenCalledWith(
      f.user.id,
      f.input,
      expect.any(AbortSignal),
    );
  },
);
it.each(["PUBLISHED", "CANCELLED"])(
  "requires a separate owning receipt read for %s",
  async (status) => {
    const f = fixture();
    const result = {
      ...f.input,
      status,
      nextAction:
        status === "PUBLISHED" ? "READ_PUBLICATION_RECEIPT" : "READ_CANCELLATION_RECEIPT",
      receipt: { receiptId: randomUUID(), receiptSha256: "b".repeat(64) },
    };
    const response = await guestAdoptionStatusBoundary(f.request(), f.user, {
      readStatus: async () => result,
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(result);
  },
);
it.each(["adoptionId", "sourceGuestLocalId", "targetAccountId", "inventorySha256"])(
  "rejects mismatched returned %s",
  async (field) => {
    const f = fixture();
    const bad = {
      ...f.result,
      [field]: field === "inventorySha256" ? "b".repeat(64) : randomUUID(),
    };
    expect(
      (
        await guestAdoptionStatusBoundary(f.request(), f.user, {
          readStatus: async () => bad,
        })
      ).status,
    ).toBe(503);
  },
);
it("refuses another target Account before adapter access", async () => {
  const f = fixture();
  expect(
    (
      await guestAdoptionStatusBoundary(
        f.request({ ...f.input, targetAccountId: randomUUID() }),
        f.user,
        f.port,
      )
    ).status,
  ).toBe(403);
  expect(f.readStatus).not.toHaveBeenCalled();
});
it.each([
  { status: "PUBLISHED", nextAction: "READ_PUBLICATION_RECEIPT" },
  { status: "CANCELLED", nextAction: "RESUME_GUEST" },
  { status: "NOT_FOUND", nextAction: "RESUME_GUEST" },
  {
    status: "IN_PROGRESS",
    nextAction: "QUERY_SERVER_STATUS",
    privateName: "must-not-leak",
  },
])("rejects unsupported proof/action/extra fields %#", async (fields) => {
  const f = fixture();
  const response = await guestAdoptionStatusBoundary(f.request(), f.user, {
    readStatus: async () => ({ ...f.input, ...fields }),
  });
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain("must-not-leak");
});
it("pins actor and input before adapter/caller mutations", async () => {
  const f = fixture(),
    actor = f.user.id;
  const response = await guestAdoptionStatusBoundary(f.request(), f.user, {
    readStatus: async (id, input) => {
      expect(id).toBe(actor);
      input.targetAccountId = randomUUID();
      f.user.id = randomUUID();
      return f.result;
    },
  });
  expect(response.status).toBe(200);
  expect((await response.json()).targetAccountId).toBe(actor);
});
it("does not accept names/files/credentials in status input", async () => {
  const f = fixture();
  expect(
    (
      await guestAdoptionStatusBoundary(
        f.request({ ...f.input, accessToken: "not-a-credential" }),
        f.user,
        f.port,
      )
    ).status,
  ).toBe(400);
  expect(f.readStatus).not.toHaveBeenCalled();
});
it("bounds bodies and malformed input before adapter access", async () => {
  const f = fixture();
  expect(
    (
      await guestAdoptionStatusBoundary(
        f.request({ ...f.input, padding: "x".repeat(8192) }),
        f.user,
        f.port,
      )
    ).status,
  ).toBe(413);
  expect(
    (
      await guestAdoptionStatusBoundary(
        new Request(path, { method: "POST", body: "{" }),
        f.user,
        f.port,
      )
    ).status,
  ).toBe(400);
  expect(f.readStatus).not.toHaveBeenCalled();
});
it("keeps route/method/unauthenticated probes outside the reader", async () => {
  const f = fixture();
  expect(
    (
      await guestAdoptionStatusBoundary(
        new Request(path + "?x=1", { method: "POST" }),
        f.user,
        f.port,
      )
    ).status,
  ).toBe(400);
  expect(
    (await guestAdoptionStatusBoundary(new Request(path), f.user, f.port)).status,
  ).toBe(405);
  expect(
    (await guestAdoptionStatusBoundary(new Request(path + "/other"), f.user, f.port))
      .status,
  ).toBe(404);
  expect(
    (await guestAdoptionStatusBoundary(f.request(), { id: "not-an-account" }, f.port))
      .status,
  ).toBe(401);
  expect(f.readStatus).not.toHaveBeenCalled();
});
it("forwards cancellation without consulting the store", async () => {
  const f = fixture(),
    controller = new AbortController();
  controller.abort();
  expect(
    (
      await guestAdoptionStatusBoundary(
        f.request(f.input, controller.signal),
        f.user,
        f.port,
      )
    ).status,
  ).toBe(499);
  expect(f.readStatus).not.toHaveBeenCalled();
});
it("bounds nonsettling status reads and sanitizes private failures", async () => {
  vi.useFakeTimers();
  const f = fixture();
  let signal: AbortSignal | undefined;
  const pending = guestAdoptionStatusBoundary(f.request(), f.user, {
    readStatus: async (_actor, _input, current) => {
      signal = current;
      return new Promise(() => {});
    },
  });
  await vi.advanceTimersByTimeAsync(15001);
  expect((await pending).status).toBe(504);
  expect(signal?.aborted).toBe(true);
  vi.useRealTimers();
  const failed = await guestAdoptionStatusBoundary(f.request(), f.user, {
    readStatus: async () => {
      throw Error("private-storage-sentinel");
    },
  });
  expect(failed.status).toBe(503);
  expect(await failed.text()).not.toContain("private-storage-sentinel");
});
