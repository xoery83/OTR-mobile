import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { recoverPasswordInPlace, fixtures } from "./recoverPasswordInPlace";
import { autonomousOwnerSHA } from "./provisionInPlace";
const secret = "sb_secret_SYNTHETIC_PRIVATE",
  password = "NEW_SYNTHETIC_PASSWORD_LONG",
  environment = {
    NODE_ENV: "test" as const,
    OTR_DEV_SUPABASE_URL: "https://tuqigdxrvrerfewsxqgm.supabase.co",
    OTR_DEV_SUPABASE_SECRET_KEY: secret,
  };
function input(label: "A" | "B") {
  const gateJSON = JSON.stringify({
    ownerAuthorized: true,
    scope: "AUTONOMOUS_DEV_SYNTHETIC_PASSWORD_RECOVERY",
    ownerAuthorizationSHA256: autonomousOwnerSHA,
    project: "tuqigdxrvrerfewsxqgm",
    startsAt: new Date(Date.now() - 5000).toISOString(),
    expiresAt: new Date(Date.now() + 600000).toISOString(),
  });
  return {
    gateJSON,
    gateSHA256: createHash("sha256").update(gateJSON).digest("hex"),
    label,
    password,
    proof: { ...fixtures[label], utc: new Date().toISOString() },
  };
}
test("each proven new fixture receives only password PUT at its exact ID, no key/private response emitted", async () => {
  for (const label of ["A", "B"] as const) {
    let requests = 0;
    const server = createServer(async (req, res) => {
      requests++;
      assert.equal(req.method, "PUT");
      assert.equal(req.url, `/auth/v1/admin/users/${fixtures[label].id}`);
      let raw = "";
      for await (const c of req) raw += c;
      assert.deepEqual(JSON.parse(raw), { password });
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          ...fixtures[label],
          created_at: fixtures[label].createdAt,
          private_data: secret,
        }),
      );
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const address = server.address();
    assert(address && typeof address !== "string");
    try {
      const result = await recoverPasswordInPlace(
        input(label),
        environment,
        async (request) => {
          const req = new Request(request);
          assert.equal(req.redirect, "error");
          return fetch(`http://127.0.0.1:${address.port}${new URL(req.url).pathname}`, {
            method: req.method,
            body: await req.text(),
            headers: { "content-type": "application/json" },
          });
        },
      );
      assert.equal(requests, 1);
      assert.equal(result.receipt?.id, fixtures[label].id);
      assert(!JSON.stringify(result).includes(secret));
      assert(!JSON.stringify(result).includes(password));
    } finally {
      await new Promise<void>((r) => server.close(() => r()));
    }
  }
});
test("arbitrary/old fixture ID or time/email, stale proof and invalid hash block all dispatch", async () => {
  for (const delta of [
    { id: "10000000-0000-4000-8000-000000000001" },
    { email: "other@example.invalid" },
    { createdAt: "2026-10-01T00:00:00Z" },
    { utc: new Date(Date.now() - 120000).toISOString() },
  ]) {
    let calls = 0;
    const i = input("A");
    const result = await recoverPasswordInPlace(
      { ...i, proof: { ...i.proof, ...delta } },
      environment,
      async () => {
        calls++;
        throw Error(secret);
      },
    );
    assert.equal(calls, 0);
    assert.equal(result.attempts, 0);
  }
});
test("unknown update consumes exactly one request, never retries or exports private exception", async () => {
  let calls = 0;
  const result = await recoverPasswordInPlace(input("A"), environment, async () => {
    calls++;
    throw Error(secret);
  });
  assert.equal(calls, 1);
  assert.equal(result.receipt, null);
  assert.equal(result.diagnostics[0].outcome, "TRANSPORT_EXCEPTION");
  assert(!JSON.stringify(result).includes(secret));
});
