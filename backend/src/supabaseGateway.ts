import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createHash, randomUUID } from "node:crypto";

import { BackendError, type DevBackendGateway, type StoredCreate } from "./app";
import type {
  CreateLedgerCorrectionRequest,
  CreateLedgerExpenseRequest,
  CreateLedgerPaymentRecordRequest,
  ApplyLedgerValuationRequest,
  LedgerCorrectionActionRequest,
  LedgerCorrectionMutationResponse,
  LedgerExpenseMutationResponse,
  LifecycleLedgerExpenseRequest,
  ResolveLedgerExpenseConflictRequest,
  UpdateLedgerExpenseRequest,
} from "../../src/data/api/ledgerMutationContracts";
import type {
  LedgerAnalysisResponse,
  LedgerBootstrapResponse,
  LedgerChangesResponse,
  LedgerExpenseListResponse,
  LedgerExpenseDto,
  LedgerPaymentRecordDto,
  LedgerRateQuoteDto,
  MyLedgerPeriod,
  MyLedgerResponse,
} from "../../src/data/api/ledgerReadContracts";
import type {
  CorrectSettlementPaymentRequest,
  FinalizedSettlementDto,
  RecordSettlementPaymentRequest,
  SettlementAdjustmentFinalizeRequest,
  SettlementAdjustmentMutationResponse,
  SettlementAdjustmentPreviewResponse,
  SettlementFinalizeResponse,
  SettlementPaymentActionRequest,
  SettlementPaymentMutationResponse,
  SettlementPreviewResponse,
} from "../../src/data/api/ledgerSettlementContracts";
import {
  analyzeReporting,
  matchesReportingFilters,
  summarizeReporting,
  type ReportingFilters,
  type ReportingRecord,
} from "../../src/domain/ledger/reporting";
import {
  changedExpenseGroups,
  sameStage4Expense,
  type Stage4EditableExpense,
} from "../../src/domain/ledger/conflict";
import { allocateSettlementFromOriginal } from "../../src/domain/ledger/allocation";
import {
  buildOutstandingBalanceVector,
  buildSettlementAdjustmentVectors,
  buildSettlementPreview,
  canonicalAdjustmentInputJson,
  canonicalSettlementJson,
  type SettlementInputSnapshot,
  type SettlementPreviewInput,
} from "../../src/domain/ledger/settlement";
import { previewValuation } from "../../src/domain/ledger/valuation";
import { deriveTransferPaymentState } from "../../src/domain/ledger/paymentLifecycle";
import { reviewExpensesV2 } from "../../src/domain/ledger/reviewV2";
import {
  assertValidExpenseAggregate,
  LedgerValidationError,
  validateExpenseAggregate,
} from "../../src/domain/ledger/validation";
import type {
  CompleteReceiptRequest,
  CreateReceiptRequest,
  ReceiptDto,
} from "../../src/data/api/ledgerReceiptContracts";
import type {
  LedgerReviewActionDto,
  LedgerReviewFindingDto,
} from "../../src/data/api/ledgerReviewContracts";
import {
  createReceiptOcrProvider,
  extractReceiptSuggestion,
  type ReceiptOcrProvider,
} from "./receiptOcrProvider";

const approvedDevProjectRef = "tuqigdxrvrerfewsxqgm";

export type SupabaseDevConfig = {
  url: string;
  publishableKey: string;
  secretKey: string;
  receiptOcrProvider?: ReceiptOcrProvider;
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

const ledgerCursorVersion = 1;

export function encodeLedgerCursor(sequence: number, tripId: string, userId: string) {
  return Buffer.from(
    JSON.stringify({ version: ledgerCursorVersion, sequence, tripId, userId }),
  ).toString("base64url");
}

export function decodeLedgerCursor(
  cursor: string | null,
  tripId: string,
  userId: string,
) {
  if (!cursor) return 0;
  try {
    const decoded = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as {
      version?: unknown;
      sequence?: unknown;
      tripId?: unknown;
      userId?: unknown;
    };
    if (
      decoded.version !== ledgerCursorVersion ||
      !Number.isSafeInteger(decoded.sequence) ||
      Number(decoded.sequence) < 0 ||
      decoded.tripId !== tripId ||
      decoded.userId !== userId
    )
      throw new Error();
    return Number(decoded.sequence);
  } catch {
    throw new BackendError(400, "INVALID_CURSOR", "The Ledger cursor is invalid.");
  }
}

export function assertLedgerCursorContinuation(sequence: number, latest: number) {
  if (sequence > latest)
    throw new BackendError(
      400,
      "INVALID_CURSOR",
      "The Ledger cursor continuation is invalid.",
    );
}

function encodePageCursor(sequence: number) {
  return Buffer.from(JSON.stringify({ sequence })).toString("base64url");
}

function stableReviewId(value: string) {
  const hash = createHash("sha256").update(value).digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

function hashPayload(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function reviewFindingRowToDto(row: Record<string, unknown>): LedgerReviewFindingDto {
  return {
    id: String(row.id),
    journeyId: String(row.journey_id),
    expenseId: row.expense_id ? String(row.expense_id) : null,
    settlementId: row.settlement_id ? String(row.settlement_id) : null,
    layer: row.layer as LedgerReviewFindingDto["layer"],
    findingType: String(row.finding_type),
    severity: row.severity as LedgerReviewFindingDto["severity"],
    confidence: row.confidence === null ? null : Number(row.confidence),
    evidenceCodes: (row.evidence_codes ?? []) as string[],
    status: row.status as LedgerReviewFindingDto["status"],
    rulesetVersion: String(row.ruleset_version),
    entityRevision: row.entity_revision === null ? null : Number(row.entity_revision),
    revision: Number(row.revision),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    ruleId: row.rule_id ? String(row.rule_id) : null,
    ruleVersion: row.rule_version == null ? null : Number(row.rule_version),
    ruleCategory: row.rule_category ? String(row.rule_category) : null,
    ruleInputFingerprint: row.rule_input_fingerprint
      ? String(row.rule_input_fingerprint)
      : null,
    comparisonFingerprint: row.comparison_fingerprint
      ? String(row.comparison_fingerprint)
      : null,
    observationContext: (row.observation_context ?? null) as Record<
      string,
      unknown
    > | null,
    lifecycle: (row.lifecycle ?? null) as LedgerReviewFindingDto["lifecycle"],
    observationGeneration:
      row.observation_generation == null ? null : Number(row.observation_generation),
    resolvedAt: row.resolved_at ? String(row.resolved_at) : null,
    resolutionReason: row.resolution_reason ? String(row.resolution_reason) : null,
    supersededAt: row.superseded_at ? String(row.superseded_at) : null,
    supersededByFindingId: row.superseded_by_finding_id
      ? String(row.superseded_by_finding_id)
      : null,
    personalDecision: (row.personal_decision ??
      "NEEDS_REVIEW") as LedgerReviewFindingDto["personalDecision"],
    decisionRevision: Number(row.decision_revision ?? 0),
    lastActionId: row.last_action_id ? String(row.last_action_id) : null,
    decisionActedAt: row.decision_acted_at ? String(row.decision_acted_at) : null,
  };
}

function reviewActionRowToDto(row: Record<string, unknown>): LedgerReviewActionDto {
  return {
    id: String(row.id),
    findingId: String(row.finding_id),
    action: row.action as LedgerReviewActionDto["action"],
    actorUserId: String(row.actor_user_id),
    actorMemberId: String(row.actor_member_id),
    actorRole: String(row.actor_role),
    reason: row.reason == null ? null : String(row.reason),
    findingRevision: Number(row.finding_revision),
    entityRevision: row.entity_revision === null ? null : Number(row.entity_revision),
    rulesetVersion: String(row.ruleset_version),
    operationId: String(row.operation_id),
    createdAt: String(row.created_at),
  };
}

async function readLedgerReviewData(
  service: SupabaseClient,
  tripId: string,
  userId: string,
) {
  const result = await service.rpc("read_ledger_review_projection_v2", {
    p_user_id: userId,
    p_journey_id: tripId,
  });
  if (result.error) {
    if (result.error.message.includes("REVIEW_READ_FORBIDDEN"))
      throw new BackendError(
        403,
        "REVIEW_READ_FORBIDDEN",
        "Review read is not authorized.",
      );
    throw new Error("Supabase Dev Ledger Review read failed.");
  }
  const { findings, actions } = result.data as {
    findings: Record<string, unknown>[];
    actions: Record<string, unknown>[];
  };
  return {
    findings: findings.map(reviewFindingRowToDto),
    actions: actions.map(reviewActionRowToDto),
  };
}

async function evaluateLedgerReviewV2(service: SupabaseClient, tripId: string) {
  const expenseRows = await service
    .from("expenses")
    .select(
      "id, journey_id, creator_member_id, payer_member_id, title, description, category, occurred_at, economic_date, original_amount_minor, original_currency, original_currency_scale, business_status, settlement_participation, revision, deleted_at, created_at, updated_at",
    )
    .eq("journey_id", tripId);
  if (expenseRows.error) throw new Error("Supabase Dev Review expense read failed.");
  const expenses = await readExpenseAggregates(service, expenseRows.data ?? []);
  const evaluatedAt = new Date().toISOString();
  const observations = reviewExpensesV2(
    expenses.map((expense) => ({ ...expense, status: expense.businessStatus })),
  ).map((observation) => {
    const comparisonFingerprint = observation.comparison
      ? hashPayload(observation.comparison)
      : null;
    const inputFingerprint = hashPayload([observation.input, observation.comparison]);
    return {
      ...observation,
      inputFingerprint,
      comparisonFingerprint,
      context: {
        ...observation.context,
        evaluatedAt,
        ruleInputFingerprint: inputFingerprint,
        comparisonFingerprint,
      },
    };
  });
  const revisions = Object.fromEntries(
    (expenseRows.data ?? []).map((row) => [String(row.id), Number(row.revision)]),
  );
  const result = await service.rpc("reconcile_ledger_review_v2", {
    p_journey_id: tripId,
    p_observations: observations,
    p_expense_revisions: revisions,
  });
  if (result.error)
    throw new Error(
      `Supabase Dev Review v2 reconciliation failed: ${result.error.message}`,
    );
}

async function tryEvaluateLedgerReviewV2(service: SupabaseClient, tripId: string) {
  // The Expense RPC has already committed. Review failure is repaired by the next refresh.
  try {
    await evaluateLedgerReviewV2(service, tripId);
  } catch {
    /* best-effort projection */
  }
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
    canAddOwnPaymentEvidence: linked && (organizer || role === "group_member"),
    canManageExpenseValuation: linked && (organizer || role === "group_member"),
    canManageLedgerValuationPolicy: linked && organizer,
    canPrepareSettlement: linked && organizer,
    canFinalizeSettlement: linked && organizer,
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
  const receiptOcrProvider = config.receiptOcrProvider ?? createReceiptOcrProvider();

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

    async canFinalizeSettlement(userId, tripId) {
      const result = await service
        .from("journey_members")
        .select("id")
        .eq("trip_id", tripId)
        .eq("user_id", userId)
        .eq("status", "linked")
        .eq("role", "owner")
        .limit(1);
      if (result.error) throw new Error("Supabase Dev settlement authorization failed.");
      return result.data.length > 0;
    },

    async readLedgerReview(userId, tripId) {
      return readLedgerReviewData(service, tripId, userId);
    },

    async refreshLedgerReview(userId, tripId) {
      await evaluateLedgerReviewV2(service, tripId);
      const expenseRows = await service
        .from("expenses")
        .select(
          "id, journey_id, creator_member_id, payer_member_id, title, description, category, occurred_at, economic_date, original_amount_minor, original_currency, original_currency_scale, business_status, settlement_participation, revision, deleted_at, created_at, updated_at",
        )
        .eq("journey_id", tripId);
      if (expenseRows.error) throw new Error("Supabase Dev Review expense read failed.");
      const expenses = await readExpenseAggregates(service, expenseRows.data ?? []);
      const memberRows = await service
        .from("journey_members")
        .select("id")
        .eq("trip_id", tripId);
      if (memberRows.error) throw new Error("Supabase Dev Review member read failed.");
      const memberIds = new Set((memberRows.data ?? []).map((row) => String(row.id)));
      const observations = expenses.flatMap((expense) =>
        validateExpenseAggregate(
          { ...expense, status: expense.businessStatus },
          memberIds,
        ).map((issue) => ({
          expenseId: expense.id,
          entityRevision: expense.revision,
          rulesetVersion: "ledger-validation-v1",
          findingType: issue.code,
          severity: "BLOCKING" as const,
          confidence: null,
          evidenceCodes: [issue.code, `FIELD:${issue.field}`],
          layer: "DETERMINISTIC" as const,
        })),
      );
      const current = await service
        .from("ledger_review_findings")
        .select(
          "id, expense_id, entity_revision, ruleset_version, finding_type, layer, evidence_codes, status",
        )
        .eq("journey_id", tripId)
        .eq("layer", "DETERMINISTIC")
        .neq("status", "STALE");
      if (current.error) throw new Error("Supabase Dev Review state read failed.");
      const activeKeys = new Set(
        observations.map(
          (item) =>
            `${item.layer}:${item.expenseId}:${item.entityRevision}:${item.rulesetVersion}:${item.findingType}:${item.evidenceCodes.join(",")}`,
        ),
      );
      const staleIds = (current.data ?? [])
        .filter(
          (row) =>
            !activeKeys.has(
              `${String(row.layer)}:${String(row.expense_id)}:${Number(row.entity_revision)}:${String(row.ruleset_version)}:${String(row.finding_type)}:${((row.evidence_codes ?? []) as string[]).join(",")}`,
            ),
        )
        .map((row) => String(row.id));
      if (staleIds.length) {
        const stale = await service
          .from("ledger_review_findings")
          .update({ status: "STALE" })
          .in("id", staleIds);
        if (stale.error) throw new Error("Supabase Dev Review stale update failed.");
      }
      if (observations.length) {
        const inserted = await service.from("ledger_review_findings").upsert(
          observations.map((item) => ({
            id: stableReviewId(
              `${tripId}:${item.layer}:${item.expenseId}:${item.entityRevision}:${item.rulesetVersion}:${item.findingType}:${item.evidenceCodes.join(",")}`,
            ),
            journey_id: tripId,
            expense_id: item.expenseId,
            layer: item.layer,
            finding_type: item.findingType,
            severity: item.severity,
            confidence: item.confidence,
            evidence_codes: item.evidenceCodes,
            status: "OPEN",
            ruleset_version: item.rulesetVersion,
            entity_revision: item.entityRevision,
          })),
          { onConflict: "id", ignoreDuplicates: true },
        );
        if (inserted.error) throw new Error("Supabase Dev Review generation failed.");
      }
      return readLedgerReviewData(service, tripId, userId);
    },

    async actOnLedgerReviewFinding(userId, tripId, findingId, idempotencyKey, input) {
      if (input.operationId !== idempotencyKey)
        throw new BackendError(
          409,
          "IDEMPOTENCY_CONFLICT",
          "Review operation identity differs.",
        );
      const result = await service.rpc("act_on_ledger_review_finding_v2", {
        p_actor_user_id: userId,
        p_journey_id: tripId,
        p_finding_id: findingId,
        p_action: input.action,
        p_base_revision: input.baseRevision,
        p_decision_revision: input.decisionRevision,
        p_reason: input.reason ?? null,
        p_operation_id: input.operationId,
      });
      if (result.error) {
        const message = result.error.message;
        if (message.includes("IDEMPOTENCY_CONFLICT"))
          throw new BackendError(
            409,
            "IDEMPOTENCY_CONFLICT",
            "The Review idempotency key conflicts.",
          );
        if (message.includes("REVIEW_ACTION_FORBIDDEN"))
          throw new BackendError(
            403,
            "REVIEW_ACTION_FORBIDDEN",
            "Review action is not authorized.",
          );
        if (message.includes("REVIEW_FINDING_STALE"))
          throw new BackendError(
            409,
            "REVIEW_FINDING_STALE",
            "Review finding revision is stale.",
          );
        if (message.includes("REVIEW_DECISION_STALE"))
          throw new BackendError(
            409,
            "REVIEW_DECISION_STALE",
            "Personal Review decision is stale.",
          );
        if (message.includes("DETERMINISTIC_REVIEW_ACTION_FORBIDDEN"))
          throw new BackendError(
            422,
            "DETERMINISTIC_REVIEW_ACTION_FORBIDDEN",
            "Deterministic validation cannot be bypassed.",
          );
        throw new BackendError(
          422,
          "INVALID_REVIEW_ACTION",
          "Review action was rejected.",
        );
      }
      const value = result.data as {
        finding: Record<string, unknown>;
        action: Record<string, unknown>;
        idempotentReplay: boolean;
        decision: Record<string, unknown>;
      };
      return {
        finding: reviewFindingRowToDto({
          ...value.finding,
          personal_decision: value.decision?.decision ?? "NEEDS_REVIEW",
          decision_revision: value.decision?.revision ?? 0,
          last_action_id: value.decision?.last_action_id ?? null,
          decision_acted_at: value.decision?.acted_at ?? null,
        }),
        action: reviewActionRowToDto(value.action),
        idempotentReplay: Boolean(value.idempotentReplay),
      };
    },

    async bootstrapLedger(userId, tripId) {
      return readLedgerBootstrap(service, tripId, userId);
    },

    async pullLedgerChanges(userId, tripId, cursor) {
      return readLedgerChanges(service, userId, tripId, cursor);
    },

    async readLedgerExpenses(userId, tripId, filters, limit, offset) {
      return readLedgerExpenses(service, userId, tripId, filters, limit, offset);
    },

    async readLedgerAnalysis(userId, tripId, filters, scope, dimension) {
      return readLedgerAnalysis(service, userId, tripId, filters, scope, dimension);
    },

    async readMyLedger(userId, period, from, to) {
      return readMyLedger(service, userId, period, from, to);
    },

    async readLedgerRateQuotes(_userId, tripId, quoteCurrency, baseCurrency) {
      return readRateQuotes(service, tripId, quoteCurrency, baseCurrency);
    },

    async previewLedgerSettlement(_userId, tripId, throughTimestamp) {
      return (await calculateSettlementPreview(service, tripId, throughTimestamp))
        .response;
    },

    async finalizeLedgerSettlement(userId, tripId, idempotencyKey, input) {
      return finalizeLedgerSettlement(service, userId, tripId, idempotencyKey, input);
    },

    async previewSettlementAdjustment(_userId, tripId, rootSettlementId) {
      return (
        await calculateSettlementAdjustmentPreview(service, tripId, rootSettlementId)
      ).response;
    },

    async finalizeSettlementAdjustment(
      userId,
      tripId,
      rootSettlementId,
      idempotencyKey,
      input,
    ) {
      return finalizeSettlementAdjustment(
        service,
        userId,
        tripId,
        rootSettlementId,
        idempotencyKey,
        input,
      );
    },

    async recordSettlementPayment(userId, tripId, transferId, idempotencyKey, input) {
      return recordSettlementPayment(
        service,
        userId,
        tripId,
        transferId,
        idempotencyKey,
        input,
      );
    },

    async actOnSettlementPayment(
      userId,
      tripId,
      paymentId,
      action,
      idempotencyKey,
      input,
    ) {
      return actOnSettlementPayment(
        service,
        userId,
        tripId,
        paymentId,
        action,
        idempotencyKey,
        input,
      );
    },

    async correctSettlementPayment(userId, tripId, paymentId, idempotencyKey, input) {
      return correctSettlementPayment(
        service,
        userId,
        tripId,
        paymentId,
        idempotencyKey,
        input,
      );
    },

    async createLedgerExpense(userId, tripId, idempotencyKey, input) {
      const result = await createLedgerExpenseAggregate(
        service,
        userId,
        tripId,
        idempotencyKey,
        input,
      );
      await tryEvaluateLedgerReviewV2(service, tripId);
      return result;
    },

    async updateLedgerExpense(userId, tripId, expenseId, idempotencyKey, input) {
      const result = await mutateLedgerExpenseAggregate(
        service,
        userId,
        tripId,
        expenseId,
        idempotencyKey,
        "UPDATE_EXPENSE",
        input,
      );
      await tryEvaluateLedgerReviewV2(service, tripId);
      return result;
    },

    async deleteLedgerExpense(userId, tripId, expenseId, idempotencyKey, input) {
      const result = await mutateLedgerExpenseAggregate(
        service,
        userId,
        tripId,
        expenseId,
        idempotencyKey,
        "DELETE_EXPENSE",
        input,
      );
      await tryEvaluateLedgerReviewV2(service, tripId);
      return result;
    },

    async restoreLedgerExpense(userId, tripId, expenseId, idempotencyKey, input) {
      const result = await mutateLedgerExpenseAggregate(
        service,
        userId,
        tripId,
        expenseId,
        idempotencyKey,
        "RESTORE_EXPENSE",
        input,
      );
      await tryEvaluateLedgerReviewV2(service, tripId);
      return result;
    },

    async resolveLedgerExpenseConflict(userId, tripId, expenseId, idempotencyKey, input) {
      const result = await resolveLedgerExpenseConflict(
        service,
        userId,
        tripId,
        expenseId,
        idempotencyKey,
        input,
      );
      await tryEvaluateLedgerReviewV2(service, tripId);
      return result;
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

    async addLedgerPaymentRecord(userId, tripId, expenseId, idempotencyKey, input) {
      const result = await addLedgerPaymentRecord(
        service,
        userId,
        tripId,
        expenseId,
        idempotencyKey,
        input,
      );
      await tryEvaluateLedgerReviewV2(service, tripId);
      return result;
    },

    async applyLedgerValuation(userId, tripId, expenseId, idempotencyKey, input) {
      const result = await applyLedgerValuation(
        service,
        userId,
        tripId,
        expenseId,
        idempotencyKey,
        input,
      );
      await tryEvaluateLedgerReviewV2(service, tripId);
      return result;
    },

    async createFinalizedSettlementGuardFixture(_userId, tripId, expenseId) {
      await createFinalizedSettlementGuardFixture(service, tripId, expenseId);
      return { ok: true };
    },

    createReceipt(userId, tripId, receiptId, input) {
      return createReceipt(service, userId, tripId, receiptId, input);
    },

    uploadReceiptContent(userId, tripId, receiptId, bytes, mimeType) {
      return uploadReceiptContent(service, userId, tripId, receiptId, bytes, mimeType);
    },
    async downloadReceiptContent(userId, tripId, receiptId) {
      const row = await readReceipt(service, userId, tripId, receiptId);
      if (row.upload_status !== "UPLOADED" || !row.object_path)
        throw new BackendError(
          409,
          "RECEIPT_NOT_DOWNLOADABLE",
          "Receipt content is not canonical.",
        );
      const result = await service.storage
        .from("ledger-receipts")
        .download(String(row.object_path));
      if (result.error) throw new Error("Supabase Dev receipt download failed.");
      return {
        bytes: new Uint8Array(await result.data.arrayBuffer()),
        mimeType: String(row.mime_type),
      };
    },

    completeReceipt(userId, tripId, receiptId, key, input) {
      return completeReceipt(service, userId, tripId, receiptId, key, input);
    },

    linkReceipt(userId, tripId, receiptId, key, expenseId) {
      return linkReceipt(service, userId, tripId, receiptId, key, expenseId);
    },

    ocrReceipt(userId, tripId, receiptId, key) {
      return ocrReceipt(service, receiptOcrProvider, userId, tripId, receiptId, key);
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

const receiptColumns =
  "id, journey_id, expense_id, local_id, created_by, object_path, mime_type, size_bytes, sha256, upload_status, ocr_status, ocr_suggestion, created_at, updated_at";

function receiptRowToDto(row: Record<string, unknown>): ReceiptDto {
  return {
    id: String(row.id),
    localId: String(row.local_id),
    journeyId: String(row.journey_id),
    expenseId: row.expense_id ? String(row.expense_id) : null,
    objectPath: String(row.object_path),
    mimeType: row.mime_type as ReceiptDto["mimeType"],
    sizeBytes: Number(row.size_bytes),
    sha256: String(row.sha256),
    uploadStatus: row.upload_status as ReceiptDto["uploadStatus"],
    ocrStatus: row.ocr_status as ReceiptDto["ocrStatus"],
    ocrSuggestion: row.ocr_suggestion as ReceiptDto["ocrSuggestion"],
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

async function readReceipt(
  service: SupabaseClient,
  userId: string,
  tripId: string,
  receiptId: string,
) {
  const result = await service
    .from("receipt_assets")
    .select(`${receiptColumns}, created_by, uploaded_size_bytes, uploaded_sha256`)
    .eq("id", receiptId)
    .eq("journey_id", tripId)
    .eq("created_by", userId)
    .maybeSingle();
  if (result.error) throw new Error("Supabase Dev receipt lookup failed.");
  if (!result.data)
    throw new BackendError(404, "ENTITY_NOT_FOUND", "The receipt does not exist.");
  return result.data as Record<string, unknown>;
}

async function createReceipt(
  service: SupabaseClient,
  userId: string,
  tripId: string,
  receiptId: string,
  input: CreateReceiptRequest,
) {
  let existing = await service
    .from("receipt_assets")
    .select(receiptColumns)
    .eq("id", receiptId)
    .maybeSingle();
  if (existing.error) throw new Error("Supabase Dev receipt lookup failed.");
  if (!existing.data) {
    existing = await service
      .from("receipt_assets")
      .select(receiptColumns)
      .eq("journey_id", tripId)
      .eq("created_by", userId)
      .eq("local_id", input.localId)
      .maybeSingle();
    if (existing.error) throw new Error("Supabase Dev receipt lookup failed.");
  }
  if (existing.data) {
    const row = existing.data as Record<string, unknown>;
    if (
      String(row.journey_id) !== tripId ||
      String(row.created_by) !== userId ||
      String(row.local_id) !== input.localId ||
      String(row.mime_type) !== input.mimeType ||
      Number(row.size_bytes) !== input.sizeBytes ||
      String(row.sha256) !== input.sha256
    )
      throw new BackendError(
        409,
        "IDEMPOTENCY_CONFLICT",
        "The receipt idempotency key conflicts.",
      );
    return { entity: receiptRowToDto(row), idempotentReplay: true };
  }
  const objectPath = `${tripId}/${receiptId}/original`;
  const inserted = await service
    .from("receipt_assets")
    .insert({
      id: receiptId,
      journey_id: tripId,
      local_id: input.localId,
      created_by: userId,
      object_path: objectPath,
      mime_type: input.mimeType,
      size_bytes: input.sizeBytes,
      sha256: input.sha256,
    })
    .select(receiptColumns)
    .single();
  if (inserted.error || !inserted.data)
    throw new Error("Supabase Dev receipt create failed.");
  return {
    entity: receiptRowToDto(inserted.data as Record<string, unknown>),
    idempotentReplay: false,
  };
}

async function uploadReceiptContent(
  service: SupabaseClient,
  userId: string,
  tripId: string,
  receiptId: string,
  bytes: Uint8Array,
  _mimeType: string,
) {
  const row = await readReceipt(service, userId, tripId, receiptId);
  const actual = createHash("sha256").update(bytes).digest("hex");
  if (bytes.byteLength !== Number(row.size_bytes) || actual !== row.sha256)
    throw new BackendError(
      422,
      "RECEIPT_CONTENT_MISMATCH",
      "Receipt content does not match its metadata.",
    );
  const uploaded = await service.storage
    .from("ledger-receipts")
    .upload(String(row.object_path), bytes, {
      contentType: String(row.mime_type),
      upsert: true,
    });
  if (uploaded.error) throw new Error("Supabase Dev receipt upload failed.");
  const updated = await service
    .from("receipt_assets")
    .update({ uploaded_size_bytes: bytes.byteLength, uploaded_sha256: actual })
    .eq("id", receiptId)
    .select(receiptColumns)
    .single();
  if (updated.error || !updated.data)
    throw new Error("Supabase Dev receipt upload record failed.");
  return {
    entity: receiptRowToDto(updated.data as Record<string, unknown>),
    idempotentReplay: false,
  };
}

async function completeReceipt(
  service: SupabaseClient,
  userId: string,
  tripId: string,
  receiptId: string,
  key: string,
  input: CompleteReceiptRequest,
) {
  const row = await readReceipt(service, userId, tripId, receiptId);
  if (
    input.objectPath !== row.object_path ||
    input.sizeBytes !== Number(row.size_bytes) ||
    input.sha256 !== row.sha256 ||
    Number(row.uploaded_size_bytes) !== input.sizeBytes ||
    row.uploaded_sha256 !== input.sha256
  )
    throw new BackendError(
      422,
      "RECEIPT_COMPLETION_MISMATCH",
      "Receipt completion validation failed.",
    );
  const replay = await receiptReplay(
    service,
    userId,
    tripId,
    "COMPLETE_RECEIPT",
    key,
    input,
  );
  if (replay) return replay;
  const updated = await service
    .from("receipt_assets")
    .update({ upload_status: "UPLOADED" })
    .eq("id", receiptId)
    .select(receiptColumns)
    .single();
  if (updated.error || !updated.data)
    throw new Error("Supabase Dev receipt completion failed.");
  return storeReceiptReplay(
    service,
    userId,
    tripId,
    "COMPLETE_RECEIPT",
    key,
    input,
    receiptRowToDto(updated.data as Record<string, unknown>),
  );
}

async function linkReceipt(
  service: SupabaseClient,
  userId: string,
  tripId: string,
  receiptId: string,
  key: string,
  expenseId: string,
) {
  const replay = await receiptReplay(service, userId, tripId, "LINK_RECEIPT", key, {
    expenseId,
  });
  if (replay) return replay;
  const receipt = await readReceipt(service, userId, tripId, receiptId);
  if (receipt.expense_id && receipt.expense_id !== expenseId)
    throw new BackendError(409, "RECEIPT_ALREADY_LINKED", "Receipt is already linked.");
  const expense = await service
    .from("expenses")
    .select("id")
    .eq("id", expenseId)
    .eq("journey_id", tripId)
    .maybeSingle();
  if (expense.error || !expense.data)
    throw new BackendError(404, "ENTITY_NOT_FOUND", "The Expense does not exist.");
  const updated = await service
    .from("receipt_assets")
    .update({ expense_id: expenseId })
    .eq("id", receiptId)
    .select(receiptColumns)
    .single();
  if (updated.error || !updated.data)
    throw new Error("Supabase Dev receipt link failed.");
  return storeReceiptReplay(
    service,
    userId,
    tripId,
    "LINK_RECEIPT",
    key,
    { expenseId },
    receiptRowToDto(updated.data as Record<string, unknown>),
  );
}

async function ocrReceipt(
  service: SupabaseClient,
  provider: ReceiptOcrProvider,
  userId: string,
  tripId: string,
  receiptId: string,
  key: string,
) {
  const replay = await receiptReplay(service, userId, tripId, "OCR_RECEIPT", key, {});
  if (replay) return replay;
  const row = await readReceipt(service, userId, tripId, receiptId);
  if (row.upload_status !== "UPLOADED")
    throw new BackendError(
      409,
      "RECEIPT_UPLOAD_PENDING",
      "Receipt upload must complete first.",
    );
  await service
    .from("receipt_assets")
    .update({ ocr_status: "RUNNING" })
    .eq("id", receiptId);
  try {
    const download = await service.storage
      .from("ledger-receipts")
      .download(String(row.object_path));
    if (download.error) throw download.error;
    const suggestion = await extractReceiptSuggestion(provider, {
      bytes: new Uint8Array(await download.data.arrayBuffer()),
      mimeType: String(row.mime_type),
    });
    const updated = await service
      .from("receipt_assets")
      .update({ ocr_status: "SUCCEEDED", ocr_suggestion: suggestion })
      .eq("id", receiptId)
      .select(receiptColumns)
      .single();
    if (updated.error || !updated.data)
      throw new Error("Supabase Dev OCR persistence failed.");
    return storeReceiptReplay(
      service,
      userId,
      tripId,
      "OCR_RECEIPT",
      key,
      {},
      receiptRowToDto(updated.data as Record<string, unknown>),
    );
  } catch (error) {
    await service
      .from("receipt_assets")
      .update({ ocr_status: "FAILED", ocr_suggestion: null })
      .eq("id", receiptId);
    throw error;
  }
}

async function receiptReplay(
  service: SupabaseClient,
  userId: string,
  tripId: string,
  command: string,
  key: string,
  payload: unknown,
) {
  const found = await service
    .from("ledger_idempotency_keys")
    .select("payload_hash, response_body")
    .eq("actor_user_id", userId)
    .eq("journey_id", tripId)
    .eq("command_type", command)
    .eq("idempotency_key", key)
    .maybeSingle();
  if (found.error) throw new Error("Supabase Dev idempotency lookup failed.");
  if (!found.data) return null;
  if (found.data.payload_hash !== hashPayload(payload))
    throw new BackendError(409, "IDEMPOTENCY_CONFLICT", "The idempotency key conflicts.");
  const response = found.data.response_body as { entity: ReceiptDto };
  return { ...response, idempotentReplay: true };
}

async function storeReceiptReplay(
  service: SupabaseClient,
  userId: string,
  tripId: string,
  command: string,
  key: string,
  payload: unknown,
  entity: ReceiptDto,
) {
  const response = { entity, idempotentReplay: false };
  const inserted = await service.from("ledger_idempotency_keys").insert({
    actor_user_id: userId,
    journey_id: tripId,
    command_type: command,
    idempotency_key: key,
    payload_hash: hashPayload(payload),
    response_status: 200,
    response_body: response,
    completed_at: new Date().toISOString(),
  });
  if (inserted.error) throw new Error("Supabase Dev idempotency persistence failed.");
  return response;
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
    economicDate: input.economicDate ?? null,
    original: input.original,
    businessStatus: input.businessStatus,
    settlementParticipation: input.settlementParticipation ?? "INCLUDED",
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
  await validateCanonicalExpense(service, tripId, {
    ...entity,
    status: entity.businessStatus,
  });
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
  const edited =
    commandType === "UPDATE_EXPENSE" ? safeEconomicDateEdit(current, updateInput) : null;
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
          economicDate: edited!.economicDate ?? null,
          original: updateInput.original,
          businessStatus: edited!.businessStatus,
          settlementParticipation:
            updateInput.settlementParticipation ?? current.settlementParticipation,
          revision: nextRevision,
          deletedAt: null,
          createdAt: current.createdAt,
          updatedAt: now,
          participants: updateInput.participants,
          splits: edited!.splits,
          valuation: edited!.valuation
            ? { id: randomUUID(), ...edited!.valuation }
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
  await validateCanonicalExpense(service, tripId, {
    ...entity,
    status: entity.businessStatus,
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

async function validateCanonicalExpense(
  service: SupabaseClient,
  tripId: string,
  expense: Parameters<typeof assertValidExpenseAggregate>[0],
) {
  const members = await service
    .from("journey_members")
    .select("id")
    .eq("trip_id", tripId);
  if (members.error) throw new Error("Supabase Dev member validation failed.");
  try {
    assertValidExpenseAggregate(
      expense,
      new Set((members.data ?? []).map((member) => String(member.id))),
    );
  } catch (error) {
    if (error instanceof LedgerValidationError)
      throw new BackendError(422, error.code, error.message, {
        error: { issues: error.issues },
      });
    throw error;
  }
}

async function readRateQuotes(
  service: SupabaseClient,
  tripId: string,
  quoteCurrency: string | null = null,
  baseCurrency: string | null = null,
): Promise<LedgerRateQuoteDto[]> {
  let query = service
    .from("ledger_rate_quotes")
    .select(
      "id, journey_id, quote_currency, base_currency, decimal_rate, effective_date, observed_at, provider, provider_reference, expires_at",
    )
    .eq("journey_id", tripId)
    .order("observed_at", { ascending: false });
  if (quoteCurrency) query = query.eq("quote_currency", quoteCurrency);
  if (baseCurrency) query = query.eq("base_currency", baseCurrency);
  const result = await query;
  if (result.error) throw new Error("Supabase Dev rate quote read failed.");
  return (result.data ?? []).map(rateQuoteRowToDto);
}

function rateQuoteRowToDto(row: Record<string, unknown>): LedgerRateQuoteDto {
  return {
    id: String(row.id),
    journeyId: String(row.journey_id),
    quoteCurrency: String(row.quote_currency),
    baseCurrency: String(row.base_currency),
    decimalRate: String(row.decimal_rate),
    effectiveDate: String(row.effective_date),
    observedAt: String(row.observed_at),
    provider: String(row.provider),
    providerReference: row.provider_reference ? String(row.provider_reference) : null,
    expiresAt: String(row.expires_at),
  };
}

function paymentRowToDto(
  row: Record<string, unknown>,
  audit?: Record<string, unknown>,
): LedgerPaymentRecordDto {
  return {
    id: String(row.id),
    expenseId: row.expense_id ? String(row.expense_id) : undefined,
    expenseRevision:
      row.expense_revision === null || row.expense_revision === undefined
        ? undefined
        : Number(row.expense_revision),
    payerMemberId: row.payer_member_id ? String(row.payer_member_id) : undefined,
    instrumentLabel: row.instrument_label ? String(row.instrument_label) : null,
    authorization: moneyOrNull(row, "authorization"),
    posted: moneyOrNull(row, "posted"),
    authorizedAt: row.authorized_at ? String(row.authorized_at) : null,
    postedAt: row.posted_at ? String(row.posted_at) : null,
    fee: moneyOrNull(row, "fee"),
    bankFxRate: row.bank_fx_rate ? String(row.bank_fx_rate) : null,
    source: row.source ? String(row.source) : null,
    notes: row.notes ? String(row.notes) : null,
    supersedesPaymentRecordId: row.supersedes_payment_record_id
      ? String(row.supersedes_payment_record_id)
      : null,
    auditEvent: audit ? auditRowToDto(audit) : undefined,
  };
}

function auditRowToDto(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    expenseId: String(row.expense_id),
    actorUserId: row.actor_user_id ? String(row.actor_user_id) : null,
    actorMemberId: row.actor_member_id ? String(row.actor_member_id) : null,
    eventType: String(row.event_type),
    reason: row.reason ? String(row.reason) : null,
    changedGroups: Array.isArray(row.changed_groups)
      ? row.changed_groups.map(String)
      : [],
    revision: Number(row.expense_revision),
    createdAt: String(row.created_at),
  };
}

async function addLedgerPaymentRecord(
  service: SupabaseClient,
  userId: string,
  tripId: string,
  expenseId: string,
  idempotencyKey: string,
  input: CreateLedgerPaymentRecordRequest,
) {
  const current = await readOneExpenseAggregate(service, expenseId);
  if (!current || current.journeyId !== tripId)
    throw new BackendError(404, "ENTITY_NOT_FOUND", "The Ledger expense was not found.");
  const now = new Date().toISOString();
  const entity: LedgerPaymentRecordDto = {
    id: randomUUID(),
    expenseRevision: current.revision,
    payerMemberId: current.payerMemberId,
    instrumentLabel: input.instrumentLabel,
    authorization: input.authorization,
    posted: input.posted,
    authorizedAt: input.authorizedAt,
    postedAt: input.postedAt,
    fee: input.fee,
    bankFxRate: input.bankFxRate,
    source: input.source,
    notes: input.notes,
    supersedesPaymentRecordId: input.supersedesPaymentRecordId,
  };
  const response = {
    entity,
    serverId: entity.id,
    revision: 1 as const,
    updatedAt: now,
    idempotentReplay: false,
  };
  const result = await service.rpc("ledger_add_payment_record_5_1", {
    actor_user: userId,
    target_journey: tripId,
    target_expense: expenseId,
    idempotency_key_value: idempotencyKey,
    payload_hash_value: hashPayload(input),
    payment_value: input,
    response_body_value: response,
  });
  mapFinancialEvidenceError(result.error?.message);
  return result.data as typeof response;
}

async function applyLedgerValuation(
  service: SupabaseClient,
  userId: string,
  tripId: string,
  expenseId: string,
  idempotencyKey: string,
  input: ApplyLedgerValuationRequest,
): Promise<LedgerExpenseMutationResponse> {
  const current = await readOneExpenseAggregate(service, expenseId);
  if (!current || current.journeyId !== tripId)
    throw new BackendError(404, "ENTITY_NOT_FOUND", "The Ledger expense was not found.");
  const settingResult = await service
    .from("ledger_settings")
    .select("settlement_currency, settlement_scale")
    .eq("journey_id", tripId)
    .single();
  if (settingResult.error) throw new Error("Supabase Dev valuation settings failed.");
  const quote = input.rateQuoteId
    ? (await readRateQuotes(service, tripId)).find(
        (item) => item.id === input.rateQuoteId,
      )
    : undefined;
  const payment = input.paymentRecordId
    ? current.paymentRecords.find((item) => item.id === input.paymentRecordId)
    : undefined;
  let preview;
  try {
    preview = previewValuation({
      policy: input.policy,
      original: current.original,
      settlementCurrency: String(settingResult.data.settlement_currency),
      settlementScale: Number(settingResult.data.settlement_scale),
      rateQuote: quote,
      paymentRecord: payment,
      manualRate: input.manualRate ?? undefined,
      reason: input.reason ?? undefined,
    });
  } catch {
    throw new BackendError(400, "INVALID_PAYLOAD", "The valuation evidence is invalid.");
  }
  if (JSON.stringify(preview.settlement) !== JSON.stringify(input.previewSettlement))
    throw new BackendError(400, "INVALID_PAYLOAD", "The valuation preview is stale.");

  const now = new Date().toISOString();
  const nextRevision = current.revision + 1;
  const rateSnapshotId = input.policy === "ACTUAL_PAYER_COST" ? null : randomUUID();
  const valuation = {
    id: randomUUID(),
    policy: input.policy,
    original: current.original,
    settlement: preview.settlement,
    rateSnapshotId,
    paymentRecordId: preview.paymentRecordId,
    reason: preview.reason,
    decimalRate: preview.decimalRate,
    roundingMode: "HALF_UP" as const,
    effectiveAt: now,
    supersedesValuationId: current.valuation?.id ?? null,
  };
  const entity: LedgerExpenseDto = {
    ...current,
    businessStatus: "ACCEPTED",
    revision: nextRevision,
    splits: allocateSettlementFromOriginal(preview.settlement.minor, current.splits),
    valuation,
    updatedAt: now,
    auditEvents: current.auditEvents.concat({
      id: randomUUID(),
      expenseId,
      actorUserId: userId,
      actorMemberId: null,
      eventType: "VALUATION_APPLIED",
      reason: preview.reason,
      changedGroups: ["FINANCIAL_CORE"],
      revision: nextRevision,
      createdAt: now,
    }),
  };
  const response: LedgerExpenseMutationResponse = {
    entity,
    serverId: expenseId,
    revision: nextRevision,
    updatedAt: now,
    idempotentReplay: false,
  };
  const rateSnapshot = rateSnapshotId
    ? {
        id: rateSnapshotId,
        decimalRate: preview.decimalRate,
        effectiveDate: quote?.effectiveDate ?? now.slice(0, 10),
        observedAt: quote?.observedAt ?? now,
        provider:
          quote?.provider ??
          (input.policy === "SAME_CURRENCY" ? "same_currency" : "manual"),
        providerReference: quote?.providerReference ?? null,
        stalenessState:
          quote && Date.parse(quote.expiresAt) < Date.parse(now)
            ? "STALE_ACCEPTED"
            : "FRESH",
        supersedesRateSnapshotId: current.valuation?.rateSnapshotId ?? null,
      }
    : null;
  const result = await service.rpc("ledger_apply_valuation_5_1", {
    actor_user: userId,
    target_journey: tripId,
    target_expense: expenseId,
    idempotency_key_value: idempotencyKey,
    payload_hash_value: hashPayload(input),
    valuation_value: input,
    rate_snapshot_value: rateSnapshot,
    response_body_value: response,
  });
  if (result.error?.message.includes("REVISION_CONFLICT")) {
    const canonical = await readOneExpenseAggregate(service, expenseId);
    if (!canonical) throw new BackendError(404, "ENTITY_NOT_FOUND", "Expense missing.");
    const submitted = editableExpense(entity);
    const conflictBody = {
      error: {
        code: "REVISION_CONFLICT",
        conflictId: "00000000-0000-4000-8000-000000000000",
        expenseId,
        baseRevision: input.baseRevision,
        currentRevision: canonical.revision,
        submitted,
        current: canonical,
        changedGroups: changedExpenseGroups(submitted, editableExpense(canonical)),
        auditSummaries: canonical.auditEvents.filter(
          (event) => event.revision > input.baseRevision,
        ),
      },
    };
    const recorded = await service.rpc("ledger_record_conflict_4c", {
      actor_user: userId,
      target_journey: tripId,
      target_expense: expenseId,
      command_type_value: "APPLY_VALUATION",
      idempotency_key_value: idempotencyKey,
      payload_hash_value: hashPayload(input),
      conflict_body_value: conflictBody,
    });
    if (recorded.error)
      throw new Error("Supabase Dev valuation conflict persistence failed.");
    throw new BackendError(
      409,
      "REVISION_CONFLICT",
      "The base revision is stale.",
      recorded.data,
    );
  }
  mapFinancialEvidenceError(result.error?.message);
  return result.data as LedgerExpenseMutationResponse;
}

function mapFinancialEvidenceError(message?: string) {
  if (!message) return;
  if (message.includes("IDEMPOTENCY_CONFLICT"))
    throw new BackendError(409, "IDEMPOTENCY_CONFLICT", "The idempotency key conflicts.");
  if (message.includes("ENTITY_NOT_FOUND"))
    throw new BackendError(404, "ENTITY_NOT_FOUND", "The Ledger expense was not found.");
  if (message.includes("TRIP_WRITE_FORBIDDEN"))
    throw new BackendError(
      403,
      "TRIP_WRITE_FORBIDDEN",
      "The financial command is forbidden.",
    );
  if (message.includes("FINALIZED_SETTLEMENT_PROTECTED"))
    throw new BackendError(
      409,
      "SETTLEMENT_INPUT_STALE",
      "A finalized settlement protects this mutation.",
    );
  if (
    message.includes("INVALID_") ||
    message.includes("REASON_REQUIRED") ||
    message.includes("PREVIEW_MISMATCH")
  )
    throw new BackendError(400, "INVALID_PAYLOAD", "The financial evidence is invalid.");
  if (message.includes("RATE_REQUIRED"))
    throw new BackendError(409, "RATE_REQUIRED", "No trusted rate is available.");
  throw new Error("Supabase Dev financial evidence operation failed.");
}

export function safeEconomicDateEdit(
  current: LedgerExpenseDto,
  input: Stage4EditableExpense,
): Stage4EditableExpense {
  const economicDate = input.economicDate ?? null;
  const changed =
    economicDate !== (current.economicDate ?? null) ||
    input.occurredAt.slice(0, 10) !== current.occurredAt.slice(0, 10);
  if (!changed || input.valuation?.policy === "SAME_CURRENCY")
    return { ...input, economicDate };
  return {
    ...input,
    economicDate,
    businessStatus: input.businessStatus === "DRAFT" ? "DRAFT" : "RATE_REQUIRED",
    valuation: null,
    splits: input.splits.map((split) => ({ ...split, settlementMinor: null })),
  };
}

function editableExpense(expense: LedgerExpenseDto) {
  return {
    title: expense.title,
    description: expense.description,
    category: expense.category,
    occurredAt: expense.occurredAt,
    economicDate: expense.economicDate,
    payerMemberId: expense.payerMemberId,
    original: expense.original,
    businessStatus:
      expense.businessStatus === "DELETED"
        ? ("ACCEPTED" as const)
        : expense.businessStatus,
    settlementParticipation: expense.settlementParticipation,
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
  editable: Stage4EditableExpense,
  actorUserId: string,
  eventType: string,
  reason: string | null,
  changedGroups: string[],
  incrementRevision = true,
) {
  const revision = current.revision + (incrementRevision ? 1 : 0);
  const now = new Date().toISOString();
  const safeEditable = safeEconomicDateEdit(current, editable);
  const entity: LedgerExpenseDto = {
    ...current,
    ...safeEditable,
    settlementParticipation:
      editable.settlementParticipation ?? current.settlementParticipation,
    revision,
    deletedAt: null,
    updatedAt: incrementRevision ? now : current.updatedAt,
    valuation: safeEditable.valuation
      ? {
          id: incrementRevision ? randomUUID() : (current.valuation?.id ?? randomUUID()),
          ...safeEditable.valuation,
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
      "id, journey_id, creator_member_id, payer_member_id, title, description, category, occurred_at, economic_date, original_amount_minor, original_currency, original_currency_scale, business_status, settlement_participation, revision, deleted_at, created_at, updated_at",
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

async function calculateSettlementPreview(
  service: SupabaseClient,
  tripId: string,
  throughTimestamp: string,
) {
  const result = await service.rpc("ledger_settlement_source_7_1", {
    target_journey: tripId,
    through_timestamp_value: throughTimestamp,
  });
  if (result.error || !result.data)
    throw new Error("Supabase Dev settlement preview failed.");
  const source = normalizeSettlementSource(result.data as SettlementPreviewInput);
  const preview = buildSettlementPreview(source);
  const inputDigest = createHash("sha256")
    .update(canonicalSettlementJson(preview))
    .digest("hex");
  return {
    source,
    preview,
    response: { ...preview, inputDigest } satisfies SettlementPreviewResponse,
  };
}

export function normalizeSettlementSource(
  source: SettlementPreviewInput,
): SettlementPreviewInput {
  return {
    ...source,
    expenses: source.expenses.map((expense) => ({
      ...expense,
      valuation: expense.valuation
        ? {
            ...expense.valuation,
            decimalRate:
              expense.valuation.decimalRate === null
                ? null
                : String(expense.valuation.decimalRate),
          }
        : null,
    })),
  };
}

async function finalizeLedgerSettlement(
  service: SupabaseClient,
  userId: string,
  tripId: string,
  idempotencyKey: string,
  input: { throughTimestamp: string; inputDigest: string },
): Promise<SettlementFinalizeResponse> {
  const calculated = await calculateSettlementPreview(
    service,
    tripId,
    input.throughTimestamp,
  );
  if (calculated.response.state === "PREVIEW_BLOCKED") {
    throw new BackendError(
      409,
      "FINANCIAL_INVARIANT_FAILED",
      "Settlement blockers must be resolved before finalization.",
      { blockers: calculated.response.blockers },
    );
  }
  if (calculated.response.inputDigest !== input.inputDigest) {
    throw new BackendError(
      409,
      "SETTLEMENT_INPUT_STALE",
      "The settlement preview is stale.",
    );
  }

  const result = await service.rpc("ledger_finalize_settlement_7_1", {
    actor_user: userId,
    target_journey: tripId,
    through_timestamp_value: input.throughTimestamp,
    input_digest_value: input.inputDigest,
    expected_source_value: calculated.source,
    inputs_value: calculated.preview.inputs,
    balances_value: calculated.preview.balances,
    transfers_value: calculated.preview.transfers,
    idempotency_key_value: idempotencyKey,
    payload_hash_value: hashPayload(input),
  });
  const message = result.error?.message ?? "";
  if (message.includes("SETTLEMENT_INPUT_STALE"))
    throw new BackendError(
      409,
      "SETTLEMENT_INPUT_STALE",
      "The settlement preview is stale.",
    );
  if (message.includes("IDEMPOTENCY_CONFLICT"))
    throw new BackendError(409, "IDEMPOTENCY_CONFLICT", "The idempotency key conflicts.");
  if (message.includes("TRIP_WRITE_FORBIDDEN"))
    throw new BackendError(403, "TRIP_WRITE_FORBIDDEN", "Organizer access is required.");
  if (
    message.includes("settlements_one_active_7_1") ||
    message.includes("settlements_one_root_7_2b")
  )
    throw new BackendError(
      409,
      "SETTLEMENT_ALREADY_FINALIZED",
      "This Journey already has an active finalized Settlement.",
    );
  if (result.error || !result.data)
    throw new Error("Supabase Dev settlement finalization failed.");
  const finalized = result.data as {
    settlementId: string;
    idempotentReplay: boolean;
  };
  const entity = await readOneFinalizedSettlement(
    service,
    tripId,
    finalized.settlementId,
  );
  if (!entity) throw new Error("Canonical Settlement was not found after finalization.");
  return { entity, idempotentReplay: finalized.idempotentReplay };
}

const SETTLEMENT_ELIGIBILITY_VERSION = "ledger-settlement-eligibility-v1";

async function calculateSettlementAdjustmentPreview(
  service: SupabaseClient,
  tripId: string,
  rootSettlementId: string,
) {
  const root = await readOneFinalizedSettlement(service, tripId, rootSettlementId);
  if (!root || root.kind === "ADJUSTMENT") {
    throw new BackendError(404, "ENTITY_NOT_FOUND", "The root Settlement was not found.");
  }
  const sourceResult = await service.rpc("ledger_adjustment_source_7_2b", {
    target_root: rootSettlementId,
  });
  if (sourceResult.error || !sourceResult.data) {
    throw new Error("Supabase Dev Adjustment source failed.");
  }
  const source = normalizeSettlementSource(sourceResult.data as SettlementPreviewInput);
  const current = buildSettlementPreview(source);
  const adjustmentRows = await service
    .from("settlements")
    .select("id, input_digest, lineage_sequence")
    .eq("root_settlement_id", rootSettlementId)
    .eq("settlement_kind", "ADJUSTMENT")
    .order("lineage_sequence", { ascending: true });
  if (adjustmentRows.error) throw new Error("Supabase Dev Adjustment lineage failed.");
  const adjustmentIds = (adjustmentRows.data ?? []).map((row) => String(row.id));
  const deltaRows = adjustmentIds.length
    ? await service
        .from("settlement_adjustment_deltas")
        .select("settlement_id, member_id, display_name_snapshot, delta_minor")
        .in("settlement_id", adjustmentIds)
    : { data: [], error: null };
  if (deltaRows.error) throw new Error("Supabase Dev Adjustment delta read failed.");

  const priorDeltaVectors = (adjustmentRows.data ?? []).map((adjustment) =>
    (deltaRows.data ?? [])
      .filter((row) => String(row.settlement_id) === String(adjustment.id))
      .map((row) => ({
        memberId: String(row.member_id),
        displayNameSnapshot: String(row.display_name_snapshot),
        deltaMinor: Number(row.delta_minor),
      })),
  );
  const vectors = buildSettlementAdjustmentVectors({
    currency: root.settlementCurrency,
    scale: root.settlementScale,
    rootBalances: root.balances,
    priorDeltaVectors,
    currentBalances: current.balances,
  });
  const headRow = adjustmentRows.data?.at(-1) ?? null;
  const head = headRow
    ? await readOneFinalizedSettlement(service, tripId, String(headRow.id))
    : null;
  if (headRow && !head) throw new Error("Canonical Adjustment head is missing.");
  const priorInputs = head?.inputs ?? root.inputs;
  const digestValue = (inputs: SettlementInputSnapshot[]) =>
    createHash("sha256")
      .update(
        canonicalAdjustmentInputJson({
          rootSettlementId,
          journeyId: tripId,
          throughTimestamp: root.throughTimestamp,
          settlementCurrency: root.settlementCurrency,
          settlementScale: root.settlementScale,
          eligibilityVersion: root.eligibilityVersion ?? SETTLEMENT_ELIGIBILITY_VERSION,
          algorithmVersion: root.algorithmVersion,
          inputs,
        }),
      )
      .digest("hex");
  const priorInputDigest = head?.inputDigest ?? digestValue(root.inputs);
  const inputDigest = digestValue(current.inputs);
  const previousById = new Map(priorInputs.map((item) => [item.expenseId, item]));
  const currentById = new Map(current.inputs.map((item) => [item.expenseId, item]));
  const changedExpenses: SettlementAdjustmentPreviewResponse["changedExpenses"] = [
    ...new Set([...previousById.keys(), ...currentById.keys()]),
  ]
    .sort()
    .flatMap<SettlementAdjustmentPreviewResponse["changedExpenses"][number]>(
      (expenseId) => {
        const previous = previousById.get(expenseId);
        const next = currentById.get(expenseId);
        if (!previous) return [{ expenseId, change: "NEW" }];
        if (!next) return [{ expenseId, change: "DELETED" }];
        return digestValue([previous]) === digestValue([next])
          ? []
          : [{ expenseId, change: "CHANGED" }];
      },
    );
  const state = current.blockers.length
    ? "PREVIEW_BLOCKED"
    : inputDigest === priorInputDigest
      ? "PREVIEW_UNCHANGED"
      : "PREVIEW_READY";
  return {
    source,
    response: {
      state,
      rootSettlementId,
      expectedHeadId: head?.id ?? null,
      priorInputDigest,
      inputDigest,
      zeroTransfer: vectors.transfers.length === 0,
      inputs: current.inputs,
      balances: vectors.balances,
      transfers: vectors.transfers,
      blockers: current.blockers,
      exclusions: current.exclusions,
      changedExpenses,
    } satisfies SettlementAdjustmentPreviewResponse,
  };
}

async function finalizeSettlementAdjustment(
  service: SupabaseClient,
  userId: string,
  tripId: string,
  rootSettlementId: string,
  idempotencyKey: string,
  input: SettlementAdjustmentFinalizeRequest,
): Promise<SettlementAdjustmentMutationResponse> {
  const calculated = await calculateSettlementAdjustmentPreview(
    service,
    tripId,
    rootSettlementId,
  );
  const preview = calculated.response;
  const result = await service.rpc("ledger_finalize_adjustment_7_2b", {
    actor_user: userId,
    target_journey: tripId,
    target_root: rootSettlementId,
    expected_head: input.expectedHeadId,
    input_digest_value: input.inputDigest,
    computed_input_digest_value: preview.inputDigest,
    prior_input_digest_value: preview.priorInputDigest,
    expected_source_value: calculated.source,
    inputs_value: preview.inputs,
    deltas_value: preview.balances,
    transfers_value: preview.transfers,
    changed_expenses_value: preview.changedExpenses,
    reason_value: input.reason,
    allow_zero_transfer: input.allowZeroTransfer,
    blocked_value: preview.state === "PREVIEW_BLOCKED",
    idempotency_key_value: idempotencyKey,
    payload_hash_value: hashPayload(input),
  });
  const message = result.error?.message ?? "";
  if (message.includes("SETTLEMENT_INPUT_STALE"))
    throw new BackendError(
      409,
      "SETTLEMENT_INPUT_STALE",
      "The Adjustment preview is stale.",
    );
  if (message.includes("ADJUSTMENT_NOT_REQUIRED"))
    throw new BackendError(
      409,
      "ADJUSTMENT_NOT_REQUIRED",
      "The Settlement lineage already matches canonical financial input.",
    );
  if (message.includes("ZERO_TRANSFER_ACK_REQUIRED"))
    throw new BackendError(
      422,
      "INVALID_PAYLOAD",
      "A zero-transfer Adjustment requires explicit acknowledgement.",
    );
  if (message.includes("FINANCIAL_INVARIANT_FAILED"))
    throw new BackendError(
      409,
      "FINANCIAL_INVARIANT_FAILED",
      "Adjustment blockers must be resolved before finalization.",
      { blockers: preview.blockers },
    );
  if (message.includes("IDEMPOTENCY_CONFLICT"))
    throw new BackendError(409, "IDEMPOTENCY_CONFLICT", "The idempotency key conflicts.");
  if (message.includes("TRIP_WRITE_FORBIDDEN"))
    throw new BackendError(403, "TRIP_WRITE_FORBIDDEN", "Organizer access is required.");
  if (message.includes("REASON_REQUIRED"))
    throw new BackendError(422, "INVALID_PAYLOAD", "An Adjustment reason is required.");
  if (message.includes("ENTITY_NOT_FOUND"))
    throw new BackendError(404, "ENTITY_NOT_FOUND", "The root Settlement was not found.");
  if (result.error || !result.data)
    throw new Error("Supabase Dev Adjustment finalization failed.");
  const finalized = result.data as { settlementId: string; idempotentReplay: boolean };
  const entity = await readOneFinalizedSettlement(
    service,
    tripId,
    finalized.settlementId,
  );
  if (!entity) throw new Error("Canonical Adjustment was not found after finalization.");
  return { entity, idempotentReplay: finalized.idempotentReplay };
}

function throwSettlementPaymentError(message: string): never {
  const known: Record<string, [number, string]> = {
    IDEMPOTENCY_CONFLICT: [409, "The idempotency key conflicts."],
    PAYMENT_IDENTITY_CONFLICT: [409, "The Payment identity conflicts."],
    PAYMENT_REVISION_CONFLICT: [409, "The Payment or Transfer revision is stale."],
    PAYMENT_STATE_CONFLICT: [409, "The Payment is no longer awaiting confirmation."],
    TRANSFER_OVERPAYMENT: [409, "The Payment would exceed the Transfer obligation."],
    PAYMENT_ACTION_FORBIDDEN: [403, "This member cannot perform the Payment action."],
    PAYMENT_PROPOSITION_INVALID: [422, "The repayment proposition is invalid."],
    REPAYMENT_VALUATION_INVALID: [422, "The repayment valuation is invalid."],
    REASON_REQUIRED: [422, "A reason is required."],
    ENTITY_NOT_FOUND: [404, "The Payment or Transfer was not found."],
  };
  for (const [code, [status, text]] of Object.entries(known)) {
    if (message.includes(code)) throw new BackendError(status, code, text);
  }
  throw new Error("Supabase Dev Settlement Payment command failed.");
}

async function settlementForTransfer(
  service: SupabaseClient,
  tripId: string,
  transferId: string,
) {
  const result = await service
    .from("settlement_transfers")
    .select("settlement_id")
    .eq("journey_id", tripId)
    .eq("id", transferId)
    .maybeSingle();
  if (result.error || !result.data) throwSettlementPaymentError("ENTITY_NOT_FOUND");
  const entity = await readOneFinalizedSettlement(
    service,
    tripId,
    String(result.data.settlement_id),
  );
  if (!entity) throwSettlementPaymentError("ENTITY_NOT_FOUND");
  return entity;
}

async function transferForPayment(
  service: SupabaseClient,
  tripId: string,
  paymentId: string,
) {
  const result = await service
    .from("settlement_payments")
    .select("transfer_id")
    .eq("journey_id", tripId)
    .eq("id", paymentId)
    .maybeSingle();
  if (result.error || !result.data) throwSettlementPaymentError("ENTITY_NOT_FOUND");
  return String(result.data.transfer_id);
}

async function recordSettlementPayment(
  service: SupabaseClient,
  userId: string,
  tripId: string,
  transferId: string,
  idempotencyKey: string,
  input: RecordSettlementPaymentRequest,
): Promise<SettlementPaymentMutationResponse> {
  const result = await service.rpc("ledger_record_settlement_payment_7_2a", {
    actor_user: userId,
    target_journey: tripId,
    target_transfer: transferId,
    payment_value: input,
    idempotency_key_value: idempotencyKey,
    payload_hash_value: hashPayload(input),
    supersedes_payment_value: null,
  });
  if (result.error || !result.data)
    throwSettlementPaymentError(result.error?.message ?? "ENTITY_NOT_FOUND");
  const response = result.data as { paymentId: string; idempotentReplay: boolean };
  return {
    entity: await settlementForTransfer(service, tripId, transferId),
    paymentId: response.paymentId,
    idempotentReplay: response.idempotentReplay,
  };
}

async function actOnSettlementPayment(
  service: SupabaseClient,
  userId: string,
  tripId: string,
  paymentId: string,
  action: "confirm" | "reject" | "dispute",
  idempotencyKey: string,
  input: SettlementPaymentActionRequest,
): Promise<SettlementPaymentMutationResponse> {
  const result = await service.rpc("ledger_act_on_settlement_payment_7_2a", {
    actor_user: userId,
    target_journey: tripId,
    target_payment: paymentId,
    action_value: action,
    base_revision_value: input.basePaymentRevision,
    authority_value: input.authority ?? (action === "dispute" ? "PAYER" : "RECIPIENT"),
    reason_value: input.reason,
    idempotency_key_value: idempotencyKey,
    payload_hash_value: hashPayload(input),
  });
  if (result.error || !result.data)
    throwSettlementPaymentError(result.error?.message ?? "ENTITY_NOT_FOUND");
  const response = result.data as { paymentId: string; idempotentReplay: boolean };
  const transferId = await transferForPayment(service, tripId, paymentId);
  return {
    entity: await settlementForTransfer(service, tripId, transferId),
    paymentId: response.paymentId,
    idempotentReplay: response.idempotentReplay,
  };
}

async function correctSettlementPayment(
  service: SupabaseClient,
  userId: string,
  tripId: string,
  paymentId: string,
  idempotencyKey: string,
  input: CorrectSettlementPaymentRequest,
): Promise<SettlementPaymentMutationResponse> {
  const transferId = await transferForPayment(service, tripId, paymentId);
  const payment = {
    ...input,
    localId: input.replacementLocalId,
    reportingAuthority: "ORGANIZER_OVERRIDE" as const,
  };
  const result = await service.rpc("ledger_record_settlement_payment_7_2a", {
    actor_user: userId,
    target_journey: tripId,
    target_transfer: transferId,
    payment_value: payment,
    idempotency_key_value: idempotencyKey,
    payload_hash_value: hashPayload(input),
    supersedes_payment_value: paymentId,
  });
  if (result.error || !result.data)
    throwSettlementPaymentError(result.error?.message ?? "ENTITY_NOT_FOUND");
  const response = result.data as { paymentId: string; idempotentReplay: boolean };
  return {
    entity: await settlementForTransfer(service, tripId, transferId),
    paymentId: response.paymentId,
    idempotentReplay: response.idempotentReplay,
  };
}

async function readOneFinalizedSettlement(
  service: SupabaseClient,
  tripId: string,
  settlementId: string,
) {
  const settlements = await readFinalizedSettlements(service, tripId, [settlementId]);
  return settlements[0] ?? null;
}

async function readFinalizedSettlements(
  service: SupabaseClient,
  tripId: string,
  settlementIds?: string[],
): Promise<FinalizedSettlementDto[]> {
  if (settlementIds?.length === 0) return [];
  let settlementQuery = service
    .from("settlements")
    .select(
      "id, journey_id, settlement_kind, root_settlement_id, parent_adjustment_id, lineage_sequence, prior_input_digest, adjustment_reason, eligibility_version, status, through_timestamp, settlement_currency, settlement_scale, settings_revision, algorithm_version, input_digest, revision, finalized_by, finalized_at",
    )
    .eq("journey_id", tripId)
    .eq("algorithm_version", "ledger-settlement-greedy-v1")
    .order("finalized_at", { ascending: false });
  if (settlementIds) settlementQuery = settlementQuery.in("id", settlementIds);
  const settlements = await settlementQuery;
  if (settlements.error) throw new Error("Supabase Dev Settlement read failed.");
  const ids = (settlements.data ?? []).map((row) => String(row.id));
  if (!ids.length) return [];
  const [inputs, balances, transfers, audits, adjustmentDeltas] = await Promise.all([
    service
      .from("settlement_inputs")
      .select("settlement_id, normalized_snapshot")
      .in("settlement_id", ids),
    service
      .from("settlement_member_balances")
      .select(
        "settlement_id, member_id, display_name_snapshot, paid_minor, owed_minor, transferred_minor, net_minor",
      )
      .in("settlement_id", ids),
    service
      .from("settlement_transfers")
      .select(
        "id, settlement_id, from_member_id, to_member_id, obligation_amount_minor, settlement_currency, settlement_scale, status, revision",
      )
      .in("settlement_id", ids),
    service
      .from("settlement_audit_events")
      .select(
        "id, settlement_id, event_type, actor_user_id, actor_member_id, reason, settlement_revision, transfer_id, payment_id, discharge_id, authority, created_at",
      )
      .in("settlement_id", ids),
    service
      .from("settlement_adjustment_deltas")
      .select(
        "settlement_id, member_id, display_name_snapshot, delta_minor, settlement_currency, settlement_scale",
      )
      .in("settlement_id", ids),
  ]);
  if (
    inputs.error ||
    balances.error ||
    transfers.error ||
    audits.error ||
    adjustmentDeltas.error
  )
    throw new Error("Supabase Dev Settlement aggregate read failed.");

  const transferIds = (transfers.data ?? []).map((row) => String(row.id));
  const payments = transferIds.length
    ? await service
        .from("settlement_payments")
        .select(
          "id, transfer_id, status, payment_amount_minor, payment_currency, payment_scale, asserted_discharge_amount_minor, settlement_currency, settlement_scale, repayment_valuation_snapshot_id, fee_amount_minor, fee_currency, fee_scale, fee_borne_by, reported_by, reported_by_member_id, reporting_authority, reporting_reason, paid_at, evidence_asset_id, notes, supersedes_payment_id, revision, created_at",
        )
        .in("transfer_id", transferIds)
    : { data: [], error: null };
  if (payments.error) throw new Error("Supabase Dev Settlement Payment read failed.");
  const valuationIds = (payments.data ?? [])
    .map((row) => row.repayment_valuation_snapshot_id)
    .filter((id): id is string => Boolean(id));
  const paymentIds = (payments.data ?? []).map((row) => String(row.id));
  const [valuations, discharges] = await Promise.all([
    valuationIds.length
      ? service
          .from("repayment_valuation_snapshots")
          .select("id, decimal_rate, source, source_label, effective_at, reason")
          .in("id", valuationIds)
      : Promise.resolve({ data: [], error: null }),
    paymentIds.length
      ? service
          .from("settlement_payment_discharges")
          .select(
            "id, payment_id, amount_minor, settlement_currency, settlement_scale, confirmation_authority, confirmed_by_user_id, confirmed_by_member_id, reason, confirmed_at",
          )
          .in("payment_id", paymentIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (valuations.error || discharges.error)
    throw new Error("Supabase Dev Settlement Payment evidence read failed.");

  return (settlements.data ?? []).map((row) => {
    const id = String(row.id);
    return {
      id,
      journeyId: String(row.journey_id),
      kind: (row.settlement_kind ?? "ROOT") as "ROOT" | "ADJUSTMENT",
      rootSettlementId: row.root_settlement_id ? String(row.root_settlement_id) : null,
      parentAdjustmentId: row.parent_adjustment_id
        ? String(row.parent_adjustment_id)
        : null,
      lineageSequence: Number(row.lineage_sequence ?? 0),
      priorInputDigest: row.prior_input_digest ? String(row.prior_input_digest) : null,
      adjustmentReason: row.adjustment_reason ? String(row.adjustment_reason) : null,
      eligibilityVersion: String(
        row.eligibility_version ?? SETTLEMENT_ELIGIBILITY_VERSION,
      ),
      status: row.status as FinalizedSettlementDto["status"],
      throughTimestamp: String(row.through_timestamp),
      settlementCurrency: String(row.settlement_currency),
      settlementScale: Number(row.settlement_scale),
      settingsRevision: Number(row.settings_revision),
      algorithmVersion: "ledger-settlement-greedy-v1",
      inputDigest: String(row.input_digest),
      revision: Number(row.revision),
      finalizedBy: String(row.finalized_by),
      finalizedAt: String(row.finalized_at),
      inputs: (inputs.data ?? [])
        .filter((item) => String(item.settlement_id) === id)
        .map(
          (item) => item.normalized_snapshot as FinalizedSettlementDto["inputs"][number],
        )
        .sort((left, right) => left.expenseId.localeCompare(right.expenseId)),
      balances: (balances.data ?? [])
        .filter((item) => String(item.settlement_id) === id)
        .map((item) => ({
          memberId: String(item.member_id),
          displayNameSnapshot: String(item.display_name_snapshot),
          paidMinor: Number(item.paid_minor),
          owedMinor: Number(item.owed_minor),
          transferredMinor: 0 as const,
          netMinor: Number(item.net_minor),
          currency: String(row.settlement_currency),
          scale: Number(row.settlement_scale),
        }))
        .sort((left, right) => left.memberId.localeCompare(right.memberId)),
      adjustmentDeltas: (adjustmentDeltas.data ?? [])
        .filter((item) => String(item.settlement_id) === id)
        .map((item) => ({
          memberId: String(item.member_id),
          displayNameSnapshot: String(item.display_name_snapshot),
          deltaMinor: Number(item.delta_minor),
          currency: String(item.settlement_currency),
          scale: Number(item.settlement_scale),
        }))
        .sort((left, right) => left.memberId.localeCompare(right.memberId)),
      transfers: (transfers.data ?? [])
        .filter((item) => String(item.settlement_id) === id)
        .map((item) => {
          const transferPayments = (payments.data ?? [])
            .filter((payment) => String(payment.transfer_id) === String(item.id))
            .map((payment) => {
              const valuation = (valuations.data ?? []).find(
                (value) =>
                  String(value.id) ===
                  String(payment.repayment_valuation_snapshot_id ?? ""),
              );
              const discharge = (discharges.data ?? []).find(
                (value) => String(value.payment_id) === String(payment.id),
              );
              return {
                id: String(payment.id),
                transferId: String(payment.transfer_id),
                status:
                  payment.status as FinalizedSettlementDto["transfers"][number]["payments"][number]["status"],
                payment: {
                  minor: Number(payment.payment_amount_minor),
                  currency: String(payment.payment_currency),
                  scale: Number(payment.payment_scale),
                },
                assertedDischarge: {
                  minor: Number(payment.asserted_discharge_amount_minor),
                  currency: String(payment.settlement_currency),
                  scale: Number(payment.settlement_scale),
                },
                repaymentValuation: valuation
                  ? {
                      id: String(valuation.id),
                      decimalRate: String(valuation.decimal_rate),
                      source: valuation.source as "REFERENCE_RATE" | "MANUAL_AGREED",
                      sourceLabel: String(valuation.source_label),
                      effectiveAt: String(valuation.effective_at),
                      reason: valuation.reason ? String(valuation.reason) : null,
                    }
                  : null,
                feeTreatment:
                  payment.fee_amount_minor === null
                    ? null
                    : {
                        fee: {
                          minor: Number(payment.fee_amount_minor),
                          currency: String(payment.fee_currency),
                          scale: Number(payment.fee_scale),
                        },
                        borneBy: payment.fee_borne_by as "DEBTOR" | "CREDITOR" | "SHARED",
                      },
                reportedByUserId: String(payment.reported_by),
                reportedByMemberId: String(payment.reported_by_member_id),
                reportingAuthority: payment.reporting_authority as
                  "PAYER" | "ORGANIZER_OVERRIDE",
                reportingReason: payment.reporting_reason
                  ? String(payment.reporting_reason)
                  : null,
                paidAt: String(payment.paid_at),
                evidenceAssetId: payment.evidence_asset_id
                  ? String(payment.evidence_asset_id)
                  : null,
                notes: payment.notes ? String(payment.notes) : null,
                supersedesPaymentId: payment.supersedes_payment_id
                  ? String(payment.supersedes_payment_id)
                  : null,
                revision: Number(payment.revision),
                createdAt: String(payment.created_at),
                syncStatus: "SYNCED" as const,
                discharge: discharge
                  ? {
                      id: String(discharge.id),
                      amount: {
                        minor: Number(discharge.amount_minor),
                        currency: String(discharge.settlement_currency),
                        scale: Number(discharge.settlement_scale),
                      },
                      confirmationAuthority: discharge.confirmation_authority as
                        "RECIPIENT" | "ORGANIZER_OVERRIDE",
                      confirmedByUserId: String(discharge.confirmed_by_user_id),
                      confirmedByMemberId: String(discharge.confirmed_by_member_id),
                      reason: discharge.reason ? String(discharge.reason) : null,
                      confirmedAt: String(discharge.confirmed_at),
                    }
                  : null,
              };
            })
            .sort(
              (left, right) =>
                left.createdAt.localeCompare(right.createdAt) ||
                left.id.localeCompare(right.id),
            );
          const amounts = deriveTransferPaymentState(
            Number(item.obligation_amount_minor),
            transferPayments.map((payment) => ({
              status: payment.status,
              assertedDischargeMinor: payment.assertedDischarge.minor,
              dischargeMinor: payment.discharge?.amount.minor ?? null,
            })),
          );
          const money = (minor: number) => ({
            minor,
            currency: String(item.settlement_currency),
            scale: Number(item.settlement_scale),
          });
          return {
            id: String(item.id),
            fromMemberId: String(item.from_member_id),
            toMemberId: String(item.to_member_id),
            amount: money(Number(item.obligation_amount_minor)),
            confirmedDischarge: money(amounts.confirmedDischargeMinor),
            confirmedRemaining: money(amounts.confirmedRemainingMinor),
            awaitingAmount: money(amounts.awaitingAmountMinor),
            availableToReport: money(amounts.availableToReportMinor),
            status: amounts.status,
            revision: Number(item.revision),
            payments: transferPayments,
          };
        })
        .sort((left, right) => left.id.localeCompare(right.id)),
      auditEvents: (audits.data ?? [])
        .filter((item) => String(item.settlement_id) === id)
        .map((item) => ({
          id: String(item.id),
          eventType:
            item.event_type as FinalizedSettlementDto["auditEvents"][number]["eventType"],
          actorUserId: String(item.actor_user_id),
          actorMemberId: String(item.actor_member_id),
          reason: item.reason ? String(item.reason) : null,
          transferId: item.transfer_id ? String(item.transfer_id) : null,
          paymentId: item.payment_id ? String(item.payment_id) : null,
          dischargeId: item.discharge_id ? String(item.discharge_id) : null,
          authority: item.authority
            ? (String(item.authority) as "PAYER" | "RECIPIENT" | "ORGANIZER_OVERRIDE")
            : null,
          revision: Number(item.settlement_revision),
          createdAt: String(item.created_at),
        })),
    };
  });
}

async function decorateSettlementLineages(
  service: SupabaseClient,
  tripId: string,
  settlements: FinalizedSettlementDto[],
) {
  const roots = settlements.filter((settlement) => settlement.kind !== "ADJUSTMENT");
  const previews = new Map(
    await Promise.all(
      roots.map(
        async (root) =>
          [
            root.id,
            (await calculateSettlementAdjustmentPreview(service, tripId, root.id))
              .response,
          ] as const,
      ),
    ),
  );
  return settlements.map((settlement) => {
    const preview = previews.get(settlement.id);
    if (!preview) return settlement;
    const lineage = settlements.filter(
      (item) => item.id === settlement.id || item.rootSettlementId === settlement.id,
    );
    const discharges = lineage.flatMap((item) =>
      item.transfers.flatMap((transfer) =>
        transfer.payments.flatMap((payment) =>
          payment.discharge
            ? [
                {
                  fromMemberId: transfer.fromMemberId,
                  toMemberId: transfer.toMemberId,
                  amountMinor: payment.discharge.amount.minor,
                },
              ]
            : [],
        ),
      ),
    );
    const names = new Map(
      preview.balances.map((balance) => [balance.memberId, balance.displayNameSnapshot]),
    );
    return {
      ...settlement,
      adjustmentState:
        preview.state === "PREVIEW_BLOCKED"
          ? ("ADJUSTMENT_BLOCKED" as const)
          : preview.state === "PREVIEW_READY"
            ? ("ADJUSTMENT_REQUIRED" as const)
            : ("CURRENT" as const),
      lineageHeadId: preview.expectedHeadId ?? settlement.id,
      outstandingBalances: buildOutstandingBalanceVector(
        preview.balances,
        discharges,
      ).map(({ memberId, minor }) => ({
        memberId,
        displayNameSnapshot: names.get(memberId) ?? memberId,
        amount: {
          minor,
          currency: settlement.settlementCurrency,
          scale: settlement.settlementScale,
        },
      })),
    };
  });
}

async function readLedgerBootstrap(
  service: SupabaseClient,
  tripId: string,
  userId: string,
): Promise<LedgerBootstrapResponse> {
  const now = new Date().toISOString();
  const [
    trip,
    settings,
    members,
    households,
    householdMembers,
    expenses,
    corrections,
    rateQuotes,
    receipts,
  ] = await Promise.all([
    service
      .from("trips")
      .select("name, start_date, end_date")
      .eq("id", tripId)
      .maybeSingle(),
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
        "id, journey_id, creator_member_id, payer_member_id, title, description, category, occurred_at, economic_date, original_amount_minor, original_currency, original_currency_scale, business_status, settlement_participation, revision, deleted_at, created_at, updated_at",
      )
      .eq("journey_id", tripId)
      .order("occurred_at", { ascending: false }),
    service
      .from("expense_correction_requests")
      .select("*")
      .eq("journey_id", tripId)
      .order("updated_at", { ascending: false }),
    readRateQuotes(service, tripId),
    service
      .from("receipt_assets")
      .select(receiptColumns)
      .eq("journey_id", tripId)
      .order("created_at", { ascending: false }),
  ]);

  if (
    trip.error ||
    settings.error ||
    members.error ||
    households.error ||
    householdMembers.error ||
    expenses.error ||
    corrections.error ||
    receipts.error
  ) {
    throw new Error("Supabase Dev Ledger bootstrap failed.");
  }

  const aggregates = await readExpenseAggregates(service, expenses.data ?? []);
  const finalizedSettlements = await decorateSettlementLineages(
    service,
    tripId,
    await readFinalizedSettlements(service, tripId),
  );
  const review = await readLedgerReviewData(service, tripId, userId);
  const lastSequence = await latestLedgerSequence(service, tripId);
  const setting = settings.data as Record<string, unknown> | null;
  const tripRow = trip.data as Record<string, unknown> | null;

  const actorRow = (members.data ?? []).find(
    (member) => String(member.user_id ?? "") === userId,
  ) as Record<string, unknown> | undefined;
  const actorRole = actorRow?.role === null || !actorRow ? null : String(actorRow.role);
  const actorStatus =
    actorRow?.status === null || !actorRow ? null : String(actorRow.status);

  return {
    journey: {
      id: tripId,
      title: String(tripRow?.name ?? "Journey"),
      startDate: tripRow?.start_date ? String(tripRow.start_date) : null,
      endDate: tripRow?.end_date ? String(tripRow.end_date) : null,
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
    rateQuotes,
    receipts: (receipts.data ?? []).map((row) =>
      receiptRowToDto(row as Record<string, unknown>),
    ),
    settlements: finalizedSettlements,
    reviewFindings: review.findings,
    reviewActions: review.actions,
    actor: {
      userId,
      memberId: actorRow ? String(actorRow.id) : null,
      role: actorRole,
      capabilities: capabilities(actorRole, actorStatus),
    },
    cursor: lastSequence ? encodeLedgerCursor(lastSequence, tripId, userId) : null,
    serverTime: now,
  };
}

async function readLedgerChanges(
  service: SupabaseClient,
  userId: string,
  tripId: string,
  cursor: string | null,
): Promise<LedgerChangesResponse> {
  const after = decodeLedgerCursor(cursor, tripId, userId);
  assertLedgerCursorContinuation(after, await latestLedgerSequence(service, tripId));
  const result = await service
    .from("ledger_changes")
    .select("sequence, entity_type, entity_id, revision, is_tombstone")
    .eq("journey_id", tripId)
    .gt("sequence", after)
    .order("sequence", { ascending: true })
    .limit(101);

  if (result.error) throw new Error("Supabase Dev Ledger changes failed.");

  const allRows = result.data ?? [];
  const hasMore = allRows.length > 100;
  const rows = allRows.slice(0, 100);
  const visibleRows = rows.filter(
    (row) =>
      !["TRANSFER", "TRANSFER_PAYMENT", "REVIEW_FINDING"].includes(row.entity_type),
  );
  const expenseIds = rows
    .filter((row) => row.entity_type === "EXPENSE" && !row.is_tombstone)
    .map((row) => String(row.entity_id));
  const hasExpenseChanges = rows.some((row) => row.entity_type === "EXPENSE");
  const householdIds = rows
    .filter((row) => row.entity_type === "HOUSEHOLD" && !row.is_tombstone)
    .map((row) => String(row.entity_id));
  const correctionIds = rows
    .filter((row) => row.entity_type === "CORRECTION")
    .map((row) => String(row.entity_id));
  const rateQuoteIds = rows
    .filter((row) => row.entity_type === "RATE_QUOTE")
    .map((row) => String(row.entity_id));
  const paymentIds = rows
    .filter((row) => row.entity_type === "PAYMENT_RECORD")
    .map((row) => String(row.entity_id));
  const receiptIds = rows
    .filter((row) => row.entity_type === "RECEIPT")
    .map((row) => String(row.entity_id));
  const settlementIds = rows
    .filter((row) => row.entity_type === "SETTLEMENT")
    .map((row) => String(row.entity_id));
  const expenses =
    expenseIds.length > 0
      ? await service
          .from("expenses")
          .select(
            "id, journey_id, creator_member_id, payer_member_id, title, description, category, occurred_at, economic_date, original_amount_minor, original_currency, original_currency_scale, business_status, settlement_participation, revision, deleted_at, created_at, updated_at",
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
  const rateQuotes =
    rateQuoteIds.length > 0
      ? await service
          .from("ledger_rate_quotes")
          .select(
            "id, journey_id, quote_currency, base_currency, decimal_rate, effective_date, observed_at, provider, provider_reference, expires_at",
          )
          .in("id", rateQuoteIds)
      : { data: [], error: null };
  const paymentRecords =
    paymentIds.length > 0
      ? await service
          .from("payment_records")
          .select(
            "id, expense_id, expense_revision, payer_member_id, instrument_label, authorization_amount_minor, authorization_currency, authorization_scale, posted_amount_minor, posted_currency, posted_scale, authorized_at, posted_at, fee_amount_minor, fee_currency, fee_scale, bank_fx_rate, source, notes, supersedes_payment_record_id",
          )
          .in("id", paymentIds)
      : { data: [], error: null };
  const evidenceAudits =
    paymentIds.length > 0
      ? await service
          .from("expense_audit_events")
          .select(
            "id, expense_id, expense_revision, event_type, actor_user_id, actor_member_id, reason, changed_groups, metadata, created_at",
          )
          .in("expense_id", [
            ...new Set((paymentRecords.data ?? []).map((row) => String(row.expense_id))),
          ])
          .in("event_type", ["PAYMENT_RECORD_ADDED", "PAYMENT_RECORD_SUPERSEDED"])
      : { data: [], error: null };
  const receipts =
    receiptIds.length > 0
      ? await service.from("receipt_assets").select(receiptColumns).in("id", receiptIds)
      : { data: [], error: null };
  const includeLineageProjection = hasExpenseChanges || settlementIds.length > 0;
  const settlements = includeLineageProjection
    ? await decorateSettlementLineages(
        service,
        tripId,
        await readFinalizedSettlements(service, tripId),
      )
    : [];

  if (expenses.error) throw new Error("Supabase Dev Ledger change aggregate failed.");
  if (
    households.error ||
    householdMembers.error ||
    corrections.error ||
    rateQuotes.error ||
    paymentRecords.error ||
    evidenceAudits.error ||
    receipts.error
  ) {
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
  for (const row of rateQuotes.data ?? []) {
    byId.set(String(row.id), rateQuoteRowToDto(row));
  }
  for (const row of paymentRecords.data ?? []) {
    const audit = (evidenceAudits.data ?? []).find(
      (item) =>
        String(
          (item.metadata as Record<string, unknown> | null)?.paymentRecordId ?? "",
        ) === String(row.id),
    );
    byId.set(String(row.id), paymentRowToDto(row, audit));
  }
  for (const row of receipts.data ?? [])
    byId.set(String(row.id), receiptRowToDto(row as Record<string, unknown>));
  for (const settlement of settlements) byId.set(settlement.id, settlement);

  const changes = visibleRows.map((row) => ({
    entityType: row.entity_type as LedgerChangesResponse["changes"][number]["entityType"],
    entityId: String(row.entity_id),
    revision: Number(row.revision),
    isTombstone: Boolean(row.is_tombstone),
    aggregate: byId.get(String(row.entity_id)) ?? null,
  }));
  const changedSettlementIds = new Set(
    changes
      .filter((change) => change.entityType === "SETTLEMENT")
      .map((change) => change.entityId),
  );
  for (const root of settlements.filter((item) => item.kind !== "ADJUSTMENT")) {
    if (!changedSettlementIds.has(root.id)) {
      changes.push({
        entityType: "SETTLEMENT",
        entityId: root.id,
        revision: root.revision,
        isTombstone: false,
        aggregate: root,
      });
    }
  }

  const review = await readLedgerReviewData(service, tripId, userId);
  return {
    reviewFindings: review.findings,
    reviewActions: review.actions,
    changes,
    cursor: rows.length
      ? encodeLedgerCursor(Number(rows[rows.length - 1].sequence), tripId, userId)
      : cursor,
    hasMore,
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
        "id, expense_id, policy, original_amount_minor, original_currency, original_scale, settlement_amount_minor, settlement_currency, settlement_scale, rate_snapshot_id, payment_record_id, reason, decimal_rate, rounding_mode, effective_at, supersedes_valuation_id",
      )
      .eq("is_active", true)
      .in("expense_id", ids),
    service
      .from("payment_records")
      .select(
        "id, expense_id, expense_revision, payer_member_id, instrument_label, authorization_amount_minor, authorization_currency, authorization_scale, posted_amount_minor, posted_currency, posted_scale, authorized_at, posted_at, fee_amount_minor, fee_currency, fee_scale, bank_fx_rate, source, notes, supersedes_payment_record_id",
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
      economicDate: row.economic_date ? String(row.economic_date) : null,
      original: {
        minor: Number(row.original_amount_minor),
        currency: String(row.original_currency),
        scale: Number(row.original_currency_scale),
      },
      businessStatus: row.business_status as
        "DRAFT" | "ACCEPTED" | "RATE_REQUIRED" | "DELETED",
      settlementParticipation: row.settlement_participation as "INCLUDED" | "EXCLUDED",
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
            decimalRate: valuation.decimal_rate ? String(valuation.decimal_rate) : null,
            roundingMode: "HALF_UP" as const,
            effectiveAt: valuation.effective_at
              ? String(valuation.effective_at)
              : undefined,
            supersedesValuationId: valuation.supersedes_valuation_id
              ? String(valuation.supersedes_valuation_id)
              : null,
          }
        : null,
      paymentRecords: (payments.data ?? [])
        .filter((item) => String(item.expense_id) === id)
        .map((item) => paymentRowToDto(item)),
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
  period: MyLedgerPeriod,
  from: string | null,
  to: string | null,
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
      period,
      from,
      to,
      journeys: [],
      serverTime: new Date().toISOString(),
    };
  }

  const summaries = await Promise.all(
    members.map(async (member) => {
      const journeyId = String(member.trip_id);
      const memberId = String(member.id);
      const reporting = await readServerReporting(service, userId, journeyId);
      const filters: ReportingFilters = {
        ...(from ? { from } : {}),
        ...(to ? { to } : {}),
      };
      const mine = summarizeReporting(reporting.records, "MINE", memberId, filters);
      const settlementMine = summarizeReporting(
        reporting.records.filter(
          (record) => record.settlementParticipation === "INCLUDED",
        ),
        "MINE",
        memberId,
        filters,
      );
      const paidMinor = reporting.records
        .filter(
          (record) =>
            matchesReportingFilters(record, filters) &&
            record.businessStatus === "ACCEPTED" &&
            record.settlementParticipation === "INCLUDED" &&
            record.settlementMinor !== null &&
            !record.hasOpenConflict &&
            record.payerMemberId === memberId,
        )
        .reduce((sum, record) => sum + record.settlementMinor!, 0);
      return {
        journeyId,
        title: reporting.bootstrap.journey.title,
        startDate: reporting.bootstrap.journey.startDate,
        endDate: reporting.bootstrap.journey.endDate,
        currency: reporting.bootstrap.journey.settlementCurrency,
        scale: reporting.bootstrap.journey.settlementScale,
        mySpendMinor: mine.totalMinor,
        paidMinor,
        positionMinor: paidMinor - settlementMine.totalMinor,
        unvaluedCount: mine.unresolvedRateCount,
        conflictCount: mine.openConflictCount,
        updatedAt: reporting.bootstrap.journey.updatedAt,
      };
    }),
  );

  return {
    period,
    from,
    to,
    journeys: summaries,
    serverTime: new Date().toISOString(),
  };
}

async function readServerReporting(
  service: SupabaseClient,
  userId: string,
  tripId: string,
) {
  const bootstrap = await readLedgerBootstrap(service, tripId, userId);
  const conflicts = await service
    .from("ledger_idempotency_keys")
    .select("id, response_body")
    .eq("journey_id", tripId)
    .eq("response_status", 409);
  if (conflicts.error) throw new Error("Supabase Dev Ledger conflicts failed.");
  const conflictIds = (conflicts.data ?? []).map((row) => String(row.id));
  const resolutions =
    conflictIds.length > 0
      ? await service
          .from("expense_conflict_resolutions")
          .select("conflict_id")
          .in("conflict_id", conflictIds)
      : { data: [], error: null };
  if (resolutions.error)
    throw new Error("Supabase Dev Ledger conflict resolutions failed.");
  const resolved = new Set(
    (resolutions.data ?? []).map((row) => String(row.conflict_id)),
  );
  const openExpenseIds = new Set(
    (conflicts.data ?? [])
      .filter((row) => !resolved.has(String(row.id)))
      .map((row) => {
        const body = row.response_body as { error?: { expenseId?: unknown } } | null;
        return typeof body?.error?.expenseId === "string" ? body.error.expenseId : "";
      })
      .filter(Boolean),
  );
  const receiptExpenseIds = new Set(
    (bootstrap.receipts ?? []).map((receipt) => receipt.expenseId).filter(Boolean),
  );
  const memberNames = new Map(
    bootstrap.members.map((member) => [member.id, member.displayName]),
  );
  const records: ReportingRecord[] = bootstrap.expenses.map((expense) => ({
    id: expense.id,
    title: expense.title,
    description: expense.description,
    category: expense.category,
    occurredAt: expense.occurredAt,
    payerMemberId: expense.payerMemberId,
    payerName: memberNames.get(expense.payerMemberId) ?? "Traveller",
    originalMinor: expense.original.minor,
    originalCurrency: expense.original.currency,
    businessStatus: expense.businessStatus,
    settlementParticipation: expense.settlementParticipation,
    syncStatus: "SYNCED",
    settlementMinor: expense.valuation?.settlement.minor ?? null,
    settlementCurrency: bootstrap.journey.settlementCurrency,
    hasOpenConflict: openExpenseIds.has(expense.id),
    hasReceipt: receiptExpenseIds.has(expense.id),
    splits: expense.splits.map((split) => ({
      memberId: split.memberId,
      memberName:
        expense.participants.find(
          (participant) => participant.memberId === split.memberId,
        )?.displayNameSnapshot ??
        memberNames.get(split.memberId) ??
        "Traveller",
      settlementMinor: split.settlementMinor,
    })),
  }));
  return { bootstrap, records };
}

async function readLedgerExpenses(
  service: SupabaseClient,
  userId: string,
  tripId: string,
  filters: ReportingFilters,
  limit: number,
  offset: number,
): Promise<LedgerExpenseListResponse> {
  const reporting = await readServerReporting(service, userId, tripId);
  const included = new Set(
    reporting.records
      .filter((record) => matchesReportingFilters(record, filters))
      .map((record) => record.id),
  );
  const expenses = reporting.bootstrap.expenses
    .filter((expense) => included.has(expense.id))
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt) || a.id.localeCompare(b.id));
  const page = expenses.slice(offset, offset + limit);
  return {
    expenses: page,
    nextCursor:
      offset + limit < expenses.length ? encodePageCursor(offset + limit) : null,
  };
}

async function readLedgerAnalysis(
  service: SupabaseClient,
  userId: string,
  tripId: string,
  filters: ReportingFilters,
  scope: LedgerAnalysisResponse["scope"],
  dimension: LedgerAnalysisResponse["dimension"],
): Promise<LedgerAnalysisResponse> {
  const reporting = await readServerReporting(service, userId, tripId);
  const memberId = reporting.bootstrap.actor.memberId ?? "";
  return {
    scope,
    dimension,
    currency: reporting.bootstrap.journey.settlementCurrency,
    summary: summarizeReporting(reporting.records, scope, memberId, filters),
    buckets: analyzeReporting(reporting.records, dimension, scope, memberId, filters),
  };
}
