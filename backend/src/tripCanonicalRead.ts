import {
  canonicalCapabilitiesSchema,
  canonicalEventReadSchema,
  eventOperationReceiptSchema,
  type CanonicalCapabilities,
  type CanonicalEventRead,
  type EventOperationReceipt,
} from "../../src/data/api/tripCanonicalReadContracts";

/** Future connector must run fixed read-only SQL under the actual dedicated session.
 * Reserved roles remain NOLOGIN. No connector/credential is provisioned in B-T3E.
 * lookupExactReceipt calls only trip_event_receipt_lookup(actor,trip,operation),
 * whose installed function verifies the immutable receipt hash and read admission.
 */
export type CanonicalReadGatewayConnection = {
  sessionUser(): Promise<string>;
  readInstalledState(): Promise<{ commandVersion: 1 | null; gateClosed: boolean }>;
  lookupExactReceipt(
    actor: string,
    trip: string,
    operation: string,
  ): Promise<unknown | null>;
};
export type CanonicalReadGatewayConfig = {
  connection?: CanonicalReadGatewayConnection;
};
export async function requireCanonicalReadConnection(config: CanonicalReadGatewayConfig) {
  const connection = config.connection;
  if (
    !connection ||
    (await connection.sessionUser()) !== "otr_trip_event_command_gateway"
  )
    return null; // service_role is never a substitute, even for exact recovery.
  return connection;
}
export async function canonicalCapabilities(
  schemaInstalled: boolean,
  config: CanonicalReadGatewayConfig = {},
): Promise<CanonicalCapabilities> {
  const connection = await requireCanonicalReadConnection(config);
  const state = await connection?.readInstalledState();
  return canonicalCapabilitiesSchema.parse({
    contractVersion: 1,
    canonicalEventReadVersion: schemaInstalled ? 1 : null,
    eventCommandsVersion: state?.commandVersion ?? null,
    enabledCommands: [],
    enabledShapes: [],
    enabledScopes: [],
    readableShapes: schemaInstalled
      ? ["POINT", "CALENDAR", "ALL_DAY", "SPAN", "STAY", "TRANSPORT", "WINDOW"]
      : [],
    maximumPrecision: schemaInstalled ? 6 : null,
    resolverAvailable: false,
    trackCEvidenceAvailable: false,
    activationState: "DISABLED",
    databaseGate: state?.gateClosed ? "CLOSED" : "UNKNOWN",
    gatewayAvailable: !!connection,
  });
}
export function projectCanonicalEvent(
  row: Record<string, unknown>,
  readVersion: string | null,
): CanonicalEventRead {
  if (readVersion !== "1")
    return { readVersion: 1, disposition: "WITHHELD", reason: "UNSUPPORTED_CLIENT" };
  if (row.temporal_contract_version !== 1)
    return {
      readVersion: 1,
      disposition: "WITHHELD",
      reason:
        row.temporal_contract_version === null ? "LEGACY_EVENT" : "UNSUPPORTED_CONTRACT",
    };
  return canonicalEventReadSchema.parse({
    readVersion: 1,
    disposition: "READ_ONLY",
    legacyCompatible: false,
    event: row,
  });
}
export function projectEventReceipt(
  raw: unknown,
  actor: string,
  trip: string,
  operation: string,
): EventOperationReceipt {
  // Explicit allowlist: never send private intended proofs, Source IDs or financial data.
  if (!raw || typeof raw !== "object") throw new Error("Invalid historic receipt.");
  const row = raw as Record<string, unknown>;
  const keys = Object.keys(eventOperationReceiptSchema.shape).filter(
    (key) => key !== "projection",
  );
  const result = eventOperationReceiptSchema.parse({
    projection: "STATUS_ONLY",
    ...Object.fromEntries(keys.map((key) => [key, row[key]])),
  });
  if (
    result.actor_account_id !== actor ||
    result.trip_id !== trip ||
    result.operation_key !== operation
  )
    throw new Error("Historic receipt scope mismatch.");
  return result;
}
