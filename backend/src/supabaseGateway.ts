import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createHash, randomUUID } from "node:crypto";

import { BackendError, type DevBackendGateway, type StoredCreate } from "./app";
import type {
  CreateLedgerCorrectionRequest,
  CreateLedgerExpenseRequest,
  LedgerCorrectionActionRequest,
  LedgerCorrectionMutationResponse,
  LifecycleLedgerExpenseRequest,
  ResolveLedgerExpenseConflictRequest,
  UpdateLedgerExpenseRequest,
} from "../../src/data/api/ledgerMutationContracts";
import type {
  LedgerBootstrapResponse,
  LedgerChangesResponse,
  LedgerExpenseDto,
  MyLedgerResponse,
} from "../../src/data/api/ledgerReadContracts";
import {
  changedExpenseGroups,
  sameStage4Expense,
} from "../../src/domain/ledger/conflict";

const approvedDevProjectRef = "tuqigdxrvrerfewsxqgm";

export type SupabaseDevConfig = {
  url: string;
  publishableKey: string;
  secretKey: string;
};

function assertApprovedDevUrl(url: string) {
  const parsed = new URL(url);
  if (parsed.hostname !== `${approvedDevProjectRef}.supabase.co`) {
    throw new Error("The backend may connect only to the approved Supabase Dev project.");
  }
}

function client(url: string, key: string) {
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function rowToStoredCreate(row: Record<string, unknown>): StoredCreate {
  return {
    id: String(row.id),
    tripId: String(row.journey_id ?? row.trip_id),
    createdByUserId: String(row.created_by_user_id ?? row.created_by),
    updatedAt: String(row.updated_at),
  };
}

function encodeCursor(sequence: number) {
  return Buffer.from(JSON.stringify({ sequence })).toString("base64url");
}

function decodeCursor(cursor: string | null) {
  if (!cursor) return 0;
  try {
    const decoded = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as {
      sequence?: unknown;
    };
    return typeof decoded.sequence === "number" ? decoded.sequence : 0;
  } catch {
    return 0;
  }
}

function hashPayload(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function capabilities(role: string | null, status: string | null) {
  const linked = status === "linked";
  const organizer = role === "owner";
  return {
    canRead: linked,
    canCreateExpense: linked && (organizer || role === "group_member"),
    canEditOwnExpense: linked && (organizer || role === "group_member"),
    canCorrectAnyExpense: linked && organizer,
    canSuggestCorrection: linked && (organizer || role === "group_member"),
    canResolveOwnExpenseConflict: linked && (organizer || role === "group_member"),
  };
}

async function requireData<T>(result: {
  data: T | null;
  error: { code?: string } | null;
}) {
  if (result.error || !result.data) throw new Error("Supabase Dev operation failed.");
  return result.data;
}

async function findOne(
  service: SupabaseClient,
  table: "ledger_entries" | "itinerary_events",
  id: string,
) {
  const columns =
    table === "ledger_entries"
      ? "id, journey_id, created_by_user_id, updated_at"
      : "id, trip_id, created_by, updated_at";
  const result = await service.from(table).select(columns).eq("id", id).maybeSingle();
  if (result.error) throw new Error("Supabase Dev lookup failed.");
  return result.data ? rowToStoredCreate(result.data) : null;
}

export function createSupabaseDevGateway(config: SupabaseDevConfig): DevBackendGateway {
  assertApprovedDevUrl(config.url);
  const auth = client(config.url, config.publishableKey);
  const service = client(config.url, config.secretKey);

  return {
    async validateAccessToken(token) {
      const { data, error } = await auth.auth.getUser(token);
      return error || !data.user ? null : { id: data.user.id };
    },

    async canReadTrip(userId, tripId) {
      const [creator, legacyMember, journeyMember] = await Promise.all([
        service
          .from("trips")
          .select("id")
          .eq("id", tripId)
          .eq("created_by", userId)
          .limit(1),
        service
          .from("trip_members")
          .select("id")
          .eq("trip_id", tripId)
          .eq("user_id", userId)
          .limit(1),
        service
          .from("journey_members")
          .select("id")
          .eq("trip_id", tripId)
          .eq("user_id", userId)
          .eq("status", "linked")
          .limit(1),
      ]);

      if (creator.error || legacyMember.error || journeyMember.error) {
        throw new Error("Supabase Dev authorization lookup failed.");
      }
      return Boolean(
        creator.data.length || legacyMember.data.length || journeyMember.data.length,
      );
    },

    async canWriteTrip(userId, tripId) {
      const [creator, legacyMember, journeyMember] = await Promise.all([
        service
          .from("trips")
          .select("id")
          .eq("id", tripId)
          .eq("created_by", userId)
          .limit(1),
        service
          .from("trip_members")
          .select("id")
          .eq("trip_id", tripId)
          .eq("user_id", userId)
          .limit(1),
        service
          .from("journey_members")
          .select("id")
          .eq("trip_id", tripId)
          .eq("user_id", userId)
          .eq("status", "linked")
          .in("role", ["owner", "group_member"])
          .limit(1),
      ]);

      if (creator.error || legacyMember.error || journeyMember.error) {
        throw new Error("Supabase Dev authorization lookup failed.");
      }
      return Boolean(
        creator.data.length || legacyMember.data.length || journeyMember.data.length,
      );
    },

    async bootstrapLedger(userId, tripId) {
      return readLedgerBootstrap(service, tripId, userId);
    },

    async pullLedgerChanges(_userId, tripId, cursor) {
      return readLedgerChanges(service, tripId, cursor);
    },

    async readMyLedger(userId) {
      return readMyLedger(service, userId);
    },

    async createLedgerExpense(userId, tripId, idempotencyKey, input) {
      return createLedgerExpenseAggregate(service, userId, tripId, idempotencyKey, input);
    },

    async updateLedgerExpense(userId, tripId, expenseId, idempotencyKey, input) {
      return mutateLedgerExpenseAggregate(
        service,
        userId,
        tripId,
        expenseId,
        idempotencyKey,
        "UPDATE_EXPENSE",
        input,
      );
    },

    async deleteLedgerExpense(userId, tripId, expenseId, idempotencyKey, input) {
      return mutateLedgerExpenseAggregate(
        service,
        userId,
        tripId,
        expenseId,
        idempotencyKey,
        "DELETE_EXPENSE",
        input,
      );
    },

    async restoreLedgerExpense(userId, tripId, expenseId, idempotencyKey, input) {
      return mutateLedgerExpenseAggregate(
        service,
        userId,
        tripId,
        expenseId,
        idempotencyKey,
        "RESTORE_EXPENSE",
        input,
      );
    },

    async resolveLedgerExpenseConflict(userId, tripId, expenseId, idempotencyKey, input) {
      return resolveLedgerExpenseConflict(
        service,
        userId,
        tripId,
        expenseId,
        idempotencyKey,
        input,
      );
    },

    async createLedgerCorrection(userId, tripId, expenseId, idempotencyKey, input) {
      return createLedgerCorrection(
        service,
        userId,
        tripId,
        expenseId,
        idempotencyKey,
        input,
      );
    },

    async actOnLedgerCorrection(
      userId,
      tripId,
      correctionId,
      action,
      idempotencyKey,
      input,
    ) {
      return actOnLedgerCorrection(
        service,
        userId,
        tripId,
        correctionId,
        action,
        idempotencyKey,
        input,
      );
    },

    async createFinalizedSettlementGuardFixture(_userId, tripId, expenseId) {
      await createFinalizedSettlementGuardFixture(service, tripId, expenseId);
      return { ok: true };
    },

    findExpense(id) {
      return findOne(service, "ledger_entries", id);
    },

    async createExpense(id, tripId, userId, input) {
      const occurredAt = input.occurredAt ? new Date(input.occurredAt) : new Date();
      const amount = (input.amountMinor / 100).toFixed(2);
      const result = await service
        .from("ledger_entries")
        .insert({
          id,
          journey_id: tripId,
          title: input.title,
          expense_date: occurredAt.toISOString().slice(0, 10),
          original_amount: amount,
          original_currency: input.currencyCode,
          base_amount: amount,
          base_currency: input.currencyCode,
          exchange_rate: 1,
          payer_member_id: input.paidByMemberId,
          created_by_user_id: userId,
        })
        .select("id, journey_id, created_by_user_id, updated_at")
        .single();

      if (result.error?.code === "23505") {
        const existing = await findOne(service, "ledger_entries", id);
        if (existing) return existing;
      }
      return rowToStoredCreate(await requireData(result));
    },

    findItineraryItem(id) {
      return findOne(service, "itinerary_events", id);
    },

    async createItineraryItem(id, tripId, userId, input) {
      const time = input.startTime ?? "00:00";
      const result = await service
        .from("itinerary_events")
        .insert({
          id,
          trip_id: tripId,
          title: input.title,
          description: input.notes,
          location_name: input.location,
          location_text: input.location,
          planned_start: `${input.scheduledDate}T${time}:00.000Z`,
          is_estimated_time: input.startTime === null,
          created_by: userId,
        })
        .select("id, trip_id, created_by, updated_at")
        .single();

      if (result.error?.code === "23505") {
        const existing = await findOne(service, "itinerary_events", id);
        if (existing) return existing;
      }
      return rowToStoredCreate(await requireData(result));
    },
  };
}

async function createLedgerExpenseAggregate(
  service: SupabaseClient,
  userId: string,
  tripId: string,
  idempotencyKey: string,
  input: CreateLedgerExpenseRequest,
) {
  const now = new Date().toISOString();
  const serverId = randomUUID();
  const valuation = input.valuation
    ? {
        id: randomUUID(),
        policy: input.valuation.policy,
        original: input.valuation.original,
        settlement: input.valuation.settlement,
        rateSnapshotId: input.valuation.rateSnapshotId,
        paymentRecordId: input.valuation.paymentRecordId,
        reason: input.valuation.reason,
      }
    : null;
  const entity = {
    id: serverId,
    journeyId: tripId,
    creatorMemberId: null,
    payerMemberId: input.payerMemberId,
    title: input.title,
    description: input.description,
    category: input.category,
    occurredAt: input.occurredAt,
    original: input.original,
    businessStatus: input.businessStatus,
    revision: 1,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
    participants: input.participants,
    splits: input.splits,
    valuation,
    paymentRecords: [],
    auditEvents: [
      {
        id: randomUUID(),
        expenseId: serverId,
        actorUserId: userId,
        actorMemberId: null,
        eventType: "CREATED",
        reason: null,
        changedGroups: ["FINANCIAL_CORE", "DESCRIPTIVE"],
        revision: 1,
        createdAt: now,
      },
    ],
  };
  const response = {
    entity,
    serverId,
    revision: 1,
    updatedAt: now,
    idempotentReplay: false,
  };
  const result = await service.rpc("ledger_create_expense_4a", {
    actor_user: userId,
    target_journey: tripId,
    idempotency_key_value: idempotencyKey,
    payload_hash_value: hashPayload(input),
    response_body_value: response,
  });

  if (result.error?.message.includes("IDEMPOTENCY_CONFLICT")) {
    throw new BackendError(409, "IDEMPOTENCY_CONFLICT", "The idempotency key conflicts.");
  }
  if (result.error?.message.includes("FINALIZED_SETTLEMENT_PROTECTED")) {
    throw new BackendError(
      409,
      "SETTLEMENT_INPUT_STALE",
      "A finalized settlement protects this mutation.",
    );
  }
  if (result.error) throw new Error("Supabase Dev Ledger create failed.");

  return result.data as typeof response;
}

async function createFinalizedSettlementGuardFixture(
  service: SupabaseClient,
  tripId: string,
  expenseId: string,
) {
  const valuation = await service
    .from("settlement_valuation_snapshots")
    .select("id")
    .eq("expense_id", expenseId)
    .eq("is_active", true)
    .maybeSingle();
  if (valuation.error || !valuation.data) {
    throw new BackendError(404, "ENTITY_NOT_FOUND", "The valuation was not found.");
  }

  const expense = await service
    .from("expenses")
    .select("revision")
    .eq("id", expenseId)
    .eq("journey_id", tripId)
    .maybeSingle();
  if (expense.error || !expense.data) {
    throw new BackendError(404, "ENTITY_NOT_FOUND", "The Ledger expense was not found.");
  }

  const settlementId = randomUUID();
  const settlement = await service.from("settlements").insert({
    id: settlementId,
    journey_id: tripId,
    settlement_currency: "NZD",
    settlement_scale: 2,
    status: "FINALIZED",
    through_timestamp: new Date().toISOString(),
    input_digest: `stage4b-${settlementId}`,
    algorithm_version: "stage4b-guard-fixture",
  });
  if (settlement.error) throw new Error("Supabase Dev guard fixture failed.");

  const input = await service.from("settlement_inputs").insert({
    settlement_id: settlementId,
    journey_id: tripId,
    expense_id: expenseId,
    expense_revision: Number(expense.data.revision),
    valuation_snapshot_id: String(valuation.data.id),
  });
  if (input.error) throw new Error("Supabase Dev guard fixture failed.");
}

async function mutateLedgerExpenseAggregate(
  service: SupabaseClient,
  userId: string,
  tripId: string,
  expenseId: string,
  idempotencyKey: string,
  commandType: "UPDATE_EXPENSE" | "DELETE_EXPENSE" | "RESTORE_EXPENSE",
  input: UpdateLedgerExpenseRequest | LifecycleLedgerExpenseRequest,
) {
  const current = await readOneExpenseAggregate(service, expenseId);
  if (!current || current.journeyId !== tripId) {
    throw new BackendError(404, "ENTITY_NOT_FOUND", "The Ledger expense was not found.");
  }

  const now = new Date().toISOString();
  const nextRevision = input.baseRevision + 1;
  const eventType =
    commandType === "UPDATE_EXPENSE"
      ? "EDITED"
      : commandType === "DELETE_EXPENSE"
        ? "DELETED"
        : "RESTORED";
  const changedGroups =
    commandType === "UPDATE_EXPENSE"
      ? changedExpenseGroups(editableExpense(current), {
          ...(input as UpdateLedgerExpenseRequest),
        })
      : ["LIFECYCLE"];
  const updateInput = input as UpdateLedgerExpenseRequest;
  const entity: LedgerExpenseDto =
    commandType === "UPDATE_EXPENSE"
      ? {
          id: expenseId,
          journeyId: tripId,
          creatorMemberId: current.creatorMemberId,
          payerMemberId: updateInput.payerMemberId,
          title: updateInput.title,
          description: updateInput.description,
          category: updateInput.category,
          occurredAt: updateInput.occurredAt,
          original: updateInput.original,
          businessStatus: updateInput.businessStatus,
          revision: nextRevision,
          deletedAt: null,
          createdAt: current.createdAt,
          updatedAt: now,
          participants: updateInput.participants,
          splits: updateInput.splits,
          valuation: updateInput.valuation
            ? { id: randomUUID(), ...updateInput.valuation }
            : null,
          paymentRecords: current.paymentRecords,
          auditEvents: [],
        }
      : {
          ...current,
          businessStatus:
            commandType === "DELETE_EXPENSE"
              ? "DELETED"
              : ((input as LifecycleLedgerExpenseRequest).businessStatus ?? "ACCEPTED"),
          revision: nextRevision,
          deletedAt: commandType === "DELETE_EXPENSE" ? now : null,
          updatedAt: now,
          auditEvents: [],
        };
  entity.auditEvents = current.auditEvents.concat({
    id: randomUUID(),
    expenseId,
    actorUserId: userId,
    actorMemberId: null,
    eventType,
    reason: input.auditReason ?? null,
    changedGroups,
    revision: nextRevision,
    createdAt: now,
  });
  const response = {
    entity,
    serverId: expenseId,
    revision: nextRevision,
    updatedAt: now,
    idempotentReplay: false,
  };
  const result = await service.rpc("ledger_mutate_expense_4b", {
    actor_user: userId,
    target_journey: tripId,
    target_expense: expenseId,
    command_type_value: commandType,
    base_revision_value: input.baseRevision,
    audit_reason_value: input.auditReason ?? null,
    payload_hash_value: hashPayload(input),
    idempotency_key_value: idempotencyKey,
    response_body_value: response,
  });

  if (result.error?.message.includes("IDEMPOTENCY_CONFLICT")) {
    throw new BackendError(409, "IDEMPOTENCY_CONFLICT", "The idempotency key conflicts.");
  }
  if (result.error?.message.includes("REVISION_CONFLICT")) {
    const canonical = await readOneExpenseAggregate(service, expenseId);
    if (!canonical) {
      throw new BackendError(
        404,
        "ENTITY_NOT_FOUND",
        "The Ledger expense was not found.",
      );
    }
    const conflictBody = {
      error: {
        code: "REVISION_CONFLICT",
        conflictId: "00000000-0000-4000-8000-000000000000",
        expenseId,
        baseRevision: input.baseRevision,
        currentRevision: canonical.revision,
        submitted: editableExpense(entity),
        current: canonical,
        changedGroups: changedExpenseGroups(
          editableExpense(entity),
          editableExpense(canonical),
        ),
        auditSummaries: canonical.auditEvents.filter(
          (event) => event.revision > input.baseRevision,
        ),
      },
    };
    const recorded = await service.rpc("ledger_record_conflict_4c", {
      actor_user: userId,
      target_journey: tripId,
      target_expense: expenseId,
      command_type_value: commandType,
      idempotency_key_value: idempotencyKey,
      payload_hash_value: hashPayload(input),
      conflict_body_value: conflictBody,
    });
    if (recorded.error) throw new Error("Supabase Dev conflict persistence failed.");
    throw new BackendError(
      409,
      "REVISION_CONFLICT",
      "The base revision is stale.",
      recorded.data,
    );
  }
  if (result.error?.message.includes("ORGANIZER_REASON_REQUIRED")) {
    throw new BackendError(
      400,
      "INVALID_PAYLOAD",
      "An organizer override reason is required.",
    );
  }
  if (result.error?.message.includes("TRIP_WRITE_FORBIDDEN")) {
    throw new BackendError(403, "TRIP_WRITE_FORBIDDEN", "Trip write access is required.");
  }
  if (result.error?.message.includes("FINALIZED_SETTLEMENT_PROTECTED")) {
    throw new BackendError(
      409,
      "SETTLEMENT_INPUT_STALE",
      "A finalized settlement protects this mutation.",
    );
  }
  if (result.error) throw new Error("Supabase Dev Ledger mutation failed.");

  if (
    (result.data as { error?: { code?: string } } | null)?.error?.code ===
    "REVISION_CONFLICT"
  ) {
    throw new BackendError(
      409,
      "REVISION_CONFLICT",
      "The base revision is stale.",
      result.data,
    );
  }

  return result.data as typeof response;
}

function editableExpense(expense: LedgerExpenseDto) {
  return {
    title: expense.title,
    description: expense.description,
    category: expense.category,
    occurredAt: expense.occurredAt,
    payerMemberId: expense.payerMemberId,
    original: expense.original,
    businessStatus:
      expense.businessStatus === "DELETED"
        ? ("ACCEPTED" as const)
        : expense.businessStatus,
    participants: expense.participants,
    splits: expense.splits,
    valuation: expense.valuation
      ? {
          policy: expense.valuation.policy,
          original: expense.valuation.original,
          settlement: expense.valuation.settlement,
          rateSnapshotId: expense.valuation.rateSnapshotId,
          paymentRecordId: expense.valuation.paymentRecordId,
          reason: expense.valuation.reason,
        }
      : null,
  };
}

function mutationResponse(
  current: LedgerExpenseDto,
  editable: ReturnType<typeof editableExpense>,
  actorUserId: string,
  eventType: string,
  reason: string | null,
  changedGroups: string[],
  incrementRevision = true,
) {
  const revision = current.revision + (incrementRevision ? 1 : 0);
  const now = new Date().toISOString();
  const entity: LedgerExpenseDto = {
    ...current,
    ...editable,
    revision,
    deletedAt: null,
    updatedAt: incrementRevision ? now : current.updatedAt,
    valuation: editable.valuation
      ? {
          id: incrementRevision ? randomUUID() : (current.valuation?.id ?? randomUUID()),
          ...editable.valuation,
        }
      : null,
    auditEvents: current.auditEvents.concat({
      id: randomUUID(),
      expenseId: current.id,
      actorUserId,
      actorMemberId: null,
      eventType,
      reason,
      changedGroups,
      revision,
      createdAt: now,
    }),
  };
  return {
    entity,
    serverId: current.id,
    revision,
    updatedAt: entity.updatedAt,
    idempotentReplay: false,
  };
}

async function resolveLedgerExpenseConflict(
  service: SupabaseClient,
  userId: string,
  tripId: string,
  expenseId: string,
  idempotencyKey: string,
  input: ResolveLedgerExpenseConflictRequest,
) {
  const current = await readOneExpenseAggregate(service, expenseId);
  if (!current || current.journeyId !== tripId) {
    throw new BackendError(404, "ENTITY_NOT_FOUND", "The Ledger expense was not found.");
  }
  const currentEditable = editableExpense(current);
  if (
    input.resolution === "KEEP_JOURNEY" &&
    !sameStage4Expense(input.resolvedExpense, currentEditable)
  ) {
    throw new BackendError(
      400,
      "INVALID_PAYLOAD",
      "Keep Journey must use the current aggregate.",
    );
  }
  const increment = input.resolution !== "KEEP_JOURNEY";
  const response = mutationResponse(
    current,
    input.resolvedExpense,
    userId,
    "CONFLICT_RESOLVED",
    input.reason,
    changedExpenseGroups(currentEditable, input.resolvedExpense),
    increment,
  );
  const result = await service.rpc("ledger_resolve_expense_conflict_4c", {
    actor_user: userId,
    target_journey: tripId,
    target_expense: expenseId,
    conflict_id_value: input.conflictId,
    current_revision_value: input.currentRevision,
    resolution_value: input.resolution,
    selected_sources_value: input.selectedSources,
    reason_value: input.reason,
    idempotency_key_value: idempotencyKey,
    payload_hash_value: hashPayload(input),
    response_body_value: response,
  });
  if (result.error?.message.includes("REVISION_CONFLICT")) {
    const canonical = await readOneExpenseAggregate(service, expenseId);
    if (!canonical) throw new BackendError(404, "ENTITY_NOT_FOUND", "Expense missing.");
    const conflictBody = {
      error: {
        code: "REVISION_CONFLICT",
        conflictId: "00000000-0000-4000-8000-000000000000",
        expenseId,
        baseRevision: input.currentRevision,
        currentRevision: canonical.revision,
        submitted: input.resolvedExpense,
        current: canonical,
        changedGroups: changedExpenseGroups(
          input.resolvedExpense,
          editableExpense(canonical),
        ),
        auditSummaries: canonical.auditEvents.filter(
          (event) => event.revision > input.currentRevision,
        ),
      },
    };
    const recorded = await service.rpc("ledger_record_conflict_4c", {
      actor_user: userId,
      target_journey: tripId,
      target_expense: expenseId,
      command_type_value: "RESOLVE_EXPENSE_CONFLICT",
      idempotency_key_value: idempotencyKey,
      payload_hash_value: hashPayload(input),
      conflict_body_value: conflictBody,
    });
    if (recorded.error) throw new Error("Supabase Dev conflict persistence failed.");
    throw new BackendError(
      409,
      "REVISION_CONFLICT",
      "Resolution became stale.",
      recorded.data,
    );
  }
  if (result.error?.message.includes("TRIP_WRITE_FORBIDDEN")) {
    throw new BackendError(
      403,
      "TRIP_WRITE_FORBIDDEN",
      "Conflict resolution is forbidden.",
    );
  }
  if (result.error?.message.includes("CONFLICT_NOT_FOUND")) {
    throw new BackendError(404, "ENTITY_NOT_FOUND", "The conflict was not found.");
  }
  if (result.error?.message.includes("CONFLICT_ALREADY_RESOLVED")) {
    throw new BackendError(409, "REVISION_CONFLICT", "The conflict is already resolved.");
  }
  if (result.error) throw new Error("Supabase Dev conflict resolution failed.");
  if ((result.data as { error?: { code?: string } } | null)?.error?.code) {
    throw new BackendError(
      409,
      "REVISION_CONFLICT",
      "Resolution became stale.",
      result.data,
    );
  }
  return result.data as typeof response;
}

function correctionDto(
  id: string,
  journeyId: string,
  expenseId: string,
  input: CreateLedgerCorrectionRequest,
  userId: string,
) {
  const now = new Date().toISOString();
  return {
    id,
    journeyId,
    expenseId,
    baseExpenseRevision: input.baseRevision,
    proposedExpense: input.proposedExpense,
    reason: input.reason,
    status: "OPEN" as const,
    requestedByUserId: userId,
    requestedByMemberId: "00000000-0000-4000-8000-000000000000",
    resolvedByUserId: null,
    resolvedByMemberId: null,
    resolutionReason: null,
    resultingExpenseRevision: null,
    revision: 1,
    createdAt: now,
    updatedAt: now,
    resolvedAt: null,
  };
}

async function createLedgerCorrection(
  service: SupabaseClient,
  userId: string,
  tripId: string,
  expenseId: string,
  idempotencyKey: string,
  input: CreateLedgerCorrectionRequest,
): Promise<LedgerCorrectionMutationResponse> {
  const current = await readOneExpenseAggregate(service, expenseId);
  if (!current || current.journeyId !== tripId) {
    throw new BackendError(404, "ENTITY_NOT_FOUND", "The Ledger expense was not found.");
  }
  const correction = correctionDto(randomUUID(), tripId, expenseId, input, userId);
  const response = { correction, expense: null, idempotentReplay: false };
  const result = await service.rpc("ledger_propose_correction_4c", {
    actor_user: userId,
    target_journey: tripId,
    target_expense: expenseId,
    correction_id_value: correction.id,
    base_revision_value: input.baseRevision,
    proposed_aggregate_value: input.proposedExpense,
    reason_value: input.reason,
    changed_groups_value: changedExpenseGroups(
      editableExpense(current),
      input.proposedExpense,
    ),
    idempotency_key_value: idempotencyKey,
    payload_hash_value: hashPayload(input),
    response_body_value: response,
  });
  mapCollaborationError(result.error?.message);
  return result.data as LedgerCorrectionMutationResponse;
}

async function actOnLedgerCorrection(
  service: SupabaseClient,
  userId: string,
  tripId: string,
  correctionId: string,
  action: "accept" | "reject" | "withdraw",
  idempotencyKey: string,
  input: LedgerCorrectionActionRequest,
): Promise<LedgerCorrectionMutationResponse> {
  const correction = await readCorrection(service, correctionId);
  if (!correction || correction.journeyId !== tripId) {
    throw new BackendError(404, "ENTITY_NOT_FOUND", "The correction was not found.");
  }
  const response: LedgerCorrectionMutationResponse = {
    correction: {
      ...correction,
      status:
        action === "accept" ? "ACCEPTED" : action === "reject" ? "REJECTED" : "WITHDRAWN",
      resolvedByUserId: userId,
      resolutionReason: input.resolutionReason,
      revision: correction.revision + 1,
      updatedAt: new Date().toISOString(),
      resolvedAt: new Date().toISOString(),
    },
    expense: null,
    idempotentReplay: false,
  };
  const payloadHash = hashPayload(input);
  if (action !== "accept") {
    const result = await service.rpc("ledger_transition_correction_4c", {
      actor_user: userId,
      target_journey: tripId,
      correction_id_value: correctionId,
      action_value: action.toUpperCase(),
      base_request_revision_value: input.baseRequestRevision,
      resolution_reason_value: input.resolutionReason,
      idempotency_key_value: idempotencyKey,
      payload_hash_value: payloadHash,
      response_body_value: response,
    });
    mapCollaborationError(result.error?.message);
    return result.data as LedgerCorrectionMutationResponse;
  }

  const current = await readOneExpenseAggregate(service, correction.expenseId);
  if (!current) throw new BackendError(404, "ENTITY_NOT_FOUND", "Expense missing.");
  const expenseResponse = mutationResponse(
    current,
    correction.proposedExpense,
    userId,
    "CORRECTION_ACCEPTED",
    input.resolutionReason,
    changedExpenseGroups(editableExpense(current), correction.proposedExpense),
  );
  const result = await service.rpc("ledger_accept_correction_4c", {
    actor_user: userId,
    target_journey: tripId,
    correction_id_value: correctionId,
    base_request_revision_value: input.baseRequestRevision,
    resolution_reason_value: input.resolutionReason,
    idempotency_key_value: idempotencyKey,
    payload_hash_value: payloadHash,
    correction_response_body_value: response,
    expense_response_body_value: expenseResponse,
  });
  mapCollaborationError(result.error?.message);
  return result.data as LedgerCorrectionMutationResponse;
}

function mapCollaborationError(message?: string) {
  if (!message) return;
  if (message.includes("ENTITY_NOT_FOUND")) {
    throw new BackendError(404, "ENTITY_NOT_FOUND", "The Ledger entity was not found.");
  }
  if (message.includes("IDEMPOTENCY_CONFLICT")) {
    throw new BackendError(409, "IDEMPOTENCY_CONFLICT", "The idempotency key conflicts.");
  }
  if (message.includes("CORRECTION_NOT_OPEN")) {
    throw new BackendError(409, "REVISION_CONFLICT", "The correction is not open.");
  }
  if (message.includes("ORGANIZER_REASON_REQUIRED")) {
    throw new BackendError(400, "INVALID_PAYLOAD", "An organizer reason is required.");
  }
  if (message.includes("TRIP_WRITE_FORBIDDEN")) {
    throw new BackendError(403, "TRIP_WRITE_FORBIDDEN", "The command is forbidden.");
  }
  if (message.includes("FINALIZED_SETTLEMENT_PROTECTED")) {
    throw new BackendError(
      409,
      "SETTLEMENT_INPUT_STALE",
      "A finalized settlement protects this expense.",
    );
  }
  throw new Error("Supabase Dev Ledger collaboration command failed.");
}

async function readCorrection(service: SupabaseClient, id: string) {
  const result = await service
    .from("expense_correction_requests")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (result.error) throw new Error("Supabase Dev correction read failed.");
  return result.data ? correctionRowToDto(result.data) : null;
}

function correctionRowToDto(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    journeyId: String(row.journey_id),
    expenseId: String(row.expense_id),
    baseExpenseRevision: Number(row.base_expense_revision),
    proposedExpense:
      row.proposed_aggregate as CreateLedgerCorrectionRequest["proposedExpense"],
    reason: String(row.reason),
    status: row.status as "OPEN" | "ACCEPTED" | "REJECTED" | "WITHDRAWN" | "STALE",
    requestedByUserId: String(row.requested_by),
    requestedByMemberId: String(row.requested_by_member_id),
    resolvedByUserId: row.resolved_by ? String(row.resolved_by) : null,
    resolvedByMemberId: row.resolved_by_member_id
      ? String(row.resolved_by_member_id)
      : null,
    resolutionReason: row.resolution_reason ? String(row.resolution_reason) : null,
    resultingExpenseRevision:
      row.resulting_expense_revision === null
        ? null
        : Number(row.resulting_expense_revision),
    revision: Number(row.revision),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    resolvedAt: row.resolved_at ? String(row.resolved_at) : null,
  };
}

async function readOneExpenseAggregate(service: SupabaseClient, expenseId: string) {
  const result = await service
    .from("expenses")
    .select(
      "id, journey_id, creator_member_id, payer_member_id, title, description, category, occurred_at, original_amount_minor, original_currency, original_currency_scale, business_status, revision, deleted_at, created_at, updated_at",
    )
    .eq("id", expenseId)
    .maybeSingle();
  if (result.error) throw new Error("Supabase Dev Ledger aggregate read failed.");
  const [expense] = await readExpenseAggregates(
    service,
    result.data ? [result.data] : [],
  );
  return expense ?? null;
}

async function readLedgerBootstrap(
  service: SupabaseClient,
  tripId: string,
  userId: string,
): Promise<LedgerBootstrapResponse> {
  const now = new Date().toISOString();
  const [settings, members, households, householdMembers, expenses, corrections] =
    await Promise.all([
      service
        .from("ledger_settings")
        .select("settlement_currency, settlement_scale, valuation_policy, updated_at")
        .eq("journey_id", tripId)
        .maybeSingle(),
      service
        .from("journey_members")
        .select("id, user_id, display_name, role, status, updated_at")
        .eq("trip_id", tripId)
        .order("display_name"),
      service
        .from("households")
        .select("id, name, display_order, updated_at")
        .eq("journey_id", tripId)
        .order("display_order"),
      service
        .from("household_members")
        .select("household_id, member_id")
        .eq("journey_id", tripId),
      service
        .from("expenses")
        .select(
          "id, journey_id, creator_member_id, payer_member_id, title, description, category, occurred_at, original_amount_minor, original_currency, original_currency_scale, business_status, revision, deleted_at, created_at, updated_at",
        )
        .eq("journey_id", tripId)
        .order("occurred_at", { ascending: false }),
      service
        .from("expense_correction_requests")
        .select("*")
        .eq("journey_id", tripId)
        .order("updated_at", { ascending: false }),
    ]);

  if (
    settings.error ||
    members.error ||
    households.error ||
    householdMembers.error ||
    expenses.error ||
    corrections.error
  ) {
    throw new Error("Supabase Dev Ledger bootstrap failed.");
  }

  const aggregates = await readExpenseAggregates(service, expenses.data ?? []);
  const lastSequence = await latestLedgerSequence(service, tripId);
  const setting = settings.data as Record<string, unknown> | null;

  const actorRow = (members.data ?? []).find(
    (member) => String(member.user_id ?? "") === userId,
  ) as Record<string, unknown> | undefined;
  const actorRole = actorRow?.role === null || !actorRow ? null : String(actorRow.role);
  const actorStatus =
    actorRow?.status === null || !actorRow ? null : String(actorRow.status);

  return {
    journey: {
      id: tripId,
      settlementCurrency: String(setting?.settlement_currency ?? "NZD"),
      settlementScale: Number(setting?.settlement_scale ?? 2),
      valuationPolicy: String(setting?.valuation_policy ?? "REFERENCE_RATE"),
      updatedAt: String(setting?.updated_at ?? now),
    },
    members: (members.data ?? []).map((row) => {
      const member = row as Record<string, unknown>;
      const role = member.role === null ? null : String(member.role);
      const status = member.status === null ? null : String(member.status);
      return {
        id: String(member.id),
        displayName: String(member.display_name),
        role,
        status,
        capabilities: capabilities(role, status),
        updatedAt: String(member.updated_at),
      };
    }),
    households: (households.data ?? []).map((row) => {
      const household = row as Record<string, unknown>;
      return {
        id: String(household.id),
        name: String(household.name),
        displayOrder: Number(household.display_order),
        updatedAt: String(household.updated_at),
        memberIds: (householdMembers.data ?? [])
          .filter((item) => String(item.household_id) === String(household.id))
          .map((item) => String(item.member_id)),
      };
    }),
    expenses: aggregates,
    corrections: (corrections.data ?? []).map(correctionRowToDto),
    actor: {
      memberId: actorRow ? String(actorRow.id) : null,
      role: actorRole,
      capabilities: capabilities(actorRole, actorStatus),
    },
    cursor: lastSequence ? encodeCursor(lastSequence) : null,
    serverTime: now,
  };
}

async function readLedgerChanges(
  service: SupabaseClient,
  tripId: string,
  cursor: string | null,
): Promise<LedgerChangesResponse> {
  const after = decodeCursor(cursor);
  const result = await service
    .from("ledger_changes")
    .select("sequence, entity_type, entity_id, revision, is_tombstone")
    .eq("journey_id", tripId)
    .gt("sequence", after)
    .order("sequence", { ascending: true })
    .limit(100);

  if (result.error) throw new Error("Supabase Dev Ledger changes failed.");

  const rows = result.data ?? [];
  const expenseIds = rows
    .filter((row) => row.entity_type === "EXPENSE" && !row.is_tombstone)
    .map((row) => String(row.entity_id));
  const householdIds = rows
    .filter((row) => row.entity_type === "HOUSEHOLD" && !row.is_tombstone)
    .map((row) => String(row.entity_id));
  const correctionIds = rows
    .filter((row) => row.entity_type === "CORRECTION")
    .map((row) => String(row.entity_id));
  const expenses =
    expenseIds.length > 0
      ? await service
          .from("expenses")
          .select(
            "id, journey_id, creator_member_id, payer_member_id, title, description, category, occurred_at, original_amount_minor, original_currency, original_currency_scale, business_status, revision, deleted_at, created_at, updated_at",
          )
          .in("id", expenseIds)
      : { data: [], error: null };
  const households =
    householdIds.length > 0
      ? await service
          .from("households")
          .select("id, name, display_order, updated_at")
          .in("id", householdIds)
      : { data: [], error: null };
  const householdMembers =
    householdIds.length > 0
      ? await service
          .from("household_members")
          .select("household_id, member_id")
          .in("household_id", householdIds)
      : { data: [], error: null };
  const corrections =
    correctionIds.length > 0
      ? await service
          .from("expense_correction_requests")
          .select("*")
          .in("id", correctionIds)
      : { data: [], error: null };

  if (expenses.error) throw new Error("Supabase Dev Ledger change aggregate failed.");
  if (households.error || householdMembers.error || corrections.error) {
    throw new Error("Supabase Dev Ledger household aggregate failed.");
  }
  const aggregates = await readExpenseAggregates(service, expenses.data ?? []);
  const byId = new Map<string, LedgerChangesResponse["changes"][number]["aggregate"]>(
    aggregates.map((expense) => [expense.id, expense]),
  );
  for (const row of households.data ?? []) {
    byId.set(String(row.id), {
      id: String(row.id),
      name: String(row.name),
      displayOrder: Number(row.display_order),
      updatedAt: String(row.updated_at),
      memberIds: (householdMembers.data ?? [])
        .filter((item) => String(item.household_id) === String(row.id))
        .map((item) => String(item.member_id)),
    });
  }
  for (const row of corrections.data ?? []) {
    byId.set(String(row.id), correctionRowToDto(row));
  }

  return {
    changes: rows.map((row) => ({
      entityType:
        row.entity_type === "EXPENSE"
          ? "EXPENSE"
          : row.entity_type === "CORRECTION"
            ? "CORRECTION"
            : "HOUSEHOLD",
      entityId: String(row.entity_id),
      revision: Number(row.revision),
      isTombstone: Boolean(row.is_tombstone),
      aggregate: byId.get(String(row.entity_id)) ?? null,
    })),
    cursor: rows.length ? encodeCursor(Number(rows[rows.length - 1].sequence)) : cursor,
    serverTime: new Date().toISOString(),
  };
}

async function readExpenseAggregates(
  service: SupabaseClient,
  rows: Record<string, unknown>[],
): Promise<LedgerBootstrapResponse["expenses"]> {
  const ids = rows.map((row) => String(row.id));
  if (ids.length === 0) return [];

  const [participants, splits, valuations, payments, audits] = await Promise.all([
    service
      .from("expense_participants")
      .select(
        "expense_id, member_id, display_name_snapshot, household_id_snapshot, display_order",
      )
      .in("expense_id", ids),
    service
      .from("expense_splits")
      .select(
        "expense_id, member_id, split_method, original_amount_minor, settlement_amount_minor, weight_units, percentage_units, rounding_adjustment_minor",
      )
      .in("expense_id", ids),
    service
      .from("settlement_valuation_snapshots")
      .select(
        "id, expense_id, policy, original_amount_minor, original_currency, original_scale, settlement_amount_minor, settlement_currency, settlement_scale, rate_snapshot_id, payment_record_id, reason",
      )
      .eq("is_active", true)
      .in("expense_id", ids),
    service
      .from("payment_records")
      .select(
        "id, expense_id, instrument_label, authorization_amount_minor, authorization_currency, authorization_scale, posted_amount_minor, posted_currency, posted_scale, posted_at, fee_amount_minor, fee_currency, fee_scale, supersedes_payment_record_id",
      )
      .in("expense_id", ids),
    service
      .from("expense_audit_events")
      .select(
        "id, expense_id, expense_revision, event_type, actor_user_id, actor_member_id, reason, changed_groups, created_at",
      )
      .in("expense_id", ids)
      .order("expense_revision", { ascending: true }),
  ]);

  if (
    participants.error ||
    splits.error ||
    valuations.error ||
    payments.error ||
    audits.error
  ) {
    throw new Error("Supabase Dev Ledger aggregate read failed.");
  }

  return rows.map((row) => {
    const id = String(row.id);
    const valuation = (valuations.data ?? []).find(
      (item) => String(item.expense_id) === id,
    );
    return {
      id,
      journeyId: String(row.journey_id),
      creatorMemberId: row.creator_member_id ? String(row.creator_member_id) : null,
      payerMemberId: String(row.payer_member_id),
      title: String(row.title),
      description: row.description ? String(row.description) : null,
      category: String(row.category),
      occurredAt: String(row.occurred_at),
      original: {
        minor: Number(row.original_amount_minor),
        currency: String(row.original_currency),
        scale: Number(row.original_currency_scale),
      },
      businessStatus: row.business_status as
        "DRAFT" | "ACCEPTED" | "RATE_REQUIRED" | "DELETED",
      revision: Number(row.revision),
      deletedAt: row.deleted_at ? String(row.deleted_at) : null,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
      participants: (participants.data ?? [])
        .filter((item) => String(item.expense_id) === id)
        .sort((a, b) => Number(a.display_order) - Number(b.display_order))
        .map((item) => ({
          memberId: String(item.member_id),
          displayNameSnapshot: String(item.display_name_snapshot),
          householdIdSnapshot: item.household_id_snapshot
            ? String(item.household_id_snapshot)
            : null,
        })),
      splits: (splits.data ?? [])
        .filter((item) => String(item.expense_id) === id)
        .map((item) => ({
          memberId: String(item.member_id),
          method: item.split_method as "EQUAL_PERSON",
          originalMinor: Number(item.original_amount_minor),
          settlementMinor:
            item.settlement_amount_minor === null
              ? null
              : Number(item.settlement_amount_minor),
          weightUnits: item.weight_units === null ? null : Number(item.weight_units),
          percentageUnits:
            item.percentage_units === null ? null : Number(item.percentage_units),
          roundingAdjustmentMinor: Number(item.rounding_adjustment_minor),
        })),
      valuation: valuation
        ? {
            id: String(valuation.id),
            policy: valuation.policy as "REFERENCE_RATE",
            original: {
              minor: Number(valuation.original_amount_minor),
              currency: String(valuation.original_currency),
              scale: Number(valuation.original_scale),
            },
            settlement: {
              minor: Number(valuation.settlement_amount_minor),
              currency: String(valuation.settlement_currency),
              scale: Number(valuation.settlement_scale),
            },
            rateSnapshotId: valuation.rate_snapshot_id
              ? String(valuation.rate_snapshot_id)
              : null,
            paymentRecordId: valuation.payment_record_id
              ? String(valuation.payment_record_id)
              : null,
            reason: valuation.reason ? String(valuation.reason) : null,
          }
        : null,
      paymentRecords: (payments.data ?? [])
        .filter((item) => String(item.expense_id) === id)
        .map((item) => ({
          id: String(item.id),
          instrumentLabel: item.instrument_label ? String(item.instrument_label) : null,
          authorization: moneyOrNull(item, "authorization"),
          posted: moneyOrNull(item, "posted"),
          postedAt: item.posted_at ? String(item.posted_at) : null,
          fee: moneyOrNull(item, "fee"),
          supersedesPaymentRecordId: item.supersedes_payment_record_id
            ? String(item.supersedes_payment_record_id)
            : null,
        })),
      auditEvents: (audits.data ?? [])
        .filter((item) => String(item.expense_id) === id)
        .map((item) => ({
          id: String(item.id),
          expenseId: id,
          actorUserId: item.actor_user_id ? String(item.actor_user_id) : null,
          actorMemberId: item.actor_member_id ? String(item.actor_member_id) : null,
          eventType: String(item.event_type),
          reason: item.reason ? String(item.reason) : null,
          changedGroups: Array.isArray(item.changed_groups)
            ? item.changed_groups.map(String)
            : [],
          revision: Number(item.expense_revision),
          createdAt: String(item.created_at),
        })),
    };
  });
}

function moneyOrNull(row: Record<string, unknown>, prefix: string) {
  const minor = row[`${prefix}_amount_minor`];
  const currency = row[`${prefix}_currency`];
  const scale = row[`${prefix}_scale`];
  return minor === null || currency === null || scale === null
    ? null
    : { minor: Number(minor), currency: String(currency), scale: Number(scale) };
}

async function latestLedgerSequence(service: SupabaseClient, tripId: string) {
  const result = await service
    .from("ledger_changes")
    .select("sequence")
    .eq("journey_id", tripId)
    .order("sequence", { ascending: false })
    .limit(1);
  if (result.error) throw new Error("Supabase Dev Ledger cursor failed.");
  return result.data[0] ? Number(result.data[0].sequence) : 0;
}

async function readMyLedger(
  service: SupabaseClient,
  userId: string,
): Promise<MyLedgerResponse> {
  const memberResult = await service
    .from("journey_members")
    .select("id, trip_id")
    .eq("user_id", userId)
    .eq("status", "linked");
  if (memberResult.error) throw new Error("Supabase Dev My Ledger member read failed.");

  const members = memberResult.data ?? [];
  const tripIds = [...new Set(members.map((member) => String(member.trip_id)))];
  if (tripIds.length === 0) {
    return {
      reportingCurrency: "NZD",
      journeys: [],
      serverTime: new Date().toISOString(),
    };
  }

  const [trips, settings] = await Promise.all([
    service.from("trips").select("id, name").in("id", tripIds),
    service
      .from("ledger_settings")
      .select("journey_id, settlement_currency")
      .in("journey_id", tripIds),
  ]);
  if (trips.error || settings.error)
    throw new Error("Supabase Dev My Ledger read failed.");

  const summaries = [];
  for (const member of members) {
    const journeyId = String(member.trip_id);
    const memberId = String(member.id);
    const expenseResult = await service
      .from("expenses")
      .select("id, payer_member_id, original_amount_minor, updated_at")
      .eq("journey_id", journeyId)
      .neq("business_status", "DELETED");
    if (expenseResult.error) throw new Error("Supabase Dev My Ledger expenses failed.");

    const expenses = expenseResult.data ?? [];
    const expenseIds = expenses.map((expense) => String(expense.id));
    const splitResult =
      expenseIds.length > 0
        ? await service
            .from("expense_splits")
            .select("expense_id, settlement_amount_minor, original_amount_minor")
            .eq("member_id", memberId)
            .in("expense_id", expenseIds)
        : { data: [], error: null };
    if (splitResult.error) throw new Error("Supabase Dev My Ledger splits failed.");

    const paidMinor = expenses
      .filter((expense) => String(expense.payer_member_id) === memberId)
      .reduce((sum, expense) => sum + Number(expense.original_amount_minor), 0);
    const owedMinor = (splitResult.data ?? []).reduce(
      (sum, split) =>
        sum + Number(split.settlement_amount_minor ?? split.original_amount_minor),
      0,
    );
    const trip = (trips.data ?? []).find((item) => String(item.id) === journeyId);
    const setting = (settings.data ?? []).find(
      (item) => String(item.journey_id) === journeyId,
    );
    const netMinor = paidMinor - owedMinor;
    summaries.push({
      journeyId,
      title: String(trip?.name ?? "Journey"),
      currency: String(setting?.settlement_currency ?? "NZD"),
      paidMinor,
      owedMinor,
      receivableMinor: Math.max(netMinor, 0),
      netMinor,
      updatedAt: String(expenses[0]?.updated_at ?? new Date().toISOString()),
    });
  }

  return {
    reportingCurrency: "NZD",
    journeys: summaries,
    serverTime: new Date().toISOString(),
  };
}
