import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { coreUuid, coreHash } from "../../src/domain/trip/tripCoreV2";
import {
  ledgerExpenseMutationResponseSchema,
  ledgerPaymentRecordMutationResponseSchema,
  expenseConflictChainResolutionResponseSchema,
  expenseOperationReceiptSchema,
  expenseTypedConflictResponseSchema,
} from "../../src/data/api/ledgerMutationContracts";
import { ledgerExpenseSchema } from "../../src/data/api/ledgerReadContracts";
import { journeyCurrencyCommitSchema } from "../../src/data/api/ledgerCurrencyContracts";
import type { DevBackendGateway } from "./app";
export const ledgerOperationQuerySchema = z.strictObject({
  kind: z.enum([
    "EXPENSE",
    "VALUATION",
    "EXPENSE_PAYMENT_RECORD",
    "CURRENCY",
    "EXPENSE_RESOLUTION",
  ]),
  targetId: coreUuid.optional(),
});
export type LedgerOperationQuery = z.infer<typeof ledgerOperationQuerySchema>;
const commands = {
  EXPENSE: [
    "EXPENSE_COMMAND_V2",
    "CREATE_EXPENSE",
    "UPDATE_EXPENSE",
    "DELETE_EXPENSE",
    "RESTORE_EXPENSE",
  ],
  VALUATION: ["EXPENSE_COMMAND_V2", "APPLY_VALUATION"],
  EXPENSE_PAYMENT_RECORD: ["ADD_PAYMENT_RECORD"],
  CURRENCY: ["CHANGE_JOURNEY_CURRENCY"],
  EXPENSE_RESOLUTION: ["RESOLVE_EXPENSE_CHAIN_V2", "RESOLVE_EXPENSE_CONFLICT"],
} as const;
const rowSchema = z.strictObject({
  id: coreUuid,
  actor_user_id: coreUuid,
  journey_id: coreUuid,
  command_type: z.string(),
  idempotency_key: z.string(),
  payload_hash: coreHash,
  response_status: z.number().int().nullable(),
  response_body: z.unknown(),
  completed_at: z.string().nullable(),
  resolved_receipt: ledgerExpenseMutationResponseSchema.optional(),
});
export type LedgerOperationRow = z.infer<typeof rowSchema>;
export async function readLedgerOperationJournal(
  service: SupabaseClient,
  actor: string,
  trip: string,
  operation: string,
  query: LedgerOperationQuery,
) {
  const fields = [
    "idempotency_key",
    ...(query.kind === "EXPENSE_RESOLUTION"
      ? ["response_body->resolutionReceipt->>operationId"]
      : query.kind === "EXPENSE" || query.kind === "VALUATION"
        ? ["response_body->receipt->>operationId", "response_body->error->>commandId"]
        : []),
  ];
  const rows = new Map<string, LedgerOperationRow>();
  for (const field of fields) {
    const result = await service
      .from("ledger_idempotency_keys")
      .select(
        "id,actor_user_id,journey_id,command_type,idempotency_key,payload_hash,response_status,response_body,completed_at",
      )
      .eq("actor_user_id", actor)
      .eq("journey_id", trip)
      .in("command_type", [...commands[query.kind]])
      .eq(field, operation)
      .limit(101);
    if (result.error || !result.data)
      throw new Error("LEDGER_OPERATION_READ_UNAVAILABLE");
    if (result.data.length > 100) throw new Error("LEDGER_OPERATION_READ_RESOURCE_LIMIT");
    for (const value of result.data) {
      const row = rowSchema.parse(value);
      if (row.actor_user_id !== actor || row.journey_id !== trip)
        throw new Error("RESULT_MISMATCH");
      rows.set(row.id, row);
    }
  }
  // Existing immutable conflict outcomes, not a new operation state machine.
  for (const row of rows.values()) {
    if (
      row.response_status !== 409 ||
      ![
        "EXPENSE_COMMAND_V2",
        "UPDATE_EXPENSE",
        "DELETE_EXPENSE",
        "RESTORE_EXPENSE",
        "APPLY_VALUATION",
      ].includes(row.command_type)
    )
      continue;
    const closed = await service
      .from("expense_conflict_outcomes_v2")
      .select("resolution_key_id,lifecycle,resulting_revision,operation_receipt")
      .eq("conflict_id", row.id)
      .maybeSingle();
    if (closed.error) throw new Error("LEDGER_OPERATION_READ_UNAVAILABLE");
    if (!closed.data) continue;
    const resolution = await service
      .from("ledger_idempotency_keys")
      .select("journey_id,response_status,response_body")
      .eq("id", closed.data.resolution_key_id)
      .eq("journey_id", trip)
      .eq("command_type", "RESOLVE_EXPENSE_CHAIN_V2")
      .maybeSingle();
    if (resolution.error || !resolution.data || resolution.data.response_status !== 200)
      throw new Error("LEDGER_OPERATION_READ_UNAVAILABLE");
    const receipt = expenseOperationReceiptSchema.parse(closed.data.operation_receipt),
      canonical = ledgerExpenseSchema.parse(
        (resolution.data.response_body as { canonical?: unknown })?.canonical,
      );
    const original = (
      row.response_body as { error?: { commandId?: string; expenseId?: string } } | null
    )?.error;
    if (
      receipt.operationId !== (original?.commandId ?? row.idempotency_key) ||
      receipt.idempotencyKey !== row.idempotency_key ||
      receipt.expenseId !== canonical.id ||
      original?.expenseId !== canonical.id ||
      canonical.journeyId !== trip ||
      receipt.canonicalRevision !== canonical.revision ||
      closed.data.resulting_revision !== canonical.revision
    )
      throw new Error("RESULT_MISMATCH");
    row.resolved_receipt = ledgerExpenseMutationResponseSchema.parse({
      receipt,
      entity: canonical,
      serverId: canonical.id,
      revision: canonical.revision,
      updatedAt: canonical.updatedAt,
      idempotentReplay: false,
    });
  }
  // Typed valuation shares its original Expense journal but has a distinct intent kind.
  return [...rows.values()].filter(
    (row) =>
      row.command_type !== "EXPENSE_COMMAND_V2" ||
      query.kind !== "VALUATION" ||
      (
        row.response_body as {
          receipt?: { commandType?: string };
          error?: { commandType?: string };
        } | null
      )?.receipt?.commandType === "APPLY_VALUATION" ||
      (row.response_body as { error?: { commandType?: string } } | null)?.error
        ?.commandType === "APPLY_VALUATION",
  );
}
const receiptSchemas = {
  EXPENSE: ledgerExpenseMutationResponseSchema,
  VALUATION: ledgerExpenseMutationResponseSchema,
  EXPENSE_PAYMENT_RECORD: ledgerPaymentRecordMutationResponseSchema,
  CURRENCY: journeyCurrencyCommitSchema,
  EXPENSE_RESOLUTION: expenseConflictChainResolutionResponseSchema,
};
export const rejectedLedgerReceiptSchema = z.strictObject({
  responseStatus: z.literal(409),
  responseBody: expenseTypedConflictResponseSchema
    .extend({
      error: expenseTypedConflictResponseSchema.shape.error
        .extend({
          message: z.string().optional(),
          requestId: z.string().optional(),
        })
        .passthrough(),
    })
    .passthrough(),
});
export const ledgerOperationStatusSchema = z.union([
  z.strictObject({
    operationId: z.string().min(1).max(200),
    actorAccountId: coreUuid,
    tripId: coreUuid,
    requestDigest: coreHash,
    state: z.literal("REJECTED"),
    receipt: rejectedLedgerReceiptSchema,
  }),
  z.strictObject({
    operationId: z.string().min(1).max(200),
    actorAccountId: coreUuid,
    tripId: coreUuid,
    requestDigest: coreHash,
    state: z.enum(["CONFIRMED", "REJECTED"]),
    receipt: z.union([
      ledgerExpenseMutationResponseSchema,
      ledgerPaymentRecordMutationResponseSchema,
      journeyCurrencyCommitSchema,
      expenseConflictChainResolutionResponseSchema,
    ]),
  }),
  z.strictObject({
    operationId: z.string().min(1).max(200),
    actorAccountId: coreUuid,
    tripId: coreUuid,
    requestDigest: z.null(),
    state: z.literal("UNKNOWN"),
    receipt: z.null(),
  }),
]);
export function projectLedgerOperation(
  rows: readonly LedgerOperationRow[],
  actor: string,
  trip: string,
  operation: string,
  query: LedgerOperationQuery,
) {
  if (rows.some((row) => row.actor_user_id !== actor || row.journey_id !== trip))
    throw new Error("RESULT_MISMATCH");
  const candidates = rows.filter((row) => {
    const body = (row.resolved_receipt ?? row.response_body) as {
      entity?: { id?: string };
      canonical?: { id?: string };
      changeId?: string;
      error?: { expenseId?: string };
    } | null;
    return (
      !query.targetId ||
      query.kind === "EXPENSE_PAYMENT_RECORD" ||
      (query.kind === "CURRENCY"
        ? query.targetId === trip || query.targetId === body?.changeId
        : query.targetId ===
          (body?.entity?.id ?? body?.canonical?.id ?? body?.error?.expenseId))
    );
  });
  if (rows.length && !candidates.length) throw new Error("OPERATION_TARGET_MISMATCH");
  if (candidates.length > 1) throw new Error("OPERATION_LOOKUP_AMBIGUOUS");
  const row = candidates[0],
    common = { operationId: operation, actorAccountId: actor, tripId: trip };
  if (
    !row ||
    row.completed_at === null ||
    row.response_status === null ||
    row.response_body === null
  )
    return ledgerOperationStatusSchema.parse({
      ...common,
      requestDigest: null,
      state: "UNKNOWN",
      receipt: null,
    });
  if (row.actor_user_id !== actor || row.journey_id !== trip)
    throw new Error("RESULT_MISMATCH");
  if (row.response_status >= 400 && !row.resolved_receipt) {
    const receipt = rejectedLedgerReceiptSchema.parse({
      responseStatus: row.response_status,
      responseBody: row.response_body,
    });
    const error = receipt.responseBody.error;
    if (
      !["EXPENSE", "VALUATION"].includes(query.kind) ||
      row.command_type !== "EXPENSE_COMMAND_V2" ||
      error.envelope.idempotencyKey !== row.idempotency_key ||
      (operation !== error.commandId && operation !== row.idempotency_key) ||
      error.commandId !== error.envelope.commandId ||
      error.expenseId !== error.current.id ||
      error.current.journeyId !== trip ||
      (query.kind === "VALUATION" && error.commandType !== "APPLY_VALUATION")
    )
      throw new Error("RESULT_MISMATCH");
    return ledgerOperationStatusSchema.parse({
      ...common,
      requestDigest: row.payload_hash,
      state: "REJECTED",
      receipt,
    });
  }
  const receipt = receiptSchemas[query.kind].parse(
    row.resolved_receipt ?? row.response_body,
  );
  return ledgerOperationStatusSchema.parse({
    ...common,
    requestDigest: row.payload_hash,
    state: "CONFIRMED",
    receipt,
  });
}
export async function ledgerOperationReadBoundary(
  request: Request,
  actor: string,
  gateway: Pick<
    DevBackendGateway,
    "canReadTrip" | "bootstrapLedger" | "readLedgerOperation"
  >,
) {
  const reply = (status: number, body: unknown) =>
      new Response(JSON.stringify(body), {
        status,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "private, no-store",
          Vary: "Authorization",
        },
      }),
    fail = (status: number, code: string) =>
      reply(status, { error: { code, message: code } });
  const url = new URL(request.url),
    match = /^\/v2\/trips\/([^/]+)\/ledger\/operations\/([^/]+)$/.exec(url.pathname);
  if (request.method !== "GET") return fail(405, "METHOD_NOT_ALLOWED");
  let operation: string;
  try {
    operation = decodeURIComponent(match?.[2] ?? "");
  } catch {
    return fail(400, "INVALID_PAYLOAD");
  }
  const query = ledgerOperationQuerySchema.safeParse(
    Object.fromEntries(url.searchParams),
  );
  if (
    !match ||
    !coreUuid.safeParse(match[1]).success ||
    !operation ||
    operation.length > 200 ||
    operation.trim() !== operation ||
    request.body !== null ||
    new Set(url.searchParams.keys()).size !== [...url.searchParams.keys()].length ||
    !query.success
  )
    return fail(400, "INVALID_PAYLOAD");
  try {
    if (!(await gateway.canReadTrip(actor, match[1]))) return fail(403, "FORBIDDEN");
    const access = await gateway.bootstrapLedger(actor, match[1]);
    if (
      access.journey.id !== match[1] ||
      access.actor.userId !== actor ||
      !access.actor.capabilities.canRead
    )
      return fail(403, "FORBIDDEN");
    if (!gateway.readLedgerOperation) return fail(503, "CAPABILITY_UNAVAILABLE");
    const result = ledgerOperationStatusSchema.parse(
      await gateway.readLedgerOperation(actor, match[1], operation, query.data),
    );
    if (
      result.actorAccountId !== actor ||
      result.tripId !== match[1] ||
      result.operationId !== operation
    )
      throw new Error("RESULT_MISMATCH");
    return reply(200, result);
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    return code === "OPERATION_LOOKUP_AMBIGUOUS"
      ? fail(409, code)
      : code === "OPERATION_TARGET_MISMATCH"
        ? fail(404, code)
        : fail(503, "CAPABILITY_UNAVAILABLE");
  }
}
