import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import {
  executeInPlace,
  exactIdentityQuery,
  autonomousOwnerSHA,
} from "./provisionInPlace";
const origin = "https://tuqigdxrvrerfewsxqgm.supabase.co",
  secret = "sb_secret_SYNTHETIC_PRIVATE_NOT_REAL",
  password = "SYNTHETIC_PASSWORD_NOT_REAL_LONG";
const environment = {
  NODE_ENV: "test" as const,
  OTR_DEV_SUPABASE_URL: origin,
  OTR_DEV_SUPABASE_SECRET_KEY: secret,
};
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
function input(label: "A" | "B" = "A") {
  const gateJSON = JSON.stringify({
    ownerAuthorized: true,
    scope: "AUTONOMOUS_DEV_C_AUTH_IN_PLACE",
    ownerAuthorizationSHA256: autonomousOwnerSHA,
    project: "tuqigdxrvrerfewsxqgm",
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
      project: "tuqigdxrvrerfewsxqgm",
      email: `otr-meta-qa-20261022-01-${label.toLowerCase()}@example.invalid`,
      utc: new Date().toISOString(),
      rows: [],
      querySHA256: hash(exactIdentityQuery(label)),
    },
  };
}
async function fixture(
  work: (transport: typeof fetch, count: () => number, url: string) => Promise<void>,
) {
  let count = 0;
  const server = createServer(async (req, res) => {
    let raw = "";
    for await (const c of req) raw += c;
    const body = JSON.parse(raw);
    count++;
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        id: "10000000-0000-4000-8000-000000000001",
        email: body.email,
        created_at: new Date().toISOString(),
        private_data: secret,
      }),
    );
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const address = server.address();
  assert(address && typeof address !== "string");
  const transport: typeof fetch = async (request) => {
    const req = new Request(request);
    assert.equal(new URL(req.url).origin, origin);
    assert.equal(new URL(req.url).pathname, "/auth/v1/admin/users");
    assert.equal(req.headers.get("apikey"), secret);
    assert.equal(req.headers.get("authorization"), `Bearer ${secret}`);
    assert.equal(req.redirect, "error");
    return fetch(`http://127.0.0.1:${address.port}`, {
      method: req.method,
      body: await req.text(),
      headers: { "content-type": "application/json" },
    });
  };
  try {
    await work(transport, () => count, `http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
}
test("fixed in-place source/SDK each label sends exactly one scoped POST and safe identity receipt", async () => {
  for (const label of ["A", "B"] as const)
    await fixture(async (transport, count) => {
      const i = input(label);
      const out = await executeInPlace(i, environment, transport);
      assert.equal(out.attempts, 1);
      assert.equal(count(), 1);
      assert.equal(out.receipt?.email, i.absence.email);
      assert(!JSON.stringify(out).includes(secret));
      assert(!JSON.stringify(out).includes(password));
    });
});
test("invalid absence/window/source/ordinal refuse all wire requests", async () => {
  const changes = [
    { attemptOrdinal: 3 },
    { attemptOrdinal: 0 },
    { absence: { ...input().absence, rows: [{}] } },
    { absence: { ...input().absence, utc: new Date(Date.now() - 120000).toISOString() } },
    { gateSHA256: "wrong" },
  ];
  for (const change of changes) {
    let count = 0;
    const out = await executeInPlace({ ...input(), ...change }, environment, async () => {
      count++;
      throw Error(secret);
    });
    assert.equal(count, 0);
    assert.equal(out.attempts, 0);
  }
  const out = await executeInPlace(
    input(),
    { ...environment, OTR_DEV_SUPABASE_URL: "https://wrong.invalid" },
    async () => {
      throw Error("must not call");
    },
  );
  assert.equal(out.attempts, 0);
});
test("unknown network attempt retained exactly once with no raw message/key", async () => {
  let count = 0;
  const out = await executeInPlace(input(), environment, async () => {
    count++;
    throw Error(secret);
  });
  assert.equal(count, 1);
  assert.equal(out.attempts, 1);
  assert.equal(out.receipt, null);
  assert.equal(out.diagnostics[0].outcome, "TRANSPORT_EXCEPTION");
  assert(!JSON.stringify(out).includes(secret));
});
test("async caller mutation cannot rebind label/window/absence", async () => {
  await fixture(async (transport, count) => {
    const i = input();
    const pending = executeInPlace(i, environment, transport);
    i.label = "B";
    i.absence.email = "changed@example.invalid";
    const out = await pending;
    assert.equal(count(), 1);
    assert.equal(out.receipt?.email, "otr-meta-qa-20261022-01-a@example.invalid");
  });
});
test("actual bundled stdin invocation works without remote files; private env key stays out of receipt", async () => {
  await fixture(async (_transport, count, url) => {
    const bundle = readFileSync(
      "/private/tmp/otr-auth-401-diagnosis-20261023/provision-in-place.mjs",
      "utf8",
    );
    // This child transports only to the real localhost fixture. Production calls the same bundled function
    // with original process.env and default fetch; no identity/permission fixture is claimed as DEV PASS.
    const i = input();
    const proc = spawn(process.execPath, ["--input-type=module"], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "",
      stderr = "";
    proc.stdout.on("data", (c) => (stdout += c));
    proc.stderr.on("data", (c) => (stderr += c));
    proc.stdin.end(
      bundle +
        "\nconst result=await executeInPlace(" +
        JSON.stringify(i) +
        "," +
        JSON.stringify(environment) +
        ",async(request)=>{const req=new Request(request);return fetch(" +
        JSON.stringify(url) +
        ",{method:req.method,body:await req.text(),headers:{'content-type':'application/json'}})});console.log(JSON.stringify(result));",
    );
    const code = await new Promise<number | null>((r) => proc.on("close", r));
    assert.equal(code, 0);
    const result = JSON.parse(stdout);
    assert.equal(result.attempts, 1);
    assert.equal(result.receipt.email, i.absence.email);
    assert.equal(count(), 1);
    assert(!stdout.includes(secret));
    assert(!stderr.includes(secret));
  });
});
