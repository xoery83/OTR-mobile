import { ApiClientError } from "@/data/api/client";
import type { AccountRequestContext } from "@/data/auth/accountRequestContext";
import {
  canonicalParticipationIds,
  canonicalPersonIdSchema,
  decodeSharedLedgerCursor,
  participationSnapshotSchema,
  participationVerificationSchema,
  serializeParticipationVector,
} from "@/domain/trip/participationSnapshot";
import type {
  LedgerBootstrapResponse,
  LedgerChangesResponse,
} from "@/data/api/ledgerReadContracts";
import type { LedgerReadDatabase } from "./ledgerReadRepository";

export async function fingerprintParticipation(rows: readonly unknown[]) {
  return hashTripPersonBytes(serializeParticipationVector(rows));
}
export async function hashTripPersonBytes(value: string) {
  const crypto = await import("expo-crypto");
  return crypto.digestStringAsync(crypto.CryptoDigestAlgorithm.SHA256, value);
}
function invalidCertificate(): never {
  throw new ApiClientError(
    "Trip Person snapshot refresh required.",
    "validation",
    400,
    "INVALID_CURSOR",
  );
}
export async function validateParticipationBootstrap(
  response: LedgerBootstrapResponse,
  context: AccountRequestContext,
) {
  const snapshot = participationSnapshotSchema.parse(response.participationSnapshot);
  const token = decodeSharedLedgerCursor(
    response.cursor,
    context.tripId,
    context.accountId,
  );
  if (
    response.journey.id !== context.tripId ||
    response.actor.userId !== context.accountId ||
    snapshot.personCount !== response.members.length ||
    token.participationFingerprint !== snapshot.fingerprint ||
    (await fingerprintParticipation(response.members)) !== snapshot.fingerprint
  )
    throw new Error("Invalid Trip Person snapshot binding.");
}
async function localVector(database: LedgerReadDatabase, tripId: string, ids: string[]) {
  const rows = await database.getAllAsync<{
    id: string;
    active: number | null;
    revision: number | null;
  }>(
    "SELECT id, participation_active AS active, participation_revision AS revision FROM ledger_members WHERE journey_id = ?",
    tripId,
  );
  const map = new Map(rows.map((row) => [row.id, row]));
  return ids.map((id) => {
    const row = map.get(id);
    if (!row || row.active === null || row.revision === null) return invalidCertificate();
    return { id, isParticipating: row.active === 1, participationRevision: row.revision };
  });
}
export async function saveParticipationBootstrap(
  database: LedgerReadDatabase,
  response: LedgerBootstrapResponse,
  context: AccountRequestContext,
) {
  const snapshot = participationSnapshotSchema.parse(response.participationSnapshot);
  const ids = canonicalParticipationIds(response.members);
  if (
    (await fingerprintParticipation(await localVector(database, context.tripId, ids))) !==
    snapshot.fingerprint
  )
    invalidCertificate();
  await database.runAsync(
    `UPDATE ledger_sync_cursors SET
    participation_snapshot_contract_version=1, participation_fingerprint_version=1,
    participation_fingerprint=?, participation_person_ids_json=?, participation_observed_at=?,
    participation_verified_at=?, participation_bound_cursor=? WHERE user_id=? AND journey_id=?`,
    snapshot.fingerprint,
    JSON.stringify(ids),
    snapshot.observedAt,
    snapshot.observedAt,
    response.cursor,
    context.accountId,
    context.tripId,
  );
}
export async function readParticipationCertificate(
  database: LedgerReadDatabase,
  context: AccountRequestContext,
) {
  const row = await database.getFirstAsync<{
    cursor: string | null;
    participation_snapshot_contract_version: number | null;
    participation_fingerprint_version: number | null;
    participation_fingerprint: string | null;
    participation_person_ids_json: string | null;
    participation_observed_at: string | null;
    participation_verified_at: string | null;
    participation_bound_cursor: string | null;
  }>(
    "SELECT * FROM ledger_sync_cursors WHERE user_id=? AND journey_id=?",
    context.accountId,
    context.tripId,
  );
  try {
    if (!row || row.cursor !== row.participation_bound_cursor) return null;
    const ids: string[] = JSON.parse(row.participation_person_ids_json ?? "null");
    if (
      !Array.isArray(ids) ||
      ids.some((id) => canonicalPersonIdSchema.parse(id) !== id) ||
      JSON.stringify([...new Set(ids)].sort()) !== row.participation_person_ids_json
    )
      return null;
    const snapshot = participationSnapshotSchema.parse({
      contractVersion: row.participation_snapshot_contract_version,
      complete: true,
      personCount: ids.length,
      fingerprintVersion: row.participation_fingerprint_version,
      fingerprint: row.participation_fingerprint,
      observedAt: row.participation_observed_at,
    });
    participationVerificationSchema.parse({
      contractVersion: 1,
      fingerprintVersion: 1,
      fingerprint: snapshot.fingerprint,
      observedAt: row.participation_verified_at,
    });
    const token = decodeSharedLedgerCursor(row.cursor, context.tripId, context.accountId);
    if (
      token.participationFingerprint !== snapshot.fingerprint ||
      (await fingerprintParticipation(
        await localVector(database, context.tripId, ids),
      )) !== snapshot.fingerprint
    )
      return null;
    return {
      snapshot,
      ids,
      cursor: row.cursor,
      verifiedAt: row.participation_verified_at,
    };
  } catch {
    return null;
  }
}
export async function validateParticipationPage(
  database: LedgerReadDatabase,
  response: LedgerChangesResponse,
  context: AccountRequestContext,
  requestCursor: string | null,
) {
  const certificate = await readParticipationCertificate(database, context);
  if (!certificate || certificate.cursor !== requestCursor) invalidCertificate();
  const verification = participationVerificationSchema.parse(
    response.participationVerification,
  );
  const token = decodeSharedLedgerCursor(
    response.cursor,
    context.tripId,
    context.accountId,
  );
  const previous = decodeSharedLedgerCursor(
    requestCursor,
    context.tripId,
    context.accountId,
  );
  if (
    verification.fingerprint !== certificate.snapshot.fingerprint ||
    token.participationFingerprint !== verification.fingerprint ||
    token.sequence < previous.sequence
  )
    invalidCertificate();
}
export async function saveParticipationPage(
  database: LedgerReadDatabase,
  response: LedgerChangesResponse,
  context: AccountRequestContext,
) {
  const verification = participationVerificationSchema.parse(
    response.participationVerification,
  );
  const certificate = await readParticipationCertificate(database, context);
  if (!certificate || certificate.snapshot.fingerprint !== verification.fingerprint)
    invalidCertificate();
  await database.runAsync(
    "UPDATE ledger_sync_cursors SET participation_bound_cursor=?,participation_verified_at=? WHERE user_id=? AND journey_id=?",
    response.cursor,
    verification.observedAt,
    context.accountId,
    context.tripId,
  );
}
