import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, constants } from "node:fs";
import { open, mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { profile, profileHash, sha256 } from "./profile.mjs";
import {
  canonicalMessage,
  requestFor,
  validateRequest,
  validateResult,
} from "./protocol.mjs";
import { executeRequest } from "./jpeg-worker.mjs";
const bytes = readFileSync(
  new URL("./fixtures/baseline-32x16.jpg", import.meta.url),
);
const request = () => requestFor("a".repeat(32), sha256(bytes), bytes.length);
async function fixture(run) {
  const dir = await mkdtemp(join(tmpdir(), "otr-jpeg-ipc-")),
    file = join(dir, "input");
  await writeFile(file, bytes);
  const counts = { opened: 0, read: 0, closed: 0 };
  const openFixed = async (path, flags) => {
    assert.equal(path, "/input");
    assert.equal(flags, constants.O_RDONLY | constants.O_NOFOLLOW);
    counts.opened++;
    const handle = await open(file, flags);
    return {
      stat: () => handle.stat(),
      readFile: () => {
        counts.read++;
        return handle.readFile();
      },
      close: () => {
        counts.closed++;
        return handle.close();
      },
    };
  };
  try {
    await run(openFixed, counts);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
test("real fixed-descriptor decode produces only bounded JPEG local facts and closes input", async () => {
  await fixture(async (openFixed, counts) => {
    const q = request(),
      result = await executeRequest(q, openFixed);
    assert.equal(result.status, "PARSE_PASS");
    assert.equal(result.format, "JPEG");
    assert.equal(result.facts.orientation, 1);
    assert.equal(result.profile_sha256, profileHash());
    assert.deepEqual(validateResult(JSON.stringify(result) + "\n", q), result);
    assert.deepEqual(counts, { opened: 1, read: 1, closed: 1 });
    assert(!JSON.stringify(result).includes("originalBase64"));
  });
});
test("canonical request framing refuses extra path, duplicates, whitespace and oversized input", () => {
  const q = request();
  for (const raw of [
    JSON.stringify({ ...q, path: "/private" }) + "\n",
    " " + JSON.stringify(q) + "\n",
    JSON.stringify(q).replace('"byte_count":', '"byte_count":1,"byte_count":') +
      "\n",
  ]) {
    assert.throws(
      () => validateRequest(canonicalMessage(raw, 512)),
      /PARSER_PROTOCOL/,
    );
  }
  assert.throws(
    () => validateRequest({ ...q, byte_count: profile.inputBytes + 1 }),
    /PARSER_PROTOCOL/,
  );
});
test("profile mismatch never opens the descriptor", async () => {
  let opened = false;
  const result = await executeRequest(
    { ...request(), profile_sha256: "b".repeat(64) },
    async () => {
      opened = true;
    },
  );
  assert.equal(result.status, "PARSER_PROFILE");
  assert.equal(opened, false);
});
test("size/hash mismatch closes the real descriptor before returning negative facts", async () => {
  for (const fault of ["size", "hash"])
    await fixture(async (openFixed, counts) => {
      const q = request();
      if (fault === "size") q.byte_count++;
      else q.input_sha256 = "b".repeat(64);
      const result = await executeRequest(q, openFixed);
      assert.equal(result.status, "PARSER_INPUT_IDENTITY");
      assert.equal(result.facts, null);
      assert.equal(counts.closed, 1);
      assert.equal(counts.read, fault === "size" ? 0 : 1);
    });
});
test("unknown filesystem errors cannot leak paths/messages or claim positive facts", async () => {
  const q = request(),
    result = await executeRequest(q, async () => {
      throw Error("private-secret-path-canary");
    });
  assert.equal(result.status, "FORMAT_MALFORMED");
  assert.equal(result.facts, null);
  assert(!JSON.stringify(result).includes("canary"));
  validateResult(JSON.stringify(result) + "\n", q);
});
test("invalid/forged results fail as protocol errors, not positive format qualification", async () => {
  assert.throws(() => validateResult("null\n", request()), /PARSER_PROTOCOL/);
  await fixture(async (openFixed) => {
    const q = request(),
      good = await executeRequest(q, openFixed);
    for (const bad of [
      { ...good, format: "PNG" },
      { ...good, facts: { ...good.facts, orientation: 6 } },
      { ...good, input_sha256: "b".repeat(64) },
      { ...good, status: "UNKNOWN_CODE" },
    ])
      assert.throws(
        () => validateResult(JSON.stringify(bad) + "\n", q),
        /PARSER_PROTOCOL/,
      );
  });
});
test("actual entrypoint refuses malformed IPC without reading caller paths", () => {
  const worker = new URL("./jpeg-worker.mjs", import.meta.url);
  for (const input of [
    "not-json",
    "a".repeat(513),
    JSON.stringify({ ...request(), path: "/caller-selected" }) + "\n",
  ]) {
    const child = spawnSync(
      process.execPath,
      ["--max-old-space-size=64", worker.pathname],
      { input, timeout: 2000, encoding: "utf8" },
    );
    assert.equal(child.status, 2);
    assert.equal(child.stdout, "");
  }
  // Current local OS/runtime is not asserted to be the proposed qualified Linux target.
  const child = spawnSync(
    process.execPath,
    ["--max-old-space-size=64", worker.pathname],
    {
      input: JSON.stringify(request()) + "\n",
      timeout: 2000,
      encoding: "utf8",
    },
  );
  assert.equal(child.status, 0);
  const result = validateResult(child.stdout, request());
  assert.notEqual(result.status, "PARSE_PASS");
  assert.equal(result.facts, null);
});
