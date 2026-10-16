import { createHash, randomUUID } from "node:crypto";
import { chmod, mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import {
  derivePdfV2Local,
  createSourcePdfV2LocalVerifier,
  PDF_V2_LOCAL_PROFILE,
  PDF_V2_LOCAL_PROFILE_SHA,
} from "./sourcePdfV2Local";
import { verifySourcePdf, encodeProfilePdf } from "./sourcePdfProfile";
import { sourcePdfSealSchema } from "../../src/domain/trip/sourcePdfAuthority";
import { localPdfKitDecoder } from "../../scripts/source-pdf-v2/pdfKitLocal";
const digest = (v: string | Uint8Array) => createHash("sha256").update(v).digest("hex");
// Synthetic decoder protocol fixtures test the boundary, never real parser/Source PASS.
const bytes = new TextEncoder().encode("%PDF-synthetic protocol input");
const pin = { sha256: digest(bytes), byteCount: bytes.length };
function extraction(text = "AKL → NSN") {
  return {
    engine: "apple-pdfkit",
    version: 1,
    originalSha256: pin.sha256,
    originalByteCount: bytes.length,
    text,
    pages: [{ pageIndex: 0, start: 0, end: Buffer.byteLength(text) }],
  };
}
it("validates exact Unicode text/page hashes without granting Source authority", async () => {
  const result = await derivePdfV2Local(bytes, pin, async () => extraction());
  expect(result).toMatchObject({
    profileId: "OTR_PDF_SELECTABLE_TEXT_V2",
    profileSha256: PDF_V2_LOCAL_PROFILE_SHA,
    textSha256: digest("AKL → NSN"),
    textByteCount: 11,
    grantsSourceAuthority: false,
    runtimeStatus: "BLOCKED_TRUSTED_DECODER",
  });
  expect(sourcePdfSealSchema.safeParse(result).success).toBe(false);
});
it("supports exact multi-page UTF-8 mapping with LF separators", async () => {
  const raw = extraction("甲\nβ");
  raw.pages = [
    { pageIndex: 0, start: 0, end: 3 },
    { pageIndex: 1, start: 4, end: 6 },
  ];
  expect((await derivePdfV2Local(bytes, pin, async () => raw)).pages).toEqual(raw.pages);
});
it.each([
  ["wrong hash", { ...pin, sha256: "a".repeat(64) }],
  ["wrong count", { ...pin, byteCount: pin.byteCount + 1 }],
  ["oversize", { ...pin, byteCount: PDF_V2_LOCAL_PROFILE.maxOriginalBytes + 1 }],
])("rejects %s before invoking any decoder", async (_label, invalid) => {
  const decode = vi.fn();
  await expect(derivePdfV2Local(bytes, invalid, decode)).rejects.toThrow(
    "PDF_V2_ORIGINAL_MISMATCH",
  );
  expect(decode).not.toHaveBeenCalled();
});
it("rejects JPEG instead of treating it as Original TEXT/PDF", async () => {
  const jpeg = new Uint8Array([255, 216, 255, 217, 0]);
  await expect(
    derivePdfV2Local(jpeg, { sha256: digest(jpeg), byteCount: jpeg.length }, vi.fn()),
  ).rejects.toThrow("PDF_V2_FORMAT_UNSUPPORTED");
});
it.each([
  { ...extraction(), originalSha256: "a".repeat(64) },
  { ...extraction(), pages: [{ pageIndex: 0, start: 0, end: 7 }] },
  { ...extraction(), pages: [{ pageIndex: 1, start: 0, end: 11 }] },
  { ...extraction(), text: "" },
  { ...extraction(), text: "a".repeat(262145) },
  { ...extraction(), text: "\ud800", pages: [{ pageIndex: 0, start: 0, end: 3 }] },
  { ...extraction(), text: "\0" },
  { ...extraction(), pages: Array(33).fill(extraction().pages[0]) },
  { error: "ENCRYPTED_PDF" },
])(
  "rejects inconsistent/unsupported decoder output without raw data leaks",
  async (raw) => {
    await expect(derivePdfV2Local(bytes, pin, async () => raw)).rejects.toThrow(
      "PDF_V2_DERIVATION_INVALID",
    );
  },
);
it("contains raw decoder exceptions and does not expose supplied secrets/text", async () => {
  await expect(
    derivePdfV2Local(bytes, pin, async () => {
      throw new Error("private-value");
    }),
  ).rejects.toThrow(/^PDF_V2_DECODE_FAILED$/);
});
it("hands the decoder an independent copy", async () => {
  const copy = new Uint8Array(bytes);
  await derivePdfV2Local(copy, pin, async (owned) => {
    owned.fill(0);
    return extraction();
  });
  expect(copy).toEqual(bytes);
});
it("rereads existing owning Source scope, rejecting changed custody after decode", async () => {
  const scope = {
    ...pin,
    accountId: randomUUID(),
    tripId: randomUUID(),
    sourceId: randomUUID(),
    representationId: randomUUID(),
  };
  const reader = vi
    .fn()
    .mockResolvedValueOnce(bytes)
    .mockResolvedValueOnce(new Uint8Array(bytes.length));
  await expect(
    createSourcePdfV2LocalVerifier(reader, async () => extraction())(scope),
  ).rejects.toThrow("PDF_V2_ORIGINAL_MISMATCH");
  expect(reader).toHaveBeenCalledTimes(2);
  expect(reader).toHaveBeenLastCalledWith(scope);
});
it("rejects invalid scope/oversized requested read before custody IO", async () => {
  const reader = vi.fn();
  await expect(
    createSourcePdfV2LocalVerifier(
      reader,
      vi.fn(),
    )({
      ...pin,
      byteCount: 10485761,
      accountId: randomUUID(),
      tripId: randomUUID(),
      sourceId: randomUUID(),
      representationId: randomUUID(),
    }),
  ).rejects.toThrow("PDF_V2_SCOPE_INVALID");
  expect(reader).not.toHaveBeenCalled();
});
it("does not broaden or change the old finite profile", () => {
  const canonical = encodeProfilePdf(["NZ1"]);
  expect(verifySourcePdf(canonical).text).toBe("NZ1");
  expect(() => verifySourcePdf(bytes)).toThrow("PDF_PROFILE_UNSUPPORTED");
  expect(() => verifySourcePdf(new Uint8Array(65537))).toThrow("PDF_PROFILE_UNSUPPORTED");
});
it.each([
  ["console.log(JSON.stringify({ok:true}))", { ok: true }],
  ["console.log('{}'); console.log('{}')", null],
  ["console.log('invalid')", null],
  ["process.exit(1)", null],
  ["process.stdout.write('x'.repeat(1048577))", null],
])(
  "local subprocess only accepts one bounded JSON response after exit",
  async (body, expected) => {
    const root = await mkdtemp(join(tmpdir(), "pdf-v2-test-"));
    try {
      const binary = join(root, "decoder");
      await writeFile(binary, `#!${process.execPath}\n${body}\n`, { mode: 0o700 });
      await chmod(binary, 0o700);
      const promise = localPdfKitDecoder(binary)(bytes);
      if (expected) expect(await promise).toEqual(expected);
      else await expect(promise).rejects.toThrow(/^PDF_V2_COMPONENT_/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
);

it("preserves exact owning reader scope on success without emitting registration/seal", async () => {
  const scope = {
    ...pin,
    accountId: randomUUID(),
    tripId: randomUUID(),
    sourceId: randomUUID(),
    representationId: randomUUID(),
  };
  const reader = vi.fn().mockResolvedValue(bytes);
  const result = await createSourcePdfV2LocalVerifier(reader, async () => extraction())(
    scope,
  );
  expect(reader).toHaveBeenCalledTimes(2);
  expect(
    reader.mock.calls.every(([arg]) => JSON.stringify(arg) === JSON.stringify(scope)),
  ).toBe(true);
  expect(result.grantsSourceAuthority).toBe(false);
  expect(result).not.toHaveProperty("registrationSha256");
  expect(result).not.toHaveProperty("sealSha256");
});
it("contains raw owning custody read failures", async () => {
  const scope = {
    ...pin,
    accountId: randomUUID(),
    tripId: randomUUID(),
    sourceId: randomUUID(),
    representationId: randomUUID(),
  };
  await expect(
    createSourcePdfV2LocalVerifier(async () => {
      throw new Error("private-path");
    }, vi.fn())(scope),
  ).rejects.toThrow(/^PDF_V2_CUSTODY_UNAVAILABLE$/);
});
