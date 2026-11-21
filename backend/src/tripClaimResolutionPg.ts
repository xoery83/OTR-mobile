import { z } from "zod";
import { coreUuid } from "../../src/domain/trip/tripCoreV2";
import {
  claimResolutionScopeSchema,
  claimRequestSnapshotSchema,
  claimResolutionReceiptSchema,
  claimResolutionRequestViewSchema,
  claimResolutionRequestIndexSchema,
  claimCreatePersonContextSchema,
} from "../../src/data/api/claimResolutionContracts";
import {
  createClaimResolutionCore,
  readClaimResolutionViewOnTransaction,
  readClaimResolutionPendingRequestsOnTransaction,
  verifyClaimGeneralOriginOnTransaction,
  readClaimGeneralInitialPersonsOnTransaction,
  issueClaimGeneralInviteOnTransaction,
  recoverClaimGeneralInviteOnTransaction,
  readClaimGeneralInviteDeliveryOnTransaction,
  readClaimCreatePersonContextOnTransaction,
  type ClaimResolutionStorage,
  type ClaimResolutionTransaction,
  type ClaimResolutionOwningEffects,
} from "./tripClaimResolutionCore";
import type { CorePgConnection } from "./tripCoreV2PgStorage";
import type { ClaimOriginAuthority } from "../../src/data/api/claimOriginContracts";
import type { GeneralInviteAuthority } from "../../src/data/api/generalInviteContracts";
import { readClaimProvisionalViewOnTransaction } from "./tripClaimProvisionalRead";
import { claimProvisionalViewSchema } from "../../src/data/api/claimProvisionalContracts";

const hash = z.string().regex(/^[a-f0-9]{64}$/);
const stored = z.strictObject({ inviteId: coreUuid, sourceFingerprint: hash, snapshot: claimRequestSnapshotSchema });
const receiptRow = z.strictObject({
  version: z.union([z.literal(1), z.literal(2), z.literal(3)]), actor: coreUuid,
  trip: coreUuid, request: coreUuid.nullable(), digest: hash, body: z.unknown(),
});
class ResolutionConflict extends Error {}
class ResolutionDenied extends Error {}

export function composeGeneralInvitePg(connection: CorePgConnection, enabled = false, assertOpen = () => {}): GeneralInviteAuthority | undefined {
  if (!enabled) return undefined;
  const storage = createClaimResolutionPgStorage(connection, assertOpen);
  return {
    async issue(scope, input) {
      try { return { status: "RECORDED", receipt: await storage.atomic(scope, tx => issueClaimGeneralInviteOnTransaction(tx, scope, input)) }; }
      catch (error) {
        if (error instanceof ResolutionConflict) return { status: "CONFLICT" };
        if (error instanceof ResolutionDenied) return { status: "DENIED" };
        throw error;
      }
    },
    recover: (scope, operationId) => storage.atomic(scope, tx => recoverClaimGeneralInviteOnTransaction(tx, scope, operationId)),
    delivery: (scope, operationId) => storage.atomic(scope, tx => readClaimGeneralInviteDeliveryOnTransaction(tx, scope, operationId)),
  };
}

// Separate explicit capability: a verified origin grants neither membership nor Claim execution.
export function composeClaimOriginPg(connection: CorePgConnection, enabled = false, assertOpen = () => {}): ClaimOriginAuthority | undefined {
  if (!enabled) return undefined;
  const storage = createClaimResolutionPgStorage(connection, assertOpen);
  return {
    verify: (scope, input) => storage.atomic(scope, tx => verifyClaimGeneralOriginOnTransaction(tx, scope, input)),
    initialPersons: (scope, input) => storage.atomic(scope, tx => readClaimGeneralInitialPersonsOnTransaction(tx, scope, input)),
  };
}

// Source-only; callers must supply qualified effects. No SQL installation or runtime mount.
export function createClaimResolutionPgStorage(connection: CorePgConnection, assertOpen = () => {}): ClaimResolutionStorage {
  return {
    async atomic(scopeInput, work) {
      const scope = claimResolutionScopeSchema.parse(scopeInput);
      assertOpen();
      return connection.withLease(async lease => {
        let active = true, pending = false, failed = false, commitAttempted = false;
        let methods = 0;
        const query: typeof lease.query = async (sql, parameters) => {
          assertOpen();
          if (!active || pending || failed) {
            failed = true;
            throw Error("CLAIM_RESOLUTION_TRANSACTION_UNAVAILABLE");
          }
          pending = true;
          try {
            const result = await lease.query(sql, parameters);
            if (!active) throw Error("CLAIM_RESOLUTION_TRANSACTION_RELEASED");
            return result;
          } catch (error) { failed = true; throw error; }
          finally { pending = false; }
        };
        const call = async (method: string, payload: unknown = {}) => {
          const result = await query(
            "SELECT public.trip_claim_resolution_state($1::text,$2::uuid,$3::uuid,$4::jsonb) AS result",
            [method, scope.actorAccountId, scope.tripId, JSON.stringify(payload)],
          );
          if (result.rows.length !== 1 || !("result" in result.rows[0]))
            throw Error("CLAIM_RESOLUTION_RESULT_MISSING");
          return result.rows[0].result;
        };
        const checkRow = (input: unknown) => {
          const row = stored.parse(input);
          if (row.snapshot.tripId !== scope.tripId) throw Error("CLAIM_RESOLUTION_TRIP_MISMATCH");
          return row;
        };
        const tx: ClaimResolutionTransaction = {
          lease: {
            verifiedSourceSession: lease.verifiedSourceSession,
            query,
            retire: () => {
              if (!active) throw Error("CLAIM_RESOLUTION_TRANSACTION_RELEASED");
              failed = true;
              lease.retire();
            },
          },
          now: async () => z.iso.datetime({ offset: true }).parse(await call("clock")),
          resolver: async () => z.boolean().parse(await call("resolver")),
          request: async id => {
            const requestId = coreUuid.parse(id);
            const raw = await call("request", { requestId });
            if (raw === null) return null;
            const row = checkRow(raw);
            if (row.snapshot.requestId !== requestId) throw Error("CLAIM_RESOLUTION_REQUEST_MISMATCH");
            return row;
          },
          receipt: async id => {
            const operationId = coreUuid.parse(id);
            const raw = await call("receipt", { operationId });
            if (raw === null) return null;
            const row = receiptRow.parse(raw);
            const own = row.actor === scope.actorAccountId && row.trip === scope.tripId;
            if (row.version === 2 && own) {
              const body = claimResolutionReceiptSchema.parse(row.body);
              if (body.operationId !== operationId || body.actorAccountId !== row.actor ||
                  body.tripId !== row.trip || body.requestId !== row.request || body.intentDigest !== row.digest)
                throw Error("CLAIM_RESOLUTION_RECEIPT_MISMATCH");
              return { ...row, body };
            }
            if (row.body !== null) throw Error("CLAIM_RESOLUTION_FOREIGN_RECEIPT_BODY");
            return row;
          },
          saveRequest: async (row, expectedRevision, operationId) => {
            z.literal(true).parse(await call("saveRequest", { row: checkRow(row),
              expectedRevision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable().parse(expectedRevision),
              operationId: coreUuid.parse(operationId) }));
          },
          saveReceipt: async (row, receipt, canonicalIntent) => {
            const snapshot = checkRow(row).snapshot;
            const body = claimResolutionReceiptSchema.parse(receipt);
            if (body.actorAccountId !== scope.actorAccountId || body.tripId !== scope.tripId ||
                body.requestId !== snapshot.requestId || body.afterRevision !== snapshot.revision)
              throw Error("CLAIM_RESOLUTION_RECEIPT_MISMATCH");
            z.literal(true).parse(await call("saveReceipt", { receipt: body, canonicalIntent }));
          },
          revokeGrant: async (row, operation, reason) => {
            const snapshot = checkRow(row).snapshot;
            const operationId = coreUuid.parse(operation);
            const raw = await call("revokeGrant", { requestId: snapshot.requestId, operationId, reason });
            const value = claimResolutionReceiptSchema.shape.effects.shape.provisionalRevocation.parse(raw);
            if (value && (value.requestId !== snapshot.requestId || value.tripId !== scope.tripId ||
                value.claimantAccountId !== snapshot.claimantAccountId || value.operationId !== operationId ||
                value.reason !== reason || value.grantId !== snapshot.provisionalGrant?.grantId ||
                value.beforeRevision !== snapshot.provisionalGrant.revision))
              throw Error("CLAIM_RESOLUTION_GRANT_MISMATCH");
            if (!value && snapshot.provisionalGrant?.state === "ACTIVE")
              throw Error("CLAIM_RESOLUTION_GRANT_REVOCATION_MISSING");
            return value;
          },
        };
        const bounded = Object.fromEntries(Object.entries(tx).map(([name, value]) => [name,
          typeof value !== "function" ? value : async (...args: unknown[]) => {
            if (!active || failed) throw Error("CLAIM_RESOLUTION_TRANSACTION_RELEASED");
            methods++;
            try { return await (value as (...a: unknown[]) => Promise<unknown>)(...args); }
            catch (error) { failed = true; throw error; }
            finally { methods--; }
          },
        ])) as ClaimResolutionTransaction;
        try {
          assertOpen();
          await lease.query("BEGIN");
          await lease.query("SET LOCAL lock_timeout='3s'");
          await lease.query("SET LOCAL statement_timeout='10s'");
          const value = await work(bounded);
          if (pending || methods || failed) throw Error("CLAIM_RESOLUTION_TRANSACTION_UNFINISHED");
          assertOpen();
          active = false;
          commitAttempted = true;
          await lease.query("COMMIT");
          assertOpen();
          return value;
        } catch (error) {
          active = false;
          if (pending || methods || commitAttempted) lease.retire();
          else await lease.query("ROLLBACK").catch(() => lease.retire());
          // A COMMIT response failure remains unknown even if it carries SQLSTATE23505.
          if (!commitAttempted && (error as { code?: unknown } | null)?.code === "23505")
            throw new ResolutionConflict("CLAIM_RESOLUTION_CONFLICT");
          if (!commitAttempted && (error as { code?: unknown } | null)?.code === "42501")
            throw new ResolutionDenied("CLAIM_RESOLUTION_DENIED_WITHOUT_MUTATION");
          throw error;
        } finally { active = false; }
      });
    },
  };
}

export function composeClaimResolutionPg(
  connection: CorePgConnection,
  effects?: ClaimResolutionOwningEffects,
  enabled = false,
  assertOpen = () => {},
) {
  const storage = createClaimResolutionPgStorage(connection, assertOpen);
  const authority = createClaimResolutionCore(storage, effects, enabled);
  if (!authority) return undefined;
  async function conflict<T>(work: () => Promise<T>) {
    try { return await work(); }
    catch (error) {
      if (error instanceof ResolutionConflict)
        return { status: "CONFLICT" as const, currentRevision: null };
      throw error;
    }
  }
  return {
    ...authority,
    readCreatePersonContext: (scope: Parameters<typeof storage.atomic>[0], requestId: string) => storage.atomic(scope,
      async tx => claimCreatePersonContextSchema.nullable().parse(await readClaimCreatePersonContextOnTransaction(tx, scope, requestId))),
    readProvisionalView: (scope: Parameters<typeof storage.atomic>[0], requestId: string) => storage.atomic(scope,
      async tx => claimProvisionalViewSchema.nullable().parse(await readClaimProvisionalViewOnTransaction(tx, scope, requestId))),
    listRequests: (scopeInput: Parameters<typeof storage.atomic>[0], afterRequestId: string | null) => {
      const scope = claimResolutionScopeSchema.parse(scopeInput);
      if (afterRequestId !== null) coreUuid.parse(afterRequestId);
      return storage.atomic(scope, async tx => {
        const raw = await readClaimResolutionPendingRequestsOnTransaction(tx, scope, { afterRequestId });
        if (!raw) return null;
        return claimResolutionRequestIndexSchema.parse({ accountId: scope.actorAccountId, tripId: scope.tripId,
          entries: raw.requests.map(({ initialSubmitOperationId, ...entry }) => ({ ...entry, initialOperationId: initialSubmitOperationId })),
          nextRequestId: raw.nextRequestId });
      });
    },
    readRequestView: (scopeInput: Parameters<typeof storage.atomic>[0], requestId: string) => {
      const scope = claimResolutionScopeSchema.parse(scopeInput);
      coreUuid.parse(requestId);
      return storage.atomic(scope, async tx => {
        const view = await readClaimResolutionViewOnTransaction(tx, scope, requestId);
        if (!view) return null;
        if (view.version !== 1 || view.eligibility.requestRevision !== view.request.revision)
          throw Error("CLAIM_RESOLUTION_VIEW_REVISION_MISMATCH");
        return claimResolutionRequestViewSchema.parse({
          accountId: scope.actorAccountId, tripId: scope.tripId, requestId,
          snapshot: view.request, eligibleActions: view.eligibility.allowedActions, canConsent: view.eligibility.canConsent,
          proposalPreview: view.proposalPreview,
        });
      });
    },
    submitPendingClaim: (...args: Parameters<typeof authority.submitPendingClaim>) =>
      conflict(() => authority.submitPendingClaim(...args)),
    resolveClaimRequest: (...args: Parameters<typeof authority.resolveClaimRequest>) =>
      conflict(() => authority.resolveClaimRequest(...args)),
    consentToResolution: (...args: Parameters<typeof authority.consentToResolution>) =>
      conflict(() => authority.consentToResolution(...args)),
  };
}
