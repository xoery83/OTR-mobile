import { describe, expect, it } from "vitest";

import type { Stage7Finalized } from "@/hooks/useStage7Settlement";

import { primaryTransferAction, transferStatusLabel } from "./settlementPresentation";

const transfer: Stage7Finalized["transfers"][number] = {
  id: "72000000-0000-4000-8000-000000000001",
  fromMemberId: "30000000-0000-4000-8000-000000000001",
  toMemberId: "30000000-0000-4000-8000-000000000002",
  amount: { minor: 12_540, currency: "NZD", scale: 2 },
  confirmedDischarge: { minor: 2_000, currency: "NZD", scale: 2 },
  confirmedRemaining: { minor: 10_540, currency: "NZD", scale: 2 },
  awaitingAmount: { minor: 3_000, currency: "NZD", scale: 2 },
  availableToReport: { minor: 7_540, currency: "NZD", scale: 2 },
  status: "AWAITING_CONFIRMATION",
  revision: 1,
  payments: [
    {
      id: "73000000-0000-4000-8000-000000000001",
      transferId: "72000000-0000-4000-8000-000000000001",
      status: "AWAITING_CONFIRMATION",
      payment: { minor: 3_000, currency: "NZD", scale: 2 },
      assertedDischarge: { minor: 3_000, currency: "NZD", scale: 2 },
      repaymentValuation: null,
      feeTreatment: null,
      reportedByUserId: "20000000-0000-4000-8000-000000000001",
      reportedByMemberId: "30000000-0000-4000-8000-000000000001",
      reportingAuthority: "PAYER",
      reportingReason: null,
      paidAt: "2026-09-15T00:00:00.000Z",
      evidenceAssetId: null,
      notes: null,
      supersedesPaymentId: null,
      revision: 1,
      createdAt: "2026-09-15T00:00:00.000Z",
      syncStatus: "SYNCED",
      discharge: null,
    },
  ],
};

describe("P5 settlement presentation", () => {
  it("shows one actor-valid primary action and human status", () => {
    expect(primaryTransferAction(transfer, transfer.fromMemberId)).toBe("MARK_PAID");
    expect(primaryTransferAction(transfer, transfer.toMemberId)).toBe("CONFIRM_RECEIVED");
    expect(primaryTransferAction(transfer, null)).toBeNull();
    expect(transferStatusLabel(transfer)).toBe("Waiting for confirmation");
  });
});
