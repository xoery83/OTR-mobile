import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { z } from "zod";

// Future contract model ONLY. No runtime import/caller, flag or activation path.
// These booleans represent trusted verification, never caller-supplied claims.
const enabledEvidence = z.strictObject({
  gatewayProvisioned: z.literal(true),
  sessionUser: z.literal("otr_trip_person_command_gateway"),
  currentUser: z.literal("otr_trip_person_command_gateway"),
  securityInventoryVerified: z.literal(true),
  commandVersion: z.literal(1),
  receiptVersion: z.literal(1),
  databaseGate: z.literal("OPEN"),
  deploymentFeatureOn: z.literal(true),
  rolloutScopeAdmitted: z.literal(true),
  mobileContractVersion: z.literal(1),
  compatibleSchemasVerified: z.literal(true),
});
const fixture = {
  gatewayProvisioned: true,
  sessionUser: "otr_trip_person_command_gateway",
  currentUser: "otr_trip_person_command_gateway",
  securityInventoryVerified: true,
  commandVersion: 1,
  receiptVersion: 1,
  databaseGate: "OPEN",
  deploymentFeatureOn: true,
  rolloutScopeAdmitted: true,
  mobileContractVersion: 1,
  compatibleSchemasVerified: true,
};
const futureHttpEnabled = (evidence: unknown) =>
  enabledEvidence.safeParse(evidence).success;

it("future model requires the entire verified conjunction, never runtime activation", () => {
  expect(futureHttpEnabled(fixture)).toBe(true);
  expect(futureHttpEnabled(null)).toBe(false);
  expect(futureHttpEnabled({})).toBe(false);
  expect(futureHttpEnabled({ ...fixture, callerCapability: "ENABLED" })).toBe(false);
});
it.each(Object.keys(fixture))("future model missing/unknown %s is disabled", (key) => {
  const missing: Record<string, unknown> = { ...fixture };
  delete missing[key];
  expect(futureHttpEnabled(missing)).toBe(false);
  expect(futureHttpEnabled({ ...fixture, [key]: null })).toBe(false);
});
it.each([
  ["gatewayProvisioned", false],
  ["sessionUser", "service_role"],
  ["sessionUser", "authenticated"],
  ["currentUser", "otr_trip_person_lifecycle_writer"],
  ["securityInventoryVerified", false], // PUBLIC/inherited/ownership drift disqualifies.
  ["commandVersion", 2],
  ["receiptVersion", 2],
  ["databaseGate", "CLOSED"], // Feature-on cannot override closed DB.
  ["databaseGate", "UNKNOWN"],
  ["deploymentFeatureOn", false], // Open DB cannot override feature-off.
  ["deploymentFeatureOn", "true"],
  ["rolloutScopeAdmitted", false],
  ["mobileContractVersion", 2],
  ["compatibleSchemasVerified", false],
])("future model incompatible %s=%s is disabled", (key, value) => {
  expect(futureHttpEnabled({ ...fixture, [String(key)]: value })).toBe(false);
});

const sql = readFileSync(
  new URL(
    "../../supabase/migrations/20261004000600_trip_person_command_foundation.sql",
    import.meta.url,
  ),
  "utf8",
);
it("00600 remains byte-identical: gate cannot open and roles remain reserved NOLOGIN", () => {
  expect(createHash("sha256").update(sql).digest("hex")).toBe(
    "c347362be54875b951b2f1bdc51c2c1869cce4af644b2740b2d2c8584665752f",
  );
  expect(sql).toContain("constraint trip_person_gate_closed check(not enabled)");
  expect(sql).toContain(
    "nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls",
  );
  expect(sql).toContain("r.rolreplication");
});
it("source-contract gateway has only two fixed EXECUTE grants, no Member DML grant", () => {
  expect(sql).toContain(
    "grant execute on function public.trip_person_set_participation(uuid,text),public.trip_person_receipt_lookup(uuid,uuid,uuid) to otr_trip_person_command_gateway;",
  );
  expect(sql).not.toMatch(
    /grant\s+(?:select|insert|update|delete)[^;]*\bon\s+public\.journey_members[^;]*to\s+otr_trip_person_command_gateway/i,
  );
  expect(sql).not.toMatch(
    /grant\s+[^;]*\bon\s+public\.journey_members[^;]*to\s+otr_trip_person_lifecycle_writer/i,
  );
  expect(sql).toContain("session_user<>'otr_trip_person_command_gateway'");
});
it("source-contract inventories cover PUBLIC/inherited EXECUTE, columns, default ACL and SET membership", () => {
  expect(sql).toContain("has_function_privilege(role_name,p.oid,'EXECUTE')");
  expect(sql).toContain("has_column_privilege(role_name,obj.oid,a.attnum,privilege)");
  expect(sql).toContain("a.grantee=0");
  expect(sql).toContain("pg_has_role(role_name,a.grantee,'USAGE')");
  expect(sql).toContain("m.set_option or m.inherit_option");
  expect(sql).toContain(
    "revoke all on function public.trip_person_receipt_lookup(uuid,uuid,uuid) from public,anon,authenticated,service_role",
  );
});
