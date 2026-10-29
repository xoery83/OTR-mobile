import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from "node:crypto";
import { readFileSync, writeFileSync, renameSync, lstatSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { SecureSessionStorage } from "../../src/data/auth/authSessionRepository";
import { OtpQaError } from "./resend-inbound-otp";

// Host test storage only; the existing repository remains the sole Session model.
export function createOtpTestVault(
  directory: string,
  inputKey: Buffer,
): SecureSessionStorage {
  const dir = lstatSync(directory);
  if (
    !dir.isDirectory() ||
    dir.isSymbolicLink() ||
    (dir.mode & 0o777) !== 0o700 ||
    dir.uid !== process.getuid?.() ||
    inputKey.length !== 32
  )
    throw new OtpQaError("TEST_VAULT_SCOPE_INVALID");
  const key = Buffer.from(inputKey),
    path = join(directory, "session-vault.enc");
  function load(): Record<string, string> {
    if (!existsSync(path)) return Object.create(null) as Record<string, string>;
    const info = lstatSync(path);
    if (
      !info.isFile() ||
      info.isSymbolicLink() ||
      (info.mode & 0o777) !== 0o600 ||
      info.size > 1048576
    )
      throw new OtpQaError("TEST_VAULT_SCOPE_INVALID");
    try {
      const value = JSON.parse(readFileSync(path, "utf8"));
      const decipher = createDecipheriv(
        "aes-256-gcm",
        key,
        Buffer.from(value.iv, "base64"),
      );
      decipher.setAuthTag(Buffer.from(value.tag, "base64"));
      const values: unknown = JSON.parse(
        Buffer.concat([
          decipher.update(Buffer.from(value.body, "base64")),
          decipher.final(),
        ]).toString("utf8"),
      );
      if (
        !values ||
        typeof values !== "object" ||
        Array.isArray(values) ||
        Object.values(values).some((v) => typeof v !== "string")
      )
        throw Error();
      return Object.assign(Object.create(null), values) as Record<string, string>;
    } catch {
      throw new OtpQaError("TEST_VAULT_INTEGRITY_FAILURE");
    }
  }
  function save(value: Record<string, string>) {
    load();
    const iv = randomBytes(12),
      cipher = createCipheriv("aes-256-gcm", key, iv);
    const body = Buffer.concat([
      cipher.update(JSON.stringify(value), "utf8"),
      cipher.final(),
    ]);
    const temporary = join(directory, `${randomUUID()}.enc`);
    writeFileSync(
      temporary,
      JSON.stringify({
        iv: iv.toString("base64"),
        tag: cipher.getAuthTag().toString("base64"),
        body: body.toString("base64"),
      }),
      { mode: 0o600, flag: "wx" },
    );
    renameSync(temporary, path);
  }
  return {
    getItem: async (name) => load()[name] ?? null,
    setItem: async (name, value) => {
      const values = load();
      values[name] = value;
      save(values);
    },
    deleteItem: async (name) => {
      const values = load();
      delete values[name];
      save(values);
    },
  };
}
