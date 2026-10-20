export const missingEconomicDateRule = "RESTORE_MISSING_ECONOMIC_DATE_V1";

type ImportProvenance = Record<string, unknown> | null;

export function stage9DateOnlyEvidence(
  occurredAt: string,
  provenance: ImportProvenance,
): string | null {
  if (
    provenance?.occurredPrecision !== "DATE" ||
    provenance.mappingVersion !== "legacy-ledger-to-ledger2-v1" ||
    !["stage9-europe-replay-v2", "stage9-europe-replay-v3"].includes(
      String(provenance.transformVersion),
    )
  )
    return null;
  const match = /^(\d{4}-\d{2}-\d{2})T00:00:00(?:\.000)?(?:Z|\+00:00)$/.exec(occurredAt);
  if (!match) return null;
  const parsed = new Date(`${match[1]}T00:00:00Z`);
  return Number.isFinite(parsed.valueOf()) &&
    parsed.toISOString().slice(0, 10) === match[1]
    ? match[1]
    : null;
}

export function classifyMissingEconomicDate(input: {
  occurredAt: string;
  importProvenance: ImportProvenance;
  conflictingDateEvidence?: boolean;
}) {
  const date = input.conflictingDateEvidence
    ? null
    : stage9DateOnlyEvidence(input.occurredAt, input.importProvenance);
  return date
    ? ({ disposition: "AUTO_SAFE", date, source: "STAGE9_DATE_ONLY_V1" } as const)
    : ({ disposition: "USER_ACTION_REQUIRED", date: null, source: null } as const);
}
