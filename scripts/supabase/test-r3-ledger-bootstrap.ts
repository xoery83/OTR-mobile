/** Local integration only: real handler/gateway/PostgREST/SQL, fixture token identity.
 * Run with the existing TCP-denial preload. curl runs inside a network-none DB.
 * No Hosted fetch, provider call, protected-table fixture insert or config change.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHmac } from "node:crypto";
import { writeFileSync } from "node:fs";
import { createDevBackendHandler } from "../../backend/src/app";
import { createSupabaseDevGateway } from "../../backend/src/supabaseGateway";

const container = "otr-r3-ledger-init-a";
const restContainer = "otr-r3-ledger-init-rest";
assert.equal(
  execFileSync(
    "docker",
    ["inspect", container, "--format", "{{.HostConfig.NetworkMode}}"],
    { encoding: "utf8" },
  ).trim(),
  "none",
);
const mode = execFileSync(
  "docker",
  ["inspect", restContainer, "--format", "{{.HostConfig.NetworkMode}}"],
  { encoding: "utf8" },
).trim();
const containerId = execFileSync(
  "docker",
  ["inspect", container, "--format", "{{.Id}}"],
  { encoding: "utf8" },
).trim();
assert.equal(mode, `container:${containerId}`);
const url = "https://tuqigdxrvrerfewsxqgm.supabase.co";
const actorA = "83100000-0000-4000-8000-000000000001";
const actorB = "83100000-0000-4000-8000-000000000002";
const trip = "83120000-0000-4000-8000-000000000001";
function token(role: string, sub?: string) {
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  const body = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ role, sub, exp: Math.floor(Date.now() / 1000) + 600 })}`;
  return `${body}.${createHmac("sha256", "r3-ledger-init-local-only-jwt-secret-20261008").update(body).digest("base64url")}`;
}
const ownerToken = token("authenticated", actorA);
const otherToken = token("authenticated", actorB);
const originalFetch = globalThis.fetch;
let requests = 0;
globalThis.fetch = async (input, init) => {
  const request = new Request(input, init);
  const parsed = new URL(request.url);
  assert.equal(parsed.origin, url);
  assert.ok(
    parsed.pathname.startsWith("/rest/v1/"),
    "Only local PostgREST transport is allowed",
  );
  assert.ok(["GET", "POST"].includes(request.method));
  const args = [
    "exec",
    "-i",
    container,
    "curl",
    "--silent",
    "--show-error",
    "--max-time",
    "10",
    "--request",
    request.method,
  ];
  for (const [key, value] of request.headers) args.push("--header", `${key}: ${value}`);
  const body = request.method === "POST" ? await request.text() : undefined;
  if (body !== undefined) args.push("--data-binary", "@-");
  args.push(
    "--write-out",
    "\n%{http_code}",
    `http://127.0.0.1:3000${parsed.pathname.slice("/rest/v1".length)}${parsed.search}`,
  );
  const raw = execFileSync("docker", args, { input: body, encoding: "utf8" });
  const separator = raw.lastIndexOf("\n");
  const status = Number(raw.slice(separator + 1));
  requests++;
  return new Response(status === 204 ? null : raw.slice(0, separator), {
    status,
    headers: { "content-type": "application/json" },
  });
};
async function main() {
  try {
    const creation = await fetch(`${url}/rest/v1/trips`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${ownerToken}`,
        "content-type": "application/json",
        prefer: "return=representation",
      },
      body: JSON.stringify({
        id: trip,
        name: "Local fresh Ledger bootstrap Trip",
        created_by: actorA,
      }),
    });
    assert.equal(creation.status, 201, await creation.text());
    const gateway = createSupabaseDevGateway({
      url,
      secretKey: token("service_role"),
      publishableKey: token("anon"),
    });
    // Isolated Auth identity seam only. Authorization and every Ledger read use real SQL.
    gateway.validateAccessToken = async (value) =>
      value === ownerToken
        ? { id: actorA }
        : value === otherToken
          ? { id: actorB }
          : null;
    const handle = createDevBackendHandler({ gateway });
    const request = (value: string) =>
      new Request(`http://local.invalid/v2/trips/${trip}/ledger/bootstrap`, {
        headers: { authorization: `Bearer ${value}` },
      });
    const response = await handle(request(ownerToken));
    const bootstrap = await response.json();
    assert.equal(response.status, 200, JSON.stringify(bootstrap));
    assert.equal(bootstrap.journey.id, trip);
    assert.equal(bootstrap.journey.settlementCurrency, "NZD");
    assert.equal(bootstrap.journey.settlementScale, 2);
    assert.equal(bootstrap.journey.valuationPolicy, "REFERENCE_RATE");
    assert.equal(bootstrap.members.length, 1);
    assert.equal(bootstrap.members[0].role, "owner");
    assert.equal(bootstrap.members[0].status, "linked");
    assert.equal(bootstrap.expenses.length, 0);
    assert.equal((await handle(request(otherToken))).status, 403);
    assert.equal((await handle(request("invalid-token"))).status, 401);
    const foreignRead = await fetch(`${url}/rest/v1/trips?id=eq.${trip}&select=id`, {
      headers: { authorization: `Bearer ${otherToken}` },
    });
    assert.deepEqual(await foreignRead.json(), []);
    const directSettings = await fetch(
      `${url}/rest/v1/ledger_settings?select=journey_id`,
      { headers: { authorization: `Bearer ${ownerToken}` } },
    );
    assert.equal(directSettings.status, 403);
    const result = {
      pass: true,
      realPostgrestFreshTrip: true,
      authorizedBackendBootstrap: 200,
      crossAccountBootstrap: 403,
      invalidAuthBootstrap: 401,
      crossAccountRestRows: 0,
      protectedSettingsRest: 403,
      requests,
      authIdentityFixtureOnly: true,
      externalNetwork: "denied",
    };
    writeFileSync(
      "supabase/dev-forward/r3-v1/local-bootstrap-validation.json",
      `${JSON.stringify(result, null, 2)}\n`,
    );
    console.log(JSON.stringify(result));
  } finally {
    globalThis.fetch = originalFetch;
  }
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
