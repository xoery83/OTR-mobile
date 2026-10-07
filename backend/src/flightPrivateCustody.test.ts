import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { constants } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import fs from "node:fs/promises";
import { randomUUID, createHash } from "node:crypto";
import { join } from "node:path";
import { describe, it, afterEach, vi } from "vitest";
import { flightExecutorFixture } from "./__fixtures__/flightExecutor";
import {
  createFlightPrivateCustody,
  type FlightStoreIdentity,
} from "./flightPrivateCustody";

const directories: string[] = [];
const handles: (() => Promise<void>)[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  syncBuiltinESMExports();
  await Promise.all(handles.splice(0).map((close) => close()));
  await Promise.all(
    directories.splice(0).map((path) => fs.rm(path, { recursive: true, force: true })),
  );
});
async function fixture() {
  const base = await fs.mkdtemp("/custody-tests/f1-");
  directories.push(base);
  const path = join(base, "parent", "root");
  await fs.mkdir(join(base, "parent"), { mode: 0o700 });
  await fs.mkdir(path, { mode: 0o700 });
  const st = await fs.stat(path, { bigint: true });
  const identity: FlightStoreIdentity = {
    store_id: randomUUID(),
    device: String(st.dev),
    inode: String(st.ino),
  };
  await fs.writeFile(
    join(path, "store-identity.json"),
    JSON.stringify({ version: 1, store_id: identity.store_id }),
    { mode: 0o600 },
  );
  const open = async (p = path, expected = identity) => {
    const store = await createFlightPrivateCustody(p, expected);
    handles.push(store.close);
    return store;
  };
  return { base, path, identity, open, store: await open() };
}
function input(
  text = "X",
  accountId: string = randomUUID(),
  reservationId: string = randomUUID(),
) {
  const bytes = Buffer.from(text);
  return {
    accountId,
    reservationId,
    bytes,
    byteCount: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}
const readPin = (p: ReturnType<typeof input>) => ({
  accountId: p.accountId,
  reference: p.reservationId,
  sha256: p.sha256,
  byteCount: p.byteCount,
});

describe("unsupported live custody platforms", () => {
  it.each(["darwin", "win32"])(
    "rejects before filesystem access: %s",
    async (platform) => {
      const descriptor = Object.getOwnPropertyDescriptor(process, "platform")!;
      Object.defineProperty(process, "platform", { value: platform });
      try {
        await assert.rejects(
          createFlightPrivateCustody("/not-present", {
            store_id: randomUUID(),
            device: "1",
            inode: "1",
          }),
          /CUSTODY_PLATFORM_CLOSED/,
        );
      } finally {
        Object.defineProperty(process, "platform", descriptor);
      }
    },
  );
});
describe.skipIf(process.platform !== "linux")("Linux production anchored custody", () => {
  it("rejects root, parent, intermediate symlinks and lexical traversal", async () => {
    const f = await fixture();
    await fs.symlink(f.path, join(f.base, "root-alias"));
    await fs.symlink(join(f.base, "parent"), join(f.base, "parent-alias"));
    await fs.mkdir(join(f.base, "nested"), { mode: 0o700 });
    await fs.symlink(f.base, join(f.base, "nested", "alias"));
    for (const path of [
      join(f.base, "root-alias"),
      join(f.base, "parent-alias", "root"),
      join(f.base, "nested", "alias", "parent", "root"),
      f.path + "/",
      f.path + "/../root",
      "relative",
      "/tmp/root",
      "",
    ]) {
      await assert.rejects(f.open(path));
    }
  });
  it("rejects unsafe parent/root, non-directory, missing root and wrong owner", async () => {
    const f = await fixture();
    for (const mode of [0o777, 0o770]) {
      await fs.chmod(join(f.base, "parent"), mode);
      await assert.rejects(f.open());
    }
    await fs.chmod(join(f.base, "parent"), 0o700);
    await fs.chmod(f.path, 0o750);
    await assert.rejects(f.open());
    await fs.chmod(f.path, 0o700);
    await fs.writeFile(join(f.base, "file"), "x", { mode: 0o600 });
    await assert.rejects(f.open(join(f.base, "file", "root")));
    await assert.rejects(f.open(join(f.base, "missing")));
    // Preprovisioned by disposable fixture administration as root, not service UID.
    await assert.rejects(f.open("/custody-tests/root-owned"));
  });
  it("same instance stays on original inode across replacement, restore and parent retarget", async () => {
    const f = await fixture(),
      x = input();
    await f.store.custody.put(x);
    const old = f.path + "-original";
    await fs.rename(f.path, old);
    await fs.mkdir(f.path, { mode: 0o700 });
    const y = input("Y", x.accountId, x.reservationId);
    await assert.rejects(f.store.custody.put(y));
    assert.deepEqual(Buffer.from(await f.store.custody.read(readPin(x))), x.bytes);
    assert.equal(await f.store.custody.verify(readPin(y)), false);
    assert.deepEqual(await fs.readdir(f.path), []);
    await fs.rmdir(f.path);
    await fs.rename(old, f.path);
    await f.store.custody.put(x);
    await fs.rename(join(f.base, "parent"), join(f.base, "moved"));
    await fs.mkdir(join(f.base, "replacement"), { mode: 0o700 });
    await fs.mkdir(join(f.base, "replacement", "root"), { mode: 0o700 });
    await fs.symlink(join(f.base, "replacement"), join(f.base, "parent"));
    const z = input("Z");
    await f.store.custody.put(z);
    assert.deepEqual(await fs.readdir(join(f.base, "replacement", "root")), []);
    await assert.rejects(f.open());
    await fs.unlink(join(f.base, "parent"));
    await fs.symlink(join(f.base, "replacement"), join(f.base, "parent"));
    assert.deepEqual(Buffer.from(await f.store.custody.read(readPin(z))), z.bytes);
  });
  it("restart verifies external identity and marker; copied marker on replacement does not admit", async () => {
    const f = await fixture(),
      x = input();
    await f.store.custody.put(x);
    assert.deepEqual(
      Buffer.from(await (await f.open()).custody.read(readPin(x))),
      x.bytes,
    );
    await assert.rejects(f.open(f.path, { ...f.identity, store_id: randomUUID() }));
    await fs.rename(f.path, f.path + "-original");
    await fs.mkdir(f.path, { mode: 0o700 });
    await fs.copyFile(
      join(f.path + "-original", "store-identity.json"),
      join(f.path, "store-identity.json"),
    );
    await assert.rejects(f.open(), /CUSTODY_CONTINUITY_CLOSED/);
  });
  it.skipIf(!process.env.F1_CUSTODY_MODULE)(
    "fresh child process admits same store and rejects copied-marker replacement",
    async () => {
      const f = await fixture(),
        x = input();
      await f.store.custody.put(x);
      const probe = `
      import { createFlightPrivateCustody } from ${JSON.stringify("file://" + process.env.F1_CUSTODY_MODULE)};
      import { readFileSync } from "node:fs";
      const { path, identity, pin } = JSON.parse(readFileSync(0, "utf8"));
      try {
        const store = await createFlightPrivateCustody(path, identity);
        try { await store.custody.read(pin); } finally { await store.close(); }
        process.stdout.write("ADMITTED");
      } catch { process.stdout.write("CLOSED"); }
    `;
      const child = () => {
        const result = spawnSync(process.execPath, ["--input-type=module", "-e", probe], {
          input: JSON.stringify({ path: f.path, identity: f.identity, pin: readPin(x) }),
          encoding: "utf8",
          timeout: 10000,
        });
        assert.equal(result.status, 0, result.stderr);
        return result.stdout;
      };
      assert.equal(child(), "ADMITTED");
      await fs.rename(f.path, f.path + "-old");
      await fs.mkdir(f.path, { mode: 0o700 });
      await fs.copyFile(
        join(f.path + "-old", "store-identity.json"),
        join(f.path, "store-identity.json"),
      );
      assert.equal(child(), "CLOSED");
      assert.deepEqual(Buffer.from(await f.store.custody.read(readPin(x))), x.bytes);
    },
  );
  it("32 equal puts succeed; 32 conflicting puts have one immutable winner", async () => {
    const f = await fixture(),
      x = input();
    await Promise.all(Array.from({ length: 32 }, () => f.store.custody.put(x)));
    const r = randomUUID();
    const results = await Promise.allSettled(
      Array.from({ length: 32 }, (_, i) =>
        f.store.custody.put(input(String(i), x.accountId, r)),
      ),
    );
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(
      (await fs.readdir(f.path)).filter((p) => p.startsWith("pending-")).length,
      0,
    );
  });
  it("50 concurrent replacement cycles never acknowledge replacement bytes", async () => {
    const f = await fixture(),
      x = input();
    await Promise.all([
      (async () => {
        for (let i = 0; i < 50; i++) {
          await fs.rename(f.path, f.path + "-held");
          await fs.mkdir(f.path, { mode: 0o700 });
          assert.deepEqual(await fs.readdir(f.path), []);
          await fs.rmdir(f.path);
          await fs.rename(f.path + "-held", f.path);
        }
      })(),
      (async () => {
        for (let i = 0; i < 50; i++) {
          await f.store.custody.put(x);
          assert.deepEqual(Buffer.from(await f.store.custody.read(readPin(x))), x.bytes);
        }
      })(),
    ]);
  });
  it("leaf symlink, traversal, wrong size/hash/mode and oversized content deny", async () => {
    const f = await fixture(),
      x = input();
    const leaf = join(f.path, `material-${x.accountId}-${x.reservationId}.json`);
    await fs.symlink(join(f.base, "outside"), leaf);
    await assert.rejects(f.store.custody.put(x));
    await assert.rejects(f.store.custody.read(readPin(x)));
    await fs.unlink(leaf);
    await f.store.custody.put(x);
    await assert.rejects(f.store.custody.read({ ...readPin(x), byteCount: 2 }));
    await assert.rejects(f.store.custody.read({ ...readPin(x), sha256: "a".repeat(64) }));
    await assert.rejects(f.store.custody.put({ ...x, reservationId: "../escape" }));
    await fs.chmod(leaf, 0o640);
    await assert.rejects(f.store.custody.read(readPin(x)));
    await assert.rejects(f.store.custody.put(input("a".repeat(4194305))));
  });
  it("file and directory fsync precede ACK; partial write/fsync failure never acknowledge", async () => {
    const f = await fixture();
    const handle = await fs.open(f.path, constants.O_RDONLY | constants.O_DIRECTORY);
    const prototype = Object.getPrototypeOf(handle);
    await handle.close();
    const sync = prototype.sync;
    const events: string[] = [];
    const spy = vi.spyOn(prototype, "sync").mockImplementation(async function (
      this: typeof handle,
    ) {
      events.push((await this.stat()).isDirectory() ? "directory" : "file");
      return sync.call(this);
    });
    await f.store.custody.put(input());
    events.push("ack");
    assert.deepEqual(events, ["file", "directory", "directory", "ack"]);
    spy.mockImplementation(async function (this: typeof handle) {
      if ((await this.stat()).isFile()) throw new Error("TEST_FSYNC_FAILURE");
      return sync.call(this);
    });
    const x = input();
    await assert.rejects(f.store.custody.put(x), /TEST_FSYNC_FAILURE/);
    assert.equal(await f.store.custody.verify(readPin(x)), false);
    spy.mockImplementation(async function (this: typeof handle) {
      if ((await this.stat()).isDirectory())
        throw new Error("TEST_DIRECTORY_FSYNC_FAILURE");
      return sync.call(this);
    });
    const published = input();
    await assert.rejects(f.store.custody.put(published), /TEST_DIRECTORY_FSYNC_FAILURE/);
    spy.mockRestore();
    // Failure after publish retains exact bytes for inspection; it never acknowledges.
    assert.deepEqual(
      Buffer.from(await f.store.custody.read(readPin(published))),
      published.bytes,
    );
    vi.spyOn(prototype, "writeFile").mockImplementation(async function (
      this: typeof handle,
    ) {
      await this.write("partial");
      throw new Error("TEST_PARTIAL_WRITE");
    });
    const y = input();
    await assert.rejects(f.store.custody.put(y), /TEST_PARTIAL_WRITE/);
    assert.equal(await f.store.custody.verify(readPin(y)), false);
  });
  it("replacement during temp write and before link remains on admitted root", async () => {
    for (const cut of ["write", "sync"] as const) {
      const f = await fixture(),
        x = input();
      const h = await fs.open(f.path, constants.O_RDONLY | constants.O_DIRECTORY);
      const prototype = Object.getPrototypeOf(h);
      await h.close();
      const method = cut === "write" ? "writeFile" : "sync";
      const original = prototype[method];
      let changed = false;
      const spy = vi.spyOn(prototype, method).mockImplementation(async function (
        this: typeof h,
        ...args: unknown[]
      ) {
        if (!changed && (await this.stat()).isFile()) {
          changed = true;
          await fs.rename(f.path, f.path + "-old");
          await fs.mkdir(f.path, { mode: 0o700 });
        }
        return original.apply(this, args);
      });
      await f.store.custody.put(x);
      spy.mockRestore();
      assert.equal(changed, true);
      assert.deepEqual(await fs.readdir(f.path), []);
      assert.deepEqual(Buffer.from(await f.store.custody.read(readPin(x))), x.bytes);
    }
  });
  it("acceptance/raw/result indexes share the same anchor and immutable associations", async () => {
    const f = await fixture(),
      a = (await flightExecutorFixture()).a;
    const x = input("result", a.account_id);
    await f.store.custody.put(x);
    const pin = { reference: x.reservationId, sha256: x.sha256, byteCount: x.byteCount };
    await fs.rename(f.path, f.path + "-old");
    await fs.mkdir(f.path, { mode: 0o700 });
    const session = randomUUID();
    await f.store.bindAcceptance(a.account_id, session, { call: a.usage_correlation_id });
    await assert.rejects(
      f.store.bindAcceptance(a.account_id, session, { call: randomUUID() }),
    );
    await f.store.retainRaw(a.account_id, a.usage_correlation_id!, pin, { exact: true });
    assert.deepEqual(
      (await f.store.readRaw(a.account_id, a.usage_correlation_id!)).pin,
      pin,
    );
    await f.store.retained.put(a, pin);
    assert.deepEqual(await f.store.retained.read(a), pin);
    await assert.rejects(f.store.retained.read({ ...a, request_sha256: "a".repeat(64) }));
    assert.deepEqual(await fs.readdir(f.path), []);
  });
  it("deleted admitted directory denies operations", async () => {
    const f = await fixture();
    await fs.unlink(join(f.path, "store-identity.json"));
    await fs.rmdir(f.path);
    await assert.rejects(f.store.custody.put(input()));
  });
  it("procfs/capability failure closes admission", async () => {
    const f = await fixture();
    vi.spyOn(fs, "statfs").mockResolvedValue({ type: 0 } as Awaited<
      ReturnType<typeof fs.statfs>
    >);
    syncBuiltinESMExports();
    await assert.rejects(f.open(), /CUSTODY_PROCFS_CLOSED/);
    vi.restoreAllMocks();
    syncBuiltinESMExports();
    const handle = await fs.open(f.path, constants.O_RDONLY | constants.O_DIRECTORY);
    const prototype = Object.getPrototypeOf(handle);
    await handle.close();
    vi.spyOn(prototype, "sync").mockRejectedValue(new Error("TEST_CAPABILITY_FAILURE"));
    await assert.rejects(f.open(), /TEST_CAPABILITY_FAILURE/);
  });
});
