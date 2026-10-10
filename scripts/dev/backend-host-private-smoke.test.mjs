import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";

const source = readFileSync(
  new URL("./backend-host-private-smoke.cjs", import.meta.url),
  "utf8",
);

async function fixture({
  status = 200,
  admin = "ECONNREFUSED",
  hostnameRejects = true,
} = {}) {
  const output = [];
  const calls = [];
  const process = {
    env: {
      OTR_DEV_SUPABASE_SECRET_KEY: "sb_secret_SYNTHETIC_ONLY",
      OTR_DEV_SUPABASE_URL: "https://tuqigdxrvrerfewsxqgm.supabase.co",
    },
  };
  function socket(event, value) {
    const s = new EventEmitter();
    s.destroy = () => {};
    s.setTimeout = () => {};
    s.write = () => queueMicrotask(() => s.emit("data", Buffer.from("S")));
    queueMicrotask(() => s.emit(event, value));
    return s;
  }
  const modules = {
    "node:buffer": { Buffer },
    "node:fs": { readFileSync: () => "PUBLIC_FIXTURE_CA" },
    "node:dns": { promises: { resolve6: async () => ["2001:db8::1"] } },
    "node:net": {
      createConnection: (options) => {
        assert.equal(options.family, 6);
        calls.push("TCP5432");
        return socket("connect");
      },
      connect: (options) =>
        socket("error", { code: typeof options === "string" ? "ENOENT" : admin }),
    },
    "node:tls": {
      connect: (options) => {
        assert.equal(options.rejectUnauthorized, true);
        assert.equal(options.minVersion, "TLSv1.3");
        assert.equal(options.maxVersion, "TLSv1.3");
        const error = !options.ca.length
          ? "SELF_SIGNED_CERT_IN_CHAIN"
          : options.servername === "wrong.invalid" && hostnameRejects
            ? "ERR_TLS_CERT_ALTNAME_INVALID"
            : null;
        const s = socket(error ? "error" : "secureConnect", { code: error });
        Object.assign(s, {
          authorized: true,
          getProtocol: () => "TLSv1.3",
          remoteAddress: "2001:db8::1",
          remoteFamily: "IPv6",
        });
        return s;
      },
    },
  };
  await vm.runInNewContext(source, {
    require: (name) => {
      assert.ok(modules[name]);
      return modules[name];
    },
    Buffer,
    process,
    setTimeout,
    clearTimeout,
    AbortSignal,
    console: { log: (line) => output.push(line) },
    fetch: async (url, options) => {
      calls.push("API_READ");
      assert.equal(
        url,
        process.env.OTR_DEV_SUPABASE_URL + "/auth/v1/admin/users?page=1&per_page=1",
      );
      assert.equal(options.headers.apikey, process.env.OTR_DEV_SUPABASE_SECRET_KEY);
      return { status, body: { cancel: async () => calls.push("BODY_DISCARDED") } };
    },
  });
  assert.ok(!output.join().includes("SYNTHETIC_ONLY"));
  return { output, calls, exit: process.exitCode };
}

test("acceptance source parses before maintenance", () => {
  new vm.Script(source);
});
test("combined success checks API, TLS positive/negatives and Admin denial", async () => {
  const r = await fixture();
  assert.equal(r.exit, undefined);
  assert.equal(JSON.parse(r.output[0]).admin_tcp, "DENIED");
  assert.deepEqual(r.calls, [
    "API_READ",
    "BODY_DISCARDED",
    "TCP5432",
    "TCP5432",
    "TCP5432",
  ]);
});
for (const [name, options] of [
  ["API rejection", { status: 401 }],
  ["Admin reachable", { admin: "UNEXPECTED" }],
  ["wrong hostname accepted", { hostnameRejects: false }],
]) {
  test(name + " fails closed with fixed nonsecret output", async () => {
    const r = await fixture(options);
    assert.equal(r.exit, 1);
    assert.deepEqual(r.output, ["FAILED: private Backend acceptance"]);
  });
}
