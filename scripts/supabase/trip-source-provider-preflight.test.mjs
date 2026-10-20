import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { mkdir, open, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { createServer, request } from "node:http";
import { once } from "node:events";
import { join } from "node:path";
import test from "node:test";
import { createClient } from "@supabase/supabase-js";

// Test/preflight ONLY. Never imported by Backend/Mobile or provisioned at runtime.
const root = "/Users/xoery/Project/otr-mobile-import";
assert.equal(process.cwd(), root);
assert.equal(
  execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
  "edd41a41ff00a163e78434cdc754a65fcd8e2577",
);
const workspace = join(root, ".ci3e");
const container = "supabase_db_otr-trip-ci3e-preflight";
const origin = "http://127.0.0.1:57321";
const bucketName = "trip-source-material";
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const uuid = (n) => "ce000000-0000-4000-8000-" + String(n).padStart(12, "0");
const identity = (n) =>
  Object.freeze({ trip: uuid(1), source: uuid(2), representation: uuid(n) });
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
function key(record) {
  assert.deepEqual(Object.keys(record).sort(), ["representation", "source", "trip"]);
  for (const value of Object.values(record)) assert.match(value, uuidPattern);
  return (
    "v1/" + record.trip + "/" + record.source + "/" + record.representation + "/payload"
  );
}
function sql(source) {
  return execFileSync(
    "docker",
    [
      "exec",
      "-i",
      container,
      "psql",
      "-X",
      "-qAt",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      "postgres",
      "-d",
      "postgres",
    ],
    { cwd: root, encoding: "utf8", input: source, stdio: "pipe" },
  ).trim();
}
const snapshot = () =>
  sql(
    "select jsonb_build_object('gate',(select enabled from public.trip_source_command_gate),'sources',(select count(*) from public.trip_sources),'representations',(select count(*) from public.trip_source_representations),'actions',(select count(*) from public.trip_source_actions),'operations',(select count(*) from public.trip_source_operations),'roles',(select jsonb_agg(jsonb_build_object('name',rolname,'login',rolcanlogin,'super',rolsuper,'bypass',rolbypassrls) order by rolname) from pg_roles where rolname in ('otr_trip_source_writer','otr_trip_source_command_gateway','otr_trip_source_operation_reader')))",
  );
const evidence = {
  observations: [],
  sdk: [],
  blocks: [
    "provider post-crash terminality",
    "bounded parser/decode verification",
    "runtime admission/provisioning",
  ],
};
const observations = (family, facts) => evidence.observations.push({ family, ...facts });
let credentials;
function headers(mime = "image/png") {
  return {
    authorization: "Bearer " + credentials.SERVICE_ROLE_KEY,
    apikey: credentials.SERVICE_ROLE_KEY,
    "content-type": mime,
    "x-upsert": "false",
  };
}
async function localFetch(url, options = {}) {
  const parsed = new URL(url instanceof Request ? url.url : String(url));
  assert.equal(parsed.origin, origin, "no remote access");
  assert.ok(parsed.pathname.startsWith("/storage/v1/"));
  return fetch(url, { ...options, redirect: "error" });
}
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jNncAAAAASUVORK5CYII=",
  "base64",
);
const otherPng = Buffer.concat([png, Buffer.from("different synthetic bytes")]);
const acceptedMime = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/heic",
  "image/heif",
]);
const limit = (mime) => {
  assert.ok(acceptedMime.has(mime));
  return mime === "application/pdf" ? 10 * 1024 ** 2 : 50 * 1024 ** 2;
};
// Recognition is a candidate classification, NEVER VERIFIED or parser safety.
function candidateFormat(bytes) {
  if (bytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex")))
    return "image/png";
  if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255)
    return "image/jpeg";
  if (/^%PDF-1\.[0-9]/.test(bytes.subarray(0, 8).toString("ascii")))
    return "application/pdf";
  if (bytes.length >= 16 && bytes.toString("ascii", 4, 8) === "ftyp") {
    const size = bytes.readUInt32BE(0);
    if (size < 16 || size > 4096 || size > bytes.length || (size - 16) % 4) return null;
    const major = bytes.toString("ascii", 8, 12);
    const brands = [];
    for (let i = 16; i < size; i += 4) brands.push(bytes.toString("ascii", i, i + 4));
    if (
      ["heic", "heix"].includes(major) &&
      !brands.some((v) => ["avif", "avis", "jpeg"].includes(v))
    )
      return "image/heic";
    // mif1/msf1 are generic containers; no invented HEIF codec guarantee.
  }
  return null;
}
function descriptorMatches(bytes, mime, expected) {
  return (
    bytes.length === expected.count &&
    sha(bytes) === expected.hash &&
    mime === expected.mime &&
    candidateFormat(bytes) === expected.mime
  );
}
const bindingPath = (binding) => {
  assert.deepEqual(Object.keys(binding).sort(), ["account", "attempt", "operation"]);
  for (const value of Object.values(binding)) assert.match(value, uuidPattern);
  return join(workspace, "staging", binding.account, binding.operation, binding.attempt);
};
// ponytail: local single-owner budget only; durable cross-worker quota is a runtime gate.
const stages = new Map();
const quota = 64 * 1024 ** 2;
async function stage(binding, mime, expectedCount, chunks) {
  assert.ok(
    Number.isSafeInteger(expectedCount) &&
      expectedCount > 0 &&
      expectedCount <= limit(mime),
  );
  const path = bindingPath(binding);
  assert.ok(!stages.has(path), "one exact staging attempt");
  assert.ok(
    [...stages.values()].reduce((sum, value) => sum + value.reserved, 0) +
      expectedCount <=
      quota,
    "staging quota",
  );
  const entry = {
    binding,
    path,
    reserved: expectedCount,
    phase: "ADMITTED",
    references: 0,
    count: 0,
  };
  stages.set(path, entry);
  const base = join(workspace, "staging");
  for (const dir of [
    base,
    join(base, binding.account),
    join(base, binding.account, binding.operation),
    path,
  ])
    await mkdir(dir, { recursive: true, mode: 0o700 });
  const file = await open(join(path, "payload.part"), "wx", 0o600);
  const hash = createHash("sha256");
  try {
    for await (const chunk of chunks) {
      assert.ok(chunk.byteLength <= 1024 ** 2, "bounded input chunk");
      assert.ok(
        entry.count + chunk.length <= expectedCount &&
          entry.count + chunk.length <= limit(mime),
        "byte bound",
      );
      hash.update(chunk);
      await file.writeFile(chunk);
      entry.count += chunk.length;
    }
    assert.equal(entry.count, expectedCount, "exact count");
    entry.hash = hash.digest("hex");
    await file.sync();
  } catch (error) {
    await file.close();
    await rm(path, { recursive: true });
    stages.delete(path);
    throw error; // No provider request was dispatched; local partial may be removed.
  }
  await file.close();
  await writeFile(
    join(path, "inventory.json"),
    JSON.stringify({ binding, count: entry.count, hash: entry.hash, phase: entry.phase }),
    { mode: 0o600, flag: "wx" },
  );
  return entry;
}
async function cleanup(entry, account) {
  assert.equal(account, entry.binding.account, "no cross-Account staging access");
  assert.equal(entry.phase, "IO_QUIESCENT", "timeout/abort/lease are not quiescence");
  assert.equal(entry.references, 0, "required reference retained");
  assert.equal(entry.path, bindingPath(entry.binding));
  await rm(entry.path, { recursive: true });
  stages.delete(entry.path);
}
async function inventory() {
  const result = [];
  const base = join(workspace, "staging");
  for (const account of await readdir(base))
    for (const operation of await readdir(join(base, account)))
      for (const attempt of await readdir(join(base, account, operation))) {
        const binding = { account, operation, attempt };
        const saved = JSON.parse(
          await readFile(join(bindingPath(binding), "inventory.json"), "utf8"),
        );
        assert.deepEqual(saved.binding, binding);
        result.push({ ...saved, recoveredPhase: "IO_UNKNOWN" });
      }
  return result;
}
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
};
// Controlled test relay owns an accepted request independently of its caller.
// This measures actual local Storage writes; it is NOT production cancellation semantics.
async function relay(record, responseLost = false) {
  const received = deferred(),
    release = deferred(),
    terminal = deferred();
  const object = key(record);
  const server = createServer(async (req, res) => {
    try {
      assert.equal(req.url, "/accepted");
      let bytes = Buffer.alloc(0);
      for await (const chunk of req) {
        assert.ok(bytes.length + chunk.length <= 4096);
        bytes = Buffer.concat([bytes, chunk]);
      }
      received.resolve();
      await release.promise;
      const result = await localFetch(
        origin + "/storage/v1/object/" + bucketName + "/" + object,
        { method: "POST", headers: headers(), body: bytes },
      );
      const body = await result.text();
      terminal.resolve({ status: result.status, responseObservedByOwner: true });
      if (responseLost) res.destroy();
      else if (!res.destroyed) {
        res.writeHead(result.status);
        res.end(body);
      }
    } catch (error) {
      terminal.resolve({ error: error.message });
      res.destroy();
    }
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return {
    url: "http://127.0.0.1:" + server.address().port + "/accepted",
    received,
    release,
    terminal,
    close: async () => {
      server.closeAllConnections();
      server.close();
      await once(server, "close");
    },
  };
}

test("C-I3E local-only provider and staging preflight", async (t) => {
  const before = snapshot();
  assert.equal(JSON.parse(before).gate, false);
  credentials = JSON.parse(
    execFileSync(
      join(root, "node_modules/.bin/supabase"),
      ["status", "--output", "json", "--workdir", workspace],
      {
        cwd: root,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, TMPDIR: workspace },
      },
    ),
  );
  assert.equal(credentials.API_URL, origin);
  assert.ok(credentials.SERVICE_ROLE_KEY);
  const client = createClient(origin, credentials.SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      fetch: async (url, options) => {
        const response = await localFetch(url, options);
        evidence.sdk.push({
          method: options.method,
          upsert: new Headers(options.headers).get("x-upsert"),
          status: response.status,
        });
        return response;
      },
    },
  });
  const bucket = client.storage.from(bucketName);
  const create = (record, bytes, contentType = "image/png") =>
    bucket.upload(key(record), bytes, { upsert: false, contentType });
  const read = async (record) => {
    const result = await bucket.download(key(record));
    assert.equal(result.error, null);
    return {
      bytes: Buffer.from(await result.data.arrayBuffer()),
      mime: result.data.type,
    };
  };
  try {
    await t.test("fixed identity and traversal/encoding/caller-path rejection", () => {
      assert.equal(
        key(identity(10)),
        "v1/" + uuid(1) + "/" + uuid(2) + "/" + uuid(10) + "/payload",
      );
      for (const bad of ["../x", "%2f", uuid(1).toUpperCase(), uuid(1) + "/", "x", null])
        assert.throws(() => key({ ...identity(10), trip: bad }));
      assert.throws(() => key({ ...identity(10), bucket: "ledger-receipts" }));
      assert.throws(() => key({ ...identity(10), path: "generic" }));
      assert.notEqual(key(identity(10)), key(identity(11)));
    });
    await t.test(
      "real SDK first create, collision, original-byte preservation",
      async () => {
        assert.equal((await create(identity(10), png)).error, null);
        const collision = await create(identity(10), otherPng);
        assert.ok(collision.error);
        observations("create-only", {
          first: "success",
          second: {
            statusCode: collision.error.statusCode,
            error: collision.error.error,
            message: collision.error.message,
          },
        });
        assert.deepEqual((await read(identity(10))).bytes, png);
        assert.ok(
          evidence.sdk
            .filter((v) => v.method === "POST")
            .every((v) => v.upsert === "false"),
        );
      },
    );
    await t.test(
      "identical collision reconciles actual hash/count/MIME without overwrite",
      async () => {
        assert.ok((await create(identity(10), png)).error);
        const actual = await read(identity(10));
        assert.ok(
          descriptorMatches(actual.bytes, actual.mime, {
            hash: sha(png),
            count: png.length,
            mime: "image/png",
          }),
        );
        assert.ok(
          !descriptorMatches(actual.bytes, actual.mime, {
            hash: sha(otherPng),
            count: otherPng.length,
            mime: "image/png",
          }),
        );
        observations("collision", {
          identicalBytes: true,
          mismatch: "INTEGRITY_INCIDENT_NO_REPAIR",
          establishesQuiescence: false,
        });
      },
    );
    await t.test(
      "provider content-type is a claim, not actual format verification",
      async () => {
        assert.equal((await create(identity(12), png, "application/pdf")).error, null);
        const actual = await read(identity(12));
        assert.equal(actual.mime, "application/pdf");
        assert.equal(candidateFormat(actual.bytes), "image/png");
        assert.ok(
          !descriptorMatches(actual.bytes, actual.mime, {
            hash: sha(png),
            count: png.length,
            mime: "application/pdf",
          }),
        );
        observations("metadata", {
          declaredPdfStoredPng: true,
          trustworthySha256: "must hash actual bytes",
          verified: false,
        });
      },
    );
    await t.test(
      "parallel creates have one winner and preserve that exact object",
      async () => {
        const results = await Promise.all([
          create(identity(14), png),
          create(identity(14), otherPng),
        ]);
        assert.equal(results.filter((v) => v.error === null).length, 1);
        const winner = results[0].error === null ? png : otherPng;
        assert.deepEqual((await read(identity(14))).bytes, winner);
        observations("parallel-create", { winners: 1, exactWinnerBytesPreserved: true });
      },
    );
    await t.test(
      "bounded actual provider read computes hash/count and rejects excess bytes",
      async () => {
        const boundedRead = async (maximum) => {
          const response = await localFetch(
            origin +
              "/storage/v1/object/authenticated/" +
              bucketName +
              "/" +
              key(identity(10)),
            { headers: headers() },
          );
          assert.equal(response.status, 200);
          const reader = response.body.getReader(),
            hash = createHash("sha256");
          let count = 0;
          try {
            for (;;) {
              const { done, value } = await reader.read();
              if (done) break;
              assert.ok(
                count + value.byteLength <= maximum,
                "actual provider read byte bound",
              );
              count += value.byteLength;
              hash.update(value);
            }
            return { count, hash: hash.digest("hex") };
          } finally {
            await reader.cancel();
            reader.releaseLock();
          }
        };
        assert.deepEqual(await boundedRead(png.length), {
          count: png.length,
          hash: sha(png),
        });
        await assert.rejects(boundedRead(png.length - 1), /read byte bound/);
      },
    );
    await t.test("anonymous direct Source Storage read/write denied", async () => {
      const anon = createClient(origin, credentials.ANON_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { fetch: localFetch },
      }).storage.from(bucketName);
      assert.ok(
        (
          await anon.upload(key(identity(13)), png, {
            upsert: false,
            contentType: "image/png",
          })
        ).error,
      );
      assert.ok((await anon.download(key(identity(10)))).error);
    });
    for (const [mode, n] of [
      ["timeout", 20],
      ["cancellation", 21],
      ["connection-drop", 22],
      ["caller-process-crash", 23],
      ["response-loss", 24],
    ]) {
      await t.test(mode + " does not prove writer quiescence", async () => {
        const owner = await relay(identity(n), mode === "response-loss");
        let child, pending, connection, controller;
        try {
          if (mode === "caller-process-crash") {
            child = spawn(
              process.execPath,
              [
                "--input-type=module",
                "-e",
                "let s='';for await(const c of process.stdin)s+=c;const p=JSON.parse(s);await fetch(p.url,{method:'POST',body:Buffer.from(p.bytes,'base64')});",
              ],
              { cwd: root, stdio: ["pipe", "ignore", "ignore"] },
            );
            child.stdin.end(
              JSON.stringify({ url: owner.url, bytes: png.toString("base64") }),
            );
          } else if (mode === "connection-drop") {
            connection = request(owner.url, { method: "POST" });
            connection.on("error", () => {});
            connection.end(png);
          } else {
            controller = new AbortController();
            pending = fetch(owner.url, {
              method: "POST",
              body: png,
              signal: controller.signal,
            }).then(
              () => "response",
              () => "caller-lost",
            );
          }
          await owner.received.promise;
          if (mode === "timeout") {
            await new Promise((r) => setTimeout(r, 20));
            controller.abort();
          }
          if (mode === "cancellation") controller.abort();
          if (mode === "connection-drop") connection.destroy();
          if (child) {
            child.kill("SIGKILL");
            await once(child, "close");
          }
          if (pending && mode !== "response-loss")
            assert.equal(await pending, "caller-lost");
          assert.ok(
            (await bucket.download(key(identity(n)))).error,
            "no object before owner forwards",
          );
          owner.release.resolve();
          const completion = await owner.terminal.promise;
          assert.equal(completion.status, 200);
          assert.deepEqual(
            (await read(identity(n))).bytes,
            png,
            "late actual provider creation after caller loss",
          );
          if (mode === "response-loss") assert.equal(await pending, "caller-lost");
          observations(mode, {
            callerObservation: "IO_UNKNOWN",
            lateProviderCreate: true,
            terminalTrustedRelayObservation: completion.status,
            objectExistenceAlone: "not quiescence",
          });
        } finally {
          owner.release.resolve();
          await owner.close();
        }
      });
    }
    await t.test(
      "abort before dispatch is distinct from unknown dispatched completion",
      async () => {
        const controller = new AbortController();
        controller.abort();
        await assert.rejects(
          localFetch(
            origin + "/storage/v1/object/" + bucketName + "/" + key(identity(25)),
            { method: "POST", body: png, headers: headers(), signal: controller.signal },
          ),
        );
        assert.ok((await bucket.download(key(identity(25)))).error);
        observations("pre-dispatch-failure", {
          providerRequestDispatched: false,
          classification: "NO_IO",
        });
      },
    );
    await t.test(
      "definitive provider failure and successful owner response",
      async () => {
        const rejected = await create(identity(26), png, "text/plain");
        assert.ok(rejected.error);
        assert.ok((await bucket.download(key(identity(26)))).error);
        observations("definitive-response", {
          rejectedStatus: rejected.error.statusCode,
          error: rejected.error.message,
          successObservedByOwner: true,
          postCrashProviderGuarantee: "UNPROVEN",
        });
      },
    );
    await t.test(
      "format candidates never establish VERIFIED; ambiguous brands reject",
      () => {
        assert.equal(candidateFormat(png), "image/png");
        assert.equal(candidateFormat(Buffer.from([255, 216, 255, 224])), "image/jpeg");
        assert.equal(
          candidateFormat(Buffer.from("%PDF-1.7\nnot a valid parsed document")),
          "application/pdf",
        );
        const box = (major, compatible) => {
          const b = Buffer.alloc(16 + compatible.length * 4);
          b.writeUInt32BE(b.length);
          b.write("ftyp", 4);
          b.write(major, 8);
          compatible.forEach((brand, i) => b.write(brand, 16 + i * 4));
          return b;
        };
        assert.equal(candidateFormat(box("heic", ["mif1", "heic"])), "image/heic");
        assert.equal(candidateFormat(box("heix", ["heix"])), "image/heic");
        for (const invalid of [
          box("mif1", ["mif1"]),
          box("avif", ["avif"]),
          box("heic", ["avif"]),
          box("heic", ["heic"]).subarray(0, 17),
          Buffer.alloc(0),
        ])
          assert.equal(candidateFormat(invalid), null);
        assert.equal(limit("application/pdf"), 10485760);
        assert.equal(limit("image/heif"), 52428800);
        assert.throws(() => limit("image/svg+xml"));
        observations("format", {
          signaturesOnly: "NOT_VERIFIED",
          heifGenericBrand: "AMBIGUOUS_REJECT",
          parserDecodeBounds: "BLOCKED",
        });
      },
    );
    const binding = (n) => ({
      account: uuid(100),
      operation: uuid(n),
      attempt: uuid(n + 1000),
    });
    await t.test(
      "bounded stream hashing and private Account/operation/attempt staging",
      async () => {
        const entry = await stage(binding(100), "image/png", png.length, [
          png.subarray(0, 20),
          png.subarray(20),
        ]);
        assert.equal(entry.hash, sha(png));
        assert.equal(entry.count, png.length);
        assert.equal((await stat(entry.path)).mode & 0o777, 0o700);
        assert.equal((await stat(join(entry.path, "payload.part"))).mode & 0o777, 0o600);
        assert.deepEqual(await readFile(join(entry.path, "payload.part")), png);
        await assert.rejects(cleanup(entry, uuid(101)), /cross-Account/);
        await assert.rejects(
          stage(binding(100), "image/png", png.length, [png]),
          /exact staging attempt/,
        );
        entry.phase = "IO_UNKNOWN";
        await assert.rejects(cleanup(entry, entry.binding.account), /not quiescence/);
        const recovered = await inventory();
        assert.equal(recovered[0].recoveredPhase, "IO_UNKNOWN");
        entry.phase = "IO_QUIESCENT";
        entry.references = 1;
        await assert.rejects(cleanup(entry, entry.binding.account), /reference/);
        entry.references = 0;
        await cleanup(entry, entry.binding.account);
        await assert.rejects(stat(entry.path), { code: "ENOENT" });
      },
    );
    await t.test(
      "size limits, chunk bound, exact count and no leftover partials",
      async () => {
        await assert.rejects(stage(binding(110), "application/pdf", 10485761, []));
        await assert.rejects(stage(binding(111), "image/png", 52428801, []));
        await assert.rejects(stage(binding(112), "image/png", 0, []));
        await assert.rejects(
          stage(binding(113), "image/png", 3, [Buffer.alloc(4)]),
          /byte bound/,
        );
        await assert.rejects(
          stage(binding(114), "image/png", 4, [Buffer.alloc(3)]),
          /exact count/,
        );
        await assert.rejects(
          stage(binding(115), "image/png", 2 * 1024 ** 2, [Buffer.alloc(2 * 1024 ** 2)]),
          /chunk/,
        );
        assert.equal(stages.size, 0);
      },
    );
    await t.test("50MiB streaming boundary and bounded staging quota", async () => {
      const chunk = Buffer.alloc(1024 ** 2, 7);
      async function* chunks(count) {
        for (let i = 0; i < count; i++) yield chunk;
      }
      const entry = await stage(
        binding(120),
        "image/png",
        limit("image/png"),
        chunks(50),
      );
      assert.equal(entry.count, 52428800);
      const expected = createHash("sha256");
      for (let i = 0; i < 50; i++) expected.update(chunk);
      assert.equal(entry.hash, expected.digest("hex"));
      await assert.rejects(stage(binding(121), "image/png", 20 * 1024 ** 2, []), /quota/);
      entry.phase = "IO_QUIESCENT";
      await cleanup(entry, entry.binding.account);
    });
    await t.test("no Source semantic mutation and C-I3D gate still CLOSED", () => {
      assert.equal(snapshot(), before);
      observations("source-invariance", { unchanged: true, gateOpen: false });
    });
  } finally {
    assert.equal(snapshot(), before);
    // Test fixture teardown after relay owners completed; never a provider DELETE.
    await rm(join(workspace, "staging"), { recursive: true, force: true });
    await writeFile(
      join(workspace, "evidence.json"),
      JSON.stringify(evidence, null, 2) + "\n",
      { mode: 0o600 },
    );
    credentials = undefined;
  }
});
