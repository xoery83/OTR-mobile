import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "node:http";
import { createClient } from "@supabase/supabase-js";
import {
  fetchProvisionWithReceipt,
  reserveProvisionDispatch,
  retainProvisionSdkCode,
  type ProvisionDiagnostic,
} from "./provisionDiagnostics";
const secret = "SYNTHETIC_PRIVATE_PASSWORD_sb_secret_never_export";
const requestId = "10000000-0000-4000-8000-000000000001";
async function fixture(
  status: number,
  code: string,
  header: string,
  work: (url: string, count: () => number) => Promise<void>,
) {
  let count = 0;
  const server = createServer((_req, response) => {
    count++;
    response.writeHead(status, {
      "content-type": "application/json",
      "x-request-id": header,
      "x-supabase-api-version": "2024-01-01",
    });
    response.end(JSON.stringify({ code, msg: secret, private_data: secret }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert(address && typeof address !== "string");
    await work(`http://127.0.0.1:${address.port}`, () => count);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}
test("actual SDK/loopback retains HTTP/category/allowlisted code/request-id without private response", async () => {
  await fixture(403, "not_admin", requestId, async (url, count) => {
    const attempted = new Set<string>(),
      diagnostics: ProvisionDiagnostic[] = [];
    const client = createClient(url, "fixture-only-key", {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: async (url, options) => {
          const req = new Request(url, options),
            body = await req.clone().json();
          return fetchProvisionWithReceipt(
            req,
            reserveProvisionDispatch(attempted, body.email, diagnostics),
          );
        },
      },
    });
    const { error } = await client.auth.admin.createUser({
      email: "fixture@example.invalid",
      password: secret,
    });
    retainProvisionSdkCode(diagnostics[0], error);
    assert.deepEqual(diagnostics[0], {
      attempt: 1,
      outcome: "HTTP_RESPONSE",
      httpStatus: 403,
      category: "AUTH_REJECTED",
      providerRequestId: requestId,
      sdkCode: "not_admin",
    });
    assert.equal(count(), 1);
    // A second SDK dispatch for the same email is denied before the wire; attempts never refunded.
    await client.auth.admin.createUser({
      email: "fixture@example.invalid",
      password: secret,
    });
    assert.equal(count(), 1);
    assert.equal(diagnostics.length, 1);
    assert(!JSON.stringify(diagnostics).includes(secret));
  });
});
test("malicious arbitrary error code/header/message cannot enter safe receipt", async () => {
  await fixture(422, secret, secret, async (url) => {
    const d = reserveProvisionDispatch(new Set(), "fixture@example.invalid", []);
    const response = await fetchProvisionWithReceipt(new Request(url), d);
    retainProvisionSdkCode(d, await response.json());
    assert.equal(d.category, "VALIDATION_REJECTED");
    assert.equal(d.httpStatus, 422);
    assert.equal(d.providerRequestId, null);
    assert.equal(d.sdkCode, null);
    assert(!JSON.stringify(d).includes(secret));
  });
});
test("network throw retains unknown commit outcome and no raw exception; reservation stays consumed", async () => {
  const attempted = new Set<string>(),
    diagnostics: ProvisionDiagnostic[] = [];
  const d = reserveProvisionDispatch(attempted, "A", diagnostics);
  await assert.rejects(
    fetchProvisionWithReceipt(new Request("http://127.0.0.1"), d, async () => {
      throw new Error(secret);
    }),
    /^Error: C_AUTH_TRANSPORT_OUTCOME_UNKNOWN$/,
  );
  assert.equal(d.outcome, "TRANSPORT_EXCEPTION");
  assert.equal(d.httpStatus, null);
  assert.equal(d.category, "TRANSPORT_FAILURE");
  assert(!JSON.stringify(d).includes(secret));
  assert.throws(() => reserveProvisionDispatch(attempted, "A", diagnostics));
  reserveProvisionDispatch(attempted, "B", diagnostics);
  assert.throws(() => reserveProvisionDispatch(attempted, "C", diagnostics));
  assert.equal(diagnostics.length, 2);
});
test("HTTP success versus rate/server rejection keeps exact status without claiming user creation", async () => {
  for (const [status, category] of [
    [200, "HTTP_SUCCESS"],
    [429, "RATE_LIMITED"],
    [503, "SERVER_ERROR"],
  ] as const) {
    await fixture(status, "unexpected_failure", requestId, async (url) => {
      const d = reserveProvisionDispatch(new Set(), "A", []);
      await fetchProvisionWithReceipt(new Request(url), d);
      assert.equal(d.httpStatus, status);
      assert.equal(d.category, category);
      assert.equal(d.outcome, "HTTP_RESPONSE");
      assert(!("created" in d));
    });
  }
});
