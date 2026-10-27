/** Password-only repair of exactly the two identities created by this autonomous scope. */
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import {
  fetchProvisionWithReceipt,
  reserveProvisionDispatch,
  retainProvisionSdkCode,
  type ProvisionDiagnostic,
} from "./provisionDiagnostics";
import { autonomousOwnerSHA } from "./provisionInPlace";
export const fixtures = Object.freeze({
  A: Object.freeze({
    id: "3f629440-0e8e-4b7d-8177-3dcf89e86b88",
    email: "otr-meta-qa-20261022-01-a@example.invalid",
    createdAt: "2026-10-22T23:51:47.501825Z",
  }),
  B: Object.freeze({
    id: "d5fd339d-1a5e-478e-a901-1791512505d5",
    email: "otr-meta-qa-20261022-01-b@example.invalid",
    createdAt: "2026-10-22T23:52:06.667271Z",
  }),
});
type Input = {
  gateJSON: string;
  gateSHA256: string;
  label: "A" | "B";
  password: string;
  proof: { utc: string; id: string; email: string; createdAt: string };
};
const origin = "https://tuqigdxrvrerfewsxqgm.supabase.co";
export async function recoverPasswordInPlace(
  input: Input,
  environment: NodeJS.ProcessEnv = process.env,
  transport: typeof fetch = fetch,
) {
  input = structuredClone(input);
  const diagnostics: ProvisionDiagnostic[] = [],
    attempted = new Set<string>();
  let stage = "PREFLIGHT";
  try {
    if (
      !["A", "B"].includes(input.label) ||
      createHash("sha256").update(input.gateJSON).digest("hex") !== input.gateSHA256
    )
      throw Error("FIXTURE_SCOPE");
    const identity = fixtures[input.label],
      gate = JSON.parse(input.gateJSON);
    const assertScope = () => {
      const now = Date.now(),
        start = Date.parse(gate.startsAt),
        end = Date.parse(gate.expiresAt),
        proof = Date.parse(input.proof?.utc);
      if (
        gate.ownerAuthorized !== true ||
        gate.scope !== "AUTONOMOUS_DEV_SYNTHETIC_PASSWORD_RECOVERY" ||
        gate.ownerAuthorizationSHA256 !== autonomousOwnerSHA ||
        gate.project !== "tuqigdxrvrerfewsxqgm" ||
        !Number.isFinite(start) ||
        !Number.isFinite(end) ||
        end <= start ||
        end - start > 900000 ||
        now < start ||
        now >= end ||
        !Number.isFinite(proof) ||
        proof < start ||
        proof > now ||
        now - proof > 60000 ||
        input.proof.id !== identity.id ||
        input.proof.email !== identity.email ||
        input.proof.createdAt !== identity.createdAt
      )
        throw Error("EXACT_NEW_FIXTURE_ONLY");
    };
    assertScope();
    if (
      environment.OTR_DEV_SUPABASE_URL !== origin ||
      !environment.OTR_DEV_SUPABASE_SECRET_KEY?.startsWith("sb_secret_")
    )
      throw Error("SOURCE_SCOPE");
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
            attempted.size ||
            u.origin !== origin ||
            u.pathname !== `/auth/v1/admin/users/${identity.id}` ||
            u.search ||
            req.method !== "PUT" ||
            Object.keys(body).join() !== "password" ||
            body.password !== input.password
          )
            throw Error("PASSWORD_ONLY_REQUEST");
          assertScope();
          const d = reserveProvisionDispatch(attempted, identity.id, diagnostics);
          stage = "OUTBOUND_PASSWORD_REPAIR";
          return fetchProvisionWithReceipt(
            new Request(req, { redirect: "error", signal: AbortSignal.timeout(10000) }),
            d,
            transport,
          );
        },
      },
    });
    const { data, error } = await client.auth.admin.updateUserById(identity.id, {
      password: input.password,
    });
    retainProvisionSdkCode(diagnostics.at(-1), error);
    if (
      error ||
      data.user?.id !== identity.id ||
      data.user.email !== identity.email ||
      data.user.created_at !== identity.createdAt
    )
      throw Error("PASSWORD_REPAIR_NOT_VERIFIED");
    return {
      status: "PASSWORD_UPDATE_RETURNED_REQUIRES_NORMAL_AUTH",
      label: input.label,
      attempts: attempted.size,
      diagnostics,
      receipt: identity,
    };
  } catch {
    return {
      status: "PASSWORD_REPAIR_STOP_UNKNOWN_NEVER_AUTOMATIC_RETRY",
      label: input.label === "A" ? "A" : input.label === "B" ? "B" : "INVALID",
      attempts: attempted.size,
      diagnostics,
      stage,
      receipt: null,
    };
  }
}
