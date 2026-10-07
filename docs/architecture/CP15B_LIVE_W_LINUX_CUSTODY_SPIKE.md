# CP15B-LIVE-W — Linux anchored custody spike

Date: 2026-10-07 (Pacific/Auckland). **COMPLETE / READY FOR OWNER CUSTODY DECISION.**

## Decision

**YES: Linux Node24 can perform descriptor-anchored child custody operations through `/proc/self/fd/N/child` without a native addon.** Recommend a Linux-only live filesystem custody contract, conditional on runtime capability verification, private namespace ownership, trusted procfs, and explicit restart continuity. This is a feasibility result, not acceptance of the existing LIVE-W implementation or permission for LIVE-1.

The existing code remains pathname-based and has the independently reported F1 weakness. No implementation correction was made. An opened descriptor survives configured-path replacement and parent retargeting; it does not by itself preserve identity across process restart, protect against another writer with the same UID, or certify physical storage durability.

## Scope and preserved inputs

Read-only implementation source: `/private/tmp/otr-cp15b-live-wiring`, branch `intelligence/cp15b-live-wiring`. Inspected `backend/src/flightPrivateCustody.ts`, `backend/src/flightLiveHost.ts`, Dockerfile/compose, optional custody override, Builder report and Independent Review. Canonical current-state and required project foundations were read; no legacy Web access.

Input SHA-256:

| File in LIVE-W source                                          | SHA-256                                                            |
| -------------------------------------------------------------- | ------------------------------------------------------------------ |
| `backend/src/flightPrivateCustody.ts`                          | `098af3d87880efb0af7922a50f8e0817f016fc550e40b0196b1656fa688952fd` |
| `deploy/dev-backend/compose.flight-custody.closed.yml`         | `2f0184a8080db16ad0c3b5efd2aae85a763329311db32a64fb262b1eb142148e` |
| `docs/architecture/CP15B_LIVE_WIRING_IMPLEMENTATION_REPORT.md` | `799e96992544b9fcb00fced769ac44e26233f37a3190baa4bbf18e7b26ed316a` |
| `docs/architecture/CP15B_LIVE_WIRING_INDEPENDENT_REVIEW.md`    | `513e77836ad6ea7b152356f6bed8c01dba04651ff0ecef81cd7ee08030f1d240` |

Only this report is added to the canonical checkout. Existing dirty files are preserved. The latest instruction to produce only the spike report takes precedence over updating the general current-state handoff. No Builder/Review edits, production code, migration, commit, push, deployment, Hosted connection, environment-secret read or provider call.

Public Node/Linux documentation was consulted for syscall semantics; this was documentation browsing, not provider/Hosted traffic. All probe containers had network none, no published ports, no inherited Backend environment file, and only synthetic bytes.

## Runtime and deployment match

| Property               | Observed                                                                                                              |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Cached base            | `node:24-bookworm-slim`, Debian 12 bookworm                                                                           |
| Base image ID          | `sha256:2fe369e969550cde8e867afc3fe370b260140cab4a23d467074295b42163d553`                                             |
| Cached Backend         | `otr-dev-backend:local`, `sha256:3ec1663e6af14f9b9d813bf7318298f7a67b9fceef6dcb6c57facc5d901190aa`                    |
| Kernel / architecture  | Linux `6.8.0-117-generic`, arm64, local Colima VM                                                                     |
| Node, both images      | `v24.21.0`                                                                                                            |
| Main probe identity    | UID/GID `10001:10001`                                                                                                 |
| Backend image identity | `otr`, UID `10001`, GID `999`                                                                                         |
| Custody fixture        | Task-owned Docker volume mounted `/custody-test`, owner `10001:10001`, mode `0700`                                    |
| Custody filesystem     | `statfs` type `0xef53`; `stat -f` reports `ext2/ext3` (shared ext-family magic; exact ext generation not established) |
| Container root         | Overlayfs `0x794c7630`, read-only                                                                                     |
| Procfs                 | `0x9fa0`; `proc /proc proc rw,nosuid,nodev,noexec,relatime`                                                           |
| Privileges             | All CapInh/Prm/Eff/Bnd/Amb zero; NoNewPrivs=1; default container PID namespace                                        |

Runtime used `--pull=never --network none --read-only --cap-drop ALL --security-opt no-new-privileges:true`. Initial volume ownership provisioning ran once as root in a separate network-none disposable container; the custody operations ran unprivileged. Host provisioning privileges do not imply privileged Backend execution.

Both inspected Dockerfiles use this base family and UID10001. GID is dynamically assigned by `useradd --system`, not pinned to10001: the actual cached image uses999. Provision storage against the built image's numeric identity, or explicitly pin the group in a future separately approved change.

The cached Backend image is an older local build, not an image built from current uncommitted LIVE-W bytes. The same runtime family supports this mechanism; no actual DEV deployment, host bind source, x86 kernel or production volume was inspected/tested. The real deployment must repeat admission/capability verification.

## Executed probes

**31 assertion groups passed**, including negative controls that deliberately demonstrate unsafe behavior. They test a standalone stdlib mechanism, not the unchanged production custody factory.

| Probe                         | Evidence                                                                                                                                                                                                        |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Main Linux probe              | 19 PASS: descriptor/proc identity, exclusive create, child open/read, file fsync, hard-link publish, unlink, directory fsync, rename, replacement, symlinks, traversal, duplicates, inheritance and deletion    |
| New container, same volume    | 3 PASS: retained read, equal replay, conflicting replay rejection                                                                                                                                               |
| Cached Backend, new container | Same3 PASS under default UID10001/GID999                                                                                                                                                                        |
| Cached Backend extra probes   | 5 PASS: writable-parent denial, nonprivate-root denial,50 pathname replacement cycles concurrent with50 anchored put/read cycles, fstat mode-change observation,16 equal puts using two independent descriptors |
| Restart replacement witness   | 1 PASS: fresh full-path admission accepts a different private inode with missing retained bytes; demonstrates why admission alone is insufficient                                                               |

Basic operation sequence: open custody with `O_RDONLY | O_DIRECTORY | O_NOFOLLOW`; retain the FileHandle; exclusively create a mode0600 temporary child; write and `FileHandle.sync()`; `fs.link(temp, final)` using both anchored paths; sync retained directory; unlink temporary child; sync retained directory again; acknowledge. Existing reads open a leaf with `O_RDONLY | O_NOFOLLOW | O_NONBLOCK`, then fstat and read through that handle. Production size/hash/schema/association checks remain necessary.

After writing X, the probe renamed custody away and installed a fresh0700 directory at the old path containing a different X. Anchored reads returned original X; anchored writes appeared in the renamed original; pathname reads returned replacement X. Subsequent insertion of a parent symlink and retargeting another parent alias did not redirect anchored operations.

Direct, parent and intermediate symlinks were rejected by the component walk. A negative control demonstrated that `O_NOFOLLOW` on the complete configured path alone accepts a parent symlink. Leaf symlink reads failed with ELOOP; immutable publish to a symlink failed without following it. Raw `../` traversal through an anchored path works: grammar validation is mandatory.

Thirty-two equal concurrent puts all succeeded;32 different concurrent puts produced exactly one winner and31 conflict rejections. A second-descriptor equal-put test also passed. These are asynchronous concurrent operations in one process, without a lock, relying on kernel hard-link exclusion; independent-process writer races were not separately executed. Read comparison occurs only after the contender has fsynced its temporary bytes and linked the final leaf.

`rename` worked through the descriptor path, but overwrote an existing destination. Ordinary Node rename is therefore **not** the immutable installation primitive. Use hard links on the same admitted filesystem. EEXIST means validate existing content/association, not unconditional success. Do not use the bare `/proc/self/fd/<filefd>` as the hard-link source; use the regular child entry under the directory FD.

Fsync calls succeeded before acknowledgement. A duplicate must also sync the admitted directory before returning: the winning publisher may not yet have synced the link. All write/link/read/sync errors must deny acknowledgement and preserve unresolved responsibility. These probes do not simulate power loss, storage firmware lies, fsync failure injection or all crash cuts. Crashed private temporary files are unindexed orphans; cleanup cannot erase immutable retained content or imply redispatch.

## Why procfs anchors this, and what it does not protect

Linux proc fd entries are magic links: the kernel follows its retained file-handle representation rather than re-expanding the displayed original pathname. That explains the tested rename/retarget behavior. Do not `readlink()` or `realpath()` the proc entry and then use its display pathname. This reasoning is supported by [Linux symlink(7)](https://man7.org/linux/man-pages/man7/symlink.7.html), not a claim about Darwin `/dev/fd`.

The scheme deliberately follows the proc magic link in an intermediate position, then resolves one validated leaf. `O_NOFOLLOW` protects the final opened component. Proc fd access still involves procfs permission checks; capability probing must run as the final service UID. See [proc_pid_fd(5)](https://man7.org/linux/man-pages/man5/proc_pid_fd.5.html).

Required security boundaries:

- Keep real procfs mounted at the fixed `/proc` path in the container's private namespace; verify procfs type and self/fd behavior. Failure or later loss closes custody/transport; no configured-path fallback. A one-time probe cannot protect against a privileged administrator replacing procfs later.
- Hold a strong reference to the FileHandle; no finalizer-only ownership. Do not close/reuse the root FD until all operations finish. Otherwise its number may refer to a different object. A deliberate shutdown drains I/O then closes it.
- The default child spawn did not inherit the custody FD in the probe. Never explicitly pass it in child stdio or IPC; `/proc/self` in another process refers to that process. Admission grants no protection against malicious code already inside the Backend process.
- Use flat, generated leaf names with fixed kind/UUID grammar (existing JSON suffixes are fine when generated internally). Reject slash, backslash, NUL, empty/dot/dotdot and uncontrolled relative/absolute paths. Do not insert account-controlled subdirectories.
- Validate file owner, private mode, regular-file type and bounded size on the opened file; verify exact hash/length/schema/account/reservation/result association. Recheck directory metadata by fstat when appropriate; never reopen configured pathname for ordinary I/O.
- Other UIDs without privileged host access must not be able to write the root or trusted parents. Mode0700 does not exclude another process using UID10001; dedicate this UID/volume to the trusted Backend. POSIX hard-link installation prevents cooperating API writers from overwriting; it is not a WORM filesystem against owner/root writes, ACL grants or an already-open external write FD.

An empty directory was removed after opening: new anchored creation failed ENOENT. An FD does not make an unlinked directory a usable store; fail closed and never create a replacement. Existing open file handles can outlive unlink; that is not retained-content availability.

Mount replacement/unmount was **not executed**: it would require mount privileges intentionally absent here. Kernel handle anchoring supports the inference that an existing FD remains on its old mount/dentry when a pathname is overmounted, but this report makes no tested mount-replacement guarantee. Treat Docker daemon, host root and mount administration as trusted. Require persistent storage and reject unsupported network/FUSE filesystems unless separately validated.

The distinction between file and directory durability follows [fsync(2)](https://man7.org/linux/man-pages/man2/fsync.2.html). Immutable publication relies on same-filesystem atomic link exclusion described by [link(2)](https://man7.org/linux/man-pages/man2/link.2.html). Node exposes the required operations and constants in its [Node24 fs API](https://nodejs.org/docs/latest-v24.x/api/fs.html).

## Proposed startup admission

This is a proposal for Owner approval, not an implementation patch.

1. Reject unsupported platforms before any secret getter/provider construction. Require a normalized absolute configured path, no empty/dot/dotdot components or trailing slash ambiguity. Never mkdir a missing custody root.
2. Open `/` as the initial trusted directory; validate it. Open each next component through `/proc/self/fd/<parentfd>/<single-component>` with `O_DIRECTORY | O_NOFOLLOW | O_RDONLY`. Fstat that opened object before admitting it; close intermediate handles only after acquiring/validating the next.
3. Require production ancestors owned by root/trusted provisioning identity, not writable by group/other or untrusted ACL principals; root itself owned by runtime UID with mode0700. Read-only container ancestors strengthen this. The synthetic helper allows root or runtime UID for its private fixture ancestors; production policy should be stricter. ACL/mount provenance is also a deployment admission responsibility; mode bits alone do not audit all ACLs.
4. Verify real procfs and root descriptor identity, exclusive creation/link conflict behavior, bounded read and file+directory fsync in this root using disposable synthetic capability files. Clean capability files without touching retained evidence. Failure closes live host construction.
5. Retain the final handle as the only namespace anchor. Every custody kind uses it. Revalidate retained responsibility/continuity before enabling transport; then allow the existing host/Server84 gates to decide eligibility.

The anchored component walk removes symlink check/use races. It does not reject a correctly owned replacement placed by a trusted/same-UID actor before acquisition; admission selects the object actually opened. Likewise the tested contract continues using the original admitted object after pathname replacement, rather than switching roots. If policy requires aborting upon any pathname rename, that is a separate restriction; pathname monitoring does not create the anchoring guarantee.

## Restart contract and continuity decision

A new container/process loses all old FDs. The executed restart reopened the retained volume and verified exact bytes plus equal/conflicting duplicate semantics. The separate witness proved a replacement0700 root also passes fresh admission. Therefore **fresh admission plus Server84 alone is sufficient for preventing repeat dispatch, but insufficient to claim cross-restart immutable custody continuity or retained-content availability.**

Safe restart should reopen/admit the configured trusted path, verify an expected store identity and all referenced acceptance/material/raw/result associations required by protected responsibility, and keep transport closed on missing/corrupt/mismatched content. Existing Server84 state remains authoritative; missing content never proves no send, releases a mark, creates a new call/key or permits provider redispatch. Recovery may remain unavailable/UNKNOWN until the correct volume is restored.

Recommend recording an expected opaque store identity in independently trusted host provisioning, alongside persistent mount identity/backup policy; a marker stored solely inside the replaceable root is insufficient. Runtime device/inode can be recorded for diagnostics and same-mount process restarts, but cannot alone prove continuity across container/host reboot, backup restore or inode reuse. If deployment guarantees stable device/inode, an external comparison can fail closed; otherwise require an explicit operator re-admission procedure that validates store identity and retained content before resuming. No automatic empty-root replacement.

This is an Owner contract choice: the original independent review requires replacement/retargeting protection across the supported restart boundary. A correction cannot declare F1 closed solely from this spike's same-process anchoring. No Server85/SQLite51 is needed for host provisioning continuity, and no new dispatch journal should be introduced.

## Platform and Docker contract

Proposed capability:

```text
REAL_LIVE_FLIGHT_CUSTODY_SUPPORTED =
  process.platform === 'linux' && procfs_anchored_dirfd_capability_verified
```

Capability is necessary, not sufficient: trusted path, private persistent mount, continuity and current host/Server84 authorization are also required. On macOS/Windows or failed Linux capability/admission, **real-capable production composition construction fails closed before secret resolution**; transport cannot enable and no provider send occurs. Here “production composition” means the real-capable code path: current LIVE-W still denies the PRODUCTION environment and only proposes DEV acceptance. This does not authorize a Production environment.

macOS/Windows can run unit/fake-custody/network-disabled protocol tests. Those results cannot claim live filesystem assurance. Capability must be checked in the deployed service process, not inferred from image labels or a passing developer-machine probe.

The optional override already proposes:

- Host bind source `/opt/otr/dev-backend/private/flight-custody`.
- Container target `/var/lib/otr/dev-flight`.
- Custody root owner UID10001/GID equal to the built image's actual otr group; mode0700, files0600.
- Host parent trust rooted in root-owned `/opt/otr/dev-backend/private`, with no untrusted write/ACL access. Container ancestors `/`, `/var`, `/var/lib`, `/var/lib/otr` must pass component admission and be root-owned/non-writable by the service. Host bind-source parents require separate host-side provisioning validation: container traversal cannot inspect them.

The base compose has read_only, tmpfs, no-new-privileges and no custody volume. The optional bind is persistent and writable despite a read-only container root, but is not enabled by default and its actual provisioning was not tested. **Current runtime family: compatible; current default compose: not custody-ready until explicit approved mount provisioning/admission.** Docker must not silently create a missing empty bind source; future provisioning should precreate it and use fail-on-missing bind semantics.

Keep ordinary procfs and private PID namespace. No privileged container, CAP_SYS_ADMIN, host PID namespace or extra runtime capability is needed. The spike passed with all capabilities dropped, stronger than the currently inspected compose. No native addon or new dependency is needed for this bounded contract.

## Alternatives if the Owner requires stronger guarantees

| Alternative                     | Fit / cost                                                                                                                                                                                                                       |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A. Small native N-API helper    | Smallest fallback for direct `openat`/`linkat`/`unlinkat`/`fsync`, optionally Linux `openat2` resolution constraints; removes procfs dependency but adds native build/ABI/security maintenance. Still needs restart/store trust. |
| B. Tiny Rust/Go custody service | Useful for separate UID/process authority isolation; adds protocol, deployment, authentication and failure handling. Larger than A for this need.                                                                                |
| C. DB/blob custody redesign     | Can move durability/immutable content enforcement to another existing trust boundary; requires storage/transaction/recovery redesign and explicit scope review. Largest departure.                                               |

For the tested trusted-host Linux-only contract, use procfs anchoring. If procfs is unavailable or the policy demands kernel resolution constraints this method cannot enforce, prefer A. None of these protects against a compromised host/storage administrator or solves cross-restart continuity merely by existing. No alternative was implemented.

## Evidence and reproduction

The spike-owned Docker volume was removed after validation; no probe containers remain. Report formatting and whitespace checks passed. LIVE-W input hashes were rechecked unchanged.

External artifacts remain under `/private/tmp/otr-linux-custody-spike/`: `probe.mjs`, `extra.mjs`, `replacement-restart.mjs`, `run.log`, `restart.log`, `backend-restart.log`, `extra.log`, `replacement-restart.log`. Runnable source snapshots are embedded below; no test files are added to production. Tests use synthetic strings only.

For reproduction, use a fresh task-owned volume, provision its mount0700/UID10001 in a separate cached-image network-none container, then pipe `probe.mjs` to:

```sh
docker run --rm -i --pull=never --network none --user 10001:10001 \
  --read-only --cap-drop ALL --security-opt no-new-privileges:true \
  --tmpfs /tmp:size=16m,mode=1777 \
  --mount type=volume,source=YOUR_NEW_SPIKE_VOLUME,target=/custody-test \
  --entrypoint node node:24-bookworm-slim --input-type=module < probe.mjs
```

Repeat with `--env RESTART=1` on the same volume in a new container. Repeat restart with `otr-dev-backend:local` and omit `--user` to test the built identity. Then run `extra.mjs` and `replacement-restart.mjs` through that cached Backend image; no RESTART flag. Main/extra scripts expect a fresh fixture at their first execution. Dispose only the task-owned volume afterward; scripts/logs may be retained for review. No application server entrypoint or compose env file is used.

## Final required answers

| Required answer                                               | Result                                                                                          |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Linux Node24 /proc/self/fd child access works                 | YES                                                                                             |
| Operations remain on original root after pathname replacement | YES                                                                                             |
| Parent pathname no longer used after fd admission             | YES                                                                                             |
| Exclusive immutable install feasible                          | YES                                                                                             |
| fsync-before-ack feasible                                     | YES                                                                                             |
| Concurrent duplicate semantics feasible                       | YES                                                                                             |
| Container restart can safely re-admit root                    | YES — with continuity/retained-content checks; fresh owner/mode admission alone is insufficient |
| Current Docker runtime compatible                             | YES — cached family tested; actual DEV bind provisioning unverified                             |
| Privileged container required                                 | NO                                                                                              |
| Extra Linux capability required                               | NO                                                                                              |
| Native addon required                                         | NO — under the specified trusted-host/procfs contract                                           |
| Linux-only live custody contract recommended                  | YES                                                                                             |
| macOS real live custody should remain unsupported             | YES                                                                                             |
| Server85 required                                             | NO                                                                                              |
| SQLite51 required                                             | NO                                                                                              |
| Production code changed                                       | NO                                                                                              |
| Hosted access                                                 | NO                                                                                              |
| Real secret/provider call                                     | NO                                                                                              |
| Commit                                                        | NO                                                                                              |
| Push                                                          | NO                                                                                              |
| Ready for Owner custody decision                              | YES                                                                                             |

**STOP — LINUX ANCHORED CUSTODY SPIKE COMPLETE.**

## Runnable probe snapshots

<details>
<summary>probe.mjs</summary>

```javascript
import * as fs from "node:fs/promises";
import { constants as C } from "node:fs";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import os from "node:os";
const base = "/custody-test";
const passes = [];
const check = async (name, fn) => {
  await fn();
  passes.push(name);
  console.log("PASS", name);
};
const dirFlags = C.O_RDONLY | C.O_DIRECTORY | C.O_NOFOLLOW;
const fileFlags = C.O_RDONLY | C.O_NOFOLLOW | C.O_NONBLOCK;
function component(s) {
  assert.match(s, /^[a-zA-Z0-9_-]+$/);
  assert(![".", ".."].includes(s));
  return s;
}
async function admit(path) {
  assert(path.startsWith("/"));
  const parts = path.slice(1).split("/");
  parts.forEach(component);
  let parent = await fs.open("/", dirFlags);
  try {
    for (let i = 0; i < parts.length; i++) {
      const next = await fs.open(`/proc/self/fd/${parent.fd}/${parts[i]}`, dirFlags);
      try {
        const st = await next.stat();
        assert(st.isDirectory());
        assert([0, process.getuid()].includes(st.uid));
        assert.equal(st.mode & 0o022, 0);
        if (i === parts.length - 1) {
          assert.equal(st.uid, process.getuid());
          assert.equal(st.mode & 0o777, 0o700);
        }
      } catch (e) {
        await next.close();
        throw e;
      }
      await parent.close();
      parent = next;
    }
    return parent;
  } catch (e) {
    await parent.close();
    throw e;
  }
}
async function read(root, name) {
  const h = await fs.open(`/proc/self/fd/${root.fd}/${component(name)}`, fileFlags);
  try {
    const st = await h.stat();
    assert(st.isFile());
    assert.equal(st.uid, process.getuid());
    assert.equal(st.mode & 0o777, 0o600);
    return await h.readFile();
  } finally {
    await h.close();
  }
}
async function put(root, name, bytes) {
  const p = `/proc/self/fd/${root.fd}/`,
    tmp = `tmp_${randomUUID()}`;
  component(name);
  const h = await fs.open(
    p + tmp,
    C.O_WRONLY | C.O_CREAT | C.O_EXCL | C.O_NOFOLLOW,
    0o600,
  );
  try {
    await h.writeFile(bytes);
    await h.sync();
  } finally {
    await h.close();
  }
  try {
    try {
      await fs.link(p + tmp, p + name);
    } catch (e) {
      if (e.code !== "EEXIST") throw e;
      assert(
        (await read(root, name)).equals(Buffer.from(bytes)),
        "conflicting duplicate",
      );
    }
    await root.sync();
    return true;
  } finally {
    await fs.unlink(p + tmp);
    await root.sync();
  }
}
console.log(
  JSON.stringify(
    {
      kernel: os.release(),
      node: process.version,
      arch: process.arch,
      uid: process.getuid(),
      gid: process.getgid(),
      fsType: (await fs.statfs(base)).type.toString(16),
      procType: (await fs.statfs("/proc")).type.toString(16),
      status: (await fs.readFile("/proc/self/status", "utf8"))
        .split("\n")
        .filter((x) => /^(Cap|NoNewPrivs)/.test(x)),
      procMount: (await fs.readFile("/proc/mounts", "utf8"))
        .split("\n")
        .filter((x) => x.startsWith("proc /proc ")),
    },
    null,
    2,
  ),
);
const trusted = base + "/trusted",
  path = trusted + "/custody";
if (process.env.RESTART === "1") {
  const root = await admit(path);
  await check("fresh-process retained bytes", async () =>
    assert.equal((await read(root, "retained")).toString(), "restart-evidence"),
  );
  await check(
    "fresh-process equal duplicate",
    async () => await put(root, "retained", "restart-evidence"),
  );
  await check(
    "fresh-process conflicting duplicate rejects",
    async () => await assert.rejects(put(root, "retained", "changed")),
  );
  await root.close();
  console.log("TOTAL", passes.length);
  process.exit(0);
}
await fs.mkdir(trusted, { mode: 0o700 });
await fs.mkdir(path, { mode: 0o700 });
const root = await admit(path),
  anch = `/proc/self/fd/${root.fd}/`;
await check("proc identity matches descriptor", async () => {
  const a = await root.stat(),
    b = await fs.stat(anch);
  assert.equal(a.ino, b.ino);
  assert.equal(a.dev, b.dev);
});
await check("exclusive create, fsync file/link/unlink/directory, read", async () => {
  await put(root, "X", "original");
  assert.equal((await read(root, "X")).toString(), "original");
});
await check(
  "exclusive temp refuses occupied leaf",
  async () =>
    await assert.rejects(
      fs.open(anch + "X", C.O_WRONLY | C.O_CREAT | C.O_EXCL | C.O_NOFOLLOW),
      { code: "EEXIST" },
    ),
);
await check("anchored rename works but replaces existing destination", async () => {
  await put(root, "rename_src", "source");
  await put(root, "rename_dst", "destination");
  await fs.rename(anch + "rename_src", anch + "rename_dst");
  assert.equal((await read(root, "rename_dst")).toString(), "source");
  await root.sync();
});
await fs.rename(path, trusted + "/original");
await fs.mkdir(path, { mode: 0o700 });
await fs.writeFile(path + "/X", "replacement", { mode: 0o600 });
await check("root replacement retains original identity", async () => {
  await put(root, "after", "anchored");
  assert.equal((await read(root, "X")).toString(), "original");
  assert.equal(await fs.readFile(path + "/X", "utf8"), "replacement");
  assert.equal(await fs.readFile(trusted + "/original/after", "utf8"), "anchored");
  await assert.rejects(fs.stat(path + "/after"), { code: "ENOENT" });
});
await fs.symlink(trusted + "/original", base + "/direct");
await fs.symlink(trusted, base + "/parent");
await fs.mkdir(base + "/middle", { mode: 0o700 });
await fs.symlink(trusted, base + "/middle/link");
for (const [name, p] of [
  ["direct", base + "/direct"],
  ["parent", base + "/parent/original"],
  ["intermediate", base + "/middle/link/original"],
])
  await check(
    name + " symlink admission rejects",
    async () => await assert.rejects(admit(p)),
  );
await check("O_NOFOLLOW alone accepts parent symlink", async () => {
  const h = await fs.open(base + "/parent/original", dirFlags);
  assert.equal((await h.stat()).ino, (await root.stat()).ino);
  await h.close();
});
await fs.rename(trusted, base + "/moved");
await fs.mkdir(base + "/other", { mode: 0o700 });
await fs.mkdir(base + "/other/original", { mode: 0o700 });
await fs.symlink(base + "/other", trusted);
await fs.unlink(base + "/parent");
await fs.symlink(base + "/other", base + "/parent");
await check("inserted parent symlink and retarget do not affect anchor", async () => {
  await put(root, "post_parent", "safe");
  assert.equal(await fs.readFile(base + "/moved/original/post_parent", "utf8"), "safe");
  await assert.rejects(fs.stat(base + "/other/original/post_parent"), { code: "ENOENT" });
});
await fs.symlink(base + "/outside", anch + "evil");
await check(
  "leaf symlink read rejects",
  async () => await assert.rejects(read(root, "evil"), { code: "ELOOP" }),
);
await check(
  "leaf symlink publish rejects",
  async () => await assert.rejects(put(root, "evil", "safe")),
);
await check("invalid child grammar rejects traversal", async () => {
  for (const v of ["..", "../escape", "a/b", "/abs", "a\0b"])
    assert.throws(() => component(v));
});
await check("raw proc path permits traversal (must forbid)", async () =>
  assert((await fs.stat(anch + "../")).isDirectory()),
);
await check("32 concurrent equal duplicates succeed", async () => {
  await Promise.all(Array.from({ length: 32 }, () => put(root, "equal", "same")));
  assert.equal((await read(root, "equal")).toString(), "same");
});
await check("32 concurrent different puts have one winner", async () => {
  const result = await Promise.allSettled(
    Array.from({ length: 32 }, (_, i) => put(root, "different", String(i))),
  );
  assert.equal(result.filter((x) => x.status === "fulfilled").length, 1);
  assert.equal(result.filter((x) => x.status === "rejected").length, 31);
});
await check("no temp leak", async () =>
  assert(!(await fs.readdir(anch)).some((x) => x.startsWith("tmp_"))),
);
await check("child process does not inherit custody fd", async () => {
  const r = spawnSync(process.execPath, [
    "-e",
    `const f=require('fs');try{f.statSync('/proc/self/fd/${root.fd}/X');process.exit(1)}catch(e){process.exit(0)}`,
  ]);
  assert.equal(r.status, 0);
});
const deleted = base + "/deleted";
await fs.mkdir(deleted, { mode: 0o700 });
const dead = await admit(deleted);
await fs.rmdir(deleted);
await check(
  "deleted directory refuses create",
  async () => await assert.rejects(put(dead, "cannot", "x"), { code: "ENOENT" }),
);
await dead.close();
await root.close();
await fs.unlink(trusted);
await fs.rename(base + "/moved", trusted);
await fs.rename(path, trusted + "/discard");
await fs.rename(trusted + "/original", path);
const final = await admit(path);
await put(final, "retained", "restart-evidence");
await final.close();
console.log("TOTAL", passes.length);
```

</details>

<details>
<summary>extra.mjs</summary>

```javascript
import * as fs from "node:fs/promises";
import { constants as C } from "node:fs";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import os from "node:os";
const base = "/custody-test";
const passes = [];
const check = async (name, fn) => {
  await fn();
  passes.push(name);
  console.log("PASS", name);
};
const dirFlags = C.O_RDONLY | C.O_DIRECTORY | C.O_NOFOLLOW;
const fileFlags = C.O_RDONLY | C.O_NOFOLLOW | C.O_NONBLOCK;
function component(s) {
  assert.match(s, /^[a-zA-Z0-9_-]+$/);
  assert(![".", ".."].includes(s));
  return s;
}
async function admit(path) {
  assert(path.startsWith("/"));
  const parts = path.slice(1).split("/");
  parts.forEach(component);
  let parent = await fs.open("/", dirFlags);
  try {
    for (let i = 0; i < parts.length; i++) {
      const next = await fs.open(`/proc/self/fd/${parent.fd}/${parts[i]}`, dirFlags);
      try {
        const st = await next.stat();
        assert(st.isDirectory());
        assert([0, process.getuid()].includes(st.uid));
        assert.equal(st.mode & 0o022, 0);
        if (i === parts.length - 1) {
          assert.equal(st.uid, process.getuid());
          assert.equal(st.mode & 0o777, 0o700);
        }
      } catch (e) {
        await next.close();
        throw e;
      }
      await parent.close();
      parent = next;
    }
    return parent;
  } catch (e) {
    await parent.close();
    throw e;
  }
}
async function read(root, name) {
  const h = await fs.open(`/proc/self/fd/${root.fd}/${component(name)}`, fileFlags);
  try {
    const st = await h.stat();
    assert(st.isFile());
    assert.equal(st.uid, process.getuid());
    assert.equal(st.mode & 0o777, 0o600);
    return await h.readFile();
  } finally {
    await h.close();
  }
}
async function put(root, name, bytes) {
  const p = `/proc/self/fd/${root.fd}/`,
    tmp = `tmp_${randomUUID()}`;
  component(name);
  const h = await fs.open(
    p + tmp,
    C.O_WRONLY | C.O_CREAT | C.O_EXCL | C.O_NOFOLLOW,
    0o600,
  );
  try {
    await h.writeFile(bytes);
    await h.sync();
  } finally {
    await h.close();
  }
  try {
    try {
      await fs.link(p + tmp, p + name);
    } catch (e) {
      if (e.code !== "EEXIST") throw e;
      assert(
        (await read(root, name)).equals(Buffer.from(bytes)),
        "conflicting duplicate",
      );
    }
    await root.sync();
    return true;
  } finally {
    await fs.unlink(p + tmp);
    await root.sync();
  }
}

const root = await admit(base + "/trusted/custody");
await check("unsafe writable parent rejects", async () => {
  await fs.mkdir(base + "/unsafe", { mode: 0o700 });
  await fs.chmod(base + "/unsafe", 0o777);
  await fs.mkdir(base + "/unsafe/custody", { mode: 0o700 });
  await assert.rejects(admit(base + "/unsafe/custody"));
});
await check("nonprivate root rejects", async () => {
  await fs.mkdir(base + "/public", { mode: 0o700 });
  await fs.chmod(base + "/public", 0o755);
  await assert.rejects(admit(base + "/public"));
});
await check("concurrent pathname replacement stays anchored", async () => {
  const original = await root.stat();
  await Promise.all([
    (async () => {
      for (let i = 0; i < 50; i++) {
        await fs.rename(base + "/trusted/custody", base + "/trusted/held");
        await fs.mkdir(base + "/trusted/custody", { mode: 0o700 });
        await fs.rmdir(base + "/trusted/custody");
        await fs.rename(base + "/trusted/held", base + "/trusted/custody");
      }
    })(),
    (async () => {
      for (let i = 0; i < 50; i++) {
        await put(root, "racing", "fixed");
        assert.equal((await read(root, "racing")).toString(), "fixed");
        assert.equal((await root.stat()).ino, original.ino);
      }
    })(),
  ]);
});
await check("fstat follows mode change on admitted object", async () => {
  await root.chmod(0o755);
  assert.equal((await root.stat()).mode & 0o777, 0o755);
  await root.chmod(0o700);
});
const reopen = await admit(base + "/trusted/custody");
await check("independent descriptors concurrent equal puts", async () => {
  await Promise.all(
    Array.from({ length: 16 }, (_, i) =>
      put(i % 2 ? root : reopen, "two_handles", "equal"),
    ),
  );
});
await reopen.close();
await root.close();
console.log("TOTAL", passes.length);
```

</details>

<details>
<summary>replacement-restart.mjs</summary>

```javascript
import * as fs from "node:fs/promises";
import { constants as C } from "node:fs";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import os from "node:os";
const base = "/custody-test";
const passes = [];
const check = async (name, fn) => {
  await fn();
  passes.push(name);
  console.log("PASS", name);
};
const dirFlags = C.O_RDONLY | C.O_DIRECTORY | C.O_NOFOLLOW;
const fileFlags = C.O_RDONLY | C.O_NOFOLLOW | C.O_NONBLOCK;
function component(s) {
  assert.match(s, /^[a-zA-Z0-9_-]+$/);
  assert(![".", ".."].includes(s));
  return s;
}
async function admit(path) {
  assert(path.startsWith("/"));
  const parts = path.slice(1).split("/");
  parts.forEach(component);
  let parent = await fs.open("/", dirFlags);
  try {
    for (let i = 0; i < parts.length; i++) {
      const next = await fs.open(`/proc/self/fd/${parent.fd}/${parts[i]}`, dirFlags);
      try {
        const st = await next.stat();
        assert(st.isDirectory());
        assert([0, process.getuid()].includes(st.uid));
        assert.equal(st.mode & 0o022, 0);
        if (i === parts.length - 1) {
          assert.equal(st.uid, process.getuid());
          assert.equal(st.mode & 0o777, 0o700);
        }
      } catch (e) {
        await next.close();
        throw e;
      }
      await parent.close();
      parent = next;
    }
    return parent;
  } catch (e) {
    await parent.close();
    throw e;
  }
}
async function read(root, name) {
  const h = await fs.open(`/proc/self/fd/${root.fd}/${component(name)}`, fileFlags);
  try {
    const st = await h.stat();
    assert(st.isFile());
    assert.equal(st.uid, process.getuid());
    assert.equal(st.mode & 0o777, 0o600);
    return await h.readFile();
  } finally {
    await h.close();
  }
}
async function put(root, name, bytes) {
  const p = `/proc/self/fd/${root.fd}/`,
    tmp = `tmp_${randomUUID()}`;
  component(name);
  const h = await fs.open(
    p + tmp,
    C.O_WRONLY | C.O_CREAT | C.O_EXCL | C.O_NOFOLLOW,
    0o600,
  );
  try {
    await h.writeFile(bytes);
    await h.sync();
  } finally {
    await h.close();
  }
  try {
    try {
      await fs.link(p + tmp, p + name);
    } catch (e) {
      if (e.code !== "EEXIST") throw e;
      assert(
        (await read(root, name)).equals(Buffer.from(bytes)),
        "conflicting duplicate",
      );
    }
    await root.sync();
    return true;
  } finally {
    await fs.unlink(p + tmp);
    await root.sync();
  }
}

await fs.rename(base + "/trusted/custody", base + "/trusted/restart_original");
await fs.mkdir(base + "/trusted/custody", { mode: 0o700 });
const replacement = await admit(base + "/trusted/custody");
await check("fresh admission alone accepts replacement identity", async () => {
  const old = await fs.stat(base + "/trusted/restart_original");
  assert.notEqual((await replacement.stat()).ino, old.ino);
  await assert.rejects(read(replacement, "retained"), { code: "ENOENT" });
});
await replacement.close();
await fs.rmdir(base + "/trusted/custody");
await fs.rename(base + "/trusted/restart_original", base + "/trusted/custody");
console.log("TOTAL", passes.length);
```

</details>
