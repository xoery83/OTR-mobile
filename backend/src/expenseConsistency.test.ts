import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  executeExpenseCommand,
  readExpenseConflictChain,
  resolutionEnvelope,
} from "./supabaseGateway";
import type {
  ExpenseCommandRequest,
  ExpenseConflictChainResolutionRequest,
} from "../../src/data/api/ledgerMutationContracts";
import type { LedgerExpenseDto } from "../../src/data/api/ledgerReadContracts";

const expenseId = "89000000-0000-4000-8000-000000000001";
const tripId = "10000000-0000-4000-8000-000000000001";
const memberId = "12000000-0000-4000-8000-000000000002";
const userId = "00000000-0000-4000-8000-000000000002";
const base: LedgerExpenseDto = {
  id: expenseId,
  journeyId: tripId,
  creatorMemberId: memberId,
  payerMemberId: memberId,
  title: "Expense",
  description: null,
  category: "food",
  occurredAt: "2026-09-24T10:00:00Z",
  economicDate: "2026-09-24",
  original: { minor: 2300, currency: "USD", scale: 2 },
  businessStatus: "RATE_REQUIRED",
  settlementParticipation: "INCLUDED",
  revision: 1,
  deletedAt: null,
  createdAt: "2026-09-24T10:00:00Z",
  updatedAt: "2026-09-24T10:00:00Z",
  participants: [{ memberId, displayNameSnapshot: "Member", householdIdSnapshot: null }],
  splits: [
    {
      memberId,
      method: "EQUAL_PERSON",
      originalMinor: 2300,
      settlementMinor: null,
      weightUnits: null,
      percentageUnits: null,
      roundingAdjustmentMinor: 0,
    },
  ],
  valuation: null,
  paymentRecords: [],
  auditEvents: [],
};
function service(
  options: {
    history?: LedgerExpenseDto | null;
    amount?: number;
    deleted?: boolean;
    automatic?: boolean;
    participation?: "INCLUDED" | "EXCLUDED";
    replay?: unknown;
    sqlError?: string;
    chain?: unknown;
    causal?: LedgerExpenseDto;
    legacyEquivalent?: boolean;
  } = {},
) {
  const data: Record<string, unknown> = {
    ledger_settings: { settlement_currency: "NZD", settlement_scale: 2 },
    expenses: {
      id: expenseId,
      journey_id: tripId,
      creator_member_id: memberId,
      payer_member_id: memberId,
      title: "Expense",
      description: null,
      category: "food",
      occurred_at: base.occurredAt,
      economic_date: base.economicDate,
      original_amount_minor: options.amount ?? 2300,
      original_currency: "USD",
      original_currency_scale: 2,
      business_status: options.deleted ? "DELETED" : "ACCEPTED",
      settlement_participation: options.participation ?? "INCLUDED",
      revision: 2,
      deleted_at: options.deleted ? base.updatedAt : null,
      created_at: base.createdAt,
      updated_at: base.updatedAt,
    },
    expense_revision_evidence:
      options.history === null ? [] : [{ canonical: options.history ?? base }],
    journey_members: [{ id: memberId }],
    expense_participants: [
      {
        expense_id: expenseId,
        member_id: memberId,
        display_name_snapshot: "Member",
        household_id_snapshot: null,
        display_order: 0,
      },
    ],
    expense_splits: [
      {
        expense_id: expenseId,
        member_id: memberId,
        split_method: "EQUAL_PERSON",
        original_amount_minor: options.amount ?? 2300,
        settlement_amount_minor: 4056,
        weight_units: null,
        percentage_units: null,
        rounding_adjustment_minor: 0,
      },
    ],
    settlement_valuation_snapshots: [
      {
        expense_id: expenseId,
        id: expenseId,
        policy: "REFERENCE_RATE",
        original_amount_minor: options.amount ?? 2300,
        original_currency: "USD",
        original_scale: 2,
        settlement_amount_minor: 4056,
        settlement_currency: "NZD",
        settlement_scale: 2,
        rate_snapshot_id: expenseId,
        payment_record_id: null,
        reason: null,
        decimal_rate: "1.763478",
        supersedes_valuation_id: null,
      },
    ],
    exchange_rate_snapshots: [
      {
        id: expenseId,
        observed_at: base.createdAt,
        created_at: base.createdAt,
        provenance: {
          economicDate: base.economicDate,
          referenceDate: base.economicDate,
          source: "ECB",
          sourceReference: "https://www.ecb.europa.eu/",
          deliveryProvider: "Frankfurter",
          providerReference: "https://api.frankfurter.dev/",
          automatic: options.automatic ?? true,
        },
      },
    ],
    payment_records: [],
    expense_audit_events: [],
  };
  const from = vi.fn((table: string) => {
    const result = { data: data[table] ?? [], error: null };
    const builder = {
      select: () => builder,
      eq: () => builder,
      in: () => builder,
      order: () => builder,
      limit: () => builder,
      single: async () => result,
      maybeSingle: async () => result,
      then: (resolve: (value: typeof result) => unknown) =>
        Promise.resolve(result).then(resolve),
    };
    return builder;
  });
  const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
    if (name === "ledger_replay_expense_v2")
      return { data: options.replay ?? null, error: null };
    if (name === "ledger_expense_causal_base_v2")
      return { data: options.causal ?? null, error: null };
    if (name === "ledger_legacy_expense_noop_v2")
      return { data: options.legacyEquivalent ?? false, error: null };
    if (name === "ledger_expense_chain_v2") return { data: options.chain, error: null };
    return {
      data: args.response_body_value,
      error: options.sqlError ? { message: options.sqlError } : null,
    };
  });
  return { client: { from, rpc } as unknown as SupabaseClient, rpc, from };
}
function command(
  intent: ExpenseCommandRequest["envelope"]["patchOrIntent"] = {
    type: "UPDATE",
    patch: { descriptive: { title: "New title" } },
  },
): ExpenseCommandRequest {
  return {
    auditReason: null,
    envelope: {
      commandId: "command",
      intentVersion: 2,
      intentSequence: 1,
      predecessorOperationId: null,
      observedServerRevision: 1,
      observedBase: base,
      patchOrIntent: intent,
      causalBaseReceipt: null,
      boundExecutionRevision: 1,
      idempotencyKey: "command",
    },
  };
}
const resolution: ExpenseConflictChainResolutionRequest = {
  contractVersion: 2,
  commandId: "command",
  intentType: "UPDATE",
  submittedIntent: command().envelope.patchOrIntent,
  observedBaseRevision: 1,
  currentServerRevision: 2,
  coveredConflictIds: [expenseId],
  expectedChainDigest: "a".repeat(64),
  choice: "APPLY_PATCH",
  reason: "Confirm title",
};
const execute = (
  client: SupabaseClient,
  input = command(),
  choice: ExpenseConflictChainResolutionRequest | null = null,
) => executeExpenseCommand(client, userId, tripId, expenseId, "command", input, choice);
const args = (rpc: ReturnType<typeof service>["rpc"]) =>
  rpc.mock.calls.find(([name]) => name === "ledger_execute_expense_v2")![1];

describe("Backend typed Expense evidence gate", () => {
  it("retains the verified predecessor receipt for a conflict decision", () => {
    const original = command().envelope;
    original.intentSequence = 3;
    original.predecessorOperationId = "ledger-operation_prior";
    original.boundExecutionRevision = 5;
    original.causalBaseReceipt = {
      operationId: "ledger-operation_prior",
      commandId: "ledger-operation_prior",
      idempotencyKey: "ledger-idempotency_prior",
      expenseId,
      commandType: "UPDATE",
      intentSequence: 2,
      disposition: "APPLIED",
      canonicalRevision: 5,
    };
    expect(resolutionEnvelope("decision", resolution, original)).toMatchObject({
      commandId: "command",
      intentSequence: 3,
      predecessorOperationId: "ledger-operation_prior",
      boundExecutionRevision: 5,
      causalBaseReceipt: { canonicalRevision: 5 },
      idempotencyKey: "decision",
      patchOrIntent: resolution.submittedIntent,
    });
  });
  it("keeps accepted rate and split evidence for a participation-only edit", async () => {
    const mocked = service({ history: null, participation: "EXCLUDED" });
    const input = command({
      type: "UPDATE",
      patch: { financial: { settlementParticipation: "INCLUDED" } },
    });
    input.envelope.observedServerRevision = 2;
    input.envelope.boundExecutionRevision = 2;
    await execute(mocked.client, input);
    expect(args(mocked.rpc).response_body_value).toMatchObject({
      entity: {
        businessStatus: "ACCEPTED",
        settlementParticipation: "INCLUDED",
        valuation: { id: expenseId, settlement: { minor: 4056 } },
        splits: [{ settlementMinor: 4056 }],
      },
    });
  });
  it("rebases an excluded Expense inclusion over automatic valuation", async () => {
    const mocked = service({
      history: { ...base, settlementParticipation: "EXCLUDED" },
      participation: "EXCLUDED",
    });
    await execute(
      mocked.client,
      command({
        type: "UPDATE",
        patch: { financial: { settlementParticipation: "INCLUDED" } },
      }),
    );
    expect(args(mocked.rpc)).toMatchObject({
      eligibility_value: "DESCRIPTIVE_REBASE",
      response_body_value: {
        entity: {
          businessStatus: "ACCEPTED",
          settlementParticipation: "INCLUDED",
          valuation: { settlement: { minor: 4056 } },
          splits: [{ settlementMinor: 4056 }],
        },
      },
    });
  });
  it("uses the verified causal predecessor when resolving a participation conflict", async () => {
    const historical = {
      ...base,
      revision: 0,
      settlementParticipation: "EXCLUDED" as const,
      splits: base.splits.map((split) => ({ ...split, method: "EXACT" as const })),
    };
    const causal = { ...base, settlementParticipation: "EXCLUDED" as const };
    const mocked = service({ history: historical, causal, participation: "EXCLUDED" });
    const input = command({
      type: "UPDATE",
      patch: { financial: { settlementParticipation: "INCLUDED" } },
    });
    input.envelope.intentSequence = 3;
    input.envelope.observedServerRevision = 0;
    input.envelope.observedBase = null;
    input.envelope.predecessorOperationId = "ledger-operation_prior";
    input.envelope.boundExecutionRevision = 1;
    input.envelope.causalBaseReceipt = {
      operationId: "ledger-operation_prior",
      commandId: "ledger-operation_prior",
      idempotencyKey: "ledger-idempotency_prior",
      expenseId,
      commandType: "UPDATE",
      intentSequence: 2,
      disposition: "APPLIED",
      canonicalRevision: 1,
    };
    await execute(mocked.client, input, {
      ...resolution,
      submittedIntent: input.envelope.patchOrIntent,
    });
    expect(mocked.rpc).toHaveBeenCalledWith(
      "ledger_expense_causal_base_v2",
      expect.objectContaining({ envelope_value: input.envelope }),
    );
    expect(args(mocked.rpc)).toMatchObject({
      eligibility_value: "DESCRIPTIVE_REBASE",
      response_body_value: {
        entity: { settlementParticipation: "INCLUDED", businessStatus: "ACCEPTED" },
      },
    });
  });
  it("omits absent CREATE current evidence rather than passing JSON null to SQL projection", async () => {
    const mocked = service();
    const input = command();
    input.envelope.observedServerRevision = 0;
    input.envelope.boundExecutionRevision = 0;
    input.envelope.patchOrIntent = {
      type: "CREATE",
      expense: { ...base, businessStatus: "RATE_REQUIRED" },
    };
    await execute(mocked.client, input);
    expect(args(mocked.rpc).response_body_value).not.toHaveProperty("_verifiedCurrent");
  });
  it("uses successful server history and preserves newer automatic valuation identity", async () => {
    const mocked = service();
    await execute(mocked.client);
    const prepared = args(mocked.rpc);
    expect(prepared.historical_base_value).toEqual(base);
    expect(prepared.eligibility_value).toBe("DESCRIPTIVE_REBASE");
    expect(prepared.response_body_value).toMatchObject({
      entity: {
        title: "New title",
        revision: 3,
        valuation: {
          id: expenseId,
          settlement: { minor: 4056 },
          referenceEvidence: { automatic: true },
        },
        splits: [{ settlementMinor: 4056 }],
      },
    });
  });
  it("ignores forged client base even when it claims unchanged server financial input", async () => {
    const mocked = service({ amount: 9999 });
    const input = command();
    input.envelope.observedBase = {
      ...base,
      original: { ...base.original, minor: 9999 },
    };
    await execute(mocked.client, input);
    expect(args(mocked.rpc).historical_base_value).toEqual(base);
    expect(args(mocked.rpc).eligibility_value).toBe("CONFLICT");
  });
  it.each([{ history: null }, { amount: 9999 }, { automatic: false }, { deleted: true }])(
    "does not auto-merge without compatible three-way evidence: %s",
    async (option) => {
      const mocked = service(option);
      await execute(mocked.client);
      expect(args(mocked.rpc).eligibility_value).toBe("CONFLICT");
      expect(args(mocked.rpc).response_body_value).toMatchObject({
        entity: { title: "Expense", revision: 2 },
      });
    },
  );
  it("explicit descriptive resolution still requires compatible evidence", async () => {
    const mocked = service({ amount: 9999 });
    await expect(execute(mocked.client, command(), resolution)).rejects.toMatchObject({
      code: "UNVERIFIED_OBSERVED_BASE",
    });
    expect(
      mocked.rpc.mock.calls.some(([name]) => name === "ledger_execute_expense_v2"),
    ).toBe(false);
  });
  it("recognizes equivalent UTC patch without making a new revision", async () => {
    const mocked = service();
    await execute(
      mocked.client,
      command({
        type: "UPDATE",
        patch: { descriptive: { occurredAt: "2026-09-24T22:00:00+12:00" } },
      }),
    );
    expect(args(mocked.rpc).eligibility_value).toBe("EQUIVALENT");
    expect(args(mocked.rpc).response_body_value).toMatchObject({
      entity: { revision: 2 },
    });
  });
  it("DELETE conflict preparation never discards its lifecycle intent", async () => {
    const mocked = service();
    await execute(mocked.client, command({ type: "DELETE" }));
    expect(args(mocked.rpc).envelope_value).toMatchObject({
      patchOrIntent: { type: "DELETE" },
    });
    expect(args(mocked.rpc).eligibility_value).toBe("CONFLICT");
  });
  it("DELETE resolution prepares a tombstone and preserves covered scope in one RPC", async () => {
    const mocked = service();
    const input = command({ type: "DELETE" });
    await execute(mocked.client, input, {
      ...resolution,
      intentType: "DELETE",
      submittedIntent: { type: "DELETE" },
      choice: "CONFIRM_DELETE",
    });
    expect(args(mocked.rpc).response_body_value).toMatchObject({
      entity: { businessStatus: "DELETED", revision: 3, deletedAt: expect.any(String) },
    });
    expect(args(mocked.rpc).resolution_value).toMatchObject({
      coveredConflictIds: [expenseId],
      expectedChainDigest: resolution.expectedChainDigest,
    });
  });
  it("response loss replays before reading any changing head/history/quote", async () => {
    const receipt = {
      resolutionReceipt: { disposition: "APPLIED" },
      canonical: { revision: 3 },
    };
    const mocked = service({ replay: receipt });
    expect(await execute(mocked.client, command(), resolution)).toEqual(receipt);
    expect(mocked.from).not.toHaveBeenCalled();
    expect(mocked.rpc).toHaveBeenCalledTimes(1);
  });
  it.each([
    "CONFLICT_CHAIN_DRIFT",
    "REVISION_CONFLICT",
    "FINALIZED_SETTLEMENT_PROTECTED",
    "TRIP_WRITE_FORBIDDEN",
    "IDEMPOTENCY_CONFLICT",
  ])("maps SQL guard %s without retrying mutation", async (code) => {
    const mocked = service({ sqlError: code });
    await expect(execute(mocked.client)).rejects.toMatchObject({
      code: code === "FINALIZED_SETTLEMENT_PROTECTED" ? "SETTLEMENT_INPUT_STALE" : code,
    });
    expect(
      mocked.rpc.mock.calls.filter(([name]) => name === "ledger_execute_expense_v2"),
    ).toHaveLength(1);
  });
  it("returns complete chain for tombstone, including true legacy DELETE and unverified UPDATE", async () => {
    const mocked = service({
      deleted: true,
      chain: {
        chainDigest: "b".repeat(64),
        records: [
          {
            conflictId: expenseId,
            commandType: "DELETE_EXPENSE",
            idempotencyKey: "delete",
            lifecycle: "OPEN",
            reason: null,
            body: {
              error: {
                baseRevision: 1,
                currentRevision: 2,
                changedGroups: ["LIFECYCLE"],
              },
            },
          },
          {
            conflictId: memberId,
            commandType: "UPDATE_EXPENSE",
            idempotencyKey: "old-update",
            lifecycle: "OPEN",
            reason: null,
            body: {
              error: {
                baseRevision: 1,
                currentRevision: 2,
                changedGroups: ["DESCRIPTIVE"],
              },
            },
          },
        ],
      },
    });
    const result = await readExpenseConflictChain(
      mocked.client,
      userId,
      tripId,
      expenseId,
    );
    expect(result.canonical.businessStatus).toBe("DELETED");
    expect(result.conflicts).toHaveLength(2);
    expect(result.conflicts[0]).toMatchObject({
      commandType: "DELETE",
      submittedIntent: { type: "DELETE" },
      lifecycle: "OPEN",
    });
    expect(result.conflicts[1]).toMatchObject({
      submittedIntent: null,
      reason: "LEGACY_INTENT_REQUIRES_ACTION",
    });
  });
});

it("rebases an explicitly agreed displayed rate only with compatible immutable automatic reference evidence", async () => {
  const mocked = service();
  const request = command({
    type: "APPLY_VALUATION",
    valuation: {
      localValuationId: "local-value",
      localRateSnapshotId: "local-rate",
      policy: "MANUAL_AGREED",
      rateQuoteId: null,
      paymentRecordId: null,
      manualRate: "1.763478",
      reason: "Accept shown rate",
      previewSettlement: { minor: 4056, currency: "NZD", scale: 2 },
      rateAcceptance: {
        revision: 1,
        serverRevision: 1,
        original: base.original,
        economicDate: base.economicDate!,
        settlement: { minor: 4056, currency: "NZD", scale: 2 },
        decimalRate: "1.763478",
        referenceDate: base.economicDate!,
      },
    },
  });
  await executeExpenseCommand(
    mocked.client,
    userId,
    tripId,
    expenseId,
    "command",
    request,
  );
  const execution = mocked.rpc.mock.calls.find(
    ([name]) => name === "ledger_execute_expense_v2",
  )![1];
  expect(execution.eligibility_value).toBe("VALUATION_REBASE");
  expect((execution.response_body_value as any).entity.valuation.policy).toBe(
    "MANUAL_AGREED",
  );
  for (const options of [{ amount: 2301 }, { automatic: false }, { history: null }]) {
    const rejected = service(options);
    await executeExpenseCommand(
      rejected.client,
      userId,
      tripId,
      expenseId,
      "command",
      request,
    );
    expect(
      rejected.rpc.mock.calls.find(([name]) => name === "ledger_execute_expense_v2")![1]
        .eligibility_value,
    ).toBe("CONFLICT");
  }
});

it("keeps the latest value without preparing a rejected stale valuation again", async () => {
  const mocked = service({ history: null });
  const intent = {
    type: "APPLY_VALUATION" as const,
    valuation: {
      localValuationId: "v",
      localRateSnapshotId: "r",
      policy: "MANUAL_AGREED" as const,
      rateQuoteId: null,
      paymentRecordId: null,
      manualRate: "999",
      reason: "Discard old rate",
      previewSettlement: { minor: 999, currency: "NZD", scale: 2 },
    },
  };
  await execute(mocked.client, command(intent), {
    ...resolution,
    intentType: "APPLY_VALUATION",
    submittedIntent: intent,
    choice: "KEEP_SERVER",
  });
  expect(args(mocked.rpc).response_body_value).toMatchObject({
    entity: { valuation: { policy: "REFERENCE_RATE" } },
  });
  expect(
    mocked.from.mock.calls.filter(([table]) => table === "ledger_settings"),
  ).toHaveLength(0);
});

it.each([true, false])(
  "exposes equivalent legacy choice only with server proof (%s)",
  async (proof) => {
    const mocked = service({
      legacyEquivalent: proof,
      chain: {
        chainDigest: "b".repeat(64),
        records: [
          {
            conflictId: expenseId,
            commandType: "UPDATE_EXPENSE",
            idempotencyKey: "old-save",
            lifecycle: "OPEN",
            reason: null,
            body: {
              error: {
                baseRevision: 1,
                currentRevision: 2,
                submitted: { ...base, occurredAt: "2026-09-24T10:00:00+00:00" },
                changedGroups: ["DESCRIPTIVE"],
              },
            },
          },
        ],
      },
    });
    const result = await readExpenseConflictChain(
      mocked.client,
      userId,
      tripId,
      expenseId,
    );
    expect(result.conflicts[0].submittedIntent).toEqual(
      proof ? { type: "UPDATE", patch: {} } : null,
    );
    expect(result.conflicts[0].changedGroups).toEqual(proof ? [] : ["DESCRIPTIVE"]);
  },
);
