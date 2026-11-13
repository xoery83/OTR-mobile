// DEV-only fixed-scope PG readiness. This does not authenticate a user or enable the Reader.
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createTripPgConnection } from "../../backend/src/tripCoreV2PgConnection";
import { tripCreateWireResultSchema } from "../../src/domain/trip/tripCreateWireContract";
import { PARENT_READINESS_BASELINE, matchesParentReadinessMetadata } from "./qa-parent-readiness-metadata";

const actor = "f155d314-2ee4-4dae-a3ac-0fca5464e58e";
const trip = "faa0ea2b-9729-49b6-8ab7-db924df05e4d";
const operation = "a29a833f-2c50-401a-ae38-da9214a66b2a";
let stage = "ENVIRONMENT";

async function main() {
  if (process.env.OTR_DEV_SUPABASE_URL !== "https://tuqigdxrvrerfewsxqgm.supabase.co" ||
      process.env.OTR_DEV_BACKEND_NETWORK_MODE !== "host") throw Error();
  stage = "CONFIGURATION";
  const raw = readFileSync("/run/otr/trip-create-runtime.json");
  if (createHash("sha256").update(raw).digest("hex") !==
      "e77f733716594264988d6705fcd4dc80100af2eba3a5bbb830ebac96a0d007d5") throw Error();
  const config = JSON.parse(raw.toString());
  if (config.version !== 3 || config.enabled !== true) throw Error();
  stage = "PRIMARY_SELECT_ONLY";
  const result = await createTripPgConnection(config.tripPg).withLease(async (lease) => {
    // Existing owning Readers lock with FOR SHARE; READ ONLY would reject their locks.
    await lease.query("BEGIN");
    try {
      const session = (await lease.query("SELECT current_setting('transaction_read_only') AS readonly, session_user AS principal")).rows[0];
      if (session?.readonly !== "off" || session.principal !== "otr_trip_create_gateway") throw Error();
      stage = "FUNCTION_METADATA";
      const metadata = [];
      for (const { signature } of PARENT_READINESS_BASELINE) metadata.push((await lease.query(
        "SELECT $1::text AS signature, p.oid IS NOT NULL AS present, pg_get_userbyid(p.proowner) AS owner, p.prosecdef AS security_definer, p.proconfig AS settings, pg_get_function_result(p.oid) AS return_type, md5(p.prosrc) AS source_md5, md5(pg_get_functiondef(p.oid)) AS definition_md5, has_function_privilege(current_user,p.oid,'EXECUTE') AS executable, has_function_privilege('anon',p.oid,'EXECUTE') AS anon_executable, has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_executable, has_function_privilege('service_role',p.oid,'EXECUTE') AS service_role_executable FROM (SELECT to_regprocedure($1::text) AS oid) f LEFT JOIN pg_proc p ON p.oid=f.oid",
        [signature],
      )).rows[0]);
      if (!matchesParentReadinessMetadata(metadata)) {
        await lease.query("COMMIT");
        return { businessReadOnly: true, postgresReadOnly: false, functions: metadata, ready: false };
      }
      stage = "CREATE_RESULT";
      const stored = (await lease.query("SELECT public.trip_create_result($1::uuid,$2::uuid) AS result", [operation, actor])).rows[0]?.result;
      stage = "PARENT_RESULT";
      const parent = (await lease.query("SELECT public.trip_create_parent_result($1::uuid,$2::uuid) AS result", [actor, trip])).rows[0]?.result;
      stage = "FINITE_SCOPE";
      const allowed = (await lease.query("SELECT public.trip_create_finite_scope_allowed($1::uuid,$2::uuid,$3::uuid) AS allowed", [actor, trip, operation])).rows[0]?.allowed;
      if (typeof allowed !== "boolean") throw Error();
      const matches = (rawResult: unknown) => {
        const value = tripCreateWireResultSchema.safeParse(rawResult);
        return value.success && "formatVersion" in value.data && value.data.formatVersion === 2 &&
          value.data.actorAccountId === actor && value.data.tripId === trip && value.data.operationId === operation;
      };
      const storedBinding = matches(stored), parentBinding = matches(parent);
      await lease.query("COMMIT");
      return { businessReadOnly: true, postgresReadOnly: false, functions: metadata, storedPresent: stored != null, storedBinding,
        parentPresent: parent != null, parentBinding, finiteScopeAllowed: allowed,
        ready: storedBinding && parentBinding && allowed };
    } catch (error) {
      await lease.query("ROLLBACK").catch(() => lease.retire());
      throw error;
    }
  });
  console.log(JSON.stringify({ status: "FIXED_PARENT_PG_READINESS_ONLY", actor, trip, operation, ...result }));
}
void main().catch((error: unknown) => {
  const code = (error as { code?: unknown } | null)?.code;
  const sqlState = typeof code === "string" && /^[0-9A-Z]{5}$/.test(code) ? code : null;
  console.log(JSON.stringify({ status: "PARENT_PG_READINESS_UNCONFIRMED", ready: false, stage, sqlState }));
  process.exitCode = 1;
});
