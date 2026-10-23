import type { LedgerReadDatabase } from "./ledgerReadRepository";
import { createUuid } from "@/domain/localId";
import {
  withAccountApplyGate,
  assertAccountRequestContext,
  type AccountRequestContext,
} from "../auth/accountRequestContext";
import { announceLedgerQueueWorkAvailable } from "../sync/ledgerQueueActivity";
// A local read continuation in the existing outbox, never an API mutation or a new retry engine.
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
      await withAccountApplyGate(() =>
        db.withTransactionAsync(async () => {
          await assertAccountRequestContext(scope, account);
          const prior = await db.getFirstAsync<{
            id: string;
            status: string;
            next_attempt_at: string | null;
            payload_json: string;
            lease_expires_at: string | null;
          }>(
            "SELECT id,status,next_attempt_at,payload_json,lease_expires_at FROM sync_operations WHERE owner_user_id=? AND trip_id=? AND entity_type='TRIP_READBACK' AND operation_type='TRIP_NORMAL_READBACK' ORDER BY rowid LIMIT 1",
            scope.accountId,
            scope.tripId,
          );
          const same =
            prior && JSON.parse(prior.payload_json).triggerVersion === triggerVersion;
          if (
            same &&
            ((prior.status === "COMPLETED" && !force) ||
              (prior.next_attempt_at && Date.parse(prior.next_attempt_at) > now()) ||
              (prior.status === "PROCESSING" &&
                prior.lease_expires_at &&
                Date.parse(prior.lease_expires_at) > now()))
          )
            return;
          id = prior?.id ?? createUuid();
          const instant = new Date(now()).toISOString();
          if (prior)
            await db.runAsync(
              "UPDATE sync_operations SET status='PROCESSING',lease_expires_at=?,next_attempt_at=NULL,payload_json=?,updated_at=? WHERE id=?",
              new Date(now() + 30000).toISOString(),
              JSON.stringify({
                version: 1,
                tripId: scope.tripId,
                createOperationId,
                triggerVersion,
              }),
              instant,
              id,
            );
          else
            await db.runAsync(
              "INSERT INTO sync_operations(id,trip_id,entity_type,entity_id,operation_type,idempotency_key,payload_json,owner_user_id,status,attempt_count,lease_expires_at,created_at,updated_at) VALUES(?,?,'TRIP_READBACK',?,'TRIP_NORMAL_READBACK',?,?,?,'PROCESSING',0,?,?,?)",
              id,
              scope.tripId,
              scope.tripId,
              id,
              JSON.stringify({
                version: 1,
                tripId: scope.tripId,
                createOperationId,
                triggerVersion,
              }),
              scope.accountId,
              new Date(now() + 30000).toISOString(),
              instant,
              instant,
            );
        }),
      );
      if (!id) return false;
      const operationId = id;
      try {
        await work();
        await assertAccountRequestContext(scope, account);
        await withAccountApplyGate(() =>
          db.withTransactionAsync(async () => {
            await assertAccountRequestContext(scope, account);
            await db.runAsync(
              "UPDATE sync_operations SET status='COMPLETED',attempt_count=0,lease_expires_at=NULL,next_attempt_at=NULL,last_error_code=NULL,updated_at=? WHERE owner_user_id=? AND id=?",
              new Date(now()).toISOString(),
              scope.accountId,
              operationId,
            );
            await assertAccountRequestContext(scope, account);
          }),
        );
        return true;
      } catch (error) {
        await assertAccountRequestContext(scope, account);
        await withAccountApplyGate(() =>
          db.withTransactionAsync(async () => {
            await assertAccountRequestContext(scope, account);
            const row = await db.getFirstAsync<{ attempt_count: number }>(
              "SELECT attempt_count FROM sync_operations WHERE id=? AND owner_user_id=?",
              operationId,
              scope.accountId,
            );
            const wait = Math.min(
              300000,
              15000 * 2 ** Math.min(row?.attempt_count ?? 0, 5),
            );
            await db.runAsync(
              "UPDATE sync_operations SET status='RETRYABLE',attempt_count=attempt_count+1,lease_expires_at=NULL,next_attempt_at=?,last_error_code='TRIP_READBACK_REQUIRED',updated_at=? WHERE owner_user_id=? AND id=?",
              new Date(now() + wait).toISOString(),
              new Date(now()).toISOString(),
              scope.accountId,
              operationId,
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
