/** Future C Auth-only prerequisite, never business/admin profile SQL. No existing-user takeover. */
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
const project = "tuqigdxrvrerfewsxqgm",
  origin = `https://${project}.supabase.co`;
let attempts = 0;
const attemptedEmails = new Set<string>();
const receipts: { [key: string]: unknown } = {};
async function main() {
  const gate = JSON.parse(readFileSync(process.argv[3], "utf8"));
  if (process.argv[2] !== "--execute") {
    console.log(JSON.stringify({ status: "PREPARED_NOT_EXECUTED", newAuthMaximum: 2 }));
    return;
  }
  const canonical = (v: unknown): string =>
    JSON.stringify(
      v && typeof v === "object" && !Array.isArray(v)
        ? Object.fromEntries(
            Object.entries(v)
              .sort()
              .map(([k, x]) => [k, JSON.parse(canonical(x))]),
          )
        : Array.isArray(v)
          ? v.map((x) => JSON.parse(canonical(x)))
          : v,
    );
  const start = Date.parse(gate.startsAt),
    end = Date.parse(gate.expiresAt);
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    end <= start ||
    end - start > 900000 ||
    createHash("sha256")
      .update(
        canonical(
          Object.fromEntries(
            Object.entries(gate).filter(([k]) => k !== "manifestSHA256"),
          ),
        ),
      )
      .digest("hex") !== gate.manifestSHA256
  )
    throw Error("C_INVALID_MANIFEST");
  if (
    gate.ownerAuthorized !== true ||
    gate.project !== project ||
    Date.now() < Date.parse(gate.startsAt) ||
    Date.now() >= Date.parse(gate.expiresAt) ||
    Date.parse(gate.expiresAt) - Date.parse(gate.startsAt) > 900000
  )
    throw Error("C_AUTH_PROVISION_GATE_REQUIRED");
  const secrets = JSON.parse(readFileSync(0, "utf8"));

  const client = createClient(origin, secrets.existingAdminKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      fetch: async (url, options) => {
        const req = new Request(url, options),
          u = new URL(req.url);
        if (
          u.origin !== origin ||
          u.pathname !== "/auth/v1/admin/users" ||
          req.method !== "POST" ||
          u.search ||
          attempts >= 2 ||
          Date.now() < start ||
          Date.now() >= Date.parse(gate.expiresAt)
        )
          throw Error("C_PROVISION_SCOPE_OR_BUDGET");
        const body = await req.clone().json();
        if (
          !["A", "B"].some(
            (label) =>
              body.email ===
                `otr-meta-qa-20261022-01-${label.toLowerCase()}@example.invalid` &&
              body.user_metadata?.display_name === `DEV-METADATA-QA-20261022-01-${label}`,
          ) ||
          body.email_confirm !== true ||
          body.app_metadata ||
          body.phone
        )
          throw Error("C_PROVISION_BODY_FORBIDDEN");
        if (attemptedEmails.has(body.email)) throw Error("C_PROVISION_RETRY_FORBIDDEN");
        attemptedEmails.add(body.email);
        attempts++;
        return fetch(req);
      },
    },
  });

  for (const label of ["A", "B"]) {
    const email = `otr-meta-qa-20261022-01-${label.toLowerCase()}@example.invalid`;
    const { data, error } = await client.auth.admin.createUser({
      email,
      password: secrets[label].password,
      email_confirm: true,
      user_metadata: { display_name: `DEV-METADATA-QA-20261022-01-${label}` },
    });
    if (error || !data.user?.id || data.user.email !== email)
      throw Error("C_PROVISION_FAILED_NO_TAKEOVER");
    receipts[label] = { id: data.user.id, email, project, newlyCreated: true };
  }
  console.log(
    JSON.stringify({
      status: "TWO_NEW_SYNTHETIC_AUTH_CREATED_NORMAL_LOGIN_STILL_REQUIRED",
      attempts,
      attemptedEmails: [...attemptedEmails],
      receipts,
    }),
  );
}
main().catch(() => {
  console.error(
    JSON.stringify({
      status: "AUTH_PROVISION_STOPPED_RETAIN_ALREADY_CREATED_NO_RETRY",
      attempts,
      attemptedEmails: [...attemptedEmails],
      receipts,
    }),
  );
  process.exitCode = 2;
});
