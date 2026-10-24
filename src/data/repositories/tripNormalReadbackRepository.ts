import type { LedgerReadDatabase } from "./ledgerReadRepository";
import { createUuid } from "@/domain/localId";
import { syncFailureDetails } from "../sync/syncEngine";
import {
  withAccountApplyGate,
  assertAccountRequestContext,
  type AccountRequestContext,
} from "../auth/accountRequestContext";
import { announceLedgerQueueWorkAvailable } from "../sync/ledgerQueueActivity";
// Local continuation only. Existing queue owner supplies timing; this never sends a business operation.
export function createTripNormalReadbackRepository(
  db: LedgerReadDatabase,
  account: () => Promise<string>,
  now = () => Date.now(),
) {
  return {
    async run(
      scope: AccountRequestContext,
      createOperationId: string,
      work: () => Promise<void>,
      triggerVersion: string,
      force = false,
    ) {
      let id: string | undefined;
      const claim = createUuid();
      let signaled = false;
      await withAccountApplyGate(() =>
        db.withTransactionAsync(async () => {
          await assertAccountRequestContext(scope, account);
          const prior = await db.getFirstAsync<{
            id: string;
            status: string;
            payload_json: string;
            next_attempt_at: string | null;
            lease_expires_at: string | null;
            claim_owner: string | null;
          }>(
            "SELECT * FROM sync_operations WHERE owner_user_id=? AND trip_id=? AND entity_type='TRIP_READBACK' AND operation_type='TRIP_NORMAL_READBACK' ORDER BY rowid LIMIT 1",
            scope.accountId,
            scope.tripId,
          );
          const same =
            prior && JSON.parse(prior.payload_json).triggerVersion === triggerVersion;
          // A newer request never steals a live read. Its completion queues one follow-up instead.
          if (
            prior?.status === "PROCESSING" &&
            prior.lease_expires_at &&
            Date.parse(prior.lease_expires_at) > now()
          ) {
            if (!same) {
              await db.runAsync(
                "UPDATE sync_operations SET last_error_code='TRIP_READBACK_NEXT' WHERE id=? AND owner_user_id=? AND claim_owner=?",
                prior.id,
                scope.accountId,
                prior.claim_owner,
              );
              signaled = true;
            }
            return;
          }
          if (
            same &&
            ((prior.status === "COMPLETED" && !force) ||
              (prior.next_attempt_at && Date.parse(prior.next_attempt_at) > now()))
          )
            return;
          id = prior?.id ?? createUuid();
          const instant = new Date(now()).toISOString();
          const payload = JSON.stringify({
            version: 1,
            tripId: scope.tripId,
            createOperationId,
            triggerVersion,
          });
          if (prior)
            await db.runAsync(
              "UPDATE sync_operations SET status='PROCESSING',claim_owner=?,lease_expires_at=?,next_attempt_at=NULL,last_error_code=NULL,failure_category=NULL,payload_json=?,updated_at=? WHERE id=?",
              claim,
              new Date(now() + 30000).toISOString(),
              payload,
              instant,
              id,
            );
          else
            await db.runAsync(
              "INSERT INTO sync_operations(id,trip_id,entity_type,entity_id,operation_type,idempotency_key,payload_json,owner_user_id,status,attempt_count,claim_owner,lease_expires_at,created_at,updated_at) VALUES(?,?,'TRIP_READBACK',?,'TRIP_NORMAL_READBACK',?,?,?,'PROCESSING',0,?,?,?,?)",
              id,
              scope.tripId,
              scope.tripId,
              id,
              payload,
              scope.accountId,
              claim,
              new Date(now() + 30000).toISOString(),
              instant,
              instant,
            );
          await assertAccountRequestContext(scope, account);
        }),
      );
      if (signaled) announceLedgerQueueWorkAvailable();
      if (!id) return false;
      const operationId = id;
      try {
        await work();
        let applied = false;
        await withAccountApplyGate(() =>
          db.withTransactionAsync(async () => {
            await assertAccountRequestContext(scope, account);
            const row = await db.getFirstAsync<{ last_error_code: string | null }>(
              "SELECT last_error_code FROM sync_operations WHERE owner_user_id=? AND id=? AND claim_owner=? AND status='PROCESSING'",
              scope.accountId,
              operationId,
              claim,
            );
            if (!row) return;
            const followup = row.last_error_code === "TRIP_READBACK_NEXT";
            await db.runAsync(
              "UPDATE sync_operations SET status=?,attempt_count=0,claim_owner=NULL,lease_expires_at=NULL,next_attempt_at=?,last_error_code=NULL,failure_category=NULL,updated_at=? WHERE owner_user_id=? AND id=? AND claim_owner=?",
              followup ? "RETRYABLE" : "COMPLETED",
              followup ? new Date(now()).toISOString() : null,
              new Date(now()).toISOString(),
              scope.accountId,
              operationId,
              claim,
            );
            applied = true;
            signaled = followup;
            await assertAccountRequestContext(scope, account);
          }),
        );
        if (signaled) announceLedgerQueueWorkAvailable();
        return applied;
      } catch (error) {
        await withAccountApplyGate(() =>
          db.withTransactionAsync(async () => {
            await assertAccountRequestContext(scope, account);
            const row = await db.getFirstAsync<{ attempt_count: number }>(
              "SELECT attempt_count FROM sync_operations WHERE owner_user_id=? AND id=? AND claim_owner=? AND status='PROCESSING'",
              scope.accountId,
              operationId,
              claim,
            );
            if (!row) return;
            const failure = syncFailureDetails(
              error instanceof Error ? error : Error("TRIP_READBACK_FAILED"),
            );
            const auth = failure.classification === "auth";
            const wait = Math.min(300000, 15000 * 2 ** Math.min(row.attempt_count, 5));
            await db.runAsync(
              "UPDATE sync_operations SET status='RETRYABLE',attempt_count=attempt_count+1,claim_owner=NULL,lease_expires_at=NULL,next_attempt_at=?,failure_category=?,last_error_code='TRIP_READBACK_REQUIRED',updated_at=? WHERE owner_user_id=? AND id=? AND claim_owner=?",
              auth ? null : new Date(now() + wait).toISOString(),
              failure.category,
              new Date(now()).toISOString(),
              scope.accountId,
              operationId,
              claim,
            );
            await assertAccountRequestContext(scope, account);
          }),
        );
        announceLedgerQueueWorkAvailable();
        throw error;
      }
    },
  };
}
