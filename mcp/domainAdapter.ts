import { z } from "zod";
import { uuid } from "./contract";
import { contentDigest, sha, type ConfirmChanges } from "./mutation";
import { createRequestBoundary, readBoundedJson } from "../src/data/api/requestBoundary";
import {
  tripMetadataRevisionedUpdateSchema,
  tripMetadataRevisionedReceiptSchema,
  tripMetadataRevisionedSnapshotSchema,
} from "../src/domain/trip/tripMetadataV2Contract";
import {
  personCloudCreateSchema,
  personCloudCreateReceiptSchema,
} from "../src/domain/trip/tripPersonCloudCreate";
import {
  expenseCommandRequestSchema,
  ledgerExpenseMutationResponseSchema,
} from "../src/data/api/ledgerMutationContracts";
import { expenseUserPatchSchema } from "../src/data/api/ledgerMutationContracts";
import {
  ledgerExpenseListResponseSchema,
  ledgerMemberSchema,
} from "../src/data/api/ledgerReadContracts";
import {
  ledgerExpenseSchema,
  ledgerStage4EditableExpenseSchema,
} from "../src/data/api/ledgerReadContracts";
import { prepareExpensePlan, rosterContract } from "./peopleExpenseAdapter";
import {
  participationSnapshotSchema,
  serializeParticipationVector,
} from "../src/domain/trip/participationSnapshot";

export const expenseAdapterInput = z.strictObject({
  trip_id: uuid,
  expense_id: uuid.optional(),
  command: expenseCommandRequestSchema,
});
export const expenseCreateInput = z.strictObject({
  trip_id: uuid,
  request_id: uuid,
  expense: ledgerStage4EditableExpenseSchema,
});
export const expenseUpdateInput = z.strictObject({
  trip_id: uuid,
  request_id: uuid,
  expense_id: uuid,
  base_expense: ledgerExpenseSchema,
  patch: expenseUserPatchSchema,
  audit_reason: z.string().trim().min(1).max(2000).nullable().default(null),
});
export const metadataReadInput = z.strictObject({
  trip_id: uuid,
  operation_id: uuid,
  format_version: z.union([z.literal(2), z.literal(3)]).default(3),
});
export const expenseListInput = z.strictObject({
  trip_id: uuid,
  cursor: z.string().max(2048).optional(),
  limit: z.number().int().min(1).max(100).default(50),
});
export const travelerStatusInput = z.strictObject({ trip_id: uuid, operation_id: uuid });
export type DomainBackend = (
  request: {
    method: "GET" | "POST" | "PUT";
    path: string;
    body?: unknown;
    headers?: Record<string, string>;
  },
  signal: AbortSignal,
) => Promise<Response>;
export type DomainKind = "METADATA" | "TRAVELER" | "EXPENSE";
export type DomainPermission =
  DomainKind | "METADATA_READ" | "EXPENSE_READ" | "PEOPLE_READ";
export type DomainPrepared = {
  kind: DomainKind;
  tripId: string;
  commandId: string;
  method: "POST" | "PUT";
  path: string;
  body: unknown;
  headers: Record<string, string>;
};
export type DomainBinding = {
  accountId: string;
  clientId: string;
  resource: string;
  digest: string;
  tripId: string;
  commandId: string;
};
export type ExpenseRecovery =
  | { state: "RECEIPT"; binding: DomainBinding; response: unknown }
  | { state: "FIRST_SEND_RESERVED"; binding: DomainBinding }
  | { state: "UNKNOWN" };
export type DomainContext = {
  accountId: string;
  clientId: string;
  resource: string;
  expiresAt: number;
  enabled?: readonly DomainPermission[];
  backend?: DomainBackend;
  confirm?: ConfirmChanges;
  signal?: AbortSignal;
  // Trusted owning adapter must return the persisted original binding, never echo new input over an old receipt/reservation.
  expenseRecovery?: (
    binding: DomainBinding,
    signal: AbortSignal,
  ) => Promise<ExpenseRecovery>;
};
export function prepareMetadata(raw: unknown): DomainPrepared {
  const body = tripMetadataRevisionedUpdateSchema.parse(raw);
  return {
    kind: "METADATA",
    tripId: body.tripId,
    commandId: body.operationId,
    method: "POST",
    path: `/v2/trips/${body.tripId}/metadata`,
    body,
    headers: {
      "OTR-Trip-Metadata-Version": String(body.formatVersion),
      "Idempotency-Key": body.operationId,
    },
  };
}
export function prepareTraveler(raw: unknown): DomainPrepared {
  const body = personCloudCreateSchema.parse(raw);
  return {
    kind: "TRAVELER",
    tripId: body.tripId,
    commandId: body.operationId,
    method: "POST",
    path: `/v2/trips/${body.tripId}/people`,
    body,
    headers: { "Idempotency-Key": body.operationId },
  };
}
export function prepareExpense(raw: unknown): DomainPrepared {
  const q = expenseAdapterInput.parse(raw),
    envelope = q.command.envelope,
    type = envelope.patchOrIntent.type;
  if (type !== "CREATE" && type !== "UPDATE") throw Error("EXPENSE_CREATE_EDIT_ONLY");
  if (
    type === "CREATE"
      ? !!q.expense_id ||
        envelope.observedBase !== null ||
        envelope.observedServerRevision !== 0
      : !q.expense_id ||
        !envelope.observedBase ||
        envelope.observedBase.id !== q.expense_id ||
        envelope.observedBase.journeyId !== q.trip_id
  )
    throw Error("EXPENSE_TARGET_OR_BASE_MISMATCH");
  return {
    kind: "EXPENSE",
    tripId: q.trip_id,
    commandId: envelope.commandId,
    method: type === "UPDATE" ? "PUT" : "POST",
    path: `/v2/trips/${q.trip_id}/expenses${type === "UPDATE" ? `/${q.expense_id}` : ""}`,
    body: q.command,
    headers: { "Idempotency-Key": envelope.idempotencyKey },
  };
}
export function prepareExpenseCreate(raw: unknown) {
  const q = expenseCreateInput.parse(raw);
  prepareExpensePlan("CREATE", { localId: q.request_id, ...q.expense });
  return prepareExpense({
    trip_id: q.trip_id,
    command: {
      auditReason: null,
      envelope: {
        commandId: q.request_id,
        idempotencyKey: q.request_id,
        intentVersion: 2,
        intentSequence: 1,
        predecessorOperationId: null,
        observedServerRevision: 0,
        observedBase: null,
        causalBaseReceipt: null,
        boundExecutionRevision: 0,
        patchOrIntent: { type: "CREATE", expense: q.expense },
      },
    },
  });
}
export function prepareExpenseUpdate(raw: unknown) {
  const q = expenseUpdateInput.parse(raw);
  return prepareExpense({
    trip_id: q.trip_id,
    expense_id: q.expense_id,
    command: {
      auditReason: q.audit_reason,
      envelope: {
        commandId: q.request_id,
        idempotencyKey: q.request_id,
        intentVersion: 2,
        intentSequence: 1,
        predecessorOperationId: null,
        observedServerRevision: q.base_expense.revision,
        observedBase: q.base_expense,
        causalBaseReceipt: null,
        boundExecutionRevision: q.base_expense.revision,
        patchOrIntent: { type: "UPDATE", patch: q.patch },
      },
    },
  });
}
function verifiedOutcome(context: DomainContext, prepared: DomainPrepared, raw: unknown) {
  if (prepared.kind === "METADATA") {
    const receipt = tripMetadataRevisionedReceiptSchema.parse(raw);
    const { actorAccountId, resultMetadataRevision, ...request } = receipt;
    if (
      actorAccountId !== context.accountId ||
      contentDigest(request) !== contentDigest(prepared.body)
    )
      throw Error("RECEIPT_SCOPE_OR_INTENT_MISMATCH");
    return {
      outcome: "APPLIED",
      operation_id: receipt.operationId,
      target_id: receipt.tripId,
      current_revision: resultMetadataRevision,
    };
  }
  if (prepared.kind === "TRAVELER") {
    const receipt = personCloudCreateReceiptSchema.parse(raw);
    if (
      receipt.actorAccountId !== context.accountId ||
      contentDigest(receipt.request) !== contentDigest(prepared.body)
    )
      throw Error("RECEIPT_SCOPE_OR_INTENT_MISMATCH");
    return {
      outcome: "APPLIED",
      operation_id: receipt.request.operationId,
      target_id: receipt.person.personId,
      current_revision: null,
      participation_revision: receipt.person.participationRevision,
    };
  }
  const result = ledgerExpenseMutationResponseSchema.parse(raw),
    receipt = result.receipt;
  const request = expenseCommandRequestSchema.parse(prepared.body),
    e = request.envelope;
  if (
    !receipt ||
    result.entity.journeyId !== prepared.tripId ||
    result.serverId !== result.entity.id ||
    result.entity.revision !== result.revision ||
    receipt.commandId !== e.commandId ||
    receipt.idempotencyKey !== e.idempotencyKey ||
    receipt.commandType !== e.patchOrIntent.type ||
    receipt.intentSequence !== e.intentSequence ||
    (e.patchOrIntent.type === "UPDATE" && result.entity.id !== e.observedBase?.id)
  )
    throw Error("RECEIPT_SCOPE_OR_INTENT_MISMATCH");
  return {
    outcome: receipt.disposition === "APPLIED" ? "APPLIED" : "NO_CHANGE",
    disposition: receipt.disposition,
    operation_id: receipt.operationId,
    target_id: receipt.expenseId,
    current_revision: receipt.canonicalRevision,
  };
}
function normalizePrepared(raw: DomainPrepared) {
  const result =
    raw.kind === "METADATA"
      ? prepareMetadata(raw.body)
      : raw.kind === "TRAVELER"
        ? prepareTraveler(raw.body)
        : prepareExpense({
            trip_id: raw.tripId,
            expense_id:
              expenseCommandRequestSchema.parse(raw.body).envelope.patchOrIntent.type ===
              "UPDATE"
                ? expenseCommandRequestSchema.parse(raw.body).envelope.observedBase?.id
                : undefined,
            command: raw.body,
          });
  if (contentDigest(result) !== contentDigest(raw))
    throw Error("PREPARED_REQUEST_MISMATCH");
  return result;
}
export function createDomainAdapters(context: DomainContext) {
  const active = () =>
    uuid.safeParse(context.accountId).success &&
    Number.isFinite(context.expiresAt) &&
    context.expiresAt > Date.now() &&
    !context.signal?.aborted;
  const allowed = (kind: string) =>
    active() && !!context.backend && context.enabled?.includes(kind as DomainKind);
  const bound = (p: DomainPrepared): DomainBinding => ({
    accountId: context.accountId,
    clientId: context.clientId,
    resource: context.resource,
    tripId: p.tripId,
    commandId: p.commandId,
    digest: contentDigest({
      accountId: context.accountId,
      clientId: context.clientId,
      resource: context.resource,
      request: p,
    }),
  });
  async function request(input: Parameters<DomainBackend>[0]) {
    if (!active() || !context.backend) throw Error("DOMAIN_BINDING_CLOSED");
    const boundary = createRequestBoundary(
      Math.min(45000, Math.max(1, context.expiresAt - Date.now())),
      context.signal,
    );
    try {
      const response = await boundary.run(() => context.backend!(input, boundary.signal));
      const body = response.ok
        ? await readBoundedJson(response, 4194304, boundary)
        : null;
      if (!response.ok) await response.body?.cancel();
      if (!active()) throw Error("AUTH_REQUIRED");
      return { status: response.status, body };
    } finally {
      boundary.close();
    }
  }
  return {
    async list_trip_people(raw: unknown) {
      const q = z.strictObject({ trip_id: uuid }).parse(raw);
      if (!allowed("PEOPLE_READ")) throw Error("ROSTER_READER_CLOSED");
      const response = await request({
        method: "GET",
        path: `/v2/trips/${q.trip_id}/ledger/bootstrap`,
        headers: { "X-Review-Protocol": "2" },
      });
      if (response.status !== 200) throw Error(`ROSTER_READ_HTTP_${response.status}`);
      // Project only lawful Trip names. Never expose bootstrap financial/profile data through a roster tool.
      const snapshot = z
        .object({
          journey: z.object({ id: uuid }),
          members: z.array(ledgerMemberSchema).max(256),
          participationSnapshot: participationSnapshotSchema,
        })
        .parse(response.body);
      if (
        snapshot.journey.id !== q.trip_id ||
        snapshot.participationSnapshot.personCount !== snapshot.members.length
      )
        throw Error("ROSTER_SCOPE_OR_COMPLETENESS_MISMATCH");
      const fingerprint = sha(serializeParticipationVector(snapshot.members));
      if (fingerprint !== snapshot.participationSnapshot.fingerprint)
        throw Error("ROSTER_FINGERPRINT_MISMATCH");
      const people = snapshot.members.map((member) => ({
        person_id: member.id,
        display_name: member.displayName,
        confirmed_visible_aka: [],
        participation_active: member.isParticipating,
        participation_revision: member.participationRevision,
        ...(member.status ? { status: member.status } : {}),
      }));
      return rosterContract.parse({
        account_id: context.accountId,
        trip_id: q.trip_id,
        revision: null,
        fingerprint: contentDigest({ people, participation_fingerprint: fingerprint }),
        complete: true,
        name_scope: "TRIP_DISPLAY_NAMES_ONLY",
        people,
      });
    },
    async get_metadata_operation(raw: unknown) {
      const q = metadataReadInput.parse(raw);
      if (!allowed("METADATA_READ") && !allowed("METADATA"))
        throw Error("METADATA_READER_CLOSED");
      const response = await request({
        method: "GET",
        path: `/v2/trip-metadata-operations/${q.operation_id}`,
        headers: { "OTR-Trip-Metadata-Version": String(q.format_version) },
      });
      if (response.status !== 200)
        return {
          domain: "METADATA",
          command_id: q.operation_id,
          outcome: "UNKNOWN",
          current_revision: null,
          error_code: "NOT_VISIBLE_OR_UNAVAILABLE_NOT_NO_COMMIT",
        };
      const receipt = tripMetadataRevisionedReceiptSchema.parse(response.body);
      if (
        receipt.actorAccountId !== context.accountId ||
        receipt.tripId !== q.trip_id ||
        receipt.operationId !== q.operation_id ||
        receipt.formatVersion !== q.format_version
      )
        throw Error("RECEIPT_SCOPE_OR_INTENT_MISMATCH");
      return {
        domain: "METADATA",
        command_id: q.operation_id,
        operation_id: receipt.operationId,
        target_id: receipt.tripId,
        outcome: "APPLIED",
        current_revision: receipt.resultMetadataRevision,
      };
    },
    async get_traveler_operation(raw: unknown) {
      const q = travelerStatusInput.parse(raw);
      if (!allowed("TRAVELER")) throw Error("TRAVELER_READER_CLOSED");
      const response = await request({
        method: "GET",
        path: `/v2/trips/${q.trip_id}/person-create-operations/${q.operation_id}`,
      });
      if (response.status !== 200)
        return {
          domain: "TRAVELER",
          command_id: q.operation_id,
          outcome: "UNKNOWN",
          current_revision: null,
          error_code: "NOT_VISIBLE_OR_UNAVAILABLE_NOT_NO_COMMIT",
        };
      const receipt = personCloudCreateReceiptSchema.parse(response.body);
      if (
        receipt.actorAccountId !== context.accountId ||
        receipt.request.tripId !== q.trip_id ||
        receipt.request.operationId !== q.operation_id
      )
        throw Error("RECEIPT_SCOPE_OR_INTENT_MISMATCH");
      return {
        domain: "TRAVELER",
        command_id: q.operation_id,
        operation_id: receipt.request.operationId,
        target_id: receipt.person.personId,
        outcome: "APPLIED",
        current_revision: null,
        participation_revision: receipt.person.participationRevision,
      };
    },
    async get_trip_metadata(raw: unknown) {
      const q = metadataReadInput.parse(raw);
      if (!allowed("METADATA_READ")) throw Error("METADATA_READER_CLOSED");
      const response = await request({
        method: "GET",
        path: `/v2/trips/${q.trip_id}/metadata`,
        headers: {
          "OTR-Trip-Metadata-Version": String(q.format_version),
          "OTR-Metadata-Operation-Id": q.operation_id,
        },
      });
      if (response.status !== 200) throw Error(`METADATA_READ_HTTP_${response.status}`);
      const snapshot = tripMetadataRevisionedSnapshotSchema.parse(response.body);
      if (
        snapshot.actorAccountId !== context.accountId ||
        snapshot.tripId !== q.trip_id ||
        snapshot.formatVersion !== q.format_version
      )
        throw Error("READ_SCOPE_MISMATCH");
      return snapshot;
    },
    async list_expenses(raw: unknown) {
      const q = expenseListInput.parse(raw);
      if (!allowed("EXPENSE_READ")) throw Error("EXPENSE_READER_CLOSED");
      const response = await request({
        method: "GET",
        path: `/v2/trips/${q.trip_id}/expenses?limit=${q.limit}${q.cursor ? `&cursor=${encodeURIComponent(q.cursor)}` : ""}`,
      });
      if (response.status !== 200) throw Error(`EXPENSE_READ_HTTP_${response.status}`);
      const page = ledgerExpenseListResponseSchema.parse(response.body);
      if (
        page.expenses.length > q.limit ||
        page.expenses.some((e) => e.journeyId !== q.trip_id) ||
        (page.nextCursor && page.nextCursor === q.cursor)
      )
        throw Error("READ_SCOPE_OR_CURSOR_MISMATCH");
      return page;
    },
    binding: bound,
    async execute(
      prepared: DomainPrepared,
      mode: "PREVIEW" | "APPLY",
      previewDigest?: string,
    ) {
      prepared = normalizePrepared(prepared);
      const binding = Object.freeze(bound(prepared)),
        identity = {
          version: "otr.mcp.domain/1",
          domain: prepared.kind,
          trip_id: prepared.tripId,
          command_id: prepared.commandId,
          preview_digest: binding.digest,
          operation_id: null,
          current_revision: null,
        };
      if (!allowed(prepared.kind))
        return { ...identity, outcome: "BLOCKED", error_code: "DOMAIN_BINDING_CLOSED" };
      if (mode === "PREVIEW")
        return { ...identity, outcome: "PREVIEW", request: prepared.body };
      if (previewDigest !== binding.digest)
        return { ...identity, outcome: "REJECTED", error_code: "PREVIEW_MISMATCH" };
      if (
        !context.clientId ||
        !context.confirm ||
        !(await context.confirm(
          {
            accountId: context.accountId,
            clientId: context.clientId,
            resource: context.resource,
            digest: binding.digest,
            summary: JSON.stringify({
              domain: prepared.kind,
              trip: prepared.tripId,
              request: prepared.body,
            }),
            operationIds: [prepared.commandId],
          },
          context.signal ?? new AbortController().signal,
        ))
      )
        return { ...identity, outcome: "NEEDS_CONFIRMATION" };
      if (!active())
        return {
          ...identity,
          outcome: "UNKNOWN",
          error_code: "AUTH_REQUIRED_QUERY_ORIGINAL_COMMAND",
        };
      try {
        if (prepared.kind === "EXPENSE") {
          if (!context.expenseRecovery)
            return {
              ...identity,
              outcome: "BLOCKED",
              error_code: "EXPENSE_OPERATION_LOOKUP_NOT_CONNECTED",
            };
          const recovery = await context.expenseRecovery(
            binding,
            context.signal ?? new AbortController().signal,
          );
          if (!active()) throw Error("AUTH_REQUIRED");
          if (
            recovery.state !== "UNKNOWN" &&
            contentDigest(recovery.binding) !== contentDigest(binding)
          )
            throw Error("RECOVERY_INTENT_BINDING_MISMATCH");
          if (recovery.state === "RECEIPT")
            return {
              ...identity,
              ...verifiedOutcome(context, prepared, recovery.response),
            };
          if (recovery.state !== "FIRST_SEND_RESERVED")
            return {
              ...identity,
              outcome: "UNKNOWN",
              error_code: "QUERY_ORIGINAL_COMMAND_NO_RESUBMIT",
            };
        } else {
          const known = await request({
            method: "GET",
            path:
              prepared.kind === "METADATA"
                ? `/v2/trip-metadata-operations/${prepared.commandId}`
                : `/v2/trips/${prepared.tripId}/person-create-operations/${prepared.commandId}`,
            headers:
              prepared.kind === "METADATA"
                ? {
                    "OTR-Trip-Metadata-Version":
                      prepared.headers["OTR-Trip-Metadata-Version"],
                  }
                : undefined,
          });
          if (known.status === 200)
            return { ...identity, ...verifiedOutcome(context, prepared, known.body) };
          if (known.status !== 404)
            return {
              ...identity,
              outcome: "UNKNOWN",
              error_code: "QUERY_ORIGINAL_COMMAND_NO_RESUBMIT",
            };
        }
        const result = await request({
          method: prepared.method,
          path: prepared.path,
          body: prepared.body,
          headers: prepared.headers,
        });
        if (result.status === 200 || result.status === 201)
          return { ...identity, ...verifiedOutcome(context, prepared, result.body) };
        return {
          ...identity,
          outcome:
            result.status === 409
              ? "CONFLICT"
              : [400, 401, 403, 404, 405].includes(result.status)
                ? "REJECTED"
                : "UNKNOWN",
          error_code: `DOMAIN_HTTP_${result.status}`,
        };
      } catch {
        return {
          ...identity,
          outcome: "UNKNOWN",
          error_code: "QUERY_ORIGINAL_COMMAND_RECEIPT_UNVERIFIED_OR_UNAVAILABLE",
        };
      }
    },
  };
}
