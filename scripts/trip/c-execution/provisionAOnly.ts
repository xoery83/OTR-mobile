/** Single Owner-approved Auth recovery operation. No B, login, profile or business entry point. */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";
import {
  fetchProvisionWithReceipt,
  reserveProvisionDispatch,
  retainProvisionSdkCode,
  type ProvisionDiagnostic,
} from "./provisionDiagnostics";
const project = "tuqigdxrvrerfewsxqgm",
  origin = `https://${project}.supabase.co`;
export const A_EMAIL = "otr-meta-qa-20261022-01-a@example.invalid";
export type AOnlyGate = {
  ownerAuthorized: boolean;
  scope: string;
  project: string;
  email: string;
  maxAttempts: number;
  startsAt: string;
  expiresAt: string;
};
function assertGate(g: AOnlyGate) {
  if (
    g.ownerAuthorized !== true ||
    g.scope !== "A_ONLY_AUTH_CREATE_ONCE" ||
    g.project !== project ||
    g.email !== A_EMAIL ||
    g.maxAttempts !== 1 ||
    g.startsAt !== "2026-10-22T23:00:00Z" ||
    g.expiresAt !== "2026-10-22T23:15:00Z" ||
    Date.now() < Date.parse(g.startsAt) ||
    Date.now() >= Date.parse(g.expiresAt)
  )
    throw Error("A_ONLY_GATE_CLOSED");
}
export async function executeAOnly(
  gate: AOnlyGate,
  adminKey: string,
  password: string,
  transport: typeof fetch = fetch,
) {
  const attempted = new Set<string>(),
    diagnostics: ProvisionDiagnostic[] = [];
  let stage = "PREFLIGHT";
  try {
    assertGate(gate);
    const client = createClient(origin, adminKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: {
        fetch: async (url, options) => {
          stage = "TRANSPORT_SCOPE_GUARD";
          assertGate(gate);
          const req = new Request(url, options),
            u = new URL(req.url),
            body = await req.clone().json();
          if (
            attempted.size !== 0 ||
            u.origin !== origin ||
            u.pathname !== "/auth/v1/admin/users" ||
            u.search ||
            req.method !== "POST" ||
            body.email !== A_EMAIL ||
            body.email_confirm !== true ||
            body.password !== password ||
            Object.keys(body).sort().join() !==
              "email,email_confirm,password,user_metadata" ||
            Object.keys(body.user_metadata ?? {}).join() !== "display_name" ||
            body.user_metadata.display_name !== "DEV-METADATA-QA-20261022-01-A"
          )
            throw Error("A_ONLY_SCOPE_OR_RETRY_FORBIDDEN");
          const diagnostic = reserveProvisionDispatch(attempted, body.email, diagnostics);
          stage = "OUTBOUND_AUTH";
          return fetchProvisionWithReceipt(req, diagnostic, transport);
        },
      },
    });
    const { data, error } = await client.auth.admin.createUser({
      email: A_EMAIL,
      password,
      email_confirm: true,
      user_metadata: { display_name: "DEV-METADATA-QA-20261022-01-A" },
    });
    retainProvisionSdkCode(diagnostics.at(-1), error);
    if (error) {
      if (stage === "OUTBOUND_AUTH")
        stage =
          diagnostics.at(-1)?.outcome === "TRANSPORT_EXCEPTION"
            ? "AUTH_TRANSPORT_EXCEPTION"
            : "AUTH_HTTP_RESPONSE_REJECTED";
      throw Error("A_ONLY_STOP");
    }
    stage = "IDENTITY_VALIDATION";
    if (
      !data.user?.id ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        data.user.id,
      ) ||
      data.user.email !== A_EMAIL ||
      !/^\d{4}-\d{2}-\d{2}T[0-9:.+-]+Z?$/.test(data.user.created_at ?? "") ||
      !Number.isFinite(Date.parse(data.user.created_at))
    )
      throw Error("A_ONLY_IDENTITY_NOT_VERIFIED");
    return {
      status: "A_CREATED_REQUIRES_EXACT_READONLY_VERIFICATION",
      attempts: attempted.size,
      diagnostics,
      receipt: { id: data.user.id, email: A_EMAIL, project, newlyCreated: true },
    };
  } catch {
    return {
      status: "A_ONLY_STOPPED_NO_RETRY_OUTCOME_NOT_INFERRED",
      attempts: attempted.size,
      diagnostics,
      stage,
      receipt: null,
    };
  }
}
export function assertFreshAAbsent(value: unknown) {
  const r = value as {
    project?: unknown;
    querySHA256?: unknown;
    returncode?: unknown;
    utc?: string;
    result?: { rows?: unknown[] };
  };
  const observed = Date.parse(r?.utc ?? "");
  if (
    r?.project !== project ||
    r?.querySHA256 !==
      "5951ed2ba596c3afeb7d0aadc66ffac3ca3879988e50dea24a5f81385643e28e" ||
    r?.returncode !== 0 ||
    !Array.isArray(r?.result?.rows) ||
    r.result.rows.length !== 0 ||
    !Number.isFinite(observed) ||
    observed < Date.parse("2026-10-22T23:00:00Z") ||
    observed > Date.now() ||
    Date.now() - observed > 60000
  )
    throw Error("A_ONLY_FRESH_ABSENCE_NOT_VERIFIED");
}
async function main() {
  if (process.argv[2] !== "--execute") throw Error("A_ONLY_EXACT_COMMAND_REQUIRED");
  const bytes = readFileSync(process.argv[3]);
  if (createHash("sha256").update(bytes).digest("hex") !== process.argv[4])
    throw Error("A_ONLY_GATE_HASH_MISMATCH");
  const gate = JSON.parse(bytes.toString());
  assertGate(gate);
  const authorization = readFileSync(
    "/private/tmp/otr-local-first-core-20261019/docs/ops/c-auth-a-retry-20261023/OWNER_AUTHORIZATION.json",
  );
  if (
    createHash("sha256").update(authorization).digest("hex") !==
    "2cb19786cf61bbfcaac07bdc3c5737cd514289e22b93dbf10dc5bff451edc996"
  )
    throw Error("A_ONLY_OWNER_RECORD_CHANGED");
  const fresh = readFileSync(gate.freshAReceiptPath);
  if (createHash("sha256").update(fresh).digest("hex") !== gate.freshAReceiptSHA256)
    throw Error("A_ONLY_FRESH_RECEIPT_HASH_CHANGED");
  assertFreshAAbsent(JSON.parse(fresh.toString()));
  const secrets = JSON.parse(readFileSync(0, "utf8"));
  const result = await executeAOnly(gate, secrets.existingAdminKey, secrets.password);
  console.log(JSON.stringify(result));
  if (!result.receipt) process.exitCode = 2;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch(() => {
    console.error(JSON.stringify({ status: "A_ONLY_PREFLIGHT_STOP_NO_DISPATCH" }));
    process.exitCode = 2;
  });
