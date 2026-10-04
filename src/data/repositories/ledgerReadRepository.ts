import { ApiClientError } from "@/data/api/client";
import {
  assertAccountRequestContext,
  captureAccountRequestContext,
  withAccountApplyGate,
  type AccountRequestContext,
} from "@/data/auth/accountRequestContext";
import { canonicalPersonIdSchema } from "@/domain/trip/participationSnapshot";
import {
  validateParticipationBootstrap,
  saveParticipationBootstrap,
  validateParticipationPage,
  saveParticipationPage,
  readParticipationCertificate,
  hashTripPersonBytes,
} from "./tripPersonCertificate";
import {
  participationCommandSchema,
  participationResultSchema,
  participationIntentBytes,
  participationResultBytes,
  participationOperationType,
  type ParticipationCommand,
  type ParticipationResult,
} from "@/domain/trip/personParticipationCommand";
import {
  storeExpenseCanonical,
  readExpenseCanonical,
  storeExpenseConflictMetadata,
} from "./ledgerExpenseConsistency";
import type * as SQLite from "expo-sqlite";

import type {
  LedgerBootstrapResponse,
  LedgerChangesResponse,
  MyLedgerResponse,
} from "@/data/api/ledgerReadContracts";
import { ledgerMemberSchema } from "@/data/api/ledgerReadContracts";
import { createLedgerExpenseRepository } from "./ledgerExpenseRepository";
import { applyFinalizedSettlement } from "./ledgerSettlementRepository";
import { applyReviewProjection } from "./ledgerReviewRepository";
import { createLedgerPersonalPaymentRepository } from "./ledgerPersonalPaymentRepository";

export type LedgerReadDatabase = Pick<
  SQLite.SQLiteDatabase,
  "getAllAsync" | "getFirstAsync" | "runAsync" | "withTransactionAsync"
>;

type ServerExpense = LedgerBootstrapResponse["expenses"][number];
type ServerHousehold = LedgerBootstrapResponse["households"][number];
type ServerCorrection = LedgerBootstrapResponse["corrections"][number];
type ServerRateQuote = LedgerBootstrapResponse["rateQuotes"][number];
type ServerPaymentRecord = ServerExpense["paymentRecords"][number];
type ServerChange = LedgerChangesResponse["changes"][number];

const pendingStatuses = new Set([
  "PENDING_CREATE",
  "PENDING_UPDATE",
  "PENDING_DELETE",
  "SYNCING",
  "CONFLICT",
  "FAILED",
]);

export function createLedgerReadRepository(
  database: LedgerReadDatabase,
  getActiveUserId: () => Promise<string>,
) {
  return {
    // Foundation seam only. Central reporting cycle must drain earlier reads
    // before this application; no normal queue authoring/dispatch is installed.
    async applyParticipationResult(
      input: ParticipationCommand,
      response: ParticipationResult,
      context: AccountRequestContext,
    ) {
      const command = participationCommandSchema.parse(input);
      const result = participationResultSchema.parse(response);
      const r = result.receipt;
      if (
        context.accountId !== command.actorUserId ||
        context.tripId !== command.tripId ||
        r.actorUserId !== command.actorUserId ||
        r.tripId !== command.tripId ||
        r.personId !== command.personId ||
        r.operationId !== command.operationId ||
        r.intentDigest !== command.intentDigest ||
        (command.actorMemberId !== null && command.actorMemberId !== r.actorMemberId) ||
        r.expectedParticipation.revision !== command.expectedParticipation.revision ||
        r.expectedParticipation.isParticipating !==
          command.expectedParticipation.isParticipating ||
        r.desiredParticipation !== command.isParticipating ||
        (await hashTripPersonBytes(participationIntentBytes(command))) !==
          command.intentDigest ||
        (await hashTripPersonBytes(participationResultBytes(r))) !== result.resultDigest
      )
        throw new Error("Participation result binding mismatch.");
      await assertAccountRequestContext(context, getActiveUserId);
      let applied = false;
      await withAccountApplyGate(() =>
        database.withTransactionAsync(async () => {
          await assertAccountRequestContext(context, getActiveUserId);
          const operation = await database.getFirstAsync<{
            owner: string;
            trip: string;
            person: string;
            kind: string;
            entity: string;
            key: string;
            payload: string;
          }>(
            `SELECT owner_user_id AS owner, trip_id AS trip, entity_id AS person,
           operation_type AS kind, entity_type AS entity, idempotency_key AS key, payload_json AS payload
           FROM sync_operations WHERE id=?`,
            command.operationId,
          );
          if (
            !operation ||
            operation.owner !== context.accountId ||
            operation.trip !== context.tripId ||
            operation.person !== command.personId ||
            operation.kind !== participationOperationType ||
            operation.entity !== "TRIP_PERSON" ||
            participationCommandSchema.parse(JSON.parse(operation.payload))
              .intentDigest !== command.intentDigest ||
            operation.key !== command.operationId ||
            participationIntentBytes(
              participationCommandSchema.parse(JSON.parse(operation.payload)),
            ) !== participationIntentBytes(command)
          )
            throw new Error("Participation operation binding mismatch.");
          const previous = await database.getFirstAsync<{ json: string; digest: string }>(
            "SELECT receipt_json AS json,result_digest AS digest FROM trip_person_participation_results WHERE account_id=? AND operation_id=?",
            context.accountId,
            command.operationId,
          );
          const json = JSON.stringify(r);
          if (previous) {
            if (previous.json !== json || previous.digest !== result.resultDigest)
              throw new Error("Immutable participation result mismatch.");
            await assertAccountRequestContext(context, getActiveUserId);
            return;
          }
          const admitted = await database.getFirstAsync<{ user: string }>(
            "SELECT user_id AS user FROM ledger_actor_context WHERE user_id=? AND journey_id=?",
            context.accountId,
            context.tripId,
          );
          if (!admitted) throw new Error("Missing cached Trip admission.");
          const row = await database.getFirstAsync<{
            trip: string;
            active: number | null;
            revision: number | null;
          }>(
            "SELECT journey_id AS trip,participation_active AS active,participation_revision AS revision FROM ledger_members WHERE id=?",
            command.personId,
          );
          const pair = r.resultingParticipation;
          if (row && row.trip !== context.tripId)
            throw new Error("Participation Person Trip mismatch.");
          if (
            row?.revision === pair.revision &&
            row.active !== Number(pair.isParticipating)
          )
            throw new Error("Inconsistent participation result observation.");
          if (row && (row.revision === null || row.revision < pair.revision))
            await database.runAsync(
              "UPDATE ledger_members SET participation_active=?,participation_revision=? WHERE id=? AND journey_id=?",
              Number(pair.isParticipating),
              pair.revision,
              command.personId,
              context.tripId,
            );
          await database.runAsync(
            `INSERT INTO trip_person_participation_results
          (account_id,trip_id,person_id,operation_id,receipt_id,result_digest,receipt_json) VALUES(?,?,?,?,?,?,?)`,
            context.accountId,
            context.tripId,
            command.personId,
            command.operationId,
            r.receiptId,
            result.resultDigest,
            json,
          );
          await database.runAsync(
            `UPDATE ledger_sync_cursors SET
          participation_snapshot_contract_version=NULL,participation_fingerprint_version=NULL,
          participation_fingerprint=NULL,participation_person_ids_json=NULL,
          participation_observed_at=NULL,participation_verified_at=NULL,participation_bound_cursor=NULL
          WHERE journey_id=?`,
            context.tripId,
          );
          await database.runAsync(
            `UPDATE sync_operations SET status=?,next_attempt_at=NULL,
          claim_owner=NULL,lease_expires_at=NULL WHERE id=? AND owner_user_id=?`,
            r.outcome === "REVISION_CONFLICT" ? "CONFLICT" : "COMPLETED",
            command.operationId,
            context.accountId,
          );
          await assertAccountRequestContext(context, getActiveUserId);
          applied = true;
        }),
      );
      return applied;
    },
    async applyBootstrap(
      response: LedgerBootstrapResponse,
      requestContext?: AccountRequestContext,
    ) {
      const context =
        requestContext ??
        (await captureAccountRequestContext(response.journey.id, getActiveUserId));
      if (context.tripId !== response.journey.id)
        throw new Error("Trip request context mismatch.");
      const userId = context.accountId;
      const certified = response.participationSnapshot !== undefined;
      if (certified && !requestContext)
        throw new Error("Certified snapshot requires request context.");
      await assertAccountRequestContext(context, getActiveUserId);
      if (certified) await validateParticipationBootstrap(response, context);
      await withAccountApplyGate(() =>
        database.withTransactionAsync(async () => {
          await assertAccountRequestContext(context, getActiveUserId);
          await applyJourney(database, response, userId);
          for (const expense of response.expenses) {
            await applyBootstrapExpense(database, expense, userId);
          }
          for (const chain of response.expenseConflictChains ?? [])
            await storeExpenseConflictMetadata(
              database,
              userId,
              response.journey.id,
              chain,
            );
          for (const quote of response.rateQuotes) await applyRateQuote(database, quote);
          for (const receipt of response.receipts ?? [])
            await applyReceipt(database, response.journey.id, receipt);
          for (const settlement of response.settlements ?? [])
            await applyFinalizedSettlement(database, settlement);
          const personalPayments = createLedgerPersonalPaymentRepository(
            database,
            async () => userId,
          );
          for (const payment of response.personalPayments ?? [])
            await personalPayments.applyCanonical(payment);
          await personalPayments.applyFxProjectionList(
            response.journey.id,
            response.personalPaymentFxProjections ?? [],
          );
          if (response.reviewFindings)
            await applyReviewProjection(
              database,
              userId,
              response.journey.id,
              response.reviewFindings,
              response.reviewActions ?? [],
            );
          for (const correction of response.corrections) {
            if (!(await applyCorrection(database, correction))) {
              await deferChange(database, response.journey.id, {
                entityType: "CORRECTION",
                entityId: correction.id,
                revision: correction.revision,
                isTombstone: false,
                aggregate: correction,
              });
            }
          }
          await drainDeferredExpenseChanges(database, response.journey.id, userId);
          await saveCursor(
            database,
            response.journey.id,
            response.cursor,
            response.serverTime,
            userId,
          );
          if (certified) await saveParticipationBootstrap(database, response, context);
          await assertAccountRequestContext(context, getActiveUserId);
        }),
      );
    },

    async applyChanges(
      journeyId: string,
      response: LedgerChangesResponse,
      requestContext?: AccountRequestContext,
      requestCursor?: string | null,
    ) {
      const context =
        requestContext ??
        (await captureAccountRequestContext(journeyId, getActiveUserId));
      if (context.tripId !== journeyId) throw new Error("Trip request context mismatch.");
      const userId = context.accountId;
      const certified = response.participationVerification !== undefined;
      if (certified && !requestContext)
        throw new Error("Certified page requires request context.");
      await assertAccountRequestContext(context, getActiveUserId);
      await withAccountApplyGate(() =>
        database.withTransactionAsync(async () => {
          await assertAccountRequestContext(context, getActiveUserId);
          if (certified)
            await validateParticipationPage(
              database,
              response,
              context,
              requestCursor ?? null,
            );
          for (const chain of response.expenseConflictChains ?? [])
            await storeExpenseConflictMetadata(database, userId, journeyId, chain);
          if (response.reviewFindings)
            await applyReviewProjection(
              database,
              userId,
              journeyId,
              response.reviewFindings,
              response.reviewActions ?? [],
            );
          for (const change of response.changes) {
            if (change.entityType === "EXPENSE") {
              await applyExpenseChange(database, journeyId, change, userId);
            } else if (change.entityType === "HOUSEHOLD") {
              await applyHouseholdChange(database, journeyId, change);
            } else if (change.entityType === "CORRECTION") {
              if (change.aggregate && "baseExpenseRevision" in change.aggregate) {
                if (!(await applyCorrection(database, change.aggregate))) {
                  await deferChange(database, journeyId, change);
                }
              } else {
                await deferChange(database, journeyId, change);
              }
            } else if (
              change.entityType === "RATE_QUOTE" &&
              change.aggregate &&
              "quoteCurrency" in change.aggregate
            ) {
              await applyRateQuote(database, change.aggregate);
            } else if (
              change.entityType === "PAYMENT_RECORD" &&
              change.aggregate &&
              "instrumentLabel" in change.aggregate
            ) {
              await applyPaymentChange(database, journeyId, change.aggregate);
            } else if (
              change.entityType === "RECEIPT" &&
              change.aggregate &&
              "objectPath" in change.aggregate
            ) {
              await applyReceipt(database, journeyId, change.aggregate);
            } else if (
              change.entityType === "SETTLEMENT" &&
              change.aggregate &&
              "throughTimestamp" in change.aggregate
            ) {
              await applyFinalizedSettlement(database, change.aggregate);
            } else if (change.entityType === "PERSONAL_SETTLEMENT_PAYMENT") {
              const personalPayments = createLedgerPersonalPaymentRepository(
                database,
                async () => userId,
              );
              if (change.isTombstone) {
                await personalPayments.applyTombstone(
                  journeyId,
                  change.entityId,
                  change.revision,
                );
              } else if (change.aggregate && "ownerUserId" in change.aggregate) {
                await personalPayments.applyCanonical(change.aggregate);
              }
            } else if (
              change.entityType === "PERSONAL_SETTLEMENT_PAYMENT_FX_PROJECTION"
            ) {
              const personalPayments = createLedgerPersonalPaymentRepository(
                database,
                async () => userId,
              );
              if (change.isTombstone)
                await personalPayments.applyFxTombstone(change.entityId);
              else if (change.aggregate && "targetCurrency" in change.aggregate)
                await personalPayments.applyFxProjections([change.aggregate]);
            } else if (change.entityType === "REVIEW_FINDING") {
              // Review is delivered only through the user-scoped snapshot above.
            } else {
              await deferChange(database, journeyId, change);
            }
          }
          await drainDeferredExpenseChanges(database, journeyId, userId);
          if (certified) await saveParticipationPage(database, response, context);
          await saveCursor(
            database,
            journeyId,
            response.cursor,
            response.serverTime,
            userId,
          );
          await assertAccountRequestContext(context, getActiveUserId);
        }),
      );
    },

    async cacheMyLedger(response: MyLedgerResponse) {
      const userId = await getActiveUserId();
      await database.withTransactionAsync(async () => {
        const latest = await database.getFirstAsync<{ serverTime: string }>(
          `SELECT server_time AS serverTime FROM ledger_my_spending_periods
           WHERE user_id = ? AND period_key = ?`,
          userId,
          response.period,
        );
        if (latest && latest.serverTime > response.serverTime) return;
        if (response.spendingFacts) {
          const eligible = new Set(response.journeys.map((journey) => journey.journeyId));
          if (response.spendingFacts.some((fact) => !eligible.has(fact.journeyId)))
            throw new Error("My Ledger spending fact outside authorized response.");
          await database.runAsync(
            `INSERT OR REPLACE INTO ledger_my_spending_periods
             (user_id, period_key, server_time) VALUES (?, ?, ?)`,
            userId,
            response.period,
            response.serverTime,
          );
          await database.runAsync(
            `DELETE FROM ledger_my_spending_facts WHERE user_id = ? AND period_key = ?`,
            userId,
            response.period,
          );
          for (const fact of response.spendingFacts)
            await database.runAsync(
              `INSERT INTO ledger_my_spending_facts (
                  user_id, period_key, expense_id, revision, journey_id, category,
                  economic_date, occurred_at, status, has_open_conflict,
                original_currency, original_scale, personal_split_minor
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              userId,
              response.period,
              fact.expenseId,
              fact.revision,
              fact.journeyId,
              fact.category,
              fact.economicDate,
              fact.occurredAt,
              fact.status,
              fact.hasOpenConflict ? 1 : 0,
              fact.originalCurrency,
              fact.originalScale,
              fact.personalSplitMinor,
            );
        }
        await database.runAsync(
          `DELETE FROM ledger_my_journey_summaries
           WHERE user_id = ? AND period_key = ?`,
          userId,
          response.period,
        );
        for (const journey of response.journeys) {
          await database.runAsync(
            `INSERT OR REPLACE INTO ledger_my_journey_summaries (
              user_id, journey_id, period_key, from_at, to_at, title, start_date, end_date,
              currency, scale, my_spend_minor, paid_minor, position_minor,
              unvalued_count, conflict_count, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            userId,
            journey.journeyId,
            response.period,
            response.from,
            response.to,
            journey.title,
            journey.startDate,
            journey.endDate,
            journey.currency,
            journey.scale,
            journey.mySpendMinor,
            journey.paidMinor,
            journey.positionMinor,
            journey.unvaluedCount,
            journey.conflictCount,
            journey.updatedAt,
          );
        }
      });
    },

    async listMyLedgerSummaries(period = "YEAR") {
      const userId = await getActiveUserId();
      return database.getAllAsync<{
        journeyId: string;
        period: string;
        title: string;
        startDate: string | null;
        endDate: string | null;
        currency: string;
        scale: number;
        mySpendMinor: number;
        paidMinor: number;
        positionMinor: number;
        unvaluedCount: number;
        conflictCount: number;
        updatedAt: string;
      }>(
        `SELECT journey_id AS journeyId, period_key AS period, title,
          start_date AS startDate, end_date AS endDate, currency, scale,
          my_spend_minor AS mySpendMinor, paid_minor AS paidMinor,
          position_minor AS positionMinor, unvalued_count AS unvaluedCount,
          conflict_count AS conflictCount, updated_at AS updatedAt
         FROM ledger_my_journey_summaries
         WHERE user_id = ? AND period_key = ?
         ORDER BY updated_at DESC`,
        userId,
        period,
      );
    },

    async getParticipationCertificate(journeyId: string) {
      const context = await captureAccountRequestContext(journeyId, getActiveUserId);
      return withAccountApplyGate(async () => {
        await assertAccountRequestContext(context, getActiveUserId);
        const certificate = await readParticipationCertificate(database, context);
        await assertAccountRequestContext(context, getActiveUserId);
        return certificate;
      });
    },

    async getCursor(journeyId: string) {
      const userId = await getActiveUserId();
      return database.getFirstAsync<{ cursor: string | null }>(
        `SELECT cursor FROM ledger_sync_cursors
         WHERE user_id = ? AND journey_id = ?`,
        userId,
        journeyId,
      );
    },

    listMembers(journeyId: string) {
      return database.getAllAsync<{
        id: string;
        displayName: string;
        role: string | null;
        status: string | null;
        householdId: string | null;
        shareUnits: number | null;
      }>(
        `SELECT m.id, m.display_name AS displayName, m.role, m.status,
           hm.household_id AS householdId, hm.share_units AS shareUnits
         FROM ledger_members m
         LEFT JOIN ledger_household_members hm
           ON hm.journey_id = m.journey_id AND hm.member_id = m.id
         WHERE m.journey_id = ?
         ORDER BY m.display_name ASC`,
        journeyId,
      );
    },
    async listHouseholds(journeyId: string) {
      const rows = await database.getAllAsync<{
        id: string;
        name: string;
        memberId: string;
        shareUnits: number;
      }>(
        `SELECT h.id, h.name, hm.member_id AS memberId, hm.share_units AS shareUnits
         FROM ledger_households h
         JOIN ledger_household_members hm ON hm.household_id = h.id
         WHERE h.journey_id = ?
         ORDER BY h.display_order, h.name, hm.member_id`,
        journeyId,
      );
      return rows.reduce<
        { id: string; name: string; members: { id: string; shareUnits: number }[] }[]
      >((households, row) => {
        let household = households.find((item) => item.id === row.id);
        if (!household) {
          household = { id: row.id, name: row.name, members: [] };
          households.push(household);
        }
        household.members.push({ id: row.memberId, shareUnits: row.shareUnits });
        return households;
      }, []);
    },
  };
}

async function applyReceipt(
  database: LedgerReadDatabase,
  journeyId: string,
  receipt: NonNullable<LedgerBootstrapResponse["receipts"]>[number],
) {
  const existing = await database.getFirstAsync<{
    id: string;
    localUri: string | null;
    deletedAt: string | null;
    localOwnerUserId: string | null;
    localDeletedByUserId: string | null;
    originalFilename: string | null;
    originalMimeType: string | null;
    originalSizeBytes: number | null;
    width: number | null;
    height: number | null;
  }>(
    `SELECT id, local_uri AS localUri, deleted_at AS deletedAt,
      local_owner_user_id AS localOwnerUserId,
      local_deleted_by_user_id AS localDeletedByUserId,
      original_filename AS originalFilename, original_mime_type AS originalMimeType,
      original_size_bytes AS originalSizeBytes, width, height
      FROM ledger_receipt_assets
     WHERE journey_id = ? AND (id = ? OR server_id = ? OR id = ?)`,
    journeyId,
    receipt.id,
    receipt.id,
    receipt.localId,
  );
  const linkedExpense = receipt.expenseId
    ? await database.getFirstAsync<{ id: string }>(
        "SELECT id FROM ledger_expenses WHERE journey_id = ? AND server_id = ?",
        journeyId,
        receipt.expenseId,
      )
    : null;
  await database.runAsync(
    `INSERT OR REPLACE INTO ledger_receipt_assets (
    id, server_id, journey_id, expense_id, local_uri, mime_type, size_bytes, sha256,
    object_path, upload_status, ocr_status, ocr_suggestion_json, created_at, updated_at,
    local_owner_user_id, deleted_at, local_deleted_by_user_id,
    original_filename, original_mime_type, original_size_bytes, width, height
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    existing?.id ?? receipt.id,
    receipt.id,
    journeyId,
    linkedExpense?.id ?? receipt.expenseId,
    existing?.localUri ?? null,
    receipt.mimeType,
    receipt.sizeBytes,
    receipt.sha256,
    receipt.objectPath,
    receipt.uploadStatus,
    receipt.ocrStatus,
    receipt.ocrSuggestion ? JSON.stringify(receipt.ocrSuggestion) : null,
    receipt.createdAt,
    receipt.updatedAt,
    existing?.localOwnerUserId ?? null,
    receipt.deletedAt ?? existing?.deletedAt ?? null,
    receipt.deletedAt ? null : (existing?.localDeletedByUserId ?? null),
    existing?.originalFilename ?? null,
    existing?.originalMimeType ?? null,
    existing?.originalSizeBytes ?? null,
    existing?.width ?? null,
    existing?.height ?? null,
  );
}

async function applyRateQuote(database: LedgerReadDatabase, quote: ServerRateQuote) {
  await database.runAsync(
    `INSERT OR REPLACE INTO ledger_rate_quotes (
      id, journey_id, quote_currency, base_currency, decimal_rate, effective_date,
      observed_at, provider, provider_reference, expires_at, updated_at,
      economic_date, reference_date, policy_version, source_reference
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    quote.id,
    quote.journeyId,
    quote.quoteCurrency,
    quote.baseCurrency,
    quote.decimalRate,
    quote.effectiveDate,
    quote.observedAt,
    quote.provider,
    quote.providerReference,
    quote.expiresAt,
    new Date().toISOString(),
    quote.economicDate ?? null,
    quote.referenceDate ?? null,
    quote.policyVersion ?? null,
    quote.sourceReference ?? null,
  );
}

async function applyPaymentChange(
  database: LedgerReadDatabase,
  journeyId: string,
  payment: ServerPaymentRecord,
) {
  if (!payment.expenseId) return;
  const expense = await database.getFirstAsync<{ id: string }>(
    `SELECT id FROM ledger_expenses WHERE journey_id = ? AND (id = ? OR server_id = ?)`,
    journeyId,
    payment.expenseId,
    payment.expenseId,
  );
  if (!expense) return;
  await applyPayment(database, expense.id, payment, new Date().toISOString());
}

async function applyJourney(
  database: LedgerReadDatabase,
  response: LedgerBootstrapResponse,
  userId: string,
) {
  await database.runAsync(
    `INSERT OR REPLACE INTO ledger_journeys (
      journey_id, title, start_date, end_date, settlement_currency,
      settlement_scale, valuation_policy, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    response.journey.id,
    response.journey.title,
    response.journey.startDate,
    response.journey.endDate,
    response.journey.settlementCurrency,
    response.journey.settlementScale,
    response.journey.valuationPolicy,
    response.journey.updatedAt,
  );

  for (const incoming of response.members) {
    const member = { ...incoming, id: canonicalPersonIdSchema.parse(incoming.id) };
    ledgerMemberSchema.parse(member);
    const existing = await database.getFirstAsync<{
      journeyId: string;
      active: number | null;
      revision: number | null;
    }>(
      `SELECT journey_id AS journeyId, participation_active AS active,
        participation_revision AS revision FROM ledger_members WHERE id = ?`,
      member.id,
    );
    if (existing && existing.journeyId !== response.journey.id)
      throw new Error("Member belongs to a different Trip.");
    let active = existing?.active ?? null;
    let revision = existing?.revision ?? null;
    if (member.participationRevision !== undefined) {
      if (
        response.participationSnapshot &&
        revision !== null &&
        member.participationRevision < revision
      )
        throw new ApiClientError(
          "Trip Person snapshot is older than the cache.",
          "validation",
          400,
          "INVALID_CURSOR",
        );
      const incomingActive = member.isParticipating ? 1 : 0;
      if (revision === member.participationRevision && active !== incomingActive)
        throw new Error("Inconsistent Member participation observation.");
      if (revision === null || member.participationRevision > revision) {
        active = incomingActive;
        revision = member.participationRevision;
      }
    }
    await database.runAsync(
      `INSERT INTO ledger_members (
        id, journey_id, display_name, role, status, updated_at,
        participation_active, participation_revision
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET display_name = excluded.display_name,
        role = excluded.role, status = excluded.status, updated_at = excluded.updated_at,
        participation_active = excluded.participation_active,
        participation_revision = excluded.participation_revision`,
      member.id,
      response.journey.id,
      member.displayName,
      member.role,
      member.status,
      member.updatedAt,
      active,
      revision,
    );
  }

  for (const household of response.households) {
    await applyHousehold(database, response.journey.id, household);
  }
  await database.runAsync(
    `INSERT OR REPLACE INTO ledger_actor_context (
      journey_id, member_id, role, capabilities_json, updated_at, user_id
    ) VALUES (?, ?, ?, ?, ?, ?)`,
    response.journey.id,
    response.actor.memberId,
    response.actor.role,
    JSON.stringify(response.actor.capabilities),
    response.serverTime,
    userId,
  );
}

async function applyCorrection(
  database: LedgerReadDatabase,
  correction: ServerCorrection,
) {
  const [existing, localExpense] = await Promise.all([
    database.getFirstAsync<{ id: string; syncStatus: string }>(
      `SELECT id, sync_status AS syncStatus FROM ledger_correction_requests
       WHERE id = ? OR server_id = ?`,
      correction.id,
      correction.id,
    ),
    database.getFirstAsync<{ id: string }>(
      `SELECT id FROM ledger_expenses
       WHERE journey_id = ? AND (id = ? OR server_id = ?)`,
      correction.journeyId,
      correction.expenseId,
      correction.expenseId,
    ),
  ]);
  if (existing && pendingStatuses.has(existing.syncStatus)) return false;
  await database.runAsync(
    `INSERT OR REPLACE INTO ledger_correction_requests (
      id, server_id, journey_id, expense_id, base_revision, proposed_aggregate_json,
      reason, status, requested_by_member_id, requested_by_user_id,
      resolved_by_user_id, resolved_by_member_id, resolution_reason,
      resulting_expense_revision, server_revision, sync_status, last_synced_at,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'SYNCED', ?, ?, ?)`,
    existing?.id ?? correction.id,
    correction.id,
    correction.journeyId,
    localExpense?.id ?? correction.expenseId,
    correction.baseExpenseRevision,
    JSON.stringify(correction.proposedExpense),
    correction.reason,
    correction.status,
    correction.requestedByMemberId,
    correction.requestedByUserId,
    correction.resolvedByUserId,
    correction.resolvedByMemberId,
    correction.resolutionReason,
    correction.resultingExpenseRevision,
    correction.revision,
    new Date().toISOString(),
    correction.createdAt,
    correction.updatedAt,
  );
  return true;
}

async function applyExpenseChange(
  database: LedgerReadDatabase,
  journeyId: string,
  change: ServerChange,
  userId: string,
) {
  if (change.aggregate && "creatorMemberId" in change.aggregate) {
    const local = await database.getFirstAsync<{ id: string }>(
      `SELECT id FROM ledger_expenses WHERE journey_id = ? AND (id = ? OR server_id = ?)`,
      journeyId,
      change.entityId,
      change.entityId,
    );
    if (
      local &&
      (await database.getFirstAsync(
        `SELECT 1 FROM ledger_expense_commands WHERE account_id = ? AND expense_id = ? LIMIT 1`,
        userId,
        local.id,
      ))
    ) {
      await createLedgerExpenseRepository(
        database,
        async () => userId,
      ).reconcileCanonicalExpenseInTransaction(local.id, change.aggregate);
      return;
    }
    const localRevision = local
      ? await database.getFirstAsync<{ serverRevision: number }>(
          `SELECT server_revision AS serverRevision FROM ledger_expenses WHERE id = ?`,
          local.id,
        )
      : null;
    if (localRevision && localRevision.serverRevision > change.aggregate.revision) return;
    const known = await readExpenseCanonical(
      database,
      userId,
      local?.id ?? change.entityId,
    );
    if (known && known.revision > change.aggregate.revision) return;
    await storeExpenseCanonical(
      database,
      userId,
      local?.id ?? change.entityId,
      change.aggregate,
    );
  }
  const existing = await database.getFirstAsync<{ syncStatus: string }>(
    `SELECT sync_status AS syncStatus
     FROM ledger_expenses
     WHERE journey_id = ? AND (id = ? OR server_id = ?)`,
    journeyId,
    change.entityId,
    change.entityId,
  );
  if (existing && pendingStatuses.has(existing.syncStatus)) {
    await deferChange(database, journeyId, change);
    return;
  }
  if (change.aggregate && "creatorMemberId" in change.aggregate) {
    await applyExpense(database, change.aggregate);
    return;
  }
  // A feed event alone is not a canonical aggregate revision, including deletes.
  if (change.isTombstone) await deferChange(database, journeyId, change);
}

async function applyHouseholdChange(
  database: LedgerReadDatabase,
  journeyId: string,
  change: ServerChange,
) {
  if (change.isTombstone) {
    await database.runAsync(
      "DELETE FROM ledger_household_members WHERE journey_id = ? AND household_id = ?",
      journeyId,
      change.entityId,
    );
    await database.runAsync(
      "DELETE FROM ledger_households WHERE journey_id = ? AND id = ?",
      journeyId,
      change.entityId,
    );
    return;
  }
  if (change.aggregate && "name" in change.aggregate) {
    await applyHousehold(database, journeyId, change.aggregate);
    return;
  }
  await deferChange(database, journeyId, change);
}

async function applyHousehold(
  database: LedgerReadDatabase,
  journeyId: string,
  household: ServerHousehold,
) {
  await database.runAsync(
    `INSERT OR REPLACE INTO ledger_households (
      id, journey_id, name, display_order, updated_at
    ) VALUES (?, ?, ?, ?, ?)`,
    household.id,
    journeyId,
    household.name,
    household.displayOrder,
    household.updatedAt,
  );
  await database.runAsync(
    "DELETE FROM ledger_household_members WHERE journey_id = ? AND household_id = ?",
    journeyId,
    household.id,
  );
  for (const memberId of household.memberIds) {
    await database.runAsync(
      `INSERT OR REPLACE INTO ledger_household_members (
        household_id, member_id, journey_id, share_units, updated_at
      ) VALUES (?, ?, ?, ?, ?)`,
      household.id,
      memberId,
      journeyId,
      1000,
      household.updatedAt,
    );
  }
}

async function applyBootstrapExpense(
  database: LedgerReadDatabase,
  expense: ServerExpense,
  userId: string,
) {
  const local = await database.getFirstAsync<{ id: string }>(
    `SELECT id FROM ledger_expenses WHERE journey_id = ? AND (id = ? OR server_id = ?)`,
    expense.journeyId,
    expense.id,
    expense.id,
  );
  if (
    local &&
    (await database.getFirstAsync(
      `SELECT 1 FROM ledger_expense_commands WHERE account_id = ? AND expense_id = ? LIMIT 1`,
      userId,
      local.id,
    ))
  ) {
    await createLedgerExpenseRepository(
      database,
      async () => userId,
    ).reconcileCanonicalExpenseInTransaction(local.id, expense);
    return;
  }
  const localRevision = local
    ? await database.getFirstAsync<{ serverRevision: number }>(
        `SELECT server_revision AS serverRevision FROM ledger_expenses WHERE id = ?`,
        local.id,
      )
    : null;
  if (localRevision && localRevision.serverRevision > expense.revision) return;
  const known = await readExpenseCanonical(database, userId, local?.id ?? expense.id);
  if (known && known.revision > expense.revision) return;
  await storeExpenseCanonical(database, userId, local?.id ?? expense.id, expense);
  const existing = await database.getFirstAsync<{ syncStatus: string }>(
    `SELECT sync_status AS syncStatus
     FROM ledger_expenses
     WHERE journey_id = ? AND (id = ? OR server_id = ?)`,
    expense.journeyId,
    expense.id,
    expense.id,
  );
  if (existing && pendingStatuses.has(existing.syncStatus)) {
    await deferChange(database, expense.journeyId, {
      entityType: "EXPENSE",
      entityId: expense.id,
      revision: expense.revision,
      isTombstone: expense.businessStatus === "DELETED",
      aggregate: expense,
    });
    return;
  }
  await applyExpense(database, expense);
}

async function applyExpense(database: LedgerReadDatabase, expense: ServerExpense) {
  const existing = await database.getFirstAsync<{ id: string }>(
    `SELECT id FROM ledger_expenses
     WHERE journey_id = ? AND (id = ? OR server_id = ?)
     ORDER BY CASE WHEN server_id = ? AND id <> ? THEN 0 ELSE 1 END
     LIMIT 1`,
    expense.journeyId,
    expense.id,
    expense.id,
    expense.id,
    expense.id,
  );
  const localId = existing?.id ?? expense.id;
  if (localId !== expense.id) {
    for (const table of [
      "ledger_expense_participants",
      "ledger_expense_splits",
      "ledger_valuation_snapshots",
      "ledger_payment_records",
      "ledger_expense_audit_events",
    ]) {
      await database.runAsync(`DELETE FROM ${table} WHERE expense_id = ?`, expense.id);
    }
    await database.runAsync(
      "UPDATE ledger_expense_conflicts SET expense_id = ? WHERE expense_id = ?",
      localId,
      expense.id,
    );
    await database.runAsync(
      "UPDATE ledger_correction_requests SET expense_id = ? WHERE expense_id = ?",
      localId,
      expense.id,
    );
    await database.runAsync("DELETE FROM ledger_expenses WHERE id = ?", expense.id);
  }
  await database.runAsync(
    `INSERT OR REPLACE INTO ledger_expenses (
      id, server_id, journey_id, creator_member_id, payer_member_id, title, description,
      category, occurred_at, economic_date, original_amount_minor, original_currency, original_scale,
      business_status, settlement_participation, revision, server_revision, deleted_at,
      sync_status, last_synced_at, created_at, updated_at, local_owner_user_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
    localId,
    expense.id,
    expense.journeyId,
    expense.creatorMemberId,
    expense.payerMemberId,
    expense.title,
    expense.description,
    expense.category,
    expense.occurredAt,
    expense.economicDate ?? null,
    expense.original.minor,
    expense.original.currency,
    expense.original.scale,
    expense.businessStatus,
    expense.settlementParticipation,
    expense.revision,
    expense.revision,
    expense.deletedAt,
    "SYNCED",
    new Date().toISOString(),
    expense.createdAt,
    expense.updatedAt,
  );
  await database.runAsync(
    "DELETE FROM ledger_expense_participants WHERE expense_id = ?",
    localId,
  );
  await database.runAsync(
    "DELETE FROM ledger_expense_splits WHERE expense_id = ?",
    localId,
  );
  await database.runAsync(
    "UPDATE ledger_valuation_snapshots SET is_active = 0 WHERE expense_id = ?",
    localId,
  );
  await database.runAsync(
    "DELETE FROM ledger_expense_audit_events WHERE expense_id = ?",
    localId,
  );

  for (const [index, participant] of expense.participants.entries()) {
    await database.runAsync(
      `INSERT INTO ledger_expense_participants (
        expense_id, member_id, display_name_snapshot, household_id_snapshot, display_order
      ) VALUES (?, ?, ?, ?, ?)`,
      localId,
      participant.memberId,
      participant.displayNameSnapshot,
      participant.householdIdSnapshot,
      index,
    );
  }
  for (const split of expense.splits) {
    await database.runAsync(
      `INSERT INTO ledger_expense_splits (
        expense_id, member_id, split_method, original_amount_minor,
        settlement_amount_minor, weight_units, percentage_units, rounding_adjustment_minor
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      localId,
      split.memberId,
      split.method,
      split.originalMinor,
      split.settlementMinor,
      split.weightUnits,
      split.percentageUnits,
      split.roundingAdjustmentMinor,
    );
  }
  if (expense.valuation) {
    const existingValuation = await database.getFirstAsync<{ id: string }>(
      "SELECT id FROM ledger_valuation_snapshots WHERE id = ? OR server_id = ?",
      expense.valuation.id,
      expense.valuation.id,
    );
    await database.runAsync(
      `INSERT OR IGNORE INTO ledger_valuation_snapshots (
        id, server_id, expense_id, expense_revision, policy, original_amount_minor, original_currency,
        original_scale, settlement_amount_minor, settlement_currency, settlement_scale,
        rate_snapshot_id, payment_record_id, reason, is_active, created_at, decimal_rate,
        rounding_mode, effective_at, supersedes_valuation_id, reference_evidence_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      existingValuation?.id ?? expense.valuation.id,
      expense.valuation.id,
      localId,
      expense.revision,
      expense.valuation.policy,
      expense.valuation.original.minor,
      expense.valuation.original.currency,
      expense.valuation.original.scale,
      expense.valuation.settlement.minor,
      expense.valuation.settlement.currency,
      expense.valuation.settlement.scale,
      expense.valuation.rateSnapshotId,
      expense.valuation.paymentRecordId,
      expense.valuation.reason,
      1,
      expense.updatedAt,
      expense.valuation.decimalRate ?? null,
      expense.valuation.roundingMode ?? "HALF_UP",
      expense.valuation.effectiveAt ?? null,
      expense.valuation.supersedesValuationId ?? null,
      expense.valuation.referenceEvidence
        ? JSON.stringify(expense.valuation.referenceEvidence)
        : null,
    );
    await database.runAsync(
      `UPDATE ledger_valuation_snapshots SET
         server_id = ?, expense_id = ?, expense_revision = ?, policy = ?,
         original_amount_minor = ?, original_currency = ?, original_scale = ?,
         settlement_amount_minor = ?, settlement_currency = ?, settlement_scale = ?,
         rate_snapshot_id = ?, payment_record_id = ?, reason = ?, is_active = 1,
         decimal_rate = ?, rounding_mode = ?, effective_at = ?,
         supersedes_valuation_id = ?, reference_evidence_json = ?
       WHERE id = ?`,
      expense.valuation.id,
      localId,
      expense.revision,
      expense.valuation.policy,
      expense.valuation.original.minor,
      expense.valuation.original.currency,
      expense.valuation.original.scale,
      expense.valuation.settlement.minor,
      expense.valuation.settlement.currency,
      expense.valuation.settlement.scale,
      expense.valuation.rateSnapshotId,
      expense.valuation.paymentRecordId,
      expense.valuation.reason,
      expense.valuation.decimalRate ?? null,
      expense.valuation.roundingMode ?? "HALF_UP",
      expense.valuation.effectiveAt ?? null,
      expense.valuation.supersedesValuationId ?? null,
      expense.valuation.referenceEvidence
        ? JSON.stringify(expense.valuation.referenceEvidence)
        : null,
      existingValuation?.id ?? expense.valuation.id,
    );
  }
  for (const payment of expense.paymentRecords) {
    await applyPayment(database, localId, payment, expense.updatedAt);
  }
  for (const event of expense.auditEvents) {
    await database.runAsync(
      `INSERT OR REPLACE INTO ledger_expense_audit_events (
        id, server_id, expense_id, expense_revision, event_type, reason, after_json,
        actor_user_id, actor_member_id, changed_groups_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      event.id,
      event.id,
      localId,
      event.revision,
      event.eventType,
      event.reason,
      JSON.stringify({ id: localId, revision: event.revision }),
      event.actorUserId,
      event.actorMemberId,
      JSON.stringify(event.changedGroups),
      event.createdAt,
    );
  }
}

async function applyPayment(
  database: LedgerReadDatabase,
  expenseId: string,
  payment: ServerPaymentRecord,
  createdAt: string,
) {
  const existing = await database.getFirstAsync<{ id: string }>(
    "SELECT id FROM ledger_payment_records WHERE id = ? OR server_id = ?",
    payment.id,
    payment.id,
  );
  await database.runAsync(
    `INSERT OR REPLACE INTO ledger_payment_records (
      id, server_id, expense_id, expense_revision, payer_member_id, instrument_label,
      authorization_amount_minor, authorization_currency, authorization_scale,
      posted_amount_minor, posted_currency, posted_scale, authorized_at, posted_at,
      fee_amount_minor, fee_currency, fee_scale, bank_fx_rate, source, notes,
      supersedes_payment_record_id, revision, sync_status, last_synced_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'SYNCED', ?, ?)`,
    existing?.id ?? payment.id,
    payment.id,
    expenseId,
    payment.expenseRevision ?? 1,
    payment.payerMemberId ?? null,
    payment.instrumentLabel,
    payment.authorization?.minor ?? null,
    payment.authorization?.currency ?? null,
    payment.authorization?.scale ?? null,
    payment.posted?.minor ?? null,
    payment.posted?.currency ?? null,
    payment.posted?.scale ?? null,
    payment.authorizedAt ?? null,
    payment.postedAt,
    payment.fee?.minor ?? null,
    payment.fee?.currency ?? null,
    payment.fee?.scale ?? null,
    payment.bankFxRate ?? null,
    payment.source ?? null,
    payment.notes ?? null,
    payment.supersedesPaymentRecordId,
    new Date().toISOString(),
    createdAt,
  );
  if (payment.auditEvent) {
    const event = payment.auditEvent;
    await database.runAsync(
      `INSERT OR REPLACE INTO ledger_expense_audit_events (
        id, server_id, expense_id, expense_revision, event_type, reason,
        after_json, actor_user_id, actor_member_id, changed_groups_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      event.id,
      event.id,
      expenseId,
      event.revision,
      event.eventType,
      event.reason,
      JSON.stringify({ paymentRecordId: payment.id }),
      event.actorUserId,
      event.actorMemberId,
      JSON.stringify(event.changedGroups),
      event.createdAt,
    );
  }
}

async function deferChange(
  database: LedgerReadDatabase,
  journeyId: string,
  change: ServerChange,
) {
  await database.runAsync(
    `INSERT OR REPLACE INTO ledger_deferred_server_changes (
      journey_id, entity_type, entity_id, revision, payload_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?)`,
    journeyId,
    change.entityType,
    change.entityId,
    change.revision,
    JSON.stringify(change),
    new Date().toISOString(),
  );
}

async function drainDeferredExpenseChanges(
  database: LedgerReadDatabase,
  journeyId: string,
  userId: string,
) {
  const deferred = await database.getAllAsync<{
    entityId: string;
    revision: number;
    payloadJson: string;
  }>(
    `SELECT entity_id AS entityId, revision, payload_json AS payloadJson
     FROM ledger_deferred_server_changes
     WHERE journey_id = ? AND entity_type = 'EXPENSE'
     ORDER BY revision, created_at`,
    journeyId,
  );
  for (const row of deferred) {
    const local = await database.getFirstAsync<{ syncStatus: string }>(
      `SELECT sync_status AS syncStatus FROM ledger_expenses
       WHERE journey_id = ? AND (id = ? OR server_id = ?)`,
      journeyId,
      row.entityId,
      row.entityId,
    );
    if (local && pendingStatuses.has(local.syncStatus)) continue;
    try {
      const change = JSON.parse(row.payloadJson) as ServerChange;
      if (!change.aggregate || !("creatorMemberId" in change.aggregate)) continue;
      await applyExpenseChange(database, journeyId, change, userId);
      await database.runAsync(
        `DELETE FROM ledger_deferred_server_changes
         WHERE journey_id = ? AND entity_type = 'EXPENSE' AND entity_id = ? AND revision = ?`,
        journeyId,
        row.entityId,
        row.revision,
      );
    } catch {
      // Keep malformed or currently inapplicable diagnostics for a later health review.
    }
  }
}

async function saveCursor(
  database: LedgerReadDatabase,
  journeyId: string,
  cursor: string | null,
  serverTime: string,
  userId: string,
) {
  await database.runAsync(
    `INSERT INTO ledger_sync_cursors (
      user_id, journey_id, cursor, server_time, updated_at
    ) VALUES (?, ?, ?, ?, ?) ON CONFLICT(user_id,journey_id) DO UPDATE SET
      cursor=excluded.cursor,server_time=excluded.server_time,updated_at=excluded.updated_at`,
    userId,
    journeyId,
    cursor,
    serverTime,
    new Date().toISOString(),
  );
}
