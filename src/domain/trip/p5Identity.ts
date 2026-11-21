import { z } from "zod";
export const p5IdentityFields = [
  "operator_namespace",
  "operator_issuer",
  "operator_value",
  "operator_literal",
  "service_number",
  "service_literal",
] as const;
const state = z.enum(["KNOWN", "UNKNOWN", "NOT_APPLICABLE"]);
export const p5IdentityStateSchema = z.strictObject({
  version: z.literal(1),
  fields: z.strictObject({
    operator_namespace: state,
    operator_issuer: state,
    operator_value: state,
    operator_literal: state,
    service_number: state,
    service_literal: state,
  }),
});
// Missing legacy descriptors mean known facts, never an implicit conversion of blanks.
export function validTransportIdentity(row: Record<string, unknown>): boolean {
  const parsed =
    row.identity_state == null
      ? null
      : p5IdentityStateSchema.safeParse(row.identity_state);
  if (parsed && (!parsed.success || row.transport_subtype === "FLIGHT")) return false;
  const states = parsed?.success ? parsed.data.fields : null;
  for (const key of p5IdentityFields) {
    const s = states?.[key] ?? "KNOWN";
    if (s === "KNOWN") {
      if (typeof row[key] !== "string" || !(row[key] as string).trim()) return false;
    } else if (row[key] !== null || (s === "NOT_APPLICABLE" && key !== "service_number"))
      return false;
  }
  if (
    row.operator_namespace === "IATA_AIRLINE" &&
    (row.operator_issuer !== "IATA" || !/^[A-Z0-9]{2}$/.test(String(row.operator_value)))
  )
    return false;
  if (
    row.operator_namespace === "ICAO_AIRLINE" &&
    (row.operator_issuer !== "ICAO" || !/^[A-Z]{3}$/.test(String(row.operator_value)))
  )
    return false;
  return true;
}
// Keep the pre-v1 Manual profile byte-for-byte; a supplied descriptor never falls back.
export function validTransportCommandIdentity(row: Record<string, unknown>): boolean {
  if (row.identity_state !== undefined) return validTransportIdentity(row);
  return (
    validTransportIdentity(row) ||
    (row.operator_namespace === "NAME" &&
      ["TRAIN", "BUS", "FERRY", "WATER_TAXI", "SHUTTLE", "TRANSFER"].includes(
        String(row.transport_subtype),
      ) &&
      p5IdentityFields.every(
        (key) =>
          typeof row[key] === "string" &&
          (row[key] === "" || Boolean((row[key] as string).trim())),
      ))
  );
}
export const unknownP5Identity = () => ({
  operator_namespace: null,
  operator_issuer: null,
  operator_value: null,
  operator_literal: null,
  service_number: null,
  service_literal: null,
  identity_state: {
    version: 1 as const,
    fields: {
      operator_namespace: "UNKNOWN" as const,
      operator_issuer: "UNKNOWN" as const,
      operator_value: "UNKNOWN" as const,
      operator_literal: "UNKNOWN" as const,
      service_number: "UNKNOWN" as const,
      service_literal: "UNKNOWN" as const,
    },
  },
});

// Sparse omission retains facts/state; nullable identity updates require a coherent explicit descriptor.
export function p5IdentityPatch(
  previous: Record<string, unknown>,
  supplied: Record<string, unknown>,
) {
  const legacy =
    previous.identity_state === undefined && supplied.identity_state === undefined;
  const baseline = legacy ? previous : upgradeLegacyP5Identity(previous);
  if (
    !(legacy ? validTransportCommandIdentity : validTransportIdentity)({
      ...baseline,
      ...supplied,
    })
  )
    throw new Error("INVALID_TRANSPORT_IDENTITY");
  const changes = Object.fromEntries(
    Object.entries(supplied).filter(
      ([key, value]) =>
        key !== "service_key" &&
        !(
          p5IdentityFields.includes(key as (typeof p5IdentityFields)[number]) &&
          value === null &&
          previous[key] === null
        ),
    ),
  );
  return baseline === previous
    ? changes
    : {
        ...Object.fromEntries(p5IdentityFields.map((key) => [key, baseline[key]])),
        identity_state: baseline.identity_state,
        ...changes,
      };
}

// The pre-existing stored P5/NAME profile allowed exact empty strings, not whitespace or NULL.
export function isLegacyStoredP5Identity(row: Record<string, unknown>): boolean {
  return (
    row.identity_state == null &&
    row.operator_namespace === "NAME" &&
    ["TRAIN", "BUS", "FERRY", "WATER_TAXI", "SHUTTLE", "TRANSFER"].includes(
      String(row.transport_subtype),
    ) &&
    p5IdentityFields.every((key) => typeof row[key] === "string") &&
    p5IdentityFields.some((key) => !(row[key] as string).trim())
  );
}

export function validStoredTransportIdentity(row: Record<string, unknown>): boolean {
  return validTransportIdentity(row) || isLegacyStoredP5Identity(row);
}

// Views and explicit new edits can version the representation; original graph/intent/receipt bytes stay intact.
export function upgradeLegacyP5Identity(
  row: Record<string, unknown>,
): Record<string, unknown> {
  if (!isLegacyStoredP5Identity(row)) return row;
  return {
    ...row,
    ...Object.fromEntries(
      p5IdentityFields.map((key) => [
        key,
        !(row[key] as string).trim() ? null : row[key],
      ]),
    ),
    identity_state: {
      version: 1,
      fields: Object.fromEntries(
        p5IdentityFields.map((key) => [
          key,
          !(row[key] as string).trim() ? "UNKNOWN" : "KNOWN",
        ]),
      ),
    },
  };
}
