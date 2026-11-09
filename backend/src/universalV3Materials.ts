import { createHash } from "node:crypto";
import { z } from "zod";
import {
  allowedPaths,
  subtypes,
} from "../frozen-workbench/scripts/import-workbench/llm-first";
import {
  universalV3Families,
  type UniversalV3Manifest,
} from "../../src/data/api/universalV3Contracts";
import { verifySourcePdfV2LinuxBytes } from "./sourcePdfV2LinuxVerifier";
import type { UniversalProvider } from "./universalImport";

const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

export const universalV3OutputSchema = z.strictObject({
  items: z
    .array(
      z.strictObject({
        kind: z.enum(universalV3Families),
        subtype: z.string().max(64),
        fields: z.record(
          z.string(),
          z.union([z.string().min(1).max(8192), z.number().finite(), z.boolean()]),
        ),
        inputs: z.array(z.number().int().nonnegative()).min(1).max(5),
      }),
    )
    .max(32),
});

export function projectUniversalV3Candidates(
  output: unknown,
  manifest: UniversalV3Manifest,
) {
  return universalV3OutputSchema
    .parse(output)
    .items.flatMap(({ kind, subtype, fields, inputs }) => {
      if (
        (manifest.family && kind !== manifest.family) ||
        !subtypes[kind].includes(subtype) ||
        Object.keys(fields).some((key) => !allowedPaths[kind].has(key)) ||
        inputs.some((index) => index >= manifest.files.length)
      )
        return [];
      return [
        {
          kind,
          subtype,
          fields,
          documentIds: [...new Set(inputs)].map(
            (index) => manifest.files[index].documentId,
          ),
        },
      ];
    });
}

export async function prepareUniversalV3Materials(
  manifest: UniversalV3Manifest,
  readFile: (entry: UniversalV3Manifest["files"][number]) => Promise<Buffer>,
  // Image decoding belongs in an existing isolated processing port, never in the HTTP process.
  normalizeStaticImage: (
    mediaType: string,
    bytes: Buffer,
  ) => Promise<{
    mediaType: "image/jpeg" | "image/png";
    bytes: Buffer;
  }>,
  extractPdf: typeof verifySourcePdfV2LinuxBytes = verifySourcePdfV2LinuxBytes,
): Promise<Parameters<UniversalProvider["interpret"]>[0]["sources"]> {
  const sources: Parameters<UniversalProvider["interpret"]>[0]["sources"] = [];
  for (const [index, entry] of manifest.files.entries()) {
    const original = await readFile(entry);
    if (original.length !== entry.length || sha(original) !== entry.sha256)
      throw Error("UNIVERSAL_V3_FILE_MISMATCH");
    const image = entry.mediaType.startsWith("image/");
    let bytes = original,
      mime = "text/plain";
    if (image) {
      ({ bytes, mediaType: mime } = await normalizeStaticImage(
        entry.mediaType,
        original,
      ));
    } else if (entry.mediaType === "application/pdf") {
      if (original.subarray(0, 5).toString() !== "%PDF-")
        throw Error("UNIVERSAL_V3_FILE_TYPE");
      bytes = Buffer.from((await extractPdf(original)).text, "utf8");
    } else {
      const encoding =
        original[0] === 0xff && original[1] === 0xfe
          ? "utf-16le"
          : original[0] === 0xfe && original[1] === 0xff
            ? "utf-16be"
            : "utf-8";
      const text = new TextDecoder(encoding, { fatal: true }).decode(original);
      if (!text.trim() || text.includes("\0")) throw Error("UNIVERSAL_V3_FILE_TYPE");
      bytes = Buffer.from(text, "utf8");
    }
    sources.push({
      index,
      sourceId: `S${index}`,
      mime,
      modality: image ? "IMAGE" : "TEXT",
      sha256: sha(bytes),
      bytes,
    });
  }
  return sources;
}
