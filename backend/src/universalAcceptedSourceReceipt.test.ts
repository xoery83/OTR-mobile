// Controlled lease/receipt observations only; not real Core acceptance evidence.
import { createHash, randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import {
  withAcceptedUniversalReceiptRead,
  hasAcceptedUniversalReceiptRead,
} from "./universalAcceptedSourceReceipt";
import { sourcePdfV2ProofFixture } from "./__fixtures__/sourcePdfV2Proof";
import { readUniversalPdfSourceMaterial } from "./universalPdfSourceMaterial";
import type { CoreSourceStoredSlotV2 } from "./tripCoreV2Source";
async function fixture() {
  const pdf = await sourcePdfV2ProofFixture();
  pdf.close();
  pdf.continuousScope(false);
  const scope = {
    actorAccountId: pdf.catalog.actorAccountId,
    tripId: pdf.catalog.tripId,
    sourceId: pdf.catalog.sourceId,
    planId: randomUUID(),
  };
  const slot = {
    p1: {},
    state: "EVIDENCE_PENDING",
    domainReceiptId: randomUUID(),
    intentSha256: "d".repeat(64),
    proposed: {
      slotId: randomUUID(),
      operationId: randomUUID(),
      candidateId: randomUUID(),
      target: { id: randomUUID() },
    },
    receipt: { outcome: "APPLIED", receiptSha256: "e".repeat(64) },
  } as CoreSourceStoredSlotV2;
  const state = {
    accepted: true,
    actor: scope.actorAccountId,
    trip: scope.tripId,
    role: "otr_trip_core_v2_writer",
    principal: "otr_trip_core_v2_gateway",
  };
  const expectedReceiptPins = [
    scope.actorAccountId,
    scope.tripId,
    scope.sourceId,
    slot.proposed.slotId,
    slot.proposed.operationId,
    slot.proposed.target.id,
    slot.intentSha256,
    slot.domainReceiptId,
    slot.receipt!.receiptSha256,
    JSON.stringify(slot.receipt),
    scope.planId,
    slot.proposed.candidateId,
  ];
  const query = vi.fn(async (sql: string, args?: readonly unknown[]) => {
    if (sql.includes("session_user")) return { rows: [{ ...state }] };
    if (sql.includes("AS accepted"))
      return {
        rows: [
          {
            accepted:
              state.accepted &&
              JSON.stringify(args) === JSON.stringify(expectedReceiptPins),
          },
        ],
      };
    return pdf.lease.query(sql, args);
  });
  const lease = { query, retire: vi.fn() };
  const read = () =>
    readUniversalPdfSourceMaterial(
      lease,
      pdf.catalog,
      {
        representationId: pdf.originalId,
        sha256: pdf.original.payload_sha256,
        byteCount: pdf.original.byte_count,
      },
      async (bytes) => createHash("sha256").update(bytes).digest("hex"),
    );
  return { pdf, scope, slot, state, lease, query, read };
}
it("finishes a scoped accepted receipt read after PDF capability closes", async () => {
  const f = await fixture();
  expect(
    (await withAcceptedUniversalReceiptRead(f.lease, f.scope, f.slot, f.read)).sealSha256,
  ).toBe(f.pdf.sealed.seal_sha256);
  await expect(f.read()).rejects.toThrow("CONTRACT_UNSUPPORTED");
});

it.each(["missing", "pending", "wrongPlan", "wrongCandidate", "revokedReceipt"])(
  "cannot borrow %s receipt identity",
  async (bad) => {
    const f = await fixture();
    if (bad === "missing") f.slot.receipt = null;
    if (bad === "pending") f.slot.state = "READY";
    if (bad === "wrongPlan") f.scope.planId = randomUUID();
    if (bad === "wrongCandidate") f.slot.proposed.candidateId = randomUUID();
    if (bad === "revokedReceipt") f.state.accepted = false;
    await expect(
      withAcceptedUniversalReceiptRead(f.lease, f.scope, f.slot, f.read),
    ).rejects.toThrow("CONTRACT_UNSUPPORTED");
    expect(
      await hasAcceptedUniversalReceiptRead(
        f.lease,
        f.scope.actorAccountId,
        f.scope.tripId,
      ),
    ).toBe(false);
  },
);
it.each(["actor", "trip", "role", "principal"])(
  "retains normal Core %s scope",
  async (key) => {
    const f = await fixture();
    f.state[key as keyof typeof f.state] = "changed" as never;
    await expect(
      withAcceptedUniversalReceiptRead(f.lease, f.scope, f.slot, f.read),
    ).rejects.toThrow("CORE_SCOPE_MISMATCH");
  },
);
it("clears read scope on callback failure and refuses nested borrowing", async () => {
  const f = await fixture();
  await expect(
    withAcceptedUniversalReceiptRead(f.lease, f.scope, f.slot, async () => {
      await expect(
        withAcceptedUniversalReceiptRead(f.lease, f.scope, f.slot, f.read),
      ).rejects.toThrow("CORE_SCOPE_MISMATCH");
      throw Error("READ_FAILED");
    }),
  ).rejects.toThrow("READ_FAILED");
  await expect(f.read()).rejects.toThrow("CONTRACT_UNSUPPORTED");
});
it("rechecks accepted receipt and Core scope inside the read callback", async () => {
  const f = await fixture();
  await expect(
    withAcceptedUniversalReceiptRead(f.lease, f.scope, f.slot, async () => {
      f.state.accepted = false;
      return f.read();
    }),
  ).rejects.toThrow("CONTRACT_UNSUPPORTED");
});
it("binds reads to the exact lease without changing current-row or seal checks", async () => {
  const f = await fixture();
  await expect(
    withAcceptedUniversalReceiptRead(f.lease, f.scope, f.slot, async () => {
      expect(
        await hasAcceptedUniversalReceiptRead(
          { ...f.lease },
          f.scope.actorAccountId,
          f.scope.tripId,
        ),
      ).toBe(false);
      f.pdf.original.row_revision++;
      return f.read();
    }),
  ).rejects.toThrow("CONTRACT_UNSUPPORTED");
  const checks = f.query.mock.calls.filter(([sql]) => sql.includes("AS accepted"));
  expect(checks.length).toBeGreaterThan(1);
  expect(checks[0][0]).toContain("s.plan_id=$11");
  expect(checks[0][0]).toContain("s.candidate_id=$12");
  expect(checks[0][1]?.slice(10)).toEqual([f.scope.planId, f.slot.proposed.candidateId]);
  expect(
    f.query.mock.calls.some(([sql]) => /^(INSERT|UPDATE|DELETE|GRANT|ALTER)/.test(sql)),
  ).toBe(false);
});
