// Exact CP14/15 operator, outside Backend. Secrets stay in the existing DEV vault.
import { Client } from "pg";
import { checkServerIdentity } from "node:tls";
import { readFileSync, openSync, writeFileSync, closeSync } from "node:fs";
import { createHash } from "node:crypto";
import { createClosedPersistenceGateway } from "../../backend/src/externalIntegrationPersistence";

const actor = "f4b059c5-8241-4ffb-aa15-37fa25474543";
const endpoint = "https://tuqigdxrvrerfewsxqgm.supabase.co";
const directory = "/opt/otr/dev-backend/private/universal-stage2-continuous";
const kinds = new Set(["external_integration_price_append", "external_integration_set_kill", "flight_activation_select", "flight_activation_account_grant"]);

export function selectedCommand(plan: any, phase: string, index: number, now: number) {
  const start = Date.parse(plan.startsAt), end = Date.parse(plan.adminControl.expiresAt);
  if (plan.actorId !== actor || plan.project !== "tuqigdxrvrerfewsxqgm" ||
      !["activationCommands", "closeCommands"].includes(phase) || !Number.isInteger(index) || index < 0 ||
      !Number.isFinite(start) || !Number.isFinite(end) || end <= start || end - start > 900000 ||
      now < start || now >= end) throw Error("OPERATOR_SCOPE_CLOSED");
  const value = plan.providerControl[phase][index];
  if (!value || !kinds.has(value.kind) || value.command.actor_id !== actor || value.context.verified_actor_id !== actor ||
      value.context.verified_account_id !== actor || value.command.environment !== "DEV" ||
      value.context.gateway_identity !== "otr_external_integration_admin_gateway" ||
      value.command.integration_id !== "otr-universal-qa-1624499c-18d7-4026-b3fe-7346ab1f825d" &&
        !(value.kind === "external_integration_set_kill" && value.command.integration_id === null)) throw Error("OPERATOR_COMMAND_SCOPE");
  return value;
}

let diagnosticStage = "PLAN";
export function safeOperatorFailure(error: unknown, stage: string) {
  const value = error as { code?: unknown; message?: unknown };
  const code = typeof value?.code === "string" && /^(?:[0-9A-Z]{5}|ENOTFOUND|ENETUNREACH|ECONNREFUSED|ETIMEDOUT|ERR_TLS_CERT_ALTNAME_INVALID|SELF_SIGNED_CERT_IN_CHAIN|CERT_HAS_EXPIRED)$/.test(value.code) ? value.code : null;
  const contract = typeof value?.message === "string" && /^(?:CP14|CP15|UNIVERSAL|OPERATOR|NORMAL_AUTH)_[A-Z_]{1,80}$/.test(value.message) ? value.message : null;
  return { status: "OPERATOR_UNKNOWN_OR_REJECTED_RECONCILE_READONLY", stage, code, contract };
}

async function main() {
  const [phase, rawIndex, expectedPlanHash] = process.argv.slice(2);
  const bytes = readFileSync(`${directory}/plan.json`);
  if (createHash("sha256").update(bytes).digest("hex") !== expectedPlanHash) throw Error("OPERATOR_PLAN_HASH");
  const plan = JSON.parse(bytes.toString());
  const selected = selectedCommand(plan, phase, Number(rawIndex), Date.now());
  const credential = JSON.parse(readFileSync(`${directory}/credentials.json`, "utf8"));
  const auth = JSON.parse(readFileSync("/opt/otr/dev-backend/private/qa-auth/universal-stage2-20261025.json", "utf8"));
  const verify = async () => {
    const response = await fetch(`${endpoint}/auth/v1/user`, {
      headers: { apikey: credential.publishableKey, Authorization: `Bearer ${auth.session.access_token}` },
      signal: AbortSignal.timeout(10000), redirect: "error",
    });
    if (!response.ok) throw Error("NORMAL_AUTH_UNAVAILABLE");
    const user = await response.json() as any;
    if (user.id !== actor || user.id !== auth.accountId || !user.email_confirmed_at) throw Error("NORMAL_AUTH_IDENTITY");
  };
  diagnosticStage = "NORMAL_AUTH";
  await verify();
  const pg = new Client({ host: "db.tuqigdxrvrerfewsxqgm.supabase.co", port: 5432, database: "postgres",
    user: "otr_external_integration_admin_gateway", password: credential.adminPassword,
    connectionTimeoutMillis: 8000, query_timeout: 15000,
    ssl: { ca: credential.ca, rejectUnauthorized: true, checkServerIdentity: (_host, cert) => checkServerIdentity("db.tuqigdxrvrerfewsxqgm.supabase.co", cert) },
  });
  const gateway = createClosedPersistenceGateway({ gatewayIdentity: "otr_external_integration_admin_gateway",
    now: () => new Date().toISOString(),
    async verify() { await verify(); return selected.context; },
    async execute(kind, context, command) {
      if (kind !== selected.kind || Date.now() >= Date.parse(plan.adminControl.expiresAt)) throw Error("OPERATOR_SCOPE_CLOSED");
      // Claim before SQL send. UNKNOWN is reconciled via audit/readback, never resent here.
      const fd = openSync(`${directory}/command-${command.request_id}.claimed`, "wx", 0o600);
      writeFileSync(fd, JSON.stringify({ kind, requestId: command.request_id })); closeSync(fd);
      diagnosticStage = "PG_CONNECT";
      await pg.connect();
      try {
        diagnosticStage = "PG_PRINCIPAL";
        const principal = await pg.query("SELECT session_user AS principal");
        if (principal.rows[0]?.principal !== "otr_external_integration_admin_gateway") throw Error("OPERATOR_PRINCIPAL");
        await pg.query("BEGIN; SET LOCAL statement_timeout='12000ms'; SET LOCAL lock_timeout='3000ms'");
        diagnosticStage = "SQL_COMMAND";
        await pg.query(`SELECT public.${kind}($1::jsonb,$2::jsonb)`, [JSON.stringify(context), JSON.stringify(command)]);
        diagnosticStage = "COMMIT";
        await pg.query("COMMIT");
        return { acknowledged: true };
      } finally { await pg.end(); }
    },
  });
  await gateway.invoke(selected.kind, selected.command);
  console.log(JSON.stringify({ status: "ACKNOWLEDGED_REQUIRES_INDEPENDENT_READBACK", requestId: selected.command.request_id, kind: selected.kind }));
}

if (process.argv[1]?.endsWith("universal-continuous-operator.mjs")) {
  main().catch((error) => { console.log(JSON.stringify(safeOperatorFailure(error, diagnosticStage))); process.exitCode = 2; });
}
