import { describe, expect, it } from "vitest";
import {
  CAPTURE_LIMITS,
  captureByteLimit,
  equalCaptureBytes,
  localCaptureSchema,
} from "./localCapture";

const capture = {
  id: "capture",
  accountId: "a",
  payloadId: "payload",
  kind: "FILE",
  originalFilename: null,
  declaredContentType: null,
  byteCount: 1,
  sha256: "a".repeat(64),
  createdAt: "2026-10-05T00:00:00.000Z",
  tripId: null,
  state: "INBOX",
  revision: 1,
};
describe("local Capture domain", () => {
  it("pins every initial hard limit", () => {
    expect(CAPTURE_LIMITS).toEqual({
      binaryBytes: 10485760,
      textBytes: 1048576,
      accountBytes: 104857600,
      accountRows: 1000,
      deviceBytes: 524288000,
    });
    expect(captureByteLimit("TEXT")).toBe(1048576);
    expect(captureByteLimit("IMAGE")).toBe(10485760);
  });
  it("defines exact byte equality including size", () => {
    expect(equalCaptureBytes(new Uint8Array([0, 255]), new Uint8Array([0, 255]))).toBe(
      true,
    );
    expect(equalCaptureBytes(new Uint8Array([0]), new Uint8Array([0, 0]))).toBe(false);
    expect(equalCaptureBytes(new Uint8Array([0, 255]), new Uint8Array([0, 254]))).toBe(
      false,
    );
  });
  it.each(["FILE", "IMAGE", "TEXT"])("accepts truthful %s Inbox", (kind) => {
    expect(localCaptureSchema.safeParse({ ...capture, kind }).success).toBe(true);
  });
  it("accepts assigned association", () => {
    expect(
      localCaptureSchema.safeParse({ ...capture, tripId: "trip", state: "ASSIGNED" })
        .success,
    ).toBe(true);
  });
  it.each(["PROCESSING", "IMPORTED", "NEEDS_ATTENTION", "unknown"])(
    "rejects %s lifecycle",
    (state) => {
      expect(localCaptureSchema.safeParse({ ...capture, state }).success).toBe(false);
    },
  );
  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, "1"])(
    "rejects revision %s",
    (revision) => {
      expect(localCaptureSchema.safeParse({ ...capture, revision }).success).toBe(false);
    },
  );
  it("rejects contradictory associations, text bounds and mutable guess fields", () => {
    for (const override of [
      { tripId: "trip" },
      { state: "ASSIGNED" },
      { kind: "TEXT", byteCount: CAPTURE_LIMITS.textBytes + 1 },
      { title: "guess" },
    ])
      expect(localCaptureSchema.safeParse({ ...capture, ...override }).success).toBe(
        false,
      );
  });
});
