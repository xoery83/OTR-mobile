import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import {
  assertCaptureCustodyBytes,
  captureCustodyMedia,
  captureCustodyBindingJson,
  captureCustodyBindingHeader,
  type CaptureCustodyBinding,
} from "./captureCustody";

const jpeg = Uint8Array.of(255, 216, 255, 224, 0, 2, 255, 217);
const withTrailer = Uint8Array.from([...jpeg, ...new Uint8Array(24).fill(42)]);
const binding = (bytes: Uint8Array): CaptureCustodyBinding => ({
  version: 1,
  accountId: "3a44420f-ec2b-4d7e-9770-410a5ed5e77e",
  batchId: "e046f37a-61ac-444a-b05b-0a991d59e006",
  jobId: "d9fc69ea-9fe1-4c62-8c65-359ac737a9d7",
  inputId: "06bf88b6-633d-463e-af0a-21fa6efb3773",
  inputRevision: 3,
  captureId: "9b9fd5d0-b4d0-4306-8258-fafdac12d1fe",
  payloadId: "ece7f81d-7067-4090-ab3b-86f68a2eb4eb",
  captureRevision: 1,
  sha256: createHash("sha256").update(bytes).digest("hex"),
  byteCount: bytes.length,
  mediaType: "image/jpeg",
});

it("accepts JPEG container EOI with an opaque trailer without changing bytes", () => {
  expect(captureCustodyMedia(jpeg)).toBe("image/jpeg");
  expect(captureCustodyMedia(withTrailer)).toBe("image/jpeg");
  expect(() =>
    assertCaptureCustodyBytes(binding(withTrailer), withTrailer),
  ).not.toThrow();
});

it("rejects absent SOI, absent EOI, and a truncated EOI marker", () => {
  for (const bytes of [jpeg.slice(1), jpeg.slice(0, -2), jpeg.slice(0, -1)])
    expect(() => captureCustodyMedia(bytes)).toThrow("CAPTURE_CUSTODY_MEDIA_INVALID");
});

it("pins the complete trailer in both SHA and byte count", () => {
  const pinned = binding(withTrailer);
  const changed = withTrailer.slice();
  changed[changed.length - 1] ^= 1;
  expect(() => assertCaptureCustodyBytes(pinned, changed)).toThrow(
    "CAPTURE_CUSTODY_BYTES_INVALID",
  );
  expect(() => assertCaptureCustodyBytes(pinned, jpeg)).toThrow(
    "CAPTURE_CUSTODY_BYTES_INVALID",
  );
});

it("Universal v2 requires explicit typed provenance, strict UTF-8 and bounded N; v1 remains binary/exact2", async () => {
  const {
    captureCustodyBindingSchema,
    captureCustodyBatchSchema,
    captureUniversalCustodyBindingSchema,
    captureUniversalCustodyBatchSchema,
  } = await import("./captureCustody");
  const bytes = new TextEncoder().encode("\ufeff周一：博物馆\nKeep original wording."),
    text = {
      ...binding(bytes),
      version: 2 as const,
      originalFilename: null,
      acquisitionSource: "magic_input" as const,
      kind: "TEXT" as const,
      mediaType: "text/plain" as const,
    };
  expect(() => assertCaptureCustodyBytes(text, bytes)).not.toThrow();
  expect(captureCustodyBindingSchema.safeParse(text).success).toBe(false);
  expect(
    captureCustodyBatchSchema.safeParse({
      batchId: text.batchId,
      jobId: text.jobId,
      inputs: [binding(jpeg)],
    }).success,
  ).toBe(false);
  expect(
    captureUniversalCustodyBindingSchema.safeParse({
      ...text,
      acquisitionSource: "files",
    }).success,
  ).toBe(false);
  expect(
    captureUniversalCustodyBindingSchema.safeParse({ ...text, byteCount: 262145 })
      .success,
  ).toBe(false);
  const batch = {
    version: 2 as const,
    batchId: text.batchId,
    jobId: text.jobId,
    inputs: [text],
  };
  expect(captureUniversalCustodyBatchSchema.safeParse(batch).success).toBe(true);
  expect(
    captureUniversalCustodyBatchSchema.safeParse({ ...batch, inputs: [text, text] })
      .success,
  ).toBe(false);
  expect(
    captureUniversalCustodyBatchSchema.safeParse({ ...batch, inputs: [] }).success,
  ).toBe(false);
  expect(
    captureUniversalCustodyBatchSchema.safeParse({
      ...batch,
      inputs: Array(65).fill(text),
    }).success,
  ).toBe(false);
  for (const invalid of [Uint8Array.of(255), new TextEncoder().encode("bad\0text")]) {
    expect(() =>
      assertCaptureCustodyBytes(
        {
          ...text,
          sha256: createHash("sha256").update(invalid).digest("hex"),
          byteCount: invalid.length,
        },
        invalid,
      ),
    ).toThrow("BYTES_INVALID");
  }
});

it("v2 header escapes Chinese/emoji as ASCII without changing identity JSON or v1 wire bytes", () => {
  const v1 = binding(jpeg);
  expect(captureCustodyBindingHeader(v1)).toBe(captureCustodyBindingJson(v1));
  for (const originalFilename of [
    "行程.txt",
    "行程✈️🧳.txt",
    "行".repeat(251) + ".txt",
  ]) {
    const b = {
      ...v1,
      version: 2 as const,
      kind: "FILE" as const,
      acquisitionSource: "files" as const,
      originalFilename,
    };
    const identity = captureCustodyBindingJson(b),
      wire = captureCustodyBindingHeader(b);
    expect(identity).toContain(originalFilename);
    expect(wire).toMatch(/^[\x20-\x7e]+$/);
    const headers = new Headers({ "X-OTR-Capture-Binding": wire });
    const response = new Response(null, { headers });
    expect(JSON.parse(response.headers.get("X-OTR-Capture-Binding")!)).toEqual(
      JSON.parse(identity),
    );
    expect(() => new Headers({ "X-OTR-Capture-Binding": identity })).toThrow();
  }
});
