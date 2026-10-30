import { randomUUID } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { guestAdoptionCancelBoundary } from "./guestAdoptionCancel";
import { guestAdoptionReceiptBoundary } from "./guestAdoptionReceipt";
import { coreHashValue } from "../../src/domain/trip/tripCoreV2Read";
import { tripCoreSha256Hex } from "../../src/data/repositories/tripCoreSha256";

afterEach(() => vi.useRealTimers());
async function fixture() {
  const user = { id: randomUUID(), accountClass: "NORMAL_ACCOUNT" as const };
  const binding = {
    contractVersion: 1 as const,
    adoptionId: randomUUID(),
    sourceGuestLocalId: randomUUID(),
    targetAccountId: user.id,
    inventorySha256: "a".repeat(64),
  };
  const body = {
    ...binding,
    schemaId: "otr.auth.guest-adoption-receipt/1" as const,
    receiptId: randomUUID(),
    grantId: randomUUID(),
    policyVersion: "unpriced/1",
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
  const input = {
    ...binding,
    receiptId: receipt.receiptId,
    receiptSha256: receipt.receiptSha256,
  };
  const readReceipt = vi.fn(async () => receipt);
  const request = (value: unknown = input, signal?: AbortSignal) =>
    new Request("https://example.invalid/v1/auth/guest-adoptions/receipt", {
      method: "POST",
      body: JSON.stringify(value),
      signal,
    });
  return { user, binding, receipt, input, readReceipt, request };
}
it("keeps the missing owning terminal reader closed", async () => {
  const f = await fixture();
  expect((await guestAdoptionReceiptBoundary(f.request(), f.user)).status).toBe(503);
});
it("reads one bound terminal receipt after grant lifetime without mutating session or source", async () => {
  const f = await fixture();
  const response = await guestAdoptionReceiptBoundary(f.request(), f.user, f);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual(f.receipt);
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  expect(response.headers.get("Vary")).toBe("Authorization");
  expect(f.readReceipt).toHaveBeenCalledWith(f.user.id, f.input, expect.any(AbortSignal));
});
it.each([
  "adoptionId",
  "sourceGuestLocalId",
  "inventorySha256",
  "receiptId",
  "receiptSha256",
])("rejects a mismatched requested %s", async (key) => {
  const f = await fixture();
  const input = {
    ...f.input,
    [key]: key.endsWith("Sha256") ? "b".repeat(64) : randomUUID(),
  };
  expect((await guestAdoptionReceiptBoundary(f.request(input), f.user, f)).status).toBe(
    503,
  );
});
it("rejects another Account before reading its record", async () => {
  const f = await fixture();
  expect(
    (
      await guestAdoptionReceiptBoundary(
        f.request({ ...f.input, targetAccountId: randomUUID() }),
        f.user,
        f,
      )
    ).status,
  ).toBe(403);
  expect(f.readReceipt).not.toHaveBeenCalled();
});
it.each(["ANONYMOUS", "UNKNOWN"] as const)(
  "rejects %s before the owning reader",
  async (accountClass) => {
    const f = await fixture();
    expect(
      (await guestAdoptionReceiptBoundary(f.request(), { ...f.user, accountClass }, f))
        .status,
    ).toBe(403);
    expect(f.readReceipt).not.toHaveBeenCalled();
  },
);
it("rejects corrupted, missing or arbitrary adapter output without leaking it", async () => {
  const f = await fixture();
  for (const result of [
    null,
    { ...f.receipt, policyVersion: "tampered-private" },
    { private: "must-not-leak" },
  ]) {
    const response = await guestAdoptionReceiptBoundary(f.request(), f.user, {
      readReceipt: async () => result,
    });
    expect(response.status).toBe(503);
    expect(await response.text()).not.toMatch(/tampered-private|must-not-leak/);
  }
});
it("bounds request metadata before adapter access", async () => {
  const f = await fixture();
  expect(
    (
      await guestAdoptionReceiptBoundary(
        f.request({ ...f.input, padding: "x".repeat(8192) }),
        f.user,
        f,
      )
    ).status,
  ).toBe(413);
  expect(f.readReceipt).not.toHaveBeenCalled();
});
it("pins the actor and expected pointer against adapter mutation", async () => {
  const f = await fixture(),
    actor = f.user.id;
  const response = await guestAdoptionReceiptBoundary(f.request(), f.user, {
    readReceipt: async (id, input) => {
      expect(id).toBe(actor);
      input.receiptId = randomUUID();
      f.user.id = randomUUID();
      return f.receipt;
    },
  });
  expect(response.status).toBe(200);
});
it("redacts owning failures", async () => {
  const f = await fixture();
  const response = await guestAdoptionReceiptBoundary(f.request(), f.user, {
    readReceipt: async () => {
      throw Error("private database material");
    },
  });
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain("private database material");
});

function cancelRequest(
  binding: { adoptionId: string; [key: string]: unknown },
  key = binding.adoptionId,
) {
  return new Request("https://example.invalid/v1/auth/guest-adoptions/cancel", {
    method: "POST",
    headers: { "Idempotency-Key": key },
    body: JSON.stringify(binding),
  });
}
it("normal cancellation uses exact binding/idempotency and returns only a verified server receipt", async () => {
  const f = await fixture(),
    cancel = vi.fn(async () => f.receipt);
  const response = await guestAdoptionCancelBoundary(cancelRequest(f.binding), f.user, {
    cancel,
  });
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual(f.receipt);
  expect(cancel).toHaveBeenCalledWith(f.user.id, f.binding, expect.any(AbortSignal));
});
it("keeps cancellation closed without an owning writer", async () => {
  const f = await fixture();
  expect(
    (await guestAdoptionCancelBoundary(cancelRequest(f.binding), f.user)).status,
  ).toBe(503);
});
it("requires the same adoption idempotency key before cancellation", async () => {
  const f = await fixture(),
    cancel = vi.fn(async () => f.receipt);
  expect(
    (
      await guestAdoptionCancelBoundary(cancelRequest(f.binding, randomUUID()), f.user, {
        cancel,
      })
    ).status,
  ).toBe(400);
  expect(cancel).not.toHaveBeenCalled();
});
it("does not cancel another Account's attempt", async () => {
  const f = await fixture(),
    cancel = vi.fn(async () => f.receipt);
  expect(
    (
      await guestAdoptionCancelBoundary(
        cancelRequest({ ...f.binding, targetAccountId: randomUUID() }),
        f.user,
        { cancel },
      )
    ).status,
  ).toBe(403);
  expect(cancel).not.toHaveBeenCalled();
});
it("returns UNKNOWN without a receipt when cancellation COMMIT is uncertain", async () => {
  const f = await fixture();
  const response = await guestAdoptionCancelBoundary(cancelRequest(f.binding), f.user, {
    cancel: async () => {
      throw Error("GUEST_ADOPTION_CANCEL_OUTCOME_UNKNOWN");
    },
  });
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({
    error: {
      code: "GUEST_ADOPTION_CANCEL_OUTCOME_UNKNOWN",
      message: "GUEST_ADOPTION_CANCEL_OUTCOME_UNKNOWN",
    },
  });
});
