import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex } from "@noble/hashes/utils";
import { randomUUID } from "expo-crypto";
import { Directory, File, Paths } from "expo-file-system";
import { z } from "zod";

const uuid = z.uuid();
const digest = z.string().regex(/^[a-f0-9]{64}$/);

function localFile(account: string, expectedSha: string) {
  const directory = new Directory(
    Paths.document,
    "import-originals",
    uuid.parse(account),
  );
  return { directory, file: new File(directory, digest.parse(expectedSha)) };
}

async function checkedBytes(file: File, sha: string, length: number) {
  if (file.size !== length) throw Error("IMPORT_ORIGINAL_INTEGRITY");
  const bytes = await file.bytes();
  if (bytes.byteLength !== length || bytesToHex(sha256(bytes)) !== sha)
    throw Error("IMPORT_ORIGINAL_INTEGRITY");
  return new Uint8Array(bytes);
}

export async function retainImportOriginal(
  account: string,
  expectedSha: string,
  bytes: Uint8Array,
) {
  if (
    !bytes.length ||
    bytes.length > 10 * 1024 * 1024 ||
    bytesToHex(sha256(bytes)) !== expectedSha
  )
    throw Error("IMPORT_ORIGINAL_INTEGRITY");
  const { directory, file } = localFile(account, expectedSha);
  if (file.exists) {
    await checkedBytes(file, expectedSha, bytes.length);
    return;
  }
  directory.create({ idempotent: true, intermediates: true });
  const staged = new File(directory, `.pending-${randomUUID()}`);
  try {
    staged.create({ overwrite: false });
    staged.write(bytes);
    await checkedBytes(staged, expectedSha, bytes.length);
    try {
      await staged.move(file, { overwrite: false });
    } catch (error) {
      if (!file.exists) throw error;
      await checkedBytes(file, expectedSha, bytes.length);
    }
  } finally {
    if (staged.exists && staged.uri !== file.uri) staged.delete();
  }
}

export function hasImportOriginal(account: string, sha: string, length: number) {
  const { file } = localFile(account, sha);
  return file.exists && file.size === length;
}

export async function readImportOriginal(account: string, sha: string, length: number) {
  if (!Number.isSafeInteger(length) || length < 1 || length > 10 * 1024 * 1024)
    throw Error("IMPORT_ORIGINAL_INTEGRITY");
  const { file } = localFile(account, sha);
  return file.exists ? checkedBytes(file, sha, length) : null;
}
