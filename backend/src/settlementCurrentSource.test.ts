import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createSupabaseDevGateway } from "./supabaseGateway";
import {
  buildSettlementPreview,
  canonicalSettlementSourceJson,
  type SettlementExpenseCandidate,
} from "../../src/domain/ledger/settlement";
import { canonicalLocalSettlementSourceJson } from "../../src/domain/ledger/settlementSource";
import {
  adjustmentMatchesCurrentProjection,
  clearSharedSettlementProjection,
  currentSettlementSummaryProjection,
  readSavedSettlementProjection,
  rememberSettlementProjection,
} from "../../src/features/ledger/settlementSummaryProjection";

const journey = "10000000-0000-4000-8000-000000000001";
const owner = "20000000-0000-4000-8000-000000000001";
const member = "20000000-0000-4000-8000-000000000002";
const root = "30000000-0000-4000-8000-000000000001";
const head = "30000000-0000-4000-8000-000000000002";
const cutoff = "2026-09-29T00:00:00.000Z";
function expense(n: number): SettlementExpenseCandidate {
  const id = `40000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const money = { minor: 100 + n, currency: "NZD", scale: 2 };
  return {
    id,
    revision: 1,
    occurredAt: "2026-09-01T00:00:00.000Z",
    businessStatus: "ACCEPTED",
    settlementParticipation: "INCLUDED",
    hasOpenConflict: false,
    payerMemberId: owner,
    original: money,
    participants: [{ memberId: member, displayNameSnapshot: "Member" }],
    splits: [
      {
        memberId: member,
        method: "EXACT",
        originalMinor: money.minor,
        settlementMinor: money.minor,
        weightUnits: null,
        percentageUnits: null,
        roundingAdjustmentMinor: 0,
      },
    ],
    valuation: {
      id,
      policy: "SAME_CURRENCY",
      original: money,
      settlement: money,
      rateSnapshotId: null,
      paymentRecordId: null,
      reason: null,
      decimalRate: null,
      roundingMode: "HALF_UP",
      effectiveAt: null,
      supersedesValuationId: null,
    },
  };
}
// Two correction chains: 1 -> 2 -> 3 and 4 -> 5. Six later inputs remain NEW.
const all = Array.from({ length: 12 }, (_, i) => expense(i + 1));
const effective = all.filter((e) => ![1, 2, 4].includes(Number(e.id.slice(-12))));
const source = {
  journeyId: journey,
  throughTimestamp: cutoff,
  settlementCurrency: "NZD",
  settlementScale: 2,
  settingsRevision: 1,
  members: [
    { memberId: owner, displayNameSnapshot: "Owner" },
    { memberId: member, displayNameSnapshot: "Member" },
  ],
  expenses: effective,
};
const prior = buildSettlementPreview({ ...source, expenses: effective.slice(0, 3) });
function correction(sourceExpenseId: string) {
  const original = all.find((item) => item.id === sourceExpenseId)!;
  return {
    sourceExpenseId,
    successor: {
      localId: "50000000-0000-4000-8000-000000000001",
      title: "Corrected Expense",
      description: null,
      category: "food",
      occurredAt: original.occurredAt,
      payerMemberId: original.payerMemberId,
      original: original.original,
      businessStatus: "ACCEPTED" as const,
      settlementParticipation: original.settlementParticipation,
      participants: original.participants.map((participant) => ({
        ...participant,
        householdIdSnapshot: null,
      })),
      splits: original.splits,
      valuation: original.valuation
        ? {
            policy: original.valuation.policy,
            original: original.valuation.original,
            settlement: original.valuation.settlement,
            rateSnapshotId: original.valuation.rateSnapshotId,
            paymentRecordId: original.valuation.paymentRecordId,
            reason: original.valuation.reason,
          }
        : null,
    },
    reason: "Correct the latest version",
  };
}
function fixture(confirmed: "ROOT" | "ADJUSTMENT" | null, fail = false) {
  const calls: { path: string; body: Record<string, unknown> }[] = [];
  vi.stubGlobal("fetch", async (input: string, init?: RequestInit) => {
    const url = new URL(input);
    const table = url.pathname.split("/").at(-1)!;
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    calls.push({ path: table, body });
    if (table.startsWith("ledger_")) {
      if (table === "ledger_adjustment_source_current_7_2c" && fail)
        return Response.json({ message: "SETTLEMENT_INPUT_STALE" }, { status: 400 });
      const value = {
        ...source,
        throughTimestamp: body.source_cutoff ?? body.through_timestamp_value,
        expenses: table.includes("adjustment_source") ? effective : all,
      };
      return Response.json(
        table === "ledger_adjustment_source_text_7_2c" ? JSON.stringify(value) : value,
      );
    }
    if (table === "settlements") {
      if (!confirmed) return Response.json(url.searchParams.has("limit") ? null : []);
      if (url.searchParams.has("root_settlement_id") && confirmed === "ROOT")
        return Response.json([]);
      const rowKind = url.searchParams.get("id")?.includes(root) ? "ROOT" : confirmed;
      const row = {
        id: rowKind === "ROOT" ? root : head,
        journey_id: journey,
        settlement_kind: rowKind,
        root_settlement_id: rowKind === "ROOT" ? null : root,
        lineage_sequence: rowKind === "ROOT" ? 0 : 3,
        status: "FINALIZED",
        through_timestamp: "2026-09-01T23:59:59.000Z",
        settlement_currency: "NZD",
        settlement_scale: 2,
        settings_revision: 1,
        algorithm_version: "ledger-settlement-greedy-v1",
        input_digest: "a".repeat(64),
        revision: 1,
        finalized_by: owner,
        finalized_at: "2026-09-02T00:00:00.000Z",
      };
      return Response.json(url.searchParams.has("limit") ? { id: row.id } : [row]);
    }
    if (table === "settlement_inputs")
      return Response.json(
        prior.inputs.map((normalized_snapshot) => ({
          settlement_id: confirmed === "ROOT" ? root : head,
          normalized_snapshot,
        })),
      );
    return Response.json([]);
  });
  const gateway = () =>
    createSupabaseDevGateway({
      url: "https://tuqigdxrvrerfewsxqgm.supabase.co",
      secretKey: "test-secret",
      publishableKey: "test-public",
    });
  return { gateway, calls };
}
afterEach(() => {
  vi.unstubAllGlobals();
  clearSharedSettlementProjection(journey);
});

describe("Settlement correction-aware current source", () => {
  it("reports an already replaced correction source as stale instead of unavailable", async () => {
    const { gateway } = fixture("ADJUSTMENT");
    const originalFetch = globalThis.fetch;
    vi.stubGlobal("fetch", async (input: string, init?: RequestInit) => {
      if (new URL(input).pathname.endsWith("/ledger_adjustment_source_text_7_2c"))
        return Response.json(JSON.stringify({ ...source, expenses: effective }));
      return originalFetch(input, init);
    });
    await expect(
      gateway().previewSettlementCorrection(owner, journey, root, correction(all[0].id)),
    ).rejects.toMatchObject({
      status: 409,
      code: "SETTLEMENT_INPUT_STALE",
    });
  });

  it("keeps later confirmed Expenses when previewing a correction", async () => {
    const { gateway, calls } = fixture("ADJUSTMENT");
    const preview = await gateway().previewSettlementCorrection(
      owner,
      journey,
      root,
      correction(effective[0].id),
    );
    expect(preview.inputs).toHaveLength(effective.length);
    expect(preview.inputs.some((item) => item.expenseId === effective.at(-1)!.id)).toBe(
      true,
    );
    expect(calls.some((call) => call.path === "ledger_adjustment_source_7_2b")).toBe(
      false,
    );
    expect(calls.some((call) => call.path === "ledger_adjustment_source_text_7_2c")).toBe(
      true,
    );
  });

  it("preserves an unrelated FX rate as a JSON number in a correction proof", async () => {
    const { gateway } = fixture("ADJUSTMENT");
    const originalFetch = globalThis.fetch;
    const rawSource = JSON.stringify(source).replace(
      '"decimalRate":null',
      '"decimalRate":0.011189760712298275',
    );
    let proofRequest = "";
    vi.stubGlobal("fetch", async (input: string, init?: RequestInit) => {
      const path = new URL(input).pathname;
      if (path.endsWith("/ledger_adjustment_source_text_7_2c"))
        return Response.json(rawSource);
      if (path.endsWith("/journey_members"))
        return Response.json([{ id: owner }, { id: member }]);
      if (path.endsWith("/ledger_idempotency_keys")) return Response.json(null);
      if (path.endsWith("/ledger_finalize_correction_4a")) {
        proofRequest = String(init?.body);
        return Response.json({ message: "SETTLEMENT_INPUT_STALE" }, { status: 400 });
      }
      return originalFetch(input, init);
    });
    const input = correction(effective[1].id);
    const ready = await gateway().previewSettlementCorrection(
      owner,
      journey,
      root,
      input,
    );
    await expect(
      gateway().finalizeSettlementCorrection(owner, journey, root, "correction-key", {
        ...input,
        expectedHeadId: ready.expectedHeadId,
        inputDigest: ready.inputDigest,
        allowZeroTransfer: true,
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect(proofRequest).toContain('"decimalRate":0.011189760712298275');
    expect(proofRequest).not.toContain('"decimalRate":"0.011189760712298275"');
  });

  it("sends an exact numeric SQL source proof at confirmation while retaining head/digest guards", async () => {
    const { gateway } = fixture("ADJUSTMENT");
    const originalFetch = globalThis.fetch;
    const rawSource = JSON.stringify(source).replace(
      '"decimalRate":null',
      '"decimalRate":0.011189760712298275',
    );
    let proofRequest = "";
    vi.stubGlobal("fetch", async (input: string, init?: RequestInit) => {
      const path = new URL(input).pathname;
      if (path.endsWith("/ledger_adjustment_source_text_7_2c"))
        return Response.json(rawSource);
      if (path.endsWith("/ledger_adjustment_source_current_7_2c"))
        return Response.json(JSON.parse(rawSource));
      if (path.endsWith("/ledger_finalize_adjustment_7_2b")) {
        proofRequest = String(init?.body);
        return Response.json({ settlementId: head, idempotentReplay: false });
      }
      return originalFetch(input, init);
    });
    const ready = await gateway().previewSettlementAdjustment(
      owner,
      journey,
      root,
      cutoff,
    );
    await gateway().finalizeSettlementAdjustment(owner, journey, root, "test-key", {
      expectedHeadId: ready.expectedHeadId,
      inputDigest: ready.inputDigest,
      throughTimestamp: ready.throughTimestamp,
      reason: "Reviewed",
      allowZeroTransfer: true,
    });
    expect(proofRequest).toContain('"decimalRate":0.011189760712298275');
    const proof = JSON.parse(proofRequest);
    expect(proof.expected_head).toBe(head);
    expect(proof.input_digest_value).toBe(ready.inputDigest);
    expect(proof.computed_input_digest_value).toBe(ready.inputDigest);
    expect(proof.expected_source_value.expenses).toHaveLength(9);
  });
  it.each(["ROOT", "ADJUSTMENT"] as const)(
    "uses the actual root for %s and keeps multiple correction chains stable through refresh/restart",
    async (kind) => {
      const { gateway, calls } = fixture(kind);
      const local = effective.map((e) => ({
        ...e,
        serverId: e.id,
        serverRevision: e.revision,
        syncStatus: "SYNCED",
        status: e.businessStatus,
      }));
      const fingerprint = createHash("sha256")
        .update(
          canonicalLocalSettlementSourceJson(journey, cutoff, local as never, new Set()),
        )
        .digest("hex");
      let digest: string | undefined;
      for (let pass = 0; pass < 3; pass++) {
        if (pass === 2) clearSharedSettlementProjection(journey); // cold projection cache
        const preview = await gateway().previewLedgerSettlement(owner, journey, cutoff);
        expect(preview.inputs).toHaveLength(9);
        expect(preview.confirmationDiff).toHaveLength(6);
        expect(preview.confirmationDiff.every((c) => c.change === "ADDED")).toBe(true);
        expect(preview.sourceFingerprint).toBe(fingerprint);
        expect(preview.sourceFingerprint).toBe(
          createHash("sha256")
            .update(canonicalSettlementSourceJson(source))
            .digest("hex"),
        );
        expect(preview.balances).toEqual(buildSettlementPreview(source).balances);
        expect(preview.blockers).toEqual([]);
        if (digest) expect(preview.inputDigest).toBe(digest);
        digest = preview.inputDigest;
        const adjustment = await gateway().previewSettlementAdjustment(
          owner,
          journey,
          root,
          cutoff,
        );
        expect(adjustment.inputs).toHaveLength(9);
        expect(adjustment.changedExpenses).toHaveLength(6);
        expect(adjustmentMatchesCurrentProjection(preview, adjustment)).toBe(true);
        rememberSettlementProjection(
          journey,
          owner,
          true,
          currentSettlementSummaryProjection(preview, owner)!,
          preview,
        );
        expect(readSavedSettlementProjection(journey)?.sourceFingerprint).toBe(
          fingerprint,
        );
        expect(readSavedSettlementProjection(journey)?.confirmationDiff).toHaveLength(6);
      }
      expect(calls.filter((c) => c.path === "ledger_settlement_source_7_1")).toEqual([]);
      expect(
        calls
          .filter((c) => c.path === "ledger_adjustment_source_current_7_2c")
          .map((c) => c.body),
      ).toEqual(Array(6).fill({ target_root: root, source_cutoff: cutoff }));
    },
  );
  it("retains the initial-settlement source when there is no confirmed root", async () => {
    const { gateway, calls } = fixture(null);
    const preview = await gateway().previewLedgerSettlement(owner, journey, cutoff);
    expect(preview.inputs).toHaveLength(12);
    expect(preview.confirmedSettlement).toBeNull();
    expect(calls.some((c) => c.path === "ledger_adjustment_source_current_7_2c")).toBe(
      false,
    );
    expect(calls.find((c) => c.path === "ledger_settlement_source_7_1")?.body).toEqual({
      target_journey: journey,
      through_timestamp_value: cutoff,
    });
  });
  it("rejects a failed root source read without falling back to raw inputs", async () => {
    const { gateway, calls } = fixture("ADJUSTMENT", true);
    await expect(
      gateway().previewLedgerSettlement(owner, journey, cutoff),
    ).rejects.toThrow("settlement preview failed");
    expect(calls.some((c) => c.path === "ledger_settlement_source_7_1")).toBe(false);
  });
});
