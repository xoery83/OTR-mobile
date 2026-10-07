import { constants } from "node:fs";
import { open, statfs, link, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  assertCustodyPayload,
  persistenceDigest,
  type PrivateMaterialCustody,
} from "./externalIntegrationPersistence";
import type { Attempt } from "../../src/domain/intelligence/persistence";

const uuid = z.uuid();
const pinSchema = z.strictObject({
  reference: uuid,
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  byteCount: z.number().int().positive().max(4194304),
});
const association = (a: Readonly<Attempt>) => ({
  account_id: a.account_id,
  task_id: a.task_id,
  attempt_id: a.attempt_id,
  call_id: a.usage_correlation_id,
  request_sha256: a.request_sha256,
  descriptor_sha256: persistenceDigest(a.descriptor_snapshot),
});

// Independently trusted provisioning; never inferred from an empty replacement mount.
export type FlightStoreIdentity = {
  store_id: string;
  device: string;
  inode: string;
};
const identitySchema = z.strictObject({
  store_id: uuid,
  device: z.string().regex(/^[0-9]+$/),
  inode: z.string().regex(/^[0-9]+$/),
});
const dirFlags = constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW;
const fileFlags = constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK;

// The FileHandle is held for the entire store lifetime. No configured-path I/O after admission.
export async function createFlightPrivateCustody(
  directory: string,
  expected: FlightStoreIdentity,
) {
  if (process.platform !== "linux") throw new Error("CUSTODY_PLATFORM_CLOSED");
  if (
    !directory ||
    directory === "/" ||
    resolve(directory) !== directory ||
    !directory.startsWith("/") ||
    directory
      .split("/")
      .slice(1)
      .some((part) => !/^[A-Za-z0-9._-]+$/.test(part) || part === "." || part === "..")
  )
    throw new Error("CUSTODY_CONFIG");
  const identity = identitySchema.parse(expected);
  if ((await statfs("/proc")).type !== 0x9fa0) throw new Error("CUSTODY_PROCFS_CLOSED");
  const uid = process.getuid!();
  let root = await open("/", dirFlags);
  try {
    const parts = directory.slice(1).split("/");
    const initial = await root.stat();
    if (!initial.isDirectory() || initial.uid !== 0 || initial.mode & 0o022)
      throw new Error("CUSTODY_CONFIG");
    for (let i = 0; i < parts.length; i++) {
      const next = await open(`/proc/self/fd/${root.fd}/${parts[i]}`, dirFlags);
      try {
        const s = await next.stat();
        if (
          !s.isDirectory() ||
          ![0, uid].includes(s.uid) ||
          s.mode & 0o022 ||
          (i === parts.length - 1 && (s.uid !== uid || (s.mode & 0o7777) !== 0o700))
        )
          throw new Error("CUSTODY_CONFIG");
      } catch (error) {
        await next.close();
        throw error;
      }
      await root.close();
      root = next;
    }
    const admitted = await root.stat({ bigint: true });
    if (
      admitted.dev.toString() !== identity.device ||
      admitted.ino.toString() !== identity.inode
    )
      throw new Error("CUSTODY_CONTINUITY_CLOSED");
    const checkRoot = async () => {
      const s = await root.stat({ bigint: true });
      if (
        !s.isDirectory() ||
        s.dev !== admitted.dev ||
        s.ino !== admitted.ino ||
        s.uid !== BigInt(uid) ||
        (s.mode & 0o7777n) !== 0o700n ||
        s.nlink === 0n
      )
        throw new Error("CUSTODY_INTEGRITY");
    };
    const leaf = (value: string) => {
      if (!/^[A-Za-z0-9._-]{1,240}$/.test(value) || value === "." || value === "..")
        throw new Error("CUSTODY_INTEGRITY");
      return `/proc/self/fd/${root.fd}/${value}`;
    };
    const name = (kind: string, account: string, reference: string) =>
      leaf(`${kind}-${uuid.parse(account)}-${uuid.parse(reference)}.json`);
    async function readBytes(path: string, bound = 6000000) {
      await checkRoot();
      const f = await open(path, fileFlags);
      try {
        const s = await f.stat();
        if (!s.isFile() || s.size > bound || s.uid !== uid || (s.mode & 0o7777) !== 0o600)
          throw new Error("CUSTODY_INTEGRITY");
        // Bounded even if a file is concurrently enlarged by a trusted-UID actor.
        const bytes = Buffer.alloc(s.size + 1);
        let length = 0;
        while (length < bytes.length) {
          const part = await f.read(bytes, length, bytes.length - length, null);
          if (!part.bytesRead) break;
          length += part.bytesRead;
        }
        if (length !== s.size) throw new Error("CUSTODY_INTEGRITY");
        await checkRoot();
        return bytes.subarray(0, length);
      } finally {
        await f.close();
      }
    }
    const read = async (path: string): Promise<unknown> =>
      JSON.parse((await readBytes(path)).toString("utf8"));
    async function write(path: string, value: unknown) {
      await checkRoot();
      const bytes = JSON.stringify(value);
      if (Buffer.byteLength(bytes) > 6000000) throw new Error("CUSTODY_INTEGRITY");
      const temporary = leaf(`pending-${randomUUID()}`);
      const f = await open(
        temporary,
        constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
        0o600,
      );
      try {
        try {
          await f.writeFile(bytes);
          await f.sync();
        } finally {
          await f.close();
        }
        await checkRoot();
        try {
          await link(temporary, path);
        } catch (error) {
          if (
            (error as NodeJS.ErrnoException).code !== "EEXIST" ||
            persistenceDigest(await read(path)) !== persistenceDigest(value)
          )
            throw new Error("CUSTODY_INTEGRITY");
        }
        await root.sync();
      } finally {
        await unlink(temporary);
        await root.sync();
      }
      await checkRoot();
    }
    // Marker is provisioned before startup, with authoritative expectation OUTSIDE this root.
    if (
      persistenceDigest(await read(leaf("store-identity.json"))) !==
      persistenceDigest({ version: 1, store_id: identity.store_id })
    )
      throw new Error("CUSTODY_CONTINUITY_CLOSED");
    // Capability leaves are disposable; test the exact anchored production primitives.
    const probe = leaf(`probe-${randomUUID()}`),
      published = leaf(`probe-${randomUUID()}`);
    let created = false,
      linked = false;
    try {
      const f = await open(
        probe,
        constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
        0o600,
      );
      created = true;
      try {
        await f.writeFile("procfs-capability");
        await f.sync();
      } finally {
        await f.close();
      }
      await link(probe, published);
      linked = true;
      await root.sync();
      if ((await readBytes(published, 64)).toString() !== "procfs-capability")
        throw new Error("CUSTODY_PROCFS_CLOSED");
    } finally {
      if (linked) await unlink(published);
      if (created) await unlink(probe);
      await root.sync();
    }
    const custody: PrivateMaterialCustody = {
      async put(input) {
        const { bytes: payload, ...rawPin } = input;
        const pin = assertCustodyPayload(rawPin, payload);
        await write(name("material", pin.accountId, pin.reservationId), {
          version: 1,
          ...pin,
          bytes: Buffer.from(input.bytes).toString("base64"),
        });
        return { reference: pin.reservationId };
      },
      async read(input) {
        const raw = z
          .strictObject({
            version: z.literal(1),
            accountId: uuid,
            reservationId: uuid,
            sha256: z.string(),
            byteCount: z.number(),
            bytes: z.string(),
          })
          .parse(await read(name("material", input.accountId, input.reference)));
        if (
          raw.accountId !== input.accountId ||
          raw.reservationId !== input.reference ||
          raw.sha256 !== input.sha256 ||
          raw.byteCount !== input.byteCount
        )
          throw new Error("CUSTODY_INTEGRITY");
        const bytes = new Uint8Array(Buffer.from(raw.bytes, "base64"));
        assertCustodyPayload(
          {
            accountId: input.accountId,
            reservationId: input.reference,
            sha256: input.sha256,
            byteCount: input.byteCount,
          },
          bytes,
        );
        return bytes;
      },
      async verify(input) {
        try {
          await custody.read(input);
          return true;
        } catch {
          return false;
        }
      },
      async release() {
        throw new Error("CUSTODY_RELEASE_CLOSED");
      },
    };
    const retained = {
      async put(a: Readonly<Attempt>, pin: z.infer<typeof pinSchema>) {
        await custody.read({ accountId: a.account_id, ...pinSchema.parse(pin) });
        await write(name("result", a.account_id, a.attempt_id), {
          version: 1,
          association: association(a),
          pin,
        });
      },
      async read(a: Readonly<Attempt>) {
        let raw: unknown;
        try {
          raw = await read(name("result", a.account_id, a.attempt_id));
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
          throw new Error("CUSTODY_INTEGRITY");
        }
        const r = z
          .strictObject({
            version: z.literal(1),
            association: z.unknown(),
            pin: pinSchema,
          })
          .parse(raw);
        if (persistenceDigest(r.association) !== persistenceDigest(association(a)))
          throw new Error("CUSTODY_INTEGRITY");
        return r.pin;
      },
    };
    return {
      close: () => root.close(),
      custody,
      retained,
      async bindAcceptance(_account: string, session: string, binding: unknown) {
        await write(name("acceptance", session, session), { version: 1, binding });
      },
      async readRaw(account: string, call: string) {
        return z
          .strictObject({ version: z.literal(1), binding: z.unknown(), pin: pinSchema })
          .parse(await read(name("raw", account, call)));
      },
      async retainRaw(
        account: string,
        call: string,
        pin: z.infer<typeof pinSchema>,
        binding: unknown,
      ) {
        await write(name("raw", account, call), { version: 1, binding, pin });
      },
    };
  } catch (error) {
    await root.close();
    throw error;
  }
}
