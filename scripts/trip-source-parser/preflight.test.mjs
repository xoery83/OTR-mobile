import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";
import { crc32, deflateSync } from "node:zlib";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { profile, profileHash, sha256, profileManifest } from "./profile.mjs";
import {
  requestFor,
  resultFor,
  validateResult,
  validateRequest,
  canonicalMessage,
} from "./protocol.mjs";
import { localParserPreflight } from "./local-preflight.mjs";

// Generated fixtures only. No downloaded documents/personal bytes or product import.
const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
function chunk(type, data) {
  const b = Buffer.alloc(data.length + 12);
  b.writeUInt32BE(data.length);
  b.write(type, 4, "ascii");
  data.copy(b, 8);
  b.writeUInt32BE(crc32(b.subarray(4, -4)), b.length - 4);
  return b;
}
function header(width = 1, height = 1, color = 6, depth = 8, interlace = 0) {
  const b = Buffer.alloc(13);
  b.writeUInt32BE(width);
  b.writeUInt32BE(height, 4);
  b[8] = depth;
  b[9] = color;
  b[12] = interlace;
  return chunk("IHDR", b);
}
function png({
  width = 1,
  height = 1,
  color = 6,
  depth = 8,
  interlace = 0,
  filter = 0,
  raw = null,
  compressed = null,
  extra = [],
  split = 0,
} = {}) {
  const channels = color === 2 ? 3 : 4;
  const pixels = raw ?? Buffer.alloc((width * channels + 1) * height);
  if (!raw) for (let y = 0; y < height; y++) pixels[y * (width * channels + 1)] = filter;
  const data = compressed ?? deflateSync(pixels);
  const parts = split
    ? Array.from({ length: Math.ceil(data.length / split) }, (_, i) =>
        data.subarray(i * split, (i + 1) * split),
      )
    : [data];
  return Buffer.concat([
    signature,
    header(width, height, color, depth, interlace),
    ...parts.map((p) => chunk("IDAT", p)),
    ...extra,
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
const small = png();
function pins(bytes, representationId = randomUUID()) {
  return {
    operationId: randomUUID(),
    operationKey: "fixture_op",
    operationDigest: "a".repeat(64),
    prepareId: randomUUID(),
    representationId,
    attemptId: randomUUID(),
    generation: 1,
    owner: "fixture_execution_principal",
    inputHash: sha256(bytes),
    inputCount: bytes.length,
    declaredMime: "image/png",
  };
}
const stream = (bytes) =>
  async function* () {
    for (let i = 0; i < bytes.length; i += 1048576) yield bytes.subarray(i, i + 1048576);
  };

// Portable protocol checks run without a decoder in the semantic/parent process.
test("strict portable protocol and bounded profile", async (t) => {
  const req = requestFor("1".repeat(32), sha256(small), small.length);
  const facts = {
    width: 1,
    height: 1,
    pixels: 1,
    frames: 1,
    channels: 4,
    bit_depth: 8,
    interlace: 0,
    decoded_byte_count: 4,
  };
  const good = resultFor(req, "PARSE_PASS", facts),
    text = JSON.stringify(good) + "\n";
  await t.test("versioned manifest pins decoder/source/runtime and bounded facts", () => {
    assert.equal(validateResult(text, req).status, "PARSE_PASS");
    assert.equal(profileManifest().files.at(-1)[1], profile.decoderSha256);
    assert.match(profileHash(), /^[0-9a-f]{64}$/);
  });
  const bad = [
    [
      "duplicate result field",
      text.replace('"protocol_version":1', '"protocol_version":1,"protocol_version":1'),
    ],
    ["unknown result field", JSON.stringify({ ...good, path: "/host" }) + "\n"],
    ["duplicate output", text + text],
    ["trailing output", text + "extra"],
    ["output ceiling", " ".repeat(4097)],
    [
      "profile mismatch",
      JSON.stringify({ ...good, profile_sha256: "f".repeat(64) }) + "\n",
    ],
    [
      "input hash mismatch",
      JSON.stringify({ ...good, input_sha256: "f".repeat(64) }) + "\n",
    ],
    ["count mismatch", JSON.stringify({ ...good, byte_count: 1 }) + "\n"],
    [
      "unexpected metadata facts",
      JSON.stringify({ ...good, facts: { ...facts, filename: "private" } }) + "\n",
    ],
    [
      "invalid pixels",
      JSON.stringify({ ...good, facts: { ...facts, pixels: 2 } }) + "\n",
    ],
    ["unknown result code", JSON.stringify({ ...good, status: "VERIFIED" }) + "\n"],
    ["MIME mismatch", JSON.stringify({ ...good, actual_mime: "image/jpeg" }) + "\n"],
  ];
  for (const [name, raw] of bad)
    await t.test(name, () =>
      assert.throws(() => validateResult(raw, req), /PARSER_PROTOCOL/),
    );
  await t.test(
    "unknown/duplicate ingress field rejects and no host path selector",
    () => {
      assert.throws(() => validateRequest({ ...req, path: "/host" }));
      assert.throws(() =>
        canonicalMessage(
          JSON.stringify(req).replace('"byte_count":', '"byte_count":1,"byte_count":') +
            "\n",
          512,
        ),
      );
      assert.throws(() =>
        validateRequest({ ...req, byte_count: profile.inputBytes + 1 }),
      );
    },
  );
});

test("real isolated PNG profile, ownership and adversarial probes", async (t) => {
  const local = await localParserPreflight();
  console.log("C-I3G immutable worker", local.image, "profile", local.profileHash);
  async function run(bytes, expected, fault = null) {
    const h = local.reserveForTest(pins(bytes));
    try {
      const result = await local.runOwned(h, stream(bytes), fault);
      assert.equal(result.status, expected);
      assert.equal(result.terminal, true);
      await assert.rejects(() => local.cleanupFixture(h), /protected staging/);
      local.fixtureNoDispatchQuiescence(h);
      await assert.rejects(() => local.cleanupFixture(h, true), /protected staging/);
      return result;
    } finally {
      local.fixtureNoDispatchQuiescence(h);
      await local.cleanupFixture(h);
    }
  }
  for (const [name, opts] of [
    ["minimum RGBA", {}],
    ["minimum RGB", { color: 2 }],
    ["maximum width", { width: 2048 }],
    ["maximum height", { height: 2048 }],
    ["maximum pixels RGBA", { width: 1024, height: 1024 }],
    ["maximum pixels RGB", { width: 2048, height: 512, color: 2 }],
    ...[1, 2, 3, 4].map((filter) => [
      "complete decode filter " + filter,
      { width: 32, height: 32, filter },
    ]),
    ["contiguous split IDAT", { width: 32, height: 32, split: 7 }],
  ])
    await t.test(name, async () => {
      const result = await run(png(opts), "PARSE_PASS");
      assert.equal(result.result.facts.width, opts.width ?? 1);
      assert.equal(result.result.facts.height, opts.height ?? 1);
    });
  await t.test("chunk-count boundary and single-IDAT size boundary", async () => {
    const big = png({
      width: 1024,
      height: 1024,
      compressed: deflateSync(Buffer.alloc(4195328), { level: 0 }),
      split: 1048576,
    });
    await run(big, "PARSE_PASS");
    const data = deflateSync(Buffer.alloc(4195328));
    const parts = Array.from({ length: 126 }, (_, i) =>
      data.subarray(
        Math.floor((i * data.length) / 126),
        Math.floor(((i + 1) * data.length) / 126),
      ),
    );
    await run(
      Buffer.concat([
        signature,
        header(1024, 1024),
        ...parts.map((b) => chunk("IDAT", b)),
        chunk("IEND", Buffer.alloc(0)),
      ]),
      "PARSE_PASS",
    );
  });
  const broken = Buffer.from(small);
  broken[broken.length - 1] ^= 1;
  const cases = [
    ["signature-only fake", signature, "FORMAT_MALFORMED"],
    ["wrong actual MIME", Buffer.from([255, 216, 255, 217]), "FORMAT_MISMATCH"],
    ["truncated header", small.subarray(0, 20), "FORMAT_MALFORMED"],
    [
      "truncated compressed stream",
      png({ compressed: Buffer.from([120, 156, 1]) }),
      "FORMAT_MALFORMED",
    ],
    ["bad CRC", broken, "FORMAT_MALFORMED"],
    ["missing IEND", small.subarray(0, -12), "FORMAT_MALFORMED"],
    [
      "missing IDAT",
      Buffer.concat([signature, header(), chunk("IEND", Buffer.alloc(0))]),
      "FORMAT_MALFORMED",
    ],
    ["duplicate IHDR", png({ extra: [header()] }), "FORMAT_MALFORMED"],
    [
      "trailing PDF polyglot",
      Buffer.concat([small, Buffer.from("%PDF-1.7")]),
      "FORMAT_AMBIGUOUS",
    ],
    ["concatenated PNG", Buffer.concat([small, small]), "FORMAT_AMBIGUOUS"],
    ["zero dimensions", png({ width: 0 }), "FORMAT_MALFORMED"],
    [
      "oversized dimensions",
      Buffer.concat([
        signature,
        header(2049, 1),
        chunk("IDAT", deflateSync(Buffer.alloc(5))),
        chunk("IEND", Buffer.alloc(0)),
      ]),
      "FORMAT_RESOURCE_LIMIT",
    ],
    [
      "oversized pixels",
      Buffer.concat([
        signature,
        header(2048, 513),
        chunk("IDAT", deflateSync(Buffer.alloc(5))),
        chunk("IEND", Buffer.alloc(0)),
      ]),
      "FORMAT_RESOURCE_LIMIT",
    ],
    ["interlaced excluded", png({ interlace: 1 }), "FORMAT_UNSUPPORTED"],
    ["16 bit excluded", png({ depth: 16 }), "FORMAT_UNSUPPORTED"],
    ["palette/grayscale excluded", png({ color: 3 }), "FORMAT_UNSUPPORTED"],
    [
      "APNG excluded",
      png({ extra: [chunk("acTL", Buffer.alloc(8))] }),
      "FORMAT_UNSUPPORTED",
    ],
    [
      "metadata excluded",
      png({ extra: [chunk("tEXt", Buffer.alloc(1024))] }),
      "FORMAT_UNSUPPORTED",
    ],
    [
      "ICC metadata bomb excluded",
      png({ extra: [chunk("iCCP", deflateSync(Buffer.alloc(8388608)))] }),
      "FORMAT_UNSUPPORTED",
    ],
    [
      "unknown critical chunk",
      png({ extra: [chunk("ABCD", Buffer.alloc(1))] }),
      "FORMAT_UNSUPPORTED",
    ],
    [
      "chunk size abuse",
      png({ extra: [chunk("tEXt", Buffer.alloc(1048577))] }),
      "FORMAT_RESOURCE_LIMIT",
    ],
    [
      "chunk-count abuse",
      png({ width: 1024, height: 1024, split: 1 }),
      "FORMAT_RESOURCE_LIMIT",
    ],
    [
      "IDAT aggregate abuse",
      Buffer.concat([
        signature,
        header(),
        ...Array.from({ length: 9 }, () => chunk("IDAT", Buffer.alloc(1048576))),
        chunk("IEND", Buffer.alloc(0)),
      ]),
      "FORMAT_RESOURCE_LIMIT",
    ],
    [
      "decompression bomb",
      png({ compressed: deflateSync(Buffer.alloc(8388608)) }),
      "FORMAT_RESOURCE_LIMIT",
    ],
    ["extra inflated row", png({ raw: Buffer.alloc(6) }), "FORMAT_RESOURCE_LIMIT"],
    ["missing scanline byte", png({ raw: Buffer.alloc(4) }), "FORMAT_MALFORMED"],
    ["invalid filter", png({ filter: 5 }), "FORMAT_MALFORMED"],
    [
      "extra zlib suffix",
      png({
        compressed: Buffer.concat([
          deflateSync(Buffer.alloc(5)),
          Buffer.from("trailing"),
        ]),
      }),
      "FORMAT_AMBIGUOUS",
    ],
    [
      "second zlib stream",
      png({
        compressed: Buffer.concat([
          deflateSync(Buffer.alloc(5)),
          deflateSync(Buffer.alloc(5)),
        ]),
      }),
      "FORMAT_AMBIGUOUS",
    ],
  ];
  for (const [name, bytes, expected] of cases)
    await t.test(name, () => run(bytes, expected));
  await t.test(
    "wrong declared MIME and size ceiling reject before payload supplier",
    () => {
      assert.throws(() =>
        local.reserveForTest({ ...pins(small), declaredMime: "image/jpeg" }),
      );
      assert.throws(() =>
        local.reserveForTest({ ...pins(small), inputCount: profile.inputBytes + 1 }),
      );
    },
  );
  await t.test(
    "50 MiB exact input remains bounded and rejects trailing data",
    async () => {
      const bytes = Buffer.alloc(profile.inputBytes);
      small.copy(bytes);
      await run(bytes, "FORMAT_AMBIGUOUS");
    },
  );
  await t.test(
    "streamed byte ceiling rejects excess under reserved attempt",
    async () => {
      const h = local.reserveForTest({ ...pins(small), inputCount: profile.inputBytes });
      let sent = 0;
      const excess = async function* () {
        for (let i = 0; i < 50; i++) {
          sent += 1048576;
          yield Buffer.alloc(1048576);
        }
        sent++;
        yield Buffer.alloc(1);
      };
      await assert.rejects(() => local.runOwned(h, excess), /FORMAT_RESOURCE_LIMIT/);
      assert.equal(sent, profile.inputBytes + 1);
      await assert.rejects(() => local.cleanupFixture(h), /protected staging/);
      local.fixtureNoDispatchQuiescence(h);
      await local.cleanupFixture(h);
    },
  );
  await t.test(
    "two simultaneous Representation requests: loser performs zero payload/parser work",
    async () => {
      const representation = randomUUID();
      let suppliers = 0;
      const h = local.reserveForTest(pins(small, representation));
      assert.throws(() => local.reserveForTest(pins(small, representation)), /BUSY/);
      const counted = async function* () {
        suppliers++;
        yield small;
      };
      const running = local.runOwned(h, counted);
      await assert.rejects(() => local.runOwned(h, counted), /parallel staging/);
      assert.throws(() => local.fixtureNoDispatchQuiescence(h));
      const result = await running;
      assert.equal(result.status, "PARSE_PASS");
      assert.equal(suppliers, 1);
      assert.throws(() => local.reserveForTest(pins(small, representation)), /BUSY/);
      local.fixtureNoDispatchQuiescence(h);
      await local.cleanupFixture(h);
    },
  );
  await t.test(
    "parent exact independent hash/count mismatch retains slot without worker",
    async () => {
      for (const changed of [
        { inputHash: "f".repeat(64) },
        { inputCount: small.length + 1 },
      ]) {
        const h = local.reserveForTest({ ...pins(small), ...changed });
        await assert.rejects(
          () => local.runOwned(h, stream(small)),
          /PARSER_INPUT_IDENTITY/,
        );
        await assert.rejects(() => local.cleanupFixture(h), /protected staging/);
        local.fixtureNoDispatchQuiescence(h);
        await local.cleanupFixture(h);
      }
    },
  );
  await t.test(
    "bounded staging stops excess bytes and can neither release by timeout nor parse",
    async () => {
      const h = local.reserveForTest({ ...pins(small), inputCount: small.length - 1 });
      await assert.rejects(
        () => local.runOwned(h, stream(small)),
        /FORMAT_RESOURCE_LIMIT/,
      );
      await assert.rejects(() => local.cleanupFixture(h), /protected staging/);
      local.fixtureNoDispatchQuiescence(h);
      await local.cleanupFixture(h);
    },
  );
  await t.test(
    "forged reservation never calls supplier or selects host path",
    async () => {
      let supplied = false;
      await assert.rejects(
        () =>
          local.runOwned({ path: "/etc/passwd" }, () => {
            supplied = true;
          }),
        /exclusive/,
      );
      assert.equal(supplied, false);
    },
  );
  for (const [name, request, expected] of [
    ["worker wrong profile", { profile_sha256: "f".repeat(64) }, "PARSER_PROFILE"],
    ["worker input hash mismatch", { input_sha256: "f".repeat(64) }, "PARSER_PROTOCOL"],
    ["worker input count mismatch", { byte_count: 1 }, "PARSER_PROTOCOL"],
    ["worker wrong declared MIME", { declared_mime: "image/jpeg" }, "FORMAT_MISMATCH"],
    ["worker unknown request field", { path: "/etc/passwd" }, "PARSER_CRASH"],
  ])
    await t.test(name, () => run(small, expected, { request }));
  for (const [name, script, expected, wallMs] of [
    ["parser wall timeout", "setInterval(()=>{},1000)", "PARSER_TIMEOUT", 700],
    ["parser CPU timeout", "while(true){}", "PARSER_CRASH"],
    ["parser crash", "process.abort()", "PARSER_CRASH"],
    [
      "parser cgroup OOM",
      "const a=[];setInterval(()=>{a.push(Buffer.alloc(8*1024*1024,1));},1)",
      "PARSER_RESOURCE_LIMIT",
    ],
    [
      "parser stdout flood",
      'setInterval(()=>process.stdout.write("X".repeat(8192)),1)',
      "PARSER_OUTPUT_LIMIT",
    ],
    [
      "parser stderr flood",
      'setInterval(()=>process.stderr.write("X".repeat(8192)),1)',
      "PARSER_OUTPUT_LIMIT",
    ],
    ["parser malformed exit-zero", 'process.stdout.write("invalid")', "PARSER_PROTOCOL"],
    ["parser duplicate result", 'process.stdout.write("{}\\n{}\\n")', "PARSER_PROTOCOL"],
  ])
    await t.test(name, () => run(small, expected, { script, wallMs }));
  await t.test(
    "create pending beyond 5s: failed early kill cannot permit delayed start",
    async () => {
      const trace = [],
        started = Date.now();
      await run(small, "PARSER_TIMEOUT", { createDelayMs: 6000, trace });
      const created = trace.findIndex((e) => e.event === "created");
      assert.ok(created > 0);
      assert.ok(trace.slice(0, created).some((e) => e.event === "not-created"));
      assert.ok(trace.slice(0, created).some((e) => e.event === "kill-failed"));
      assert.ok(trace.some((e) => e.event === "start-withheld"));
      assert.ok(!trace.some((e) => e.event === "start-pending"));
      assert.ok(trace.some((e) => e.event === "terminal-proof"));
      assert.ok(
        trace.findIndex((e) => e.event === "removed") >
          trace.findIndex((e) => e.event === "terminal-proof"),
      );
      assert.ok(Date.now() - started >= 6000 && Date.now() - started < 15000);
    },
  );
  await t.test(
    "accepted delayed start beyond 5s is killed after early non-running kill fails",
    async () => {
      const trace = [],
        started = Date.now();
      await run(small, "PARSER_TIMEOUT", {
        startDelayMs: 6000,
        script: "setInterval(()=>{},1000)",
        trace,
      });
      const killed = trace.findIndex((e) => e.event === "kill-succeeded");
      assert.ok(killed > 0);
      assert.ok(trace.slice(0, killed).some((e) => e.event === "kill-failed"));
      assert.ok(
        trace.some(
          (e) =>
            e.event === "inspected" && e.startedAt && !e.startedAt.startsWith("0001"),
        ),
      );
      const proof = trace.findIndex((e) => e.event === "terminal-proof");
      assert.ok(proof > killed);
      assert.ok(
        trace
          .slice(killed, proof)
          .some((e) => e.event === "inspected" && e.running === false),
      );
      assert.ok(trace.findIndex((e) => e.event === "removed") > proof);
      assert.ok(Date.now() - started >= 6000 && Date.now() - started < 15000);
    },
  );
  await t.test(
    "late atomic create/start after absent first kill stays termination-owned",
    async () => {
      const trace = [],
        started = Date.now();
      await run(small, "PARSER_TIMEOUT", {
        runDelayMs: 6000,
        script: "setInterval(()=>{},1000)",
        trace,
      });
      const created = trace.findIndex((e) => e.event === "created"),
        killed = trace.findIndex((e) => e.event === "kill-succeeded");
      assert.ok(trace.slice(0, created).some((e) => e.event === "not-created"));
      assert.ok(trace.slice(0, created).some((e) => e.event === "kill-failed"));
      assert.ok(created >= 0 && killed > created);
      const id = trace[created].id;
      assert.ok(
        trace.filter((e) => e.event === "kill-succeeded").every((e) => e.id === id),
      );
      assert.ok(
        trace.some(
          (e) =>
            e.event === "inspected" && e.startedAt && !e.startedAt.startsWith("0001"),
        ),
      );
      const proof = trace.findIndex((e) => e.event === "terminal-proof");
      assert.ok(proof > killed);
      assert.ok(
        trace
          .slice(killed, proof)
          .some((e) => e.event === "inspected" && e.running === false),
      );
      assert.ok(trace.findIndex((e) => e.event === "removed") > proof);
      assert.ok(Date.now() - started >= 6000 && Date.now() - started < 15000);
    },
  );
  await t.test(
    "concurrent unrelated exact container survives delayed-run termination",
    async () => {
      const a = [],
        b = [];
      const [timed, normal] = await Promise.all([
        run(small, "PARSER_TIMEOUT", {
          startDelayMs: 6000,
          script: "setInterval(()=>{},1000)",
          trace: a,
        }),
        run(small, "PARSE_PASS", {
          wallMs: 9000,
          script: "setTimeout(()=>import('/worker/png-worker.mjs'),6500)",
          trace: b,
        }),
      ]);
      assert.equal(timed.terminal, true);
      assert.equal(normal.result.status, "PARSE_PASS");
      const aId = a.find((e) => e.event === "created").id,
        bId = b.find((e) => e.event === "created").id;
      assert.notEqual(aId, bId);
      assert.ok(a.filter((e) => e.event === "kill-succeeded").every((e) => e.id === aId));
      assert.ok(!b.some((e) => e.event === "kill-succeeded"));
    },
  );
  for (const failedTransport of ["killFailure", "inspectFailure"])
    await t.test(
      failedTransport + " retains unknown slot/input until exact bounded reconciliation",
      async () => {
        const trace = [],
          fault = {
            script: "setInterval(()=>{},1000)",
            wallMs: 200,
            graceMs: 600,
            trace,
            [failedTransport]: true,
          };
        const h = local.reserveForTest(pins(small));
        const started = Date.now();
        await assert.rejects(
          () => local.runOwned(h, stream(small), fault),
          /PARSER_TERMINALITY_UNKNOWN/,
        );
        assert.ok(Date.now() - started < 5000);
        assert.equal(local.activeTerminationObligationsForTest(), 1);
        assert.ok(trace.some((e) => e.event === "terminality-unknown"));
        assert.ok(
          !trace.some((e) => e.event === "terminal-proof" || e.event === "removed"),
        );
        assert.throws(() => local.fixtureNoDispatchQuiescence(h), /still live/);
        await assert.rejects(() => local.cleanupFixture(h), /protected staging/);
        await new Promise((resolve) => setTimeout(resolve, 1200));
        assert.equal(local.activeTerminationObligationsForTest(), 1);
        assert.ok(
          !trace.some((e) => e.event === "terminal-proof" || e.event === "removed"),
        );
        fault[failedTransport] = false;
        const result = await local.reconcileTerminationForTest(h);
        assert.equal(result.status, "PARSER_TIMEOUT");
        assert.equal(result.terminal, true);
        assert.equal(local.activeTerminationObligationsForTest(), 0);
        assert.ok(trace.some((e) => e.event === "terminal-proof"));
        local.fixtureNoDispatchQuiescence(h);
        await local.cleanupFixture(h);
      },
    );
  async function waitUntil(predicate, budgetMs = 10000) {
    const deadline = Date.now() + budgetMs;
    while (!predicate()) {
      assert.ok(Date.now() < deadline, "bounded observation deadline exceeded");
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
  await t.test(
    "16s accepted start outlives 15s caller: active handoff kills late exact worker, unrelated parse survives",
    async () => {
      const trace = [],
        other = [];
      const h = local.reserveForTest(pins(small));
      const started = Date.now();
      const survivor = run(small, "PARSE_PASS", {
        wallMs: 22000,
        script: "setTimeout(()=>import('/worker/png-worker.mjs'),18000)",
        trace: other,
      });
      await assert.rejects(
        () =>
          local.runOwned(h, stream(small), {
            startDelayMs: 16000,
            script: "setInterval(()=>{},1000)",
            trace,
          }),
        /PARSER_TERMINALITY_UNKNOWN/,
      );
      const elapsed = Date.now() - started;
      assert.ok(elapsed >= 15000 && elapsed < 16000, String(elapsed));
      assert.equal(local.activeTerminationObligationsForTest(), 1);
      assert.ok(trace.some((e) => e.event === "termination-handoff"));
      assert.ok(!trace.some((e) => e.event === "terminal-proof"));
      assert.throws(() => local.fixtureNoDispatchQuiescence(h), /still live/);
      await assert.rejects(() => local.cleanupFixture(h), /protected staging/);
      // No manual reconcile/kill: the registered owner must complete autonomously.
      await waitUntil(() => local.activeTerminationObligationsForTest() === 0);
      const proof = trace.findIndex((e) => e.event === "terminal-proof");
      const killed = trace.findIndex((e) => e.event === "kill-succeeded");
      assert.ok(killed >= 0 && proof > killed);
      assert.ok(
        trace
          .slice(0, proof)
          .some(
            (e) =>
              e.event === "inspected" && e.running === false && e.status === "exited",
          ),
      );
      assert.ok(trace.findIndex((e) => e.event === "removed") > proof);
      const id = trace.find((e) => e.event === "created").id;
      assert.ok(
        trace.filter((e) => e.event === "kill-succeeded").every((e) => e.id === id),
      );
      assert.ok(
        Date.now() - started < 20000,
        "late worker has bounded supervised execution",
      );
      local.fixtureNoDispatchQuiescence(h);
      await local.cleanupFixture(h);
      assert.equal((await survivor).status, "PARSE_PASS");
      assert.ok(!other.some((e) => e.event === "kill-succeeded"));
      console.log("long-start reproduction", {
        callerMs: elapsed,
        activeObligations: local.activeTerminationObligationsForTest(),
      });
    },
  );
  await t.test(
    "arbitrarily pending accepted start retains owner across caller and observer deadlines",
    async () => {
      let release;
      const startGate = new Promise((resolve) => {
        release = resolve;
      });
      const trace = [],
        h = local.reserveForTest(pins(small));
      await assert.rejects(
        () =>
          local.runOwned(h, stream(small), {
            wallMs: 1000,
            graceMs: 200,
            startGate,
            trace,
            script: "setInterval(()=>{},1000)",
          }),
        /PARSER_TERMINALITY_UNKNOWN/,
      );
      assert.equal(local.activeTerminationObligationsForTest(), 1);
      await assert.rejects(
        () => local.reconcileTerminationForTest(h, 100),
        /PARSER_TERMINALITY_UNKNOWN/,
      );
      await new Promise((resolve) => setTimeout(resolve, 1600));
      assert.equal(local.activeTerminationObligationsForTest(), 1);
      assert.ok(
        !trace.some((e) => e.event === "terminal-proof" || e.event === "removed"),
      );
      await assert.rejects(() => local.cleanupFixture(h), /protected staging/);
      release(); // Event-driven late lifecycle completion, no finite expiry.
      await waitUntil(() => local.activeTerminationObligationsForTest() === 0);
      assert.ok(trace.some((e) => e.event === "kill-succeeded"));
      assert.ok(trace.some((e) => e.event === "terminal-proof"));
      local.fixtureNoDispatchQuiescence(h);
      await local.cleanupFixture(h);
    },
  );
  await t.test(
    "cancellation owns exact startup/running lifecycle until terminal",
    async () => {
      const controller = new AbortController(),
        trace = [];
      const timer = setTimeout(() => controller.abort(), 250);
      try {
        await run(small, "PARSER_TIMEOUT", {
          script: "setInterval(()=>{},1000)",
          signal: controller.signal,
          trace,
        });
      } finally {
        clearTimeout(timer);
      }
      assert.ok(trace.some((e) => e.event === "terminal-proof"));
    },
  );
  await t.test(
    "actual image has no network/secrets/repository/sibling staging/host/socket and fixed input readonly",
    async () => {
      process.env.CI3G_PARENT_SECRET = "synthetic-secret-not-a-credential";
      const script = `const assert=require("node:assert/strict"),fs=require("node:fs"),net=require("node:net");
      (async()=>{
        assert.equal(process.getuid(),65534);
        for(const key of ["CI3G_PARENT_SECRET","DATABASE_URL","SUPABASE_URL","SUPABASE_SERVICE_ROLE_KEY"]) assert.equal(process.env[key],undefined);
        for(const path of ["/Users/xoery/Project/otr-mobile-import","/Users/xoery/Project/otr-mobile-canonical","/private/tmp","/.ci3g","/var/run/docker.sock"]) assert.equal(fs.existsSync(path),false);
        assert.throws(()=>fs.writeFileSync("/input","overwrite"));
        assert.throws(()=>fs.writeFileSync("/worker/escape","overwrite"));
        assert.equal(fs.readFileSync("/input").length,${small.length});
        await new Promise((resolve,reject)=>{const s=net.connect({host:"192.0.2.1",port:9});s.on("connect",()=>reject(Error("network escaped")));s.on("error",e=>{assert.ok(["ENETUNREACH","EHOSTUNREACH"].includes(e.code));resolve();});});
        let raw="";for await(const chunk of process.stdin)raw+=chunk;const req=JSON.parse(raw);
        const {resultFor}=await import("/worker/protocol.mjs");process.stdout.write(JSON.stringify(resultFor(req,"FORMAT_UNSUPPORTED"))+String.fromCharCode(10));
      })().catch(()=>process.exit(2));`;
      try {
        await run(small, "FORMAT_UNSUPPORTED", { script });
      } finally {
        delete process.env.CI3G_PARENT_SECRET;
      }
    },
  );
  await local.drainTerminationObligationsForTest();
  assert.equal(local.activeTerminationObligationsForTest(), 0);
  const remaining = execFileSync(
    "docker",
    ["ps", "-aq", "--filter", "name=otr-ci3g-parser-"],
    {
      cwd: "/Users/xoery/Project/otr-mobile-import",
      encoding: "utf8",
    },
  ).trim();
  assert.equal(remaining, "", "no dedicated parser container remains");
  console.log("final active termination obligations 0; dedicated parser containers 0");
});
