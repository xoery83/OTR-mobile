// Hash/owner baseline: frozen e89b3d5b receipt. API EXEC deny: owning SQL
// 20261013000500_trip_create_owning_port.sql:72 and dev-forward
// trip-create/20261017000100_trip_create_finite_contract.sql:68. Never learn from live.
export const PARENT_READINESS_BASELINE = [
  { signature: "public.trip_create_parent_result(uuid,uuid)", key: "source_md5", md5: "a46e6e13183b4e228640d8774dbd00ab" },
  { signature: "public.trip_create_result(uuid,uuid)", key: "definition_md5", md5: "f850804dd98ebd5f33633498000e9e8a" },
  { signature: "public.trip_create_finite_scope_allowed(uuid,uuid,uuid)", key: "definition_md5", md5: "2fc18c1345ab1ae7231a33893745fb52" },
] as const;

export function matchesParentReadinessMetadata(rows: readonly Record<string, unknown>[]) {
  return rows.length === PARENT_READINESS_BASELINE.length && PARENT_READINESS_BASELINE.every((expected) => {
    const matching = rows.filter((row) => row.signature === expected.signature);
    if (matching.length !== 1) return false;
    const row = matching[0];
    if (row.present !== true || row.owner !== "postgres" || row.security_definer !== true ||
        row[expected.key] !== expected.md5 || row.executable !== true ||
        row.anon_executable !== false || row.authenticated_executable !== false ||
        row.service_role_executable !== false) return false;
    return expected.key !== "source_md5" ||
      (row.return_type === "jsonb" &&
        Array.isArray(row.settings) && row.settings.length === 1 && row.settings[0] === "search_path=pg_catalog");
  });
}
