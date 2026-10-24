/** Ephemeral in-container Auth operation. Existing DEV key never leaves process.env. */
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
export const autonomousOwnerSHA =
  "a6682cdcfec889d64d02627c1f8fa144db0e828b77841e66fdac2bfc405d5e5e";
const sustainedGateSHA =
  "0f6c8bf72e41c17a939424cbf821770ac355b7b235ce300abbb7eb6e46058bf0";
const sustainedOwnerSHA =
  "52d1a268af09506c311644529d8d26e050515b345a4b7d5e32c6a68e8ae8a956";
type Profile = "LEGACY_C" | "AD5_SUSTAINED";
function identityEmail(label: "A" | "B", profile: Profile) {
  return profile === "AD5_SUSTAINED"
    ? `otr.ad5.sustained.20261024.${label.toLowerCase()}@example.invalid`
    : `otr-meta-qa-20261022-01-${label.toLowerCase()}@example.invalid`;
}
function identityQuery(label: "A" | "B", profile: Profile) {
  if (label !== "A" && label !== "B") throw Error("LABEL_NOT_ALLOWED");
  const email = identityEmail(label, profile);
  return `BEGIN READ ONLY;\nSELECT id,email,created_at FROM auth.users\nWHERE email = '${email}';\nROLLBACK;\n`;
}
export function exactIdentityQuery(label: "A" | "B") {
  return identityQuery(label, "LEGACY_C");
}
export function exactSustainedIdentityQuery(label: "A" | "B") {
  return identityQuery(label, "AD5_SUSTAINED");
}
export type InPlaceAuthInput = {
  gateJSON: string;
  gateSHA256: string;
  label: "A" | "B";
  attemptOrdinal: number;
  password: string;
  absence: {
    project: string;
    email: string;
    utc: string;
    rows: unknown[];
    querySHA256: string;
    noUnresolvedPriorAttempt?: boolean;
  };
};
async function executeScopedInPlace(
  input: InPlaceAuthInput,
  profile: Profile,
  environment: NodeJS.ProcessEnv = process.env,
  transport: typeof fetch = fetch,
) {
  input = structuredClone(input);
  const attempted = new Set<string>(),
    diagnostics: ProvisionDiagnostic[] = [];
  let stage = "PREFLIGHT";
  try {
    if (createHash("sha256").update(input.gateJSON).digest("hex") !== input.gateSHA256)
      throw Error("GATE_HASH_CHANGED");
    const gate = JSON.parse(input.gateJSON),
      label = input.label;
    if (label !== "A" && label !== "B") throw Error("LABEL_NOT_ALLOWED");
    const email = identityEmail(label, profile),
      display =
        profile === "AD5_SUSTAINED"
          ? `AD5 Sustained 20261024 ${label}`
          : `DEV-METADATA-QA-20261022-01-${label}`;
    const start = Date.parse(gate.startsAt),
      end = Date.parse(gate.expiresAt);
    const assertScope = () => {
      const proof = Date.parse(input.absence?.utc),
        now = Date.now();
      if (
        gate.ownerAuthorized !== true ||
        gate.scope !==
          (profile === "AD5_SUSTAINED"
            ? "AD5_SUSTAINED_AUTH_IN_PLACE"
            : "AUTONOMOUS_DEV_C_AUTH_IN_PLACE") ||
        gate.ownerAuthorizationSHA256 !==
          (profile === "AD5_SUSTAINED" ? sustainedOwnerSHA : autonomousOwnerSHA) ||
        (profile === "AD5_SUSTAINED" &&
          (gate.approvedGateSHA256 !== sustainedGateSHA ||
            input.absence?.noUnresolvedPriorAttempt !== true ||
            !/^\d{4}-\d{2}-\d{2}T[0-9:.]+Z$/.test(gate.startsAt ?? "") ||
            !/^\d{4}-\d{2}-\d{2}T[0-9:.]+Z$/.test(gate.expiresAt ?? ""))) ||
        gate.project !== project ||
        !Number.isFinite(start) ||
        !Number.isFinite(end) ||
        end <= start ||
        end - start > 900000 ||
        now < start ||
        now >= end ||
        !Number.isInteger(input.attemptOrdinal) ||
        input.attemptOrdinal < 1 ||
        input.attemptOrdinal > 2 ||
        input.absence?.project !== project ||
        input.absence.email !== email ||
        !Array.isArray(input.absence.rows) ||
        input.absence.rows.length !== 0 ||
        input.absence.querySHA256 !==
          createHash("sha256").update(identityQuery(label, profile)).digest("hex") ||
        !Number.isFinite(proof) ||
        proof < start ||
        proof > now ||
        now - proof > 60000
      )
        throw Error("FINITE_AUTH_SCOPE_OR_ABSENCE_CLOSED");
    };
    assertScope();
    if (
      (environment.OTR_DEV_SUPABASE_URL ?? "").replace(/\/$/, "") !== origin ||
      !environment.OTR_DEV_SUPABASE_SECRET_KEY?.startsWith("sb_secret_")
    )
      throw Error("EXISTING_DEV_ENV_NOT_QUALIFIED");
    const client = createClient(origin, environment.OTR_DEV_SUPABASE_SECRET_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: {
        fetch: async (url, options) => {
          stage = "TRANSPORT_SCOPE_GUARD";
          assertScope();
          const req = new Request(url, options),
            u = new URL(req.url),
            body = await req.clone().json();
          if (
            attempted.size !== 0 ||
            u.origin !== origin ||
            u.pathname !== "/auth/v1/admin/users" ||
            u.search ||
            req.method !== "POST" ||
            body.email !== email ||
            body.email_confirm !== true ||
            body.password !== input.password ||
            Object.keys(body).sort().join() !==
              "email,email_confirm,password,user_metadata" ||
            Object.keys(body.user_metadata ?? {}).join() !== "display_name" ||
            body.user_metadata.display_name !== display
          )
            throw Error("EXACT_ONE_IDENTITY_REQUEST_REQUIRED");
          assertScope();
          const diagnostic = reserveProvisionDispatch(attempted, email, diagnostics);
          stage = "OUTBOUND_AUTH";
          return fetchProvisionWithReceipt(
            new Request(req, { redirect: "error", signal: AbortSignal.timeout(10000) }),
            diagnostic,
            transport,
          );
        },
      },
    });
    const { data, error } = await client.auth.admin.createUser({
      email,
      password: input.password,
      email_confirm: true,
      user_metadata: { display_name: display },
    });
    retainProvisionSdkCode(diagnostics.at(-1), error);
    if (error) {
      if (stage === "OUTBOUND_AUTH")
        stage =
          diagnostics.at(-1)?.outcome === "TRANSPORT_EXCEPTION"
            ? "AUTH_TRANSPORT_EXCEPTION"
            : "AUTH_HTTP_RESPONSE_REJECTED";
      throw Error("AUTH_CREATE_STOP");
    }
    stage = "IDENTITY_VALIDATION";
    if (
      profile === "AD5_SUSTAINED" &&
      ![200, 201].includes(diagnostics.at(-1)?.httpStatus ?? 0)
    )
      throw Error("AUTH_200_OR_201_RECEIPT_REQUIRED");
    if (
      data.user?.email !== email ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        data.user?.id ?? "",
      ) ||
      !/^\d{4}-\d{2}-\d{2}T[0-9:.+-]+Z?$/.test(data.user?.created_at ?? "") ||
      !Number.isFinite(Date.parse(data.user.created_at))
    )
      throw Error("IDENTITY_RECEIPT_NOT_VERIFIED");
    return {
      status: "NEW_SYNTHETIC_IDENTITY_RETURNED_NOT_NORMAL_AUTH_VERIFIED",
      label,
      attemptOrdinal: input.attemptOrdinal,
      attempts: attempted.size,
      diagnostics,
      receipt: {
        id: data.user.id,
        email,
        project,
        newlyCreated: true,
        createdAt: data.user.created_at,
      },
    };
  } catch {
    return {
      status: "IN_PLACE_AUTH_STOP_RECONCILE_IF_UNKNOWN_NO_AUTO_RETRY",
      label: input.label === "A" ? "A" : input.label === "B" ? "B" : "INVALID",
      attemptOrdinal: input.attemptOrdinal,
      attempts: attempted.size,
      diagnostics,
      stage,
      receipt: null,
    };
  }
}
export function executeInPlace(
  input: InPlaceAuthInput,
  environment: NodeJS.ProcessEnv = process.env,
  transport: typeof fetch = fetch,
) {
  return executeScopedInPlace(input, "LEGACY_C", environment, transport);
}
export function executeSustainedInPlace(
  input: InPlaceAuthInput,
  environment: NodeJS.ProcessEnv = process.env,
  transport: typeof fetch = fetch,
) {
  return executeScopedInPlace(input, "AD5_SUSTAINED", environment, transport);
}
export async function inPlaceMain() {
  try {
    const result = await executeInPlace(JSON.parse(readFileSync(0, "utf8")));
    console.log(JSON.stringify(result));
    if (!result.receipt) process.exitCode = 2;
  } catch {
    console.error(JSON.stringify({ status: "IN_PLACE_AUTH_PREFLIGHT_STOP" }));
    process.exitCode = 2;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  void inPlaceMain();
