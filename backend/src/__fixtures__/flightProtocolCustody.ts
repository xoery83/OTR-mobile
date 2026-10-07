// Protocol-test fixture only. NOT admitted production filesystem custody.
import { constants } from "node:fs";
import { open, lstat, link, unlink } from "node:fs/promises";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  assertCustodyPayload,
  persistenceDigest,
  type PrivateMaterialCustody,
} from "../externalIntegrationPersistence";
import type { Attempt } from "../../../src/domain/intelligence/persistence";

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

// Private immutable content, not a scheduler, dispatch journal or authorization store.
// The persistent mount and its private parent directory are trusted host configuration.
export async function createProtocolTestCustody(directory: string) {
  if (!directory || resolve(directory) !== directory) throw new Error("CUSTODY_CONFIG");
  const checkRoot = async () => {
    let s;
    try {
      s = await lstat(directory);
    } catch {
      throw new Error("CUSTODY_CONFIG");
    }
    if (
      !s.isDirectory() ||
      s.isSymbolicLink() ||
      s.mode & 0o077 ||
      s.uid !== process.getuid?.()
    )
      throw new Error("CUSTODY_CONFIG");
  };
  await checkRoot();
  const name = (kind: string, account: string, reference: string) =>
    join(directory, `${kind}-${uuid.parse(account)}-${uuid.parse(reference)}.json`);
  async function read(path: string): Promise<unknown> {
    await checkRoot();
    const f = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const s = await f.stat();
      if (
        !s.isFile() ||
        s.size > 6000000 ||
        s.mode & 0o077 ||
        s.uid !== process.getuid?.()
      )
        throw new Error("CUSTODY_INTEGRITY");
      return JSON.parse(await f.readFile("utf8"));
    } finally {
      await f.close();
    }
  }
  async function write(path: string, value: unknown) {
    await checkRoot();
    const bytes = JSON.stringify(value);
    if (Buffer.byteLength(bytes) > 6000000) throw new Error("CUSTODY_INTEGRITY");
    const temporary = join(directory, `.pending-${randomUUID()}`);
    const f = await open(
      temporary,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
      0o600,
    );
    try {
      await f.writeFile(bytes);
      await f.sync();
    } finally {
      await f.close();
    }
    try {
      try {
        await link(temporary, path);
      } catch (error) {
        if (
          (error as NodeJS.ErrnoException).code !== "EEXIST" ||
          persistenceDigest(await read(path)) !== persistenceDigest(value)
        )
          throw new Error("CUSTODY_INTEGRITY");
      }
      const dir = await open(
        directory,
        constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
      );
      try {
        await dir.sync();
      } finally {
        await dir.close();
      }
    } finally {
      await unlink(temporary);
    }
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
        .strictObject({ version: z.literal(1), association: z.unknown(), pin: pinSchema })
        .parse(raw);
      if (persistenceDigest(r.association) !== persistenceDigest(association(a)))
        throw new Error("CUSTODY_INTEGRITY");
      return r.pin;
    },
  };
  return {
    close: async () => {},
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
}
