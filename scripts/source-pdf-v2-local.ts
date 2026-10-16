// Local operator: node --import tsx scripts/source-pdf-v2-local.ts <original.pdf> <private-output-dir>
import { constants } from "node:fs";
import { open, mkdir, lstat, writeFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { resolve, join } from "node:path";
import { compileNative } from "./import-workbench/mac";
import { derivePdfV2Local, PDF_V2_LOCAL_PROFILE } from "../backend/src/sourcePdfV2Local";
import { localPdfKitDecoder } from "./source-pdf-v2/pdfKitLocal";

async function main() {
  if (process.argv.length !== 4) throw new Error("PDF_V2_USAGE_INVALID");
  const root = resolve(process.argv[3]);
  await mkdir(root, { mode: 0o700, recursive: true });
  const stat = await lstat(root);
  if (
    !stat.isDirectory() ||
    stat.isSymbolicLink() ||
    stat.uid !== process.getuid?.() ||
    (stat.mode & 0o777) !== 0o700
  )
    throw new Error("PDF_V2_PRIVATE_DIRECTORY_REQUIRED");
  const file = await open(
    resolve(process.argv[2]),
    constants.O_RDONLY | constants.O_NOFOLLOW,
  );
  let bytes: Buffer;
  try {
    const info = await file.stat();
    if (
      !info.isFile() ||
      info.size < 1 ||
      info.size > PDF_V2_LOCAL_PROFILE.maxOriginalBytes
    )
      throw new Error("PDF_V2_ORIGINAL_LIMIT");
    // One bounded allocation; growth cannot cause unbounded readFile buffering.
    bytes = Buffer.alloc(info.size + 1);
    let offset = 0;
    while (offset < bytes.length) {
      const { bytesRead } = await file.read(bytes, offset, bytes.length - offset, null);
      if (!bytesRead) break;
      offset += bytesRead;
    }
    if (offset !== info.size) throw new Error("PDF_V2_ORIGINAL_CHANGED");
    bytes = bytes.subarray(0, offset);
  } finally {
    await file.close();
  }
  const pin = {
    sha256: createHash("sha256").update(bytes).digest("hex"),
    byteCount: bytes.length,
  };
  const binary = compileNative(root);
  const result = await derivePdfV2Local(bytes, pin, localPdfKitDecoder(binary));
  const id = randomUUID();
  await writeFile(join(root, `${id}.json`), JSON.stringify(result, null, 2) + "\n", {
    mode: 0o600,
    flag: "wx",
  });
  const { text: _text, pages, ...summary } = result;
  console.log(JSON.stringify({ artifactId: id, ...summary, pageCount: pages.length }));
}
main().catch(() => {
  console.error("PDF_V2_LOCAL_FAILED");
  process.exitCode = 1;
});
