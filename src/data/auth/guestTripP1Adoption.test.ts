import { beforeEach, expect, it, vi } from "vitest";
import { fixture } from "../../../backend/src/guestAdoptionCompositePlan.fixture";
import { getAccountGeneration } from "./accountGeneration";
import { prepareGuestTripP1Adoption } from "./guestTripP1Adoption";
const m = vi.hoisted(() => ({
  freeze: vi.fn(),
  checkpoint: vi.fn(),
  recovery: vi.fn(),
  transport: vi.fn(),
  read: vi.fn(),
  store: vi.fn(),
  revoke: vi.fn(),
  uuid: vi.fn(),
  logout: vi.fn(),
}));
vi.mock("./guestHandoffInventory", () => ({ freezeGuestHandoffInventory: m.freeze }));
vi.mock("./guestHandoffCheckpoint", () => ({
  prepareGuestHandoffCheckpoint: m.checkpoint,
}));
vi.mock("./guestAdoptionRecovery", () => ({ openGuestAdoptionRecovery: m.recovery }));
vi.mock("./guestAdoptionTransport", () => ({
  createGuestAdoptionTransport: m.transport,
}));
vi.mock("./authRepository", () => ({
  guestVerificationSession: { read: m.read, store: m.store, revoke: m.revoke },
}));
vi.mock("@/domain/localId", () => ({ createUuid: m.uuid }));
vi.mock("./devSupabaseAuth", () => ({ revokeSupabaseDevSession: m.logout }));
beforeEach(() => vi.resetAllMocks());
async function setup() {
  const f = fixture(),
    checkpoint = await f.source(),
    events: string[] = [];
  const session = {
    accessToken: "unit-not-network-token",
    refreshToken: "unit-not-network-refresh",
    expiresAt: "2099-01-01T00:00:00Z",
    identity: { userId: f.user.id, displayName: "", email: null },
  };
  const inventory = {
    scope: {
      kind: "GUEST",
      localId: f.grant.sourceGuestLocalId,
      generation: getAccountGeneration(),
    },
    drafts: [],
    files: { entries: [] },
    assertCurrent: vi.fn(async () => {}),
    resumeGuestBeforePublication: vi.fn(async () => {
      events.push("resume");
    }),
  };
  m.uuid.mockReturnValue(f.grant.adoptionId);
  m.freeze.mockResolvedValue(inventory);
  m.checkpoint.mockResolvedValue({
    preparation: JSON.parse(checkpoint.canonicalText),
    preparationSha256: checkpoint.sha256,
    preflight: {
      contractVersion: 1,
      adoptionId: f.grant.adoptionId,
      sourceGuestLocalId: f.grant.sourceGuestLocalId,
      targetAccountId: f.user.id,
      inventorySha256: f.grant.inventorySha256,
      resources: f.grant.resources,
    },
  });
  const recovery = {
    requestPublication: vi.fn(async () => {
      events.push("durable-hold");
    }),
    cancelBeforePublication: vi.fn(async () => {
      events.push("local-cancel");
    }),
  };
  m.recovery.mockResolvedValue(recovery);
  m.read.mockResolvedValue({ status: "ABSENT" });
  m.store.mockResolvedValue(undefined);
  m.revoke.mockImplementation(async (_binding, revoke) => {
    events.push("revoke");
    await revoke(session);
  });
  const receipt = {
    outcome: "PUBLISHED",
    receiptId: f.grant.grantId,
    receiptSha256: "d".repeat(64),
  };
  const transport = {
    targetReads: {
      ensureProfile: vi.fn(async () => {
        events.push("profile");
      }),
    },
    preflight: vi.fn(async () => {
      events.push("preflight");
      return f.grant;
    }),
    stage: vi.fn(async () => {
      events.push("stage");
      return { planSha256: "c".repeat(64) };
    }),
    status: vi.fn(async () => ({ status: "IN_PROGRESS" })),
    publish: vi.fn(async () => {
      events.push("publish");
      return receipt;
    }),
    receipt: vi.fn(async () => receipt),
    cancel: vi.fn(async () => {
      events.push("server-cancel");
      return { outcome: "CANCELLED" };
    }),
  };
  m.transport.mockReturnValue(transport);
  const prepare = () =>
    prepareGuestTripP1Adoption(
      session,
      f.user.id,
      getAccountGeneration(),
      new AbortController().signal,
    );
  return { f, session, inventory, recovery, transport, events, receipt, prepare };
}
it("uses the normal Profile/preflight/stage ports and durable hold before publication", async () => {
  const f = await setup(),
    attempt = await f.prepare();
  await expect(attempt.publish()).resolves.toEqual(f.receipt);
  expect(f.events).toEqual(["profile", "preflight", "stage", "durable-hold", "publish"]);
  expect(f.transport.preflight).toHaveBeenCalledWith(expect.anything(), f.f.user.id);
  expect(f.inventory.resumeGuestBeforePublication).not.toHaveBeenCalled();
  expect(attempt.canCancel).toBe(false);
});
it("never publishes after an uncertain local hold write and retries the same stage identity", async () => {
  const f = await setup(),
    attempt = await f.prepare();
  f.recovery.requestPublication.mockRejectedValueOnce(Error("LOCAL_WRITE_UNKNOWN"));
  await expect(attempt.publish()).rejects.toThrow("LOCAL_WRITE_UNKNOWN");
  expect(f.transport.publish).not.toHaveBeenCalled();
  await expect(attempt.cancel()).rejects.toThrow("AUTHORITATIVE_STATUS_REQUIRED");
  await attempt.publish();
  expect(f.transport.stage).toHaveBeenCalledOnce();
  expect(f.recovery.requestPublication).toHaveBeenCalledTimes(2);
});
it("recovers a lost publication reply by status/receipt without publishing twice", async () => {
  const f = await setup(),
    attempt = await f.prepare();
  f.transport.publish.mockRejectedValueOnce(Error("COMMIT_UNKNOWN"));
  await expect(attempt.publish()).rejects.toThrow("COMMIT_UNKNOWN");
  f.transport.status.mockResolvedValueOnce({
    status: "PUBLISHED",
    receipt: { receiptId: f.receipt.receiptId, receiptSha256: f.receipt.receiptSha256 },
  } as never);
  await attempt.publish();
  expect(f.transport.publish).toHaveBeenCalledOnce();
  expect(f.transport.receipt).toHaveBeenCalledOnce();
});
it("revokes the provisional session and resumes Guest only after pre-publication cancellation", async () => {
  const f = await setup(),
    attempt = await f.prepare();
  f.transport.stage.mockRejectedValueOnce(Error("STAGE_FAILED"));
  await expect(attempt.publish()).rejects.toThrow("STAGE_FAILED");
  await attempt.cancel();
  expect(f.events.slice(-4)).toEqual([
    "server-cancel",
    "revoke",
    "local-cancel",
    "resume",
  ]);
  expect(f.transport.publish).not.toHaveBeenCalled();
});
it("does not resume Guest when cancellation is UNKNOWN", async () => {
  const f = await setup(),
    attempt = await f.prepare();
  f.transport.stage.mockRejectedValueOnce(Error("STAGE_UNKNOWN"));
  await expect(attempt.publish()).rejects.toThrow();
  f.transport.cancel.mockRejectedValueOnce(Error("CANCEL_UNKNOWN"));
  await expect(attempt.cancel()).rejects.toThrow("CANCEL_UNKNOWN");
  expect(f.inventory.resumeGuestBeforePublication).not.toHaveBeenCalled();
  expect(m.revoke).not.toHaveBeenCalled();
});
it("rejects target confirmation mismatch before freezing or sending any source", async () => {
  const f = await setup();
  await expect(
    prepareGuestTripP1Adoption(
      f.session,
      f.f.grant.sourceGuestLocalId,
      getAccountGeneration(),
      new AbortController().signal,
    ),
  ).rejects.toThrow("TARGET_CONFIRMATION_REQUIRED");
  expect(m.freeze).not.toHaveBeenCalled();
});
it("retains the same UUID and inventory when PREPARED write/readback returns UNKNOWN", async () => {
  const f = await setup(),
    attempt = await f.prepare();
  m.checkpoint.mockRejectedValueOnce(Error("LOCAL_PREPARE_AFTER_WRITE_UNKNOWN"));
  await expect(attempt.publish()).rejects.toThrow("LOCAL_PREPARE_AFTER_WRITE_UNKNOWN");
  expect(f.inventory.resumeGuestBeforePublication).not.toHaveBeenCalled();
  await attempt.publish();
  expect(m.freeze).toHaveBeenCalledOnce();
  expect(m.checkpoint).toHaveBeenCalledTimes(2);
  expect(m.checkpoint.mock.calls[0]).toEqual(m.checkpoint.mock.calls[1]);
  expect(f.transport.publish).toHaveBeenCalledOnce();
});
it("retries recovery initialization failure using the already prepared attempt", async () => {
  const f = await setup(),
    attempt = await f.prepare();
  m.recovery.mockRejectedValueOnce(Error("RECOVERY_OPEN_FAILED"));
  await expect(attempt.publish()).rejects.toThrow("RECOVERY_OPEN_FAILED");
  await attempt.publish();
  expect(m.freeze).toHaveBeenCalledOnce();
  expect(m.checkpoint).toHaveBeenCalledOnce();
  expect(f.inventory.resumeGuestBeforePublication).not.toHaveBeenCalled();
});
it("can cancel a retained locally prepared attempt after recovery initialization fails", async () => {
  const f = await setup(),
    attempt = await f.prepare();
  m.recovery.mockRejectedValueOnce(Error("RECOVERY_OPEN_FAILED"));
  await expect(attempt.publish()).rejects.toThrow("RECOVERY_OPEN_FAILED");
  await attempt.cancel();
  expect(f.recovery.cancelBeforePublication).toHaveBeenCalledWith(
    f.f.grant.adoptionId,
    f.f.user.id,
  );
  expect(f.inventory.resumeGuestBeforePublication).toHaveBeenCalledOnce();
  expect(f.transport.publish).not.toHaveBeenCalled();
});
