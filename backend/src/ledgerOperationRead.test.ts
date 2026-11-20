import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  projectLedgerOperation,
  readLedgerOperationJournal,
  type LedgerOperationRow,
} from "./ledgerOperationRead";
const actor = randomUUID(),
  trip = randomUUID(),
  operation = randomUUID(),
  digest = "a".repeat(64);
const receipt = {
  changeId: randomUUID(),
  settlementCurrency: "NZD",
  settlementScale: 2,
  settingsRevision: 2,
  affectedExpenses: 0,
  unresolvedExpenses: 0,
  idempotentReplay: false,
};
const row: LedgerOperationRow = {
  id: randomUUID(),
  actor_user_id: actor,
  journey_id: trip,
  command_type: "CHANGE_JOURNEY_CURRENCY",
  idempotency_key: operation,
  payload_hash: digest,
  response_status: 200,
  response_body: receipt,
  completed_at: "2026-11-16T00:00:00Z",
};
it("returns the original journal digest/receipt and distinguishes UNKNOWN without first-send permission", () => {
  const result = projectLedgerOperation([row], actor, trip, operation, {
    kind: "CURRENCY",
    targetId: trip,
  });
  expect(result).toMatchObject({ state: "CONFIRMED", requestDigest: digest, receipt });
  expect(
    projectLedgerOperation([], actor, trip, operation, { kind: "CURRENCY" }),
  ).toEqual({
    operationId: operation,
    actorAccountId: actor,
    tripId: trip,
    state: "UNKNOWN",
    requestDigest: null,
    receipt: null,
  });
  expect(
    projectLedgerOperation(
      [{ ...row, completed_at: null, response_body: null, response_status: null }],
      actor,
      trip,
      operation,
      { kind: "CURRENCY" },
    ).state,
  ).toBe("UNKNOWN");
});
it("rejects wrong identity, wrong target, ambiguous originals and an unrepresentable frozen rejected receipt", () => {
  expect(() =>
    projectLedgerOperation(
      [{ ...row, actor_user_id: randomUUID() }],
      actor,
      trip,
      operation,
      { kind: "CURRENCY" },
    ),
  ).toThrow("RESULT_MISMATCH");
  expect(() =>
    projectLedgerOperation([row], actor, trip, operation, {
      kind: "CURRENCY",
      targetId: randomUUID(),
    }),
  ).toThrow("OPERATION_TARGET_MISMATCH");
  expect(() =>
    projectLedgerOperation([row, { ...row, id: randomUUID() }], actor, trip, operation, {
      kind: "CURRENCY",
    }),
  ).toThrow("OPERATION_LOOKUP_AMBIGUOUS");
  expect(() =>
    projectLedgerOperation(
      [
        {
          ...row,
          response_status: 409,
          response_body: { error: { code: "REVISION_CONFLICT" } },
        },
      ],
      actor,
      trip,
      operation,
      { kind: "CURRENCY" },
    ),
  ).toThrow();
});
it("looks up both original journal key and typed receipt identity, deduping one original row", async () => {
  const fields: string[] = [];
  const client = {
    from: () => {
      const q = {
        select: () => q,
        eq: (field: string) => {
          fields.push(field);
          return q;
        },
        in: () => q,
        limit: async () => ({
          data: [{ ...row, command_type: "EXPENSE_COMMAND_V2" }],
          error: null,
        }),
      };
      return q;
    },
  } as unknown as SupabaseClient;
  const result = await readLedgerOperationJournal(client, actor, trip, operation, {
    kind: "EXPENSE",
  });
  expect(result).toHaveLength(1);
  expect(fields).toContain("idempotency_key");
  expect(fields).toContain("response_body->receipt->>operationId");
  expect(fields).toContain("response_body->error->>commandId");
});
