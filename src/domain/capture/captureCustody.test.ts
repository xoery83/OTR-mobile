import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import {
  assertCaptureCustodyBytes,
  captureCustodyMedia,
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
    expect(() => captureCustodyMedia(bytes)).toThrow(
      "CAPTURE_CUSTODY_MEDIA_INVALID",
    );
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
