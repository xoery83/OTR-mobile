import { z } from "zod";
import {
  sourcePdfV2UploadBindingSchema,
  type SourcePdfV2UploadBinding,
  PDF_UPLOAD_QPDF_V4,
} from "../../src/domain/trip/sourcePdfV2Upload";
import { verifySourcePdfV2UploadBytes } from "./sourcePdfV2UploadValidation";
import { Buffer } from "node:buffer";
import { constants } from "node:fs";
import { mkdir, lstat, open, link, unlink } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { randomUUID } from "node:crypto";
import { canonicalCoreJson } from "../../src/domain/trip/tripCoreV2Json";
import {
  sourcePdfBackendBindingSchema,
  type PdfBackendBinding,
} from "./sourcePdfStorageProducer";
import { pdfHash, verifySourcePdf } from "./sourcePdfProfile";

// Payload container only. Reservations, dispatch and cleanup remain Source journal decisions.
export function createSourcePdfPrivateStage(root: string) {
  return createPrivateStage(
    root,
    sourcePdfBackendBindingSchema,
    async (bytes) => verifySourcePdf(bytes),
    65536,
    "otr-pdf-stage/1",
  );
}
export function createSourcePdfV2PrivateStage(
  root: string,
  runWorker?: Parameters<typeof verifySourcePdfV2UploadBytes>[1],
) {
  return createPrivateStage(
    root,
    sourcePdfV2UploadBindingSchema,
    (bytes) => verifySourcePdfV2UploadBytes(bytes, runWorker),
    PDF_UPLOAD_QPDF_V4.maxByteCount,
    "otr-pdf-stage/4",
  );
}
function createPrivateStage<B extends PdfBackendBinding | SourcePdfV2UploadBinding>(
  root: string,
  bindingSchema: z.ZodType<B>,
  verify: (bytes: Uint8Array) => Promise<unknown>,
  maxBytes: number,
  stageVersion: string,
) {
  if (!isAbsolute(root)) throw new Error("PRIVATE_STAGE_ROOT_REQUIRED");
  async function directory() {
    await mkdir(root, { mode: 0o700 }).catch((e: NodeJS.ErrnoException) => {
      if (e.code !== "EEXIST") throw e;
    });
    const s = await lstat(root);
    if (
      !s.isDirectory() ||
      s.isSymbolicLink() ||
      (s.mode & 0o777) !== 0o700 ||
      s.uid !== process.getuid?.()
    )
      throw new Error("PRIVATE_STAGE_ROOT_REQUIRED");
  }
  function layout(raw: B) {
    const binding = bindingSchema.parse(raw);
    const header = Buffer.from(
      stageVersion + "\n" + pdfHash(canonicalCoreJson(binding)) + "\n",
    );
    return { binding, header, path: join(root, binding.resourceId) };
  }
  async function reopen(raw: B) {
    await directory();
    const { binding, header, path } = layout(raw);
    const f = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const s = await f.stat();
      if (
        !s.isFile() ||
        s.nlink < 1 ||
        s.nlink > 2 ||
        (s.mode & 0o777) !== 0o400 ||
        s.uid !== process.getuid?.() ||
        s.size !== header.length + binding.byteCount
      )
        throw new Error("STAGE_BINDING_MISMATCH");
      const buffer = Buffer.alloc(header.length + binding.byteCount + 1);
      let count = 0;
      while (count < buffer.length) {
        const read = await f.read(buffer, count, buffer.length - count, count);
        if (!read.bytesRead) break;
        count += read.bytesRead;
      }
      if (count !== header.length + binding.byteCount)
        throw new Error("STAGE_INTEGRITY_MISMATCH");
      const all = buffer.subarray(0, count);
      if (!all.subarray(0, header.length).equals(header))
        throw new Error("STAGE_BINDING_MISMATCH");
      const bytes = all.subarray(header.length);
      await verify(bytes);
      if (bytes.length !== binding.byteCount || pdfHash(bytes) !== binding.sha256)
        throw new Error("STAGE_INTEGRITY_MISMATCH");
      return bytes;
    } finally {
      await f.close();
    }
  }
  return {
    reopen,
    async seal(raw: B, stream: AsyncIterable<Uint8Array>) {
      await directory();
      const { binding, header, path } = layout(raw);
      const temporary = join(root, ".partial-" + randomUUID());
      const f = await open(
        temporary,
        constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
        0o600,
      );
      let closed = false;
      try {
        await f.writeFile(header);
        let count = 0;
        const parts: Buffer[] = [];
        for await (const chunk of stream) {
          count += chunk.byteLength;
          if (count > maxBytes || count > binding.byteCount)
            throw new Error("PDF_TOO_LARGE");
          const part = Buffer.from(chunk);
          parts.push(part);
          await f.writeFile(part);
        }
        const bytes = Buffer.concat(parts);
        if (count !== binding.byteCount || pdfHash(bytes) !== binding.sha256)
          throw new Error("PDF_INGRESS_INTEGRITY_MISMATCH");
        await verify(bytes);
        await f.chmod(0o400);
        await f.sync();
        await f.close();
        closed = true;
        await link(temporary, path).catch((e: NodeJS.ErrnoException) => {
          if (e.code !== "EEXIST") throw e;
        });
        await unlink(temporary);
        const dir = await open(root, constants.O_RDONLY);
        try {
          await dir.sync();
        } finally {
          await dir.close();
        }
        await reopen(binding);
        return {
          resourceId: binding.resourceId,
          resourceKey: binding.resourceKey,
          sha256: binding.sha256,
          byteCount: count,
          bindingSha256: pdfHash(canonicalCoreJson(binding)),
        };
      } finally {
        if (!closed) await f.close();
        await unlink(temporary).catch((e: NodeJS.ErrnoException) => {
          if (e.code !== "ENOENT") throw e;
        });
      }
    },
  };
}
export type SourcePdfPrivateStage = ReturnType<typeof createSourcePdfPrivateStage>;
