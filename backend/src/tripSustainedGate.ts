import type { CorePgLease } from "./tripCoreV2PgStorage";
export type CoreGateMode = { sustainedDev?: true };
export async function readCoreGate(
  lease: CorePgLease,
  actor: string,
  trip: string,
  mode?: CoreGateMode,
  projection:
    | "runtime_enabled"
    | "runtime_enabled,enabled_commands"
    | "enabled_commands,enabled_families,enabled_admission_modes"
    | "enabled_families,enabled_admission_modes" = "enabled_commands,enabled_families,enabled_admission_modes",
) {
  return (
    await lease.query(
      mode?.sustainedDev
        ? "SELECT runtime_enabled,enabled_commands,enabled_families,enabled_admission_modes FROM public.trip_sustained_core_capabilities($1::uuid,$2::uuid)"
        : `SELECT ${projection} FROM public.trip_core_activation_gate WHERE singleton`,
      mode?.sustainedDev ? [actor, trip] : undefined,
    )
  ).rows[0];
}
