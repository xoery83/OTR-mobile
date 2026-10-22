import assert from "node:assert/strict";
import { test, before, after, mock } from "node:test";
import { createServer } from "node:http";
import {
  executeAOnly,
  assertFreshAAbsent,
  A_EMAIL,
  type AOnlyGate,
} from "./provisionAOnly";
// Clock-only fixture; Auth transport is actual loopback, never a live identity.
before(() =>
  mock.timers.enable({ apis: ["Date"], now: Date.parse("2026-10-22T23:05:00Z") }),
);
after(() => mock.timers.reset());
const gate: AOnlyGate = {
  ownerAuthorized: true,
  scope: "A_ONLY_AUTH_CREATE_ONCE",
  project: "tuqigdxrvrerfewsxqgm",
  email: A_EMAIL,
  maxAttempts: 1,
  startsAt: "2026-10-22T23:00:00Z",
  expiresAt: "2026-10-22T23:15:00Z",
};
const secret = "SYNTHETIC_PRIVATE_VALUE",
  id = "10000000-0000-4000-8000-000000000001";
async function run(status: number, body: object) {
  const requests: unknown[] = [];
  const server = createServer(async (req, res) => {
    let text = "";
    for await (const chunk of req) text += chunk;
    requests.push(JSON.parse(text));
    res.writeHead(status, {
      "content-type": "application/json",
      "x-supabase-api-version": "2024-01-01",
      "x-request-id": id,
    });
    res.end(JSON.stringify(body));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert(address && typeof address !== "string");
    const transport: typeof fetch = async (input, options) => {
      const req = new Request(input, options);
      assert.equal(new URL(req.url).pathname, "/auth/v1/admin/users");
      return fetch(`http://127.0.0.1:${address.port}`, {
        method: req.method,
        headers: req.headers,
        body: await req.text(),
      });
    };
    return { result: await executeAOnly(gate, "fake-key", secret, transport), requests };
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}
test("A-only success dispatches exactly one A and never B; safe new identity receipt", async () => {
  const { result, requests } = await run(200, {
    id,
    email: A_EMAIL,
    private_data: secret,
  });
  assert.equal(result.status, "A_CREATED_REQUIRES_EXACT_READONLY_VERIFICATION");
  assert.equal(result.attempts, 1);
  assert.equal(result.receipt?.id, id);
  assert.equal(requests.length, 1);
  assert.equal((requests[0] as { email: string }).email, A_EMAIL);
  assert(!JSON.stringify(result).includes(secret));
});
test("A-only HTTP denial retains fixed diagnostics, never dispatches B or retries", async () => {
  const { result, requests } = await run(403, { code: "not_admin", msg: secret });
  assert.equal(result.receipt, null);
  assert.equal(result.attempts, 1);
  assert.equal(requests.length, 1);
  assert.equal(result.diagnostics[0].httpStatus, 403);
  assert.equal(result.diagnostics[0].sdkCode, "not_admin");
  assert(!JSON.stringify(result).includes(secret));
});
test("scope/B/expired/unauthorized gates fail before transport", async () => {
  for (const change of [
    { email: "otr-meta-qa-20261022-01-b@example.invalid" },
    { ownerAuthorized: false },
    { maxAttempts: 2 },
    { expiresAt: "2026-10-22T22:45:00Z" },
  ]) {
    let calls = 0;
    const result = await executeAOnly(
      { ...gate, ...change },
      "fake-key",
      secret,
      async () => {
        calls++;
        throw Error(secret);
      },
    );
    assert.equal(calls, 0);
    assert.equal(result.attempts, 0);
    assert.equal(result.receipt, null);
  }
});
test("network exception consumes single A attempt, preserves unknown and omits private message", async () => {
  let calls = 0;
  const result = await executeAOnly(gate, "fake-key", secret, async () => {
    calls++;
    throw Error(secret);
  });
  assert.equal(calls, 1);
  assert.equal(result.attempts, 1);
  assert.equal(result.diagnostics[0].outcome, "TRANSPORT_EXCEPTION");
  assert.equal(result.receipt, null);
  assert(!JSON.stringify(result).includes(secret));
});

test("fresh exact-A empty receipt required; existing, stale, invalid or wrong projection stops", () => {
  const good = {
    project: "tuqigdxrvrerfewsxqgm",
    querySHA256: "5951ed2ba596c3afeb7d0aadc66ffac3ca3879988e50dea24a5f81385643e28e",
    returncode: 0,
    utc: "2026-10-22T23:05:00Z",
    result: { rows: [] },
  };
  assert.doesNotThrow(() => assertFreshAAbsent(good));
  for (const delta of [
    { utc: "bad" },
    { utc: "2026-10-22T23:00:00Z" },
    { returncode: 1 },
    { querySHA256: "wrong" },
    { result: { rows: [{ id }] } },
    { result: {} },
  ])
    assert.throws(() => assertFreshAAbsent({ ...good, ...delta }));
});
