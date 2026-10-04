import { z } from "zod";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const canonicalPersonIdSchema = z
  .string()
  .regex(uuid)
  .transform((id) => id.toLowerCase());
const canonicalUuid = z
  .string()
  .regex(uuid)
  .refine((id) => id === id.toLowerCase());
export const participationPairSchema = z.object({
  id: canonicalPersonIdSchema,
  isParticipating: z.boolean(),
  participationRevision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
});
export type ParticipationObservation = z.infer<typeof participationPairSchema>;
export const participationFingerprintSchema = z.string().regex(/^[0-9a-f]{64}$/);
export const participationObservationTimeSchema = z
  .string()
  .datetime({ precision: 6 })
  .refine((value) => !value.startsWith("0000-"));
export const participationSnapshotSchema = z.strictObject({
  contractVersion: z.literal(1),
  complete: z.literal(true),
  personCount: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  fingerprintVersion: z.literal(1),
  fingerprint: participationFingerprintSchema,
  observedAt: participationObservationTimeSchema,
});
export const participationVerificationSchema = participationSnapshotSchema.omit({
  complete: true,
  personCount: true,
});
export type ParticipationSnapshot = z.infer<typeof participationSnapshotSchema>;

export function canonicalParticipationIds(rows: readonly unknown[]) {
  const ids = rows.map((row) => participationPairSchema.parse(row).id).sort();
  if (new Set(ids).size !== ids.length) throw new Error("Duplicate Trip Person ID.");
  return ids;
}
export function serializeParticipationVector(rows: readonly unknown[]) {
  const parsed = rows.map((row) => participationPairSchema.parse(row));
  canonicalParticipationIds(parsed);
  parsed.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return (
    "otr-trip-participation-v1\n" +
    JSON.stringify(
      parsed.map((row) => [
        row.id,
        row.isParticipating,
        String(row.participationRevision),
      ]),
    )
  );
}
const sharedCursorSchema = z.strictObject({
  version: z.literal(2),
  purpose: z.literal("LEDGER_SHARED"),
  sequence: z
    .number()
    .int()
    .min(0)
    .max(Number.MAX_SAFE_INTEGER)
    .refine((value) => !Object.is(value, -0)),
  tripId: canonicalUuid,
  userId: canonicalUuid,
  snapshotContractVersion: z.literal(1),
  participationFingerprintVersion: z.literal(1),
  participationFingerprint: participationFingerprintSchema,
});
export type SharedLedgerCursor = z.infer<typeof sharedCursorSchema>;
export function encodeSharedLedgerCursor(
  sequence: number,
  tripId: string,
  userId: string,
  participationFingerprint: string,
) {
  const value = sharedCursorSchema.parse({
    version: 2,
    purpose: "LEDGER_SHARED",
    sequence,
    tripId,
    userId,
    snapshotContractVersion: 1,
    participationFingerprintVersion: 1,
    participationFingerprint,
  });
  return btoa(JSON.stringify(value))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
export function decodeSharedLedgerCursor(
  token: string | null,
  tripId: string,
  userId: string,
): SharedLedgerCursor {
  if (!token || token.length > 1024 || !/^[A-Za-z0-9_-]+$/.test(token))
    throw new Error("INVALID_CURSOR");
  try {
    const value = sharedCursorSchema.parse(
      JSON.parse(atob(token.replace(/-/g, "+").replace(/_/g, "/"))),
    );
    if (
      value.tripId !== tripId ||
      value.userId !== userId ||
      encodeSharedLedgerCursor(
        value.sequence,
        value.tripId,
        value.userId,
        value.participationFingerprint,
      ) !== token
    )
      throw new Error();
    return value;
  } catch {
    throw new Error("INVALID_CURSOR");
  }
}
