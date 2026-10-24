import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash } from "node:crypto";
import {
  executeSustainedInPlace,
  exactSustainedIdentityQuery,
} from "./provisionSustainedInPlace";
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const project = "tuqigdxrvrerfewsxqgm";
const secret = "sb_secret_SYNTHETIC_NOT_REAL";
const password = "SYNTHETIC_PASSWORD_NOT_REAL";
const env = {
  NODE_ENV: "test" as const,
  OTR_DEV_SUPABASE_URL: `https://${project}.supabase.co`,
  OTR_DEV_SUPABASE_SECRET_KEY: secret,
};
function input(label: "A" | "B" = "A") {
  const gateJSON = JSON.stringify({
    ownerAuthorized: true,
    scope: "AD5_SUSTAINED_AUTH_IN_PLACE",
    approvedGateSHA256:
      "0f6c8bf72e41c17a939424cbf821770ac355b7b235ce300abbb7eb6e46058bf0",
    ownerAuthorizationSHA256:
      "52d1a268af09506c311644529d8d26e050515b345a4b7d5e32c6a68e8ae8a956",
    project,
    startsAt: new Date(Date.now() - 5000).toISOString(),
    expiresAt: new Date(Date.now() + 600000).toISOString(),
  });
  return {
    gateJSON,
    gateSHA256: hash(gateJSON),
    label,
    attemptOrdinal: 1,
    password,
    absence: {
      project,
      email: `otr.ad5.sustained.20261024.${label.toLowerCase()}@example.invalid`,
      utc: new Date().toISOString(),
      rows: [],
      querySHA256: hash(exactSustainedIdentityQuery(label)),
      noUnresolvedPriorAttempt: true,
    },
  };
}
function transport(status = 201): typeof fetch {
  return async (request) => {
    const req = new Request(request);
    assert.equal(req.url, `https://${project}.supabase.co/auth/v1/admin/users`);
    assert.equal(req.method, "POST");
    assert.equal(req.headers.get("apikey"), secret);
    assert.equal(req.headers.get("authorization"), `Bearer ${secret}`);
    assert.equal(req.redirect, "error");
    const body = await req.json();
    assert.match(body.email, /^otr\.ad5\.sustained\.20261024\.[ab]@example\.invalid$/);
    return new Response(
      JSON.stringify({
        id: "10000000-0000-4000-8000-000000000001",
        email: body.email,
        created_at: new Date().toISOString(),
        access_token: "PRIVATE_RESPONSE_NOT_TO_RETURN",
      }),
      {
        status,
        headers: {
          "content-type": "application/json",
          "sb-request-id": "10000000-0000-4000-8000-000000000009",
        },
      },
    );
  };
}
test("each fixed identity sends one ordinary SDK request, retains exact201 and no secrets/session", async () => {
  for (const label of ["A", "B"] as const) {
    let calls = 0;
    const out = await executeSustainedInPlace(input(label), env, async (...args) => {
      calls++;
      return transport()(...args);
    });
    assert.equal(calls, 1);
    assert.equal(out.attempts, 1);
    assert.equal(out.receipt?.email, input(label).absence.email);
    assert.equal(out.diagnostics[0].httpStatus, 201);
    assert.equal(
      out.diagnostics[0].providerRequestId,
      "10000000-0000-4000-8000-000000000009",
    );
    for (const value of [secret, password, "PRIVATE_RESPONSE_NOT_TO_RETURN"])
      assert(!JSON.stringify(out).includes(value));
  }
});
test("wrong scope/authority/approvedGate/window reject without transport", async () => {
  for (const change of [
    { scope: "AUTONOMOUS_DEV_C_AUTH_IN_PLACE" },
    { ownerAuthorizationSHA256: "wrong" },
    { approvedGateSHA256: "wrong" },
    { expiresAt: new Date(Date.now() + 1000000).toISOString() },
    { startsAt: new Date(Date.now() + 60000).toISOString() },
  ]) {
    const i = input();
    i.gateJSON = JSON.stringify({ ...JSON.parse(i.gateJSON), ...change });
    i.gateSHA256 = hash(i.gateJSON);
    let calls = 0;
    const out = await executeSustainedInPlace(i, env, async () => {
      calls++;
      throw Error(secret);
    });
    assert.equal(calls, 0);
    assert.equal(out.attempts, 0);
    assert.equal(out.receipt, null);
  }
});
test("existing/stale/wrongIdentity/unknown prior attempt orordinal never dispatch", async () => {
  for (const change of [
    { attemptOrdinal: 0 },
    { attemptOrdinal: 3 },
    { absence: { ...input().absence, rows: [{}] } },
    { absence: { ...input().absence, utc: new Date(Date.now() - 61000).toISOString() } },
    {
      absence: { ...input().absence, email: "otr-meta-qa-20261022-01-a@example.invalid" },
    },
    { absence: { ...input().absence, noUnresolvedPriorAttempt: false } },
  ]) {
    let calls = 0;
    const out = await executeSustainedInPlace(
      { ...input(), ...change },
      env,
      async () => {
        calls++;
        throw Error(secret);
      },
    );
    assert.equal(calls, 0);
    assert.equal(out.receipt, null);
  }
});
test("second safe ordinal allowed only with newfresh exactabsence", async () => {
  const i = input();
  i.attemptOrdinal = 2;
  const out = await executeSustainedInPlace(i, env, transport());
  assert.equal(out.receipt?.email, i.absence.email);
  assert.equal(out.attemptOrdinal, 2);
});
test("UNKNOWN stops with original dispatch metadata and no automatic retry", async () => {
  let calls = 0;
  const out = await executeSustainedInPlace(input(), env, async () => {
    calls++;
    throw Error(secret);
  });
  assert.equal(calls, 1);
  assert.equal(out.receipt, null);
  assert.equal(out.diagnostics[0].outcome, "TRANSPORT_EXCEPTION");
  assert(!JSON.stringify(out).includes(secret));
});
test("non201 success remains reconcile-required without trusting SDK body", async () => {
  const out = await executeSustainedInPlace(input(), env, transport(200));
  assert.equal(out.receipt, null);
  assert.equal(out.attempts, 1);
  assert.equal(out.diagnostics[0].httpStatus, 200);
  assert.equal(out.stage, "IDENTITY_VALIDATION");
});
test("caller mutation cannot redirect fixed identity", async () => {
  const i = input();
  const promise = executeSustainedInPlace(i, env, transport());
  i.label = "B";
  i.absence.email = "bad@example.invalid";
  const out = await promise;
  assert.equal(out.receipt?.email, input().absence.email);
});
test("HTTP rejection and malformed201 retain no invented identity", async () => {
  for (const [status, body] of [
    [401, { code: "bad_jwt", message: secret }],
    [
      201,
      {
        id: "not-a-uuid",
        email: input().absence.email,
        created_at: new Date().toISOString(),
      },
    ],
  ] as const) {
    const out = await executeSustainedInPlace(
      input(),
      env,
      async () =>
        new Response(JSON.stringify(body), {
          status,
          headers: { "content-type": "application/json" },
        }),
    );
    assert.equal(out.attempts, 1);
    assert.equal(out.receipt, null);
    assert(!JSON.stringify(out).includes(secret));
  }
});
