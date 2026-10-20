// Disposable fixture only: real built startup, synthetic keys, all child egress denied.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync, readdirSync, readlinkSync } from "node:fs";
import { networkInterfaces } from "node:os";
import net from "node:net";
import { resolve } from "node:path";

const bundle = resolve(process.argv[2] ?? "dist/server.mjs");
const deny = `
import net from 'node:net';
import tls from 'node:tls';
import http from 'node:http';
import https from 'node:https';
import { syncBuiltinESMExports } from 'node:module';
const denied = () => { throw new Error('FIXTURE_EGRESS_DENIED'); };
globalThis.fetch = async () => { throw new Error('FIXTURE_EGRESS_DENIED'); };
net.connect = net.createConnection = tls.connect = http.request = https.request = denied;
syncBuiltinESMExports();
`;
const child = spawn(
  process.execPath,
  ["--import", `data:text/javascript,${encodeURIComponent(deny)}`, bundle],
  {
    env: {
      PATH: process.env.PATH,
      NODE_ENV: "test",
      OTR_DEV_SUPABASE_URL: "https://tuqigdxrvrerfewsxqgm.supabase.co",
      OTR_DEV_SUPABASE_PUBLISHABLE_KEY: "FAKE_FIXTURE_PUBLIC",
      OTR_DEV_SUPABASE_SECRET_KEY: "FAKE_FIXTURE_BACKEND",
      OTR_DEV_BACKEND_NETWORK_MODE: "host",
      OTR_DEV_BACKEND_BIND_ADDRESS: "127.0.0.1",
      OTR_DEV_BACKEND_PORT: "8787",
    },
    stdio: ["ignore", "pipe", "pipe"],
  },
);
let output = "";
child.stdout.on("data", (b) => {
  output += b;
});
child.stderr.on("data", (b) => {
  output += b;
});
const exited = new Promise((resolve) => child.once("exit", resolve));
async function tcpDenied(address, family) {
  await new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: address, port: 8787, family });
    socket.setTimeout(2000, () => socket.destroy(new Error("UNPROVEN_TIMEOUT")));
    socket.once("connect", () => {
      socket.destroy();
      reject(new Error(`UNEXPECTED_INGRESS:${address}`));
    });
    socket.once("error", (error) => {
      socket.destroy();
      if (error.code === "ECONNREFUSED") resolve();
      else reject(error);
    });
  });
}
try {
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error(`STARTUP_TIMEOUT:${output}`)),
      10000,
    );
    child.once("error", reject);
    child.once("exit", () => {
      clearTimeout(timeout);
      reject(new Error(`STARTUP_EXIT:${output}`));
    });
    child.stdout.on("data", () => {
      if (output.includes('"event":"listening"')) {
        clearTimeout(timeout);
        resolve();
      }
    });
  });
  const origin = "http://127.0.0.1:8787";
  const health = await fetch(`${origin}/health`);
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { status: "ok", environment: "development" });
  const unauthenticated = await fetch(
    `${origin}/v2/trips/10000000-0000-4000-8000-000000000001/ledger/bootstrap`,
  );
  assert.equal(unauthenticated.status, 401);
  assert.equal((await unauthenticated.json()).error.code, "AUTH_REQUIRED");
  assert.equal((await fetch(`${origin}/fixture-unknown`)).status, 404);
  const addresses = Object.values(networkInterfaces())
    .flat()
    .filter((a) => a && !a.internal && a.family === "IPv4")
    .map((a) => a.address);
  assert.ok(
    addresses.length,
    "No non-loopback IPv4 interface available for denial proof",
  );
  for (const address of addresses) await tcpDenied(address, 4);
  await tcpDenied("::1", 6);
  // Inspect only sockets owned by this child, not unrelated processes in the namespace.
  assert.equal(
    process.platform,
    "linux",
    "Actual /proc socket attestation requires Linux",
  );
  const inodes = new Set(
    readdirSync(`/proc/${child.pid}/fd`).map((fd) => {
      try {
        return readlinkSync(`/proc/${child.pid}/fd/${fd}`).match(
          /^socket:\[(\d+)\]$/,
        )?.[1];
      } catch {
        return undefined;
      }
    }),
  );
  const listeners = ["tcp", "tcp6", "udp", "udp6"].flatMap((name) =>
    readFileSync(`/proc/${child.pid}/net/${name}`, "utf8")
      .trim()
      .split("\n")
      .slice(1)
      .map((line) => line.trim().split(/\s+/))
      .filter(
        (fields) =>
          inodes.has(fields[9]) && (name.startsWith("udp") || fields[3] === "0A"),
      )
      .map((fields) => ({ protocol: name, local: fields[1], state: fields[3] })),
  );
  assert.deepEqual(listeners, [{ protocol: "tcp", local: "0100007F:2253", state: "0A" }]);
  console.log(
    JSON.stringify({
      result: "PASS",
      pid: child.pid,
      listeners,
      deniedIPv4: addresses,
      deniedIPv6Loopback: true,
      health: 200,
      unauthenticated: 401,
      unknownRoute: 404,
      childEgress: "DENIED",
      networkMode: "ISOLATED_NAMESPACE_HOST_PROFILE",
    }),
  );
} finally {
  child.kill("SIGTERM");
  await exited;
}
